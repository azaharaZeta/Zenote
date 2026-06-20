import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim } from '../../src/engine/sim.js';
import { START } from '../../src/config.js';
function run(eD){ const w=new World(START.worldSize,1,{...WORLD_P,lightBase:START.lightBase}); w.nutrient.fill(START.nutrientInit);
  const s=new Sim(w,{seed:1,cap:START.cap,eDensity:eD}); s.seed(START.seedCount,START.spawnSpread,START.diversity);
  const traj=[]; for(let t=0;t<=25000;t++){ if(t%5000===0) traj.push(`t${t/1000}k:${String(s.pop()).padStart(4)}`); if(t<25000) s.step(); } return traj.join(' · '); }
console.log('config arranque usuario (seed100, spread0.30, div0):');
console.log('  eD=0 :', run(0));
console.log('  eD=4 :', run(4));
