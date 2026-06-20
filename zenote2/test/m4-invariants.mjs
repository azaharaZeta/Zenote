// M4 — VALIDACIÓN de las leyes del MUNDO: la VEGETACIÓN (productor parametrizado) + descomposición + difusión deben
// CONSERVAR. La luz ya no la captan los organismos sino la vegetación (world.vegStep), así que aquí se ejercita el mundo
// SIN organismos (los animales se prueban en m5/m6). Invariantes:
//   1) MATERIA conservada (Σ nutrient + veg + detritusM = budget, deriva ≈0)
//   2) BALANCE de ENERGÍA por tick (Δalmacenada = luz captada − calor; almacenada = veg·vegEcoef + detritusE)
//   3) CALOR monótono no decreciente
//   4) Sin LUZ: la vegetación no crece, senesce a 0 → la energía almacenada → 0 (no hay productor perpetuo); materia sigue conservada
//   uso: node zenote2/test/m4-invariants.mjs

import { World, WORLD_P } from '../src/engine/world.js';

const ec = WORLD_P.vegEcoef;
const matter = (w) => w.totalNutrient() + w.totalVeg() + w.totalDetritusM();
const stored = (w) => w.totalVeg() * ec + w.totalDetritusE();
function makeWorld(light) { const w = new World(1500, 1, { ...WORLD_P, lightBase: light ? 2.5 : 0 }); w.nutrient.fill(1.5); w.veg.fill(0.5); return w; }
function tick(w) { w.vegStep(); w.decomposeStep(); w.diffuseStep(); }

console.log('=== M4 — invariantes de las leyes del mundo (vegetación + ciclo de materia) ===\n');

// ---------- TEST A: luz ON → conservación + balance + persistencia de la vegetación ----------
{
  const w = makeWorld(true);
  const budget = matter(w);
  let prevS = stored(w), prevH = w.heat, prevC = w.lightCaptured;
  let maxMd = 0, maxRes = 0, heatMono = true, lastH = w.heat;
  const TICKS = 3000;
  for (let t = 0; t < TICKS; t++) {
    tick(w);
    const md = Math.abs(matter(w) - budget) / budget; if (md > maxMd) maxMd = md;
    const st = stored(w), dC = w.lightCaptured - prevC, dH = w.heat - prevH;
    const res = Math.abs((st - prevS) - (dC - dH)); if (res > maxRes) maxRes = res;
    if (w.heat < lastH - 1e-9) heatMono = false; lastH = w.heat;
    prevS = st; prevH = w.heat; prevC = w.lightCaptured;
  }
  console.log(`TEST A (luz ON, ${TICKS} ticks): veg total ${w.totalVeg().toFixed(0)} · nutriente ${w.totalNutrient().toFixed(0)}`);
  console.log(`  1) Materia conservada ........ deriva máx ${(maxMd * 100).toExponential(2)}%  → ${maxMd < 1e-4 ? 'OK ✓' : 'FALLO ✗'}`);
  console.log(`  2) Balance de energía/tick ... residuo máx ${maxRes.toExponential(2)}  → ${maxRes < 1e-2 ? 'OK ✓' : 'FALLO ✗'}`);
  console.log(`  3) Calor monótono ............ ${heatMono ? 'OK ✓' : 'FALLO ✗'}`);
  console.log(`     (entró luz=${w.lightCaptured.toFixed(0)} · salió calor=${w.heat.toFixed(0)} · almacenada=${stored(w).toFixed(0)})`);
  var okA = maxMd < 1e-4 && maxRes < 1e-2 && heatMono;
}

// ---------- TEST B: luz OFF → la vegetación se apaga (no productor perpetuo) ----------
{
  const w = makeWorld(false);
  const budget = matter(w), stored0 = stored(w);
  let heatMono = true, lastH = w.heat, storedDown = true, lastS = stored0;
  const TICKS = 4000;
  for (let t = 0; t < TICKS; t++) {
    tick(w);
    if (w.heat < lastH - 1e-9) heatMono = false; lastH = w.heat;
    const st = stored(w); if (st > lastS + 1e-6) storedDown = false; lastS = st;
  }
  const storedEnd = stored(w), drift = Math.abs(matter(w) - budget) / budget;
  console.log(`\nTEST B (luz OFF, ${TICKS} ticks) — "no productor perpetuo":`);
  console.log(`  Energía almacenada ${stored0.toFixed(0)} → ${storedEnd.toFixed(3)}  → ${storedEnd < stored0 * 0.01 ? 'se APAGA ✓' : 'PERSISTE ✗'}`);
  console.log(`  Vegetación ${w.totalVeg().toFixed(3)}  → ${w.totalVeg() < 1 ? 'senesció ✓' : 'persiste sin luz ✗'}`);
  console.log(`  Energía sólo BAJA ${storedDown ? 'OK ✓' : 'FALLO ✗'} · calor monótono ${heatMono ? 'OK ✓' : 'FALLO ✗'} · materia conservada ${(drift * 100).toExponential(2)}% ${drift < 1e-4 ? '✓' : '✗'}`);
  var okB = storedEnd < stored0 * 0.01 && w.totalVeg() < 1 && storedDown && heatMono && drift < 1e-4;
}

process.exit(okA && okB ? 0 : 1);
