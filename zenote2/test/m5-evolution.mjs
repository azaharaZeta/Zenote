// M5.4 — ¿EMERGE la evolución morfológica? Desde un fundador SIMPLE (plántula PHOTO), ¿la morfología cambia/diverge
// bajo selección SIN sembrar? Mide a lo largo del tiempo y multi-seed.  uso: node zenote2/test/m5-evolution.mjs
//   Honesto: en M5 la conducta es placeholder y el heterótrofo es flojo (E-en-biomasa es M6) → se espera sobre todo
//   ADAPTACIÓN/diversificación de la morfología (auto-optimización autótrofa + deriva estructural), no nichos plenos.

import { World, WORLD_P } from '../src/engine/world.js';
import { Sim } from '../src/engine/sim.js';
import { develop, makeFounder } from '../src/engine/genome.js';
import { computePhenotype, trophicRole } from '../src/engine/phenotype.js';
import { makeRng } from '../src/util/rng.js';

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };

function sample(sim) {
  const idx = []; for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) idx.push(i);
  if (!idx.length) return null;
  const pick = idx.length <= 300 ? idx : Array.from({ length: 300 }, () => idx[(Math.random() * idx.length) | 0]);
  const photo = [], mouth = [], thrust = [], nparts = []; const roles = { autotrofo: 0, heterotrofo: 0, mixotrofo: 0 };
  for (const i of pick) { const parts = develop(sim.genome[i]); const ph = computePhenotype(parts);
    photo.push(ph.photoCap); mouth.push(ph.mouthCap); thrust.push(ph.thrust); nparts.push(parts.length); roles[trophicRole(ph)]++; }
  const n = pick.length;
  return { pop: idx.length, photo: mean(photo), photoStd: std(photo), mouth: mean(mouth), thrust: mean(thrust),
           nparts: mean(nparts), het: (roles.heterotrofo + roles.mixotrofo) / n, auto: roles.autotrofo / n };
}

// referencia del fundador (morfología de partida)
{ const rng = makeRng(99); const ph0 = computePhenotype(develop(makeFounder(rng)));
  console.log('=== M5.4 — evolución morfológica ===\n');
  console.log(`Fundador (partida): photoCap=${ph0.photoCap.toFixed(1)} mouthCap=${ph0.mouthCap.toFixed(1)} thrust=${ph0.thrust.toFixed(2)} partes=${develop(makeFounder(rng)).length}\n`); }

const SEEDS = [1, 2, 3], TICKS = 15000;
const finals = [];
for (const seed of SEEDS) {
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const sim = new Sim(w, { seed, cap: 12000 }); sim.seed(800);
  console.error(`seed ${seed}:`);
  let last = null;
  for (let t = 0; t <= TICKS; t++) {
    if (t % 3000 === 0) { const m = sample(sim); if (m) { last = m;
      console.error(`  t=${String(t).padStart(5)} pop=${String(m.pop).padStart(4)} photoCap=${m.photo.toFixed(1)}(±${m.photoStd.toFixed(1)}) mouthCap=${m.mouth.toFixed(2)} thrust=${m.thrust.toFixed(2)} partes=${m.nparts.toFixed(1)} het=${(m.het*100).toFixed(0)}%`); } }
    if (t < TICKS) sim.step();
  }
  if (last) finals.push(last);
}

console.log('\nResumen final (medias multi-seed, tick 15000):');
const F = (k) => mean(finals.map((f) => f[k]));
console.log(`  población ${F('pop').toFixed(0)} · photoCap ${F('photo').toFixed(1)} (±${F('photoStd').toFixed(1)} diversidad) · partes/cuerpo ${F('nparts').toFixed(1)} · heterótrofos ${(F('het')*100).toFixed(0)}%`);
// GO: la morfología cambió respecto al fundador (photoCap, complejidad o diversidad) sin sembrar
const founderPhoto = (() => { const r = makeRng(99); return computePhenotype(develop(makeFounder(r))).photoCap; })();
const founderParts = (() => { const r = makeRng(99); return develop(makeFounder(r)).length; })();
const moved = Math.abs(F('photo') - founderPhoto) / founderPhoto > 0.15 || Math.abs(F('nparts') - founderParts) > 0.5 || F('photoStd') > 5;
console.log(`\n${moved ? 'M5.4 GO ✓ — la morfología EVOLUCIONA sin sembrar (cambia/diverge respecto al fundador)' : 'sin evolución morfológica clara — revisar'}`);
console.log('(Caveat M5: conducta placeholder + heterótrofo flojo → la divergencia trófica plena es de M6. Aquí basta con que la FORMA evolucione.)');
