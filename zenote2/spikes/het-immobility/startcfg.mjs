import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';
import { START } from '../../src/config.js';
const TICKS=25000;
function run(photoHalf){ const s0=SIM_P.photoHalf; SIM_P.photoHalf=photoHalf;
  const w=new World(START.worldSize,1,{...WORLD_P,lightBase:START.lightBase}); w.nutrient.fill(START.nutrientInit);
  const s=new Sim(w,{seed:1,cap:START.cap,eDensity:0}); s.seed(START.seedCount,START.spawnSpread,START.diversity);
  for(let t=0;t<TICKS;t++) s.step();
  let n=0,allStill=0, mn=0,mStill=0,mv=0; for(let i=0;i<s.cap;i++) if(s.alive[i]){n++;const sp=Math.hypot(s.vx[i],s.vy[i]);if(sp<0.05)allStill++;
    if(s.mouthCap[i]>1){mn++;mv+=sp;if(sp<0.05)mStill++;}}
  SIM_P.photoHalf=s0;
  return {pop:s.pop(), allStill:n?allStill/n*100:0, mn, mStill:mn?mStill/mn*100:0, mvel:mn?mv/mn:0};
}
console.log('Config arranque usuario (seed100, spread0.30, div0=clones), eD=0:');
for(const ph of [40,4]){ const r=run(ph); console.log(`  photoHalf=${String(ph).padStart(2)}: pop ${r.pop} · TODOS quietos ${r.allStill.toFixed(0)}% · de-boca ${r.mn} (quietos ${r.mStill.toFixed(0)}%, vel ${r.mvel.toFixed(3)})`); }
