// SPIKE: ¿reactiva el músculo/velocidad el ESCAPE POR VELOCIDAD (SIM_P.fleeSpeed) sin extinguir al cazador?
// Barre fleeSpeed, mide a 30k ticks: locomoción (músculo%, vmax, spMean), supervivencia del cazador (C, kills) y coexistencia (pop).
// uso: node zenote2/spikes/flee-speed/run.mjs [ticks] [seeds]
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';

function stats(s) {
  let pop = 0, spSum = 0, vmaxSum = 0, mSum = 0, mSq = 0, musc = 0, partsAll = 0, nH = 0, nC = 0, nO = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) { pop++;
    spSum += Math.hypot(s.vx[i], s.vy[i]); vmaxSum += s.vmax[i];
    const m = s.mass[i]; mSum += m; mSq += m * m;
    const b = s.body[i]; if (b) { partsAll += b.length; for (const p of b) if (p.tissue === 1) musc++; }
    const v = s.vegIn[i], pr = s.preyIn[i], sc = s.scavIn[i], t = v + pr + sc; const carn = t < 0.5 ? 0 : (pr + sc) / t;
    if (t < 0.5 || carn < 0.25) nH++; else if (carn > 0.6) nC++; else nO++;
  }
  const mean = mSum / pop;
  return { pop, sp: spSum / pop, vmax: vmaxSum / pop, mass: mean, std: Math.sqrt(Math.max(0, mSq / pop - mean * mean)),
    fmusc: 100 * musc / partsAll, nH, nC, nO, kills: s.kills };
}

const TICKS = +(process.argv[2] || 30000);
const seeds = process.argv[3] ? process.argv[3].split(',').map(Number) : [1, 2];
const VALUES = [0, 0.5, 1.0, 1.5, 2.0];
console.log(`spike flee-speed: ticks=${TICKS} seeds=${seeds}  (fmusc=% tejido MÚSCULO; C=carnívoros por dieta)\n`);
console.log('flee  seed   pop  fmusc%  spMean  vmax   mass±std    H/C/O        kills');
for (const fv of VALUES) {
  for (const seed of seeds) {
    SIM_P.fleeSpeed = fv;
    const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 });
    w.nutrient.fill(1.5); w.veg.fill(1.0);
    const s = new Sim(w, { seed, cap: 4000 }); s.seed(800);
    for (let t = 0; t < TICKS; t++) s.step();
    const r = stats(s);
    console.log(`${fv.toFixed(1)}   ${seed}    ${String(r.pop).padStart(4)}  ${r.fmusc.toFixed(0).padStart(4)}%  ${r.sp.toFixed(3)}  ${r.vmax.toFixed(2)}  ${r.mass.toFixed(2)}±${r.std.toFixed(2)}  ${String(r.nH+'/'+r.nC+'/'+r.nO).padEnd(11)}  ${r.kills}`);
  }
  console.log('');
}
SIM_P.fleeSpeed = 1.0;
