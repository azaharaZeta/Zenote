// M5.1 — VALIDEZ del desarrollo. Genera muchos genomas (fundador + cadenas de mutación) y verifica que `develop()`
// SIEMPRE produce un cuerpo válido (sin NaN, partes ∈ [1, budget]) — la garantía por construcción de 2.2. + mide la
// diversidad estructural alcanzable (cadenas/pares/tejidos) sin sembrar.  uso: node zenote2/test/m5-develop.mjs

import { makeFounder, mutate, develop, bodyStats, GENOME_P, TISSUE_N } from '../src/engine/genome.js';
import { makeRng } from '../src/util/rng.js';

const rng = makeRng(1);
const LINEAGES = 2000, STEPS = 60;   // 2000 linajes × 60 mutaciones acumuladas = 120k desarrollos

let invalid = 0, total = 0;
let maxParts = 0, maxChain = 0, maxModules = 0;
const tissueSeen = [0, 0, 0];     // ¿se alcanzan los 3 tejidos (STRUCT/MUSCLE/MOUTH) por evolución?
let chainsReached = 0, pairsReached = 0;

for (let l = 0; l < LINEAGES; l++) {
  let g = makeFounder(rng);
  for (let s = 0; s < STEPS; s++) {
    g = mutate(g, rng);
    const parts = develop(g);
    total++;
    // validez: 1..budget partes, todas con coords/radio finitos y radio > 0
    let ok = parts.length >= 1 && parts.length <= GENOME_P.partBudget;
    for (const p of parts) if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !(p.r > 0) || !Number.isFinite(p.phase)) { ok = false; break; }
    if (!ok) { invalid++; continue; }
    const st = bodyStats(parts);
    if (st.nParts > maxParts) maxParts = st.nParts;
    if (st.maxChain > maxChain) maxChain = st.maxChain;
    if (g.modules.length > maxModules) maxModules = g.modules.length;
    for (let t = 0; t < TISSUE_N; t++) if (st.tissues[t] > 0) tissueSeen[t]++;
    if (st.maxChain >= 4) chainsReached++;                      // cadena recursiva (gusano) emergida
    if (g.modules.some((m) => m.symmetric)) pairsReached++;     // par simétrico emergido
  }
}

const pct = (n) => (100 * n / total).toFixed(1) + '%';
console.log('=== M5.1 — validez y diversidad del desarrollo ===\n');
console.log(`Desarrollos: ${total}  (${LINEAGES} linajes × ${STEPS} mutaciones)`);
console.log(`Cuerpos INVÁLIDOS: ${invalid}  → ${invalid === 0 ? 'validez por construcción OK ✓' : 'FALLO ✗'}`);
console.log(`\nDiversidad estructural alcanzada (sin sembrar):`);
console.log(`  máx partes ${maxParts}/${GENOME_P.partBudget} · máx cadena ${maxChain} · máx módulos ${maxModules}`);
console.log(`  cuerpos con cadena≥4 (gusano): ${pct(chainsReached)} · con par simétrico: ${pct(pairsReached)}`);
console.log(`  tejidos alcanzados [STRUCT,MUSCLE,MOUTH]: ${tissueSeen.map(pct).join(' · ')}`);
console.log(`\n${invalid === 0 && maxChain >= 4 && tissueSeen.every((t) => t > 0) ? 'M5.1 GO ✓ (válido siempre + diversidad estructural y de tejidos emerge)' : 'revisar'}`);
