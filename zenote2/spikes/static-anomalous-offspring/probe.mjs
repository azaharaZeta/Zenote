// SONDA — "organismo estático que escupe descendencia anómala que se aleja y muere" (idea de usuario, ¿bug?).
// Hipótesis: un autótrofo sésil (plántula PHOTO) produce, por la ALTA mutación estructural, crías de UNA sola mutación
// que cambian de tejido/forma → ganan músculo (se mueven) y/o pierden fotosíntesis (sin ingreso) → mueren pronto. Sería
// variación purgada por selección (esperado), no un bug. Esta sonda mide la frecuencia de esos casos por nacimiento.
//   uso: node zenote2/spikes/static-anomalous-offspring/probe.mjs

import { makeFounder, mutate, develop } from '../../src/engine/genome.js';
import { computePhenotype, trophicRole, phenoDistance } from '../../src/engine/phenotype.js';
import { makeRng } from '../../src/util/rng.js';
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim } from '../../src/engine/sim.js';

const rng = makeRng(1);
const N = 20000;
const parentG = makeFounder(rng);
const pp = computePhenotype(develop(parentG));
console.log(`PADRE (plántula sésil): rol=${trophicRole(pp)} · vmax=${pp.vmax.toFixed(2)} · photoCap=${pp.photoCap.toFixed(1)} · mouthCap=${pp.mouthCap.toFixed(2)} · masa=${pp.mass.toFixed(2)}\n`);

let gainedMobility = 0, roleChanged = 0, lostPhoto = 0, doomedMover = 0, structChange = 0, big = 0, sumDist = 0;
for (let k = 0; k < N; k++) {
  const c = mutate(parentG, rng);                 // UNA mutación desde el MISMO padre (vía asexual)
  const cp = computePhenotype(develop(c));
  const dist = phenoDistance(pp.mass, pp.photoCap, pp.mouthCap, cp.mass, cp.photoCap, cp.mouthCap);
  sumDist += dist;
  if (cp.vmax > 0.5) gainedMobility++;             // ganó movilidad apreciable
  if (trophicRole(cp) !== 'autotrofo') roleChanged++;
  if (cp.photoCap < pp.photoCap * 0.5) lostPhoto++;
  if (cp.vmax > 0.5 && cp.photoCap < pp.photoCap * 0.5 && cp.mouthCap < 0.3) doomedMover++;  // móvil, sin fotosíntesis ni boca → sin ingreso → muere
  if (c.modules.length !== parentG.modules.length) structChange++;  // añadió/borró módulo
  if (dist > 1) big++;                              // "totalmente distinta" (>1 = más que el umbral de especie mateCompat 0.5)
}
const pct = (x) => (x / N * 100).toFixed(1) + '%';
console.log(`Sobre ${N} crías de UNA mutación del MISMO padre sésil:`);
console.log(`  ganó movilidad (vmax>0.5) ............. ${pct(gainedMobility)}`);
console.log(`  cambió de oficio (deja de ser autótrofo) ${pct(roleChanged)}`);
console.log(`  perdió ≥50% de fotosíntesis ........... ${pct(lostPhoto)}`);
console.log(`  cambió nº de módulos (estructural) .... ${pct(structChange)}`);
console.log(`  "totalmente distinta" (dist>1) ........ ${pct(big)}`);
console.log(`  → MÓVIL SIN INGRESO (se aleja y muere) . ${pct(doomedMover)}`);
console.log(`  distancia fenotípica media padre↔cría .. ${(sumDist / N).toFixed(2)}`);

// ¿"muere enseguida"? En un run real, edad media de los VIVOS por clase de movilidad. Si los móviles son mucho más
// jóvenes que los sésiles → no persisten (la selección los purga pronto = el "se aleja rápido y muere" del usuario).
const w = new World(1500, 1, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
const s = new Sim(w, { seed: 1, cap: 8000 }); s.seed(800);
for (let t = 0; t < 5000; t++) s.step();
let nMov = 0, ageMov = 0, nSes = 0, ageSes = 0;
for (let i = 0; i < s.cap; i++) if (s.alive[i]) { if (s.vmax[i] > 0.5) { nMov++; ageMov += s.age[i]; } else { nSes++; ageSes += s.age[i]; } }
console.log(`\nRun real (5000 ticks): edad media VIVOS — móviles(vmax>0.5) ${(ageMov / Math.max(1, nMov)).toFixed(0)} (n=${nMov}) · sésiles ${(ageSes / Math.max(1, nSes)).toFixed(0)} (n=${nSes})`);
console.log(`muertes acumuladas: depredación ${s.kills} · inanición ${s.starved}`);
