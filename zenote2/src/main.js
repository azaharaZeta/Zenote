// CLIENTE DE RENDER (UI P1). El MOTOR corre en un Web Worker (engine/worker.js); aquí solo se dibuja desde las "fotos"
// y se maneja la CÁMARA (zoom + paneo TOROIDAL infinito) + los controles del panel. La cámara no toca la sim (fluida).

import { TISSUE } from './engine/genome.js';
import { RENDER_P, START, SIM_P, GENOME_P } from './config.js';   // fuente única de parámetros (render/arranque/lab)

const worker = new Worker(new URL('./engine/worker.js', import.meta.url), { type: 'module' });
let WORLD = null, frame = null;
worker.onmessage = (e) => { const m = e.data; if (m.type === 'world') { WORLD = m; resetCamera(); bakeLight(); } else if (m.type === 'frame') frame = m; };

const canvas = document.getElementById('world'), ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
let cw = 0, ch = 0, vignette = null; const dpr = Math.min(RENDER_P.dprCap, window.devicePixelRatio || 1);
// A4 — BLOOM (bioluminiscencia): la capa de ORGANISMOS se dibuja en un búfer aparte (glowCv); su versión reducida
// (bloomCv, 1/BLOOM_DIV) se reescala aditivamente sobre el fondo → luz suave que sangra (coste ≈ 1/DIV², móvil ok).
// bloomStrength=0 lo apaga (Baja/móvil). Es render PURO. Downsampled como en v1 (VISUAL.md).
const glowCv = document.createElement('canvas'), glowCtx = glowCv.getContext('2d');
const bloomCv = document.createElement('canvas'), bloomCtx = bloomCv.getContext('2d');
let bloomStrength = RENDER_P.bloom; const BLOOM_DIV = RENDER_P.bloomDiv;
// FONDO DEL ABISMO: el campo de luz (estático) se hornea a una mini-textura (1 px/celda) y se reescala SUAVIZADA →
// nebulosa fosforescente teal/algas tenue (en vez de la rejilla de cuadrados). Se rehornea solo al (re)iniciar el mundo.
const lightCv = document.createElement('canvas');
function bakeLight() {
  if (!WORLD) return;
  const cols = WORLD.cols, rows = WORLD.rows, L0 = WORLD.light0, lb = WORLD.lightBase || 1;
  lightCv.width = cols; lightCv.height = rows;
  const lc = lightCv.getContext('2d'), img = lc.createImageData(cols, rows), d = img.data;
  for (let i = 0; i < cols * rows; i++) {
    const L = Math.max(0, Math.min(1.2, L0[i] / lb)), o = i * 4;   // intensidad de luz → fosforescencia teal sobre abismo
    d[o] = 7 + L * 9; d[o + 1] = 11 + L * 34; d[o + 2] = 17 + L * 30; d[o + 3] = 255;
  }
  lc.putImageData(img, 0, 0);
}
function resize() {
  cw = canvas.clientWidth; ch = canvas.clientHeight; canvas.width = cw * dpr; canvas.height = ch * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  glowCv.width = canvas.width; glowCv.height = canvas.height; glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bloomCv.width = Math.max(1, (canvas.width / BLOOM_DIV) | 0); bloomCv.height = Math.max(1, (canvas.height / BLOOM_DIV) | 0);
  const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
  g.addColorStop(0, 'rgba(5,8,13,0)'); g.addColorStop(1, 'rgba(2,4,8,0.7)'); vignette = g;
}
window.addEventListener('resize', resize); resize();

// --- Cámara + selección ---
let zoom = RENDER_P.zoom, camX = 0, camY = 0; const MINZ = RENDER_P.zoomMin, MAXZ = RENDER_P.zoomMax;   // mínimo 1.0 = el mundo entero cabe
let selectedId = -1, following = false;   // inspector: serial del agente seleccionado + seguimiento de cámara
function resetCamera() { if (WORLD) { camX = WORLD.size / 2; camY = WORLD.size / 2; } }
const fitScale = () => WORLD ? Math.min(cw, ch) / WORLD.size : 1;
const scaleOf = () => fitScale() * zoom;
function wrap(v) { const S = WORLD.size; return ((v % S) + S) % S; }

const TCOL = [ '#5a6b7a', '#3fb98f', '#e0664d', '#e0a84a' ];   // STRUCTURE, PHOTO, MUSCLE, MOUTH (índice = tissue)
const RCOL = [ '#3fb98f', '#e0664d', '#e0a84a' ];              // rol: 0 autótrofo · 1 heterótrofo · 2 mixótrofo
const ROLE_TXT = [ 'autótrofo', 'heterótrofo', 'mixótrofo' ];
let colorMode = RENDER_P.colorMode;

function draw() {
  const t = performance.now() / 1000;
  ctx.fillStyle = '#05080d'; ctx.fillRect(0, 0, cw, ch);
  if (!WORLD || !frame) return;
  const size = WORLD.size, sc = scaleOf();
  const vwHalf = cw / 2 / sc, vhHalf = ch / 2 / sc;
  const txMin = Math.floor((camX - vwHalf) / size), txMax = Math.floor((camX + vwHalf) / size);
  const tyMin = Math.floor((camY - vhHalf) / size), tyMax = Math.floor((camY + vhHalf) / size);

  // sustrato (campo de luz) por tile
  for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) drawLight((tx * size - camX) * sc + cw / 2, (ty * size - camY) * sc + ch / 2, sc);
  // BORDE DEL TORO: las líneas del límite del mundo (x=k·size, y=k·size) repetidas en el mosaico. Clara pero suave y
  // DIFUSA (3 pasadas aditivas: ancha+tenue → fina+clara). Cada línea se traza UNA vez (full-canvas) → uniforme.
  ctx.globalCompositeOperation = 'lighter';
  for (const pass of [[9, 0.018], [4, 0.038], [1.4, 0.12]]) {
    ctx.lineWidth = pass[0]; ctx.strokeStyle = `rgba(150,182,208,${pass[1]})`;
    ctx.beginPath();
    for (let tx = txMin; tx <= txMax + 1; tx++) { const x = (tx * size - camX) * sc + cw / 2; ctx.moveTo(x, 0); ctx.lineTo(x, ch); }
    for (let ty = tyMin; ty <= tyMax + 1; ty++) { const y = (ty * size - camY) * sc + ch / 2; ctx.moveTo(0, y); ctx.lineTo(cw, y); }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  // ORGANISMOS → búfer aparte (glowCv). El GLOW lo da el BLOOM (desenfoque de los núcleos) → el slider de
  // bioluminiscencia es el único control del brillo y se nota. Halo aditivo explícito SOLO en 'tissueaura' (aura de
  // linaje sobre núcleo de tejido, que el bloom luego suaviza).
  glowCtx.clearRect(0, 0, cw, ch);
  // AURA = BIOLUMINISCENCIA: halo de color real en TODOS los modos (en Natural = auto-glow; en falso-color = canal del
  // color real). El bloom la suaviza. Gateada por el slider (0 = sin glow, móvil/Baja).
  if (bloomStrength > 0) {
    glowCtx.globalCompositeOperation = 'lighter';
    for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) drawOrgs(glowCtx, (tx * size - camX) * sc + cw / 2, (ty * size - camY) * sc + ch / 2, sc, t, true);
  }
  glowCtx.globalCompositeOperation = 'source-over'; glowCtx.globalAlpha = 1;
  for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) drawOrgs(glowCtx, (tx * size - camX) * sc + cw / 2, (ty * size - camY) * sc + ch / 2, sc, t, false);

  // A4 — BLOOM: reduce glowCv a la miniatura y reescálala ADITIVA sobre el fondo (luz suave que sangra). 0 = apagado.
  if (bloomStrength > 0) {
    bloomCtx.clearRect(0, 0, bloomCv.width, bloomCv.height);
    bloomCtx.drawImage(glowCv, 0, 0, bloomCv.width, bloomCv.height);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = bloomStrength; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bloomCv, 0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  // organismos NÍTIDOS encima
  ctx.imageSmoothingEnabled = false; ctx.drawImage(glowCv, 0, 0, cw, ch); ctx.imageSmoothingEnabled = true;

  // anillo de selección sobre el agente inspeccionado (en cada tile visible donde caiga)
  if (selectedId >= 0 && frame.detail && frame.detail.id === selectedId) {
    const d = frame.detail, rr = Math.max(7, d.rad * sc) + 4 + Math.sin(t * 3) * 2;
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,246,255,.9)';
    for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) {
      const px = (tx * size - camX) * sc + cw / 2 + d.x * sc, py = (ty * size - camY) * sc + ch / 2 + d.y * sc;
      if (px < -rr || px > cw + rr || py < -rr || py > ch + rr) continue;
      ctx.beginPath(); ctx.arc(px, py, rr, 0, 6.283); ctx.stroke();
    }
  }

  if (vignette) { ctx.fillStyle = vignette; ctx.fillRect(0, 0, cw, ch); }
  updateHud();
  updateInspector();
}

function drawLight(oX, oY, sc) {
  // un tile del mundo = la mini-textura de luz reescalada SUAVIZADA (bilinear) → nebulosa fosforescente sin rejilla.
  const wpx = WORLD.size * sc;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lightCv, oX, oY, wpx, wpx);
}

function drawOrgs(c, oX, oY, sc, t, halo) {
  const { n, ax, ay, ah, aspd, ahue, aE, aHunt, arole, partOff, partData } = frame;
  const mul = halo ? RENDER_P.auraMul : 1, baseA = halo ? RENDER_P.auraAlpha * bloomStrength : 1;   // AURA (=bioluminiscencia): escalada por el slider
  if (!halo) { c.strokeStyle = RENDER_P.border; c.lineWidth = RENDER_P.borderW; }   // BORDE: trazo oscuro abisal fino; reaprovecha el path del relleno
  for (let a = 0; a < n; a++) {
    const wx = ax[a], wy = ay[a], bx = oX + wx * sc, by = oY + wy * sc;
    if (bx < -40 || bx > cw + 40 || by < -40 || by > ch + 40) continue;   // culling en pantalla
    const h = ah[a], chh = Math.cos(h), shh = Math.sin(h), spd = aspd[a], p0 = partOff[a], p1 = partOff[a + 1];
    // A2 — VITALIDAD: los hambrientos se atenúan (la muerte se ve venir). energía 0..1 → alpha 0.35..1.
    c.globalAlpha = baseA * (aE ? 0.35 + 0.65 * aE[a] : 1);
    // A2 — COLOR EN CAPAS. NATURAL (defecto, lo más cercano a "cómo se ven"): NÚCLEO por tejido (anatomía) + HALO por
    // LINAJE (color heredado real = aura de familia) + brillo por energía + forma por silueta. TEJIDO/OFICIO/LINAJE =
    // modos analíticos PUROS (una sola señal). (hsl solo se construye cuando se usa → sin alocar de más.)
    // MODOS: 'natural' = ASPECTO REAL (todo el cuerpo = pigmento heredado/linaje, sin colorear por función) con auto-glow
    // del mismo color; 'tissueaura' = núcleo por tejido (anatomía) + aura de linaje; 'tissue'/'role'/'lineage' = analíticos.
    const natural = colorMode === 'natural', natMix = colorMode === 'natmix';
    const hcol = (s, l) => `hsl(${(ahue[a] * 360) | 0},${s}%,${l}%)`;
    // AURA (pasada halo) = SIEMPRE el color REAL (linaje): en Natural/natmix es auto-glow; en Tejido/Oficio es el canal
    // del color real sobre el núcleo de función. NÚCLEO (pasada !halo) = según el modo.
    const agentCol = halo ? hcol(60, 60)
      : colorMode === 'role' ? (RCOL[arole[a]] || '#3fb98f')
      : colorMode === 'lineage' ? hcol(58, 58)
      : (natural || natMix) ? hcol(62, 54)               // cuerpo = pigmento real (natmix le superpone un % de tejido)
      : null;                                            // 'tissue' → TCOL por nodo
    // A3 — TEXTURA procedural (Natural y Tejido+aura; solo núcleo): motas bioluminiscentes cuyo nº y color de acento
    // DERIVAN de `hue` (heredado) → parientes comparten patrón (revela linaje, honesto). LOD: solo nodos grandes (coste 0 de lejos).
    let accent = null, patN = 0, pSeed = 0;
    if ((natural || natMix) && !halo) { const hh = ahue[a]; accent = `hsl(${((hh * 360 + 150) | 0) % 360},72%,74%)`; patN = 1 + ((hh * 9973) | 0) % RENDER_P.speckleMax; pSeed = hh * 6.283; }
    let bodyR = 0, frontExt = 0;   // OJOS: extensión total + alcance FRONTAL (proyección sobre el rumbo) → ojos sobre la parte delantera
    for (let k = p1 - 1; k >= p0; k--) {
      const o = k * 7, lx = partData[o], ly = partData[o + 1], r = partData[o + 2], tissue = partData[o + 3], ph = partData[o + 4], aspect = partData[o + 5], dir = partData[o + 6];
      const uy = ly + (0.35 + spd * RENDER_P.undulation) * Math.sin(t * 5 + lx * 0.16 + ph);
      const px = oX + (wx + (lx * chh - uy * shh)) * sc, py = oY + (wy + (lx * shh + uy * chh)) * sc, pr = Math.max(1, r * sc * mul);
      if (!halo) { const dx = px - bx, dy = py - by, ext = Math.hypot(dx, dy) + pr; if (ext > bodyR) bodyR = ext;
        const fp = dx * chh + dy * shh + pr; if (fp > frontExt) frontExt = fp; }   // alcance del cuerpo + cuán adelante llega (eje rumbo)
      c.fillStyle = agentCol || TCOL[tissue] || '#5a6b7a';
      // A1 — SILUETA: elipse orientada (eje = rumbo + dirección de emisión del nodo), elongada por `aspect` → aletas/
      // tentáculos/cuerpos fusiformes en vez de bolitas. LOD: si es diminuta, punto barato.
      const rL = pr * (1 + aspect * 1.4);
      c.beginPath();
      if (rL > 1.6) c.ellipse(px, py, rL, pr, h + dir, 0, 6.283); else c.arc(px, py, pr, 0, 6.283);
      c.fill();
      if (natMix && !halo) { const ga = c.globalAlpha; c.globalAlpha = ga * 0.32; c.fillStyle = TCOL[tissue] || '#5a6b7a'; c.fill(); c.globalAlpha = ga; }   // Natural+tejido: tinte SUTIL de la función sobre el pigmento
      if (!halo && pr > 3.5) c.stroke();   // BORDE: trazo del path ya construido (LOD: solo nodos visibles; coste medido ~2 ms)
      if (accent && pr > 3.5) {   // motas (LOD: solo nodos grandes en pantalla)
        c.fillStyle = accent;
        for (let s = 0; s < patN; s++) { const ang = h + dir + pSeed + ph + s * 2.39, dd = pr * 0.38;
          c.beginPath(); c.arc(px + Math.cos(ang) * dd, py + Math.sin(ang) * dd, Math.max(0.8, pr * 0.2), 0, 6.283); c.fill(); }
      }
    }
    // OJOS (solo render, lectura del rol depredador; no toca la sim). Aparecen GRADUALMENTE (sin pop): rampa por el tamaño
    // en pantalla (LOD suave) y por lo CAZADOR. Pequeños, con variedad por linaje. La pupila MIRA hacia el rumbo del
    // organismo (= hacia la presa/pareja/luz que persigue, ya que el cerebro lo orienta hacia su objetivo).
    if (!halo && aHunt && aHunt[a] > RENDER_P.eyeThresh - 0.08) {   // empieza tenue algo antes del umbral nominal
      const hunt = aHunt[a];
      const sizeRamp = (bodyR - 4) / 14;                          // 0 (≤4px) → 1 (≥18px): fundido al acercar
      const huntRamp = (hunt - 0.12) / 0.55;                      // tenue al empezar, pleno en cazadores claros
      const amt = Math.min(1, Math.max(0, sizeRamp)) * Math.min(1, Math.max(0, huntRamp));
      if (amt > 0.015) {
        const v = (ahue[a] * 41.7) % 1;                           // variedad determinista por linaje
        const er = bodyR * (0.05 + 0.045 * hunt) * (0.8 + 0.5 * v) * amt;   // más pequeños + variados + crecen con `amt`
        const fwd = frontExt * (0.5 + 0.12 * v), sep = er * (1.9 + 0.8 * v);   // fwd = alcance FRONTAL real (no bodyR) → sobre el cuerpo; separación ∝ tamaño del ojo (nunca "flotando")
        const fx = bx + chh * fwd, fy = by + shh * fwd;
        const e1x = fx - shh * sep, e1y = fy + chh * sep, e2x = fx + shh * sep, e2y = fy - chh * sep;
        const ga0 = c.globalAlpha; c.globalAlpha = ga0 * Math.min(1, amt * 1.6);   // fundido de opacidad (refuerza la aparición suave)
        // esclera = TONO del color del organismo (más viva cuanto más cazador). CADA ojo en su PROPIO path → el stroke NO
        // une los dos círculos con una línea (si no, salen "gafas" 🤓).
        c.fillStyle = `hsl(${(ahue[a] * 360) | 0},${(62 + 22 * hunt) | 0}%,${(80 - 12 * hunt) | 0}%)`;
        c.lineWidth = Math.max(0.5, er * 0.28);   // borde del ojo (fino, ∝ tamaño)
        c.beginPath(); c.arc(e1x, e1y, er, 0, 6.283); c.fill(); c.stroke();
        c.beginPath(); c.arc(e2x, e2y, er, 0, 6.283); c.fill(); c.stroke();
        c.lineWidth = RENDER_P.borderW;   // restaura para el borde del cuerpo
        const pf = er * (0.3 + 0.55 * hunt);                      // pupila desplazada hacia el RUMBO → "mira hacia donde va"
        c.fillStyle = 'rgba(8,6,10,0.94)';
        c.beginPath(); c.arc(e1x + chh * pf, e1y + shh * pf, er * 0.52, 0, 6.283); c.fill();
        c.beginPath(); c.arc(e2x + chh * pf, e2y + shh * pf, er * 0.52, 0, 6.283); c.fill();
        c.globalAlpha = ga0;
      }
    }
  }
  c.globalAlpha = baseA;
}

// --- HUD (fps render · t/s sim · pop · tick) + gráfica de población ---
let lastT = performance.now(), lastTick = 0, frames = 0, fps = 0, tpsReal = 0;
const pc = document.getElementById('popChart'), pctx = pc.getContext('2d');
const bc = document.getElementById('birthChart'), bctx = bc && bc.getContext('2d');   // nacimientos por vía reproductiva
const dc = document.getElementById('deathChart'), dctx = dc && dc.getContext('2d');   // muertes por causa
function updateHud() {
  frames++; const now = performance.now(), dt = now - lastT;
  if (dt > 500 && frame) { fps = Math.round(frames * 1000 / dt); tpsReal = Math.round((frame.tick - lastTick) * 1000 / dt); frames = 0; lastT = now; lastTick = frame.tick; drawChart(); }
  hud.textContent = `pob ${frame.pop} · tick ${frame.tick} · ${tpsReal} t/s · ${fps} fps`;
}

// Inspector: rellena la tarjeta con el detalle EN VIVO del agente seleccionado (energía, fisiología, morfología).
function updateInspector() {
  const card = $('inspector');
  if (selectedId < 0) { card.hidden = true; return; }
  card.hidden = false;
  if (frame.sel !== selectedId) { worker.postMessage({ type: 'inspect', id: selectedId }); $('inspRole').textContent = '…'; return; }   // reenvía hasta que el worker confirme (autosana mensajes perdidos en el arranque); evita parpadeo "murió"
  const d = frame.detail;
  if (!d || d.id !== selectedId) {   // el worker lo buscó y no estaba vivo → murió
    $('inspRole').textContent = '† murió'; $('inspRole').style.color = '#8a93a0';
    $('inspE').style.width = '0%'; $('inspEtxt').textContent = 'el organismo ha muerto';
    following = false; $('inspFollow').classList.remove('on'); return;
  }
  $('inspRole').textContent = ROLE_TXT[d.role]; $('inspRole').style.color = RCOL[d.role] || '#c3cdda';
  $('inspE').style.width = (Math.max(0, Math.min(1, d.E / d.reproE)) * 100).toFixed(0) + '%';
  $('inspEtxt').textContent = `energía ${d.E.toFixed(1)} / cría ${d.reproE}` + (d.gut > 0.05 ? ` · tripa ${d.gut.toFixed(1)}` : '');
  $('inspMass').textContent = d.mass.toFixed(2);
  $('inspParts').textContent = d.nParts;
  $('inspV').textContent = d.vmax.toFixed(2);
  $('inspAge').textContent = d.age | 0;
  $('inspTroph').textContent = `${d.photoCap.toFixed(1)} / ${d.mouthCap.toFixed(2)}`;
  if (following) { camX = wrap(d.x); camY = wrap(d.y); }   // seguir: la cámara se centra en el agente
}
// Gráfica de ÁREA APILADA de dos series (lower abajo, upper encima). Escala al máximo de la suma → muestra composición.
function drawStack(cv, c, lower, upper, colLow, colUp) {
  const w = cv.width, h = cv.height; c.clearRect(0, 0, w, h);
  if (!lower || lower.length < 2) return;
  const n = lower.length; let mx = 1; for (let i = 0; i < n; i++) { const t = lower[i] + upper[i]; if (t > mx) mx = t; }
  const X = (i) => i / (n - 1) * w, Y = (v) => h - v / mx * (h - 2) - 1;
  c.beginPath(); c.moveTo(0, h); for (let i = 0; i < n; i++) c.lineTo(X(i), Y(lower[i])); c.lineTo(w, h); c.closePath(); c.fillStyle = colLow; c.fill();
  c.beginPath(); for (let i = 0; i < n; i++) { const x = X(i), y = Y(lower[i] + upper[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); } for (let i = n - 1; i >= 0; i--) c.lineTo(X(i), Y(lower[i])); c.closePath(); c.fillStyle = colUp; c.fill();
}
function drawChart() {
  drawStack(pc, pctx, frame.histAuto, frame.histHet, 'rgba(63,185,143,.5)', 'rgba(224,102,77,.55)');           // población: autótrofo + heterótrofo
  if (bctx) drawStack(bc, bctx, frame.histAsexB, frame.histSexB, 'rgba(111,174,90,.55)', 'rgba(201,138,224,.6)'); // nacimientos: asexual + sexual
  if (dctx) drawStack(dc, dctx, frame.histPred, frame.histStarv, 'rgba(224,102,77,.55)', 'rgba(120,134,150,.6)'); // muertes: depredación + inanición
}

// Limitador de FPS de RENDER (no afecta a la simulación: el motor corre en el worker a su propio t/s). rAF sigue
// firando a la frecuencia de pantalla; saltamos el draw() (lo caro) hasta que toca → ahorra CPU/batería.
let maxFps = RENDER_P.maxFps, lastDrawT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (now - lastDrawT < 1000 / maxFps - 2) return;   // aún no toca dibujar este frame
  lastDrawT = now;
  draw();
}
requestAnimationFrame(loop);

// --- Interacción de cámara (no toca la sim) + clic para inspeccionar ---
let dragging = false, lastX = 0, lastY = 0, moved = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; moved = 0; canvas.classList.add('dragging'); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!dragging || !WORLD) return; const sc = scaleOf();
  moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
  if (following && moved > 6) { following = false; $('inspFollow').classList.remove('on'); }   // tomar el control cancela el seguimiento
  camX = wrap(camX - (e.clientX - lastX) / sc); camY = wrap(camY - (e.clientY - lastY) / sc); lastX = e.clientX; lastY = e.clientY; });
canvas.addEventListener('pointerup', (e) => {
  dragging = false; canvas.classList.remove('dragging');
  if (moved < 6 && WORLD && frame) { const r = canvas.getBoundingClientRect(); pickAt(e.clientX - r.left, e.clientY - r.top); }   // clic limpio (sin arrastrar) → seleccionar
});
canvas.addEventListener('pointercancel', () => { dragging = false; canvas.classList.remove('dragging'); });

// Selección: encuentra el agente más cercano al clic (en coords de mundo, con distancia toroidal) dentro de un radio.
function pickAt(px, py) {
  const sc = scaleOf(), size = WORLD.size;
  const wx = wrap(camX + (px - cw / 2) / sc), wy = wrap(camY + (py - ch / 2) / sc);
  const { n, ax, ay, aid } = frame; let best = -1, bestD = (22 / sc) ** 2;
  for (let a = 0; a < n; a++) {
    let dx = Math.abs(ax[a] - wx); if (dx > size - dx) dx = size - dx;
    let dy = Math.abs(ay[a] - wy); if (dy > size - dy) dy = size - dy;
    const d = dx * dx + dy * dy; if (d < bestD) { bestD = d; best = a; }
  }
  if (best >= 0) { selectedId = aid[best]; worker.postMessage({ type: 'inspect', id: selectedId }); }
  else deselect();
}
function deselect() { selectedId = -1; following = false; $('inspFollow').classList.remove('on'); worker.postMessage({ type: 'deselect' }); $('inspector').hidden = true; }
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (!WORLD) return;
  const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, sc0 = scaleOf();
  const wx = camX + (px - cw / 2) / sc0, wy = camY + (py - ch / 2) / sc0;
  setZoom(zoom * Math.exp(-e.deltaY * 0.0020));   // sensibilidad de la rueda (mayor = más zoom por muesca)
  const sc1 = scaleOf(); camX = wrap(wx - (px - cw / 2) / sc1); camY = wrap(wy - (py - ch / 2) / sc1);
}, { passive: false });

// --- Panel: controles ---
const $ = (id) => document.getElementById(id);
// FUENTE ÚNICA: los valores INICIALES de los controles salen de config.js (el HTML es solo fallback). Debe ir antes de
// los inits de display y del bucle del laboratorio (que leen .value).
$('worldSize').value = START.worldSize; $('seedCount').value = START.seedCount; $('spawnSpread').value = START.spawnSpread; $('diversity').value = START.diversity;
$('tps').value = RENDER_P.tps; $('fps').value = RENDER_P.maxFps; $('zoom').value = RENDER_P.zoom;
$('colorMode').value = RENDER_P.colorMode;
$('reproSex').checked = SIM_P.reproMode !== 'asexual'; $('reproAsex').checked = SIM_P.reproMode !== 'sexual';   // both→ambos · asexual→solo asex · sexual→solo sex
{ const src = { baseCost: SIM_P.baseCost, reproE: SIM_P.reproE, photoEff: SIM_P.photoEff, photoMotionK: SIM_P.photoMotionK, mutRate: GENOME_P.mutRate };
  for (const s of document.querySelectorAll('.lab-slider')) if (s.dataset.key in src) s.value = src[s.dataset.key]; }
function setZoom(z) { zoom = Math.max(MINZ, Math.min(MAXZ, z)); $('zoom').value = zoom.toFixed(1); $('zoomVal').textContent = zoom.toFixed(1) + '×'; }
$('zoom').addEventListener('input', (e) => setZoom(+e.target.value));
let running = true, maxOn = false;
// La barra de velocidad se "apaga" (atenúa) cuando hay pausa o MAX (el valor del slider no manda en esos modos).
function syncSpeedUI() { $('play').textContent = running ? '❚❚' : '▶'; $('max').classList.toggle('on', maxOn); $('tps').classList.toggle('dim', !running || maxOn); }
$('play').addEventListener('click', () => { running = !running; worker.postMessage({ type: 'running', value: running }); syncSpeedUI(); });
$('max').addEventListener('click', () => { maxOn = !maxOn; worker.postMessage({ type: 'maxSpeed', value: maxOn }); syncSpeedUI(); });
// Pulsar/arrastrar la barra: fija esa velocidad y vuelve al modo normal → desmarca pausa y MAX.
$('tps').addEventListener('input', (e) => {
  const v = +e.target.value; worker.postMessage({ type: 'tps', value: v }); $('tpsVal').textContent = v + ' t/s';
  if (!running) { running = true; worker.postMessage({ type: 'running', value: true }); }
  if (maxOn) { maxOn = false; worker.postMessage({ type: 'maxSpeed', value: false }); }
  syncSpeedUI();
});
$('fps').addEventListener('input', (e) => { maxFps = +e.target.value; $('fpsVal').textContent = maxFps + ' fps'; });   // límite de FPS de render
// B5: Reiniciar usa la semilla del panel (vacío → aleatoria; el worker devuelve la usada y la muestra). El mundo nuevo
// nace con lightMul=1 → re-aplica el lab.
function resetWorld() {   // semilla SIEMPRE aleatoria (seed:null → el worker la elige); el mundo nuevo nace con lightMul=1 → re-aplica el lab.
  worker.postMessage({ type: 'reset', seed: null, worldSize: +$('worldSize').value, seedCount: +$('seedCount').value, spawnSpread: +$('spawnSpread').value, diversity: +$('diversity').value });
  applyLab(); }
$('reset').addEventListener('click', resetWorld);
$('hide').addEventListener('click', () => document.body.classList.add('hidden-panel'));
$('show').addEventListener('click', () => document.body.classList.remove('hidden-panel'));
$('colorMode').addEventListener('change', (e) => { colorMode = e.target.value; buildLegend(); });

// LABORATORIO — sliders de leyes en vivo. Cada uno manda {set,key,value} al worker (mutación en caliente de SIM_P/mundo).
const LAB_DEF = { lightMul: 1, baseCost: SIM_P.baseCost, reproE: SIM_P.reproE, photoEff: SIM_P.photoEff, photoMotionK: SIM_P.photoMotionK, mutRate: GENOME_P.mutRate };   // defaults del lab = config (para "restaurar valores")
const fmtLab = (k, v) => k === 'lightMul' ? v.toFixed(2) + '×' : k === 'mutRate' ? v.toFixed(1) + '×' : k === 'reproE' ? v.toFixed(0) : k === 'photoMotionK' ? v.toFixed(1) : v.toFixed(3);
const labSliders = [...document.querySelectorAll('.lab-slider')];
const labOut = (k) => document.querySelector(`output[data-for="${k}"]`);
function applyLab() { for (const s of labSliders) worker.postMessage({ type: 'set', key: s.dataset.key, value: +s.value }); }
for (const s of labSliders) {
  const k = s.dataset.key, o = labOut(k);
  o.textContent = fmtLab(k, +s.value);
  s.addEventListener('input', () => { o.textContent = fmtLab(k, +s.value); worker.postMessage({ type: 'set', key: k, value: +s.value }); });
}
$('labReset').addEventListener('click', () => {
  for (const s of labSliders) { const k = s.dataset.key; s.value = LAB_DEF[k]; labOut(k).textContent = fmtLab(k, LAB_DEF[k]); }
  applyLab();
});
// Parámetros de ARRANQUE (necesitan reinicio): solo actualizan su display; se aplican al pulsar «Reiniciar».
const ws = $('worldSize'), sct = $('seedCount'), spr = $('spawnSpread'), dvr = $('diversity');
const pct = (el) => Math.round(+el.value * 100) + '%';
ws.addEventListener('input', () => $('worldSizeVal').textContent = ws.value + ' u');
sct.addEventListener('input', () => $('seedCountVal').textContent = sct.value);
spr.addEventListener('input', () => $('spawnSpreadVal').textContent = +spr.value >= 1 ? 'todo el mundo' : pct(spr) + ' (disco central)');
dvr.addEventListener('input', () => $('diversityVal').textContent = pct(dvr));
$('worldSizeVal').textContent = ws.value + ' u'; $('seedCountVal').textContent = sct.value;
$('spawnSpreadVal').textContent = +spr.value >= 1 ? 'todo el mundo' : pct(spr) + ' (disco central)'; $('diversityVal').textContent = pct(dvr);
// Vía reproductiva (en vivo): both (sexual+respaldo asexual) · asexual · sexual (obligada). Manda la cadena a SIM_P.reproMode.
// Reproducción = dos checkboxes (sexual / asexual) → reproMode. No se permite dejar las DOS apagadas (revierte la última).
function applyRepro(changed) {
  let sx = $('reproSex').checked, ax = $('reproAsex').checked;
  if (!sx && !ax) { if (changed) changed.checked = true; sx = $('reproSex').checked; ax = $('reproAsex').checked; }
  const mode = sx && ax ? 'both' : ax ? 'asexual' : 'sexual';
  worker.postMessage({ type: 'set', key: 'reproMode', value: mode });
}
$('reproSex').addEventListener('change', (e) => applyRepro(e.target));
$('reproAsex').addEventListener('change', (e) => applyRepro(e.target));

// Inspector: controles de la tarjeta
$('inspClose').addEventListener('click', deselect);
$('inspFollow').addEventListener('click', () => { following = !following; $('inspFollow').classList.toggle('on', following); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('hidden-panel');
  else if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
  else if (e.key === 'Escape' && selectedId >= 0) deselect();
});

function buildLegend() {
  const L = $('legend');
  const sets = {
    natural: [['#7fb0d8', 'color = pigmento heredado (linaje)'], ['#e0a84a', 'motas = patrón de familia · brillo = energía']],
    natmix: [['#7fb0d8', 'pigmento heredado'], ['#3fb98f', '+ tinte sutil de tejido (función)'], ['#e0a84a', 'motas · brillo = energía']],
    tissue: [['#3fb98f', 'fotosíntesis'], ['#e0664d', 'músculo'], ['#e0a84a', 'boca'], ['#9a7bd0', 'aura = color real (linaje)']],
    role: [['#3fb98f', 'autótrofo'], ['#e0664d', 'heterótrofo'], ['#e0a84a', 'mixótrofo'], ['#9a7bd0', 'aura = color real (linaje)']],
    lineage: [['#e0664d', 'tono = linaje (color heredado, deriva lenta)']],
  };
  L.innerHTML = (sets[colorMode] || sets.natural).map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
}
buildLegend();
$('tpsVal').textContent = $('tps').value + ' t/s'; $('zoomVal').textContent = (+$('zoom').value).toFixed(1) + '×'; $('fpsVal').textContent = $('fps').value + ' fps';

// depuración / preview (rAF se throttlea): forzar avance del motor + dibujar
window.__worker = worker;
window.__burst = (n) => worker.postMessage({ type: 'burst', n: n || 2000 });
window.__draw = draw;
window.__view = () => ({ zoom, camX: camX | 0, camY: camY | 0, sel: selectedId, follow: following, n: frame && frame.n,
  frameSel: frame && frame.sel, hasDetail: !!(frame && frame.detail), detailId: frame && frame.detail && frame.detail.id });
window.__testPick = () => {   // ejercita la ruta REAL de selección (pickAt) sobre el agente más cercano al centro de cámara
  if (!frame || !WORLD) return null; const sc = scaleOf(), S = WORLD.size; let best = -1, bd = 1e18;
  for (let a = 0; a < frame.n; a++) { let dx = Math.abs(frame.ax[a] - camX); if (dx > S - dx) dx = S - dx; let dy = Math.abs(frame.ay[a] - camY); if (dy > S - dy) dy = S - dy; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = a; } }
  if (best < 0) return null;
  pickAt((frame.ax[best] - camX) * sc + cw / 2, (frame.ay[best] - camY) * sc + ch / 2);
  return { picked: selectedId, aid: frame.aid[best] };
};
