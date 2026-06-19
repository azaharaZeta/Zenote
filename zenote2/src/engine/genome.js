// M5.1 — GENOMA DE REGLAS + DESARROLLO (2.2). Código KEEPER: el mapa genotipo→fenotipo del modelo nuevo.
// El genoma NO son rasgos, son REGLAS DE DESARROLLO (un programa que se ejecuta para crecer el cuerpo). `develop()`
// recorre un grafo generativo de MÓDULOS (con recursión/simetría/modulación por contexto) y produce un CUERPO =
// lista de PARTES con geometría. Validez POR CONSTRUCCIÓN (recursión acotada → siempre un cuerpo legal). La forma
// que produce alimenta la física (M5.2 forma=función) y el render (M5.5). Validado conceptualmente en el spike M3.

// Tejido de una parte → de aquí EMERGE el eje autótrofo↔heterótrofo (M5.2): PHOTO capta luz · MUSCLE propulsa ·
// MOUTH ingiere · STRUCTURE solo da cuerpo. La frontera (qué hace cada tejido) es física; la selección decide cuál.
export const TISSUE = { STRUCTURE: 0, PHOTO: 1, MUSCLE: 2, MOUTH: 3 };
export const TISSUE_N = 4;

export const GENOME_P = {
  partBudget: 32,      // tope de partes del cuerpo (acota recursión → coste y validez)
  recCap: 8,           // tope del límite de recursión por módulo
  modCap: 12,          // tope de módulos en el genoma
  radMin: 1.0, radMax: 6.0,   // gen size → radio de parte (u)
};

const TWO_PI = 6.283185307;
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
const clamp = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;
const radOf = (size) => GENOME_P.radMin + (GENOME_P.radMax - GENOME_P.radMin) * size;
const tissueOf = (t) => Math.min(TISSUE_N - 1, (t * TISSUE_N) | 0);   // gen [0,1] → categoría

// M6.3 — CEREBRO: RNN recurrente (Elman) pequeña; sus PESOS son genes (heredables, mutables). Único motor de conducta
// (cero estrategia cableada). Entradas (8): 0,1 ∇luz · 2,3 dir-presa · 4,5 dir-amenaza · 6 hambre · 7 velocidad propia.
// Salidas (4): 0,1 dirección de empuje · 2 esfuerzo (throttle) · 3 impulso de ataque. La plasticidad (sim) ajusta una
// COPIA de trabajo en vida (no heredable: Baldwin, no lamarckismo); lo que evoluciona es el cerebro de NACIMIENTO.
export const BRAIN = { I: 8, H: 6, O: 4, scale: 5 };
export const BRAIN_W = BRAIN.I * BRAIN.H + BRAIN.H * BRAIN.H + BRAIN.H + BRAIN.H * BRAIN.O + BRAIN.O;  // 118
export function makeBrain(rng) { const b = new Float32Array(BRAIN_W); for (let i = 0; i < BRAIN_W; i++) b[i] = (rng.next() - 0.5) * 0.4; return b; }

// M6.3-bootstrap — SEEDBRAIN: pesos de partida COMPETENTES (no ciegos). Decisión del usuario: el bootstrapping de
// conducta no arrancaba desde cerebro en blanco (medido: caza ≈ aleatorio). Es el fallback previsto en 2.3, probado
// en la app actual. NO es estrategia cableada fija: es el PUNTO DE PARTIDA — la conducta sigue evolucionando (mutación
// del cerebro de nacimiento) y aprendiendo en vida (plasticidad). Cablea: ir hacia presa/∇luz, huir de amenaza, moverse
// y atacar en contacto, vía 2 neuronas-relé (eje X/Y). El resto = ruido pequeño (makeBrain).
export function seedBrain(rng) {
  const b = makeBrain(rng), I = BRAIN.I, H = BRAIN.H, O = BRAIN.O, k = 1.5;
  const wHo = I * H + H * H + H, bO = wHo + H * O;
  // h0 = relé del eje X: + hacia presa (in2) · − amenaza (in4) · + ∇luz (in0)   [índice wIh = in·H + h]
  b[2 * H + 0] = k; b[4 * H + 0] = -k; b[0 * H + 0] = k * 0.5;
  // h1 = relé del eje Y: + presa (in3) · − amenaza (in5) · + ∇luz (in1)
  b[3 * H + 1] = k; b[5 * H + 1] = -k; b[1 * H + 1] = k * 0.5;
  // oculta→salida: h0→dir X (out0) · h1→dir Y (out1)   [índice wHo + h·O + o]
  b[wHo + 0 * O + 0] = k; b[wHo + 1 * O + 1] = k;
  // sesgos de salida: throttle (out2) + → se mueve · ataque (out3) + → ataca en contacto
  b[bO + 2] = 0.5; b[bO + 3] = 0.3;
  return b;
}

let HOM = 1;   // contador global de marcas de homología (para recombinación en M7)

function mkModule(rng) {
  return {
    angle: rng.next() * Math.PI,   // emisión rel. al eje (0 frente .. π atrás)
    size: 0.3 + rng.next() * 0.4, aspect: rng.next(), tissue: rng.next(),
    oscAmp: rng.next() * 0.6, phase: rng.next(),
    recursive: rng.next() < 0.3, recLimit: 1 + (rng.next() * GENOME_P.recCap) | 0,
    symmetric: rng.next() < 0.4, taper: 0.6 + rng.next() * 0.4,
    hom: HOM++,
  };
}

// Fundador SIMPLE (la complejidad EMERGE): cabeza + un módulo fotosintético pequeño (plántula viable, no estéril).
// tissue 0.35 → bin PHOTO (tissueOf: t·4|0 = 1). [PHOTO = [0.25,0.5); ojo: valores <0.25 caen en STRUCTURE.]
export function makeFounder(rng) {
  return {
    root: { size: 0.45, aspect: 0.3, tissue: 0.35 /*PHOTO*/, oscAmp: 0.15, phase: rng.next() },
    modules: [{ angle: 0.6, size: 0.4, aspect: 0.6, tissue: 0.35 /*PHOTO*/, oscAmp: 0.2, phase: rng.next(),
                recursive: false, recLimit: 1, symmetric: true, taper: 0.85, hom: HOM++ }],
    brain: seedBrain(rng),   // bootstrap de conducta competente (decisión del usuario); evoluciona/aprende desde aquí
  };
}

export function cloneGenome(g) {
  return { root: { ...g.root }, modules: g.modules.map((m) => ({ ...m })), brain: g.brain ? Float32Array.from(g.brain) : null };
}

// DESARROLLO: genoma de reglas → cuerpo (lista de partes con geometría). Determinista, acotado, SIEMPRE válido.
// Parte: { x,y (rel. al origen del cuerpo), r (radio), aspect, dir (dirección de emisión = eje de gait), tissue,
//          oscAmp, phase, parent (índice, para el render del esqueleto) }.
export function develop(g) {
  const B = GENOME_P, parts = [];
  const root = g.root;
  parts.push({ x: 0, y: 0, r: radOf(root.size), aspect: root.aspect, dir: 0, tissue: tissueOf(root.tissue),
               oscAmp: root.oscAmp, phase: root.phase * TWO_PI, parent: -1 });
  for (const m of g.modules) {
    if (parts.length >= B.partBudget) break;
    const signs = m.symmetric ? [1, -1] : [1];           // simetría bilateral: par espejado (1 bit)
    for (const s of signs) {
      if (parts.length >= B.partBudget) break;
      const dir = clamp(m.angle, 0, Math.PI) * s;         // dirección de emisión (espejada por s)
      const cd = Math.cos(dir), sd = Math.sin(dir);
      let parentIdx = 0, r = radOf(m.size);
      const L = m.recursive ? clamp(m.recLimit | 0, 1, B.recCap) : 1;   // recursión → cadena (acotada)
      for (let d = 0; d < L && parts.length < B.partBudget; d++) {
        const p = parts[parentIdx], dist = p.r + r;
        parts.push({ x: p.x + cd * dist, y: p.y + sd * dist, r, aspect: m.aspect, dir,
                     tissue: tissueOf(m.tissue), oscAmp: m.oscAmp, phase: m.phase * TWO_PI, parent: parentIdx });
        parentIdx = parts.length - 1;                     // cadena: la siguiente se ancla a esta
        r *= clamp(m.taper, 0.4, 1);                      // modulación por contexto: afilamiento a lo largo de la cadena
      }
    }
  }
  return parts;
}

// MUTACIÓN (operadores de 2.2 §7): paramétrica (frecuente, suave) + estructurales (raras, gran efecto = cruza-valles).
export function mutate(g, rng) {
  const B = GENOME_P, n = cloneGenome(g);
  // paramétricas sobre la raíz
  const r = n.root;
  if (rng.next() < 0.2) r.size = clamp01(r.size + rng.gaussian() * 0.1);
  if (rng.next() < 0.2) r.aspect = clamp01(r.aspect + rng.gaussian() * 0.1);
  if (rng.next() < 0.1) r.tissue = clamp01(r.tissue + rng.gaussian() * 0.15);
  if (rng.next() < 0.2) r.oscAmp = clamp01(r.oscAmp + rng.gaussian() * 0.1);
  if (rng.next() < 0.2) r.phase = (r.phase + rng.gaussian() * 0.1 + 1) % 1;
  // estructurales sobre el conjunto de módulos
  if (rng.next() < 0.10 && n.modules.length < B.modCap) n.modules.push(mkModule(rng));                 // AÑADIR
  if (rng.next() < 0.08 && n.modules.length && n.modules.length < B.modCap) {                          // DUPLICAR (copia coherente)
    const src = n.modules[(rng.next() * n.modules.length) | 0]; n.modules.push({ ...src, hom: HOM++ });
  }
  if (rng.next() < 0.05 && n.modules.length > 0) n.modules.splice((rng.next() * n.modules.length) | 0, 1); // BORRAR
  for (const m of n.modules) {
    if (rng.next() < 0.06) m.recursive = !m.recursive;                                                 // toggle recursión
    if (rng.next() < 0.10) m.recLimit = clamp((m.recLimit + (rng.next() < 0.5 ? 1 : -1)) | 0, 1, B.recCap); // límite
    if (rng.next() < 0.06) m.symmetric = !m.symmetric;                                                 // toggle simetría (1 bit → par)
    if (rng.next() < 0.08) m.tissue = clamp01(m.tissue + rng.gaussian() * 0.2);                        // tejido (puede cambiar de categoría)
    if (rng.next() < 0.15) m.angle = clamp(m.angle + rng.gaussian() * 0.4, 0, Math.PI);
    if (rng.next() < 0.15) m.size = clamp01(m.size + rng.gaussian() * 0.12);
    if (rng.next() < 0.15) m.aspect = clamp01(m.aspect + rng.gaussian() * 0.12);
    if (rng.next() < 0.12) m.oscAmp = clamp01(m.oscAmp + rng.gaussian() * 0.12);
    if (rng.next() < 0.10) m.taper = clamp(m.taper + rng.gaussian() * 0.1, 0.4, 1);                    // regulatoria
    if (rng.next() < 0.12) m.phase = (m.phase + rng.gaussian() * 0.12 + 1) % 1;
    if (rng.next() < 0.01) m.hom = HOM++;                                                              // homología (rarísima)
  }
  // CEREBRO: muta los pesos de NACIMIENTO (lo heredable). La copia de trabajo (aprendida en vida) NO se hereda.
  if (n.brain) { const b = n.brain; for (let k = 0; k < b.length; k++) { if (rng.next() < 0.08) { let v = b[k] + rng.gaussian() * 0.15; b[k] = v < -3 ? -3 : v > 3 ? 3 : v; } } }
  return n;
}

// M7 — RECOMBINACIÓN SEXUAL por MÓDULOS HOMÓLOGOS (2.4 eje 1). Alinea los módulos de ambos padres por su marca de
// homología (hom, como genes Hox) y el hijo toma cada módulo de un padre u otro con LIGAMIENTO (tramos contiguos) →
// recombina órganos enteros y bien formados → la cría es SIEMPRE un cuerpo válido (preserva la garantía de 2.2). El
// cerebro se cruza por un punto. NO muta aquí (el sim aplica mutate después, como en la vía asexual).
export function recombine(gA, gB, rng) {
  const root = {}; for (const k of ['size', 'aspect', 'tissue', 'oscAmp', 'phase']) root[k] = (rng.next() < 0.5 ? gA : gB).root[k];
  const byHom = new Map();
  for (const m of gA.modules) byHom.set(m.hom, { a: m });
  for (const m of gB.modules) { const e = byHom.get(m.hom) || {}; e.b = m; byHom.set(m.hom, e); }
  const modules = []; let fromA = rng.next() < 0.5;
  for (const e of byHom.values()) {
    if (rng.next() < 0.3) fromA = !fromA;                 // punto de cruce (ligamiento: tramos del mismo padre)
    if (e.a && e.b) modules.push({ ...(fromA ? e.a : e.b) });   // homólogo en ambos → de uno
    else if (rng.next() < 0.6) modules.push({ ...(e.a || e.b) }); // presente en uno → heredar con prob.
  }
  let brain = null;
  if (gA.brain && gB.brain) { brain = new Float32Array(gA.brain.length); const cut = (rng.next() * brain.length) | 0; for (let k = 0; k < brain.length; k++) brain[k] = (k < cut ? gA : gB).brain[k]; }
  else if (gA.brain || gB.brain) brain = Float32Array.from(gA.brain || gB.brain);
  return { root, modules, brain };
}

// Estadística estructural del cuerpo (para tests/inspección).
export function bodyStats(parts) {
  let chain = new Array(parts.length).fill(1), maxChain = 1;
  const tissues = [0, 0, 0, 0];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]; tissues[p.tissue]++;
    if (p.parent >= 0) { chain[i] = chain[p.parent] + 1; if (chain[i] > maxChain) maxChain = chain[i]; }
  }
  return { nParts: parts.length, maxChain, tissues };
}
