// Valida el refactor "solo animales + vegetación parametrizada": CONSERVACIÓN (materia cerrada incl. veg; energía luz→calor
// con veg en el ledger) + que los animales SOBREVIVEN pastando. eD=0.
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';
import { develop } from '../../src/engine/genome.js';
import { computePhenotype, trophicRole } from '../../src/engine/phenotype.js';
import { START } from '../../src/config.js';
const ec = WORLD_P.vegEcoef;
const matter = s => s.world.totalNutrient() + s.world.totalVeg() + s.world.totalDetritusM() + s.totalMass();
const stored = s => { let e=0; for(let i=0;i<s.cap;i++) if(s.alive[i]) e += s.E[i]+s.gut[i]; return e + s.world.totalVeg()*ec + s.world.totalDetritusE(); };
const TICKS = 20000;
const w = new World(1500, 1, { ...WORLD_P, lightBase: START.lightBase }); w.nutrient.fill(START.nutrientInit); w.veg.fill(START.vegInit);
const s = new Sim(w, { seed: 1, cap: 14000 }); s.seed(800, 1, 1);
const budget = matter(s); let prevS = stored(s), prevH = w.heat, prevC = w.lightCaptured, maxMd=0, maxRes=0, hMono=true, lastH=w.heat;
for (let t=0;t<TICKS;t++){ s.step();
  const md=Math.abs(matter(s)-budget)/budget; if(md>maxMd)maxMd=md;
  const st=stored(s), dC=w.lightCaptured-prevC, dH=w.heat-prevH, res=Math.abs((st-prevS)-(dC-dH)); if(res>maxRes)maxRes=res;
  if(w.heat<lastH-1e-9)hMono=false; lastH=w.heat; prevS=st; prevH=w.heat; prevC=w.lightCaptured;
  if(t%5000===0){ const idx=[]; for(let i=0;i<s.cap;i++) if(s.alive[i])idx.push(i); const samp=idx.slice(0,300);
    let herb=0,carn=0; for(const i of samp){const r=trophicRole(computePhenotype(develop(s.genome[i]))); if(r==='carnivoro')carn++; else if(r==='herbivoro')herb++;}
    console.error(`  t=${String(t).padStart(5)} pop=${String(s.pop()).padStart(4)} veg=${w.totalVeg().toFixed(0)} herb/carn(muestra)=${herb}/${carn}`); } }
console.log(`\n=== refactor veg — ${TICKS} ticks, 800 fundadores ===`);
console.log(`pop final ${s.pop()} · veg total ${w.totalVeg().toFixed(0)} · nutriente ${w.totalNutrient().toFixed(0)}`);
console.log(`1) Materia conservada .... ${(maxMd*100).toExponential(2)}% → ${maxMd<1e-3?'OK ✓':'FALLO ✗'}`);
console.log(`2) Balance energía/tick .. ${maxRes.toExponential(2)} → ${maxRes<1e-2?'OK ✓':'FALLO ✗'}`);
console.log(`3) Calor monótono ........ ${hMono?'OK ✓':'FALLO ✗'}`);
console.log(`4) Población viva ........ ${s.pop()>0?'OK ✓':'EXTINTA ✗'}`);
