// M5.6 — WEB WORKER (motor). Aquí corre el motor (World+Sim) en un hilo APARTE del render. Por frame envía al hilo
// principal una "foto" compacta (posiciones + heading + cuerpos APLANADos en typed arrays transferibles) y recibe
// comandos (reset/pausa). Así la simulación no compite con el render (arquitectura objetivo del rediseño).

import { World, WORLD_P } from './world.js';
import { Sim, SIM_P } from './sim.js';
import { GENOME_P } from './genome.js';   // para el ritmo de mutación (parámetro de UI en vivo)
import { trophicCode } from './phenotype.js';   // M3: única definición del oficio trófico (compartida con tests/scorecard)

let worldSize = 1500, seedCount = 800;   // parámetros de ARRANQUE (necesitan reinicio); se actualizan en init()
let world, sim, running = true, tps = 60, maxSpeed = false;
let selectedId = -1;   // serial del agente inspeccionado (-1 = ninguno); su detalle EN VIVO viaja en cada foto
// historiales para las gráficas (muestreados por ticks; ventana acotada). Población = valor absoluto. Nacimientos y
// muertes = DELTA por ventana (un ritmo), de contadores ACUMULADOS del motor → guardamos su último valor para restar.
const HIST_W = 160, HIST_EVERY = 60; const histPop = [], histAuto = [], histHet = []; let lastHist = -1e9;
const histSexB = [], histAsexB = [], histPred = [], histStarv = [];   // nacimientos sexual/asexual · muertes predación/inanición (por ventana)
let lastSexB = 0, lastAsexB = 0, lastKills = 0, lastStarved = 0;

function init({ seed, worldSize: ws, seedCount: sc } = {}) {
  // Parámetros de ARRANQUE: tamaño del mundo y cantidad de sembrado (necesitan reinicio). Se conservan entre resets.
  if (Number.isFinite(+ws) && +ws > 0) worldSize = +ws | 0;
  if (Number.isFinite(+sc) && +sc > 0) seedCount = +sc | 0;
  // B5: semilla opcional (reproducibilidad). null/no-finito → aleatoria. La MISMA semilla alimenta mundo y población
  // → el motor es determinista (mismo seed → mismo mundo). Se devuelve abajo para que la UI la muestre.
  const sd = (seed == null || !Number.isFinite(+seed)) ? (Math.random() * 1e9) | 0 : (+seed | 0);
  world = new World(worldSize, sd, { ...WORLD_P, lightBase: 2.5 });
  world.nutrient.fill(1.5);
  sim = new Sim(world, { seed: sd, cap: 12000 });
  sim.seed(seedCount);
  selectedId = -1;   // el mundo nuevo no tiene al agente inspeccionado
  histPop.length = 0; histAuto.length = 0; histHet.length = 0; lastHist = -1e9;   // historiales limpios al (re)iniciar
  histSexB.length = 0; histAsexB.length = 0; histPred.length = 0; histStarv.length = 0; lastSexB = lastAsexB = lastKills = lastStarved = 0;
  // campos ESTÁTICOS del mundo (cambian solo al reset) → se envían aparte. seed: la usada (para mostrarla en la UI).
  postMessage({ type: 'world', cols: world.cols, rows: world.rows, cellW: world.cellW, size: worldSize, lightBase: world.P.lightBase, light0: world.light0.slice(), seed: sd });
}

// Foto por frame: solo vivos, cuerpos aplanados (offset + [lx,ly,r,tissue] por parte). Transferible (cero copia).
function snapshot() {
  const s = sim, idx = []; let totalParts = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i] && s.body[i]) { idx.push(i); totalParts += s.body[i].length; }
  const n = idx.length;
  // partData = [lx, ly, r, tissue, phase, aspect, dir] por nodo (stride 7): aspect+dir → siluetas orientadas en el render.
  // aE = energía normalizada [0,1] por agente (E/reproE) → el render atenúa a los hambrientos ("la muerte se ve venir").
  const ax = new Float32Array(n), ay = new Float32Array(n), ah = new Float32Array(n), aspd = new Float32Array(n), ahue = new Float32Array(n), aE = new Float32Array(n), arole = new Uint8Array(n), aid = new Int32Array(n), partOff = new Int32Array(n + 1), partData = new Float32Array(totalParts * 7);
  let po = 0, nAuto = 0, nHet = 0, detail = null;
  for (let a = 0; a < n; a++) {
    const i = idx[a]; ax[a] = s.x[i]; ay[a] = s.y[i]; ahue[a] = s.genome[i].hue; aid[a] = s.serial[i];
    aE[a] = Math.min(1, Math.max(0, s.E[i] / SIM_P.reproE));   // vitalidad para el render (atenúa hambrientos)
    const vx = s.vx[i], vy = s.vy[i], sp = Math.sqrt(vx * vx + vy * vy); ah[a] = sp > 1e-3 ? Math.atan2(vy, vx) : 0;
    aspd[a] = sp / 3 > 1 ? 1 : sp / 3;   // velocidad normalizada → amplitud de ondulación del render
    // oficio trófico per-agente (para colorear por rol): 0 autótrofo · 1 heterótrofo · 2 mixótrofo
    const photo = s.photoCap[i];
    arole[a] = trophicCode(photo, s.thrust[i], s.mouthCap[i]);
    if (arole[a] === 0) nAuto++; else nHet++;
    partOff[a] = po; const body = s.body[i];
    let rad = 0;
    for (let k = 0; k < body.length; k++) { const p = body[k]; const o = po * 7; partData[o] = p.x; partData[o + 1] = p.y; partData[o + 2] = p.r; partData[o + 3] = p.tissue; partData[o + 4] = p.phase; partData[o + 5] = p.aspect; partData[o + 6] = p.dir; po++;
      const d = Math.hypot(p.x, p.y) + p.r; if (d > rad) rad = d; }
    // detalle EN VIVO del agente inspeccionado (si sigue vivo): stats fisiológicos + morfológicos para el inspector
    if (s.serial[i] === selectedId) detail = { id: selectedId, role: arole[a], E: s.E[i], reproE: SIM_P.reproE, gut: s.gut[i],
      mass: s.mass[i], photoCap: photo, mouthCap: s.mouthCap[i], vmax: s.vmax[i], age: s.age[i], nParts: body.length, hue: s.genome[i].hue, x: s.x[i], y: s.y[i], rad };
  }
  partOff[n] = po;
  if (s.tick - lastHist >= HIST_EVERY) { lastHist = s.tick; histPop.push(n); histAuto.push(nAuto); histHet.push(nHet);
    // ritmos por ventana: delta de los contadores acumulados desde el último muestreo
    histSexB.push(s.sexBirths - lastSexB); histAsexB.push(s.asexBirths - lastAsexB); histPred.push(s.kills - lastKills); histStarv.push(s.starved - lastStarved);
    lastSexB = s.sexBirths; lastAsexB = s.asexBirths; lastKills = s.kills; lastStarved = s.starved;
    if (histPop.length > HIST_W) { histPop.shift(); histAuto.shift(); histHet.shift(); histSexB.shift(); histAsexB.shift(); histPred.shift(); histStarv.shift(); } }
  // detail = null si no hay selección O si el agente seleccionado ya murió (el cliente lo detecta: selectedId set pero detail null)
  postMessage({ type: 'frame', tick: s.tick, pop: n, n, ax, ay, ah, aspd, ahue, aE, arole, aid, partOff, partData, histPop, histAuto, histHet, histSexB, histAsexB, histPred, histStarv, sel: selectedId, detail },
    [ax.buffer, ay.buffer, ah.buffer, aspd.buffer, ahue.buffer, aE.buffer, arole.buffer, aid.buffer, partOff.buffer, partData.buffer]);
}

// Ritmo de simulación por ACUMULADOR temporal: cada loop ejecuta `tps × tiempo transcurrido` pasos (con la fracción
// arrastrada) → el t/s real sigue al slider con fidelidad. Antes se hacía `round(tps/30)` pasos/loop, que (a) cuantizaba
// a múltiplos de 30 → se pasaba (50→60) y (b) con `max(1,…)` nunca bajaba de ~30 → tps=0 NO paraba. Ahora tps=0 = parado.
let acc = 0, lastLoopT = performance.now();
const MAX_SNAP_MS = 250;   // en MÁX: un fotograma cada ~250 ms (≈4 fps). Se SACRIFICAN fps para dar casi todo el tiempo a
                           // la simulación; el lote (≤250 ms) garantiza ≥1 fps (el mínimo pedido) aun con la pop al tope.
function loop() {
  const now = performance.now();
  if (running && maxSpeed) {
    // MÁX: simula EN LOTE hasta que toque el próximo fotograma → t/s máximo y el render no roba tiempo (un solo snapshot
    // por lote, no uno por iteración). fps sacrificado a ~4, con suelo ≥1 fps; re-lanza ya (el lote marca el ritmo).
    const stepUntil = now + MAX_SNAP_MS;
    do { sim.step(); } while (performance.now() < stepUntil);
    acc = 0; lastLoopT = now;
    snapshot();
    setTimeout(loop, 0);
    return;
  }
  if (running && tps > 0) {
    acc += tps * (now - lastLoopT) / 1000;                            // ticks adeudados desde el último loop
    const budgetEnd = now + 28;                                       // tope de cómputo por frame (deja ~5 ms para snapshot)
    while (acc >= 1) { if (performance.now() >= budgetEnd) { acc = 0; break; } sim.step(); acc -= 1; }   // si no se alcanza el ritmo → se descartan (sin spiral de deuda)
  } else {
    acc = 0;                                                          // PAUSADO o tps=0: el mundo NO avanza
  }
  lastLoopT = now;
  snapshot();
  setTimeout(loop, 33);
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'reset') init(m);   // reset con seed + parámetros de arranque (worldSize, seedCount) opcionales
  else if (m.type === 'running') running = m.value;
  else if (m.type === 'tps') tps = m.value;
  else if (m.type === 'maxSpeed') maxSpeed = m.value;
  // LABORATORIO (en vivo): ajusta una ley del mundo o del metabolismo sin reiniciar. lightMul vive en el mundo; mutRate
  // en GENOME_P; el resto son campos de SIM_P (step()/mutate() los leen por referencia → el cambio surte efecto al instante).
  else if (m.type === 'set') { if (m.key === 'lightMul') world.lightMul = m.value; else if (m.key === 'mutRate') GENOME_P.mutRate = m.value; else if (m.key in SIM_P) SIM_P[m.key] = m.value; }
  else if (m.type === 'inspect') selectedId = m.id;     // inspector: fijar agente a seguir en vivo
  else if (m.type === 'deselect') selectedId = -1;
  else if (m.type === 'burst') { for (let k = 0; k < (m.n || 0); k++) sim.step(); snapshot(); }   // avance forzado (depuración/preview)
};

init();
loop();
