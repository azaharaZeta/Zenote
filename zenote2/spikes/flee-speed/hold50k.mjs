// ¿El escape-por-velocidad MANTIENE la locomoción a largo plazo (arms race estable) o solo retrasa el decaimiento?
// Compara fleeSpeed 0 (antiguo) vs 1.0 (nuevo default) hasta 50k, muestreando la velocidad/músculo en el tiempo.
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';

function loco(s) { let pop=0, sp=0, vmax=0, musc=0, parts=0, nC=0;
  for (let i=0;i<s.cap;i++) if (s.alive[i]) { pop++; sp+=Math.hypot(s.vx[i],s.vy[i]); vmax+=s.vmax[i];
    const b=s.body[i]; if(b){parts+=b.length; for(const p of b) if(p.tissue===1) musc++;}
    const v=s.vegIn[i],pr=s.preyIn[i],sc=s.scavIn[i],t=v+pr+sc; if(t>=0.5&&(pr+sc)/t>0.6) nC++; }
  return {pop, sp:sp/pop, vmax:vmax/pop, fmusc:100*musc/parts, nC}; }

for (const fv of [0.0, 1.0]) {
  console.log(`\n=== fleeSpeed ${fv.toFixed(1)} ===   tick    pop  spMean  vmax  fMusc  C`);
  SIM_P.fleeSpeed = fv;
  const w=new World(1500,1,{...WORLD_P,lightBase:2.5}); w.nutrient.fill(1.5); w.veg.fill(1.0);
  const s=new Sim(w,{seed:1,cap:4000}); s.seed(800);
  const CHK=[500,2000,10000,30000,50000]; let ci=0;
  for (let t=0;t<=50000;t++){ if(ci<CHK.length&&t===CHK[ci]){const r=loco(s);
    console.log(`                         ${String(t).padStart(6)} ${String(r.pop).padStart(4)}  ${r.sp.toFixed(3)}  ${r.vmax.toFixed(2)}  ${r.fmusc.toFixed(0).padStart(3)}%  ${r.nC}`); ci++;} s.step(); }
}
SIM_P.fleeSpeed = 1.0;
