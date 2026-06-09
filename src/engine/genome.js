// Definición del genoma: orden de genes, expresión, copia, mutación y distancia.
// Un genoma es un tramo de NUM_GENES floats en [0,1] dentro de un Float32Array SoA.

const BASE_GENES = [
  'size', 'speed', 'sense', 'metab', 'diet', 'aggro',
  'w_food', 'w_prey', 'w_flee', 'repro_thr', 'invest', 'hue', 'temp_pref',
  // --- BLOQUE DE FORMA CORPORAL (contiguo: se manda al render de una pieza). ---
  // Morfología base (F-A/F-B): apéndices del cuerpo principal. Funcional (locomoción).
  'm_app', 'm_len', 'm_width', 'm_sym', 'm_elong', 'm_wave',
  // Segmentación (complejidad emergente): cadena de segmentos tras la "cabeza".
  // FASE VISUAL: por ahora solo afectan al dibujo (neutrales). Luego pasarán a funcionales.
  'm_seg', 'm_segtaper', 'm_segspace',
  // Módulos opcionales (2): partes extra on/off ancladas al cuerpo (cabezas/colas/lóbulos).
  'mod0_on', 'mod0_ang', 'mod0_dist', 'mod0_size',
  'mod1_on', 'mod1_ang', 'mod1_dist', 'mod1_size',
  // Forma (estética, NEUTRAL: solo render, derivan libres → variedad de siluetas sin que la
  // selección las colapse). asimetría, curvatura de la columna, colocación de apéndices, ramificación,
  // forma del núcleo.
  's_asym', 's_curve', 's_place', 's_branch', 's_core',
  // Patas del CUERPO (segmentos), independientes de los apéndices de la cabeza: largo base + gradiente delante↔atrás.
  'leg_len', 'leg_grad',
  // --- Ornamentación (color por partes). NEUTRAL: deriva por linaje. Base selección sexual F4. ---
  'c_app', 'c_tip',
  // --- Ojos / visión emergente (F-D). `e_fov` FUNCIONAL (campo de visión); `c_eye` neutral. ---
  'e_fov', 'c_eye',
  // --- Selección sexual (Fase 4): `orn` = ornamento de exhibición (penacho/cresta visible);
  //     `pref` = ornamento preferido en la pareja. Al heredarse juntos co-evolucionan → runaway. ---
  'orn', 'pref',
  // --- APARIENCIA decorativa (deriva libre, NO afecta física ni especie): esbeltez corporal (ancho
  //     independiente del grosor de apéndices) + ejes de EXHIBICIÓN sin runaway: luminosidad (glow) y
  //     vivacidad de color (saturación) → espectro apagado/acromático ↔ brillante/vívido entre individuos. ---
  'b_aspect', 'c_lum', 'c_sat',
  // --- ESTILO del SEÑUELO/ornamento (decorativos, deriva libre): largo del tallo, tamaño del bulbo, color
  //     del bulbo (acento), y nº de señuelos. `orn` sigue siendo "cuánto exhibe" (selección sexual); estos
  //     varían el ESTILO independientemente → señuelos muy distintos entre individuos. ---
  'o_len', 'o_bulb', 'o_hue', 'o_num',
  // --- 2º EJE DE PIEL (decorativo, deriva libre): modula la ESCALA/DENSIDAD del patrón de `s_curve`
  //     (rayas finas↔gruesas, moteado denso↔disperso, ocelos pequeños↔grandes) de forma independiente
  //     al patrón en sí → multiplica el espacio de texturas. Va al final para no mover el bloque de forma. ---
  'tex2',
];

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
  m_app: 'Nº apéndices',
  m_len: 'Largo apéndices',
  m_width: 'Grosor apéndices',
  m_sym: 'Simetría',
  m_elong: 'Elongación cuerpo',
  m_wave: 'Ondulación',
  m_seg: 'Nº de segmentos',
  m_segtaper: 'Cónica de segmentos',
  m_segspace: 'Separación segmentos',
  mod0_on: 'Módulo A (presencia)',
  mod0_ang: 'Módulo A (ángulo)',
  mod0_dist: 'Módulo A (distancia)',
  mod0_size: 'Módulo A (tamaño)',
  mod1_on: 'Módulo B (presencia)',
  mod1_ang: 'Módulo B (ángulo)',
  mod1_dist: 'Módulo B (distancia)',
  mod1_size: 'Módulo B (tamaño)',
  s_asym: 'Silueta de cabeza',
  s_curve: 'Piel (textura)',
  s_place: 'Colocación apéndices',
  s_branch: 'Ramificación',
  s_core: 'Forma del núcleo',
  leg_len: 'Patas cuerpo: largo',
  leg_grad: 'Patas cuerpo: gradiente',
  c_app: 'Color apéndices',
  c_tip: 'Color puntas',
  e_fov: 'Campo de visión',
  c_eye: 'Color de ojos',
  orn: 'Ornamento (cresta)',
  pref: 'Preferencia de pareja',
  b_aspect: 'Esbeltez corporal',
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
  { label: 'Locomoción',           genes: ['speed', 'm_app', 'm_len', 'm_width', 'm_sym', 'm_elong', 'm_wave'] },
  { label: 'Segmentos y módulos',  genes: ['m_seg', 'm_segtaper', 'm_segspace', 'leg_len', 'leg_grad', 'mod0_on', 'mod0_ang', 'mod0_dist', 'mod0_size', 'mod1_on', 'mod1_ang', 'mod1_dist', 'mod1_size'] },
  { label: 'Forma',                genes: ['s_asym', 's_curve', 'tex2', 's_place', 's_branch', 's_core'] },
  { label: 'Visión',               genes: ['sense', 'e_fov'] },
  { label: 'Color y ornamento',    genes: ['hue', 'temp_pref', 'c_app', 'c_tip', 'c_eye', 'orn', 'pref', 'b_aspect', 'c_lum', 'c_sat', 'o_len', 'o_bulb', 'o_hue', 'o_num'] },
];

// Índices (acceso sin strings en el bucle caliente).
export const G = {};
GENES.forEach((name, i) => { G[name] = i; });

// --- GENES DECORATIVOS LIBRES (solo render): colores por parte, estilo de ojo y colocación de
// módulos/ojos. NO afectan a la física/energía y los dejamos FUERA de la identidad de especie:
// NO cuentan en la distancia genética → dos bichos con misma ecología y forma pero distinto COLOR/ojos
// siguen siendo la misma especie (y se cruzan) → morfos de color/ojos intra-especie. Su variedad surge
// por DERIVA NEUTRAL (ya NO por mutar más rápido: ahora todos los genes mutan al mismo ritmo, ver mut).
// La FORMA del cuerpo y los apéndices SÍ cuenta para la especie (no está aquí) → los miembros de una
// especie comparten plan corporal y la variedad de formas queda ENTRE especies. La silueta de cabeza
// (s_asym) cuenta como forma; el estilo de ojo (s_curve) y los colores siguen libres.
const DECOR_NAMES = ['s_curve', 'tex2', 'mod0_ang', 'mod0_dist', 'mod1_ang', 'mod1_dist', 'c_app', 'c_tip', 'c_eye',
  'b_aspect', 'c_lum', 'c_sat', 'o_len', 'o_bulb', 'o_hue', 'o_num'];
export const DECOR = new Set(DECOR_NAMES.map((n) => G[n]));

// Distancia genética (→ compatibilidad de cruce y clústeres de especie) sobre los genes
// ECOLÓGICOS/funcionales del cuerpo; EXCLUYE el cerebro (su deriva dominaría) y la APARIENCIA
// (decorativa, deriva libre). Las especies se definen por lo que importa para sobrevivir.
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

// Reproducción SEXUAL (Fase 4): el hijo recombina los genomas de dos padres (crossover uniforme,
// cada gen viene al azar de uno u otro) + mutación. Base de la especiación: solo se cruzan padres
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
  for (let i = 0; i < NUM_GENES; i++) {
    let v = rng.next() < 0.5 ? genes[a + i] : genes[b + i];
    // Una sola tasa por locus, CIEGA a la función del gen (color/forma/ecología mutan al mismo ritmo).
    if (rng.next() < mut.rate) v += rng.gaussian() * mut.sigma;
    if (rng.next() < mut.bigRate) v += rng.gaussian() * mut.sigma * mut.bigSigmaMult;
    genes[d + i] = clamp01(v);
  }
}
