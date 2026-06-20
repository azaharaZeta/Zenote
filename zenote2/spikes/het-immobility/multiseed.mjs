import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';
const TICKS = 25000;
function run(hc, seed) {
  const saved = SIM_P.huntCloseMin; SIM_P.huntCloseMin = hc;
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed, cap: 14000, eDensity: 0 }); s.seed(800);
  const HALF = TICKS/2|0; for (let t=0;t<TICKS;t++){ s.step(); if(t===HALF){s.photoIn.fill(0);s.preyIn.fill(0);s.scavIn.fill(0);} }
  let n=0,v=0,th=0,still=0,eL=0,eP=0; for(let i=0;i<s.cap;i++) if(s.alive[i]&&s.mouthCap[i]>1){n++;const sp=Math.hypot(s.vx[i],s.vy[i]);v+=sp;if(sp<0.05)still++;th+=s.thrust[i];eL+=s.photoIn[i];eP+=s.preyIn[i];}
  SIM_P.huntCloseMin=saved; const eT=eL+eP||1;
  return {pop:s.pop(),n,vel:n?v/n:0,thrust:n?th/n:0,still:n?still/n*100:0,caza:eP/eT*100};
}
console.log(`=== Confirmación multi-seed (eD=0, ${TICKS} ticks): huntCloseMin 0 vs 0.15 ===\n`);
console.log('seed | hc=0: <vel> caza% quietos%  |  hc=0.15: <vel> <thrust> caza% quietos%');
console.log('-----|------------------------------|------------------------------------------');
for (const seed of [1,2,3,4,5]) { const a=run(0,seed), b=run(0.15,seed);
  console.log(`  ${seed}  |  ${a.vel.toFixed(3)}  ${a.caza.toFixed(0).padStart(2)}%   ${a.still.toFixed(0).padStart(3)}%      |  ${b.vel.toFixed(3)}   ${b.thrust.toFixed(2)}    ${b.caza.toFixed(0).padStart(2)}%   ${b.still.toFixed(0).padStart(3)}%`); }
