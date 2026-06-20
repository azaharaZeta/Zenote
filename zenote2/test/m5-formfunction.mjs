// M5.2 — FORMA = FUNCIÓN (animales). Genomas construidos a mano → asserts de que las CAPACIDADES casan con la forma:
// MUSCLE→empuje/vmax · MOUTH→capacidad de ingesta · boca mayor→presa mayor manejable (maxMouthR) · STRUCTURE solo cuerpo.
// El GENERALISTA (músculo+boca repartidos) es mediocre en ambos vs los especialistas (trade-off físico por presupuesto, sin
// omniPenalty). El eje herbívoro↔carnívoro es DIETARIO (lo mide el inspector/worker), no morfológico → aquí solo capacidades.
//   uso: node zenote2/test/m5-formfunction.mjs

import { develop } from '../src/engine/genome.js';
import { computePhenotype } from '../src/engine/phenotype.js';

// helpers (tissue con TISSUE_N=3: 0.1 STRUCT · 0.5 MUSCLE · 0.85 MOUTH)
const root = (tissue, size = 0.5, aspect = 0.3, oscAmp = 0.1) => ({ size, aspect, tissue, oscAmp, phase: 0.5 });
const mod = (o) => ({ angle: 0.6, size: 0.5, aspect: 0.5, tissue: 0.5, oscAmp: 0.3, phase: 0.5, recursive: false, recLimit: 1, symmetric: false, taper: 0.85, hom: 0, ...o });

const G = {
  // NADADOR: cabeza estructural + cadena MUSCLE trasera (angle≈π) que ondula. Sin boca.
  swimmer: { root: root(0.1, 0.5, 0.5, 0.1), modules: [ mod({ tissue: 0.5, angle: 3.0, size: 0.5, aspect: 0.6, oscAmp: 0.6, recursive: true, recLimit: 5 }) ] },
  // PASTADOR: cabeza + BOCA pequeña; apenas músculo → ingiere pero casi no propulsa.
  grazer: { root: root(0.1, 0.4, 0.4, 0.1), modules: [ mod({ tissue: 0.85, angle: 0.4, size: 0.3, symmetric: true, oscAmp: 0 }) ] },
  // CAZADOR: cabeza + músculo trasero + BOCA grande frontal (maneja presa grande).
  hunter: { root: root(0.1, 0.5, 0.4, 0.1), modules: [ mod({ tissue: 0.5, angle: 3.0, oscAmp: 0.55, recursive: true, recLimit: 3 }), mod({ tissue: 0.85, angle: 0.2, size: 0.85, symmetric: true }) ] },
  // GENERALISTA: MUSCLE modesto + BOCA modesta (presupuesto repartido) → mediocre en ambos vs los especialistas.
  generalist: { root: root(0.1, 0.5, 0.4), modules: [ mod({ tissue: 0.85, size: 0.4, aspect: 0.4, symmetric: true, oscAmp: 0 }), mod({ tissue: 0.5, angle: 3.0, size: 0.5, oscAmp: 0.6, recursive: true, recLimit: 4 }) ] },
};

const ph = {};
for (const [k, g] of Object.entries(G)) ph[k] = computePhenotype(develop(g));

console.log('=== M5.2 — forma = función (animales) ===\n');
const f = (x) => x.toFixed(2);
console.log('cuerpo       masa  arrastre  empuje  vmax  mouthCap  maxMouthR');
for (const k of ['swimmer', 'grazer', 'hunter', 'generalist']) { const p = ph[k];
  console.log(`${k.padEnd(11)} ${f(p.mass).padStart(5)} ${f(p.drag).padStart(8)} ${f(p.thrust).padStart(7)} ${f(p.vmax).padStart(5)} ${f(p.mouthCap).padStart(8)} ${f(p.maxMouthR).padStart(9)}`);
}

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  ✗ FALLO: ${name}`); } };
check('nadador propulsa (empuje > 0.5)', ph.swimmer.thrust > 0.5);
check('nadador se mueve (vmax > 0)', ph.swimmer.vmax > 0.1);
check('pastador casi no propulsa (~0 empuje)', ph.grazer.thrust < 0.05);
check('nadador no tiene boca; pastador sí', ph.swimmer.mouthCap === 0 && ph.grazer.mouthCap > 0);
check('cazador tiene boca y se mueve', ph.hunter.mouthCap > 0 && ph.hunter.thrust > 0.3);
check('boca del cazador maneja presa MAYOR que la del pastador', ph.hunter.maxMouthR > ph.grazer.maxMouthR * 1.5);
// el generalista es MEDIOCRE en ambos ejes vs los especialistas (trade-off físico por presupuesto, sin impuesto)
check('generalista empuja MENOS que el nadador', ph.generalist.thrust < ph.swimmer.thrust);
check('generalista ingiere MENOS que el cazador', ph.generalist.mouthCap < ph.hunter.mouthCap);

console.log(`\n${pass} asserts OK, ${fail} fallos → ${fail === 0 ? 'M5.2 GO ✓ (forma→función: músculo/boca/manejo de presa emergen; trade-off del generalista sin impuesto)' : 'revisar ✗'}`);
process.exit(fail === 0 ? 0 : 1);
