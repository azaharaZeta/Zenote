// Ablación headless: mide el efecto de un cambio en la dinámica eco-evolutiva. NO toca el código de producción
// (variantes por clon de config). Uso:  node test/ablation.mjs [ticks] [seedsCSV]   ej: node test/ablation.mjs 25000 1,2,3,4,5,6
import { config } from '../src/config.js';
import { Sim } from '../src/engine/sim.js';
import { G, NUM_GENES, FUNCTIONAL, geneticDistance } from '../src/engine/genome.js';
import { trophicRole } from '../src/engine/organism.js';

const TICKS = +(process.argv[2] || 25000);
const SEEDS = (process.argv[3] || '1,2,3,4,5,6').split(',').map(Number);

const clone = () => structuredClone(config);
const VARIANTS = {
  conTalla: () => clone(),                                                  // zancada por talla (speedSizeExp=0.5, por defecto)
  sinTalla: () => { const c = clone(); c.loco.speedSizeExp = 0; return c; }, // sin escala talla→velocidad (referencia)
};

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const std  = (a) => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };

function metrics(sim) {
  const alive = [];
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) alive.push(i);
  const n = alive.length;
  if (!n) return { pop: 0, herb: 0, scav: 0, hunt: 0, omni: 0, sizeStd: 0, meanR: 0, nSpec: 0, fdiv: 0, thrStd: 0, spdSmall: 0, spdBig: 0 };
  const refR = (sim.cfg.expr.size.min + sim.cfg.expr.size.max) * 0.5;
  let herb = 0, scav = 0, hunt = 0, omni = 0;
  const sizes = [], thr01 = [], sSmall = [], sBig = [];
  for (const i of alive) {
    const r = trophicRole(sim.diet[i], sim.effHunt[i], sim.effScav[i]);
    if (r === 0) herb++; else if (r === 1) scav++; else if (r === 2) hunt++; else omni++;
    const rad = sim.radius[i]; sizes.push(rad);
    const spd = Math.hypot(sim.vx[i], sim.vy[i]);
    thr01.push(Math.min(1, spd / (sim.vmax[i] || 1e-6)));
    if (rad < refR) sSmall.push(spd); else sBig.push(spd);   // velocidad-MUNDO de pequeños vs grandes
  }
  const SAMPLE = 300;
  const samp = n <= SAMPLE ? alive : Array.from({ length: SAMPLE }, () => alive[(Math.random() * n) | 0]);
  let fdiv = 0;
  for (const gi of FUNCTIONAL) { const col = samp.map(i => sim.genes[i * NUM_GENES + gi]); fdiv += std(col) ** 2; }
  fdiv /= FUNCTIONAL.length;
  const thr = sim.cfg.repro.speciesGenThreshold; const reps = [];
  for (const i of samp) { if (reps.every(r => geneticDistance(sim.genes, i, r) >= thr)) reps.push(i); }
  return {
    pop: n, herb: herb / n, scav: scav / n, hunt: hunt / n, omni: omni / n,
    sizeStd: std(sizes), meanR: mean(sizes), nSpec: reps.length, fdiv,
    thrStd: std(thr01), spdSmall: mean(sSmall), spdBig: mean(sBig),
  };
}

const results = {};
for (const [name, mk] of Object.entries(VARIANTS)) {
  results[name] = [];
  for (const seed of SEEDS) {
    const cfg = mk(); cfg.pop.seed = seed;
    const sim = new Sim(cfg);
    for (let t = 0; t < TICKS; t++) sim.step();
    const m = metrics(sim);
    results[name].push(m);
    console.error(`  ${name} seed=${seed} done  pop=${m.pop} sizeStd=${m.sizeStd.toFixed(2)} spdS=${m.spdSmall.toFixed(2)} spdB=${m.spdBig.toFixed(2)}`);
  }
}

const avg = (arr, k) => mean(arr.map(r => r[k]));
const KEYS = ['pop', 'nSpec', 'fdiv', 'sizeStd', 'meanR', 'herb', 'scav', 'hunt', 'thrStd', 'spdSmall', 'spdBig'];
const pad = (s, w) => String(s).padStart(w);
console.log(`\n=== ABLACIÓN  (${TICKS} ticks · seeds ${SEEDS.join(',')}) — medias ===\n`);
console.log(pad('métrica', 10) + Object.keys(VARIANTS).map(v => pad(v, 11)).join(''));
const fmt = (k, v) => (['pop', 'nSpec'].includes(k)) ? v.toFixed(0) : v.toFixed(3);
for (const k of KEYS) console.log(pad(k, 10) + Object.keys(VARIANTS).map(v => pad(fmt(k, avg(results[v], k)), 11)).join(''));
console.log('\nLeyenda: fdiv=diversidad genética · sizeStd=DIVERSIDAD de talla · meanR=radio medio · thrStd=dispersión de esfuerzo (control)');
console.log('         spdSmall/spdBig=velocidad-MUNDO media de pequeños(<medio)/grandes(≥medio) → verifica que el grande dé más zancada');
