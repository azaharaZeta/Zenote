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
    patchiness: 0,      // (UI) Dinámica de rebrote: 0 = lineal (sin parches) … 1 = logístico + difusión de
                        //      semilla → los parches EMERGEN y migran del pastoreo↔rebrote (ver world.regen). En vivo.
    tempFreq: 3,        // Frecuencia del campo térmico (bajo = zonas climáticas grandes → especializarse rinde)
    absRate: 0.20,      // (UI) Ritmo de pastado por tick (alto = pelan zonas → escasez local visible)
    energyPerUnit: 10,  // Energía obtenida por unidad de recurso comida
    grazeRefuge: 0.11,   // Reserva de rebrote intocable por celda (fracción) — evita el sobrepastoreo letal
  },

  // ───── Población ─────
  pop: {
    initial: 400,            // Nº de fundadores al sembrar
    maxAgents: 4000,         // Tope físico del pool (límite duro de memoria) · ÚNICO límite de población
                             //      (la capacidad de carga la pone el recurso, no un tope numérico — ver auditoría #5).
    seed: 123,               // Semilla por defecto (vacía el campo Semilla y Sembrar → mundo aleatorio)
    seedDietLow: false,      // Sembrar todos herbívoros (true) vs dieta diversa con proto-carnívoros (false)
    carnivoreSeedFrac: 0.14, // Fracción de fundadores sembrados como proto-carnívoros
    simpleStart: true,       // Fundadores SIMPLES (complejidad y apariencia EMERGEN) · false = genes aleatorios
    startJitter: 0.06,       // Magnitud del jitter gaussiano del sembrado simple
    startDiversity: 0.5,     // (UI) Diversidad inicial del sembrado: 0 = monótono … 1 = variado
  },

  // ───── Energética y costes (qué cuesta vivir, moverse, crecer, criar) ─────
  // ALOMETRÍA (#3): la talla es una MASA física. eMax ∝ masa (almacén ∝ volumen); metabolismo ∝ masa^kleiber
  // (ley de Kleiber: economía de escala). Ver organism.js. `massExp`/`kleiber` son tunables; las bases están
  // recalibradas para que el organismo MEDIO (size 0.5, head-only) conserve ≈ los valores previos.
  energy: {
    c_base: 0.024,      // (UI) Coste basal por tick (recalibrado por la alometría: antes 0.02 con k_size aparte)
    massExp: 1.5,       // (UI) Exponente alométrico talla→masa: sizeMass=(radius/refRadius)^massExp. 1 = lineal; 2 = área 2D
    kleiber: 0.75,      // (UI) Exponente metabólico: coste basal ∝ masa^kleiber (¾ = Kleiber; <1 = los grandes gastan menos por masa)
    k_sense: 0.3,       // Coste de la visión (alcance)
    k_metab: 0.6,       // Coste del metabolismo
    k_lifespan: 0.35,   // (#12, disposable soma) Coste basal extra de la LONGEVIDAD: factor (1 + k_lifespan·(1−senescence)).
                        //      Vivir lento/longevo cuesta mantener el cuerpo → evita que la senescencia colapse a "inmortal".
    k_temp: 1.9,        // Coste por desviarse del óptimo térmico (0 = sin selección térmica)
    k_lure: 0.13,       // Coste de mantener el SEÑUELO bioluminiscente (∝ prominencia)
    k_graze: 0.50,      // Pasto EXTRA ∝ masa corporal de nodos (ata la complejidad al nicho herbívoro)
    k_effort: 1.59,     // Coste extra de moverse ∝ esfuerzo (gen speed)
    moveCost: 0.015,    // Coef. del coste de nado ∝ velocidad² (frena la carrera de velocidad)
    E_max_base: 71,     // Energía máxima base · eMax = E_max_base · masa. Criar cuesta una fracción de la masa-de-talla
                        //      (reproRef = E_max_base · sizeMass, SIN la masa de nodos → la complejidad no frena la cría, #4).
    preyGain: 0.90,     // Fracción de energía de la presa aprovechada al cazarla
    corpseReturn: 0.5,  // Fracción de energía que devuelve un cadáver
  },

  // ───── Locomoción emergente: la FORMA produce el movimiento (el gen 'speed' = esfuerzo) ─────
  loco: {
    kThrust: 3.2,       // Calibra la velocidad-capacidad típica (recalibrado en B3: empuje direccional, effort una vez)
    paddleEff: 0.6,     // B3: peso del remo lateral en el gait (aleta lateral propulsa, aunque menos que cola trasera)
    oscFloor: 0.15,     // B3: suelo de amplitud de oscilación por nodo (un nodo presente siempre ondula algo)
    phaseGain: 0.5,     // (UI) B3+: cuánto penaliza la marcha DESCOORDINADA (fases dispersas) el empuje. 0 = sin
                        //      penalización (modelo previo); 1 = máx. Hace funcional `osc_phase`: nadar coordinado EMERGE.
    elongMax: 3.0,      // B3: techo de la elongación derivada de la geometría de nodos (streamlining)
    symBase: 0.4,       // Empuje útil hacia delante mínimo (la asimetría del grafo desvía empuje a girar)
    streamBase: 1.0,    // Arrastre base del cuerpo
    streamGain: 0.5,    // Cuánto reduce el arrastre la elongación (hidrodinámica)
    effortFloor: 0.2,   // Esfuerzo mínimo de nado
    vMin: 0.15,         // Suelo de velocidad-capacidad (nadie queda 100% inmóvil)
    vMax: 3.0,          // Techo de velocidad-capacidad
    turnBase: 0.18,     // Agilidad de giro base
    turnAsym: 0.35,     // La asimetría del grafo de nodos (emergente) mejora el giro
    turnSize: 0.15,     // Los cuerpos grandes giran peor
    turnElong: 0.08,    // Los cuerpos elongados giran peor
    turnMin: 0.08,      // Giro mínimo (nadie queda incapaz de virar)
    // Complejidad (segmentos/módulos): suma empuje, arrastre y peor giro; vale 0 para un cuerpo simple.
    segThrust: 0.34,    // Empuje de las patas de los segmentos
    modThrust: 0.3,     // Empuje de los apéndices de los módulos
    segDrag: 0.22,      // Arrastre extra por segmento
    modDrag: 0.6,       // Arrastre extra por módulo
    segTurn: 0.03,      // Cada segmento extra empeora el giro
    bodyThrust: 1.0,    // A2 (Pilar v2.0): escala del empuje del CUERPO (cabeza+segmentos que ondulan); propulsor principal
    // Limbs (tentáculos/aletas finos) y nodos: empuje vs arrastre por unidad de área.
    limbThrust: 0.12,   // Empuje por unidad de área de limbs (ondulan → propulsión secundaria)
    limbDrag: 0.20,     // Arrastre por unidad de área de limbs (> limbThrust → propulsor ineficiente)
    bodyDrag: 0.30,     // Arrastre por unidad de área de nodo ancho (cabeza/lóbulo)
    bodyMass: 0.30,     // Masa metabólica por área de nodo ancho (el ancho SÍ es volumen real)
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
  // Edad / mortalidad. La madurez (inicio de senescencia + gate de cría) y el ritmo de vida son GENES (#12):
  // ver expr.mature_age y el gen `senescence`. Aquí quedan solo las escalas BASE comunes.
  age: {
    mortality: 0.0005,  // Mortalidad base por senescencia (prob./tick tras madurar; el gen `senescence` la escala)
    scale: 500,         // Escala temporal de la senescencia
    senesSlow: 0.3,     // (#12) multiplicador de senescencia con `senescence`=0 (longevo: envejece despacio)
    senesFast: 3.0,     // (#12) multiplicador con `senescence`=1 (vida rápida: envejece deprisa, muere joven)
  },

  // ───── Reproducción ─────
  repro: {
    cooldown: 60,              // Enfriamiento entre crías (ticks)
    sexual: true,              // Reproducción sexual (recombinación de dos padres)
    asexual: true,             // (UI) Permitir clon mutado si no hay pareja compatible cerca
    speciesGenThreshold: 0.15, // Distancia genética máxima para cruzarse (= misma especie)
    mateRadius: 70,            // Radio (px) de búsqueda de pareja al reproducirse
  },

  // ───── Mutación: UNA sola tasa por locus, CIEGA a la función del gen (auditoría #1) ─────
  // (antes había 3 ritmos por categoría base/forma/decor → la mutación no debe conocer la "función" de un gen).
  mut: {
    rate: 0.05,         // (UI) Prob. de mutación por gen (todos los genes por igual)
    sigma: 0.08,        // (UI) Magnitud de la mutación
    bigRate: 0.002,     // Prob. de macromutación (salto grande y raro)
    bigSigmaMult: 5,    // Multiplicador de magnitud de la macromutación
    recomb: 0.07,       // (UI) Recombinación sexual: prob. de cruce por locus (LIGAMIENTO). 0.5 = uniforme (sin
                        //      ligamiento); →0 = tramos contiguos largos co-heredados. Vive en `mut` por conveniencia.
  },

  // ───── Combate / depredación (física trófica, no conducta) ─────
  // Importante: al FALLAR un ataque el atacante PIERDE energía (failDamage) y solo muere si llega a 0. Es el freno
  // denso-dependiente que estabiliza la depredación (sin coste al fallar, los carnívoros sobre-disparan y colapsan
  // todo). failDamage ≥ 1 ≈ muerte casi segura (comportamiento antiguo); bajarlo da resiliencia carnívora.
  combat: {
    enabled: true,       // (UI) Activar depredación/combate
    sizeAdvantage: 1.8, // (UI) Cuánto pesa el tamaño en quién gana el combate
    failDamage: 0.3,    // (UI) Energía que pierde el atacante al fallar (× su eMax) · muere solo si llega a 0 · ≥1 ≈ muerte segura
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
    mature_age:{ min: 80,  max: 650 },  // (#12) gen mature_age → edad de madurez (ticks): gatea la cría e inicia la senescencia
  },
};
