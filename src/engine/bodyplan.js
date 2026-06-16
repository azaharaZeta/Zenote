// Geometría corporal POR NODOS: fuente única de la forma. `computeBodyPlan` arma una lista transitoria de nodos
// (scratch reutilizable, sin GC por nacimiento) y `reducePlan` la suma a los escalares de locomoción.
// FRONTERA: aquí se define la FÍSICA de la forma (geometría→fuerza); qué forma es buena lo dicta la selección.
// Todo en unidades del radio de cabeza (r se cancela: empuje y arrastre escalan igual con el tamaño).

import { G, NODE0, NODE_COUNT, NODE_STRIDE } from './genome.js';

const CAP_NODES = NODE_COUNT;
export const EPS_AXIS = 0.35;        // banda axial: |ang−eje| < EPS → nodo MEDIAL (1×); fuera → LATERAL (par ×2). El render usa el mismo umbral.
// Presencia GRADUADA: present < LO → ausente; en [LO,HI] el nodo aparece con peso 0→1 (escala su área); ≥ HI pleno.
// Convierte el "acantilado" de añadir un nodo en una rampa → la morfología evoluciona gradualmente (render usa la misma banda).
export const PRES_LO = 0.4, PRES_HI = 0.6;
export const presWeight = (p) => p < PRES_LO ? 0 : p >= PRES_HI ? 1 : (p - PRES_LO) / (PRES_HI - PRES_LO);
export const KIND_HEAD = 0, KIND_SEG = 1, KIND_MOD = 2;

// Scratch a nivel de módulo (nacimientos en serie, monohilo → reentrada imposible; cero GC; no infla el SoA).
const _ar     = new Float32Array(CAP_NODES);  // área = (radio_nodo / radio_cabeza)² → masa y arrastre
const _axis   = new Float32Array(CAP_NODES);  // orientación vs eje de nado (π = colineal)
const _amp    = new Float32Array(CAP_NODES);  // amplitud de oscilación del nodo
const _eff    = new Float32Array(CAP_NODES);  // eficiencia propulsora del nodo
const _kind   = new Uint8Array(CAP_NODES);    // HEAD | SEG | MOD (selecciona coeficiente de arrastre)
const _limbAr = new Float32Array(CAP_NODES);  // área de apéndices/patas (hidrodinámica, NO masa)
const _bodyEx = new Float32Array(CAP_NODES);  // ancho de cuerpo (solo cabeza): masa + arrastre reales
const _gait   = new Float32Array(CAP_NODES);  // empuje DIRECCIONAL: atrás +1, frente −1, lateral +paddle
const _phase  = new Float32Array(CAP_NODES);  // fase de oscilación del nodo (osc_phase·2π) → coherencia de marcha
const _shapeDrag = new Float32Array(CAP_NODES); // multiplicador de arrastre por silueta (tipShape)
const TWO_PI  = 6.283185307;

// Scratch + escalares emergentes, expuestos a la física y al render (no se copian arrays).
export const plan = { ar: _ar, axis: _axis, amp: _amp, eff: _eff, kind: _kind, limbAr: _limbAr, bodyEx: _bodyEx,
  gait: _gait, straight: 1, turnAsym: 0, elongN: 1, stream: 1, fwdReach: 0, flapWork: 0 };

// Construye el plan corporal desde el genoma de nodos. Cada nodo es lóbulo redondo (aspect bajo → masa+arrastre) o
// tentáculo fino (aspect alto → limbAr, sin masa); lateral = par bilateral ×2, medial = solo. El EMPUJE es direccional
// (cola trasera empuja, nodo frontal frena, lateral rema). straight/turnAsym/elongN/stream emergen de la geometría.
export function computeBodyPlan(g, b, lo, effort) {
  const nb = b + NODE0, paddleEff = lo.paddleEff, oscFloor = lo.oscFloor;
  let n = 0, asymAccum = 0, latArea = 0, axialExtent = 0, latExtent = 0, fwdReach = 0, flapWork = 0;
  const ampOf = (oscG) => (oscFloor + (1 - oscFloor) * oscG) * effort; // amplitud del nodo = (suelo+osc_amp)·throttle
  // Nodo 0 = raíz (cabeza), siempre presente. Su aspecto define el ancho del cuerpo (redondo = ancho).
  const headW = 1.5 - g[nb + 3] * 0.95;                     // aspect 0 (redondo) → 1.5 ancho; 1 (fino) → 0.55
  let bodyEx = headW * headW - 1; if (bodyEx < 0) bodyEx = 0; // área extra del cuerpo ancho (drag+masa)
  _ar[0] = 1; _axis[0] = Math.PI; _amp[0] = ampOf(g[nb + 6]); _eff[0] = lo.headThrust; _kind[0] = KIND_HEAD;
  _bodyEx[0] = bodyEx; _limbAr[0] = 0; _gait[0] = 1; _shapeDrag[0] = 1; // la cabeza propulsa débil → nadar bien exige cola/aletas
  _phase[0] = g[nb + 7] * TWO_PI;
  n = 1;
  for (let k = 1; k < NODE_COUNT; k++) {
    const node = nb + k * NODE_STRIDE;
    const w = presWeight(g[node + 0]);                      // presencia graduada
    if (w <= 0) continue;                                   // por debajo de la banda → el nodo no existe
    const sz = 0.15 + g[node + 2] * 0.85;                   // radio del nodo / cabeza
    const asp = g[node + 3];                                // 0 redondo (lóbulo) .. 1 fino-largo (tentáculo)
    // Forma (tipShape, neutro en 0.5): abrir → +empuje +arrastre; afilar → −empuje −arrastre +alcance.
    const ts = g[node + 8] - 0.5;
    const effShape = 1 + lo.tipThrust * 2 * ts;             // abrir empuja más; afilar empuja menos
    const lengthShape = 1 - lo.tipReach * 2 * ts;           // afilar alarga (alcance); abrir acorta
    const emit = g[node + 4] * Math.PI;                     // orientación (0=frente .. π=atrás del eje)
    const ce = Math.cos(emit), se = Math.sin(emit);
    const crossR = sz * (1 - 0.85 * asp);                   // sección transversal (fino → pequeña)
    const length = sz * (1 + 1.5 * asp) * lengthShape;      // longitud (fino → larga; afilar la extiende)
    const ar = crossR * crossR * w;                         // área escalada por presencia
    const axialDist = emit < Math.PI - emit ? emit : Math.PI - emit; // min(emit, π−emit)
    const isLateral = axialDist > EPS_AXIS;
    const mult = isLateral ? 2 : 1;                         // par bilateral espejado
    _axis[n] = emit;
    _amp[n] = ampOf(g[node + 6]);
    // Modo de propulsión (gaitMode): 0 ondular · 1 aletear (más empuje lateral ×se², más arrastre).
    const m = g[node + 9];
    const effFlap = 1 + lo.flapGain * m * se * se;          // aleteo: empuje extra ponderado a lo lateral
    _eff[n] = (isLateral ? lo.modThrust : lo.bodyThrust * lo.segThrust) * effShape * effFlap;
    _shapeDrag[n] = (1 + lo.tipDrag * 2 * ts) * (1 + lo.flapDrag * m); // arrastre por silueta × por aleteo
    _kind[n] = isLateral ? KIND_MOD : KIND_SEG;
    _gait[n] = -ce + paddleEff * se * se;                   // direccional: atrás +1, frente −1, lateral +paddleEff
    _phase[n] = g[node + 7] * TWO_PI;
    let areaForExt;
    if (asp > 0.5) { _ar[n] = 0; _bodyEx[n] = 0; _limbAr[n] = ar * mult * length; areaForExt = _limbAr[n]; } // tentáculo
    else { _ar[n] = ar * mult; _bodyEx[n] = 0; _limbAr[n] = 0; areaForExt = _ar[n]; }                        // lóbulo/segmento
    axialExtent += areaForExt * Math.abs(ce) * length;      // estira el cuerpo a lo largo (eje de nado)
    latExtent += areaForExt * Math.abs(se) * length;        // … o a lo ancho
    if (ce > 0) fwdReach += length * ce * w;                // apéndices frontales → alcance de captura (cuestan nado: gait<0)
    flapWork += m * se * se * ar * mult;                     // trabajo de aleteo → coste energético (organism.js)
    if (!isLateral) asymAccum += se * (ar * mult);          // medial desviado del eje → desvía empuje a girar
    latArea += ar * mult;
    n++;
  }
  plan.fwdReach = fwdReach;                                  // extensión frontal (alcance de captura)
  plan.flapWork = flapWork;                                  // trabajo de aleteo (coste energético)
  // Direccionalidad/giro y streamlining emergentes de la geometría.
  const asymFrac = latArea > 0 ? Math.min(1, Math.abs(asymAccum) / latArea) : 0;
  plan.straight = lo.symBase + (1 - lo.symBase) * (1 - asymFrac); // 1 = recto; <1 desvía empuje a giro
  plan.turnAsym = asymFrac;                                  // asimetría → mejor giro
  let elongN = (axialExtent + 1) / (latExtent + 1);          // cuerpo largo/fino → grande; ancho → ~1
  if (elongN > lo.elongMax) elongN = lo.elongMax; else if (elongN < 1) elongN = 1;
  plan.elongN = elongN;
  plan.stream = lo.streamBase + lo.streamGain * (elongN - 1); // streamlining emergente
  return n;
}

// Reduce los `n` nodos a los escalares de locomoción: massMul (masa), Dmul (arrastre), Psum (empuje neto
// hacia delante con coherencia de fase), nSegNodes. amp_nodo ya incluye el throttle `effort` (no re-multiplicar).
export function reducePlan(n, lo) {
  let massMul = 0, Dmul = 1, nSegNodes = 0;
  // Empuje con coherencia de fase: cada propulsor aporta un fasor c·e^{iφ}; en fase refuerzan, dispersos se cancelan.
  let cohRe = 0, cohIm = 0, pfwd = 0, pback = 0;
  for (let k = 0; k < n; k++) {
    const ar = _ar[k], limbAr = _limbAr[k], bodyEx = _bodyEx[k];
    massMul += ar + lo.bodyMass * bodyEx;
    const c = (ar * _eff[k] + limbAr * lo.limbThrust) * _amp[k] * _gait[k]; // contribución propulsora (con signo)
    if (c > 0) { cohRe += c * Math.cos(_phase[k]); cohIm += c * Math.sin(_phase[k]); pfwd += c; }
    else { pback -= c; }
    const sd = _shapeDrag[k];
    Dmul += (lo.limbDrag * limbAr + lo.bodyDrag * bodyEx) * sd;
    const kind = _kind[k];
    if (kind === KIND_SEG) { Dmul += lo.segDrag * (ar + 0.08) * sd; nSegNodes++; }
    else if (kind === KIND_MOD) { Dmul += lo.modDrag * ar * sd; }
  }
  // Coherencia ∈ [0,1]: 1 = propulsores en fase; <1 = dispersos. phaseGain modula la penalización al empuje (acotada).
  const coh = pfwd > 0 ? Math.sqrt(cohRe * cohRe + cohIm * cohIm) / pfwd : 1;
  const cohEff = 1 - lo.phaseGain * (1 - coh);
  const Psum = cohEff * pfwd - pback;
  return { massMul, Dmul, Psum, nSegNodes };
}
