// ¿El coste de boca produce DIFERENCIACIÓN DE NICHO en la morfología de ingesta? Mide mouthCap medio por oficio (dieta)
// con mouthCost 0 vs 0.001. RESULTADO: a 0 ambos inflados sin señal; a 0.001 el CARNÍVORO invierte ~2× más boca que el
// herbívoro → la morfología de ingesta refleja el nicho (la boca grande del depredador paga su coste manejando presa; el
// pastador la recorta a lo funcional). "Boca bajo selección" = emergente. uso: node zenote2/spikes/mouth-cost/role.mjs
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';
const role = (v, p, s) => { const t = v + p + s; if (t < 0.5) return 0; const c = (p + s) / t; return c > 0.6 ? 1 : c < 0.25 ? 0 : 2; };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
console.log('mouthCap medio por oficio (20k):\n');
for (const mc of [0, 0.001]) {
  const saved = SIM_P.mouthCost; SIM_P.mouthCost = mc; let line = `  mouthCost=${mc.toFixed(3)}: `;
  for (const seed of [1, 2]) {
    const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5); w.veg.fill(1.0);
    const s = new Sim(w, { seed, cap: 4000 }); s.seed(800);
    for (let t = 0; t < 20000; t++) s.step();
    const h = [], c = []; for (let i = 0; i < s.cap; i++) if (s.alive[i]) { const r = role(s.vegIn[i], s.preyIn[i], s.scavIn[i]); if (r === 0) h.push(s.mouthCap[i]); else if (r === 1) c.push(s.mouthCap[i]); }
    line += `[s${seed} herb=${mean(h).toFixed(1)} carn=${mean(c).toFixed(1)}] `;
  }
  SIM_P.mouthCost = saved; console.log(line);
}
console.log('\n→ a 0.001 el cazador mantiene boca ~2× la del herbívoro: la morfología de ingesta refleja el nicho (emergente).');
