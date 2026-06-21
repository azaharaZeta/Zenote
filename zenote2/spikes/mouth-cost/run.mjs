// SPIKE — ¿pone el coste de mantenimiento de la boca (SIM_P.mouthCost ∝ mouthCap) la INGESTA bajo selección sin romper la
// coexistencia? mouthCost=0 = baseline (confirma la inflación casi-neutra). Mide a 30k: mouthCap (media/σ), % con boca grande,
// pop, herb/carn (coexistencia), masa, conservación. uso: node zenote2/spikes/mouth-cost/run.mjs [ticks] [seeds]
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';

const role = (v, p, s) => { const t = v + p + s; if (t < 0.5) return 0; const c = (p + s) / t; return c > 0.6 ? 1 : c < 0.25 ? 0 : 2; };
function matter(w, s) { let m = w.totalNutrient() + w.totalVeg() + w.totalDetritusM(); for (let i = 0; i < s.cap; i++) if (s.alive[i]) m += s.mass[i]; return m; }
const ms = (a) => { const n = a.length || 1; let m = 0; for (const v of a) m += v; m /= n; let s = 0; for (const v of a) s += (v - m) ** 2; return { m, s: Math.sqrt(s / n) }; };

function run(seed, mouthCost, ticks) {
  const saved = SIM_P.mouthCost; SIM_P.mouthCost = mouthCost;
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5); w.veg.fill(1.0);
  const s = new Sim(w, { seed, cap: 4000 }); s.seed(800); const m0 = matter(w, s);
  for (let t = 0; t < ticks; t++) s.step();
  let pop = 0, h = 0, c = 0, mc = [], mass = [], big = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) { pop++; const r = role(s.vegIn[i], s.preyIn[i], s.scavIn[i]); if (r === 0) h++; else if (r === 1) c++;
    mc.push(s.mouthCap[i]); mass.push(s.mass[i]); if (s.mouthCap[i] > 5) big++; }
  const mcS = ms(mc), maS = ms(mass);
  SIM_P.mouthCost = saved;
  return { pop, h, c, mouth: mcS, mass: maS, bigPct: 100 * big / pop, drift: 100 * (matter(w, s) - m0) / m0 };
}

const TICKS = +(process.argv[2] || 30000);
const seeds = process.argv[3] ? process.argv[3].split(',').map(Number) : [1, 2];
const VALUES = [0, 0.0005, 0.001, 0.002, 0.004];
console.log(`spike mouth-cost: ticks=${TICKS} seeds=${seeds}  (boca funcional ≈ 1.2; mouthCost=0 → inflada/casi-neutra)\n`);
console.log('mouthCost seed  pop   herb/carn   mouthCap(m±σ)  %boca>5  mass(m±σ)   drift');
for (const mco of VALUES) {
  for (const seed of seeds) {
    const r = run(seed, mco, TICKS);
    console.log(`  ${mco.toFixed(4)}  ${seed}   ${String(r.pop).padStart(4)}  ${String(r.h + '/' + r.c).padEnd(9)}  ${r.mouth.m.toFixed(1).padStart(5)}±${r.mouth.s.toFixed(1).padStart(4)}  ${r.bigPct.toFixed(0).padStart(3)}%   ${r.mass.m.toFixed(2)}±${r.mass.s.toFixed(2)}  ${r.drift.toFixed(3)}%`);
  }
  console.log('');
}
