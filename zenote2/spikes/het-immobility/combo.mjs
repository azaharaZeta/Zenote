// photoHalf bajo (presupuesto libre) × photoMotionK (premio a la quietud), eD=0, 3 seeds. ¿La combinación vuelve RESIDUAL
// la inmovilidad de los de boca (que se MUEVAN y CACEN)?
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';
const TICKS=25000, SEEDS=[1,2,3];
function run(photoHalf, pmK, seed){ const sH=SIM_P.photoHalf, sK=SIM_P.photoMotionK; SIM_P.photoHalf=photoHalf; SIM_P.photoMotionK=pmK;
  const w=new World(1500,seed,{...WORLD_P,lightBase:2.5}); w.nutrient.fill(1.5); const s=new Sim(w,{seed,cap:14000,eDensity:0}); s.seed(800);
  const H=TICKS/2|0; for(let t=0;t<TICKS;t++){s.step();if(t===H){s.photoIn.fill(0);s.preyIn.fill(0);s.scavIn.fill(0);}}
  let n=0,v=0,th=0,still=0,eL=0,eP=0,allStill=0,allN=0,allV=0;
  for(let i=0;i<s.cap;i++) if(s.alive[i]){allN++;const asp=Math.hypot(s.vx[i],s.vy[i]);allV+=asp;if(asp<0.05)allStill++;
    if(s.mouthCap[i]>1){n++;const sp=Math.hypot(s.vx[i],s.vy[i]);v+=sp;if(sp<0.05)still++;th+=s.thrust[i];eL+=s.photoIn[i];eP+=s.preyIn[i];}}
  SIM_P.photoHalf=sH; SIM_P.photoMotionK=sK; const eT=eL+eP||1;
  return {pop:s.pop(),n,vel:n?v/n:0,thrust:n?th/n:0,still:n?still/n*100:0,caza:eP/eT*100, allStill:allN?allStill/allN*100:0, allVel:allN?allV/allN:0};
}
function agg(ph,pmK){const rs=SEEDS.map(s=>run(ph,pmK,s)); const m=k=>rs.reduce((a,r)=>a+r[k],0)/rs.length; return {ph,pmK,pop:m('pop'),n:m('n'),vel:m('vel'),thrust:m('thrust'),still:m('still'),caza:m('caza'),allStill:m('allStill'),allVel:m('allVel')};}
console.log(`=== photoHalf × photoMotionK (eD=0, ${TICKS}t, media ${SEEDS.length} seeds) — foco: ¿de boca móviles? ===\n`);
console.log('phHalf | pMK | pop | conBoca | bocaVel | bocaMúsc | bocaQuietos% | caza% | TODOS quietos% | TODOS vel');
console.log('-------|-----|-----|---------|---------|----------|--------------|-------|----------------|----------');
for(const [ph,pmK] of [[40,2],[3,2],[3,1],[3,0.5],[3,0]]){const r=agg(ph,pmK);
  console.log(`${String(ph).padStart(6)} | ${String(pmK).padStart(3)} | ${r.pop.toFixed(0).padStart(3)} | ${r.n.toFixed(0).padStart(7)} | ${r.vel.toFixed(3).padStart(7)} | ${r.thrust.toFixed(2).padStart(8)} | ${r.still.toFixed(0).padStart(11)}% | ${r.caza.toFixed(0).padStart(4)}% | ${r.allStill.toFixed(0).padStart(13)}% | ${r.allVel.toFixed(3)}`);}
