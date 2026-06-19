// SPIKE visión-órgano — RUNNER. ¿La visión como ÓRGANO (a) cruza el valle de fitness y (b) se diferencia por nicho?
// 3 condiciones (ablación), multi-seed, ecosistema real (mundo 1500, luz 2.5, 800 fundadores):
//   free          — baseline: sensado GRATIS y universal (gate ∞) = el motor actual. Referencia.
//   organ-seeded  — el sensado lo da un ÓRGANO; los fundadores nacen CON un ojo → ¿lo retienen los cazadores y lo
//                   PIERDEN los autótrofos? (test de diferenciación por nicho)
//   organ-blind   — órgano, pero los fundadores nacen CIEGOS (sin ojo) → ¿se INVENTA el ojo y se establece? (valle)
// Mide (estado final, media multi-seed): pob · %heterótrofo · fracción con ojo · área de ojo por OFICIO (auto vs het)
//   · alcance medio · perf (t/s) · deriva de materia (invariante: el ojo es MASA → debe conservarse).
//   uso: node zenote2/spikes/vision-organo/run.mjs [ticks] [seedsCSV] [modesCSV]
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim } from './sim.mjs';

const TICKS = +(process.argv[2] || 20000);
const SEEDS = (process.argv[3] || '1,2,3').split(',').map(Number);
const MODES = (process.argv[4] || 'free,organ-seeded,organ-blind').split(',');
const SIZE = 1500, CAP = 12000, FOUNDERS = 800;

const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const roleOf = (sim, i) => { const photo = sim.photoCap[i], het = sim.mouthCap[i] * 3; return photo > het * 1.5 ? 0 : het > photo * 1.5 ? 1 : 2; };
const matter = (W, sim) => W.totalNutrient() + W.totalDetritusM() + sim.totalMass();

function runOne(mode, seed) {
  const world = new World(SIZE, seed, { ...WORLD_P, lightBase: 2.5 });
  world.nutrient.fill(1.5);
  const sim = new Sim(world, { seed, cap: CAP, visionMode: mode });
  sim.seed(FOUNDERS);
  const m0 = matter(world, sim);
  const t0 = Date.now();
  for (let t = 0; t < TICKS; t++) sim.step();
  const tps = Math.round(TICKS / ((Date.now() - t0) / 1000));
  let pop = 0, nAuto = 0, nHetMixo = 0, nEye = 0;
  const saAuto = [], saHet = [], srAll = [];
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) {
    pop++; const r = roleOf(sim, i), sa = sim.senseArea[i]; srAll.push(sim.senseRange[i]);
    if (sa > 0.01) nEye++;
    if (r === 0) { nAuto++; saAuto.push(sa); } else { nHetMixo++; saHet.push(sa); }
  }
  return { pop, pHet: pop ? nHetMixo / pop : 0, eyeFrac: pop ? nEye / pop : 0,
    saAuto: mean(saAuto), saHet: mean(saHet), srAll: mean(srAll), tps,
    drift: m0 ? (matter(world, sim) - m0) / m0 * 100 : 0, kills: sim.kills };
}

console.log(`\n=== SPIKE visión-órgano · ${TICKS} ticks · seeds [${SEEDS}] · mundo ${SIZE} ===\n`);
const agg = {};
for (const mode of MODES) {
  const rs = SEEDS.map((s) => { const r = runOne(mode, s); console.log(`  ${mode.padEnd(13)} seed${s}: pop ${String(r.pop).padStart(4)} · het ${(r.pHet*100).toFixed(0).padStart(2)}% · ojo ${(r.eyeFrac*100).toFixed(0).padStart(3)}% · áreaOjo[auto ${r.saAuto.toFixed(2)} | het ${r.saHet.toFixed(2)}] · alcance ${r.srAll.toFixed(0)} · ${r.tps} t/s · ΔM ${r.drift.toFixed(3)}%`); return r; });
  agg[mode] = { pop: mean(rs.map(r=>r.pop)), pHet: mean(rs.map(r=>r.pHet)), eyeFrac: mean(rs.map(r=>r.eyeFrac)),
    saAuto: mean(rs.map(r=>r.saAuto)), saHet: mean(rs.map(r=>r.saHet)), srAll: mean(rs.map(r=>r.srAll)),
    tps: mean(rs.map(r=>r.tps)), drift: mean(rs.map(r=>r.drift)) };
  console.log('');
}

console.log('=== MEDIAS por condición ===');
console.log('  modo            pop   het%   ojo%   áreaOjo(auto)  áreaOjo(het)  het/auto   alcance   t/s    ΔM%');
for (const mode of MODES) { const a = agg[mode]; const ratio = a.saAuto > 0.01 ? (a.saHet / a.saAuto).toFixed(1) + '×' : (a.saHet > 0.01 ? '∞' : '—');
  console.log(`  ${mode.padEnd(13)} ${String(Math.round(a.pop)).padStart(4)}  ${(a.pHet*100).toFixed(0).padStart(3)}%  ${(a.eyeFrac*100).toFixed(0).padStart(4)}%   ${a.saAuto.toFixed(3).padStart(10)}    ${a.saHet.toFixed(3).padStart(9)}    ${ratio.padStart(6)}   ${a.srAll.toFixed(0).padStart(5)}   ${String(Math.round(a.tps)).padStart(4)}  ${a.drift.toFixed(3).padStart(6)}`); }

// ---- VEREDICTO frente a los criterios de muerte ----
console.log('\n=== VEREDICTO ===');
const seeded = agg['organ-seeded'], blind = agg['organ-blind'], free = agg['free'];
if (seeded) {
  const diff = seeded.saAuto > 0.01 ? seeded.saHet / seeded.saAuto : (seeded.saHet > 0.05 ? 99 : 0);
  console.log(`  Diferenciación por nicho (organ-seeded): heterótrofos invierten ${diff >= 99 ? '∞' : diff.toFixed(1)+'×'} más ojo que autótrofos.`);
  console.log(`    → ${diff >= 1.5 ? 'SÍ se diferencia ✓ (los autótrofos sueltan el ojo, los cazadores lo retienen)' : 'NO se diferencia ✗ (el ojo no responde al oficio → añadido neutro)'}`);
}
if (blind) console.log(`  Cruza el valle (organ-blind): fracción con ojo = ${(blind.eyeFrac*100).toFixed(0)}% → ${blind.eyeFrac > 0.15 ? 'SÍ se inventa/establece ✓' : 'NO se establece sin sembrar ✗ (probable: necesita siembra del ojo)'}`);
if (free && seeded) console.log(`  Heterotrofía: free ${(free.pHet*100).toFixed(0)}% vs organ-seeded ${(seeded.pHet*100).toFixed(0)}% → ${Math.abs(free.pHet-seeded.pHet) < 0.12 ? 'el órgano NO degrada la red trófica ✓' : 'el órgano altera la heterotrofía (revisar)'}`);
const minTps = Math.min(...MODES.map(m => agg[m].tps)), maxDrift = Math.max(...MODES.map(m => Math.abs(agg[m].drift)));
console.log(`  Perf: ${Math.round(minTps)} t/s (peor) → ${minTps > 1000 ? 'OK ✓' : 'por debajo del objetivo de 1000'}`);
console.log(`  Materia conservada: |ΔM| máx ${maxDrift.toFixed(3)}% → ${maxDrift < 0.1 ? 'OK ✓ (el ojo es masa, conserva)' : 'revisar'}`);
console.log('');
