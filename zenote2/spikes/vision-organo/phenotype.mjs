// SPIKE visión-órgano — FENOTIPO (variante). Copia del keeper computePhenotype + una rama SENSOR: el ALCANCE de
// percepción emerge del ÁREA de tejido SENSOR (forma=función, igual que photoCap/mouthCap). Degradación SUAVE:
// sin ojo el alcance es `senseBase` (mínimo innato, casi tocar); con ojo crece hasta `senseMax` (capado al barrido
// del hash → coste de perf ≈ 0). senseGain calibrado para que un ojo modesto dé un salto claro de alcance.
import { TISSUE } from './genome.mjs';

export const PHENO_P = {
  massCoef: 0.04, dragBase: 1.0, dragCoef: 0.3, streamline: 0.4,
  thrustGain: 1.2, photoGain: 1.0, mouthGain: 1.0, vGain: 3.0, vMax: 4.0,
  // visión:
  senseBase: 16,    // alcance innato sin ojo (u) — ve presa/amenaza casi pegadas
  senseGain: 5.0,   // alcance añadido por unidad de área de SENSOR
  senseMax: 88,     // tope (≈ alcance del barrido 3×3 del hash; más allá no hay nada que ver → perf sin coste extra)
};

export function computePhenotype(parts) {
  const P = PHENO_P;
  let mass = 0, drag = P.dragBase, photoCap = 0, mouthCap = 0, maxMouthR = 0, senseArea = 0;
  let re = 0, im = 0, brake = 0;
  for (const p of parts) {
    const area = p.r * p.r;
    mass += area * P.massCoef;                                   // MATERIA (toda parte, incluido el ojo → coste real)
    drag += area * P.dragCoef * (1 - P.streamline * p.aspect);
    if (p.tissue === TISSUE.PHOTO) {
      photoCap += area * (1 + 0.5 * p.aspect) * P.photoGain;
    } else if (p.tissue === TISSUE.MUSCLE) {
      const gait = -Math.cos(p.dir);
      const contrib = p.oscAmp * area * gait * P.thrustGain;
      if (contrib > 0) { re += contrib * Math.cos(p.phase); im += contrib * Math.sin(p.phase); }
      else brake -= contrib;
    } else if (p.tissue === TISSUE.MOUTH) {
      mouthCap += area * P.mouthGain;
      if (p.r > maxMouthR) maxMouthR = p.r;
    } else if (p.tissue === TISSUE.SENSOR) {
      senseArea += area;                                          // OJO: el alcance de percepción sale de aquí
    }
  }
  const thrust = Math.max(0, Math.sqrt(re * re + im * im) - brake);
  let vmax = P.vGain * thrust / drag; if (vmax > P.vMax) vmax = P.vMax;
  let senseRange = P.senseBase + P.senseGain * senseArea; if (senseRange > P.senseMax) senseRange = P.senseMax;
  return { mass, drag, thrust, vmax, photoCap, mouthCap, maxMouthR, senseArea, senseRange };
}
