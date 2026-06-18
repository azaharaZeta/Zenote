// M5.2 — FORMA = FUNCIÓN. Genomas construidos a mano → asserts de que las capacidades casan con la forma, y de que
// el eje autótrofo↔heterótrofo emerge + el GENERALISTA es naturalmente mediocre (sin omniPenalty).
//   uso: node zenote2/test/m5-formfunction.mjs

import { develop, GENOME_P } from '../src/engine/genome.js';
import { computePhenotype, trophicRole } from '../src/engine/phenotype.js';

// helpers de construcción (tissue: 0.1 STRUCT · 0.4 PHOTO · 0.6 MUSCLE · 0.9 MOUTH)
const root = (tissue, size = 0.5, aspect = 0.3, oscAmp = 0.1) => ({ size, aspect, tissue, oscAmp, phase: 0.5 });
const mod = (o) => ({ angle: 0.6, size: 0.5, aspect: 0.5, tissue: 0.4, oscAmp: 0.3, phase: 0.5, recursive: false, recLimit: 1, symmetric: false, taper: 0.85, hom: 0, ...o });

const G = {
  // HOJA (autótrofo): cabeza + par de palas PHOTO anchas; sin músculo ni boca.
  leaf: { root: root(0.4, 0.5, 0.2), modules: [ mod({ tissue: 0.4, size: 0.9, aspect: 0.8, symmetric: true, oscAmp: 0 }) ] },
  // NADADOR (heterótrofo): cabeza estructural + cadena MUSCLE trasera (angle≈π) que ondula.
  swimmer: { root: root(0.1, 0.5, 0.5, 0.1), modules: [ mod({ tissue: 0.6, angle: 3.0, size: 0.5, aspect: 0.6, oscAmp: 0.6, recursive: true, recLimit: 5 }) ] },
  // CAZADOR (heterótrofo): cabeza + músculo trasero + BOCA frontal.
  hunter: { root: root(0.1, 0.5, 0.4, 0.1), modules: [ mod({ tissue: 0.6, angle: 3.0, oscAmp: 0.55, recursive: true, recLimit: 3 }), mod({ tissue: 0.9, angle: 0.2, size: 0.6, symmetric: true }) ] },
  // GENERALISTA: PHOTO modesto + MUSCLE modesto (presupuesto repartido) → mediocre en ambos vs los especialistas.
  generalist: { root: root(0.1, 0.5, 0.4), modules: [ mod({ tissue: 0.4, size: 0.4, aspect: 0.4, symmetric: true, oscAmp: 0 }), mod({ tissue: 0.6, angle: 3.0, size: 0.5, oscAmp: 0.6, recursive: true, recLimit: 4 }) ] },
};

const ph = {};
for (const [k, g] of Object.entries(G)) { const p = computePhenotype(develop(g)); p.role = trophicRole(p); ph[k] = p; }

console.log('=== M5.2 — forma = función ===\n');
const f = (x) => x.toFixed(2);
console.log('cuerpo       masa  arrastre  empuje  vmax  photoCap  mouthCap  oficio');
for (const k of ['leaf', 'swimmer', 'hunter', 'generalist']) { const p = ph[k];
  console.log(`${k.padEnd(11)} ${f(p.mass).padStart(5)} ${f(p.drag).padStart(8)} ${f(p.thrust).padStart(7)} ${f(p.vmax).padStart(5)} ${f(p.photoCap).padStart(8)} ${f(p.mouthCap).padStart(8)}  ${p.role}`);
}

// --- ASSERTS ---
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  ✗ FALLO: ${name}`); } };
check('hoja capta más luz que el nadador', ph.leaf.photoCap > ph.swimmer.photoCap * 3);
check('nadador empuja más que la hoja', ph.swimmer.thrust > ph.leaf.thrust + 0.5);
check('hoja no propulsa (~0 empuje)', ph.leaf.thrust < 0.05);
check('cazador tiene boca; la hoja no', ph.hunter.mouthCap > 0 && ph.leaf.mouthCap === 0);
check('hoja = autótrofo', ph.leaf.role === 'autotrofo');
check('nadador = heterótrofo', ph.swimmer.role === 'heterotrofo');
check('cazador = heterótrofo', ph.hunter.role === 'heterotrofo');
// el generalista es MEDIOCRE en ambos ejes vs los especialistas (trade-off físico, sin impuesto)
check('generalista capta MENOS luz que la hoja', ph.generalist.photoCap < ph.leaf.photoCap);
check('generalista empuja MENOS que el nadador', ph.generalist.thrust < ph.swimmer.thrust);
check('generalista = mixótrofo', ph.generalist.role === 'mixotrofo');

console.log(`\n${pass} asserts OK, ${fail} fallos → ${fail === 0 ? 'M5.2 GO ✓ (forma→función correcta; eje autótrofo↔heterótrofo y trade-off del generalista emergen sin impuesto)' : 'revisar ✗'}`);
process.exit(fail === 0 ? 0 : 1);
