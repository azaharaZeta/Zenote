// DIAGNÓSTICO — INMOVILISMO EN HETERÓTROFOS. El usuario observa heterótrofos quietos (debería ser residual: la quietud es el
// nicho del AUTÓTROFO vía photoMotionK; el heterótrofo debería MOVERSE a cazar/rastrear). ¿Qué recompensa su inmovilidad?
// Mide a 25k ticks (config default actual) y desglosa por OFICIO: velocidad, vmax, morfología (photoCap/thrust/mouthCap) y
// ORIGEN de energía por agente (luz/caza/carroña, ventana estacionaria). Si los heterótrofos inmóviles viven de LUZ residual
// (mixótrofos que se quedan quietos por el bonus de photoMotionK) o de CARROÑA (sentados sobre detrito) → ahí está la causa.
//   uso: node zenote2/spikes/het-immobility/probe.mjs
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';
import { trophicCode } from '../../src/engine/phenotype.js';

const TICKS = 25000;
function run(eD = SIM_P.eDensity) {
  const w = new World(1500, 1, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed: 1, cap: 14000, eDensity: eD }); s.seed(800);
  const HALF = TICKS / 2 | 0;
  for (let t = 0; t < TICKS; t++) { s.step(); if (t === HALF) { s.photoIn.fill(0); s.preyIn.fill(0); s.scavIn.fill(0); } }
  // clasifica vivos por oficio MORFOLÓGICO (trophicCode: 0 auto · 1 het · 2 mixo) y agrega
  const G = [[], [], []];   // índices por rol
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) G[trophicCode(s.photoCap[i], s.thrust[i], s.mouthCap[i])].push(i);
  const names = ['AUTÓTROFO', 'HETERÓTROFO', 'MIXÓTROFO'];
  const spd = i => Math.hypot(s.vx[i], s.vy[i]);
  console.log(`\n=== INMOVILISMO HETERÓTROFO — ${TICKS} ticks, seed 1 ===`);
  console.log(`pop=${s.pop()}  eD=${s.eD} scavRate=${SIM_P.scavRate} photoMotionK=${SIM_P.photoMotionK} lightFlow=${w.P.lightFlow}\n`);
  console.log('oficio       |   n  | <vel> | <vmax> | quietos% | <photoCap> | <thrust> | <mouthCap> | energía: luz/caza/carroña');
  console.log('-------------|------|-------|--------|----------|------------|----------|------------|--------------------------');
  for (let g = 0; g < 3; g++) { const idx = G[g]; if (!idx.length) { console.log(`${names[g].padEnd(12)} |    0 |`); continue; }
    let v = 0, vm = 0, still = 0, pc = 0, th = 0, mc = 0, eL = 0, eP = 0, eS = 0;
    for (const i of idx) { const sp = spd(i); v += sp; vm += s.vmax[i]; if (sp < 0.05) still++;
      pc += s.photoCap[i]; th += s.thrust[i]; mc += s.mouthCap[i]; eL += s.photoIn[i]; eP += s.preyIn[i]; eS += s.scavIn[i]; }
    const n = idx.length, eTot = eL + eP + eS || 1;
    console.log(`${names[g].padEnd(12)} | ${String(n).padStart(4)} | ${(v / n).toFixed(3)} | ${(vm / n).toFixed(3).padStart(6)} | ${(still / n * 100).toFixed(0).padStart(7)}% | ${(pc / n).toFixed(2).padStart(10)} | ${(th / n).toFixed(2).padStart(8)} | ${(mc / n).toFixed(2).padStart(10)} | ${(eL / eTot * 100).toFixed(0)}/${(eP / eTot * 100).toFixed(0)}/${(eS / eTot * 100).toFixed(0)}%`);
  }
  // FOCO: heterótrofos+mixótrofos QUIETOS (vel<0.05) — ¿de qué viven y pueden moverse?
  const movers = [...G[1], ...G[2]];
  const stillH = movers.filter(i => spd(i) < 0.05);
  if (stillH.length) { let eL = 0, eP = 0, eS = 0, vm = 0, pc = 0, th = 0;
    for (const i of stillH) { eL += s.photoIn[i]; eP += s.preyIn[i]; eS += s.scavIn[i]; vm += s.vmax[i]; pc += s.photoCap[i]; th += s.thrust[i]; }
    const n = stillH.length, eTot = eL + eP + eS || 1;
    console.log(`\nHET/MIXO QUIETOS (vel<0.05): ${n} de ${movers.length} (${(n / movers.length * 100).toFixed(0)}%)`);
    console.log(`  viven de: luz ${(eL / eTot * 100).toFixed(0)}% · caza ${(eP / eTot * 100).toFixed(0)}% · carroña ${(eS / eTot * 100).toFixed(0)}%`);
    console.log(`  <vmax>=${(vm / n).toFixed(3)} (¿pueden moverse?) · <photoCap>=${(pc / n).toFixed(1)} · <thrust>=${(th / n).toFixed(2)}`);
  }
}
for (const eD of [0, 1, 2, 4]) { console.log(`\n################# eD=${eD} #################`); run(eD); }
