// SPIKE visión-órgano · VARIANTE CON COSTE DE SENSADO (M6.4). El null de run.mjs fue: el ojo cuesta solo masa →
// neutro → no diferencia por nicho. Aquí añadimos un COSTE METABÓLICO explícito por alcance (senseCost·(alcance−mínimo),
// energía/tick → calor) y BARREMOS senseCost. Hipótesis: con coste, ver es net-negativo para quien no lo usa (autótrofo
// sésil) → suelta el ojo; el cazador lo retiene → DIFERENCIACIÓN POR NICHO emerge. Modo organ-seeded (el test limpio:
// todos nacen con ojo; ¿quién lo conserva?). senseCost=0 reproduce el null anterior (línea de deriva).
//   uso: node zenote2/spikes/vision-organo/run-cost.mjs [ticks] [seedsCSV] [costsCSV] [modo]
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim } from './sim.mjs';

const TICKS = +(process.argv[2] || 30000);
const SEEDS = (process.argv[3] || '1,2,3').split(',').map(Number);
const COSTS = (process.argv[4] || '0,0.0001,0.0003,0.0008').split(',').map(Number);
const MODE = process.argv[5] || 'organ-seeded';
const SIZE = 1500, CAP = 12000, FOUNDERS = 800;

const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const roleOf = (sim, i) => { const photo = sim.photoCap[i], het = sim.mouthCap[i] * 3; return photo > het * 1.5 ? 0 : het > photo * 1.5 ? 1 : 2; };
const matter = (W, sim) => W.totalNutrient() + W.totalDetritusM() + sim.totalMass();

function runOne(senseCost, seed) {
  const world = new World(SIZE, seed, { ...WORLD_P, lightBase: 2.5 }); world.nutrient.fill(1.5);
  const sim = new Sim(world, { seed, cap: CAP, visionMode: MODE, senseCost });
  sim.seed(FOUNDERS);
  const m0 = matter(world, sim); const t0 = Date.now();
  for (let t = 0; t < TICKS; t++) sim.step();
  const tps = Math.round(TICKS / ((Date.now() - t0) / 1000));
  let pop = 0, nAuto = 0, nHet = 0, eAuto = 0, eHet = 0; const saAuto = [], saHet = [];
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) {
    pop++; const r = roleOf(sim, i), sa = sim.senseArea[i];
    if (r === 0) { nAuto++; saAuto.push(sa); if (sa > 0.01) eAuto++; } else { nHet++; saHet.push(sa); if (sa > 0.01) eHet++; }
  }
  return { pop, pHet: pop ? nHet / pop : 0, saAuto: mean(saAuto), saHet: mean(saHet),
    eyeAuto: nAuto ? eAuto / nAuto : 0, eyeHet: nHet ? eHet / nHet : 0, tps, drift: m0 ? (matter(world, sim) - m0) / m0 * 100 : 0 };
}

console.log(`\n=== SPIKE visión-órgano · BARRIDO COSTE DE SENSADO · ${MODE} · ${TICKS} ticks · seeds [${SEEDS}] ===\n`);
const agg = {};
for (const c of COSTS) {
  const rs = SEEDS.map((s) => { const r = runOne(c, s); console.log(`  senseCost ${String(c).padEnd(7)} seed${s}: pop ${String(r.pop).padStart(4)} · het ${(r.pHet*100).toFixed(0).padStart(2)}% · áreaOjo[auto ${r.saAuto.toFixed(2).padStart(5)} | het ${r.saHet.toFixed(2).padStart(5)}] · conOjo[auto ${(r.eyeAuto*100).toFixed(0).padStart(3)}% | het ${(r.eyeHet*100).toFixed(0).padStart(3)}%] · ${r.tps} t/s · ΔM ${r.drift.toFixed(3)}%`); return r; });
  agg[c] = { pop: mean(rs.map(r=>r.pop)), pHet: mean(rs.map(r=>r.pHet)), saAuto: mean(rs.map(r=>r.saAuto)), saHet: mean(rs.map(r=>r.saHet)),
    eyeAuto: mean(rs.map(r=>r.eyeAuto)), eyeHet: mean(rs.map(r=>r.eyeHet)), tps: mean(rs.map(r=>r.tps)), drift: mean(rs.map(r=>r.drift)) };
  console.log('');
}

console.log('=== MEDIAS por coste de sensado ===');
console.log('  senseCost   pop   het%   áreaOjo(auto)  áreaOjo(het)  het/auto   conOjo(auto/het)   t/s    ΔM%');
for (const c of COSTS) { const a = agg[c]; const ratio = a.saAuto > 0.05 ? (a.saHet / a.saAuto).toFixed(1) + '×' : (a.saHet > 0.05 ? '∞' : '—');
  console.log(`  ${String(c).padEnd(8)}  ${String(Math.round(a.pop)).padStart(4)}  ${(a.pHet*100).toFixed(0).padStart(3)}%   ${a.saAuto.toFixed(3).padStart(9)}    ${a.saHet.toFixed(3).padStart(8)}   ${ratio.padStart(6)}    ${(a.eyeAuto*100).toFixed(0).padStart(3)}% / ${(a.eyeHet*100).toFixed(0)}%     ${String(Math.round(a.tps)).padStart(4)}  ${a.drift.toFixed(3).padStart(6)}`); }

// ---- VEREDICTO ----
console.log('\n=== VEREDICTO ===');
const c0 = agg[COSTS[0]];
console.log(`  Sin coste (${COSTS[0]}): áreaOjo auto ${c0.saAuto.toFixed(2)} vs het ${c0.saHet.toFixed(2)} (ratio ${c0.saAuto>0.05?(c0.saHet/c0.saAuto).toFixed(1):'?'}×) → línea de deriva, sin diferenciación.`);
let best = null, bestRatio = 0;
for (const c of COSTS) { if (c <= 0) continue; const a = agg[c]; const ratio = a.saAuto > 0.05 ? a.saHet / a.saAuto : (a.saHet > 0.05 ? 99 : 1);
  if (ratio > bestRatio && a.pHet > 0.1 && a.pop > 150) { bestRatio = ratio; best = c; } }
if (best != null) { const a = agg[best];
  console.log(`  Mejor coste con ecosistema sano: senseCost ${best} → áreaOjo auto ${a.saAuto.toFixed(2)} vs het ${a.saHet.toFixed(2)} (ratio ${bestRatio>=99?'∞':bestRatio.toFixed(1)+'×'}), het ${(a.pHet*100).toFixed(0)}%, pop ${Math.round(a.pop)}, conOjo auto ${(a.eyeAuto*100).toFixed(0)}% vs het ${(a.eyeHet*100).toFixed(0)}%.`);
  console.log(`    → ${bestRatio >= 1.8 ? 'DIFERENCIACIÓN POR NICHO EMERGE ✓ — los autótrofos SUELTAN el ojo, los cazadores lo RETIENEN → GO con coste de sensado' : 'diferenciación aún débil — ajustar coste/medir más largo'}`);
} else console.log('  Ningún coste produjo diferenciación con ecosistema sano (revisar rango o colapso).');
const collapsed = COSTS.filter((c) => agg[c].pop < 150 || agg[c].pHet < 0.05);
if (collapsed.length) console.log(`  Aviso: coste(s) demasiado alto(s) (colapso o het≈0): ${collapsed.join(', ')}.`);
const minTps = Math.min(...COSTS.map(c => agg[c].tps)), maxDrift = Math.max(...COSTS.map(c => Math.abs(agg[c].drift)));
console.log(`  Perf ${Math.round(minTps)} t/s (peor) ${minTps>1000?'✓':''} · materia |ΔM| máx ${maxDrift.toFixed(3)}% ${maxDrift<0.1?'✓':''}`);
console.log('');
