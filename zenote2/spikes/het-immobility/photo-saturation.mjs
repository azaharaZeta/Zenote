// PROTOTIPO B-físico — SATURACIÓN DE FOTOSÍNTESIS DURA (bajar photoHalf). Hipótesis del usuario: hoy se SOBREINVIERTE en
// foto (photoCap 80-130 con saturación en 40) → si satura antes, el exceso de foto no renta → presión de presupuesto para
// diversificar a boca/músculo/movimiento. photoHalf YA es parámetro → solo lo barro (sin tocar código). eD=0, multi-seed.
// Criterios: ¿baja photoCap (menos sobreinversión)? ¿suben vel/músculo/caza de los de boca (menos inmovilidad)? ¿no colapsa?
//   uso: node zenote2/spikes/het-immobility/photo-saturation.mjs
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';

const TICKS = 25000, SEEDS = [1, 2, 3];
function run(photoHalf, seed) {
  const saved = SIM_P.photoHalf; SIM_P.photoHalf = photoHalf;
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed, cap: 14000, eDensity: 0 }); s.seed(800);
  const HALF = TICKS / 2 | 0;
  for (let t = 0; t < TICKS; t++) { s.step(); if (t === HALF) { s.photoIn.fill(0); s.preyIn.fill(0); s.scavIn.fill(0); } }
  let pcAll = 0, nAll = 0, n = 0, v = 0, th = 0, pc = 0, still = 0, eL = 0, eP = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) { nAll++; pcAll += s.photoCap[i];
    if (s.mouthCap[i] > 1) { n++; const sp = Math.hypot(s.vx[i], s.vy[i]); v += sp; if (sp < 0.05) still++; th += s.thrust[i]; pc += s.photoCap[i]; eL += s.photoIn[i]; eP += s.preyIn[i]; } }
  SIM_P.photoHalf = saved; const eT = eL + eP || 1;
  return { pop: s.pop(), pcAll: nAll ? pcAll / nAll : 0, n, vel: n ? v / n : 0, thrust: n ? th / n : 0,
    pcMouth: n ? pc / n : 0, still: n ? still / n * 100 : 0, caza: eP / eT * 100 };
}
function agg(photoHalf) { const rs = SEEDS.map(s => run(photoHalf, s)); const m = k => rs.reduce((a, r) => a + r[k], 0) / rs.length;
  return { photoHalf, pop: m('pop'), pcAll: m('pcAll'), n: m('n'), vel: m('vel'), thrust: m('thrust'), pcMouth: m('pcMouth'),
    still: m('still'), caza: m('caza'), velRange: `${Math.min(...rs.map(r => r.vel)).toFixed(2)}-${Math.max(...rs.map(r => r.vel)).toFixed(2)}` }; }

console.log(`=== Saturación de foto dura — sweep photoHalf (eD=0, ${TICKS} ticks, media de ${SEEDS.length} seeds) ===\n`);
console.log('photoHalf | pop | <photoCap todos> | conBoca | <photoCap boca> | <vel> (rango) | <thrust> | quietos% | caza%');
console.log('----------|-----|------------------|---------|-----------------|---------------|----------|----------|------');
for (const ph of [40, 20, 10, 6]) { const r = agg(ph);
  console.log(`${String(ph).padStart(9)} | ${r.pop.toFixed(0).padStart(3)} | ${r.pcAll.toFixed(1).padStart(16)} | ${r.n.toFixed(0).padStart(7)} | ${r.pcMouth.toFixed(1).padStart(15)} | ${r.vel.toFixed(3)} (${r.velRange}) | ${r.thrust.toFixed(2).padStart(8)} | ${r.still.toFixed(0).padStart(7)}% | ${r.caza.toFixed(0)}%`);
}
