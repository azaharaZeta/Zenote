// Ablación headless: mide si quitar P1 (señuelo), P2 (térmico) o P3 (selección sexual de ornamento)
// cambia la dinámica eco-evolutiva. NO toca el código de producción: P1/P2 por config, P3 por swap de _findMate.
// Uso:  node test/ablation.mjs [ticks] [seedsCSV]      ej: node test/ablation.mjs 25000 1,2,3
import { config } from '../src/config.js';
import { Sim } from '../src/engine/sim.js';
import { G, NUM_GENES, FUNCTIONAL, geneticDistance } from '../src/engine/genome.js';
import { trophicRole } from '../src/engine/organism.js';

const TICKS = +(process.argv[2] || 25000);
const SEEDS = (process.argv[3] || '1,2,3').split(',').map(Number);

// ---- variantes (clon profundo del config; el motor lee de su propio cfg) ----
const clone = () => structuredClone(config);
const VARIANTS = {
  BASE:      () => clone(),
  noLure:    () => { const c = clone(); c.combat.lureAttract = 0; c.combat.lureReach = 0; c.combat.lureGate = 1.01; c.energy.k_lure = 0; return c; },
  noSexSel:  () => clone(),   // mismo cfg; se parchea _findMate (pareja = compatible más CERCANA, sin ornamento)
};

// P3: elegir la pareja compatible más cercana (mantiene sexual + especies, quita el score por ornamento)
function nearestMate(s, i) {
  const W = s.world, x = s.x, y = s.y, world = s.cfg.world;
  const ww = world.size, wh = world.size;
  const mr = s.cfg.repro.mateRadius, mr2 = mr * mr, thr = s.cfg.repro.speciesGenThreshold;
  const hc = W.hashCell, hCols = W.hCols, hRows = W.hRows;
  const hx = (x[i] / hc) | 0, hy = (y[i] / hc) | 0;
  let best = -1, bestD = Infinity;
  const scanR = Math.min(3, Math.max(1, Math.ceil(mr / hc)));
  for (let oy = -scanR; oy <= scanR; oy++) for (let ox = -scanR; ox <= scanR; ox++) {
    const gx = ((hx + ox) % hCols + hCols) % hCols, gy = ((hy + oy) % hRows + hRows) % hRows;
    let j = W.cellHead[gy * hCols + gx];
    while (j !== -1) {
      if (j !== i && s.alive[j]) {
        let dx = x[j] - x[i], dy = y[j] - y[i];
        if (dx > ww * 0.5) dx -= ww; else if (dx < -ww * 0.5) dx += ww;
        if (dy > wh * 0.5) dy -= wh; else if (dy < -wh * 0.5) dy += wh;
        const d2 = dx * dx + dy * dy;
        if (d2 < mr2 && d2 < bestD && geneticDistance(s.genes, i, j) < thr) { bestD = d2; best = j; }
      }
      j = W.cellNext[j];
    }
  }
  return best;
}

// ---- métricas sobre el estado vivo ----
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const std  = (a) => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
function pearson(a, b) {
  const ma = mean(a), mb = mean(b); let num = 0, da = 0, db = 0;
  for (let k = 0; k < a.length; k++) { const x = a[k] - ma, y = b[k] - mb; num += x * y; da += x * x; db += y * y; }
  return (da && db) ? num / Math.sqrt(da * db) : 0;
}

function metrics(sim) {
  const alive = [];
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) alive.push(i);
  const n = alive.length;
  if (!n) return { pop: 0, herb: 0, scav: 0, hunt: 0, omni: 0, sizeStd: 0, nLin: 0, nSpec: 0, fdiv: 0, lureFrac: 0, ornStd: 0, prefStd: 0 };
  let herb = 0, scav = 0, hunt = 0, omni = 0;
  const sizes = [], orns = [], prefs = []; const lin = new Set();
  let lureExpr = 0;
  for (const i of alive) {
    const r = trophicRole(sim.diet[i], sim.effHunt[i], sim.effScav[i]);
    if (r === 0) herb++; else if (r === 1) scav++; else if (r === 2) hunt++; else omni++;
    sizes.push(sim.radius[i]); lin.add(sim.lineage[i]);
    orns.push(sim.genes[i * NUM_GENES + G.orn]); prefs.push(sim.genes[i * NUM_GENES + G.pref]);
    if (sim.lure[i] > 0) lureExpr++;
  }
  // muestra para O(n²): diversidad funcional + nº de especies (clustering codicioso por distancia genética)
  const SAMPLE = 300;
  const samp = n <= SAMPLE ? alive : Array.from({ length: SAMPLE }, () => alive[(Math.random() * n) | 0]);
  // diversidad funcional = media de la varianza por gen funcional
  let fdiv = 0;
  for (const gi of FUNCTIONAL) { const col = samp.map(i => sim.genes[i * NUM_GENES + gi]); fdiv += std(col) ** 2; }
  fdiv /= FUNCTIONAL.length;
  // especies: representantes; cada uno a >thr de los demás
  const thr = sim.cfg.repro.speciesGenThreshold; const reps = [];
  for (const i of samp) { if (reps.every(r => geneticDistance(sim.genes, i, r) >= thr)) reps.push(i); }
  return {
    pop: n, herb: herb / n, scav: scav / n, hunt: hunt / n, omni: omni / n,
    sizeStd: std(sizes), nLin: lin.size, nSpec: reps.length, fdiv,
    lureFrac: lureExpr / n, ornStd: std(orns), prefStd: std(prefs),
  };
}

// ---- correr ----
const results = {};
for (const [name, mk] of Object.entries(VARIANTS)) {
  results[name] = [];
  for (const seed of SEEDS) {
    const cfg = mk(); cfg.pop.seed = seed;
    const sim = new Sim(cfg);
    if (name === 'noSexSel') sim._findMate = (i) => nearestMate(sim, i);
    for (let t = 0; t < TICKS; t++) sim.step();
    const m = metrics(sim);
    results[name].push(m);
    console.error(`  ${name} seed=${seed} done  pop=${m.pop} spec=${m.nSpec} hunt=${(m.hunt*100|0)}%`);
  }
}

// ---- promediar y tabular ----
const avg = (arr, k) => mean(arr.map(r => r[k]));
const KEYS = ['pop', 'nSpec', 'nLin', 'fdiv', 'sizeStd', 'herb', 'scav', 'hunt', 'omni', 'lureFrac', 'ornStd', 'prefStd'];
const pad = (s, w) => String(s).padStart(w);
console.log(`\n=== ABLACIÓN  (${TICKS} ticks · seeds ${SEEDS.join(',')}) — medias ===\n`);
console.log(pad('métrica', 10) + Object.keys(VARIANTS).map(v => pad(v, 11)).join(''));
const fmt = (k, v) => (['pop', 'nSpec', 'nLin'].includes(k)) ? v.toFixed(0) : v.toFixed(3);
for (const k of KEYS) {
  console.log(pad(k, 10) + Object.keys(VARIANTS).map(v => pad(fmt(k, avg(results[v], k)), 11)).join(''));
}
console.log('\nLeyenda: fdiv=diversidad genética funcional (var media/gen) · nSpec=especies (cluster) · nLin=linajes vivos');
console.log('         lureFrac=fracción que expresa señuelo · ornStd/prefStd=dispersión sel. sexual');
