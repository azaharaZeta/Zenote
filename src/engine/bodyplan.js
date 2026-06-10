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
export const EPS_AXIS = 0.35;        // banda axial: |ang−eje| < EPS → nodo MEDIAL (1×); fuera → LATERAL (par ×2). Exportado: el render usa el mismo umbral.
// PRESENCIA GRADUADA del nodo (no un on/off duro): present < LO → ausente; en [LO,HI] el nodo APARECE de forma
// continua (peso 0→1 que escala su área → masa/arrastre/empuje); ≥ HI → pleno. Convierte el "acantilado" de
// añadir un nodo en una RAMPA → la morfología puede evolucionar gradualmente. El render usa la misma banda
// (el nodo crece visualmente al aparecer). Exportado para que física y render coincidan.
export const PRES_LO = 0.4, PRES_HI = 0.6;
export const presWeight = (p) => p < PRES_LO ? 0 : p >= PRES_HI ? 1 : (p - PRES_LO) / (PRES_HI - PRES_LO);
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
const _gait   = new Float32Array(CAP_NODES);  // B3: factor de empuje DIRECCIONAL: atrás +1, frente −1, lateral +paddle
const _phase  = new Float32Array(CAP_NODES);  // B3+: fase de oscilación del nodo (osc_phase·2π) → coherencia de marcha
const _shapeDrag = new Float32Array(CAP_NODES); // Capa 1: multiplicador de arrastre por SILUETA (tipShape): abrir → más, afilar → menos
const TWO_PI  = 6.283185307;

// Exponer el scratch + escalares emergentes (para la física y, en B2b, el render). No se copian arrays.
export const plan = { ar: _ar, axis: _axis, amp: _amp, eff: _eff, kind: _kind, limbAr: _limbAr, bodyEx: _bodyEx,
  gait: _gait, straight: 1, turnAsym: 0, elongN: 1, stream: 1, fwdReach: 0 };

// Construye el plan corporal DESDE EL GENOMA DE NODOS (B2). Un cuerpo = grafo de ≤NODE_COUNT nodos de una sola
// primitiva; cada nodo es lóbulo redondo (aspect bajo → masa+arrastre) o tentáculo fino (aspect alto → limbAr,
// sin masa). Un nodo LATERAL (ángulo lejos del eje) se cuenta espejado (par bilateral ×2); uno MEDIAL va solo.
// `straight`/`turnAsym` EMERGEN de la simetría del grafo. `elongN`/`stream` (streamlining) EMERGEN de la
// geometría (cuerpo largo/fino = menos arrastre). El EMPUJE es DIRECCIONAL (B3): cada nodo propulsa según su
// ORIENTACIÓN — un nodo trasero (emit≈π) empuja hacia delante (+1); uno frontal (emit≈0) frena (−1); uno
// lateral rema (+paddleEff). La amplitud de oscilación es POR NODO (`osc_amp`, modulada por el throttle global
// `effort`). Así la forma hidrodinámicamente coherente (cola atrás) EMERGE por selección, sin reglas codificadas.
export function computeBodyPlan(g, b, lo, effort) {
  const nb = b + NODE0, paddleEff = lo.paddleEff, oscFloor = lo.oscFloor;
  let n = 0, asymAccum = 0, latArea = 0, axialExtent = 0, latExtent = 0, fwdReach = 0;
  const ampOf = (oscG) => (oscFloor + (1 - oscFloor) * oscG) * effort; // amplitud del nodo = (suelo+osc_amp)·throttle
  // --- NODO 0 = RAÍZ (cabeza), siempre presente. Su aspecto define el ancho del cuerpo (redondo = ancho). ---
  const headW = 1.5 - g[nb + 3] * 0.95;                     // aspect 0 (redondo) → 1.5 ancho; 1 (fino) → 0.55
  let bodyEx = headW * headW - 1; if (bodyEx < 0) bodyEx = 0; // área extra del cuerpo ancho (drag+masa); fino → 0
  _ar[0] = 1; _axis[0] = Math.PI; _amp[0] = ampOf(g[nb + 6]); _eff[0] = lo.headThrust; _kind[0] = KIND_HEAD;
  _bodyEx[0] = bodyEx; _limbAr[0] = 0; _gait[0] = 1; _shapeDrag[0] = 1; // emit=π; propulsa DÉBIL (headThrust): la cabeza es carga,
  //  no motor → nadar bien EXIGE cola/aletas (que emergen por selección). Antes era el motor dominante (bodyThrust).
  _phase[0] = g[nb + 7] * TWO_PI;                           // osc_phase de la cabeza
  n = 1;
  // --- NODOS 1..NODE_COUNT-1 (opcionales) ---
  for (let k = 1; k < NODE_COUNT; k++) {
    const node = nb + k * NODE_STRIDE;
    const w = presWeight(g[node + 0]);                      // presencia GRADUADA: <LO ausente, [LO,HI] rampa, ≥HI pleno
    if (w <= 0) continue;                                   // por debajo de la banda → el nodo no existe
    const sz = 0.15 + g[node + 2] * 0.85;                   // radio del nodo / cabeza
    const asp = g[node + 3];                                // 0 redondo (lóbulo) .. 1 fino-largo (tentáculo)
    // FORMA (Capa 1, tipShape): ts<0 AFILA (púa/garra/tentáculo) · ts>0 ABRE (aleta/paleta). Compromiso físico
    // honesto, NEUTRO en 0.5: abrir → +empuje y +arrastre (paleta); afilar → −empuje, −arrastre y +alcance.
    const ts = g[node + 8] - 0.5;
    const effShape = 1 + lo.tipThrust * 2 * ts;             // abrir empuja más; afilar empuja menos
    const lengthShape = 1 - lo.tipReach * 2 * ts;           // afilar alarga (alcance); abrir acorta
    const emit = g[node + 4] * Math.PI;                     // orientación REAL (0=frente .. π=atrás del eje)
    const ce = Math.cos(emit), se = Math.sin(emit);
    const crossR = sz * (1 - 0.85 * asp);                   // sección transversal (fino → pequeña)
    const length = sz * (1 + 1.5 * asp) * lengthShape;      // longitud (fino → larga; afilar la extiende)
    const ar = crossR * crossR * w;                         // ÁREA escalada por presencia → un nodo que aparece pesa/arrastra/empuja en proporción
    const axialDist = emit < Math.PI - emit ? emit : Math.PI - emit; // min(emit, π−emit)
    const isLateral = axialDist > EPS_AXIS;
    const mult = isLateral ? 2 : 1;                         // par bilateral espejado
    _axis[n] = emit;
    _amp[n] = ampOf(g[node + 6]);
    // MODO de propulsión (Capa 3, gaitMode): m=0 ondular (va en la onda del cuerpo) · m=1 aletear/batir. El aleteo
    // da MÁS empuje en nodos LATERALES (peso se² → las aletas/remos baten; las colas mediales no "baten", ondulan)
    // pero cuesta MÁS arrastre (golpe de recuperación). NEUTRO en 0 → sin cambio. Crucero eficiente ↔ ráfaga potente.
    const m = g[node + 9];
    const effFlap = 1 + lo.flapGain * m * se * se;          // aleteo: empuje extra ponderado a lo LATERAL
    _eff[n] = (isLateral ? lo.modThrust : lo.bodyThrust * lo.segThrust) * effShape * effFlap;
    _shapeDrag[n] = (1 + lo.tipDrag * 2 * ts) * (1 + lo.flapDrag * m); // arrastre por silueta × por aleteo (lo aplica reducePlan)
    _kind[n] = isLateral ? KIND_MOD : KIND_SEG;
    _gait[n] = -ce + paddleEff * se * se;                   // DIRECCIONAL: atrás +1, frente −1, lateral +paddleEff
    _phase[n] = g[node + 7] * TWO_PI;                       // osc_phase del nodo (coherencia de marcha, reducePlan)
    let areaForExt;
    if (asp > 0.5) { _ar[n] = 0; _bodyEx[n] = 0; _limbAr[n] = ar * mult * length; areaForExt = _limbAr[n]; } // tentáculo
    else { _ar[n] = ar * mult; _bodyEx[n] = 0; _limbAr[n] = 0; areaForExt = _ar[n]; }                        // lóbulo/segmento
    axialExtent += areaForExt * Math.abs(ce) * length;      // estira el cuerpo a lo LARGO (eje de nado)
    latExtent += areaForExt * Math.abs(se) * length;        // … o a lo ANCHO
    if (ce > 0) fwdReach += length * ce * w;                // Capa 2: apéndices que apuntan AL FRENTE → alcance de captura (cuesta nado: gait<0)
    if (!isLateral) asymAccum += se * (ar * mult);          // medial desviado del eje → desvía empuje a girar
    latArea += ar * mult;
    n++;
  }
  plan.fwdReach = fwdReach;                                  // Capa 2: extensión frontal (alcance de captura, ver organism.js)
  // Direccionalidad/giro y streamlining EMERGENTES de la geometría.
  const asymFrac = latArea > 0 ? Math.min(1, Math.abs(asymAccum) / latArea) : 0;
  plan.straight = lo.symBase + (1 - lo.symBase) * (1 - asymFrac); // 1 = recto; <1 desvía empuje a giro
  plan.turnAsym = asymFrac;                                  // asimetría → mejor giro
  let elongN = (axialExtent + 1) / (latExtent + 1);          // cuerpo largo/fino → grande; ancho → ~1
  if (elongN > lo.elongMax) elongN = lo.elongMax; else if (elongN < 1) elongN = 1;
  plan.elongN = elongN;
  plan.stream = lo.streamBase + lo.streamGain * (elongN - 1); // streamlining EMERGENTE de la geometría de nodos
  return n;
}

// Reduce el plan (los `n` nodos en scratch) a los escalares de locomoción (B3):
//   massMul = 1 + Σ_nodo ar + bodyMass·bodyExtra            (cabeza aporta su ar=1; limbAr NO es masa)
//   Dmul    = 1 + segDrag·(Σ_seg ar + 0.08·nSeg) + modDrag·Σ_mod ar + limbDrag·Σ limbAr + bodyDrag·bodyExtra
//   Psum    = Σ_nodo (ar·eff + limbAr·limbThrust) · amp_nodo · gait   (DIRECCIONAL; amp_nodo ya incluye el
//            throttle `effort` UNA vez → `v` NO debe volver a multiplicar por effort). amp por nodo = `osc_amp`.
export function reducePlan(n, lo) {
  let massMul = 0, Dmul = 1, nSegNodes = 0;
  // Empuje DIRECCIONAL con COHERENCIA DE FASE (B3+): cada nodo propulsor aporta un fasor c·e^{iφ} (φ=osc_phase).
  // Las contribuciones HACIA DELANTE (c>0) se suman como vectores: en fase → refuerzan; dispersas (aleteo
  // descoordinado) → se cancelan parcialmente. Las de FRENO (c<0, p. ej. nodo frontal) penalizan a pleno.
  let cohRe = 0, cohIm = 0, pfwd = 0, pback = 0;
  for (let k = 0; k < n; k++) {
    const ar = _ar[k], limbAr = _limbAr[k], bodyEx = _bodyEx[k];
    massMul += ar + lo.bodyMass * bodyEx;
    const c = (ar * _eff[k] + limbAr * lo.limbThrust) * _amp[k] * _gait[k]; // contribución propulsora (con signo)
    if (c > 0) { cohRe += c * Math.cos(_phase[k]); cohIm += c * Math.sin(_phase[k]); pfwd += c; }
    else { pback -= c; }
    const sd = _shapeDrag[k];                                // arrastre por silueta (tipShape): abrir → +, afilar → −
    Dmul += (lo.limbDrag * limbAr + lo.bodyDrag * bodyEx) * sd;
    const kind = _kind[k];
    if (kind === KIND_SEG) { Dmul += lo.segDrag * (ar + 0.08) * sd; nSegNodes++; }
    else if (kind === KIND_MOD) { Dmul += lo.modDrag * ar * sd; }
  }
  // Coherencia ∈ [0,1]: 1 = todos los propulsores en fase (o uno solo → cabeza sola = base B3 intacta);
  // <1 = fases dispersas. `phaseGain` modula la penalización (0 = modelo previo). Solo REDUCE el empuje hacia
  // delante → nunca supera la suma en fase → acotado. Así nadar COORDINADO emerge sin reglas.
  const coh = pfwd > 0 ? Math.sqrt(cohRe * cohRe + cohIm * cohIm) / pfwd : 1;
  const cohEff = 1 - lo.phaseGain * (1 - coh);
  const Psum = cohEff * pfwd - pback;
  return { massMul, Dmul, Psum, nSegNodes };
}
