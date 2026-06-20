// CONFIG — FUENTE ÚNICA de parámetros de Zenote 2. Agrupados y ordenados como en la UI; cada campo marcado
// "UI: <nombre en la UI>" o "NO UI". Los módulos del motor (world/genome/phenotype/sim) IMPORTAN y RE-EXPORTAN su
// objeto desde aquí (así los tests/worker que importan `SIM_P` etc. siguen funcionando). main.js/worker.js leen
// START/RENDER_P. CAMBIAR un valor aquí cambia el comportamiento; los defaults reproducen el motor actual (byte-idéntico).

// ===================== ARRANQUE — panel "Mundo nuevo" (necesita reiniciar) =====================
// (La "Semilla" es un campo de texto aparte; vacío = aleatoria. No tiene default numérico aquí.)
export const START = {
  worldSize: 1500,     // UI: Tamaño del mundo — lado del toro (u)
  seedCount: 100,      // UI: Sembrado inicial — nº de fundadores
  spawnSpread: 0.30,      // UI: Extensión del sembrado — 1 = todo el mundo (uniforme) · <1 = disco central de radio spread·mundo/2
  diversity: 0,        // UI: Diversidad inicial — 1 = fundadores variados (tono/fase/cerebro) · 0 = todos idénticos (clones)
  cap: 12000,          // NO UI — tope del pool (nº máx. de agentes)
  lightBase: 2.5,      // NO UI — irradiancia OPERATIVA del mundo (la UI "Luz solar" ajusta el MULTIPLICADOR, no esto). Sustituye a WORLD_P.lightBase al crear el mundo.
  nutrientInit: 1.5,   // NO UI — nutriente inicial por celda
};

// ===================== RENDER / VISUAL (cliente; NO afecta a la simulación) =====================
export const RENDER_P = {
  tps: 60,             // UI: Velocidad — ticks de simulación por segundo
  maxFps: 20,          // UI: FPS — límite de dibujos por segundo (no afecta a la sim)
  bloom: 0.75,         // UI: Bioluminiscencia — intensidad del aura+bloom (0 = apagado; recomendado en móvil/Baja)
  zoom: 1,             // UI: Zoom — zoom inicial
  colorMode: 'natural',// UI: Colorear por — modo inicial (natural · natmix · tissue · role · lineage)
  zoomMin: 1, zoomMax: 16,   // NO UI — límites del zoom (mín. 1 = el mundo entero cabe)
  dprCap: 2,           // NO UI — tope de devicePixelRatio (rendimiento)
  bloomDiv: 5,         // NO UI — el bloom reduce la capa de organismos a 1/bloomDiv y la reescala (downsampled)
  maxSnapMs: 250,      // NO UI — en MÁX: un fotograma cada N ms (≈4 fps; el lote ≤N garantiza ≥1 fps)
  undulation: 2.2,     // NO UI — amplitud de la onda viajera (carácter "vivo" del cuerpo)
  auraMul: 2.2,        // NO UI — radio del halo/aura (× tamaño del nodo)
  auraAlpha: 0.10,     // NO UI — opacidad base del aura (× bloom × energía)
  border: 'rgba(4,7,12,0.55)',  // NO UI — color del borde (nodos y ojos), trazo oscuro abisal
  borderW: 1.2,        // NO UI — grosor del borde de los nodos (px)
  speckleMax: 3,       // NO UI — máx. de motas de textura por nodo (1..speckleMax, según linaje)
  eyeThresh: 0.2,      // NO UI — umbral de "lo cazador" (aHunt) a partir del cual aparecen ojos
};

// ===================== MUNDO (leyes físicas) =====================
export const WORLD_P = {
  cellRef: 20,          // NO UI — tamaño de celda (u) → rejilla ∝ tamaño de mundo (recurso/luz total ∝ área)
  lightBase: 0.06,      // NO UI — irradiancia base por defecto (el punto de operación lo fija START.lightBase=2.5). La UI "Luz solar" multiplica vía world.lightMul.
  lightContrast: 0.7,   // NO UI — heterogeneidad espacial de la luz (0 uniforme · 1 muy en parches)
  dayNightAmp: 0.0,     // NO UI — amplitud del ciclo día/noche (0 = sin ciclo)
  dayNightPeriod: 2000, // NO UI — periodo del ciclo (ticks)
  shadeCoef: 0.6,       // NO UI — sombra: la ocupación reduce la luz (competencia por luz)
  occRef: 4,            // NO UI — ocupación de referencia para normalizar la sombra
  diffuseN: 0.12,       // NO UI — difusión del nutriente (conservativa)
  diffuseDet: 0.05,     // NO UI — difusión del detrito (conservativa)
  decompose: 0.02,      // NO UI — descomposición del detrito/tick: materia → nutriente, energía → calor
};

// ===================== GENOMA / DESARROLLO / MUTACIÓN =====================
export const GENOME_P = {
  partBudget: 32,      // NO UI — tope de partes del cuerpo (acota recursión)
  recCap: 8,           // NO UI — tope del límite de recursión por módulo
  modCap: 12,          // NO UI — tope de módulos del genoma
  radMin: 1.0, radMax: 6.0,   // NO UI — gen size → radio de parte (u)
  mutRate: 1,          // UI: Ritmo de mutación — multiplicador global de las PROBABILIDADES de mutación (1 = base · 0 = clones)
};

// ===================== FENOTIPO (forma → función) =====================
export const PHENO_P = {
  massCoef: 0.04,      // NO UI — masa estructural ∝ área de las partes
  dragBase: 1.0, dragCoef: 0.3, streamline: 0.4,   // NO UI — arrastre (forma); elongado arrastra menos
  thrustGain: 1.2,     // NO UI — ganancia de empuje (MUSCLE)
  photoGain: 1.0,      // NO UI — ganancia de captación de luz (PHOTO)
  mouthGain: 1.0,      // NO UI — ganancia de ingesta (MOUTH)
  vGain: 3.0, vMax: 4.0,   // NO UI — velocidad emergente = vGain·empuje/arrastre, acotada
};

// ===================== SIMULACIÓN (energética · reproducción · ingesta) =====================
export const SIM_P = {
  // --- expuestos en el LABORATORIO (en vivo) ---
  baseCost: 0.015,     // UI: Metabolismo basal — coste metabólico basal/tick
  reproE: 16,          // UI: Umbral de cría — energía mínima para reproducirse
  photoEff: 0.05,      // UI: Eficiencia fotosíntesis — share de la luz captada ∝ photoCap/(photoCap+photoHalf)
  photoMotionK: 2,     // UI: Quietud fotosíntesis — captación × 1/(1+k·velocidad). >0 → autótrofos sésiles, el movimiento se concentra en heterótrofos (medido 25k). 0 = comportamiento anterior.
  reproMode: 'both',   // UI: Reproducción — 'both' (sexual si hay pareja + respaldo asexual) · 'asexual' · 'sexual' (obligada, sin respaldo)
  // --- resto (NO UI) ---
  scavRate: 0.5,       // UI: Carroñeo — energía de detrito (detritusE) ingerible por tick ∝ mouthCap. 0 = apagado. >0 → la MISMA
                       // boca que caza presa viva también rebaña carroña → emerge carroñeo FACULTATIVO (heterótrofos suplementan
                       // ~15-18% de su dieta con carroña; el carroñero OBLIGADO es marginal — carroña = recurso fino a escala pecera).
  photoHalf: 40,       // NO UI — saturación de la captación de luz
  massCost: 0.004,     // NO UI — coste metabólico ∝ masa^massCostExp
  massCostExp: 1.2,    // NO UI — exponente del coste de masa (super-lineal). Frena el BLOAT: sin él los cuerpos se inflaban
                       // (masa ×4, generalistas "lo tienen todo" 1%→~40% a 30k, pop a la mitad). Medido (spikes/trophic-balance):
                       // 1.2 → pop ×2, masa a la mitad, generalistas ~6%, mantiene diversidad de talla. (1 = lineal/antiguo.)
  moveCost: 0.004,     // NO UI — coste de nado ∝ drag·v² (energía → calor)
  investE: 7,          // NO UI — energía que el progenitor pone en la cría
  cooldown: 50,        // NO UI — enfriamiento reproductivo (ticks)
  eDensity: 4,         // NO UI — energía-en-biomasa (M6.1): cada unidad de masa lleva eDensity de energía, PAGADA por el progenitor
                       // al nacer y LIBERADA al morir → el cadáver lleva energía (detritusE). Es lo que hace VIABLE el carroñeo (#4):
                       // sin esto el organismo muere con E≈0 y la carroña está vacía. Conserva (m6). 0 = separación limpia materia/energía.
  birthR: 1,           // NO UI — radio (celdas) del vecindario del que la cría reúne MATERIA
  gutBase: 4, gutPerMass: 4, digestRate: 0.6,   // NO UI — TRIPA: tope ∝ masa (saciedad EMERGENTE) + ritmo de digestión
  eatReach: 4,         // NO UI — alcance extra de captura (u)
  preyMassMax: 1.6,    // NO UI — presa manejable si su masa ≤ maxMouthR·este
  ηene: 0.85,          // NO UI — eficiencia energética de la ingesta
  initE: 10,           // NO UI — reservas iniciales de los fundadores
  mateRadius: 50,      // NO UI — radio de búsqueda de pareja (u)
  mateCompat: 0.5,     // NO UI — umbral de compatibilidad reproductiva = distancia FENOTÍPICA (masa/luz/boca) normalizada. Clinal, no especies discretas (ver m7).
};
