// Barrido headless: ¿qué parametrización da DIVERSIDAD sin COLAPSO en mundos pequeños Y grandes?
// NO toca producción (variantes por clon de config). Uso: node test/sweep-worldsize.mjs [ticks] [seedsCSV] [sizesCSV] [configsCSV]
import { config } from '../src/config.js';
import { Sim } from '../src/engine/sim.js';
import { NUM_GENES, FUNCTIONAL, geneticDistance } from '../src/engine/genome.js';
import { trophicRole } from '../src/engine/organism.js';

const TICKS = +(process.argv[2] || 25000);
const SEEDS = (process.argv[3] || '1,2,3').split(',').map(Number);
const SIZES = (process.argv[4] || '600,1000,2500').split(',').map(Number);

const clone = () => structuredClone(config);
// Candidatas (cada una es un override sobre la config actual del repo).
const base = (c) => { c.expr.size.min = 4.0; c.world.matterBudget = 65000; c.resource.forageReach = 5; c.pop.startDiversity = 0.3; return c; }; // base multi-escala: cuerpos no-diminutos + materia + payoff de talla + sembrado carnívoro moderado
const CONFIGS = {
  actual: (c) => c,                                                            // tal cual el repo (size.min 2.0, startDiv 0.1, matter 40k, forage 2)
  robusto: (c) => { c.expr.size.min = 4.0; c.pop.startDiversity = 0.5; c.world.matterBudget = 60000; c.resource.forageReach = 5; return c; },
  equilibrado: (c) => { base(c); c.energy.carcassValue = 0.09; c.refuge.strength = 0.55; return c; },                       // protege la base herbívora (carcassValue↓ + refugio↑)
  protege:     (c) => { base(c); c.energy.carcassValue = 0.07; c.refuge.strength = 0.65; c.combat.handlingTime = 60; return c; }, // protección más fuerte (¿mata al cazador en grandes?)
  // FINALISTA: base herbívora protegida (refugio↑ + handlingTime↑ frenan la sobre-depredación en mundos densos), pero con
  // recompensa de carne moderada y mejor siembra carnívora → el cazador ARRAIGA en vez de no establecerse.
  general:     (c) => { base(c); c.pop.startDiversity = 0.4; c.energy.carcassValue = 0.10; c.refuge.strength = 0.62; c.combat.handlingTime = 58; return c; },
  // protege + MÁS MATERIA: medianos/grandes ya van topados (no cambian), pero los pequeños ganan población → el cazador arraiga.
  final:       (c) => { base(c); c.energy.carcassValue = 0.07; c.refuge.strength = 0.65; c.combat.handlingTime = 60; c.world.matterBudget = 85000; return c; },
};
const ONLY = process.argv[5] ? new Set(process.argv[5].split(',')) : null;

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const std  = (a) => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };

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
  // Shannon H sobre fracciones de gremio (evenness trófica): 0 = monocultivo, ln(4)≈1.39 = los 4 a partes iguales.
  const fr = [herb / n, scav / n, hunt / n, omni / n]; let H = 0;
  for (const p of fr) if (p > 0) H -= p * Math.log(p);
  return { pop: n, popFrac: n / sim.cap, herb: herb / n, scav: scav / n, hunt: hunt / n, omni: omni / n, sizeStd: std(sizes), meanR: mean(sizes), nSpec: reps.length, fdiv, H };
}

// Clasifica el estado ecológico. NOTA: estar cerca del techo (popFrac alto) NO es colapso si la población es DIVERSA —
// es solo el límite de perf. Solo son colapso: extinción, base herbívora hundida, monocultivo, o pobreza de gremios/especies.
// PLENO = cadena trófica completa (base herbívora + depredador + ≥2 gremios + especies) = la meta.
function verdict(m) {
  if (m.pop < 30) return 'EXTINTO';
  const g = [m.herb, m.scav, m.hunt, m.omni];
  if (m.herb < 0.05) return 'MONO-CARNE';                    // base herbívora colapsada
  if (g.some(p => p > 0.92)) return 'MONO';                  // un gremio domina ~todo
  if (g.filter(p => p > 0.05).length < 2 || m.nSpec < 3) return 'POBRE';
  if (m.hunt + m.scav < 0.04) return 'SIN-DEPRED';           // herbívoros (+omni) pero sin cazador/carroñero
  return 'PLENO';                                            // cadena completa
}

const pad = (s, w) => String(s).padStart(w);
const rows = [];
for (const [cname, mk] of Object.entries(CONFIGS)) {
  if (ONLY && !ONLY.has(cname)) continue;
  for (const size of SIZES) {
    const per = [];
    for (const seed of SEEDS) {
      const cfg = mk(clone()); cfg.world.size = size; cfg.pop.seed = seed;
      const sim = new Sim(cfg);
      for (let t = 0; t < TICKS; t++) sim.step();
      const m = metrics(sim); m.verdict = verdict(m); per.push(m);
      console.error(`  ${cname} size=${size} seed=${seed}  pop=${m.pop}(${(m.popFrac*100|0)}%) herb=${(m.herb*100|0)} scav=${(m.scav*100|0)} hunt=${(m.hunt*100|0)} omni=${(m.omni*100|0)} nSpec=${m.nSpec} H=${m.H.toFixed(2)} → ${m.verdict}`);
    }
    const avg = (k) => mean(per.map(r => r[k]));
    const verdicts = per.map(r => r.verdict);
    const okN = verdicts.filter(v => v === 'PLENO').length;   // éxito = cadena trófica plena
    rows.push({ cname, size, pop: avg('pop'), popFrac: avg('popFrac'), herb: avg('herb'), scav: avg('scav'), hunt: avg('hunt'), omni: avg('omni'), nSpec: avg('nSpec'), sizeStd: avg('sizeStd'), fdiv: avg('fdiv'), H: avg('H'), ok: okN + '/' + per.length, verdicts: verdicts.join(',') });
  }
}

console.log(`\n=== BARRIDO mundo×config (${TICKS} ticks · seeds ${SEEDS.join(',')}) — medias por seed ===\n`);
console.log([pad('config',9), pad('size',5), pad('pop',6), pad('%cap',5), pad('herb',5), pad('scav',5), pad('hunt',5), pad('omni',5), pad('nSpec',6), pad('szStd',6), pad('H',5), pad('OK',5), 'veredictos'].join(' '));
for (const r of rows) {
  console.log([pad(r.cname,9), pad(r.size,5), pad(r.pop.toFixed(0),6), pad((r.popFrac*100).toFixed(0),5), pad((r.herb*100).toFixed(0),5), pad((r.scav*100).toFixed(0),5), pad((r.hunt*100).toFixed(0),5), pad((r.omni*100).toFixed(0),5), pad(r.nSpec.toFixed(1),6), pad(r.sizeStd.toFixed(2),6), pad(r.H.toFixed(2),5), pad(r.ok,5), r.verdicts].join(' '));
}
console.log('\nLeyenda: %cap=pop/techo (>85 SATURADO) · herb/scav/hunt/omni=% gremio · nSpec=especies · szStd=diversidad de talla · H=evenness trófica (0 mono, 1.39 máx) · OK=seeds sanas');
