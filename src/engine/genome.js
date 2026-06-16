// Definición del genoma: orden de genes, expresión, copia, mutación y distancia.
// Un genoma es un tramo de NUM_GENES floats en [0,1] dentro de un Float32Array SoA.

const BASE_GENES = [
  // Ecología / fisiología (núcleo de nichos). La conducta vive en el cerebro neuronal, no en genes-atajo.
  'size', 'speed', 'sense', 'metab', 'diet', 'scav', 'repro_thr', 'invest', 'hue', 'temp_pref',
  // Historia de vida (eje r/K): edad de madurez y ritmo de vida (senescencia).
  'mature_age', 'senescence',
  // Identidad / display (color, ojos, selección sexual, señuelo, piel); la FORMA vive en el bloque de NODOS.
  'e_fov', 'c_eye',     // visión (campo de visión funcional) + color de ojos (neutro)
  'orn', 'pref',        // selección sexual: cuánto exhibe + ornamento preferido en la pareja (runaway)
  'c_lum', 'c_sat',     // luminosidad (glow) y vivacidad de color (neutros)
  'o_len', 'o_bulb', 'o_hue', 'o_num', // estilo del señuelo (decorativos)
  'tex2',               // piel: escala/densidad del patrón (neutro)
];

// CUERPO GENERATIVO POR NODOS: un cuerpo = grafo de hasta NODE_COUNT nodos (cabeza/segmentos/apéndices emergen
// de los parámetros del nodo). El bloque va antes del cerebro (que usa offsets relativos). Campos por nodo:
// present, parent, size, aspect (lóbulo↔tentáculo), angle (rel. al padre), attach, osc_amp/osc_phase,
// tipShape (silueta: púa↔elipse↔aleta) y gaitMode (0 ondular · 1 aletear).
export const NODE_COUNT = 8;
export const NODE_FIELDS = ['present', 'parent', 'size', 'aspect', 'angle', 'attach', 'osc_amp', 'osc_phase', 'tipShape', 'gaitMode'];
export const NODE_STRIDE = NODE_FIELDS.length;   // 10 genes por nodo
export const NODE0 = BASE_GENES.length;          // índice del primer gen de nodo (n0_present)
for (let k = 0; k < NODE_COUNT; k++) for (const f of NODE_FIELDS) BASE_GENES.push('n' + k + '_' + f);

// CEREBRO NEURONAL: MLP recurrente (Elman) cuyos PESOS son genes; único motor de conducta. No cuenta en la
// distancia genética (su deriva dominaría). Entradas (10): 0,1 ∇comida · 2,3 dir-presa · 4,5 dir-amenaza ·
// 6 energía · 7 cobertura local · 8 talla relativa de la presa · 9 escapabilidad de la presa. Pesos = (gen-0.5)*scale.
export const BRAIN = { I: 10, H: 5, O: 3, scale: 6 };
// Pesos: entrada→oculta (I·H) + oculta→oculta/memoria (H·H) + sesgos ocultos (H) + oculta→salida (H·O) + sesgos salida (O).
export const BRAIN_W = BRAIN.I * BRAIN.H + BRAIN.H * BRAIN.H + BRAIN.H + BRAIN.H * BRAIN.O + BRAIN.O; // 98
export const BRAIN0 = BASE_GENES.length;                                          // índice del 1er peso
export const GENES = BASE_GENES.concat(Array.from({ length: BRAIN_W }, (_, i) => 'br' + i));
export const NUM_GENES = GENES.length;

// Nombres descriptivos para la UI (mismo orden que GENES).
export const GENE_LABELS = {
  size: 'Tamaño',
  speed: 'Velocidad',
  sense: 'Visión',
  metab: 'Metabolismo',
  diet: 'Dieta',
  scav: 'Caza ↔ carroña',
  repro_thr: 'Umbral de reproducción',
  invest: 'Inversión en crías',
  hue: 'Color (linaje)',
  temp_pref: 'Pref. térmica',
  mature_age: 'Edad de madurez',
  senescence: 'Ritmo de vida (senescencia)',
  e_fov: 'Campo de visión',
  c_eye: 'Color de ojos',
  orn: 'Ornamento (cresta)',
  pref: 'Preferencia de pareja',
  c_lum: 'Luminosidad',
  c_sat: 'Vivacidad de color',
  o_len: 'Señuelo: largo',
  o_bulb: 'Señuelo: tamaño bulbo',
  o_hue: 'Señuelo: color',
  o_num: 'Señuelo: número',
  tex2: 'Piel (escala/densidad)',
};

// Agrupación temática de los genes de fenotipo para la UI (histograma/inspector). Sin pesos del cerebro.
export const GENE_GROUPS = [
  { label: 'Cuerpo y energía',     genes: ['size', 'metab', 'repro_thr', 'invest'] },
  { label: 'Ciclo de vida',        genes: ['mature_age', 'senescence'] },
  { label: 'Dieta',                genes: ['diet', 'scav'] },
  { label: 'Locomoción',           genes: ['speed'] },
  { label: 'Visión',               genes: ['sense', 'e_fov'] },
  { label: 'Térmico',              genes: ['temp_pref'] },
  { label: 'Color y ornamento',    genes: ['hue', 'c_eye', 'orn', 'pref', 'c_lum', 'c_sat', 'o_len', 'o_bulb', 'o_hue', 'o_num', 'tex2'] },
];
GENE_GROUPS.push({ label: 'Nodos (cuerpo)', genes: BASE_GENES.slice(NODE0, NODE0 + NODE_COUNT * NODE_STRIDE) });

// Índices (acceso sin strings en el bucle caliente).
export const G = {};
GENES.forEach((name, i) => { G[name] = i; });

// Genes DECORATIVOS (solo render): no afectan a la física y NO cuentan en la distancia genética → morfos de
// color intra-especie por deriva neutral. La forma (nodos) sí es funcional.
const DECOR_NAMES = ['tex2', 'c_eye', 'c_lum', 'c_sat', 'o_len', 'o_bulb', 'o_hue', 'o_num'];
export const DECOR = new Set(DECOR_NAMES.map((n) => G[n]));
// osc_phase por nodo afecta a la física pero se deja NEUTRAL para la especie (solo importa la dispersión de
// fases dentro de un cuerpo, no su valor absoluto → evita especiación espuria por un offset arbitrario).
for (let k = 0; k < NODE_COUNT; k++) { DECOR.add(G['n' + k + '_osc_phase']); }

// Genes que definen la ESPECIE: ecológicos + forma (nodos). Excluye el cerebro y la apariencia decorativa.
export const FUNCTIONAL = GENES.map((_, i) => i).filter((i) => i < BRAIN0 && !DECOR.has(i));

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

// Distancia genética euclídea normalizada sobre los genes funcionales → [0,1].
export function geneticDistance(genes, ai, bi) {
  const base = ai * NUM_GENES, baseB = bi * NUM_GENES;
  let sum = 0;
  for (const gi of FUNCTIONAL) {
    const d = genes[base + gi] - genes[baseB + gi];
    sum += d * d;
  }
  return Math.sqrt(sum / FUNCTIONAL.length);
}

// Copia el genoma de `src` a `dst` aplicando mutación (una sola tasa por locus, ciega a la función del gen).
export function copyMutated(genes, srcIdx, dstIdx, mut, rng) {
  const s = srcIdx * NUM_GENES, d = dstIdx * NUM_GENES;
  for (let i = 0; i < NUM_GENES; i++) {
    let v = genes[s + i];
    if (rng.next() < mut.rate) v += rng.gaussian() * mut.sigma;
    if (rng.next() < mut.bigRate) v += rng.gaussian() * mut.sigma * mut.bigSigmaMult;
    genes[d + i] = clamp01(v);
  }
}

// Siembra el cerebro de un fundador con conducta COMPETENTE de partida (no pesos ciegos): salida ≈ +∇comida
// +hacia_presa −amenaza; el resto ~0. `atkBias` (0..~0.3) sesga el impulso de ataque (siembra cazadores).
export function seedBrain(genes, idx, rng, atkBias = 0) {
  const b = idx * NUM_GENES + BRAIN0, I = BRAIN.I, H = BRAIN.H, O = BRAIN.O, sc = BRAIN.scale;
  for (let i = 0; i < BRAIN_W; i++) genes[b + i] = clamp01(0.5 + (rng.next() - 0.5) * 0.1); // baseline ~0
  const wHo = I * H + H * H + H;                       // offset (relativo al bloque) de oculta→salida
  const gp = 0.5 + 1.6 / sc, gn = 0.5 - 1.6 / sc, j = () => (rng.next() - 0.5) * 0.06;
  // oculta0 ← +dfx +preyDX −threatDX ; oculta1 ← +dfy +preyDY −threatDY  (entradas 0,2,4 y 1,3,5)
  genes[b + 0 * H + 0] = clamp01(gp + j()); genes[b + 2 * H + 0] = clamp01(gp + j()); genes[b + 4 * H + 0] = clamp01(gn + j());
  genes[b + 1 * H + 1] = clamp01(gp + j()); genes[b + 3 * H + 1] = clamp01(gp + j()); genes[b + 5 * H + 1] = clamp01(gn + j());
  // salida_x ← oculta0 ; salida_y ← oculta1 ; sesgo de la salida de ataque (índice 2)
  genes[b + wHo + 0 * O + 0] = clamp01(gp + j()); genes[b + wHo + 1 * O + 1] = clamp01(gp + j());
  genes[b + wHo + H * O + 2] = clamp01(0.5 + atkBias);  // bO+2 = sesgo del impulso de ataque
}

// Reproducción SEXUAL: el hijo recombina dos padres con LIGAMIENTO (tramos contiguos) + mutación. Solo se
// cruzan padres compatibles (distancia < umbral) → base de la especiación.
export function crossover(genes, aIdx, bIdx, dstIdx, mut, rng) {
  const a = aIdx * NUM_GENES, b = bIdx * NUM_GENES, d = dstIdx * NUM_GENES;
  // recomb = prob. de cambiar de padre por locus: 0.5 ≡ uniforme; →0 = ligamiento fuerte (bloques co-adaptados intactos).
  const recomb = mut.recomb != null ? mut.recomb : 0.5;
  let src = rng.next() < 0.5 ? a : b;                 // padre de partida (al azar)
  for (let i = 0; i < NUM_GENES; i++) {
    if (rng.next() < recomb) src = src === a ? b : a; // punto de cruce → cambia el padre fuente
    let v = genes[src + i];
    if (rng.next() < mut.rate) v += rng.gaussian() * mut.sigma;
    if (rng.next() < mut.bigRate) v += rng.gaussian() * mut.sigma * mut.bigSigmaMult;
    genes[d + i] = clamp01(v);
  }
}
