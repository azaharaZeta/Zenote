// M5.2 — FORMA = FUNCIÓN (2.2 §4). Código KEEPER: la frontera cuerpo→física. Del cuerpo desarrollado (partes, genome.js)
// calcula las CAPACIDADES que alimentan las transacciones del mundo — SIN escalares libres de dieta/velocidad. TODOS los
// organismos son ANIMALES (no hay PHOTO): de la inversión MOUTH/MUSCLE emerge el eje herbívoro (boca chica, pasta)↔carnívoro
// (boca grande que maneja presa). Se computa al nacer y se cachea. Aquí solo se TRADUCE forma→capacidad; quién gana lo dicta la selección.

import { TISSUE } from './genome.js';
import { PHENO_P } from '../config.js';   // parámetros forma→función: fuente única en config.js
export { PHENO_P };

// Devuelve el fenotipo físico cacheado de un cuerpo (lista de partes de develop()).
export function computePhenotype(parts) {
  const P = PHENO_P;
  let mass = 0, drag = P.dragBase, mouthCap = 0, maxMouthR = 0;
  let re = 0, im = 0, brake = 0;   // empuje coherente (fasores) − frenado
  for (const p of parts) {
    const area = p.r * p.r;
    mass += area * P.massCoef;                                   // MATERIA estructural (toda parte)
    drag += area * P.dragCoef * (1 - P.streamline * p.aspect);  // ARRASTRE (toda parte; elongada menos)
    if (p.tissue === TISSUE.MUSCLE) {
      const gait = -Math.cos(p.dir);                            // atrás (π)→+1 propulsa · frente (0)→−1 frena
      const contrib = p.oscAmp * area * gait * P.thrustGain;
      if (contrib > 0) { re += contrib * Math.cos(p.phase); im += contrib * Math.sin(p.phase); } // coherencia de fase
      else brake -= contrib;
    } else if (p.tissue === TISSUE.MOUTH) {
      mouthCap += area * P.mouthGain;
      if (p.r > maxMouthR) maxMouthR = p.r;                     // boca mayor → presa mayor manejable
    }
  }
  const thrust = Math.max(0, Math.sqrt(re * re + im * im) - brake);
  let vmax = P.vGain * thrust / drag;                           // VELOCIDAD emerge de empuje/arrastre
  if (vmax > P.vMax) vmax = P.vMax;
  return {
    mass,                       // materia estructural (ledger, metabolismo)
    drag, thrust, vmax,         // locomoción (coste de nado ∝ drag·v²; velocidad emergente)
    mouthCap, maxMouthR,        // ingesta: capacidad (pasta veg/carroña) y tamaño de presa manejable (caza)
  };
}

// Lectura del "oficio" MORFOLÓGICO (NO afecta a la sim; para color/diagnóstico/fallback). Todos animales → el eje es
// herbívoro↔carnívoro. Proxy: cuánta presa ANIMAL puede manejar su boca relativa a su propia masa (maxMouthR·preyMassMax/masa,
// preyMassMax≈1.6 como en sim). Boca grande relativa = carnívoro; chica = herbívoro (pastador); intermedio = omnívoro. El oficio
// REALIZADO (dieta veg/caza/carroña) lo miden el worker (roleFromDiet) y el inspector — ese eje DIETARIO es el de la app.
// Esta lectura MORFOLÓGICA (proxy boca/masa) NO la importan worker/inspector/tests: solo los spikes de exploración (postzygotic, veg-refactor).
const ROLE_NAMES = ['herbivoro', 'carnivoro', 'omnivoro'];
export function trophicCode(mouthCap, maxMouthR, mass) {   // 0 herbívoro · 1 carnívoro · 2 omnívoro
  if (mouthCap <= 1e-6) return 0;                          // sin boca útil → pastador por defecto
  const predScore = maxMouthR * 1.6 / (mass > 1e-6 ? mass : 1e-6);   // ¿puede comer animales de su talla?
  return predScore > 0.8 ? 1 : predScore < 0.35 ? 0 : 2;
}
export function trophicRole(ph) { return ROLE_NAMES[trophicCode(ph.mouthCap, ph.maxMouthR, ph.mass)]; }

// Distancia FENOTÍPICA normalizada (masa / capacidad de boca / tamaño de presa manejable). Escala del aislamiento reproductivo
// (mateCompat) y de la especiación. ÚNICA definición: la comparten sim._findMate y test/m7-speciation.
export function phenoDistance(m1, mo1, r1, m2, mo2, r2) {
  const dm = (m1 - m2) / 2, dmo = (mo1 - mo2) / 10, dr = (r1 - r2) / 4;
  return Math.sqrt(dm * dm + dmo * dmo + dr * dr);
}
