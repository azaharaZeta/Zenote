// M5.2 — FORMA = FUNCIÓN (2.2 §4). Código KEEPER: la frontera cuerpo→física. Del cuerpo desarrollado (partes,
// genome.js) calcula las CAPACIDADES que alimentan las transacciones del mundo M4 — SIN escalares libres de dieta/
// velocidad. De aquí EMERGE el eje autótrofo↔heterótrofo (un cuerpo de tejido PHOTO capta luz; uno de MUSCLE+MOUTH
// caza) y la incompatibilidad física que hace al generalista mediocre (sin omniPenalty). Se computa al nacer y se
// cachea. Frontera auditable: aquí solo se TRADUCE forma→capacidad; quién gana lo dicta la selección.

import { TISSUE } from './genome.js';

export const PHENO_P = {
  massCoef: 0.04,       // masa estructural ∝ área de las partes (materia). O(1) por cuerpo → coste por masa y presupuesto de materia sanos.
  dragBase: 1.0, dragCoef: 0.3, streamline: 0.4,   // arrastre (forma); elongado (aspect↑) arrastra menos
  thrustGain: 1.2,     // ganancia de empuje de las partes MUSCLE
  photoGain: 1.0,      // ganancia de captación de luz de las partes PHOTO (× área expuesta)
  mouthGain: 1.0,      // ganancia de ingesta de las partes MOUTH
  vGain: 3.0, vMax: 4.0,   // velocidad emergente = vGain · empuje/arrastre, acotada
};

// Devuelve el fenotipo físico cacheado de un cuerpo (lista de partes de develop()).
export function computePhenotype(parts) {
  const P = PHENO_P;
  let mass = 0, drag = P.dragBase, photoCap = 0, mouthCap = 0, maxMouthR = 0;
  let re = 0, im = 0, brake = 0;   // empuje coherente (fasores) − frenado
  for (const p of parts) {
    const area = p.r * p.r;
    mass += area * P.massCoef;                                   // MATERIA estructural (toda parte)
    drag += area * P.dragCoef * (1 - P.streamline * p.aspect);  // ARRASTRE (toda parte; elongada menos)
    if (p.tissue === TISSUE.PHOTO) {
      photoCap += area * (1 + 0.5 * p.aspect) * P.photoGain;     // LUZ ∝ superficie expuesta (ancha/plana capta más)
    } else if (p.tissue === TISSUE.MUSCLE) {
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
    mass,                       // materia estructural (ledger, metabolismo, objetivo de crecimiento)
    drag, thrust, vmax,         // locomoción (coste de nado ∝ drag·v²; velocidad emergente)
    photoCap,                   // fotosíntesis: capta luz ∝ esto
    mouthCap, maxMouthR,        // ingesta: capacidad y tamaño de presa manejable
  };
}

// Lectura del "oficio" (NO afecta a la sim; para color/diagnóstico). Emerge de la inversión de tejido del cuerpo.
// autótrofo si la captación de luz domina sobre la capacidad heterótrofa (caza+ingesta); si no, heterótrofo/mixto.
// ÚNICA definición (M3): la comparten el worker/inspector (vía código) y los tests/scorecard (vía string) → clasifican igual.
const ROLE_NAMES = ['autotrofo', 'heterotrofo', 'mixotrofo'];
export function trophicCode(photoCap, thrust, mouthCap) {   // 0 autótrofo · 1 heterótrofo · 2 mixótrofo
  const hetero = thrust + mouthCap * 2;
  return photoCap > hetero * 1.5 ? 0 : hetero > photoCap * 1.5 ? 1 : 2;
}
export function trophicRole(ph) { return ROLE_NAMES[trophicCode(ph.photoCap, ph.thrust, ph.mouthCap)]; }

// Distancia FENOTÍPICA normalizada (masa/luz/boca). Escala del aislamiento reproductivo (mateCompat) y de la
// especiación (D14). ÚNICA definición (B1): la comparten sim._findMate y test/m7-speciation (antes duplicada).
export function phenoDistance(m1, p1, mo1, m2, p2, mo2) {
  const dm = (m1 - m2) / 2, dp = (p1 - p2) / 40, dmo = (mo1 - mo2) / 10;
  return Math.sqrt(dm * dm + dp * dp + dmo * dmo);
}
