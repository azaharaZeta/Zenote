// SPIKE #3+#4 — ¿la BARRERA POST-CIGÓTICA (híbrido débil ∝ distancia parental) + aflojar mateCompat DISCRETIZA los morfos?
// Selección DISRUPTIVA contra intermedios → menos OMNÍVOROS morfológicos (trophicCode==2 = el "valle") + extremos poblados.
// postZygotic=0 = baseline (solo pre-cigótico = clinal). uso: node zenote2/spikes/postzygotic/run.mjs [ticks] [seeds]
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';
import { trophicCode } from '../../src/engine/phenotype.js';

const dietRole = (v, p, s) => { const t = v + p + s; if (t < 0.5) return 0; const c = (p + s) / t; return c > 0.6 ? 1 : c < 0.25 ? 0 : 2; };
function matter(w, s) { let m = w.totalNutrient() + w.totalVeg() + w.totalDetritusM(); for (let i = 0; i < s.cap; i++) if (s.alive[i]) m += s.mass[i]; return m; }

function run(seed, postZ, mateC, ticks) {
  const sPZ = SIM_P.postZygotic, sMC = SIM_P.mateCompat; SIM_P.postZygotic = postZ; SIM_P.mateCompat = mateC;
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5); w.veg.fill(1.0);
  const s = new Sim(w, { seed, cap: 4000 }); s.seed(800); const m0 = matter(w, s);
  for (let t = 0; t < ticks; t++) s.step();
  let pop = 0, mH = 0, mC = 0, mO = 0, dH = 0, dC = 0;   // morfología (trophicCode) + dieta (coexistencia)
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) { pop++;
    const tc = trophicCode(s.mouthCap[i], s.maxMouthR[i], s.mass[i]); if (tc === 0) mH++; else if (tc === 1) mC++; else mO++;
    const dr = dietRole(s.vegIn[i], s.preyIn[i], s.scavIn[i]); if (dr === 0) dH++; else dC++;
  }
  SIM_P.postZygotic = sPZ; SIM_P.mateCompat = sMC;
  return { pop, omniPct: 100 * mO / pop, mH: 100*mH/pop, mC: 100*mC/pop, dietCarn: dC, drift: 100 * (matter(w, s) - m0) / m0 };
}

const TICKS = +(process.argv[2] || 30000);
const seeds = process.argv[3] ? process.argv[3].split(',').map(Number) : [1, 2];
console.log(`spike post-cigótico: ticks=${TICKS} seeds=${seeds}. Éxito = OMNÍVORO morfológico (intermedio) BAJA + extremos poblados + coexiste.\n`);
console.log('postZyg mateCompat seed  pop   morfo[herb/omni/carn]%   dietaCarn  drift');
for (const mateC of [0.5, 1.5]) {
  for (const postZ of [0, 2, 4]) {
    for (const seed of seeds) {
      const r = run(seed, postZ, mateC, TICKS);
      console.log(`  ${postZ}      ${mateC.toFixed(1)}      ${seed}   ${String(r.pop).padStart(4)}   ${r.mH.toFixed(0).padStart(3)} / ${r.omniPct.toFixed(0).padStart(3)} / ${r.mC.toFixed(0).padStart(3)}            ${String(r.dietCarn).padStart(3)}    ${r.drift.toFixed(3)}%`);
    }
  }
  console.log('');
}
