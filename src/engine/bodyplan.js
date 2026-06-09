// Capa de geometría corporal POR NODOS (Pilar v2.0, fase B). Fuente única de la forma del cuerpo.
// `computeBodyPlan` construye una lista TRANSITORIA de nodos (en scratch SoA reutilizable, sin
// asignaciones por nacimiento) y `reducePlan` la suma a los escalares de locomoción. En B1 reproduce
// EXACTAMENTE el modelo A2 (refactor verificable, sin cambio de comportamiento); los campos `axis`/`amp`/
// `eff` quedan poblados como ANDAMIO para B3 (gait: amplitud/fase por nodo + arrastre por orientación).
//
// Frontera del proyecto: aquí se define la FÍSICA de la forma; qué forma es buena lo dicta la selección.
// Todo en unidades del radio de cabeza (r se cancela: empuje y arrastre escalan igual con el tamaño).

import { G } from './genome.js';

const CAP_NODES = 8;                 // 1 cabeza + ≤4 segmentos + ≤2 módulos + holgura
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

// Exponer el scratch (para futuros consumidores como el render; no se copian arrays).
export const plan = { ar: _ar, axis: _axis, amp: _amp, eff: _eff, kind: _kind, limbAr: _limbAr, bodyEx: _bodyEx };

// Construye el plan corporal a partir del genoma (g, base b). Devuelve el nº de nodos (≥1).
// `wave` = amplitud de ondulación del cuerpo, `effort` = batido de remos (ya calculados por el llamante).
export function computeBodyPlan(g, b, lo, wave, effort) {
  let n = 0;
  // --- CABEZA (nodo 0) ---
  const headW = 0.55 + g[b + G.b_aspect] * 0.95;            // ancho del cuerpo (igual que el render)
  let bodyExtra = headW * headW - 1; if (bodyExtra < 0) bodyExtra = 0; // área extra; un cuerpo fino (<1) → 0
  bodyExtra *= (1 - lo.coreStream * g[b + G.s_core]);       // núcleo afilado recorta el arrastre frontal
  const nApp = 1 + ((g[b + G.m_app] * 7 + 0.5) | 0);        // 1..8, idéntico al render
  const branchMul = g[b + G.s_branch] >= 0.5 ? lo.branchArea : 1;
  _ar[n] = 1; _axis[n] = Math.PI; _amp[n] = wave; _eff[n] = lo.bodyThrust; _kind[n] = KIND_HEAD;
  _bodyEx[n] = bodyExtra;
  _limbAr[n] = nApp * g[b + G.m_len] * (lo.appWidFloor + g[b + G.m_width]) * branchMul; // apéndices de cabeza
  n++;
  // --- CADENA DE SEGMENTOS (posiciones en reposo colineales con el eje, axis=π) ---
  const nSeg = 1 + Math.round(g[b + G.m_seg] * 4);          // 1..5
  const tf = 0.55 + g[b + G.m_segtaper] * 0.5;              // cónica (radio relativo por segmento)
  const legUnit = g[b + G.leg_len] * 0.5;                   // patas: área agregada por segmento
  let rr = 1;
  for (let i = 1; i < nSeg; i++) {
    rr *= tf;
    _ar[n] = rr * rr; _axis[n] = Math.PI; _amp[n] = wave; _eff[n] = lo.bodyThrust * lo.segThrust;
    _kind[n] = KIND_SEG; _bodyEx[n] = 0; _limbAr[n] = legUnit;
    n++;
  }
  // --- MÓDULOS (≤2, presentes si el gen on ≥ 0.5) ---
  for (let mk = 0; mk < 2; mk++) {
    const mb = b + G.mod0_on + mk * 4;
    if (g[mb] >= 0.5) {
      const ms = 0.3 + g[mb + 3] * 0.6;                     // radio del módulo / cabeza
      _ar[n] = ms * ms; _axis[n] = g[mb + 1] * Math.PI; _amp[n] = effort; _eff[n] = lo.modThrust;
      _kind[n] = KIND_MOD; _bodyEx[n] = 0; _limbAr[n] = 0;
      n++;
    }
  }
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
