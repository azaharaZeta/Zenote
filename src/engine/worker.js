// Web Worker: AQUÍ vive y corre el motor (Sim). Envía al hilo principal una "foto"
// (snapshot) compacta por frame con lo que el render necesita, y recibe comandos
// (pausa, velocidad, reset, sliders de simulación, selección). El render dibuja en el
// hilo principal a partir de esas fotos. Así la simulación no compite con el render
// (60 fps fluidos) y sigue corriendo aunque la pestaña esté en segundo plano.

import { config } from '../config.js';
import { Sim } from './sim.js';
import { NUM_GENES, G, BRAIN0, FUNCTIONAL } from './genome.js';
const NF = FUNCTIONAL.length;   // nº de genes ecológicos que definen una especie

const M0 = G.m_app; // inicio del bloque de forma corporal (contiguo)
const NB = 22;      // bloque: 6 morfología + 3 segmentación + 8 módulos + 5 forma (estética)
const C0 = G.c_app; // índice del primer gen de ornamentación de color (2 consecutivos)
// Genes para dibujar los ojos (no consecutivos): inversión visual, campo, color, agresividad.
const G_SENSE = G.sense, G_FOV = G.e_fov, G_EYE = G.c_eye, G_AGGRO = G.aggro, G_ORN = G.orn;

const HIST_BINS = 24;
// Arranque con semilla ALEATORIA → un mundo distinto en cada carga. (config.pop.seed, p.ej. 123,
// queda como semilla "conocida buena" que puedes teclear en el campo Semilla para reproducirla.)
config.pop.seed = (Math.random() * 2147483647) >>> 0;
const sim = new Sim(config);

let running = true, maxSpeed = false, geneIdx = 0, selectedId = -1;
// Identidad del organismo seleccionado (para detectar su muerte aunque su slot se reutilice).
let selLineage = -1, selGeneration = -1, selSpeciesId = -1;
function setSelected(i) {
  selectedId = i;
  if (i >= 0) { selLineage = sim.lineage[i]; selGeneration = sim.generation[i]; selSpeciesId = speciesOf[i]; }
  else { selLineage = selGeneration = selSpeciesId = -1; }
}
function findSpeciesMember(sp) {           // un miembro vivo de la especie `sp` (o -1)
  if (sp < 0) return -1;
  const act = sim.active, n = sim.activeCount;
  for (let k = 0; k < n; k++) { const i = act[k]; if (speciesOf[i] === sp) return i; }
  return -1;
}
let tickAcc = 0, last = performance.now();

// --- ESPECIES: clustering por distancia genética (periódico, no cada tick). Cada especie es un
// "representante" (centroide del genoma); cada agente se asigna a la especie más cercana dentro del
// umbral, o funda una nueva. Los centroides siguen a sus miembros (k-means con umbral) → ids estables. ---
let speciesReps = [];                 // [{ id, gene:Float32Array(NG), count, sum }]
let nextSpeciesId = 1, speciesCount = 0, lastClassify = -1e9;
const speciesOf = new Float32Array(config.pop.maxAgents); // especie por id estable de agente
function classifySpecies() {
  const s = sim, act = s.active, n = s.activeCount, NG = NUM_GENES;
  const t = config.repro.speciesGenThreshold, thr2 = t * t;
  for (const r of speciesReps) { r.count = 0; r.sum.fill(0); }
  for (let k = 0; k < n; k++) {
    const i = act[k], base = i * NG;
    let best = null, bestD = thr2;
    for (let r = 0; r < speciesReps.length; r++) {
      const g = speciesReps[r].gene; let sum = 0;
      for (let f = 0; f < NF; f++) { const q = FUNCTIONAL[f]; const d = s.genes[base + q] - g[q]; sum += d * d; }
      const d2 = sum / NF;
      if (d2 < bestD) { bestD = d2; best = speciesReps[r]; }
    }
    if (!best) { // funda nueva especie
      const g = new Float32Array(NG); for (let q = 0; q < NG; q++) g[q] = s.genes[base + q];
      best = { id: nextSpeciesId++, gene: g, count: 0, sum: new Float32Array(NG) };
      speciesReps.push(best);
    }
    best.count++; const sm = best.sum; for (let q = 0; q < NG; q++) sm[q] += s.genes[base + q];
    speciesOf[i] = best.id;
  }
  speciesReps = speciesReps.filter(r => { // mueve el centroide al promedio de miembros; poda vacías
    if (r.count === 0) return false;
    const g = r.gene, sm = r.sum; for (let q = 0; q < NG; q++) g[q] = sm[q] / r.count;
    return true;
  });
  speciesCount = speciesReps.length;
}

// Navegar por ESPECIES (no individuos): salta a la especie anterior/siguiente (orden por id) y
// selecciona su ejemplar más TÍPICO (el más cercano al centroide del clúster = "espécimen tipo").
function pickSpecies(dir) {
  if (speciesReps.length === 0) return;
  const ids = speciesReps.map(r => r.id).sort((a, b) => a - b);
  const cur = (selectedId >= 0 && sim.alive[selectedId]) ? speciesOf[selectedId] : -1;
  const idx = ids.indexOf(cur);
  const target = idx < 0 ? ids[0] : ids[(idx + dir + ids.length) % ids.length];
  const rep = speciesReps.find(r => r.id === target);
  const act = sim.active, n = sim.activeCount, NG = NUM_GENES;
  let best = -1, bestD = Infinity;
  for (let k = 0; k < n; k++) {
    const i = act[k]; if (speciesOf[i] !== target) continue;
    let sum = 0; const base = i * NG, g = rep.gene;
    for (let f = 0; f < NF; f++) { const q = FUNCTIONAL[f]; const d = sim.genes[base + q] - g[q]; sum += d * d; }
    if (sum < bestD) { bestD = sum; best = i; }
  }
  if (best >= 0) setSelected(best);
}

// Campos ESTÁTICOS del mundo (cambian solo al reseed) → se envían aparte.
function postWorld() {
  const W = sim.world;
  postMessage({
    type: 'world', cols: W.cols, rows: W.rows, cellW: W.cellW, cellH: W.cellH,
    capacity: W.capacity.slice(), temp: W.temp.slice(), lightHue: W.lightHue.slice(),
  });
}

// Foto por frame: solo agentes vivos, compactados (índice 0..n-1).
function snapshot() {
  const s = sim, n = s.activeCount, act = s.active, NG = NUM_GENES;
  const x = new Float32Array(n), y = new Float32Array(n), radius = new Float32Array(n);
  const hue = new Float32Array(n), diet = new Float32Array(n), eFrac = new Float32Array(n);
  const lineage = new Float32Array(n), geneSel = new Float32Array(n);
  const heading = new Float32Array(n), spd = new Float32Array(n); // para orientar/animar el cuerpo
  const morph = new Float32Array(n * NB);                         // bloque de forma corporal/agente
  const tint = new Float32Array(n * 3);                           // color por partes (2) + ornamento (1)/agente
  const eye = new Float32Array(n * 4);                            // ojos: [sense, e_fov, c_eye, aggro]/agente
  const face = new Float32Array(n * 3);                           // [gazeX, gazeY, atkNorm]/agente (pupila + boca)
  const deco = new Float32Array(n * 8);                           // [b_aspect, c_lum, c_sat, o_len, o_bulb, o_hue, o_num, tex2]/agente
  const hT = config.combat.handlingTime || 1;
  const hist = new Float32Array(HIST_BINS);
  const species = new Float32Array(n);                            // especie (id) por agente
  let carn = 0;
  for (let k = 0; k < n; k++) {
    const i = act[k];
    x[k] = s.x[i]; y[k] = s.y[i]; radius[k] = s.radius[i];
    hue[k] = s.hue[i]; diet[k] = s.diet[i]; lineage[k] = s.lineage[i]; species[k] = speciesOf[i];
    let ef = s.E[i] / s.eMax[i]; eFrac[k] = ef < 0 ? 0 : ef > 1 ? 1 : ef;
    const gv = s.genes[i * NG + geneIdx]; geneSel[k] = gv;
    let b = (gv * HIST_BINS) | 0; if (b >= HIST_BINS) b = HIST_BINS - 1; else if (b < 0) b = 0;
    hist[b]++;
    if (s.diet[i] > 0.5) carn++;
    heading[k] = Math.atan2(s.vy[i], s.vx[i]);
    const v = Math.hypot(s.vx[i], s.vy[i]) / (s.vmax[i] || 1);
    spd[k] = v > 1 ? 1 : v;
    const mb = i * NG + M0, kb = k * NB;
    for (let q = 0; q < NB; q++) morph[kb + q] = s.genes[mb + q];
    const cb = i * NG + C0, tb = k * 3;
    tint[tb] = s.genes[cb]; tint[tb + 1] = s.genes[cb + 1]; tint[tb + 2] = s.genes[i * NG + G_ORN];
    const ib = i * NG, eb = k * 4;
    eye[eb] = s.genes[ib + G_SENSE]; eye[eb + 1] = s.genes[ib + G_FOV];
    eye[eb + 2] = s.genes[ib + G_EYE]; eye[eb + 3] = s.genes[ib + G_AGGRO];
    const db = k * 8;
    deco[db] = s.genes[ib + G.b_aspect]; deco[db + 1] = s.genes[ib + G.c_lum]; deco[db + 2] = s.genes[ib + G.c_sat];
    deco[db + 3] = s.genes[ib + G.o_len]; deco[db + 4] = s.genes[ib + G.o_bulb]; deco[db + 5] = s.genes[ib + G.o_hue]; deco[db + 6] = s.genes[ib + G.o_num];
    deco[db + 7] = s.genes[ib + G.tex2];
    const fb = k * 3;
    face[fb] = s.gazeX[i]; face[fb + 1] = s.gazeY[i];
    let atk = s.attackCD[i] / hT; face[fb + 2] = atk > 1 ? 1 : atk; // recencia de ataque (boca/fogonazo)
  }
  // Si el seleccionado MURIÓ (o su slot se reutilizó por otro distinto), seguir a otro miembro de SU
  // especie (seguir observando la especie); si la especie se extinguió, deseleccionar.
  if (selectedId >= 0) {
    const same = s.alive[selectedId] && s.lineage[selectedId] === selLineage && s.generation[selectedId] === selGeneration;
    if (!same) setSelected(findSpeciesMember(selSpeciesId));
    else selSpeciesId = speciesOf[selectedId];
  }
  // Organismo seleccionado (inspector + resalte): datos completos por id estable.
  let sel = null;
  if (selectedId >= 0 && s.alive[selectedId]) {
    const i = selectedId, g = new Float32Array(NG);
    for (let q = 0; q < NG; q++) g[q] = s.genes[i * NG + q];
    const sIds = speciesReps.map(r => r.id).sort((a, b) => a - b); // posición de la especie (navegación)
    const vsp = Math.hypot(s.vx[i], s.vy[i]) / (s.vmax[i] || 1);
    sel = {
      x: s.x[i], y: s.y[i], radius: s.radius[i], hue: s.hue[i], genes: g,
      E: s.E[i], eMax: s.eMax[i], age: s.age[i], lineage: s.lineage[i], generation: s.generation[i],
      species: speciesOf[i], diet: s.diet[i],
      speciesIdx: sIds.indexOf(speciesOf[i]), speciesTotal: sIds.length,
      speciesMembers: (speciesReps.find(r => r.id === speciesOf[i]) || { count: 0 }).count, // nº de individuos de esta especie

      heading: Math.atan2(s.vy[i], s.vx[i]), spd: vsp > 1 ? 1 : vsp,   // para que el retrato oriente/ondule IGUAL que en el mundo
    };
  }
  postMessage({
    type: 'frame', n, tick: s.tick, pop: s.popCount, births: s.births, deaths: s.deaths, carn,
    x, y, radius, hue, diet, eFrac, lineage, geneSel, heading, spd, morph, tint, eye, face, deco, hist, sel,
    species, speciesCount,
    resource: s.world.resource.slice(),
  });
}

function loop() {
  const now = performance.now();
  let dt = (now - last) / 1000; if (dt > 0.1) dt = 0.1; last = now;
  if (running) {
    const start = performance.now();
    if (maxSpeed) {
      while (performance.now() - start < config.sim.maxBudgetMs) sim.step();
      tickAcc = 0;
    } else {
      tickAcc += config.sim.targetTPS * dt;
      while (tickAcc >= 1) {
        sim.step();
        tickAcc -= 1;
        if (performance.now() - start > config.sim.frameBudgetMs) { tickAcc = 0; break; }
      }
    }
  } else tickAcc = 0;
  if (sim.tick - lastClassify >= 60) { classifySpecies(); lastClassify = sim.tick; } // especies (periódico)
  snapshot();
  setTimeout(loop, 16); // ~60 Hz de fotos (independiente del render del hilo principal)
}

function setPath(o, path, v) {
  const ks = path.split('.'); let t = o;
  for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]];
  t[ks[ks.length - 1]] = v;
}

function pick(wx, wy) {
  const s = sim, act = s.active, n = s.activeCount, ww = config.world.width, wh = config.world.height;
  let best = -1, bd = 1e9;
  for (let k = 0; k < n; k++) {
    const i = act[k];
    let dx = s.x[i] - wx, dy = s.y[i] - wy;
    if (config.world.wrap) {
      if (dx > ww * 0.5) dx -= ww; else if (dx < -ww * 0.5) dx += ww;
      if (dy > wh * 0.5) dy -= wh; else if (dy < -wh * 0.5) dy += wh;
    }
    const d = dx * dx + dy * dy, r = s.radius[i] + 6;
    if (d < bd && d < r * r) { bd = d; best = i; }
  }
  return best;
}

onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'running': running = m.value; break;
    case 'maxSpeed': maxSpeed = m.value; break;
    case 'tps': config.sim.targetTPS = m.value; break;
    case 'set': setPath(config, m.key, m.value); break;
    case 'gene': geneIdx = m.index; break;
    case 'brain': config.sim.brain = m.value; break; // 'reactive' | 'neural'
    case 'pick': setSelected(pick(m.wx, m.wy)); break;
    case 'deselect': setSelected(-1); break;       // cerrar la vista de especie (botón ✕ del inspector)
    case 'pickSpecies': pickSpecies(m.dir); break; // navegar por especies (◀ ▶ en el inspector)
    case 'reset': config.pop.seed = m.seed; sim.reset(m.seed); selectedId = -1; selLineage = selGeneration = selSpeciesId = -1;
      speciesReps = []; nextSpeciesId = 1; lastClassify = -1e9; speciesCount = 0; postWorld(); break;
  }
};

postWorld();
loop();
