import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim } from '../../src/engine/sim.js';
import { START } from '../../src/config.js';
// corr(veg, light0) en estacionario: si la veg sigue a la luz, corr alta y SE MUEVE con la deriva.
function corr(a,b){ let n=a.length,sa=0,sb=0; for(let i=0;i<n;i++){sa+=a[i];sb+=b[i];} const ma=sa/n,mb=sb/n; let cov=0,va=0,vb=0; for(let i=0;i<n;i++){const da=a[i]-ma,db=b[i]-mb;cov+=da*db;va+=da*da;vb+=db*db;} return cov/Math.sqrt(va*vb||1); }
for(const lf of [0.00012, 0.0004]){
  const w=new World(1500,1,{...WORLD_P,lightBase:START.lightBase,lightFlow:lf}); w.nutrient.fill(START.nutrientInit); w.veg.fill(START.vegInit);
  const s=new Sim(w,{seed:1,cap:14000}); s.seed(800,1,1);
  for(let t=0;t<8000;t++) s.step();
  const veg1=w.veg.slice(), c1=corr(veg1, w.light0);
  for(let t=0;t<2000;t++) s.step();
  let moved=0; for(let i=0;i<veg1.length;i++) moved+=Math.abs(w.veg[i]-veg1[i]); moved/=veg1.length;
  console.log(`lf=${lf}: corr(veg,luz)=${c1.toFixed(2)} · cambio medio de veg en 2000t=${moved.toFixed(2)} · pop=${s.pop()} · vegTot=${w.totalVeg()|0}`);
}
