// Capa de geometría corporal POR NODOS (Pilar v2.0, fase B). Fuente única de la forma del cuerpo.
// `computeBodyPlan` construye una lista TRANSITORIA de nodos (en scratch SoA reutilizable, sin
// asignaciones por nacimiento) y `reducePlan` la suma a los escalares de locomoción. En B1 reproduce
// EXACTAMENTE el modelo A2 (refactor verificable, sin cambio de comportamiento); los campos `axis`/`amp`/
// `eff` quedan poblados como ANDAMIO para B3 (gait: amplitud/fase por nodo + arrastre por orientación).
//
// Frontera del proyecto: aquí se define la FÍSICA de la forma; qué forma es buena lo dicta la selección.
// Todo en unidades del radio de cabeza (r se cancela: empuje y arrastre escalan igual con el tamaño).

import { G, NODE0, NODE_COUNT, NODE_STRIDE } from './genome.js';

const CAP_NODES = NODE_COUNT;        // techo de nodos del cuerpo generativo (B2)
const EPS_AXIS = 0.35;               // banda axial: |ang−eje| < EPS → nodo MEDIAL (1×); fuera → LATERAL (par ×2)
export const KIND_HEAD = 0, KIND_SEG = 1, KIND_MOD = 2;

// Scratch a nivel de módulo (el worker computa nacimientos en serie, monohilo → reentrada imposible).
// Reutilizado en cada llamada: cero GC en nacimientos. NO se almacena por agente (no infla el SoA).
const _ar     = new Float32Array(CAP_NODES);  // área = (radio_nodo / radio_cabeza)²  → masa y arrastre
const _axis   = new Float32Array(CAP_NODES);  // orientación vs eje de nado (π = colineal). ANDAMIO B3.
const _amp    = new Float32Array(CAP_NODES);  // amplitud de oscilación (cuerpo→wave). ANDAMIO B3.
const _eff    = new Float32Array(CAP_NODES);  // eficiencia propulsora del nodo
const _kind   = new Uint8Array(CAP_NODES);    // HEAD | SEG | MOD (selecciona coeficiente de arrastre)
const _limbAr = new Float32Array(CAP_NODES);  // área de apéndices/patas colgando del nodo (hidrodinámica, NO masa)
const _bodyEx = new Float32Array(CAP_NODES);  // ancho de cuerpo (solo cabeza): masa + arrastre reales

// Exponer el scratch + escalares emergentes (para la física y, en B2b, el render). No se copian arrays.
export const plan = { ar: _ar, axis: _axis, amp: _amp, eff: _eff, kind: _kind, limbAr: _limbAr, bodyEx: _bodyEx,
  straight: 1, turnAsym: 0 };

// Construye el plan corporal DESDE EL GENOMA DE NODOS (B2). Un cuerpo = grafo de ≤NODE_COUNT nodos de una sola
// primitiva; cada nodo es lóbulo redondo (aspect bajo → masa+arrastre) o tentáculo fino (aspect alto → limbAr,
// sin masa). Un nodo LATERAL (ángulo lejos del eje) se cuenta espejado (par bilateral ×2); uno MEDIAL va solo.
// La direccionalidad (`straight`) y la asimetría de giro (`turnAsym`) EMERGEN de la simetría del grafo (sustituyen
// al gen m_sym). Devuelve el nº de nodos. `wave`/`effort` = amplitudes de oscilación de cuerpo/remos (del llamante).
// NOTA B2a: posición (parent/attach) aún no afecta a la física (massMul/Dmul/Psum no dependen de dónde está el
// nodo, solo de su área/orientación/amplitud) → parent/attach son andamio para el render (B2b) y B3.
export function computeBodyPlan(g, b, lo, wave, effort) {
  const nb = b + NODE0;
  let n = 0, asymAccum = 0, latArea = 0;
  // --- NODO 0 = RAÍZ (cabeza), siempre presente. Su aspecto define el ancho del cuerpo (redondo = ancho). ---
  const headW = 1.5 - g[nb + 3] * 0.95;                     // aspect 0 (redondo) → 1.5 ancho; 1 (fino) → 0.55
  let bodyEx = headW * headW - 1; if (bodyEx < 0) bodyEx = 0; // área extra del cuerpo ancho (drag+masa); fino → 0
  _ar[0] = 1; _axis[0] = Math.PI; _amp[0] = wave; _eff[0] = lo.bodyThrust; _kind[0] = KIND_HEAD;
  _bodyEx[0] = bodyEx; _limbAr[0] = 0;
  n = 1;
  // --- NODOS 1..NODE_COUNT-1 (opcionales) ---
  for (let k = 1; k < NODE_COUNT; k++) {
    const node = nb + k * NODE_STRIDE;
    if (g[node + 0] < 0.5) continue;                        // present
    const sz = 0.15 + g[node + 2] * 0.85;                   // radio del nodo / cabeza
    const asp = g[node + 3];                                // 0 redondo (lóbulo) .. 1 fino-largo (tentáculo)
    const ang = g[node + 4] * Math.PI;                      // [0,π]
    const crossR = sz * (1 - 0.85 * asp);                   // sección transversal (fino → pequeña)
    const length = sz * (1 + 1.5 * asp);                    // longitud (fino → larga)
    const ar = crossR * crossR;
    const axialDist = ang < Math.PI - ang ? ang : Math.PI - ang; // min(ang, π−ang)
    const isLateral = axialDist > EPS_AXIS;
    const mult = isLateral ? 2 : 1;                         // par bilateral espejado
    _axis[n] = isLateral ? ang : Math.PI;
    _amp[n] = isLateral ? effort : wave;                    // laterales reman (effort); mediales ondulan (wave)
    _eff[n] = isLateral ? lo.modThrust : lo.bodyThrust * lo.segThrust;
    _kind[n] = isLateral ? KIND_MOD : KIND_SEG;
    if (asp > 0.5) { _ar[n] = 0; _bodyEx[n] = 0; _limbAr[n] = ar * mult * length; } // tentáculo: limbAr, no masa
    else { _ar[n] = ar * mult; _bodyEx[n] = 0; _limbAr[n] = 0; }                    // lóbulo/segmento: masa+arrastre
    if (!isLateral) asymAccum += Math.sin(ang) * (ar * mult); // medial desviado del eje → desvía empuje a girar
    latArea += ar * mult;
    n++;
  }
  // Direccionalidad y giro EMERGENTES de la (a)simetría del grafo.
  const asymFrac = latArea > 0 ? Math.min(1, Math.abs(asymAccum) / latArea) : 0;
  plan.straight = lo.symBase + (1 - lo.symBase) * (1 - asymFrac); // 1 = recto; <1 desvía empuje a giro
  plan.turnAsym = asymFrac;                                  // asimetría → mejor giro
  return n;
}

// Reduce el plan (los `n` nodos en scratch) a los escalares de locomoción. En B1 reproduce A2 exacto:
//   massMul = 1 + Σ_nodo ar + bodyMass·bodyExtra            (cabeza aporta su ar=1; limbAr NO es masa)
//   Dmul    = 1 + segDrag·(Σ_seg ar + 0.08·nSeg) + modDrag·Σ_mod ar + limbDrag·Σ limbAr + bodyDrag·bodyExtra
//   Psum    = Σ_nodo ar·amp·eff + Σ limbAr·effort·limbThrust   (forma Σ ar·amp·eff = puente a B3)
export function reducePlan(n, lo, effort) {
  let massMul = 0, Dmul = 1, Psum = 0, nSegNodes = 0;
  for (let k = 0; k < n; k++) {
    const ar = _ar[k], limbAr = _limbAr[k], bodyEx = _bodyEx[k];
    massMul += ar + lo.bodyMass * bodyEx;
    Psum += ar * _amp[k] * _eff[k] + limbAr * effort * lo.limbThrust;
    Dmul += lo.limbDrag * limbAr + lo.bodyDrag * bodyEx;
    const kind = _kind[k];
    if (kind === KIND_SEG) { Dmul += lo.segDrag * (ar + 0.08); nSegNodes++; }
    else if (kind === KIND_MOD) { Dmul += lo.modDrag * ar; }
  }
  return { massMul, Dmul, Psum, nSegNodes };
}
