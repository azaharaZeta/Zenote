import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';
import { START } from '../../src/config.js';
const ec = WORLD_P.vegEcoef, TICKS=20000;
function run(refuge, fReach){ const r0=SIM_P.grazeRefuge,f0=SIM_P.forageReach; SIM_P.grazeRefuge=refuge; SIM_P.forageReach=fReach;
  const w=new World(1500,1,{...WORLD_P,lightBase:START.lightBase}); w.nutrient.fill(START.nutrientInit); w.veg.fill(START.vegInit);
  const s=new Sim(w,{seed:1,cap:14000}); s.seed(800,1,1);
  const budget=w.totalNutrient()+w.totalVeg()+w.totalDetritusM()+s.totalMass(); let md=0;
  for(let t=0;t<TICKS;t++){ s.step(); const d=Math.abs((w.totalNutrient()+w.totalVeg()+w.totalDetritusM()+s.totalMass())-budget)/budget; if(d>md)md=d; }
  // diversidad de talla (SD de masa) → ¿el forrajeo por área da payoff de talla?
  let n=0,m=0,m2=0; for(let i=0;i<s.cap;i++) if(s.alive[i]){n++;m+=s.mass[i];m2+=s.mass[i]*s.mass[i];}
  const mean=n?m/n:0, sd=n?Math.sqrt(Math.max(0,m2/n-mean*mean)):0;
  SIM_P.grazeRefuge=r0; SIM_P.forageReach=f0;
  return {pop:s.pop(),veg:w.totalVeg()|0,meanMass:mean,sdMass:sd,cons:md<1e-3}; }
console.log(`grazeRefuge × forageReach (${TICKS}t, 800 fund) → pop · veg · masaMedia · SDmasa · conserva\n`);
for(const fR of [0,3]) for(const refuge of [0,0.03,0.06,0.1]){ const r=run(refuge,fR);
  console.log(`  forageReach=${fR} refuge=${refuge.toFixed(2)}: pop ${String(r.pop).padStart(4)} · veg ${String(r.veg).padStart(5)} · masa ${r.meanMass.toFixed(2)} · SD ${r.sdMass.toFixed(2)} · ${r.cons?'cons✓':'✗'}`); }
