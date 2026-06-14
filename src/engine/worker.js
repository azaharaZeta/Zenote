// Web Worker: AQUÍ vive y corre el motor (Sim). Envía al hilo principal una "foto"
// (snapshot) compacta por frame con lo que el render necesita, y recibe comandos
// (pausa, velocidad, reset, sliders de simulación, selección). El render dibuja en el
// hilo principal a partir de esas fotos. Así la simulación no compite con el render
// (60 fps fluidos) y sigue corriendo aunque la pestaña esté en segundo plano.

import { config } from '../config.js';
import { Sim } from './sim.js';
import { NUM_GENES, G, FUNCTIONAL, NODE0, NODE_COUNT, NODE_STRIDE } from './genome.js';
import { trophicRole } from './organism.js';   // clasificación trófica ÚNICA (curva de población + color 'role')
const NF = FUNCTIONAL.length;   // nº de genes ecológicos que definen una especie

const NODEB = NODE_COUNT * NODE_STRIDE; // bloque de genes de NODO (contiguo desde NODE0): la FORMA, para el render por grafo
// Genes para dibujar los ojos (no consecutivos): inversión visual, campo, color. (El "ceño" = impulso de
// ataque del cerebro, dinámico → s.atkDrive, no un gen.)
const G_SENSE = G.sense, G_FOV = G.e_fov, G_EYE = G.c_eye, G_ORN = G.orn;

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
// ¿hay una foto NUEVA que postear? A targetTPS < 60, la mayoría de los ~60 loops/s no avanzan ningún tick → su
// snapshot sería IDÉNTICO al anterior (y el hilo principal ya lo descarta por "dibujado bajo demanda"). Evitamos
// generarlo y clonarlo (postMessage) salvo que la sim avance un tick o llegue un comando de UI que cambie lo mostrado.
let needSnap = true;

// --- ESPECIES: clustering por distancia genética (periódico, no cada tick). Cada especie es un
// "representante" (centroide del genoma); cada agente se asigna a la especie más cercana dentro del
// umbral, o funda una nueva. Los centroides siguen a sus miembros (k-means con umbral) → ids estables. ---
let speciesReps = [];                 // [{ id, gene:Float32Array(NG), count, sum }]
let nextSpeciesId = 1, speciesCount = 0, lastClassify = -1e9;
let speciesOf = new Float32Array(config.pop.maxAgents); // especie por id estable de agente (se re-asigna en 'reset' si cambia maxAgents)

// ---- Histórico para las gráficas: muestreado por TICKS DE SIMULACIÓN (no por frames de reloj) → la curva
// es correcta y densa a CUALQUIER velocidad (a máx. velocidad un frame avanza cientos de ticks; si se
// muestreara por frame, saldrían 4-5 puntos y la curva se vería rota). El worker ve cada tick, así que aquí
// el muestreo es fiel. HIST_WINDOW debe coincidir con charts.windowTicks. ----
const HIST_K = 40, HIST_WINDOW = 4800;
const histPop = [], histCarn = [], histScav = [], histVegFill = [], histTick = [];
const histN = [], histVegMass = [], histBio = [], histCarrion = [];   // pecera cerrada: pools de MATERIA por muestra (nutriente libre N · vegetación en pie · organismos vivos · carroña)
const histHerb = [], histOmni = [];   // desglose por dieta: herbívoros (<0.4) / omnívoros (0.4–0.6) / comecarne (>0.6),
                                      // y los comecarne se parten en CAZADORES (histCarn) y CARROÑEROS (histScav) por effScav>effHunt.
const histDC = [], histDS = [], histDA = [], histDE = [], histBS = [], histBA = [];   // demografía por ventana: muertes combate/hambre/vejez/cazado + nacimientos sexual/asexual
let lastHistTick = -1e9, histLastCD = { starv: 0, combat: 0, age: 0, eaten: 0, sexual: 0, asexual: 0 };
function sampleHistory() {
  const s = sim, act = s.active, n = s.activeCount; let carn = 0, scav = 0, herb = 0, omni = 0;
  for (let k = 0; k < n; k++) { const i = act[k];
    const ro = trophicRole(s.diet[i], s.effHunt[i], s.effScav[i]);          // MISMA función que el color 'role' (fuente única)
    if (ro === 2) carn++; else if (ro === 1) scav++; else if (ro === 3) omni++; else herb++; }
  // POOLS DE MATERIA (pecera cerrada): un solo barrido del recurso/carroña da DOS métricas distintas de la vegetación —
  // el LLENADO (histVegFill = sr/sc, fracción de la capacidad ocupada por pasto vivo, 0-1 → leyenda "pasto %") y la
  // BIOMASA vegetal (histVegMass = sr·epu, su materia → leyenda "vegetación %") — más la CARROÑA (Σcarrion, ya en
  // unidades de materia). ORGANISMOS = Σ(E almacenada + cuerpo). Con el
  // nutriente libre N, los cuatro suman matterBudget (conservación) → la curva de biomasa reparte ese total. En
  // mundo ABIERTO también se calculan y se muestran: N=0 y el total NO se conserva (el sol crea materia → crece),
  // lo que permite comparar desde la UI el comportamiento de la biomasa con y sin pecera.
  const res = s.world.resource, cap = s.world.capacity, car = s.world.carrion; let sr = 0, sc = 0, scar = 0;
  for (let c = 0; c < res.length; c++) { sr += res[c]; sc += cap[c]; scar += car[c]; }
  let bio = 0; for (let k = 0; k < n; k++) bio += s.E[act[k]] + s.bodyMatter[act[k]];
  const epu = config.resource.energyPerUnit;
  histPop.push(s.popCount); histCarn.push(carn); histScav.push(scav); histHerb.push(herb); histOmni.push(omni);
  histVegFill.push(sc > 0 ? sr / sc : 0);
  histN.push(s.world.totalN()); histVegMass.push(sr * epu); histBio.push(bio); histCarrion.push(scar); histTick.push(s.tick);
  const cd = s.deathCause, bc = s.birthCount, L = histLastCD;
  histDC.push(Math.max(0, cd.combat - L.combat)); histDS.push(Math.max(0, cd.starv - L.starv));
  histDA.push(Math.max(0, cd.age - L.age)); histDE.push(Math.max(0, cd.eaten - L.eaten));
  histBS.push(Math.max(0, bc.sexual - L.sexual)); histBA.push(Math.max(0, bc.asexual - L.asexual));
  histLastCD = { starv: cd.starv, combat: cd.combat, age: cd.age, eaten: cd.eaten, sexual: bc.sexual, asexual: bc.asexual };
  const t0 = s.tick - HIST_WINDOW;
  while (histTick.length > 1 && histTick[0] < t0) {
    histPop.shift(); histCarn.shift(); histScav.shift(); histHerb.shift(); histOmni.shift(); histVegFill.shift(); histTick.shift();
    histN.shift(); histVegMass.shift(); histBio.shift(); histCarrion.shift();
    histDC.shift(); histDS.shift(); histDA.shift(); histDE.shift(); histBS.shift(); histBA.shift();
  }
}
function clearHistory() {
  for (const a of [histPop, histCarn, histScav, histHerb, histOmni, histVegFill, histTick, histN, histVegMass, histBio, histCarrion, histDC, histDS, histDA, histDE, histBS, histBA]) a.length = 0;
  lastHistTick = -1e9; histLastCD = { starv: 0, combat: 0, age: 0, eaten: 0, sexual: 0, asexual: 0 };
}
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
    capacity: W.capacity.slice(), temp: W.temp.slice(),
  });
}

// Foto por frame: solo agentes vivos, compactados (índice 0..n-1).
function snapshot() {
  const s = sim, n = s.activeCount, act = s.active, NG = NUM_GENES;
  const x = new Float32Array(n), y = new Float32Array(n), radius = new Float32Array(n);
  const hue = new Float32Array(n), diet = new Float32Array(n), eFrac = new Float32Array(n);
  const lineage = new Float32Array(n), geneSel = new Float32Array(n);
  const heading = new Float32Array(n), spd = new Float32Array(n); // para orientar/animar el cuerpo
  const tint = new Float32Array(n * 1);                           // [orn]/agente (gatea el señuelo) — #13: c_app/c_tip retirados
  const eye = new Float32Array(n * 4);                            // ojos: [sense, e_fov, c_eye, atkDrive]/agente
  const face = new Float32Array(n * 3);                           // [gazeX, gazeY, atkNorm]/agente (pupila + boca)
  const deco = new Float32Array(n * 7);                           // [c_lum, c_sat, o_len, o_bulb, o_hue, o_num, tex2]/agente (#13: sin slot muerto b_aspect)
  const nodes = new Float32Array(n * NODEB);                      // B2b: genes de nodo/agente (cuerpo generativo, para el render por grafo)
  const hT = config.combat.handlingTime || 1;
  const hist = new Float32Array(HIST_BINS);
  const species = new Float32Array(n);                            // especie (id) por agente
  const role = new Uint8Array(n);                                 // OFICIO dominante (color 'role'): 0 herbívoro · 1 carroñero · 2 cazador
  const serial = new Int32Array(n);                               // id único por organismo (clave estable del caché de sprites del render)
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
    // OFICIO trófico — MISMA función que la curva de población (trophicRole, fuente única en organism.js) → coinciden
    // exactamente. 0 herbívoro · 1 carroñero · 2 cazador · 3 omnívoro. Para el color 'role' (lectura, no afecta a la sim).
    role[k] = trophicRole(s.diet[i], s.effHunt[i], s.effScav[i]);
    serial[k] = s.serialOf[i];
    heading[k] = s.heading[i]; // rumbo persistente (sim ya conserva el último válido cuando v≈0)
    const v = Math.hypot(s.vx[i], s.vy[i]) / (config.loco.vMax || 3);  // velocidad ABSOLUTA (÷ vMax global), no fracción de su propia capacidad → la animación de nodos sigue al desplazamiento REAL
    spd[k] = v > 1 ? 1 : v;
    const ndb = i * NG + NODE0, nkb = k * NODEB;                   // bloque de nodos (la forma)
    for (let q = 0; q < NODEB; q++) nodes[nkb + q] = s.genes[ndb + q];
    const ib = i * NG, eb = k * 4;
    tint[k] = s.genes[ib + G_ORN];                                 // #13: tint = solo ornamento (gatea el señuelo)
    eye[eb] = s.genes[ib + G_SENSE]; eye[eb + 1] = s.genes[ib + G_FOV];
    eye[eb + 2] = s.genes[ib + G_EYE]; eye[eb + 3] = s.atkDrive[i]; // "ceño" = impulso de ataque suavizado (emergente)
    const db = k * 7;
    deco[db] = s.genes[ib + G.c_lum]; deco[db + 1] = s.genes[ib + G.c_sat];
    deco[db + 2] = s.genes[ib + G.o_len]; deco[db + 3] = s.genes[ib + G.o_bulb]; deco[db + 4] = s.genes[ib + G.o_hue]; deco[db + 5] = s.genes[ib + G.o_num];
    deco[db + 6] = s.genes[ib + G.tex2];
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
    const vsp = Math.hypot(s.vx[i], s.vy[i]) / (config.loco.vMax || 3);  // ídem: absoluta (animación del retrato del inspector)
    sel = {
      x: s.x[i], y: s.y[i], radius: s.radius[i], hue: s.hue[i], genes: g,
      E: s.E[i], eMax: s.eMax[i], age: s.age[i], lineage: s.lineage[i], generation: s.generation[i],
      species: speciesOf[i], diet: s.diet[i],
      speciesIdx: sIds.indexOf(speciesOf[i]), speciesTotal: sIds.length,
      speciesMembers: (speciesReps.find(r => r.id === speciesOf[i]) || { count: 0 }).count, // nº de individuos de esta especie

      heading: s.heading[i], spd: vsp > 1 ? 1 : vsp,   // rumbo persistente → el retrato orienta/ondula IGUAL que en el mundo
      atkDrive: s.atkDrive[i],                          // impulso de ataque suavizado → ceño del retrato + readout del inspector
    };
  }
  const resource = s.world.resource.slice(), carrion = s.world.carrion.slice(), nutrient = s.world.N.slice();
  // TRANSFERIBLES: los TypedArrays creados FRESCOS en esta foto se MUEVEN al hilo principal (cero copia) en lugar de
  // clonarse (structured clone). Tras transferirse quedan "detached" aquí, pero el próximo snapshot crea otros nuevos →
  // seguro. NO se incluyen los arrays histó* (los RETIENE el worker entre frames; además son Array normal, no TypedArray)
  // ni `sel`/escalares → se copian. `nodes` (n·80 floats) es el mayor; transferirlo evita su copia por frame.
  const transfer = [x.buffer, y.buffer, radius.buffer, hue.buffer, diet.buffer, eFrac.buffer, lineage.buffer,
    geneSel.buffer, heading.buffer, spd.buffer, tint.buffer, eye.buffer, face.buffer, deco.buffer, nodes.buffer,
    hist.buffer, species.buffer, role.buffer, serial.buffer, resource.buffer, carrion.buffer, nutrient.buffer];
  postMessage({
    type: 'frame', n, tick: s.tick, pop: s.popCount, births: s.births, deaths: s.deaths, carn, N: s.world.totalN(),
    x, y, radius, hue, diet, eFrac, lineage, geneSel, heading, spd, tint, eye, face, deco, nodes, hist, sel,
    species, speciesCount, role, serial,
    // Histórico para las gráficas (muestreado por ticks; ver sampleHistory). Arrays pequeños (~120 puntos).
    histPop, histCarn, histScav, histHerb, histOmni, histVegFill, histTick, histN, histVegMass, histBio, histCarrion, histDC, histDS, histDA, histDE, histBS, histBA,
    resource, carrion, nutrient,
  }, transfer);
}


function loop() {
  const now = performance.now();
  let dt = (now - last) / 1000; if (dt > 0.1) dt = 0.1; last = now;
  const tick0 = sim.tick;
  if (running) {
    const start = performance.now();
    if (maxSpeed) {
      while (performance.now() - start < config.sim.maxBudgetMs) {
        sim.step();
        if (sim.tick - lastHistTick >= HIST_K) { sampleHistory(); lastHistTick = sim.tick; }
      }
      tickAcc = 0;
    } else {
      tickAcc += config.sim.targetTPS * dt;
      while (tickAcc >= 1) {
        sim.step();
        if (sim.tick - lastHistTick >= HIST_K) { sampleHistory(); lastHistTick = sim.tick; }
        tickAcc -= 1;
        if (performance.now() - start > config.sim.frameBudgetMs) { tickAcc = 0; break; }
      }
    }
  } else tickAcc = 0;
  if (sim.tick !== tick0) needSnap = true;             // la sim avanzó → la foto cambió
  if (sim.tick - lastClassify >= 60) { classifySpecies(); lastClassify = sim.tick; } // especies (periódico)
  if (needSnap) { snapshot(); needSnap = false; }      // solo se postea si hay algo nuevo (tick o comando de UI)
  setTimeout(loop, 16); // hasta ~60 Hz de fotos (independiente del render del hilo principal)
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
    case 'set':
      // PECERA CERRADA: 'energía por unidad' (epu) es el tipo de cambio vegetación↔materia y entra en el balance
      // (M = N + Σres·epu + …). Cambiarlo en vivo reescalaría la materia de la vegetación EN PIE → un salto puntual.
      // Lo ABSORBE el pool de nutriente: N -= Σres·Δepu → la MATERIA total no salta (se reparte distinto, no se crea/borra).
      if (m.key === 'resource.energyPerUnit' && config.world.closedMatter) {
        const oldEpu = config.resource.energyPerUnit, d = oldEpu - m.value, N = sim.world.N, r = sim.world.resource;
        for (let i = 0; i < N.length; i++) { const v = N[i] + r[i] * d; N[i] = v > 0 ? v : 0; } // compensa Σres·epu POR CELDA → la materia total no salta
      }
      setPath(config, m.key, m.value);
      break;
    case 'gene': geneIdx = m.index; needSnap = true; break;
    case 'pick': setSelected(pick(m.wx, m.wy)); needSnap = true; break;
    case 'deselect': setSelected(-1); needSnap = true; break;       // cerrar la vista de especie (botón ✕ del inspector)
    case 'pickSpecies': pickSpecies(m.dir); needSnap = true; break; // navegar por especies (◀ ▶ en el inspector)
    case 'reset': config.pop.seed = m.seed; sim.reset(m.seed); selectedId = -1; selLineage = selGeneration = selSpeciesId = -1;
      if (speciesOf.length !== sim.cap) speciesOf = new Float32Array(sim.cap); // maxAgents pudo cambiar (slider lab) → reajustar el array de especies al nuevo pool
      speciesReps = []; nextSpeciesId = 1; lastClassify = -1e9; speciesCount = 0;
      clearHistory(); postWorld(); needSnap = true; break;
  }
};

postWorld();
loop();
