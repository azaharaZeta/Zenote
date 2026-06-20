import { World, WORLD_P } from '../../src/engine/world.js';
function drift(lf, ticks){ const w=new World(1500,1,{...WORLD_P,lightBase:2.5,lightFlow:lf});
  const a=w.light0.slice(); for(let t=0;t<ticks;t++) w.stepLight(t); const b=w.light0.slice();
  let maxd=0; for(let i=0;i<a.length;i++) maxd=Math.max(maxd,Math.abs(a[i]-b[i])); return maxd; }
console.log('lightFlowEvery=', WORLD_P.lightFlowEvery, '· default lightFlow=', WORLD_P.lightFlow);
for(const lf of [0, 0.00012, 0.0004, 0.0008]){
  console.log(`lightFlow=${lf}: maxΔlight0 en 5000t = ${drift(lf,5000).toFixed(3)} · en 1000t = ${drift(lf,1000).toFixed(3)}`); }
