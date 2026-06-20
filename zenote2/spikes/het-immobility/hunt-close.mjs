// PROTOTIPO A — CAPTURA EXIGE ACERCARSE (huntCloseMin). ¿Crea cazadores MÓVILES sin colapsar? Sweep a eD=0 (régimen anterior
// a la carroña). Criterios de muerte: (1) los de boca se MUEVEN y ganan MÚSCULO (inmovilidad → residual); (2) la caza pasa a
// ser fuente REAL de energía (no trampa pasiva); (3) los de boca NO se extinguen y la población no colapsa.
//   uso: node zenote2/spikes/het-immobility/hunt-close.mjs
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';

const TICKS = 25000;
function run(huntCloseMin, eD) {
  const saved = SIM_P.huntCloseMin; SIM_P.huntCloseMin = huntCloseMin;
  const w = new World(1500, 1, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed: 1, cap: 14000, eDensity: eD }); s.seed(800);
  const HALF = TICKS / 2 | 0;
  for (let t = 0; t < TICKS; t++) { s.step(); if (t === HALF) { s.photoIn.fill(0); s.preyIn.fill(0); s.scavIn.fill(0); } }
  let n = 0, v = 0, th = 0, still = 0, eL = 0, eP = 0, eS = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i] && s.mouthCap[i] > 1) { n++; const sp = Math.hypot(s.vx[i], s.vy[i]);
    v += sp; if (sp < 0.05) still++; th += s.thrust[i]; eL += s.photoIn[i]; eP += s.preyIn[i]; eS += s.scavIn[i]; }
  SIM_P.huntCloseMin = saved;
  const eTot = eL + eP + eS || 1;
  return { huntCloseMin, eD, pop: s.pop(), nMouth: n, vel: n ? v / n : 0, thrust: n ? th / n : 0,
    stillPct: n ? still / n * 100 : 0, luz: eL / eTot * 100, caza: eP / eTot * 100, carr: eS / eTot * 100, kills: s.kills };
}

for (const eD of [0, 4]) {
  console.log(`\n=== huntCloseMin sweep — eD=${eD}, ${TICKS} ticks, seed 1 ===`);
  console.log('huntClose | pop | conBoca | <vel> | <thrust> | quietos% | energía boca: luz/caza/carroña | kills');
  console.log('----------|-----|---------|-------|----------|----------|-------------------------------|------');
  for (const hc of [0, 0.05, 0.15, 0.4]) {
    const r = run(hc, eD);
    console.log(`${hc.toFixed(2).padStart(9)} | ${String(r.pop).padStart(3)} | ${String(r.nMouth).padStart(7)} | ${r.vel.toFixed(3)} | ${r.thrust.toFixed(2).padStart(8)} | ${r.stillPct.toFixed(0).padStart(7)}% | ${r.luz.toFixed(0).padStart(8)}/${r.caza.toFixed(0)}/${r.carr.toFixed(0)}%            | ${String(r.kills).padStart(5)}`);
  }
}
