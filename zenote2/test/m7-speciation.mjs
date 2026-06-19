// M7 — bucle evolutivo: recombinación homóloga + especiación emergente. Verifica: (a) la recombinación produce
// cuerpos VÁLIDOS, (b) la reproducción SEXUAL ocurre, (c) emergen ESPECIES (clústeres reproductivamente aislados por
// divergencia morfológica, sin métrica curada → D14), (d) invariantes intactos.  uso: node zenote2/test/m7-speciation.mjs [ticks]

import { World, WORLD_P } from '../src/engine/world.js';
import { Sim, SIM_P } from '../src/engine/sim.js';
import { develop, GENOME_P } from '../src/engine/genome.js';
import { computePhenotype } from '../src/engine/phenotype.js';

const eD = SIM_P.eDensity, TICKS = +(process.argv[2] || 15000), SEEDS = [1, 2, 3];
const matter = (s) => s.world.totalNutrient() + s.world.totalDetritusM() + s.totalMass();
const stored = (s) => { let e = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) e += s.E[i] + s.gut[i] + s.mass[i] * eD; return e + s.world.totalDetritusE(); };

// nº de "especies" = clústeres por distancia FENOTÍPICA bajo el umbral de compatibilidad (mismo criterio que el apareamiento)
function speciesCount(s) {
  const idx = []; for (let i = 0; i < s.cap; i++) if (s.alive[i]) idx.push(i);
  const pick = idx.length <= 300 ? idx : Array.from({ length: 300 }, () => idx[(Math.random() * idx.length) | 0]);
  const reps = [];
  for (const i of pick) {
    let found = false;
    for (const r of reps) { const dm = (s.mass[i] - s.mass[r]) / 2, dp = (s.photoCap[i] - s.photoCap[r]) / 40, dmo = (s.mouthCap[i] - s.mouthCap[r]) / 10;
      if (Math.sqrt(dm * dm + dp * dp + dmo * dmo) < SIM_P.mateCompat) { found = true; break; } }
    if (!found) reps.push(i);
  }
  return reps.length;
}
function invalidBodies(s) { let bad = 0, n = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) { n++; const b = develop(s.genome[i]); if (!(b.length >= 1 && b.length <= GENOME_P.partBudget) || b.some((p) => !Number.isFinite(p.x) || !(p.r > 0))) bad++; } return bad; }

console.log(`=== M7 — recombinación + especiación emergente · ${SEEDS.length} seeds × ${TICKS} ticks ===\n`);
let okInv = true, okValid = true, sexHappens = true; const specs = [];
for (const seed of SEEDS) {
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed, cap: 14000 }); s.seed(800);
  const budget = matter(s); let prevStored = stored(s), prevHeat = w.heat, prevCap = w.lightCaptured, mDrift = 0, eRes = 0, heatMono = true, lastHeat = w.heat;
  for (let t = 0; t < TICKS; t++) {
    s.step();
    const md = Math.abs(matter(s) - budget) / budget; if (md > mDrift) mDrift = md;
    const st = stored(s), r = Math.abs((st - prevStored) - ((w.lightCaptured - prevCap) - (w.heat - prevHeat))); if (r > eRes) eRes = r;
    if (w.heat < lastHeat - 1e-9) heatMono = false; lastHeat = w.heat; prevStored = st; prevHeat = w.heat; prevCap = w.lightCaptured;
  }
  const sp = speciesCount(s), bad = invalidBodies(s), sexFrac = s.sexBirths / Math.max(1, s.sexBirths + s.asexBirths);
  specs.push(sp);
  if (mDrift >= 1e-3 || eRes >= 1e-2 || !heatMono) okInv = false;
  if (bad > 0) okValid = false; if (s.sexBirths === 0) sexHappens = false;
  console.log(`  seed ${seed}: pop ${String(s.pop()).padStart(4)} · especies ${sp} · sexo ${(sexFrac * 100).toFixed(0)}% de nacimientos · cuerpos inválidos ${bad} · inv ${mDrift < 1e-3 && eRes < 1e-2 && heatMono ? '✓' : '✗'}`);
}
const meanSpec = specs.reduce((a, b) => a + b, 0) / specs.length;
console.log(`\nEspecies medias: ${meanSpec.toFixed(1)} (emergentes por divergencia morfológica, sin umbral génico curado → D14)`);
console.log(`${okValid && sexHappens && okInv && meanSpec > 1 ? 'M7 GO ✓ — recombinación válida + sexo ocurre + especiación emerge (>1 especie) + invariantes intactos' : 'revisar ✗'}`);
