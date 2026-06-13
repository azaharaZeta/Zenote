// Definición del genoma: orden de genes, expresión, copia, mutación y distancia.
// Un genoma es un tramo de NUM_GENES floats en [0,1] dentro de un Float32Array SoA.

const BASE_GENES = [
  // Ecología / fisiología (núcleo de nichos). Conducta (moverse Y atacar) = cerebro neuronal, no genes-atajo.
  'size', 'speed', 'sense', 'metab', 'diet', 'scav', 'repro_thr', 'invest', 'hue', 'temp_pref',
  // HISTORIA DE VIDA (#12): edad de madurez (gatea cría + inicio de senescencia) y ritmo de vida (senescencia
  // + coste de longevidad). Juntos crean el eje r/K emergente (vivir rápido y morir joven ↔ lento y longevo).
  'mature_age', 'senescence',
  // --- IDENTIDAD / DISPLAY (color por partes, ojos, selección sexual, señuelo, piel). Tras el CONTRACT (B3b)
  //     la FORMA del cuerpo vive en el bloque de NODOS (abajo); estos son los ejes de color/exhibición. ---
  // Visión: `e_fov` FUNCIONAL (campo de visión, conserva área del cono); `c_eye` color de ojos (neutral).
  // (#13: `c_app`/`c_tip` retirados — c_tip estaba muerto y c_app solo tintaba el tallo del señuelo.)
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
// bilateral cubre el resto), attach (anclaje base↔punta), osc_amp/osc_phase (oscilación por nodo),
// tipShape (Capa 1: SILUETA base↔punta — <0.5 afila a púa/garra/tentáculo, ≈0.5 elipse, >0.5 abre a aleta/paleta),
// gaitMode (Capa 3: MODO de propulsión — 0 ondular como la onda del cuerpo · 1 aletear/batir, más empuje lateral y arrastre).
export const NODE_COUNT = 8;
export const NODE_FIELDS = ['present', 'parent', 'size', 'aspect', 'angle', 'attach', 'osc_amp', 'osc_phase', 'tipShape', 'gaitMode'];
export const NODE_STRIDE = NODE_FIELDS.length;   // 10 genes por nodo
export const NODE0 = BASE_GENES.length;          // índice del primer gen de nodo (n0_present)
for (let k = 0; k < NODE_COUNT; k++) for (const f of NODE_FIELDS) BASE_GENES.push('n' + k + '_' + f);

// --- CEREBRO NEURONAL: MLP diminuta cuyos PESOS son genes. Es el ÚNICO motor de conducta (la regla reactiva
// se retiró, #9). Los pesos NO cuentan en la distancia genética (su deriva dominaría → no contaminan las
// especies). Entradas (I) = señales sensoriales; H ocultas (tanh); O=3 salidas = deseo de movimiento (dx,dy)
// + IMPULSO DE ATAQUE (cazar/agredir emerge del cerebro, ya no del gen `aggro`). Pesos = (gen-0.5)*scale. ---
// Entradas (9): 0,1 ∇comida · 2,3 dir-presa · 4,5 dir-amenaza · 6 energía · 7 COBERTURA local (vegetación de su celda →
// uso táctico del refugio) · 8 TALLA relativa de la presa (ratio−1 → evitar presa grande). Las nuevas (7,8) arrancan con
// peso ~0 (seedBrain NO las siembra) → su uso EMERGE por selección, no cableado. Subir I obliga a resembrar (NUM_GENES 186→196).
export const BRAIN = { I: 9, H: 5, O: 3, scale: 6 };
// RECURRENTE (Elman): pesos entrada→oculta (I·H) + oculta→oculta/MEMORIA (H·H) + sesgos ocultos (H)
// + oculta→salida (H·O) + sesgos salida (O). El estado oculto persiste entre ticks (en sim.brainHid).
export const BRAIN_W = BRAIN.I * BRAIN.H + BRAIN.H * BRAIN.H + BRAIN.H + BRAIN.H * BRAIN.O + BRAIN.O; // 93 (I·H=45 + H²=25 + H=5 + H·O=15 + O=3)
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

// Agrupación temática de los genes de FENOTIPO (para la UI: desplegable de histograma e inspector,
// que si no son un listado interminable). No incluye los pesos del cerebro.
export const GENE_GROUPS = [
  { label: 'Cuerpo y energía',     genes: ['size', 'metab', 'repro_thr', 'invest'] },
  { label: 'Ciclo de vida',        genes: ['mature_age', 'senescence'] },
  { label: 'Dieta',                genes: ['diet', 'scav'] },
  { label: 'Locomoción',           genes: ['speed'] },
  { label: 'Visión',               genes: ['sense', 'e_fov'] },
  { label: 'Térmico',              genes: ['temp_pref'] },
  { label: 'Color y ornamento',    genes: ['hue', 'c_eye', 'orn', 'pref', 'c_lum', 'c_sat', 'o_len', 'o_bulb', 'o_hue', 'o_num', 'tex2'] },
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
const DECOR_NAMES = ['tex2', 'c_eye', 'c_lum', 'c_sat', 'o_len', 'o_bulb', 'o_hue', 'o_num'];
export const DECOR = new Set(DECOR_NAMES.map((n) => G[n]));
// B3: `osc_amp` por nodo afecta a la física (amplitud de oscilación) → FUNCIONAL (define especie).
// B3+: `osc_phase` también afecta a la física (coherencia de marcha, ver bodyplan.reducePlan), PERO se queda
// NEUTRAL para la especie. Razón: solo importa la DISPERSIÓN de fases DENTRO de un cuerpo, no su valor
// absoluto — dos bichos igual de coordinados con fase global 0.2 vs 0.7 nadan idéntico; contarlo en la
// distancia genética crearía especiación ESPURIA por un offset arbitrario. Por eso vive en DECOR.
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
// `atkBias` (0..~0.3) sesga la 3ª salida (impulso de ataque): 0 → impulso ≈0.5 (ataca a medias en contacto);
// >0 → siembra cazadores competentes (carnívoros fundadores). La evolución cablea los pesos del ataque.
export function seedBrain(genes, idx, rng, atkBias = 0) {
  const b = idx * NUM_GENES + BRAIN0, I = BRAIN.I, H = BRAIN.H, O = BRAIN.O, sc = BRAIN.scale;
  for (let i = 0; i < BRAIN_W; i++) genes[b + i] = clamp01(0.5 + (rng.next() - 0.5) * 0.1); // baseline ~0
  const wHo = I * H + H * H + H;                       // offset (relativo al bloque) de oculta→salida
  const gp = 0.5 + 1.6 / sc, gn = 0.5 - 1.6 / sc, j = () => (rng.next() - 0.5) * 0.06;
  // oculta0 ← +dfx +preyDX −threatDX ; oculta1 ← +dfy +preyDY −threatDY  (entradas 0,2,4 y 1,3,5)
  genes[b + 0 * H + 0] = clamp01(gp + j()); genes[b + 2 * H + 0] = clamp01(gp + j()); genes[b + 4 * H + 0] = clamp01(gn + j());
  genes[b + 1 * H + 1] = clamp01(gp + j()); genes[b + 3 * H + 1] = clamp01(gp + j()); genes[b + 5 * H + 1] = clamp01(gn + j());
  // salida_x ← oculta0 ; salida_y ← oculta1 ; sesgo de la salida_ataque (índice O-1 = 2)
  genes[b + wHo + 0 * O + 0] = clamp01(gp + j()); genes[b + wHo + 1 * O + 1] = clamp01(gp + j());
  genes[b + wHo + H * O + 2] = clamp01(0.5 + atkBias);  // bO+2 = sesgo del impulso de ataque
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
