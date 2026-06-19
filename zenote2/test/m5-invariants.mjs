// M5.3 — el CHECK CRÍTICO: con el ORGANISMO REAL (genoma→develop→fenotipo) sobre el mundo M4, ¿siguen pasando los
// invariantes de 2.1 §8? (conservación de materia · balance de energía/tick · calor monótono · no móvil perpetuo).
// + perf a escala.  uso: node zenote2/test/m5-invariants.mjs

import { World, WORLD_P } from '../src/engine/world.js';
import { Sim } from '../src/engine/sim.js';

function makeWorld(light) { return new World(1500, 1, { ...WORLD_P, lightBase: light ? 2.5 : 0 }); }
function initNutrient(w, perCell) { w.nutrient.fill(perCell); }
function totalMatter(s) { return s.world.totalNutrient() + s.world.totalDetritusM() + s.totalMass(); }
// M1: incluir la TRIPA (gut, añadida en M6.2) y la energía embebida en biomasa (mass·eD, M6.1) en la energía
// almacenada; omitirlas hacía que el balance de energía/tick reportara FALLO espurio con el motor actual.
function totalStored(s) { let g = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) g += s.gut[i] + s.mass[i] * s.eD; return s.totalE() + g + s.world.totalDetritusE(); }

// ---------- TEST A: luz ON → conservación + balance + persistencia + perf ----------
console.log('=== M5.3 — invariantes con el ORGANISMO REAL (2.1 §8) ===\n');
{
  const w = makeWorld(true); initNutrient(w, 1.5);
  const s = new Sim(w, { seed: 1, cap: 12000 }); s.seed(800);
  const budget = totalMatter(s);
  let prevStored = totalStored(s), prevHeat = w.heat, prevCap = w.lightCaptured;
  let maxMatterDrift = 0, maxEnergyResidual = 0, heatMonotone = true, lastHeat = w.heat;
  const TICKS = 3000, t0 = performance.now();
  for (let t = 0; t < TICKS; t++) {
    s.step();
    if (t % 500 === 0) { let e = 0, n = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) { e += s.E[i]; n++; } console.error(`    t=${t} pop=${n} meanE=${(n ? e / n : 0).toFixed(1)} N=${w.totalNutrient().toFixed(0)}`); }
    const md = Math.abs(totalMatter(s) - budget) / budget; if (md > maxMatterDrift) maxMatterDrift = md;
    const stored = totalStored(s), dCap = w.lightCaptured - prevCap, dHeat = w.heat - prevHeat;
    const residual = Math.abs((stored - prevStored) - (dCap - dHeat)); if (residual > maxEnergyResidual) maxEnergyResidual = residual;
    if (w.heat < lastHeat - 1e-9) heatMonotone = false; lastHeat = w.heat;
    prevStored = stored; prevHeat = w.heat; prevCap = w.lightCaptured;
  }
  const ms = (performance.now() - t0) / TICKS;
  console.log(`TEST A (luz ON, ${TICKS} ticks): pop final ${s.pop()} · perf ${(1000 / ms).toFixed(0)} t/s (${ms.toFixed(2)} ms/tick)`);
  console.log(`  1) Materia conservada ........ deriva máx ${(maxMatterDrift * 100).toExponential(2)}%  → ${maxMatterDrift < 1e-3 ? 'OK ✓' : 'FALLO ✗'}`);
  console.log(`  2) Balance de energía/tick ... residuo máx ${maxEnergyResidual.toExponential(2)}  → ${maxEnergyResidual < 1e-2 ? 'OK ✓' : 'FALLO ✗'}`);
  console.log(`  3) Calor monótono ............ ${heatMonotone ? 'OK ✓' : 'FALLO ✗'}`);
  console.log(`     (entró luz=${w.lightCaptured.toFixed(0)} · salió calor=${w.heat.toFixed(0)} · almacenada=${totalStored(s).toFixed(0)})`);
}

// ---------- TEST B: luz OFF → no móvil perpetuo ----------
{
  const w = makeWorld(false); initNutrient(w, 1.5);
  const s = new Sim(w, { seed: 1, cap: 12000 }); s.seed(800);
  const budget = totalMatter(s), stored0 = totalStored(s);
  let heatMonotone = true, lastHeat = w.heat, storedDown = true, lastStored = stored0;
  const TICKS = 6000;
  for (let t = 0; t < TICKS; t++) {
    s.step();
    if (w.heat < lastHeat - 1e-9) heatMonotone = false; lastHeat = w.heat;
    const st = totalStored(s); if (st > lastStored + 1e-6) storedDown = false; lastStored = st;
  }
  const storedEnd = totalStored(s), pop = s.pop(), matterDrift = Math.abs(totalMatter(s) - budget) / budget;
  console.log(`\nTEST B (luz OFF, ${TICKS} ticks) — "no móvil perpetuo":`);
  console.log(`  Energía almacenada ${stored0.toFixed(0)} → ${storedEnd.toFixed(3)}  → ${storedEnd < stored0 * 0.01 ? 'se APAGA ✓' : 'PERSISTE ✗'}`);
  console.log(`  Población ${pop}  → ${pop === 0 ? 'todos muertos ✓' : 'sobreviven sin luz ✗'}`);
  console.log(`  Energía sólo BAJA ${storedDown ? 'OK ✓' : 'FALLO ✗'} · calor monótono ${heatMonotone ? 'OK ✓' : 'FALLO ✗'} · materia conservada ${(matterDrift * 100).toExponential(2)}% ${matterDrift < 1e-3 ? '✓' : '✗'}`);
}
