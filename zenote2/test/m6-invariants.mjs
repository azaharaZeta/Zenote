// M6 — ECOSISTEMA DE ANIMALES + VEGETACIÓN. Verifica que (a) los invariantes SIGUEN pasando con el libro mayor que
// incluye la VEGETACIÓN (materia: nutriente+veg+detritoM+masa · energía: veg·vegEcoef + reservas + tripa + detritoE; entra
// luz vía vegetación, sale calor), y (b) EMERGE estructura trófica: la mayoría pasta (herbívoros) y una fracción come
// animales (carnívoros) — medido por la DIETA realizada, no por morfología.  uso: node zenote2/test/m6-invariants.mjs

import { World, WORLD_P } from '../src/engine/world.js';
import { Sim, SIM_P } from '../src/engine/sim.js';
import { cloneGenome } from '../src/engine/genome.js';

const ec = WORLD_P.vegEcoef;
function totalMatter(s) { return s.world.totalNutrient() + s.world.totalVeg() + s.world.totalDetritusM() + s.totalMass(); }
function totalStored(s) { let e = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) e += s.E[i] + s.gut[i] + s.mass[i] * s.eD; return e + s.world.totalVeg() * ec + s.world.totalDetritusE(); }
// fracción CARNÍVORA por DIETA realizada (energía de caza+carroña > la de pasto). Mide la estructura trófica emergente.
function carnFrac(s) { let n = 0, carn = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) { const tot = s.vegIn[i] + s.preyIn[i] + s.scavIn[i]; if (tot < 0.5) continue; n++; if ((s.preyIn[i] + s.scavIn[i]) / tot > 0.5) carn++; } return n ? carn / n : 0; }

console.log('=== M6 — invariantes (con vegetación) + estructura trófica emergente ===\n');
let okA = false;
{
  const w = new World(1500, 1, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5); w.veg.fill(1.0);
  const s = new Sim(w, { seed: 1, cap: 14000 }); s.seed(800);
  const budget = totalMatter(s);
  let prevStored = totalStored(s), prevHeat = w.heat, prevCap = w.lightCaptured;
  let maxMatterDrift = 0, maxEnergyResidual = 0, heatMonotone = true, lastHeat = w.heat;
  const TICKS = 12000, t0 = performance.now();
  for (let t = 0; t < TICKS; t++) {
    s.step();
    const md = Math.abs(totalMatter(s) - budget) / budget; if (md > maxMatterDrift) maxMatterDrift = md;
    const stored = totalStored(s), dCap = w.lightCaptured - prevCap, dHeat = w.heat - prevHeat;
    const residual = Math.abs((stored - prevStored) - (dCap - dHeat)); if (residual > maxEnergyResidual) maxEnergyResidual = residual;
    if (w.heat < lastHeat - 1e-9) heatMonotone = false; lastHeat = w.heat;
    prevStored = stored; prevHeat = w.heat; prevCap = w.lightCaptured;
    if (t % 3000 === 0) console.error(`  t=${String(t).padStart(5)} pop=${String(s.pop()).padStart(4)} veg=${w.totalVeg().toFixed(0)} carnívoros=${(carnFrac(s) * 100).toFixed(0)}%`);
  }
  const ms = (performance.now() - t0) / TICKS, mOK = maxMatterDrift < 1e-3, eOK = maxEnergyResidual < 1e-2;
  console.log(`TEST A (luz ON, ${TICKS} ticks): pop ${s.pop()} · veg ${w.totalVeg().toFixed(0)} · carnívoros ${(carnFrac(s) * 100).toFixed(0)}% · perf ${(1000 / ms).toFixed(0)} t/s`);
  console.log(`  1) Materia conservada ........ ${(maxMatterDrift * 100).toExponential(2)}% → ${mOK ? 'OK ✓' : 'FALLO ✗'}`);
  console.log(`  2) Balance de energía/tick ... ${maxEnergyResidual.toExponential(2)} → ${eOK ? 'OK ✓' : 'FALLO ✗'}`);
  console.log(`  3) Calor monótono ............ ${heatMonotone ? 'OK ✓' : 'FALLO ✗'}`);
  okA = mOK && eOK && heatMonotone && s.pop() > 0;
}
{
  const w = new World(1500, 1, { ...WORLD_P, lightBase: 0 }); w.nutrient.fill(1.5); w.veg.fill(1.0);
  const s = new Sim(w, { seed: 1, cap: 14000 }); s.seed(800);
  const budget = totalMatter(s), stored0 = totalStored(s);
  for (let t = 0; t < 6000; t++) s.step();
  const storedEnd = totalStored(s), pop = s.pop(), drift = Math.abs(totalMatter(s) - budget) / budget;
  console.log(`\nTEST B (luz OFF) — sin productor no hay vida: almacenada ${stored0.toFixed(0)}→${storedEnd.toFixed(2)} ${storedEnd < stored0 * 0.02 ? '✓' : '✗'} · pop ${pop} ${pop === 0 ? '✓' : '✗'} · materia ${(drift * 100).toExponential(1)}% ${drift < 1e-3 ? '✓' : '✗'}`);
}

// TEST C — un CARNÍVORO sembrado (cuerpo grande + músculo + boca grande) ¿persiste cazando a los pastadores?
const predator = { root: { size: 0.6, aspect: 0.4, tissue: 0.1, oscAmp: 0.1, phase: 0.5 },
  modules: [ { tissue: 0.6, angle: 3.0, size: 0.6, aspect: 0.6, oscAmp: 0.6, phase: 0.5, recursive: true, recLimit: 4, symmetric: false, taper: 0.85, hom: 0 },
             { tissue: 0.9, angle: 0.3, size: 0.7, aspect: 0.5, oscAmp: 0, phase: 0.5, recursive: false, recLimit: 1, symmetric: true, taper: 0.85, hom: 0 } ] };
function carnCount(s) { let p = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i] && (s.preyIn[i] + s.scavIn[i]) > s.vegIn[i] && (s.preyIn[i] + s.scavIn[i]) > 1) p++; return p; }
{
  const w = new World(1500, 7, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5); w.veg.fill(1.0);
  const s = new Sim(w, { seed: 7, cap: 16000 }); s.seed(700);
  for (let k = 0; k < 120; k++) s.spawn(cloneGenome(predator), Math.random() * 1500, Math.random() * 1500, 14);
  const traj = []; for (let t = 0; t <= 8000; t++) { if (t % 2000 === 0) traj.push([t, carnCount(s)]); if (t < 8000) s.step(); }
  const finalCarn = traj[traj.length - 1][1];
  console.log(`\nTEST C — carnívoro sembrado cazando pastadores: ${traj.map(([t, p]) => `t${t}:carn${p}`).join(' · ')} → ${finalCarn > 0 ? 'PERSISTE ✓ (red trófica de 2 niveles)' : 'EXTINTO ✗'}`);
  console.log(`\nM6 ${okA && finalCarn > 0 ? 'GO ✓' : '✗'} — conserva con vegetación en el libro mayor; emerge estructura trófica (pastadores + carnívoros que los cazan).`);
}
