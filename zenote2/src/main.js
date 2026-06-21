// CLIENTE DE RENDER (UI P1). El MOTOR corre en un Web Worker (engine/worker.js); aquí solo se dibuja desde las "fotos"
// y se maneja la CÁMARA (zoom + paneo TOROIDAL infinito) + los controles del panel. La cámara no toca la sim (fluida).

import { TISSUE } from './engine/genome.js';
import { RENDER_P, START, SIM_P, GENOME_P, WORLD_P } from './config.js';   // fuente única de parámetros (render/arranque/lab)

const worker = new Worker(new URL('./engine/worker.js', import.meta.url), { type: 'module' });
let WORLD = null, frame = null;
worker.onmessage = (e) => { const m = e.data; if (m.type === 'world') { WORLD = m; resetCamera(); const sv = document.getElementById('seedVal'); if (sv) sv.textContent = m.seed; } else if (m.type === 'frame') { frame = m; if (m.veg) bakeVeg(m.veg); } };   // el fondo = campo de VEGETACIÓN (llega cada frame; fluye con la luz); 'world' trae la semilla usada → readout

const canvas = document.getElementById('world'), ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
let cw = 0, ch = 0, vignette = null; const dpr = Math.min(RENDER_P.dprCap, window.devicePixelRatio || 1);
// A4 — BLOOM (bioluminiscencia): la capa de ORGANISMOS se dibuja en un búfer aparte (glowCv); su versión reducida
// (bloomCv, 1/BLOOM_DIV) se reescala aditivamente sobre el fondo → luz suave que sangra (coste ≈ 1/DIV², móvil ok).
// bloomStrength=0 lo apaga (Baja/móvil). Es render PURO. Downsampled como en v1 (VISUAL.md).
const glowCv = document.createElement('canvas'), glowCtx = glowCv.getContext('2d');
const bloomCv = document.createElement('canvas'), bloomCtx = bloomCv.getContext('2d');
let bloomStrength = RENDER_P.bloom; const BLOOM_DIV = RENDER_P.bloomDiv;
// FONDO DEL ABISMO = la VEGETACIÓN: el campo veg (que llega en cada frame) se hornea a una mini-textura (1 px/celda) y se
// reescala SUAVIZADA → nebulosa VERDE (pasto/algas) sobre abismo. Donde hay más vegetación, más verde = ahí está la comida.
// Fluye con la luz (su K sigue al campo de luz, que puede derivar — "Corriente del abismo").
const vegCv = document.createElement('canvas');
let depthField = null;   // NEBULOSA DE PROFUNDIDAD: campo grande frío↔cálido (toroidal, estático) fundido en el bake de la veg → el abismo no es un teal plano
function bakeVeg(veg) {
  if (!WORLD) return;
  // normaliza por la veg en pie TÍPICA (≈ ref·0.25), no por el máximo teórico — el pastoreo la mantiene bien por debajo de K,
  // así que normalizar por K la dejaría casi negra. sqrt para realzar las zonas ralas.
  const cols = WORLD.cols, rows = WORLD.rows, ref = (WORLD.vegRef || 10) * 0.25;
  vegCv.width = cols; vegCv.height = rows;
  const lc = vegCv.getContext('2d'), img = lc.createImageData(cols, rows), d = img.data;
  // campo de profundidad frío↔cálido (estático, una vez por tamaño): sumas de senos con ciclos ENTEROS → tesela sin costura en el toro.
  if (!depthField || depthField.length !== cols * rows) {
    depthField = new Float32Array(cols * rows);
    for (let yy = 0; yy < rows; yy++) for (let xx = 0; xx < cols; xx++) {
      const u = xx / cols, w = yy / rows;
      let dd = Math.sin(u * 12.566 + 1.3) * 0.5 + Math.sin(w * 6.283 + 2.1) * 0.35 + Math.sin((u + w) * 18.85 + 0.7) * 0.15;
      depthField[yy * cols + xx] = 0.5 + 0.5 * (dd < -1 ? -1 : dd > 1 ? 1 : dd);   // 0 frío (azul casi negro) .. 1 cálido (índigo/violeta)
    }
  }
  for (let i = 0; i < cols * rows; i++) {
    // realce del pasto tenue: exponente bajo (^0.45) sube los mids → hasta el pasto ralo brilla (como zenote1). Incremento TEAL
    // (verde-azulado) sobre abismo azul oscuro, no verde puro → la estética acuática que tenía zenote1.
    const v = Math.pow(Math.max(0, Math.min(1, veg[i] / ref)), 0.45), o = i * 4, dep = depthField[i];
    // base del abismo MODULADA por profundidad (frío=azul casi negro · cálido=índigo/violeta, sutil) + incremento TEAL por vegetación.
    d[o] = 4 + dep * 8 + v * 12; d[o + 1] = 9 + dep * 3 + v * 86; d[o + 2] = 15 + dep * 12 + v * 82; d[o + 3] = 255;
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

const TCOL = [ '#5a6b7a', '#e0664d', '#e0a84a' ];   // STRUCTURE, MUSCLE, MOUTH (índice = tissue)
const RCOL = [ '#3fb98f', '#e0664d', '#e0a84a' ];   // rol (por dieta): 0 herbívoro · 1 carnívoro · 2 omnívoro
// Equivalentes HSL [h,s,l] de TCOL/RCOL → para el SOMBREADO VOLUMÉTRICO (necesita el color numérico para derivar luz/sombra).
const TCOL_HSL = [ [208, 15, 42], [10, 70, 59], [38, 71, 58] ];
const RCOL_HSL = [ [159, 49, 49], [10, 70, 59], [38, 71, 58] ];
const ROLE_TXT = [ 'herbívoro', 'carnívoro', 'omnívoro' ];
const LIGHT_DX = -0.42, LIGHT_DY = -0.5;   // dirección de luz (pantalla, arriba-izq) → el realce del gradiente cae hacia ahí en TODOS los nodos = escena coherente
const cl = (v) => v < 0 ? 0 : v > 100 ? 100 : v;   // clamp 0..100 para s/l
// NIEVE MARINA (#5): detrito a la deriva que titila, mayoría azul-frío + algunas con color → profundidad del abismo. Render puro.
const SNOW_PAL = [ 190, 200, 285, 45, 330 ];   // cian · azul · violeta · oro · rosa (chispa rara con color)
let snow = null;
function initSnow(size) {
  const n = 680, p = new Float32Array(n * 4), hue = new Float32Array(n);
  for (let k = 0; k < n; k++) { p[k * 4] = Math.random() * size; p[k * 4 + 1] = Math.random() * size; p[k * 4 + 2] = Math.random() * 6.283; p[k * 4 + 3] = 0.5 + Math.random() * Math.random() * 1.6;
    hue[k] = Math.random() < 0.06 ? SNOW_PAL[(Math.random() * SNOW_PAL.length) | 0] : -1; }   // ~6% con color
  snow = { p, hue, n, size };
}
// Dibuja la nieve marina de un tile (pantalla oX,oY + escala sc). Tamaño en PÍXELES (constante en pantalla → specks limpios a
// cualquier zoom); la posición va en MUNDO (parallax al panear). Aditiva ('lighter') → destellos que brillan sobre el abismo.
function drawSnow(oX, oY, sc, t) {
  if (!snow || snow.size !== WORLD.size) initSnow(WORLD.size);
  const { p, hue, n } = snow, S = WORLD.size, tt = t * 0.9;
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < n; k++) {
    const ph = p[k * 4 + 2], sz = p[k * 4 + 3];
    const wx = p[k * 4] + Math.sin(tt * 0.8 + ph) * 7 + Math.sin(tt * 0.26 + ph * 2.1) * 4;   // deriva lateral suave (2 frecuencias)
    let wy = (p[k * 4 + 1] + tt * 5 + Math.cos(tt * 0.6 + ph) * 4) % S; if (wy < 0) wy += S;   // descenso lento + wrap toroidal
    const px = oX + wx * sc, py = oY + wy * sc;
    if (px < -4 || px > cw + 4 || py < -4 || py > ch + 4) continue;
    let tw = Math.sin(tt * 3.1 + ph * 3.1); tw = tw > 0 ? tw * tw : 0;   // titileo con destellos puntuales
    const a = 0.04 + tw * 0.5, hh = hue[k];
    ctx.fillStyle = hh < 0 ? `rgba(200,224,255,${a})` : `hsla(${hh},80%,64%,${a})`;
    ctx.beginPath(); ctx.arc(px, py, sz * (0.6 + tw * 1.2), 0, 6.283); ctx.fill();   // la mota crece al destellar = chispa
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
// PLANCTON / micro-flora: chispas glow FIJAS que FLORECEN donde hay vegetación (algas) → vida y textura del sustrato (como v1).
// Densidad "por cantidad": zona frondosa = casi todas encienden; pastada = casi ninguna (umbral por mota). Aditivo. Render puro.
let plankton = null, sparkSprites = null;
function makeSparkSprite(hue) {
  const S = 20, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), r = S / 2;
  const g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, `hsla(${hue},70%,80%,0.95)`); g.addColorStop(0.35, `hsla(${hue},75%,60%,0.40)`); g.addColorStop(1, `hsla(${hue},75%,50%,0)`);
  x.fillStyle = g; x.beginPath(); x.arc(r, r, r, 0, 6.283); x.fill(); return c;
}
function initPlankton(size) {
  if (!sparkSprites) sparkSprites = [158, 172, 186, 200].map(makeSparkSprite);   // tonos teal/cian/verde (algas), distintos de los bichos
  const n = Math.max(200, Math.round(700 * (size / 1500) * (size / 1500)));   // ∝ área → densidad ~constante a cualquier tamaño de mundo
  const px = new Float32Array(n), py = new Float32Array(n), ps = new Uint8Array(n), pscale = new Float32Array(n), pseed = new Float32Array(n);
  for (let i = 0; i < n; i++) { px[i] = Math.random() * size; py[i] = Math.random() * size; ps[i] = (Math.random() * sparkSprites.length) | 0; pscale[i] = 0.7 + Math.random() * 0.9; pseed[i] = Math.random(); }
  plankton = { px, py, ps, pscale, pseed, n, size };
}
// Dibuja el plancton de un tile: cada mota enciende ∝ vegetación local (lee el campo veg de la foto). Aditivo → en zonas densas se acumula = floración.
function drawPlankton(oX, oY, sc) {
  if (!frame || !frame.veg || !WORLD) return;
  if (!plankton || plankton.size !== WORLD.size) initPlankton(WORLD.size);
  const { px, py, ps, pscale, pseed, n } = plankton, veg = frame.veg, cols = WORLD.cols, cw2 = WORLD.cellW, ref = (WORLD.vegRef || 10) * 0.25;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = px[i], y = py[i];
    let cx = (x / cw2) | 0, cy = (y / cw2) | 0; if (cx >= cols) cx = cols - 1; if (cy >= cols) cy = cols - 1;
    const food = veg[cy * cols + cx] / ref;
    if (food < 0.08 + pseed[i] * 0.7) continue;   // densidad por CANTIDAD: frondoso → casi todas, pastado → casi ninguna
    const sx = oX + x * sc, sy = oY + y * sc;
    if (sx < -12 || sx > cw + 12 || sy < -12 || sy > ch + 12) continue;
    const a = Math.min(0.6, 0.12 + food * 0.5) * pscale[i];
    let sz = (4 + food * 5) * pscale[i] * sc; if (sz < 2) sz = 2; else if (sz > 16) sz = 16;
    ctx.globalAlpha = a;
    ctx.drawImage(sparkSprites[ps[i]], sx - sz / 2, sy - sz / 2, sz, sz);
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
// SILUETA del nodo (#2): curva bézier cerrada base↔punta (como el `_silPath` de zenote1) en vez de elipse → gota/aleta/
// tentáculo. Eje local = rumbo+dir del nodo; la PUNTA (+L) mira hacia afuera (dir de emisión) → los apéndices afilan hacia
// fuera del cuerpo. wB = medio-ancho base (interior, junto al padre) · wT = medio-ancho punta (exterior). Construye el path
// (lo rellena/perfila el llamador, reusando gradiente/borde/tinte). cx,cy en píxeles; rot en rad.
function silPath(c, cx, cy, rot, L, wB, wT, append) {
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const X = (lx, ly) => cx + lx * cr - ly * sr, Y = (lx, ly) => cy + lx * sr + ly * cr;
  if (!append) c.beginPath();   // append=true → acumula como subpath (para el CONTORNO unificado: muchos nodos en un solo path/fill)
  c.moveTo(X(-L, 0), Y(-L, 0));
  c.bezierCurveTo(X(-L * 0.5, wB), Y(-L * 0.5, wB), X(L * 0.5, wT), Y(L * 0.5, wT), X(L, 0), Y(L, 0));
  c.bezierCurveTo(X(L * 0.5, -wT), Y(L * 0.5, -wT), X(-L * 0.5, -wB), Y(-L * 0.5, -wB), X(-L, 0), Y(-L, 0));
  c.closePath();
}
let colorMode = RENDER_P.colorMode;

function draw() {
  const t = performance.now() / 1000;
  ctx.fillStyle = '#05080d'; ctx.fillRect(0, 0, cw, ch);
  if (!WORLD || !frame) return;
  const size = WORLD.size, sc = scaleOf();
  const vwHalf = cw / 2 / sc, vhHalf = ch / 2 / sc;
  const txMin = Math.floor((camX - vwHalf) / size), txMax = Math.floor((camX + vwHalf) / size);
  const tyMin = Math.floor((camY - vhHalf) / size), tyMax = Math.floor((camY + vhHalf) / size);

  // sustrato (campo de VEGETACIÓN) por tile
  for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) drawVeg((tx * size - camX) * sc + cw / 2, (ty * size - camY) * sc + ch / 2, sc);
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

  // PLANCTON / micro-flora: chispas que florecen donde hay vegetación, sobre el sustrato (bajo la nieve y los organismos).
  if (bloomStrength > 0) for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) drawPlankton((tx * size - camX) * sc + cw / 2, (ty * size - camY) * sc + ch / 2, sc);
  // NIEVE MARINA (#5): detrito a la deriva que titila, bajo los organismos → profundidad y vida del abismo. Gateada por el
  // slider de bioluminiscencia (0 = apagado, móvil/Baja, coherente con "sin nieve en calidad baja" de VISUAL.md).
  if (bloomStrength > 0) for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) drawSnow((tx * size - camX) * sc + cw / 2, (ty * size - camY) * sc + ch / 2, sc, t);

  // CADÁVERES (#3): bajo los organismos, siluetas oscuras del linaje que se DESVANECEN con su carroña (muerte visible).
  for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) drawCorpses((tx * size - camX) * sc + cw / 2, (ty * size - camY) * sc + ch / 2, sc);

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

function drawVeg(oX, oY, sc) {
  // un tile del mundo = la mini-textura de vegetación reescalada SUAVIZADA (bilinear) → nebulosa verde sin rejilla.
  if (!vegCv.width) return;
  const wpx = WORLD.size * sc;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(vegCv, oX, oY, wpx, wpx);
}

// CADÁVERES (#3): cuerpos muertos recientes, en su orientación final (sin ondulación ni ojos), tono del linaje muy
// desaturado y OSCURO que se apaga al descomponerse. alpha y luminosidad caen con `dcfade` (edad/vida) → se funden con
// el fondo a la vez que su carroña (detritusE) se consume/mineraliza. Se dibujan en `ctx` (bajo el glow de los vivos).
function drawCorpses(oX, oY, sc) {
  const f = frame; if (!f.dcm) return;
  const { dcm, dcx, dcy, dch, dchue, dcfade, dcOff, dcData } = f;
  for (let a = 0; a < dcm; a++) {
    const wx = dcx[a], wy = dcy[a], bx = oX + wx * sc, by = oY + wy * sc;
    if (bx < -40 || bx > cw + 40 || by < -40 || by > ch + 40) continue;   // culling
    const fade = dcfade[a], alpha = (1 - fade) * 0.55; if (alpha <= 0.01) continue;
    const hh = dch[a], chh = Math.cos(hh), shh = Math.sin(hh), p0 = dcOff[a], p1 = dcOff[a + 1];
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `hsl(${(dchue[a] * 360) | 0},${(20 * (1 - fade)) | 0}%,${(34 - 16 * fade) | 0}%)`;   // linaje desaturado, oscureciéndose
    for (let k = p0; k < p1; k++) {
      const o = k * 5, lx = dcData[o], ly = dcData[o + 1], r = dcData[o + 2], aspect = dcData[o + 3], dir = dcData[o + 4];
      const pr = Math.max(1, r * sc); if (pr < 1.2) continue;   // LOD
      const px = oX + (wx + (lx * chh - ly * shh)) * sc, py = oY + (wy + (lx * shh + ly * chh)) * sc;
      const rL = pr * (1 + aspect * 1.4);
      ctx.beginPath();
      if (rL > 1.6) ctx.ellipse(px, py, rL, pr, hh + dir, 0, 6.283); else ctx.arc(px, py, pr, 0, 6.283);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawOrgs(c, oX, oY, sc, t, halo) {
  const { n, ax, ay, ah, aspd, ahue, aE, aGazeX, aGazeY, aAlert, arole, partOff, partData } = frame;
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
    // base HSL numérico del NÚCLEO para el SOMBREADO VOLUMÉTRICO (pasada !halo): natural/natmix/lineage = linaje · role = oficio · tissue = por nodo (abajo)
    let bH = ahue[a] * 360, bS = 62, bL = 54;
    if (colorMode === 'role') { const c0 = RCOL_HSL[arole[a]] || RCOL_HSL[0]; bH = c0[0]; bS = c0[1]; bL = c0[2]; }
    else if (colorMode === 'lineage') { bS = 58; bL = 58; }
    // TEXTURA — SEGMENTACIÓN: nº de COSTILLAS/bandas transversales derivado de `hue` (heredado) → familias comparten patrón
    // (lectura fiel del linaje, honesto). Sustituye a las antiguas "motas" (3 puntos gordos): leían como pegatina, no anatomía.
    const bandN = !halo ? 3 + ((ahue[a] * 7919) | 0) % 4 : 0;   // 3..6 segmentos por nodo
    let bodyR = 0, headX = bx, headY = by, headR = 0, headScore = -1e9;   // OJOS: extensión del cuerpo (LOD) + parte-CABEZA donde ANCLAR los ojos (nodo más adelantado, leve preferencia BOCA = la "cara")
    // CONTORNO unificado (solo !halo, reemplaza el borde DURO por-nodo): silueta DILATADA de todos los nodos en UN solo path →
    // un único fill oscuro → solo asoma el REBORDE exterior (los cuerpos lo tapan por dentro) = contorno suave, sin líneas internas
    // (VISUAL.md "nada de bordes duros"). Color = tinte oscuro del linaje. LOD: solo nodos visibles. Barato (sin gradiente, 1 fill).
    if (!halo) {
      c.beginPath();
      for (let k = p1 - 1; k >= p0; k--) {
        const o = k * 7, lx = partData[o], ly = partData[o + 1], r = partData[o + 2], ph = partData[o + 4], aspect = partData[o + 5], dir = partData[o + 6];
        const uy = ly + (0.35 + spd * RENDER_P.undulation) * Math.sin(t * 5 + lx * 0.16 + ph);
        const px = oX + (wx + (lx * chh - uy * shh)) * sc, py = oY + (wy + (lx * shh + uy * chh)) * sc, pr = Math.max(1, r * sc);
        const rL = pr * (1 + aspect * 1.4); if (rL <= 1.6) continue;   // diminutos: sin contorno (el bloom los define)
        const ow = Math.max(0.8, pr * 0.16);   // grosor del reborde ∝ tamaño (suave)
        silPath(c, px, py, h + dir, rL + ow, pr * (1 + aspect * 0.15) + ow, pr * (1 - aspect * 0.85) + ow, true);   // append → acumula
      }
      c.fillStyle = `hsl(${bH | 0},${cl(bS - 12)}%,${cl(bL - 40)}%)`; c.fill();   // tinte oscuro del linaje → reborde, no línea dura
    }
    for (let k = p1 - 1; k >= p0; k--) {
      const o = k * 7, lx = partData[o], ly = partData[o + 1], r = partData[o + 2], tissue = partData[o + 3], ph = partData[o + 4], aspect = partData[o + 5], dir = partData[o + 6];
      const uy = ly + (0.35 + spd * RENDER_P.undulation) * Math.sin(t * 5 + lx * 0.16 + ph);
      const px = oX + (wx + (lx * chh - uy * shh)) * sc, py = oY + (wy + (lx * shh + uy * chh)) * sc, pr = Math.max(1, r * sc * mul);
      if (!halo) { const dx = px - bx, dy = py - by, ext = Math.hypot(dx, dy) + pr; if (ext > bodyR) bodyR = ext;
        const hs = dx * chh + dy * shh + (tissue === TISSUE.MOUTH ? pr : 0); if (hs > headScore) { headScore = hs; headX = px; headY = py; headR = pr; } }   // cabeza = nodo más adelantado (la "cara") donde se anclan los ojos
      // #2 — SILUETA bézier: gota/aleta/tentáculo (afila hacia afuera según `aspect`; eje = rumbo + dir). LOD: diminuta → punto.
      const rL = pr * (1 + aspect * 1.4), wB = pr * (1 + aspect * 0.15), wT = pr * (1 - aspect * 0.85);
      if (rL > 1.6) silPath(c, px, py, h + dir, rL, wB, wT);
      else { c.beginPath(); c.arc(px, py, pr, 0, 6.283); }
      // color base del NÚCLEO (per-tejido en modo Tejido; si no, el del agente) → lo usan el relleno Y las costillas
      let nh = bH, ns = bS, nl = bL;
      if (!halo && colorMode === 'tissue') { const c0 = TCOL_HSL[tissue] || TCOL_HSL[0]; nh = c0[0]; ns = c0[1]; nl = c0[2]; }
      if (halo) c.fillStyle = agentCol;   // aura: relleno plano (lo suaviza el bloom)
      else if (pr > 4) {   // VOLUMEN: gradiente radial (caro, createRadialGradient) SOLO en nodos grandes = al acercar; a vista de mundo → plano (imperceptible) y barato
        const lr = rL > pr ? rL : pr;
        const g = c.createRadialGradient(px + LIGHT_DX * pr, py + LIGHT_DY * pr, pr * 0.15, px, py, lr * 1.03);
        g.addColorStop(0, `hsl(${nh | 0},${cl(ns - 12)}%,${cl(nl + 20)}%)`);    // realce
        g.addColorStop(0.55, `hsl(${nh | 0},${ns}%,${nl}%)`);                   // medio
        g.addColorStop(1, `hsl(${nh | 0},${cl(ns + 10)}%,${cl(nl - 22)}%)`);    // sombra
        c.fillStyle = g;
      } else c.fillStyle = `hsl(${nh | 0},${ns}%,${nl}%)`;
      c.fill();
      if (natMix && !halo) { const ga = c.globalAlpha; c.globalAlpha = ga * 0.32; c.fillStyle = TCOL[tissue] || '#5a6b7a'; c.fill(); c.globalAlpha = ga; }   // Natural+tejido: tinte SUTIL de la función
      // (el contorno duro por-nodo se sustituyó por el CONTORNO unificado dibujado ANTES del cuerpo → reborde suave)
      // TEXTURA — COSTILLAS transversales (segmentación): curvas combadas hacia la punta, color = SOMBRA del propio cuerpo
      // (anatomía, no motas pegadas), ajustadas al ancho LOCAL de la silueta (sin clip → barato). LOD: solo nodos grandes (al acercar).
      if (bandN > 1 && pr > 5) {
        c.strokeStyle = `hsla(${nh | 0},${cl(ns + 8)}%,${cl(nl - 20)}%,0.42)`; c.lineWidth = Math.max(0.6, pr * 0.12);
        const rot = h + dir, cr = Math.cos(rot), sr = Math.sin(rot), txu = -sr, tyu = cr;   // eje (cr,sr) + transversal (txu,tyu)
        for (let bI = 1; bI < bandN; bI++) {
          const f = bI / bandN, lw = (wB + (wT - wB) * f) * 0.82, ax = (2 * f - 1) * rL, ccx = px + cr * ax, ccy = py + sr * ax, bow = lw * 0.4;
          c.beginPath(); c.moveTo(ccx - txu * lw, ccy - tyu * lw); c.quadraticCurveTo(ccx + cr * bow, ccy + sr * bow, ccx + txu * lw, ccy + tyu * lw); c.stroke();
        }
        c.strokeStyle = RENDER_P.border; c.lineWidth = RENDER_P.borderW;   // restaurar el estilo del borde para el próximo nodo
      }
    }
    // OJOS (solo render): ANCLADOS a la parte-CABEZA (se acabó el flotar) y dibujados como EYESPOT orgánico — mancha de
    // pigmento + iris del linaje + GLINT especular hacia la luz de la escena (sin esclera blanca = sin pegatina), dentro de la
    // silueta. Nº y disposición por LINAJE (no siempre 2). La pupila MIRA al estímulo (percepción real, amenaza>presa) o al
    // rumbo en calma, y se aviva/dilata con la cercanía (alert). LOD: se funden al acercar; nada en vista de mundo.
    if (!halo && headR > 1.2) {
      const amt = Math.min(1, Math.max(0, (bodyR - 4) / 14));
      if (amt > 0.02) {
        const alert = aAlert ? aAlert[a] : 0, lh = (ahue[a] * 360) | 0, vv = (ahue[a] * 41.7) % 1;
        const hr = (ahue[a] * 9301) % 1, nEye = hr < 0.18 ? 1 : hr < 0.85 ? 2 : 3;   // linaje → cíclope / par / tres (rompe "siempre 2")
        const er = headR * (0.36 - 0.045 * nEye + 0.05 * alert) * (0.85 + 0.3 * vv);   // ∝ CABEZA; más ojos → algo menores; crece con la alerta
        const fo = headR * 0.20, lo = headR * 0.44, latx = -shh, laty = chh;            // dentro de la silueta: adelante (fo) + apertura lateral (lo) en el eje transversal
        let gx = chh, gy = shh; if (alert > 0.01 && aGazeX) { gx = aGazeX[a]; gy = aGazeY[a]; }   // mirada: al estímulo o, en calma, al rumbo
        const ga0 = c.globalAlpha, baseA = ga0 * amt;
        for (let e = 0; e < nEye; e++) {
          const tt = nEye === 1 ? 0 : (e / (nEye - 1)) * 2 - 1;   // -1..1 repartidos a lo ancho de la cabeza
          const ex = headX + chh * fo + latx * lo * tt, ey = headY + shh * fo + laty * lo * tt;
          c.globalAlpha = baseA;
          c.fillStyle = `hsl(${lh},${(42 + 28 * alert) | 0}%,${(19 + 10 * alert) | 0}%)`;   // mancha/iris OSCURO del linaje (no esclera blanca)
          c.beginPath(); c.arc(ex, ey, er, 0, 6.283); c.fill();
          const pf = er * (0.18 + 0.30 * alert);                                            // pupila desplazada hacia la MIRADA + dilatada con la alerta
          c.fillStyle = 'rgba(6,5,9,0.95)';
          c.beginPath(); c.arc(ex + gx * pf, ey + gy * pf, er * (0.5 + 0.12 * alert), 0, 6.283); c.fill();
          c.globalAlpha = baseA * (0.65 + 0.35 * alert);                                    // GLINT especular: el toque húmedo/vivo, hacia la luz de la escena (coherente con el sombreado)
          c.fillStyle = 'rgba(216,232,255,0.92)';
          c.beginPath(); c.arc(ex + LIGHT_DX * er * 0.5, ey + LIGHT_DY * er * 0.5, er * 0.26, 0, 6.283); c.fill();
        }
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
const mcv = document.getElementById('massChart'), mctx = mcv && mcv.getContext('2d');   // talla (masa) media por oficio en el tiempo (#12)
const gcv = document.getElementById('geneChart'), gctx = gcv && gcv.getContext('2d');   // histograma de un rasgo seleccionable (por oficio)
const TRAIT_LABEL = { mass: 'masa', mouthCap: 'boca', vmax: 'v.máx', nParts: 'partes', reproK: 'umbral cría', investFrac: 'inversión/cría', hue: 'linaje' };
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
  $('inspHue').style.background = `hsl(${(d.hue * 360) | 0},62%,58%)`;   // swatch de linaje (tono heredado) → identificar familias
  // DIETA emergente real (pasto/caza/carroña, acumulada en vida) → barra apilada + texto. Revela el OFICIO de ESTE animal.
  const dV = d.dietV || 0, dP = d.dietP || 0, dS = d.dietS || 0, dT = dV + dP + dS, seg = $('inspDiet').children;
  if (dT > 0.5) { const pV = dV / dT * 100, pP = dP / dT * 100, pS = dS / dT * 100;
    seg[0].style.width = pV + '%'; seg[1].style.width = pP + '%'; seg[2].style.width = pS + '%';
    $('inspDietTxt').textContent = `dieta: pasto ${pV.toFixed(0)}% · caza ${pP.toFixed(0)}%` + (pS >= 0.5 ? ` · carroña ${pS.toFixed(0)}%` : '');
  } else { seg[0].style.width = seg[1].style.width = seg[2].style.width = '0%'; $('inspDietTxt').textContent = 'dieta: — (recién nacido)'; }
  $('inspE').style.width = (Math.max(0, Math.min(1, d.E / d.reproE)) * 100).toFixed(0) + '%';
  $('inspEtxt').textContent = `energía ${d.E.toFixed(1)} / cría ${d.reproE.toFixed(0)}` + (d.investE != null ? ` · inv/cría ${d.investE.toFixed(1)}` : '') + (d.gut > 0.05 ? ` · tripa ${d.gut.toFixed(1)}` : '');   // r/K: umbral e inversión PROPIOS
  $('inspMass').textContent = d.mass.toFixed(2);
  $('inspParts').textContent = d.nParts;
  $('inspV').textContent = d.vmax.toFixed(2);
  $('inspAge').textContent = d.age | 0;
  $('inspTroph').textContent = `${d.mouthCap.toFixed(2)} / ${d.maxMouthR.toFixed(1)}`;
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
  drawStack(pc, pctx, frame.histHerb, frame.histCarn, 'rgba(63,185,143,.5)', 'rgba(224,102,77,.55)');           // población: herbívoro + carnívoro
  if (bctx) drawStack(bc, bctx, frame.histAsexB, frame.histSexB, 'rgba(111,174,90,.55)', 'rgba(201,138,224,.6)'); // nacimientos: asexual + sexual
  if (dctx) drawStack(dc, dctx, frame.histPred, frame.histStarv, 'rgba(224,102,77,.55)', 'rgba(120,134,150,.6)'); // muertes: depredación + inanición
  if (mctx && frame.histMassH) drawLines(mcv, mctx, [frame.histMassH, frame.histMassC], ['rgba(63,185,143,.85)', 'rgba(224,102,77,.9)'], 12, 'masa');  // talla media por oficio (#12)
  if (gctx && frame.geneH) drawGeneHist();                                                                       // histograma del rasgo seleccionado (por oficio)
}
// Gráfica de LÍNEAS (serie temporal) de N series sobre eje Y fijo [0, ymax] → ver una media evolucionar sobre escala estable.
function drawLines(cv, c, series, cols, ymax, label) {
  const w = cv.width, h = cv.height; c.clearRect(0, 0, w, h);
  const s0 = series[0]; if (!s0 || s0.length < 2) return;
  const n = s0.length, X = (i) => i / (n - 1) * w, Y = (v) => h - Math.min(1, v / ymax) * (h - 2) - 1;
  c.lineWidth = 1.5;
  for (let k = 0; k < series.length; k++) { const ser = series[k]; c.strokeStyle = cols[k]; c.beginPath();
    for (let i = 0; i < n; i++) { const x = X(i), y = Y(ser[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
  c.fillStyle = 'rgba(195,205,218,.8)'; c.font = '10px ui-monospace,monospace'; c.textBaseline = 'top'; c.textAlign = 'left';
  c.fillText(label, 3, 1); c.textAlign = 'right'; c.fillText(ymax.toFixed(0), w - 2, 1); c.textAlign = 'left';   // eje: rasgo + tope Y
}
// HISTOGRAMA del rasgo seleccionado: barras APILADAS por bin (herbívoro abajo + carnívoro encima) sobre un eje FIJO [lo,hi] →
// ver la distribución derivar en el tiempo (prueba visual de la selección) y cómo difiere por oficio (p.ej. boca: herbívoros
// bajos, carnívoros altos). Los bins (geneH/geneC) y el rango los computa el worker; aquí solo se pintan. Escala a la barra máxima.
function drawGeneHist() {
  const c = gctx, w = gcv.width, h = gcv.height, H = frame.geneH, C = frame.geneC, nb = H.length; c.clearRect(0, 0, w, h);
  let mx = 1; for (let i = 0; i < nb; i++) { const t = H[i] + C[i]; if (t > mx) mx = t; }
  const bw = w / nb, hh = h - 12;
  for (let i = 0; i < nb; i++) { const x = i * bw, hHt = H[i] / mx * hh, cHt = C[i] / mx * hh;
    if (hHt > 0) { c.fillStyle = 'rgba(63,185,143,.65)'; c.fillRect(x, h - hHt, bw - 0.6, hHt); }
    if (cHt > 0) { c.fillStyle = 'rgba(224,102,77,.7)'; c.fillRect(x, h - hHt - cHt, bw - 0.6, cHt); }
  }
  c.fillStyle = 'rgba(195,205,218,.8)'; c.font = '10px ui-monospace,monospace';
  c.textBaseline = 'top'; c.textAlign = 'left'; c.fillText(TRAIT_LABEL[frame.geneTrait] || frame.geneTrait, 3, 1);
  const fmt = (v) => Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
  c.textBaseline = 'bottom'; c.fillText(fmt(frame.geneLo), 2, h - 1);
  c.textAlign = 'right'; c.fillText(fmt(frame.geneHi), w - 2, h - 1); c.textAlign = 'left';
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
{ const src = { lightFlow: WORLD_P.lightFlow, vegGrowth: WORLD_P.vegGrowth, patchiness: WORLD_P.patchiness, grazeRefuge: SIM_P.grazeRefuge, forageReach: SIM_P.forageReach, baseCost: SIM_P.baseCost, reproE: SIM_P.reproE, grazeRate: SIM_P.grazeRate, scavRate: SIM_P.scavRate, fleeSpeed: SIM_P.fleeSpeed, mutRate: GENOME_P.mutRate };
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
function resetWorld() {   // semilla del input (vacío → aleatoria: el worker la elige y la devuelve en 'world' → seedVal). El mundo nuevo nace con lightMul=1 → re-aplica el lab.
  const sv = $('seed').value.trim();   // texto no numérico → el worker lo trata como aleatoria (+sv = NaN → no finito)
  worker.postMessage({ type: 'reset', seed: sv === '' ? null : sv, worldSize: +$('worldSize').value, seedCount: +$('seedCount').value, spawnSpread: +$('spawnSpread').value, diversity: +$('diversity').value });
  applyLab(); }
$('reset').addEventListener('click', resetWorld);
$('hide').addEventListener('click', () => document.body.classList.add('hidden-panel'));
$('show').addEventListener('click', () => document.body.classList.remove('hidden-panel'));
$('colorMode').addEventListener('change', (e) => { colorMode = e.target.value; buildLegend(); });
// Histograma: la UI elige el rasgo a distribuir → el worker lo binnea por oficio en cada foto. Envía el inicial (por si el navegador restauró otra opción).
$('geneTrait').addEventListener('change', (e) => worker.postMessage({ type: 'histTrait', key: e.target.value }));
worker.postMessage({ type: 'histTrait', key: $('geneTrait').value });

// LABORATORIO — sliders de leyes en vivo. Cada uno manda {set,key,value} al worker (mutación en caliente de SIM_P/mundo).
const LAB_DEF = { lightMul: 1, lightFlow: WORLD_P.lightFlow, vegGrowth: WORLD_P.vegGrowth, patchiness: WORLD_P.patchiness, grazeRefuge: SIM_P.grazeRefuge, forageReach: SIM_P.forageReach, baseCost: SIM_P.baseCost, reproE: SIM_P.reproE, grazeRate: SIM_P.grazeRate, scavRate: SIM_P.scavRate, fleeSpeed: SIM_P.fleeSpeed, mutRate: GENOME_P.mutRate };   // defaults del lab = config (para "restaurar valores")
const fmtLab = (k, v) => k === 'lightMul' ? v.toFixed(2) + '×' : (k === 'mutRate' || k === 'fleeSpeed') ? v.toFixed(1) + '×' : (k === 'reproE' || k === 'forageReach') ? v.toFixed(0) : k === 'lightFlow' ? (v * 10000).toFixed(1) : (k === 'grazeRate' || k === 'scavRate' || k === 'vegGrowth' || k === 'patchiness' || k === 'grazeRefuge') ? v.toFixed(2) : v.toFixed(3);
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
    natural: [['#7fb0d8', 'color = pigmento heredado (linaje)'], ['#e0a84a', 'segmentación = patrón de familia · brillo = energía']],
    natmix: [['#7fb0d8', 'pigmento heredado'], ['#e0a84a', '+ tinte sutil de tejido (función)'], ['#e0a84a', 'segmentación · brillo = energía']],
    tissue: [['#5a6b7a', 'estructura'], ['#e0664d', 'músculo'], ['#e0a84a', 'boca'], ['#9a7bd0', 'aura = color real (linaje)']],
    role: [['#3fb98f', 'herbívoro'], ['#e0664d', 'carnívoro'], ['#e0a84a', 'omnívoro'], ['#9a7bd0', 'aura = color real (linaje)'], ['#3fb98f', '(oficio por DIETA real)']],
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
