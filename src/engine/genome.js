// Definición del genoma: orden de genes, expresión, copia, mutación y distancia.
// Un genoma es un tramo de NUM_GENES floats en [0,1] dentro de un Float32Array SoA.

const BASE_GENES = [
  // Ecología / fisiología (núcleo de nichos).
  'size', 'speed', 'sense', 'metab', 'diet', 'aggro',
  'w_food', 'w_prey', 'w_flee', 'repro_thr', 'invest', 'hue', 'temp_pref',
  // --- IDENTIDAD / DISPLAY (color por partes, ojos, selección sexual, señuelo, piel). Tras el CONTRACT (B3b)
  //     la FORMA del cuerpo vive en el bloque de NODOS (abajo); estos son los ejes de color/exhibición. ---
  // Color por partes (`c_app`/`c_tip` CONTIGUOS: el snapshot los manda como bloque `tint`). NEUTRAL.
  'c_app', 'c_tip',
  // Visión: `e_fov` FUNCIONAL (campo de visión, conserva área del cono); `c_eye` color de ojos (neutral).
  'e_fov', 'c_eye',
  // Selección sexual: `orn` = cuánto exhibe (gateado el señuelo); `pref` = ornamento preferido en la pareja (runaway).
  'orn', 'pref',
  // Exhibición sin runaway: luminosidad (glow) y vivacidad de color (saturación). NEUTRALES.
  'c_lum', 'c_sat',
  // Estilo del SEÑUELO (decorativos): largo del tallo, tamaño del bulbo, color del bulbo, nº de señuelos.
  'o_len', 'o_bulb', 'o_hue', 'o_num',
  // Piel: escala/densidad del patrón de textura. NEUTRAL.
  'tex2',
];

// --- B2 (Pilar v2.0): CUERPO GENERATIVO POR NODOS. Una sola primitiva: el "nodo". Un cuerpo es un GRAFO
// de hasta NODE_COUNT nodos (present/parent + geometría); cabeza/segmentos/módulos/apéndices dejan de ser
// categorías y emergen de los parámetros del nodo. El bloque va DESPUÉS del morfológico viejo y ANTES del
// cerebro → NO mueve los índices viejos (render/snapshot intactos en B2a); solo desplaza el cerebro (que
// usa offsets relativos). Campos por nodo: present (≥0.5 existe; n0=raíz, forzado), parent (índice del
// padre), size, aspect (redondo↔fino-largo: lóbulo vs tentáculo), angle (rel. al padre, [0,π]; el espejo
// bilateral cubre el resto), attach (anclaje base↔punta), osc_amp/osc_phase (reserva B3: oscilación por nodo).
export const NODE_COUNT = 8;
export const NODE_FIELDS = ['present', 'parent', 'size', 'aspect', 'angle', 'attach', 'osc_amp', 'osc_phase'];
export const NODE_STRIDE = NODE_FIELDS.length;   // 8 genes por nodo
export const NODE0 = BASE_GENES.length;          // índice del primer gen de nodo (n0_present)
for (let k = 0; k < NODE_COUNT; k++) for (const f of NODE_FIELDS) BASE_GENES.push('n' + k + '_' + f);

// --- CEREBRO NEURONAL (opcional, Fase 4): MLP diminuta cuyos PESOS son genes. Solo se usa si
// `cfg.sim.brain === 'neural'`; en modo reactivo estos genes derivan neutralmente (y NO cuentan en
// la distancia genética → no contaminan las especies). Entradas (I) = señales sensoriales; H ocultas
// (tanh); O=2 salidas = vector de deseo de movimiento. Pesos = (gen-0.5)*scale. ---
export const BRAIN = { I: 7, H: 5, O: 2, scale: 6 };
// RECURRENTE (Elman): pesos entrada→oculta (I·H) + oculta→oculta/MEMORIA (H·H) + sesgos ocultos (H)
// + oculta→salida (H·O) + sesgos salida (O). El estado oculto persiste entre ticks (en sim.brainHid).
export const BRAIN_W = BRAIN.I * BRAIN.H + BRAIN.H * BRAIN.H + BRAIN.H + BRAIN.H * BRAIN.O + BRAIN.O; // 77
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
  aggro: 'Agresividad',
  w_food: 'Atracción a la comida',
  w_prey: 'Atracción a la presa',
  w_flee: 'Tendencia a huir',
  repro_thr: 'Umbral de reproducción',
  invest: 'Inversión en crías',
  hue: 'Color (linaje)',
  temp_pref: 'Pref. térmica',
  c_app: 'Color apéndices',
  c_tip: 'Color puntas',
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

// Agrupación temática de los genes de FENOTIPO (para la UI: desplegable de histograma e inspector,
// que si no son un listado interminable). No incluye los pesos del cerebro.
export const GENE_GROUPS = [
  { label: 'Cuerpo y energía',     genes: ['size', 'metab', 'repro_thr', 'invest'] },
  { label: 'Dieta y conducta',     genes: ['diet', 'aggro', 'w_food', 'w_prey', 'w_flee'] },
  { label: 'Locomoción',           genes: ['speed'] },
  { label: 'Visión',               genes: ['sense', 'e_fov'] },
  { label: 'Color y ornamento',    genes: ['hue', 'temp_pref', 'c_app', 'c_tip', 'c_eye', 'orn', 'pref', 'c_lum', 'c_sat', 'o_len', 'o_bulb', 'o_hue', 'o_num', 'tex2'] },
];
// B2: grupo de los genes de nodo (cuerpo generativo). Se añade tras construir el bloque (NODE0/NODE_COUNT).
GENE_GROUPS.push({ label: 'Nodos (cuerpo)', genes: BASE_GENES.slice(NODE0, NODE0 + NODE_COUNT * NODE_STRIDE) });

// Índices (acceso sin strings en el bucle caliente).
export const G = {};
GENES.forEach((name, i) => { G[name] = i; });

// --- GENES DECORATIVOS LIBRES (solo render): colores por parte, color de ojo, estilo de señuelo y piel.
// NO afectan a la física/energía y los dejamos FUERA de la identidad de especie: NO cuentan en la distancia
// genética → dos bichos con misma ecología y FORMA (nodos) pero distinto COLOR siguen siendo la misma especie
// (y se cruzan) → morfos de color intra-especie. Su variedad surge por DERIVA NEUTRAL. La FORMA del cuerpo
// vive en el bloque de NODOS (funcional, sí cuenta para especie). `osc_amp` por nodo también es funcional.
const DECOR_NAMES = ['tex2', 'c_app', 'c_tip', 'c_eye', 'c_lum', 'c_sat', 'o_len', 'o_bulb', 'o_hue', 'o_num'];
export const DECOR = new Set(DECOR_NAMES.map((n) => G[n]));
// B3: `osc_amp` por nodo YA afecta a la física (amplitud de oscilación) → FUNCIONAL (define especie).
// `osc_phase` sigue siendo andamio (la coordinación de fase llega después) → neutral (DECOR).
for (let k = 0; k < NODE_COUNT; k++) { DECOR.add(G['n' + k + '_osc_phase']); }

// Distancia genética (→ compatibilidad de cruce y clústeres de especie) sobre los genes
// ECOLÓGICOS/funcionales del cuerpo; EXCLUYE el cerebro (su deriva dominaría) y la APARIENCIA (decorativa).
// Tras el CONTRACT (B3b) la FORMA vive en los genes de NODO (funcionales). Las especies se definen por lo
// que importa para sobrevivir: ecología + forma (nodos).
export const FUNCTIONAL = GENES.map((_, i) => i).filter((i) => i < BRAIN0 && !DECOR.has(i));

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

// Distancia genética euclídea normalizada sobre genes funcionales (sin hue) → [0,1].
export function geneticDistance(genes, ai, bi) {
  const base = ai * NUM_GENES, baseB = bi * NUM_GENES;
  let sum = 0;
  for (const gi of FUNCTIONAL) {
    const d = genes[base + gi] - genes[baseB + gi];
    sum += d * d;
  }
  return Math.sqrt(sum / FUNCTIONAL.length);
}

// Copia el genoma de `src` a `dst` aplicando mutación. genes es el SoA compartido.
export function copyMutated(genes, srcIdx, dstIdx, mut, rng) {
  const s = srcIdx * NUM_GENES, d = dstIdx * NUM_GENES;
  for (let i = 0; i < NUM_GENES; i++) {
    let v = genes[s + i];
    // Una sola tasa por locus, CIEGA a la función del gen (color/forma/ecología mutan al mismo ritmo).
    if (rng.next() < mut.rate) v += rng.gaussian() * mut.sigma;
    if (rng.next() < mut.bigRate) v += rng.gaussian() * mut.sigma * mut.bigSigmaMult;
    genes[d + i] = clamp01(v);
  }
}

// Reproducción SEXUAL (Fase 4): el hijo recombina los genomas de dos padres (recombinación CON LIGAMIENTO:
// tramos contiguos de cada padre, ver crossover) + mutación. Base de la especiación: solo se cruzan padres
// genéticamente compatibles (distancia < umbral, ver sim.js) → al divergir más allá del umbral,
// dos grupos dejan de poder cruzarse → especies aisladas que evolucionan por separado.
// Siembra el cerebro de un fundador con una conducta COMPETENTE de partida (no pesos aleatorios/ciegos):
// salida ≈ +gradiente_comida + hacia_presa − amenaza (como la regla reactiva). El resto de pesos ~0 con
// ruido pequeño (incluidos los recurrentes, que la evolución refinará para añadir memoria/búsqueda).
// Así la neuroevolución parte de competencia y AFINA, en vez de descubrirlo todo desde cero.
export function seedBrain(genes, idx, rng) {
  const b = idx * NUM_GENES + BRAIN0, I = BRAIN.I, H = BRAIN.H, O = BRAIN.O, sc = BRAIN.scale;
  for (let i = 0; i < BRAIN_W; i++) genes[b + i] = clamp01(0.5 + (rng.next() - 0.5) * 0.1); // baseline ~0
  const wHo = I * H + H * H + H;                       // offset (relativo al bloque) de oculta→salida
  const gp = 0.5 + 1.6 / sc, gn = 0.5 - 1.6 / sc, j = () => (rng.next() - 0.5) * 0.06;
  // oculta0 ← +dfx +preyDX −threatDX ; oculta1 ← +dfy +preyDY −threatDY  (entradas 0,2,4 y 1,3,5)
  genes[b + 0 * H + 0] = clamp01(gp + j()); genes[b + 2 * H + 0] = clamp01(gp + j()); genes[b + 4 * H + 0] = clamp01(gn + j());
  genes[b + 1 * H + 1] = clamp01(gp + j()); genes[b + 3 * H + 1] = clamp01(gp + j()); genes[b + 5 * H + 1] = clamp01(gn + j());
  // salida_x ← oculta0 ; salida_y ← oculta1
  genes[b + wHo + 0 * O + 0] = clamp01(gp + j()); genes[b + wHo + 1 * O + 1] = clamp01(gp + j());
}

export function crossover(genes, aIdx, bIdx, dstIdx, mut, rng) {
  const a = aIdx * NUM_GENES, b = bIdx * NUM_GENES, d = dstIdx * NUM_GENES;
  // RECOMBINACIÓN CON LIGAMIENTO: en vez de elegir cada gen al azar de un padre (uniforme → destruye los
  // complejos co-adaptados), se parte de un padre y, con prob. `recomb` por locus, se "cruza" cambiando de
  // padre → se heredan TRAMOS CONTIGUOS (como cromosomas reales). recomb=0.5 ≡ uniforme; →0 = ligamiento fuerte
  // (los bloques contiguos —cerebro, forma— pasan casi intactos; orn/pref adyacentes co-evolucionan de verdad).
  const recomb = mut.recomb != null ? mut.recomb : 0.5;
  let src = rng.next() < 0.5 ? a : b;                 // padre de partida (al azar)
  for (let i = 0; i < NUM_GENES; i++) {
    if (rng.next() < recomb) src = src === a ? b : a; // punto de cruce → cambia el padre fuente
    let v = genes[src + i];
    // Una sola tasa por locus, CIEGA a la función del gen (color/forma/ecología mutan al mismo ritmo).
    if (rng.next() < mut.rate) v += rng.gaussian() * mut.sigma;
    if (rng.next() < mut.bigRate) v += rng.gaussian() * mut.sigma * mut.bigSigmaMult;
    genes[d + i] = clamp01(v);
  }
}
