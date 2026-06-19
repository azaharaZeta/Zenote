// SONDA — "surgen autótrofos con movimiento y pocos heterótrofos" (idea de usuario). En el mundo real el movimiento es
// de los heterótrofos (buscan comida); los autótrofos (plantas) son sésiles (la comida=luz les llega). ¿Pasa eso aquí?
// Mide, en estado estacionario: velocidad real e inversión en músculo por OFICIO trófico, si el movimiento del autótrofo
// es ADAPTATIVO (¿los autótrofos que se mueven viven/comen más?) y la fracción heterótrofa.
//   uso: node zenote2/spikes/movement-by-trophic/probe.mjs [ticks]

import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim } from '../../src/engine/sim.js';
import { trophicCode } from '../../src/engine/phenotype.js';

const TICKS = +(process.argv[2] || 15000), SEEDS = [1, 2, 3];
const NAMES = ['autótrofo', 'heterótrofo', 'mixótrofo'];

for (const seed of SEEDS) {
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed, cap: 12000 }); s.seed(800);
  for (let t = 0; t < TICKS; t++) s.step();

  // acumuladores por oficio: n, Σvelocidad real, Σvmax, Σthrust, nº "en movimiento" (spd>0.3), Σenergía, Σedad
  const n = [0, 0, 0], spd = [0, 0, 0], vmax = [0, 0, 0], thr = [0, 0, 0], moving = [0, 0, 0], en = [0, 0, 0], age = [0, 0, 0];
  // para adaptatividad del movimiento del autótrofo: energía y edad de móviles vs quietos
  let aMovN = 0, aMovE = 0, aMovAge = 0, aStillN = 0, aStillE = 0, aStillAge = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) {
    const r = trophicCode(s.photoCap[i], s.thrust[i], s.mouthCap[i]);
    const v = Math.hypot(s.vx[i], s.vy[i]);
    n[r]++; spd[r] += v; vmax[r] += s.vmax[i]; thr[r] += s.thrust[i]; en[r] += s.E[i]; age[r] += s.age[i]; if (v > 0.3) moving[r]++;
    if (r === 0) { if (v > 0.3) { aMovN++; aMovE += s.E[i]; aMovAge += s.age[i]; } else { aStillN++; aStillE += s.E[i]; aStillAge += s.age[i]; } }
  }
  const pop = n[0] + n[1] + n[2];
  console.log(`\n=== seed ${seed} · ${TICKS} ticks · pop ${pop} ===`);
  for (let r = 0; r < 3; r++) if (n[r]) console.log(
    `  ${NAMES[r].padEnd(11)} n=${String(n[r]).padStart(4)} (${(n[r] / pop * 100).toFixed(0).padStart(2)}%) · vel.real ${(spd[r] / n[r]).toFixed(2)} · vmax ${(vmax[r] / n[r]).toFixed(2)} · músculo(thrust) ${(thr[r] / n[r]).toFixed(2)} · en movim. ${(moving[r] / n[r] * 100).toFixed(0)}%`);
  if (aMovN && aStillN) console.log(
    `  ¿movimiento del AUTÓTROFO adaptativo? móviles: E=${(aMovE / aMovN).toFixed(1)} edad=${(aMovAge / aMovN).toFixed(0)} (n=${aMovN}) · quietos: E=${(aStillE / aStillN).toFixed(1)} edad=${(aStillAge / aStillN).toFixed(0)} (n=${aStillN})`);
}
