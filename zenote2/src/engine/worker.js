// M5.6 — WEB WORKER (motor). Aquí corre el motor (World+Sim) en un hilo APARTE del render. Por frame envía al hilo
// principal una "foto" compacta (posiciones + heading + cuerpos APLANADos en typed arrays transferibles) y recibe
// comandos (reset/pausa). Así la simulación no compite con el render (arquitectura objetivo del rediseño).

import { World, WORLD_P } from './world.js';
import { Sim, SIM_P } from './sim.js';

const SIZE = 1500;
let world, sim, running = true, tps = 60, maxSpeed = false;
let selectedId = -1;   // serial del agente inspeccionado (-1 = ninguno); su detalle EN VIVO viaja en cada foto
// historial para la gráfica de población (muestreado por ticks; ventana acotada): total · autótrofos · heterótrofos
const HIST_W = 160, HIST_EVERY = 60; const histPop = [], histAuto = [], histHet = []; let lastHist = -1e9;

function init() {
  world = new World(SIZE, (Math.random() * 1e9) | 0, { ...WORLD_P, lightBase: 2.5 });
  world.nutrient.fill(1.5);
  sim = new Sim(world, { seed: (Math.random() * 1e9) | 0, cap: 12000 });
  sim.seed(800);
  selectedId = -1;   // el mundo nuevo no tiene al agente inspeccionado
  histPop.length = 0; histAuto.length = 0; histHet.length = 0; lastHist = -1e9;   // historial limpio al (re)iniciar
  // campos ESTÁTICOS del mundo (cambian solo al reset) → se envían aparte
  postMessage({ type: 'world', cols: world.cols, rows: world.rows, cellW: world.cellW, size: SIZE, lightBase: world.P.lightBase, light0: world.light0.slice() });
}

// Foto por frame: solo vivos, cuerpos aplanados (offset + [lx,ly,r,tissue] por parte). Transferible (cero copia).
function snapshot() {
  const s = sim, idx = []; let totalParts = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i] && s.body[i]) { idx.push(i); totalParts += s.body[i].length; }
  const n = idx.length;
  const ax = new Float32Array(n), ay = new Float32Array(n), ah = new Float32Array(n), aspd = new Float32Array(n), ahue = new Float32Array(n), arole = new Uint8Array(n), aid = new Int32Array(n), partOff = new Int32Array(n + 1), partData = new Float32Array(totalParts * 5);
  let po = 0, nAuto = 0, nHet = 0, detail = null;
  for (let a = 0; a < n; a++) {
    const i = idx[a]; ax[a] = s.x[i]; ay[a] = s.y[i]; ahue[a] = s.genome[i].hue; aid[a] = s.serial[i];
    const vx = s.vx[i], vy = s.vy[i], sp = Math.sqrt(vx * vx + vy * vy); ah[a] = sp > 1e-3 ? Math.atan2(vy, vx) : 0;
    aspd[a] = sp / 3 > 1 ? 1 : sp / 3;   // velocidad normalizada → amplitud de ondulación del render
    // oficio trófico per-agente (para colorear por rol): 0 autótrofo · 1 heterótrofo · 2 mixótrofo
    const photo = s.photoCap[i], het = s.mouthCap[i] * 3;
    arole[a] = photo > het * 1.5 ? 0 : het > photo * 1.5 ? 1 : 2;
    if (arole[a] === 0) nAuto++; else nHet++;
    partOff[a] = po; const body = s.body[i];
    let rad = 0;
    for (let k = 0; k < body.length; k++) { const p = body[k]; partData[po * 5] = p.x; partData[po * 5 + 1] = p.y; partData[po * 5 + 2] = p.r; partData[po * 5 + 3] = p.tissue; partData[po * 5 + 4] = p.phase; po++;
      const d = Math.hypot(p.x, p.y) + p.r; if (d > rad) rad = d; }
    // detalle EN VIVO del agente inspeccionado (si sigue vivo): stats fisiológicos + morfológicos para el inspector
    if (s.serial[i] === selectedId) detail = { id: selectedId, role: arole[a], E: s.E[i], reproE: SIM_P.reproE, gut: s.gut[i],
      mass: s.mass[i], photoCap: photo, mouthCap: s.mouthCap[i], vmax: s.vmax[i], age: s.age[i], nParts: body.length, hue: s.genome[i].hue, x: s.x[i], y: s.y[i], rad };
  }
  partOff[n] = po;
  if (s.tick - lastHist >= HIST_EVERY) { lastHist = s.tick; histPop.push(n); histAuto.push(nAuto); histHet.push(nHet);
    if (histPop.length > HIST_W) { histPop.shift(); histAuto.shift(); histHet.shift(); } }
  // detail = null si no hay selección O si el agente seleccionado ya murió (el cliente lo detecta: selectedId set pero detail null)
  postMessage({ type: 'frame', tick: s.tick, pop: n, n, ax, ay, ah, aspd, ahue, arole, aid, partOff, partData, histPop, histAuto, histHet, sel: selectedId, detail },
    [ax.buffer, ay.buffer, ah.buffer, aspd.buffer, ahue.buffer, arole.buffer, aid.buffer, partOff.buffer, partData.buffer]);
}

function loop() {
  if (running) {
    if (maxSpeed) { const t0 = performance.now(); while (performance.now() - t0 < 24) sim.step(); }   // máx: tantos ticks como quepan
    else { let n = Math.max(1, Math.round(tps / 30)); const t0 = performance.now(); while (n-- > 0 && performance.now() - t0 < 28) sim.step(); }   // tps objetivo (~30 fotos/s)
  }
  snapshot();
  setTimeout(loop, 33);
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'reset') init();
  else if (m.type === 'running') running = m.value;
  else if (m.type === 'tps') tps = m.value;
  else if (m.type === 'maxSpeed') maxSpeed = m.value;
  // LABORATORIO (en vivo): ajusta una ley del mundo o del metabolismo sin reiniciar. lightMul vive en el mundo;
  // el resto son campos de SIM_P (step() los lee por referencia cada tick → el cambio surte efecto al instante).
  else if (m.type === 'set') { if (m.key === 'lightMul') world.lightMul = m.value; else if (m.key in SIM_P) SIM_P[m.key] = m.value; }
  else if (m.type === 'inspect') selectedId = m.id;     // inspector: fijar agente a seguir en vivo
  else if (m.type === 'deselect') selectedId = -1;
  else if (m.type === 'burst') { for (let k = 0; k < (m.n || 0); k++) sim.step(); snapshot(); }   // avance forzado (depuración/preview)
};

init();
loop();
