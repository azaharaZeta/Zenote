// M9 — REGRESIÓN ECOLÓGICA (promoción de spikes a gate, backlog técnico). El checksum dorado (m8) sólo verifica que la
// dinámica es byte-idéntica para un seed; NO verifica que el ECOSISTEMA siga sano. Hueco real: un cambio de física
// INTENCIONADO (que re-hornea el dorado a propósito) podría romper en silencio la coexistencia trófica o disparar el bloat.
// Este test ancla las PROPIEDADES EMERGENTES que el proyecto promete, con umbrales GENEROSOS (sólo una regresión real los
// rompe; el motor es determinista → cada seed da el MISMO valor siempre, así que no es flaky). Cubre tres riesgos históricos:
//   (1) COEXISTENCIA: el cazador NO se extingue (el baseline v1 lo perdía 5/5) — ni colapsa la base herbívora.
//   (2) ANTI-BLOAT: la masa media no se dispara (regresión clásica: massCostExp→1 infla los cuerpos ~2×; ver memoria bloat).
//   (3) CONSERVACIÓN: la materia se conserva (deriva ~ruido f32) — el alma del proyecto, a escala de ecosistema vivo.
//   uso: node zenote2/test/m9-ecology.mjs

import { World, WORLD_P } from '../src/engine/world.js';
import { Sim } from '../src/engine/sim.js';

// oficio por DIETA (igual que worker.roleFromDiet): 0 herbívoro · 1 carnívoro · 2 omnívoro
const role = (v, p, s) => { const t = v + p + s; if (t < 0.5) return 0; const c = (p + s) / t; return c > 0.6 ? 1 : c < 0.25 ? 0 : 2; };
function totalMatter(w, s) { let m = w.totalNutrient() + w.totalVeg() + w.totalDetritusM(); for (let i = 0; i < s.cap; i++) if (s.alive[i]) m += s.mass[i]; return m; }

// Umbrales medidos (5 seeds, 15k): herb 340-408 · carn 26-57 · massMean 6.1-6.8 · drift ~0.002%. Márgenes amplios (2.5-3.5×)
// → sólo una REGRESIÓN real (extinción del cazador, colapso de la base, bloat, fuga de materia) los rompe.
const TICKS = 15000, SEEDS = [1, 2, 3];
const MIN_HERB = 100, MIN_CARN = 10, MIN_POP = 150, MAX_POP = 1500, MAX_MASS = 12, MAX_DRIFT = 0.1;   // carn floor 10 vs min medido 26

function run(seed) {
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 });
  w.nutrient.fill(1.5); w.veg.fill(1.0);
  const s = new Sim(w, { seed, cap: 4000 }); s.seed(800);
  const m0 = totalMatter(w, s);
  for (let t = 0; t < TICKS; t++) s.step();
  let pop = 0, herb = 0, carn = 0, omni = 0, mSum = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) { pop++; const r = role(s.vegIn[i], s.preyIn[i], s.scavIn[i]); if (r === 0) herb++; else if (r === 1) carn++; else omni++; mSum += s.mass[i]; }
  return { pop, herb, carn, omni, massMean: pop ? mSum / pop : 0, drift: 100 * (totalMatter(w, s) - m0) / m0 };
}

console.log(`=== M9 — Regresión ecológica (${SEEDS.length} seeds × ${TICKS} ticks) ===\n`);
let fail = 0;
const chk = (cond, label) => { if (!cond) { fail++; console.log(`     ✗ FALLO: ${label}`); } };
for (const seed of SEEDS) {
  const r = run(seed);
  console.log(`  seed ${seed}: pop=${r.pop} herb=${r.herb} carn=${r.carn} omni=${r.omni} massMean=${r.massMean.toFixed(2)} drift=${r.drift.toFixed(4)}%`);
  chk(r.carn >= MIN_CARN, `seed ${seed}: cazador casi extinto (carn ${r.carn} < ${MIN_CARN}) — coexistencia trófica rota`);
  chk(r.herb >= MIN_HERB, `seed ${seed}: base herbívora colapsada (herb ${r.herb} < ${MIN_HERB})`);
  chk(r.pop >= MIN_POP && r.pop <= MAX_POP, `seed ${seed}: población fuera de banda sana (pop ${r.pop} ∉ [${MIN_POP},${MAX_POP}])`);
  chk(r.massMean < MAX_MASS, `seed ${seed}: BLOAT (massMean ${r.massMean.toFixed(2)} ≥ ${MAX_MASS}) — ¿se rompió massCostExp?`);
  chk(Math.abs(r.drift) < MAX_DRIFT, `seed ${seed}: fuga de materia (drift ${r.drift.toFixed(4)}% ≥ ${MAX_DRIFT}%)`);
}
console.log(`\n${fail === 0 ? 'M9 GO ✓ (coexistencia + anti-bloat + conservación a escala de ecosistema)' : `revisar ✗ (${fail} fallos)`}`);
process.exit(fail === 0 ? 0 : 1);
