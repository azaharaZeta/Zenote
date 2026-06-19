// M5.6 — WEB WORKER (motor). Aquí corre el motor (World+Sim) en un hilo APARTE del render. Por frame envía al hilo
// principal una "foto" compacta (posiciones + heading + cuerpos APLANADos en typed arrays transferibles) y recibe
// comandos (reset/pausa). Así la simulación no compite con el render (arquitectura objetivo del rediseño).

import { World, WORLD_P } from './world.js';
import { Sim } from './sim.js';

const SIZE = 1500;
let world, sim, running = true;

function init() {
  world = new World(SIZE, (Math.random() * 1e9) | 0, { ...WORLD_P, lightBase: 2.5 });
  world.nutrient.fill(1.5);
  sim = new Sim(world, { seed: (Math.random() * 1e9) | 0, cap: 12000 });
  sim.seed(800);
  // campos ESTÁTICOS del mundo (cambian solo al reset) → se envían aparte
  postMessage({ type: 'world', cols: world.cols, rows: world.rows, cellW: world.cellW, size: SIZE, lightBase: world.P.lightBase, light0: world.light0.slice() });
}

// Foto por frame: solo vivos, cuerpos aplanados (offset + [lx,ly,r,tissue] por parte). Transferible (cero copia).
function snapshot() {
  const s = sim, idx = []; let totalParts = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i] && s.body[i]) { idx.push(i); totalParts += s.body[i].length; }
  const n = idx.length;
  const ax = new Float32Array(n), ay = new Float32Array(n), ah = new Float32Array(n), partOff = new Int32Array(n + 1), partData = new Float32Array(totalParts * 4);
  let po = 0;
  for (let a = 0; a < n; a++) {
    const i = idx[a]; ax[a] = s.x[i]; ay[a] = s.y[i];
    const vx = s.vx[i], vy = s.vy[i], sp = Math.sqrt(vx * vx + vy * vy); ah[a] = sp > 1e-3 ? Math.atan2(vy, vx) : 0;
    partOff[a] = po; const body = s.body[i];
    for (let k = 0; k < body.length; k++) { const p = body[k]; partData[po * 4] = p.x; partData[po * 4 + 1] = p.y; partData[po * 4 + 2] = p.r; partData[po * 4 + 3] = p.tissue; po++; }
  }
  partOff[n] = po;
  postMessage({ type: 'frame', tick: s.tick, pop: n, n, ax, ay, ah, partOff, partData },
    [ax.buffer, ay.buffer, ah.buffer, partOff.buffer, partData.buffer]);
}

function loop() {
  if (running) sim.step();   // ~30 t/s (calmado, contemplativo); el motor no depende del render
  snapshot();
  setTimeout(loop, 33);
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'reset') init();
  else if (m.type === 'running') running = m.value;
  else if (m.type === 'burst') { for (let k = 0; k < (m.n || 0); k++) sim.step(); snapshot(); }   // avance forzado (depuración/preview)
};

init();
loop();
