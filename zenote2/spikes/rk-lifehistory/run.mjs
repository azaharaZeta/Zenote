// SPIKE r/K — ¿diverge el eje r↔K ahora que reproE/investE son genes (reproK/investFrac)?
// RESULTADO (medido): NO. Near-neutral en la pecera cerrada y saturada (natalidad limitada por MATERIA local, no por fecundidad
// → calidad K ≥ cantidad r). Tampoco bajo disturbio. Ver docs/Zenote 2.0/ideas/auditoria-zenote2-2026-06-20.md §5.
//   uso: node zenote2/spikes/rk-lifehistory/run.mjs [ticks] [seeds]
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';

const ms = (a) => { const n = a.length || 1; let m = 0; for (const v of a) m += v; m /= n; let s = 0; for (const v of a) s += (v - m) ** 2; return { m, s: Math.sqrt(s / n) }; };
function snap(s) {
  const rk = [], inv = [], rkH = [], rkC = [], invH = [], invC = [];
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) { rk.push(s.reproK[i]); inv.push(s.investFrac[i]);
    const v = s.vegIn[i], p = s.preyIn[i], c = s.scavIn[i], t = v + p + c, carn = t < 0.5 ? 0 : (p + c) / t;
    if (t >= 0.5) { if (carn > 0.6) { rkC.push(s.reproK[i]); invC.push(s.investFrac[i]); } else if (carn < 0.25) { rkH.push(s.reproK[i]); invH.push(s.investFrac[i]); } } }
  return { pop: rk.length, rk: ms(rk), inv: ms(inv), rkH: ms(rkH), rkC: ms(rkC), invH: ms(invH), invC: ms(invC) };
}
function evolve(seed, ticks, mutW = {}, baseCost = SIM_P.baseCost) {
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5, ...mutW }); w.nutrient.fill(1.5); w.veg.fill(1.0);
  const saved = SIM_P.baseCost; SIM_P.baseCost = baseCost;
  const s = new Sim(w, { seed, cap: 4000 }); s.seed(800);
  for (let t = 0; t < ticks; t++) s.step();
  const r = snap(s); SIM_P.baseCost = saved; return r;
}

const TICKS = +(process.argv[2] || 30000);
const seeds = process.argv[3] ? process.argv[3].split(',').map(Number) : [1, 2];
console.log(`SPIKE r/K — divergencia del eje (fundador reproK=1.0, investFrac=0.44). Rangos reproK[0.5,2] investFrac[0.2,0.8].\n`);
console.log('Si r/K divergiera: investFrac caería (r) o se partiría (std alta) y diferiría por nicho. MEDIDO: no pasa.\n');
for (const seed of seeds) {
  console.log(`-- seed ${seed} (${TICKS} ticks) --`);
  const a = evolve(seed, TICKS);
  console.log(`  ESTABLE      reproK ${a.rk.m.toFixed(2)}±${a.rk.s.toFixed(2)}  investFrac ${a.inv.m.toFixed(2)}±${a.inv.s.toFixed(2)}  (herb|carn investF ${a.invH.m.toFixed(2)}|${a.invC.m.toFixed(2)})  pop ${a.pop}`);
  const b = evolve(seed, TICKS, { lightFlow: 0.004 });
  console.log(`  FLUJO×10     reproK ${b.rk.m.toFixed(2)}±${b.rk.s.toFixed(2)}  investFrac ${b.inv.m.toFixed(2)}±${b.inv.s.toFixed(2)}  pop ${b.pop}`);
  const c = evolve(seed, TICKS, {}, 0.045);
  console.log(`  MORTAL×3     reproK ${c.rk.m.toFixed(2)}±${c.rk.s.toFixed(2)}  investFrac ${c.inv.m.toFixed(2)}±${c.inv.s.toFixed(2)}  pop ${c.pop}`);
  console.log('');
}
console.log('Conclusión: r/K near-neutral en todos los regímenes → genes mantenidos (dial→gen) pero r/K NO se persigue (exige dinámica abierta/no saturada).');
