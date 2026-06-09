// Configuración por defecto — "Zenote". ÚNICO lugar de los parámetros (el motor lee de aquí; nada hardcodeado disperso).
// Cada parámetro lleva su NOMBRE FUNCIONAL para editarlo a mano con rapidez. Los marcados (UI) tienen control
// en vivo en el modo Laboratorio. Frontera de diseño: el programador define la FÍSICA; la conducta y la forma EVOLUCIONAN.

export const config = {
  // ───── Mundo ─────
  world: {
    width: 1200,   // Ancho del mundo (px lógicos; fijo, no depende de la pantalla)
    height: 800,   // Alto del mundo
    wrap: true,    // Mundo toroidal (los bordes envuelven)
  },

  // ───── Recurso / vegetación (campo de comida en rejilla) ─────
  resource: {
    gridCols: 64,       // Columnas de la rejilla de recurso
    gridRows: 48,       // Filas de la rejilla de recurso
    R_max: 1.0,         // Recurso máximo por celda
    R_regen: 0.0016,    // (UI) Ritmo de rebrote del pasto — REGULADOR PRINCIPAL de cuánta comida sostiene el mundo
    gradient: 'perlin', // Forma del campo de capacidad: 'perlin' | 'center' | 'uniform'
    patchiness: 0,      // (UI) Comida en parches: 0 = repartida suave … 1 = parches ricos con baldíos
    tempFreq: 3,        // Frecuencia del campo térmico (bajo = zonas climáticas grandes → especializarse rinde)
    absRate: 0.20,      // (UI) Ritmo de pastado por tick (alto = pelan zonas → escasez local visible)
    energyPerUnit: 10,  // Energía obtenida por unidad de recurso comida
    grazeRefuge: 0.11,   // Reserva de rebrote intocable por celda (fracción) — evita el sobrepastoreo letal
  },

  // ───── Población ─────
  pop: {
    initial: 400,            // Nº de fundadores al sembrar
    maxAgents: 4000,         // Tope físico del pool (límite duro de memoria)
    maxAlive: 500,           // (UI) Tope de organismos vivos: al llegar no nacen crías · 0 = sin tope.
                             //      Por debajo de la capacidad natural (~800) comprime y fragiliza a los carnívoros.
    seed: 123,               // Semilla por defecto (vacía el campo Semilla y Sembrar → mundo aleatorio)
    seedDietLow: false,      // Sembrar todos herbívoros (true) vs dieta diversa con proto-carnívoros (false)
    carnivoreSeedFrac: 0.14, // Fracción de fundadores sembrados como proto-carnívoros
    simpleStart: true,       // Fundadores SIMPLES (complejidad y apariencia EMERGEN) · false = genes aleatorios
    startJitter: 0.06,       // Magnitud del jitter gaussiano del sembrado simple
    startDiversity: 0.5,     // (UI) Diversidad inicial del sembrado: 0 = monótono … 1 = variado
  },

  // ───── Energética y costes (qué cuesta vivir, moverse, crecer, criar) ─────
  energy: {
    c_base: 0.02,       // (UI) Coste basal por tick (existir cuesta)
    carnUpkeep: 0.40,   // (UI) Descuento de coste basal ∝ dieta carnívora (resiliencia: aguantar valles de presa)
    k_size: 0.45,       // (UI) Coste basal por TAMAÑO
    k_sizeHerb: 0,    // (UI) Coste de tamaño EXTRA solo para herbívoros (∝ size·(1−diet))
    k_sense: 0.3,       // Coste de la visión (alcance)
    k_metab: 0.6,       // Coste del metabolismo
    k_temp: 1.9,        // Coste por desviarse del óptimo térmico (0 = sin selección térmica)
    k_body: 0.10,       // Coste basal extra por MASA corporal (segmentos/módulos)
    k_lure: 0.13,       // Coste de mantener el SEÑUELO bioluminiscente (∝ prominencia)
    k_graze: 0.50,      // Pasto EXTRA ∝ masa corporal (ata la complejidad al nicho herbívoro)
    k_effort: 1.59,     // Coste extra de moverse ∝ esfuerzo (gen speed)
    moveCost: 0.015,    // Coef. del coste de nado ∝ velocidad² (frena la carrera de velocidad)
    E_max_base: 71,     // Energía máxima base · E_max = E_max_base · (0.5 + size)
    reproBase: 0.9,     // (UI) Coste base de una cría (× E_max_base), independiente del tamaño
    reproSizeCost: 1.0, // (UI) Coste EXTRA de criar ∝ tamaño del padre (compromiso r/K por talla)
    preyGain: 0.90,     // Fracción de energía de la presa aprovechada al cazarla
    corpseReturn: 0.5,  // Fracción de energía que devuelve un cadáver
  },

  // ───── Locomoción emergente: la FORMA produce el movimiento (el gen 'speed' = esfuerzo) ─────
  loco: {
    kThrust: 2.5,       // Calibra la velocidad-capacidad típica
    waveFloor: 0.3,     // Empuje mínimo sin ondular
    symBase: 0.4,       // Empuje útil hacia delante mínimo (la asimetría desvía empuje a girar)
    streamBase: 1.0,    // Arrastre base del cuerpo
    streamGain: 0.5,    // Cuánto reduce el arrastre la elongación (hidrodinámica)
    effortFloor: 0.2,   // Esfuerzo mínimo de nado
    vMin: 0.15,         // Suelo de velocidad-capacidad (nadie queda 100% inmóvil)
    vMax: 3.0,          // Techo de velocidad-capacidad
    turnBase: 0.18,     // Agilidad de giro base
    turnAsym: 0.35,     // La asimetría (m_sym bajo) mejora el giro
    turnSize: 0.15,     // Los cuerpos grandes giran peor
    turnElong: 0.08,    // Los cuerpos elongados giran peor
    turnMin: 0.08,      // Giro mínimo (nadie queda incapaz de virar)
    // Complejidad (segmentos/módulos): suma empuje, arrastre y peor giro; vale 0 para un cuerpo simple.
    segThrust: 0.34,    // Empuje de las patas de los segmentos
    modThrust: 0.3,     // Empuje de los apéndices de los módulos
    segDrag: 0.22,      // Arrastre extra por segmento
    modDrag: 0.6,       // Arrastre extra por módulo
    segTurn: 0.03,      // Cada segmento extra empeora el giro
  },

  // ───── Visión emergente: 'sense' fija la inversión; 'e_fov' reparte alcance↔ángulo (conserva área) ─────
  vision: {
    halfFovMin: 0.35,   // Semiángulo mínimo del cono (rad ≈ 20°): estrecho y frontal (cazador)
    halfFovMax: 2.70,   // Semiángulo máximo (rad ≈ 155°): casi panorámico (presa)
    fovRef: 3.05,       // FOV de referencia para conservar el área visual
    rangeExp: 0.4,      // Exponente del reparto alcance↔ángulo
  },

  // ───── Dieta ─────
  diet: {
    omniPenalty: 0.0,  // Penalización por dieta intermedia (bajo = omnívoros más viables)
  },

  // ───── Carroñeo: red de seguridad carnívora en los valles (comer cadáveres). Off por defecto. ─────
  carrion: {
    enabled: false,     // (UI) Activar carroñeo
    yield: 0.3,         // Energía que deja un cadáver = yield × E_max del difunto
    decay: 0.01,        // Pudrición de la carroña por tick
    absRate: 0.3,       // Fracción de carroña de la celda absorbida/tick (× effCarn)
    maxPerCell: 80,     // Tope de carroña acumulada por celda
  },

  // ───── Refugio de presa: estabilizador Lotka-Volterra. La presa en celda-refugio NO es cazable ─────
  refuge: {
    enabled: true,      // (UI) Activar refugio de presa
    frac: 0.18,         // (UI ↻) Fracción del mundo que es refugio (celdas de mayor capacidad) · requiere Sembrar
  },

  // ───── Color como pigmento (sintonía con la luz local) ─────
  color: {
    matchPenalty: 0.6,  // Cuánto penaliza un color desajustado con la luz local (0 = neutro, 1 = máx)
  },

  // ───── Edad / mortalidad ─────
  age: {
    mature: 300,        // Edad de madurez (ticks)
    mortality: 0.0005,  // Mortalidad por senescencia (prob./tick tras madurar)
    scale: 500,         // Escala temporal de la senescencia
  },

  // ───── Reproducción ─────
  repro: {
    cooldown: 60,              // Enfriamiento entre crías (ticks)
    sexual: true,              // Reproducción sexual (recombinación de dos padres)
    asexual: true,             // (UI) Permitir clon mutado si no hay pareja compatible cerca
    speciesGenThreshold: 0.15, // Distancia genética máxima para cruzarse (= misma especie)
    mateRadius: 70,            // Radio (px) de búsqueda de pareja al reproducirse
  },

  // ───── Mutación: 3 ritmos — base (ecología), decor (apariencia, rápida), form (forma, intermedia) ─────
  mut: {
    rate: 0.034,        // (UI) Prob. de mutación por gen (genes base/ecológicos)
    sigma: 0.05,        // (UI) Magnitud de la mutación base
    bigRate: 0.002,     // Prob. de macromutación (salto grande y raro)
    bigSigmaMult: 5,    // Multiplicador de magnitud de la macromutación
    decorRate: 0.05,    // Prob. de mutación de genes de APARIENCIA (color, señuelo, piel…)
    decorSigma: 0.10,   // Magnitud de la mutación decorativa
    formRate: 0.08,     // Prob. de mutación de genes de FORMA (cuerpo, apéndices)
    formSigma: 0.11,    // Magnitud de la mutación de forma
  },

  // ───── Combate / depredación (física trófica, no conducta) ─────
  // Importante: al FALLAR un ataque el atacante MUERE (riesgo denso-dependiente). Es el freno ESENCIAL que
  // estabiliza la depredación (sin él, los carnívoros sobre-disparan y colapsan todo). No quitarlo.
  combat: {
    enabled: true,       // (UI) Activar depredación/combate
    sizeAdvantage: 0.82, // (UI) Cuánto pesa el tamaño en quién gana el combate
    handlingTime: 31,    // Enfriamiento tras una captura (digestión) — satura la tasa de caza, amortigua oscilaciones
    dietMargin: 0.08,    // Diferencia de dieta mínima para considerar a otro "presa" (no un igual)
    preyBandLo: 0.20,    // Ratio presa/depredador MÍNIMO cazable (más pequeño no compensa)
    preyBandHi: 2.0,     // (UI) Ratio presa/depredador MÁXIMO atacable (1.0 = hasta su tamaño; >1 = presa mayor, más arriesgada)
    lureReach: 0.85,     // Alcance de captura extra que da el señuelo (∝ prominencia)
  },


  // ───── Motor / tiempo ─────
  sim: {
    targetTPS: 20,      // (UI) Ticks por segundo objetivo (0 = pausa)
    frameBudgetMs: 40,  // Máx. ms simulando por frame en modo normal (si no llega, bajan fps, no se congela)
    maxBudgetMs: 250,   // Máx. ms simulando por frame en modo "máx velocidad"
    brain: 'neural',    // Cerebro: 'neural' (recurrente, pesos = genoma, por defecto) | 'reactive' (regla fija)
  },

  // ───── Render (solo visual; no afecta a la simulación) ─────
  render: {
    trails: false,            // (UI) Estelas
    glow: true,               // (UI) Resplandor (bloom)
    showResourceField: true,  // (UI) Dibujar la vegetación/comida
    ambiance: 'abyssal',      // Escenario: 'abyssal' (abisal oscuro) | 'meadow' (pradera)
    dprCap: 2,                // Tope de densidad de píxeles (DPR)
    quality: 'high',          // (UI) 'high' | 'low' (baja = sin bloom, menos nieve, LOD agresivo → móvil)
    grassDensity: 6800,       // Nº de matojos de hierba repartidos por el mundo
    grassSpriteCount: 22,     // Variedad de formas de matojo precalculadas
    grassRefreshFrames: 15,   // Cada cuántos frames se redibuja la capa de hierba
    flowerSpriteCount: 12,    // Variedad de flores precalculadas
    flowerFrac: 0.45,         // Fracción de matas que pueden florecer
    flowerThreshold: 0.5,     // Vegetación mínima de una mata para florecer
  },

  // ───── Expresión de genes: rangos lerp desde [0,1]. Frontera "programador ↔ evolución" ─────
  expr: {
    size:      { min: 1.7, max: 9 },    // gen size → radio (px); solo render/contacto, NO afecta a la energía
    speed:     { min: 0.2, max: 2.0 },  // gen speed → escala de esfuerzo / v_max
    sense:     { min: 10,  max: 80 },   // gen sense → alcance de visión base (px)
    repro_thr: { min: 0.5, max: 0.95 }, // gen repro_thr → umbral de energía para criar (fracción de E_max)
    invest:    { min: 0.2, max: 0.6 },  // gen invest → energía dada a la cría (fracción de E_max)
    wMax:      2,                        // w_food / w_prey / w_flee → factor de peso (lerp 0..2)
  },
};
