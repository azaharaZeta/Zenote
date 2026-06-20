// A1 — REGRESIÓN de conservación bajo SATURACIÓN DEL POOL. Cubre el hueco que la auditoría técnica marcó (A1): cuando
// `freeTop` se agota, los nacimientos diferidos no pueden materializarse; si el progenitor YA pagó energía y
// `_takeNutrientAround` YA retiró nutriente, esa materia/energía se PERDERÍAN (medido: −38% de materia con el pool
// lleno). El fix reserva el slot ANTES de cobrar (sim.js). Este test fuerza la saturación (cap pequeño + luz/nutriente
// abundantes → la población se clava en el techo) y verifica que materia + energía SIGUEN conservándose.
//   Pre-fix este test FALLA (deriva de materia grande); post-fix conserva.  uso: node zenote2/test/m5-saturation.mjs

import { World, WORLD_P } from '../src/engine/world.js';
import { Sim } from '../src/engine/sim.js';

function totalMatter(s) { return s.world.totalNutrient() + s.world.totalVeg() + s.world.totalDetritusM() + s.totalMass(); }
function totalStored(s) { let g = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) g += s.gut[i] + s.mass[i] * s.eD; return s.totalE() + g + s.world.totalVeg() * WORLD_P.vegEcoef + s.world.totalDetritusE(); }

console.log('=== A1 — conservación bajo SATURACIÓN del pool ===\n');

const CAP = 250, TICKS = 4000;   // cap << capacidad de carga (~750) → el pool se satura y se mantiene lleno
const w = new World(1500, 1, { ...WORLD_P, lightBase: 2.5 });
w.nutrient.fill(1.5); w.veg.fill(1.0);
const s = new Sim(w, { seed: 1, cap: CAP }); s.seed(300);   // seed > cap → arranca lleno

const budget = totalMatter(s);
let prevStored = totalStored(s), prevHeat = w.heat, prevCap = w.lightCaptured;
let maxMatterDrift = 0, maxEnergyResidual = 0, minFree = s.freeTop, ticksFull = 0;
for (let t = 0; t < TICKS; t++) {
  s.step();
  if (s.freeTop < minFree) minFree = s.freeTop;
  if (s.freeTop === 0) ticksFull++;
  const md = Math.abs(totalMatter(s) - budget) / budget; if (md > maxMatterDrift) maxMatterDrift = md;
  const stored = totalStored(s), dCap = w.lightCaptured - prevCap, dHeat = w.heat - prevHeat;
  const residual = Math.abs((stored - prevStored) - (dCap - dHeat)); if (residual > maxEnergyResidual) maxEnergyResidual = residual;
  prevStored = stored; prevHeat = w.heat; prevCap = w.lightCaptured;
}

const saturated = minFree === 0 && ticksFull > 10;   // precondición: el pool se llenó de verdad (test no vacío)
const matterOK = maxMatterDrift < 1e-3, energyOK = maxEnergyResidual < 1e-2;
console.log(`cap=${CAP} · pop final ${s.pop()} · minFree=${minFree} · ticks con pool lleno=${ticksFull}/${TICKS}`);
console.log(`  0) Pool realmente SATURADO ... ${saturated ? 'OK ✓' : 'NO (test vacío — sube seed/luz) ✗'}`);
console.log(`  1) Materia conservada ........ deriva máx ${(maxMatterDrift * 100).toExponential(2)}%  → ${matterOK ? 'OK ✓' : 'FALLO ✗'}`);
console.log(`  2) Balance de energía/tick ... residuo máx ${maxEnergyResidual.toExponential(2)}  → ${energyOK ? 'OK ✓' : 'FALLO ✗'}`);

process.exit(saturated && matterOK && energyOK ? 0 : 1);
