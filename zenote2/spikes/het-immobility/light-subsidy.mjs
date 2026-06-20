// DIAGNÓSTICO PROFUNDO — ¿el INMOVILISMO viene del SUBSIDIO de fotosíntesis? (el problema es anterior a la carroña → eD=0).
// Hipótesis: la fotosíntesis está disponible para TODOS (incluso los de boca) y photoMotionK premia la quietud → sentarse a
// fotosintetizar + atrapar pasivo gana a cazar activamente → nadie invierte en músculo/movimiento. PREDICCIÓN: si bajamos la
// LUZ (menos subsidio), o quitamos el bonus de quietud (photoMotionK=0), debería aparecer músculo y movimiento.
// Grid: lightMul × photoMotionK, eD=0, 25k ticks. Reporta movilidad y de qué viven los de boca (mouthCap>0).
//   uso: node zenote2/spikes/het-immobility/light-subsidy.mjs
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';

const TICKS = 25000;
function run(lightMul, pmK) {
  const savedPmK = SIM_P.photoMotionK; SIM_P.photoMotionK = pmK;
  const w = new World(1500, 1, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5); w.lightMul = lightMul;
  const s = new Sim(w, { seed: 1, cap: 14000, eDensity: 0 }); s.seed(800);
  const HALF = TICKS / 2 | 0;
  for (let t = 0; t < TICKS; t++) { s.step(); if (t === HALF) { s.photoIn.fill(0); s.preyIn.fill(0); s.scavIn.fill(0); } }
  // foco: organismos con BOCA (mouthCap>0) = los que PODRÍAN cazar
  let n = 0, v = 0, th = 0, pc = 0, still = 0, eL = 0, eP = 0, eS = 0, pop = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) { pop++;
    if (s.mouthCap[i] > 1) { n++; const sp = Math.hypot(s.vx[i], s.vy[i]); v += sp; if (sp < 0.05) still++;
      th += s.thrust[i]; pc += s.photoCap[i]; eL += s.photoIn[i]; eP += s.preyIn[i]; eS += s.scavIn[i]; } }
  SIM_P.photoMotionK = savedPmK;
  const eTot = eL + eP + eS || 1;
  return { lightMul, pmK, pop, nMouth: n, vel: n ? v / n : 0, thrust: n ? th / n : 0, photoCap: n ? pc / n : 0,
    stillPct: n ? still / n * 100 : 0, luz: eL / eTot * 100, caza: eP / eTot * 100 };
}

console.log(`=== ¿Subsidio de fotosíntesis → inmovilismo? Grid lightMul × photoMotionK (eD=0, ${TICKS} ticks) ===\n`);
console.log('lightMul | pMK | pop | conBoca | <vel> | <thrust> | quietos% | <photoCap> | energía boca: luz/caza');
console.log('---------|-----|-----|---------|-------|----------|----------|------------|-----------------------');
for (const pmK of [2, 0]) for (const lm of [1.0, 0.5, 0.3, 0.18]) {
  const r = run(lm, pmK);
  console.log(`${lm.toFixed(2).padStart(8)} | ${String(r.pmK).padStart(3)} | ${String(r.pop).padStart(3)} | ${String(r.nMouth).padStart(7)} | ${r.vel.toFixed(3)} | ${r.thrust.toFixed(2).padStart(8)} | ${r.stillPct.toFixed(0).padStart(7)}% | ${r.photoCap.toFixed(1).padStart(10)} | ${r.luz.toFixed(0)}/${r.caza.toFixed(0)}%`);
}
