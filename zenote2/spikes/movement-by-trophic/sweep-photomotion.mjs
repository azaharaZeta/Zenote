// BARRIDO de photoMotionK (la fotosíntesis premia la quietud). Busca el valor que vuelve SÉSILES a los autótrofos
// (menos % en movimiento) manteniendo vivo el ecosistema y dejando el movimiento a los heterótrofos.
//   uso: node zenote2/spikes/movement-by-trophic/sweep-photomotion.mjs [ticks]

import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';
import { trophicCode } from '../../src/engine/phenotype.js';

const TICKS = +(process.argv[2] || 15000), SEEDS = [1, 2, 3], KS = [0, 1, 2, 4, 8];

function run(K, seed) {
  SIM_P.photoMotionK = K;
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed, cap: 12000 }); s.seed(800);
  for (let t = 0; t < TICKS; t++) s.step();
  const n = [0, 0, 0], moving = [0, 0, 0];
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) {
    const r = trophicCode(s.photoCap[i], s.thrust[i], s.mouthCap[i]);
    n[r]++; if (Math.hypot(s.vx[i], s.vy[i]) > 0.3) moving[r]++;
  }
  const pop = n[0] + n[1] + n[2];
  return { pop, autoPct: n[0] / pop, hetPct: n[1] / pop, autoMov: moving[0] / Math.max(1, n[0]), hetMov: moving[1] / Math.max(1, n[1]) };
}

console.log(`=== barrido photoMotionK · ${SEEDS.length} seeds × ${TICKS} ticks ===`);
console.log(`  (autoMov = % de autótrofos en movimiento → queremos que BAJE; hetMov = % de heterótrofos en movimiento)\n`);
console.log(`   K   pop    auto%  het%   autoMov%  hetMov%`);
for (const K of KS) {
  let pop = 0, autoPct = 0, hetPct = 0, autoMov = 0, hetMov = 0;
  for (const seed of SEEDS) { const r = run(K, seed); pop += r.pop; autoPct += r.autoPct; hetPct += r.hetPct; autoMov += r.autoMov; hetMov += r.hetMov; }
  const m = SEEDS.length;
  console.log(`  ${String(K).padStart(2)}  ${String(Math.round(pop / m)).padStart(5)}   ${(autoPct / m * 100).toFixed(0).padStart(3)}%  ${(hetPct / m * 100).toFixed(0).padStart(3)}%   ${(autoMov / m * 100).toFixed(0).padStart(5)}%   ${(hetMov / m * 100).toFixed(0).padStart(5)}%`);
}
SIM_P.photoMotionK = 0;
