// SPIKE visión-órgano — GENOMA (variante). Reaprovecha el motor KEEPER y solo cambia lo justo: añade un 5º tejido
// SENSOR, re-binnea tissueOf a 5 categorías, y un develop/makeFounder locales (los demás operadores —mutate,
// recombine, seedBrain, cerebro— se IMPORTAN del motor real, intactos). NO toca src/.
import { mutate, recombine, cloneGenome, seedBrain, makeBrain, GENOME_P, BRAIN, BRAIN_W } from '../../src/engine/genome.js';
export { mutate, recombine, cloneGenome, seedBrain, makeBrain, GENOME_P, BRAIN, BRAIN_W };

// 5º tejido: SENSOR (ojo) → de su ÁREA emerge el alcance de percepción (phenotype.mjs). Re-binnea [0,1] en 5.
export const TISSUE = { STRUCTURE: 0, PHOTO: 1, MUSCLE: 2, MOUTH: 3, SENSOR: 4 };
export const TISSUE_N = 5;

const TWO_PI = 6.283185307;
const clamp = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;
const radOf = (size) => GENOME_P.radMin + (GENOME_P.radMax - GENOME_P.radMin) * size;
const tissueOf = (t) => Math.min(TISSUE_N - 1, (t * TISSUE_N) | 0);   // gen [0,1] → categoría (ahora 5 bins)
let HOM = 1e6;   // contador de homología local (alto → sin colisión con el del motor real)

// DESARROLLO: idéntico al keeper salvo que usa el tissueOf de 5 bins (para que el tejido SENSOR exista).
export function develop(g) {
  const B = GENOME_P, parts = [];
  const root = g.root;
  parts.push({ x: 0, y: 0, r: radOf(root.size), aspect: root.aspect, dir: 0, tissue: tissueOf(root.tissue),
               oscAmp: root.oscAmp, phase: root.phase * TWO_PI, parent: -1 });
  for (const m of g.modules) {
    if (parts.length >= B.partBudget) break;
    const signs = m.symmetric ? [1, -1] : [1];
    for (const s of signs) {
      if (parts.length >= B.partBudget) break;
      const dir = clamp(m.angle, 0, Math.PI) * s;
      const cd = Math.cos(dir), sd = Math.sin(dir);
      let parentIdx = 0, r = radOf(m.size);
      const L = m.recursive ? clamp(m.recLimit | 0, 1, B.recCap) : 1;
      for (let d = 0; d < L && parts.length < B.partBudget; d++) {
        const p = parts[parentIdx], dist = p.r + r;
        parts.push({ x: p.x + cd * dist, y: p.y + sd * dist, r, aspect: m.aspect, dir,
                     tissue: tissueOf(m.tissue), oscAmp: m.oscAmp, phase: m.phase * TWO_PI, parent: parentIdx });
        parentIdx = parts.length - 1;
        r *= clamp(m.taper, 0.4, 1);
      }
    }
  }
  return parts;
}

// FUNDADOR: el del motor real (plántula PHOTO + seedBrain + hue). Si seedEye, añade un ojo pequeño (tissue 0.9 → SENSOR).
// El seedBrain ya está cableado a las entradas presa/amenaza → un ojo recién aparecido se USA de inmediato.
export function makeFounder(rng, seedEye = false) {
  const g = { root: { size: 0.45, aspect: 0.3, tissue: 0.35 /*PHOTO*/, oscAmp: 0.15, phase: rng.next() },
    modules: [{ angle: 0.6, size: 0.4, aspect: 0.6, tissue: 0.35 /*PHOTO*/, oscAmp: 0.2, phase: rng.next(),
                recursive: false, recLimit: 1, symmetric: true, taper: 0.85, hom: HOM++ }],
    brain: seedBrain(rng), hue: rng.next() };
  if (seedEye) g.modules.push({ angle: 0.2, size: 0.25, aspect: 0.4, tissue: 0.9 /*SENSOR*/, oscAmp: 0, phase: 0,
                                recursive: false, recLimit: 1, symmetric: false, taper: 0.8, hom: HOM++ });
  return g;
}
