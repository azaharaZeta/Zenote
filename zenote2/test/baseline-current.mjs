// M0 — BASELINE de la app ACTUAL (../../src). Mide la emergencia que el modelo nuevo deberá IGUALAR o SUPERAR
// (roadmap 2.6 §4: emergence scorecard). NO toca la app actual: solo la importa y la corre headless, multi-seed.
// Reutiliza la lógica de métricas probada de test/sweep-worldsize.mjs (números comparables).
//   uso: node zenote2/test/baseline-current.mjs [ticks] [seedsCSV]

import { config } from '../../src/config.js';
import { Sim } from '../../src/engine/sim.js';
import { NUM_GENES, FUNCTIONAL, geneticDistance } from '../../src/engine/genome.js';
import { trophicRole } from '../../src/engine/organism.js';

const TICKS = +(process.argv[2] || 20000);
const SEEDS = (process.argv[3] || '1,2,3,4,5').split(',').map(Number);
const SIZE  = +(process.argv[4] || config.world.size);   // tamaño de mundo (la coexistencia depende de él: pequeño = Allee frágil)

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const std  = (a) => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };

// Métricas (mismas que sweep-worldsize.mjs → comparables con las medidas históricas del proyecto).
function metrics(sim) {
  const alive = [];
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) alive.push(i);
  const n = alive.length;
  if (!n) return { pop: 0, popFrac: 0, herb: 0, scav: 0, hunt: 0, omni: 0, sizeStd: 0, meanR: 0, nSpec: 0, fdiv: 0, H: 0 };
  let herb = 0, scav = 0, hunt = 0, omni = 0; const sizes = [];
  for (const i of alive) {
    const r = trophicRole(sim.diet[i], sim.effHunt[i], sim.effScav[i]);
    if (r === 0) herb++; else if (r === 1) scav++; else if (r === 2) hunt++; else omni++;
    sizes.push(sim.radius[i]);
  }
  const SAMPLE = 300;
  const samp = n <= SAMPLE ? alive : Array.from({ length: SAMPLE }, () => alive[(Math.random() * n) | 0]);
  let fdiv = 0;
  for (const gi of FUNCTIONAL) { const col = samp.map(i => sim.genes[i * NUM_GENES + gi]); fdiv += std(col) ** 2; }
  fdiv /= FUNCTIONAL.length;
  const thr = sim.cfg.repro.speciesGenThreshold; const reps = [];
  for (const i of samp) { if (reps.every(r => geneticDistance(sim.genes, i, r) >= thr)) reps.push(i); }
  const fr = [herb / n, scav / n, hunt / n, omni / n]; let H = 0;
  for (const p of fr) if (p > 0) H -= p * Math.log(p);
  return { pop: n, popFrac: n / sim.cap, herb: herb / n, scav: scav / n, hunt: hunt / n, omni: omni / n, sizeStd: std(sizes), meanR: mean(sizes), nSpec: reps.length, fdiv, H };
}

// Veredicto (igual que sweep): PLENO = cadena trófica completa = coexistencia depredador-presa lograda.
function verdict(m) {
  if (m.pop < 30) return 'EXTINTO';
  const g = [m.herb, m.scav, m.hunt, m.omni];
  if (m.herb < 0.05) return 'MONO-CARNE';
  if (g.some(p => p > 0.92)) return 'MONO';
  if (g.filter(p => p > 0.05).length < 2 || m.nSpec < 3) return 'POBRE';
  if (m.hunt + m.scav < 0.04) return 'SIN-DEPRED';
  return 'PLENO';
}

// Cuenta parámetros del config (hojas), distinguiendo simulación vs render (visual).
function countParams(obj) {
  let sim = 0, render = 0;
  const walk = (o, inRender) => {
    for (const [k, v] of Object.entries(o)) {
      const r = inRender || k === 'render';
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, r);
      else { if (r) render++; else sim++; }
    }
  };
  walk(obj, false);
  return { sim, render, total: sim + render };
}

const clone = () => structuredClone(config);
const pad = (s, w) => String(s).padStart(w);

console.error(`Corriendo baseline de la app ACTUAL: ${SEEDS.length} seeds × ${TICKS} ticks (config de producción, mundo ${SIZE})...`);
const per = [];
const t0 = performance.now();
let totalSteps = 0;
for (const seed of SEEDS) {
  const cfg = clone(); cfg.pop.seed = seed; cfg.world.size = SIZE;
  const sim = new Sim(cfg);
  for (let t = 0; t < TICKS; t++) sim.step();
  totalSteps += TICKS;
  const m = metrics(sim); m.verdict = verdict(m); per.push(m);
  console.error(`  seed=${seed}  pop=${m.pop}(${(m.popFrac*100|0)}%) herb=${(m.herb*100|0)} scav=${(m.scav*100|0)} hunt=${(m.hunt*100|0)} omni=${(m.omni*100|0)} nSpec=${m.nSpec} szStd=${m.sizeStd.toFixed(2)} H=${m.H.toFixed(2)} → ${m.verdict}`);
}
const ms = performance.now() - t0;
const tps = (totalSteps / ms) * 1000;

const avg = (k) => mean(per.map(r => r[k]));
const verdicts = per.map(r => r.verdict);
const pleno = verdicts.filter(v => v === 'PLENO').length;
const predAlive = per.filter(r => (r.hunt + r.scav) > 0.04).length;
const params = countParams(config);

console.log(`\n=== BASELINE — app ACTUAL (Zenote v1) · ${SEEDS.length} seeds × ${TICKS} ticks ===\n`);
console.log('SCORECARD (medias multi-seed) — los números que la app NUEVA deberá igualar o superar:\n');
console.log(`  Población media .............. ${avg('pop').toFixed(0)}  (${(avg('popFrac')*100).toFixed(0)}% del techo)`);
console.log(`  Gremios (% medio) ............ herb ${(avg('herb')*100).toFixed(0)} · scav ${(avg('scav')*100).toFixed(0)} · hunt ${(avg('hunt')*100).toFixed(0)} · omni ${(avg('omni')*100).toFixed(0)}`);
console.log(`  Coexistencia (cadena PLENA) .. ${pleno}/${SEEDS.length} seeds   ·  con depredador vivo: ${predAlive}/${SEEDS.length}`);
console.log(`  Diversidad de talla (szStd) .. ${avg('sizeStd').toFixed(2)}  (radio medio ${avg('meanR').toFixed(1)})`);
console.log(`  Especies (nSpec) ............. ${avg('nSpec').toFixed(1)}`);
console.log(`  Diversidad morfológica (fdiv)  ${avg('fdiv').toFixed(4)}  (varianza génica funcional)`);
console.log(`  Evenness trófica (H) ......... ${avg('H').toFixed(2)}  (0 mono · 1.39 máx)`);
console.log(`  Veredictos ................... ${verdicts.join(', ')}`);
console.log(`\n  Parámetros (config) .......... ${params.total} total  =  ${params.sim} simulación + ${params.render} render`);
console.log(`  Perf (motor headless) ........ ${tps.toFixed(0)} t/s`);
console.log(`\n(Repetir: node zenote2/test/baseline-current.mjs ${TICKS} ${SEEDS.join(',')})`);
