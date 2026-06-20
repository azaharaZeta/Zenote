// SPIKE #4 — ¿emerge un nicho/TIPO CARROÑERO al hacer el detrito (detritusE) comestible + sensor de ∇detrito?
// Mide a 25k ticks: balance (pop, het%), CONSERVACIÓN (no puede romperse), flujo poblacional de carroñeo, y —lo clave—
// el DESGLOSE DE INGRESO POR AGENTE en una ventana estacionaria: ¿cuántos organismos viven PRINCIPALMENTE de carroña?
// (scavFrac = carroña/(luz+caza+carroña) > 0.5 = carroñero dominante; eso es un TIPO emergente, no solo un flujo difuso).
//   uso: node zenote2/spikes/scavenger-niche/probe.mjs
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';

const TICKS = 25000;
function totalMatter(s) { return s.world.totalNutrient() + s.world.totalDetritusM() + s.totalMass(); }
function totalStored(s) { let e = 0; const eD = s.eD; for (let i = 0; i < s.cap; i++) if (s.alive[i]) e += s.E[i] + s.gut[i] + s.mass[i] * eD; return e + s.world.totalDetritusE(); }
function meanDetE(s) { return s.world.totalDetritusE() / (s.world.cols * s.world.rows); }

function run(scavRate, eD, decompose = WORLD_P.decompose) {
  SIM_P.scavRate = scavRate;
  const w = new World(1500, 1, { ...WORLD_P, lightBase: 2.5, decompose }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed: 1, cap: 14000, eDensity: eD }); s.seed(800);
  const budget = totalMatter(s);
  let prevStored = totalStored(s), prevHeat = w.heat, prevCap = w.lightCaptured;
  let maxMatterDrift = 0, maxEnergyResidual = 0;
  let prevScav = 0, prevCapForFlow = w.lightCaptured;
  let accPop = 0, accDetE = 0, accScavRate = 0, accPhotoRate = 0, nSamp = 0;
  const HALF = TICKS / 2 | 0;
  for (let t = 0; t < TICKS; t++) {
    s.step();
    if (t === HALF) { s.photoIn.fill(0); s.preyIn.fill(0); s.scavIn.fill(0); }   // ventana estacionaria de ingreso por agente
    const md = Math.abs(totalMatter(s) - budget) / budget; if (md > maxMatterDrift) maxMatterDrift = md;
    const stored = totalStored(s), dCap = w.lightCaptured - prevCap, dHeat = w.heat - prevHeat;
    const residual = Math.abs((stored - prevStored) - (dCap - dHeat)); if (residual > maxEnergyResidual) maxEnergyResidual = residual;
    prevStored = stored; prevHeat = w.heat; prevCap = w.lightCaptured;
    if (t >= HALF && t % 200 === 0) { accPop += s.pop(); accDetE += meanDetE(s);
      accScavRate += (s.scavenged - prevScav); accPhotoRate += (w.lightCaptured - prevCapForFlow);
      prevScav = s.scavenged; prevCapForFlow = w.lightCaptured; nSamp++; }
  }
  // DESGLOSE DE INGRESO POR AGENTE (ventana TICKS/2..TICKS): clasifica el oficio realizado de cada organismo vivo
  let nClass = 0, nScavDom = 0, nScavMix = 0, nPredDom = 0, nAutoDom = 0, sumScavFrac = 0, nHet = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) {
    const ph = s.photoIn[i], pr = s.preyIn[i], sc = s.scavIn[i], tot = ph + pr + sc;
    if (tot < 0.5) continue;   // sin ingreso medible en la ventana (recién nacido) → no clasifica
    nClass++; const fScav = sc / tot, fPred = pr / tot, fAuto = ph / tot;
    if (s.mouthCap[i] > 0) { nHet++; sumScavFrac += fScav; }
    if (fScav > 0.5) nScavDom++; else if (fScav > 0.2) nScavMix++;
    else if (fPred > 0.5) nPredDom++; else if (fAuto > 0.5) nAutoDom++;
  }
  return { scavRate, eD, pop: accPop / nSamp | 0, detE: accDetE / nSamp,
    photoFlow: accPhotoRate / nSamp, scavFlow: accScavRate / nSamp,
    nClass, nScavDom, nScavMix, nPredDom, nAutoDom, meanScavFracHet: nHet ? sumScavFrac / nHet : 0,
    matterOK: maxMatterDrift < 1e-3, energyOK: maxEnergyResidual < 1e-2, matterDrift: maxMatterDrift, energyRes: maxEnergyResidual };
}

console.log(`=== SPIKE carroñeo (sensor ∇detrito) — barrido de decompose (recurso de carroña), eD=4 scavRate=0.5 (${TICKS} ticks) ===\n`);
console.log('decomp |  pop | <detE> | carroñeo% | clasif | carroñero-dom (%) | carroñero-mix | pred-dom | <scavFrac het> | conserva');
console.log('-------|------|--------|-----------|--------|-------------------|---------------|----------|----------------|---------');
for (const dc of [0.02, 0.008, 0.003, 0.001]) {
  const r = run(0.5, 4, dc);
  const scavPct = (r.photoFlow + r.scavFlow) > 0 ? (r.scavFlow / (r.photoFlow + r.scavFlow) * 100) : 0;
  const domPct = r.nClass ? (r.nScavDom / r.nClass * 100) : 0;
  console.log(`${dc.toFixed(3).padStart(6)} | ${String(r.pop).padStart(4)} | ${r.detE.toFixed(3).padStart(6)} | ${scavPct.toFixed(1).padStart(8)}% | ${String(r.nClass).padStart(6)} | ${String(r.nScavDom).padStart(6)} (${domPct.toFixed(1).padStart(4)}%)   | ${String(r.nScavMix).padStart(13)} | ${String(r.nPredDom).padStart(8)} | ${r.meanScavFracHet.toFixed(3).padStart(14)} | ${(r.matterOK && r.energyOK) ? 'OK ✓' : `✗ m=${r.matterDrift.toExponential(1)} e=${r.energyRes.toExponential(1)}`}`);
}
SIM_P.scavRate = 0;   // restaura
