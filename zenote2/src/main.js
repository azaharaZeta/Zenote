// CLIENTE DE RENDER (UI P1). El MOTOR corre en un Web Worker (engine/worker.js); aquí solo se dibuja desde las "fotos"
// y se maneja la CÁMARA (zoom + paneo TOROIDAL infinito) + los controles del panel. La cámara no toca la sim (fluida).

import { TISSUE } from './engine/genome.js';

const worker = new Worker(new URL('./engine/worker.js', import.meta.url), { type: 'module' });
let WORLD = null, frame = null;
worker.onmessage = (e) => { const m = e.data; if (m.type === 'world') { WORLD = m; resetCamera(); } else if (m.type === 'frame') frame = m; };

const canvas = document.getElementById('world'), ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
let cw = 0, ch = 0, vignette = null; const dpr = Math.min(2, window.devicePixelRatio || 1);
function resize() {
  cw = canvas.clientWidth; ch = canvas.clientHeight; canvas.width = cw * dpr; canvas.height = ch * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
  g.addColorStop(0, 'rgba(5,8,13,0)'); g.addColorStop(1, 'rgba(2,4,8,0.7)'); vignette = g;
}
window.addEventListener('resize', resize); resize();

// --- Cámara + selección ---
let zoom = 1, camX = 0, camY = 0; const MINZ = 0.5, MAXZ = 16;
let selectedId = -1, following = false;   // inspector: serial del agente seleccionado + seguimiento de cámara
function resetCamera() { if (WORLD) { camX = WORLD.size / 2; camY = WORLD.size / 2; } }
const fitScale = () => WORLD ? Math.min(cw, ch) / WORLD.size : 1;
const scaleOf = () => fitScale() * zoom;
function wrap(v) { const S = WORLD.size; return ((v % S) + S) % S; }

const TCOL = [ '#5a6b7a', '#3fb98f', '#e0664d', '#e0a84a' ];   // STRUCTURE, PHOTO, MUSCLE, MOUTH (índice = tissue)
const RCOL = [ '#3fb98f', '#e0664d', '#e0a84a' ];              // rol: 0 autótrofo · 1 heterótrofo · 2 mixótrofo
const ROLE_TXT = [ 'autótrofo', 'heterótrofo', 'mixótrofo' ];
let colorMode = 'tissue';

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
  // GLOW (halos aditivos) por tile
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.10;
  for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) drawOrgs((tx * size - camX) * sc + cw / 2, (ty * size - camY) * sc + ch / 2, sc, t, true);
  // NÚCLEOS por tile
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) drawOrgs((tx * size - camX) * sc + cw / 2, (ty * size - camY) * sc + ch / 2, sc, t, false);

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
  const L0 = WORLD.light0, cols = WORLD.cols, rows = WORLD.rows, cell = WORLD.cellW, lb = WORLD.lightBase;
  let cx0 = Math.floor((-oX / sc) / cell), cx1 = Math.ceil((cw - oX) / sc / cell);
  let cy0 = Math.floor((-oY / sc) / cell), cy1 = Math.ceil((ch - oY) / sc / cell);
  cx0 = Math.max(0, cx0); cx1 = Math.min(cols - 1, cx1); cy0 = Math.max(0, cy0); cy1 = Math.min(rows - 1, cy1);
  const cs = cell * sc;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const L = L0[cy * cols + cx] / lb, b = (8 + L * 14) | 0;
    ctx.fillStyle = `rgb(${b - 2},${b + 4},${b + 10})`;
    ctx.fillRect(oX + cx * cs, oY + cy * cs, cs + 1, cs + 1);
  }
}

function drawOrgs(oX, oY, sc, t, halo) {
  const { n, ax, ay, ah, aspd, ahue, arole, partOff, partData } = frame;
  const mul = halo ? 2.4 : 1;
  for (let a = 0; a < n; a++) {
    const wx = ax[a], wy = ay[a], bx = oX + wx * sc, by = oY + wy * sc;
    if (bx < -40 || bx > cw + 40 || by < -40 || by > ch + 40) continue;   // culling en pantalla
    const h = ah[a], chh = Math.cos(h), shh = Math.sin(h), spd = aspd[a], p0 = partOff[a], p1 = partOff[a + 1];
    // color por agente (rol o linaje); en modo tejido es null → se colorea por parte
    const agentCol = colorMode === 'role' ? (RCOL[arole[a]] || '#3fb98f') : colorMode === 'lineage' ? `hsl(${(ahue[a] * 360) | 0},55%,58%)` : null;
    for (let k = p1 - 1; k >= p0; k--) {
      const lx = partData[k * 5], ly = partData[k * 5 + 1], r = partData[k * 5 + 2], tissue = partData[k * 5 + 3], ph = partData[k * 5 + 4];
      const uy = ly + (0.35 + spd * 2.2) * Math.sin(t * 5 + lx * 0.16 + ph);
      const px = oX + (wx + (lx * chh - uy * shh)) * sc, py = oY + (wy + (lx * shh + uy * chh)) * sc, pr = Math.max(1, r * sc * mul);
      ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.283);
      ctx.fillStyle = agentCol || TCOL[tissue] || '#5a6b7a';
      ctx.fill();
    }
  }
}

// --- HUD (fps render · t/s sim · pop · tick) + gráfica de población ---
let lastT = performance.now(), lastTick = 0, frames = 0, fps = 0, tpsReal = 0;
const pc = document.getElementById('popChart'), pctx = pc.getContext('2d');
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
function drawChart() {
  const w = pc.width, h = pc.height; pctx.clearRect(0, 0, w, h);
  const P = frame.histPop, A = frame.histAuto, H = frame.histHet; if (!P || P.length < 2) return;
  const n = P.length; let mx = 1; for (let i = 0; i < n; i++) if (P[i] > mx) mx = P[i];
  const X = (i) => i / (n - 1) * w, Y = (v) => h - v / mx * (h - 2) - 1;
  pctx.beginPath(); pctx.moveTo(0, h); for (let i = 0; i < n; i++) pctx.lineTo(X(i), Y(A[i])); pctx.lineTo(w, h); pctx.closePath(); pctx.fillStyle = 'rgba(63,185,143,.5)'; pctx.fill();   // autótrofo
  pctx.beginPath(); for (let i = 0; i < n; i++) { const x = X(i), y = Y(A[i] + H[i]); i ? pctx.lineTo(x, y) : pctx.moveTo(x, y); } for (let i = n - 1; i >= 0; i--) pctx.lineTo(X(i), Y(A[i])); pctx.closePath(); pctx.fillStyle = 'rgba(224,102,77,.55)'; pctx.fill();   // heterótrofo apilado
}

function loop() { draw(); requestAnimationFrame(loop); }
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
  setZoom(zoom * Math.exp(-e.deltaY * 0.0012));
  const sc1 = scaleOf(); camX = wrap(wx - (px - cw / 2) / sc1); camY = wrap(wy - (py - ch / 2) / sc1);
}, { passive: false });

// --- Panel: controles ---
const $ = (id) => document.getElementById(id);
function setZoom(z) { zoom = Math.max(MINZ, Math.min(MAXZ, z)); $('zoom').value = zoom.toFixed(1); $('zoomVal').textContent = zoom.toFixed(1) + '×'; }
$('zoom').addEventListener('input', (e) => setZoom(+e.target.value));
let running = true;
$('play').addEventListener('click', () => { running = !running; worker.postMessage({ type: 'running', value: running }); $('play').textContent = running ? '❚❚' : '▶'; });
$('tps').addEventListener('input', (e) => { const v = +e.target.value; worker.postMessage({ type: 'tps', value: v }); $('tpsVal').textContent = v + ' t/s'; });
$('max').addEventListener('click', () => { const on = !$('max').classList.contains('on'); $('max').classList.toggle('on', on); worker.postMessage({ type: 'maxSpeed', value: on }); });
$('reset').addEventListener('click', () => { worker.postMessage({ type: 'reset' }); applyLab(); });   // el mundo nuevo nace con lightMul=1 → re-aplica el lab
$('hide').addEventListener('click', () => document.body.classList.add('hidden-panel'));
$('show').addEventListener('click', () => document.body.classList.remove('hidden-panel'));
$('colorMode').addEventListener('change', (e) => { colorMode = e.target.value; buildLegend(); });

// LABORATORIO — sliders de leyes en vivo. Cada uno manda {set,key,value} al worker (mutación en caliente de SIM_P/mundo).
const LAB_DEF = { lightMul: 1, baseCost: 0.015, reproE: 16, photoEff: 0.05 };   // espejo de los valores de arranque del motor
const fmtLab = (k, v) => k === 'lightMul' ? v.toFixed(2) + '×' : k === 'reproE' ? v.toFixed(0) : v.toFixed(3);
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
    tissue: [['#3fb98f', 'fotosíntesis'], ['#e0664d', 'músculo'], ['#e0a84a', 'boca'], ['#5a6b7a', 'estructura']],
    role: [['#3fb98f', 'autótrofo'], ['#e0664d', 'heterótrofo'], ['#e0a84a', 'mixótrofo']],
    lineage: [['#e0664d', 'tono = linaje (color heredado, deriva lenta)']],
  };
  L.innerHTML = (sets[colorMode] || sets.tissue).map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
}
buildLegend();
$('tpsVal').textContent = $('tps').value + ' t/s'; $('zoomVal').textContent = (+$('zoom').value).toFixed(1) + '×';

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
