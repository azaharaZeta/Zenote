// CHECKSUM DORADO — regresión de determinismo + detección de deriva. La auditoría técnica (Tests) marcó la falta de un
// test de regresión de determinismo. Este: (1) corre el motor con seed fijo y exige que DOS corridas idénticas den el
// MISMO checksum (determinismo), y (2) ancla ese checksum a un valor DORADO → cualquier cambio NO intencionado de la
// dinámica del motor lo rompe. Si cambias la física A PROPÓSITO (p.ej. B2/B3), re-captura el dorado (imprime el valor).
//   uso: node zenote2/test/m8-determinism.mjs

import { World, WORLD_P } from '../src/engine/world.js';
import { Sim } from '../src/engine/sim.js';

// Checksum FNV-1a sobre el estado vivo, cuantizado (evita ruido de impresión f32; orden de slot determinista).
function checksum(s) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { h = (Math.imul(h ^ (v | 0), 16777619)) >>> 0; };
  mix(s.tick); mix(s.pop());
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) {
    mix(s.serial[i]);
    mix(Math.round(s.x[i] * 1000)); mix(Math.round(s.y[i] * 1000));
    mix(Math.round(s.E[i] * 1000)); mix(Math.round(s.mass[i] * 1000)); mix(Math.round(s.mouthCap[i] * 1000));
  }
  return h >>> 0;
}

function run(ticks) {
  const w = new World(1500, 1, { ...WORLD_P, lightBase: 2.5 });
  w.nutrient.fill(1.5); w.veg.fill(1.0);
  const s = new Sim(w, { seed: 1, cap: 4000 }); s.seed(800);
  for (let t = 0; t < ticks; t++) s.step();
  return { c: checksum(s), pop: s.pop(), tick: s.tick };
}

const GOLDEN = 0xe8984a53;   // re-fijado 2026-06-20: HOMOLOGÍA COMPARTIDA del módulo fundador (#4) → la recombinación entre linajes
                             // alinea el par de aletas (antes marca única/founder → se heredaba 0/1/2 al azar). Cambio INTENCIONADO de
                             // recombinación. (La barrera post-cigótica #3 se probó y se REVIRTIÓ: nula+contraproducente.) Previos: 0xf5375391
                             // (coste de boca), 0xebd987f9 (r/K dial→gen), 0xe5d3f569 (fleeSpeed). seed 1, cap 4000, 800 fundadores, 2000 ticks.
const TICKS = 2000;
console.log('=== Checksum dorado — determinismo + deriva ===\n');
const a = run(TICKS), b = run(TICKS);
const deterministic = a.c === b.c;
const matchesGolden = a.c >>> 0 === GOLDEN >>> 0;
console.log(`  corrida 1: checksum=0x${a.c.toString(16)} · pop=${a.pop} · tick=${a.tick}`);
console.log(`  corrida 2: checksum=0x${b.c.toString(16)} · pop=${b.pop}`);
console.log(`  1) Determinismo (misma seed → mismo estado) ... ${deterministic ? 'OK ✓' : 'FALLO ✗'}`);
console.log(`  2) Coincide con el DORADO 0x${(GOLDEN >>> 0).toString(16)} ...... ${matchesGolden ? 'OK ✓' : 'DERIVA ✗ (si es intencionada, fija GOLDEN = 0x' + a.c.toString(16) + ')'}`);

process.exit(deterministic && matchesGolden ? 0 : 1);
