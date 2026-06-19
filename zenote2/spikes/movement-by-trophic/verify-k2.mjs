// Verificación de photoMotionK=2 a largo plazo (25k, no transitorio) + invariantes + reparto de movimiento por oficio.
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';
import { trophicCode } from '../../src/engine/phenotype.js';

const K = +(process.argv[2] || 2), TICKS = +(process.argv[3] || 25000), SEEDS = [1, 2, 3];
const eD = SIM_P.eDensity;
const matter = (s) => s.world.totalNutrient() + s.world.totalDetritusM() + s.totalMass();
const stored = (s) => { let e = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) e += s.E[i] + s.gut[i] + s.mass[i] * eD; return e + s.world.totalDetritusE(); };

console.log(`=== photoMotionK=${K} · ${SEEDS.length} seeds × ${TICKS} ticks ===\n`);
for (const seed of SEEDS) {
  SIM_P.photoMotionK = K;
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed, cap: 12000 }); s.seed(800);
  const budget = matter(s); let prevStored = stored(s), prevHeat = w.heat, prevCap = w.lightCaptured, mDrift = 0, eRes = 0, heatMono = true, lastHeat = w.heat;
  for (let t = 0; t < TICKS; t++) {
    s.step();
    const md = Math.abs(matter(s) - budget) / budget; if (md > mDrift) mDrift = md;
    const st = stored(s), r = Math.abs((st - prevStored) - ((w.lightCaptured - prevCap) - (w.heat - prevHeat))); if (r > eRes) eRes = r;
    if (w.heat < lastHeat - 1e-9) heatMono = false; lastHeat = w.heat; prevStored = st; prevHeat = w.heat; prevCap = w.lightCaptured;
  }
  const n = [0, 0, 0], moving = [0, 0, 0]; let movers = 0, moversHet = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) { const r = trophicCode(s.photoCap[i], s.thrust[i], s.mouthCap[i]); n[r]++; if (Math.hypot(s.vx[i], s.vy[i]) > 0.3) { moving[r]++; movers++; if (r !== 0) moversHet++; } }
  const pop = n[0] + n[1] + n[2], invOK = mDrift < 1e-3 && eRes < 1e-2 && heatMono;
  console.log(`seed ${seed}: pop ${pop} · auto ${(n[0] / pop * 100).toFixed(0)}% (mov ${(moving[0] / Math.max(1, n[0]) * 100).toFixed(0)}%) · het ${(n[1] / pop * 100).toFixed(0)}% · mixto ${(n[2] / pop * 100).toFixed(0)}%`);
  console.log(`         de los que SE MUEVEN, ${movers ? (moversHet / movers * 100).toFixed(0) : 0}% son hetero/mixto (autótrofos sésiles) · invariantes ${invOK ? 'OK ✓' : 'FALLO ✗'}`);
}
SIM_P.photoMotionK = 0;
