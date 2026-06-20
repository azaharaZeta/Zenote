// M7 — bucle evolutivo: recombinación homóloga + estructura reproductiva emergente. GO valida la MECÁNICA: (a) la
// recombinación produce cuerpos VÁLIDOS, (b) la reproducción SEXUAL ocurre, (c) invariantes intactos. La "especiación"
// (D14) se REPORTA como observable, NO se gatea: el aislamiento por similitud (mateCompat) es CLINAL y no transitivo →
// no da especies discretas limpias sino COMPONENTES conexos de un grafo de compatibilidad (núcleo dominante + clústeres
// menores + singletons). Medir el conteo voraz y llamarlo "especies" era sobre-vender D14 (ver auditoría biológica).
//   uso: node zenote2/test/m7-speciation.mjs [ticks]

import { World, WORLD_P } from '../src/engine/world.js';
import { Sim, SIM_P } from '../src/engine/sim.js';
import { develop, GENOME_P } from '../src/engine/genome.js';
import { computePhenotype, phenoDistance } from '../src/engine/phenotype.js';

const eD = SIM_P.eDensity, TICKS = +(process.argv[2] || 15000), SEEDS = [1, 2, 3];
const matter = (s) => s.world.totalNutrient() + s.world.totalVeg() + s.world.totalDetritusM() + s.totalMass();
const stored = (s) => { let e = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) e += s.E[i] + s.gut[i] + s.mass[i] * eD; return e + s.world.totalVeg() * WORLD_P.vegEcoef + s.world.totalDetritusE(); };

// Estructura reproductiva de la población, sobre una muestra (≤300). Devuelve DOS métricas distintas:
//  · components = nº de COMPONENTES CONEXOS del grafo de compatibilidad (arista si phenoDistance < mateCompat). Es el
//    AISLAMIENTO real: A y C en la misma especie si hay una CADENA A–B–C aunque A–C no se crucen directamente
//    (aislamiento por distancia, clinal/anillo). Componentes = redes potencialmente interfértiles, aisladas entre sí.
//    → la métrica honesta de "especie" (D14). Si =1, la población es una sola nube clinal/panmíctica (NO hay especies).
//  · morphs = recubrimiento voraz (nº de bolas de radio mateCompat para cubrir la nube). Mide DISPERSIÓN morfológica,
//    NO aislamiento (lo que reportaba la versión anterior etiquetada erróneamente como "especies").
function speciesStructure(s) {
  const idx = []; for (let i = 0; i < s.cap; i++) if (s.alive[i]) idx.push(i);
  if (!idx.length) return { components: 0, morphs: 0 };
  const pick = idx.length <= 300 ? idx : Array.from({ length: 300 }, () => idx[(Math.random() * idx.length) | 0]);
  const n = pick.length;
  const dist = (a, b) => phenoDistance(s.mass[pick[a]], s.mouthCap[pick[a]], s.maxMouthR[pick[a]], s.mass[pick[b]], s.mouthCap[pick[b]], s.maxMouthR[pick[b]]);
  // componentes conexos vía union-find
  const parent = new Array(n); for (let a = 0; a < n; a++) parent[a] = a;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  // recubrimiento voraz (morphs) a la vez
  const reps = [];
  for (let a = 0; a < n; a++) {
    let covered = false;
    for (const r of reps) if (dist(a, r) < SIM_P.mateCompat) { covered = true; break; }
    if (!covered) reps.push(a);
    for (let b = a + 1; b < n; b++) if (dist(a, b) < SIM_P.mateCompat) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  }
  // tamaños de componente (por raíz) → distinguir fragmentación REAL de un núcleo + singletons dispersos
  const size = new Map();
  for (let a = 0; a < n; a++) { const r = find(a); size.set(r, (size.get(r) || 0) + 1); }
  let comp = 0, big = 0, largest = 0;
  for (const sz of size.values()) { comp++; if (sz >= 3) big++; if (sz > largest) largest = sz; }
  return { components: comp, bigComponents: big, largestFrac: largest / n, morphs: reps.length };
}
function invalidBodies(s) { let bad = 0, n = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) { n++; const b = develop(s.genome[i]); if (!(b.length >= 1 && b.length <= GENOME_P.partBudget) || b.some((p) => !Number.isFinite(p.x) || !(p.r > 0))) bad++; } return bad; }

console.log(`=== M7 — recombinación + especiación emergente · ${SEEDS.length} seeds × ${TICKS} ticks ===\n`);
let okInv = true, okValid = true, sexHappens = true; const specs = [];
for (const seed of SEEDS) {
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5); w.veg.fill(1.0);
  const s = new Sim(w, { seed, cap: 14000 }); s.seed(800);
  const budget = matter(s); let prevStored = stored(s), prevHeat = w.heat, prevCap = w.lightCaptured, mDrift = 0, eRes = 0, heatMono = true, lastHeat = w.heat;
  for (let t = 0; t < TICKS; t++) {
    s.step();
    const md = Math.abs(matter(s) - budget) / budget; if (md > mDrift) mDrift = md;
    const st = stored(s), r = Math.abs((st - prevStored) - ((w.lightCaptured - prevCap) - (w.heat - prevHeat))); if (r > eRes) eRes = r;
    if (w.heat < lastHeat - 1e-9) heatMono = false; lastHeat = w.heat; prevStored = st; prevHeat = w.heat; prevCap = w.lightCaptured;
  }
  const { components, bigComponents, largestFrac, morphs } = speciesStructure(s), bad = invalidBodies(s), sexFrac = s.sexBirths / Math.max(1, s.sexBirths + s.asexBirths);
  specs.push(bigComponents);
  if (mDrift >= 1e-3 || eRes >= 1e-2 || !heatMono) okInv = false;
  if (bad > 0) okValid = false; if (s.sexBirths === 0) sexHappens = false;
  console.log(`  seed ${seed}: pop ${String(s.pop()).padStart(4)} · componentes ${components} (≥3: ${bigComponents}, mayor ${(largestFrac * 100).toFixed(0)}%) · morphs ${morphs} · sexo ${(sexFrac * 100).toFixed(0)}% · inv ${mDrift < 1e-3 && eRes < 1e-2 && heatMono ? '✓' : '✗'}`);
}
const meanBig = specs.reduce((a, b) => a + b, 0) / specs.length;
// HONESTO (D14): el GO valida la MECÁNICA (recombinación válida + sexo + invariantes), NO un nº de especies. La
// estructura reproductiva se REPORTA como observable: `componentes` = redes interfértiles aisladas (muchas pueden ser
// SINGLETONS = individuos sin pareja compatible en la muestra, no especies); `≥3` = componentes con masa real; `mayor`
// = fracción en el componente dominante (si ~100% → núcleo panmíctico + dispersos; si reparte → fragmentación real).
console.log(`\nComponentes con ≥3 miembros (media): ${meanBig.toFixed(1)} — estructura reproductiva emergente por divergencia morfológica (sin umbral génico curado). Reportado, no vendido como especiación discreta (aislamiento por similitud = clinal → ver fracción del mayor).`);
console.log(`${okValid && sexHappens && okInv ? 'M7 GO ✓ — recombinación válida + sexo ocurre + invariantes intactos (estructura de especies = observable, no criterio)' : 'revisar ✗'}`);
