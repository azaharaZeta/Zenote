// Configuración por defecto ("Zenote"): ÚNICA fuente de los parámetros (el motor lee de aquí).
// Marcas: (UI) = slider en el laboratorio · (↻) = requiere Reiniciar para aplicarse.
// Unidades: el MOTOR trabaja en unidades de mundo (u), no en píxeles; la resolución solo cambia la nitidez.
// Solo el bloque `render` usa "px" reales. El detalle/historial de tuning vive en docs/ y CHANGELOG.

export const config = {
  // ───── Mundo ─────
  world: {
    size: 1000,    // (UI ↻) Lado del mundo cuadrado (toro) en u. Dial de DENSIDAD; no cambia el alimento total.
    wrap: true,    // Mundo toroidal (los bordes envuelven)
    closedMatter: true,  // (↻) Pecera: la materia total es CONSTANTE y circula (N↔pasto↔organismos↔carroña). false = modelo abierto.
    matterBudget: 60000, // (↻) Materia total del mundo (pecera); escala ×área. Regulador del total de biomasa.
    closedRegen: 0.0055, // (UI) Ritmo de fotosíntesis (N→pasto) en la pecera: regulador principal de la comida.
    nutrientDiffuse: 0.15, // (UI) Difusión del campo de nutriente libre por tick (bajo = manchas fértiles locales).
    birthGatherR: 2,     // Radio en celdas del vecindario del que la cría reúne materia al nacer.
  },

  // ───── Recurso / vegetación (campo de comida en rejilla) ─────
  resource: {
    gridCols: 56,       // Columnas de la rejilla (a tamaño 1000); escala ×size → celda de tamaño constante.
    gridRows: 56,       // Filas (= gridCols → celdas cuadradas).
    R_max: 1.0,         // Recurso máximo por celda
    R_regen: 0.0035,    // (UI) Ritmo de rebrote del pasto en el modelo ABIERTO.
    gradient: 'perlin', // Forma del campo de capacidad: 'perlin' | 'center' | 'uniform'
    capFloor: 0.1,      // Suelo de la capacidad de carga (fracción de R_max): ningún baldío permanente.
    patchiness: 0.75,   // (UI) Dinámica de rebrote: 0 = lineal · 1 = logístico + difusión → parches que migran.
    seedFloor: 0.04,    // Rebrote espontáneo mínimo (banco de semillas): evita el estado absorbente (todo a cero).
    tempFreq: 3,        // Frecuencia del campo térmico (bajo = zonas climáticas grandes).
    absRate: 0.20,      // (UI) Ritmo de pastado por tick (alto = pelan zonas → escasez local).
    absMetabBase: 0.5,  // Suelo del factor metabólico en la absorción: a metab 0 aún se pasta algo.
    energyPerUnit: 10,  // (UI) Energía obtenida por unidad de recurso comida.
    grazeRefuge: 0.20,  // (UI) Reserva de rebrote intocable por celda (fracción): evita el sobrepastoreo letal.
    forageReach: 5,     // (UI) Alcance de forrajeo por talla (celdas): el grande pasta de un área → payoff de talla. 0 = solo su celda.
    carrionDecay: 0.005, // (UI) Ritmo de descomposición de la carroña por tick (bajo = los cadáveres duran más).
    carrionAbsRate: 0.15, // (UI) Ritmo de carroñeo: fracción de la carroña de la celda que absorbe quien procesa carne.
    carrionScent: 3,    // Escala del "olfato" de carroña en el gradiente de búsqueda (más alto = la carroña tira menos).
  },

  // ───── Población ─────
  pop: {
    initial: 400,            // (UI ↻) Nº de fundadores (a tamaño 1000); escala ×área → densidad inicial constante.
    maxAgents: 2000,         // (UI ↻) Tope físico del pool (memoria); escala ×área hasta maxAgentsCeiling. La capacidad la pone la materia.
    maxAgentsCeiling: 8000,  // Techo absoluto del pool tras escalar con el mundo (límite de rendimiento).
    seed: 123,               // Semilla por defecto (vacía el campo Semilla → mundo aleatorio).
    seedDietLow: false,      // Sembrar todos herbívoros (true) vs dieta diversa con proto-carnívoros (false).
    carnivoreSeedFrac: 0.20, // (UI ↻) Fracción de fundadores sembrados como proto-carnívoros (condición inicial, no estrategia).
    simpleStart: true,       // Fundadores SIMPLES (complejidad y apariencia EMERGEN) · false = genes aleatorios.
    startJitter: 0.06,       // Magnitud del jitter gaussiano del sembrado simple.
    startDiversity: 0,       // (UI) Diversidad inicial: 0 = fundadores casi clonales … 1 = variados.
  },

  // ───── Energética y costes (qué cuesta vivir, moverse, criar) ─────
  // Alometría: eMax ∝ masa; metabolismo ∝ masa^kleiber (Kleiber). Expresión en organism.js.
  energy: {
    c_base: 0.024,      // (UI) Coste basal por tick (mantenimiento).
    massExp: 1.3,       // (UI) Exponente alométrico talla→masa: sizeMass=(radius/refRadius)^massExp.
    kleiber: 0.75,      // (UI) Exponente metabólico: coste basal ∝ masa^kleiber (¾ = Kleiber).
    k_sense: 0.3,       // (UI) Coste de la visión (alcance).
    k_metab: 0.6,       // (UI) Coste del metabolismo.
    k_lifespan: 0.35,   // (UI) Coste basal extra de la longevidad (disposable soma): evita la senescencia "inmortal".
    k_temp: 1.9,        // Coste por desviarse del óptimo térmico (0 = sin selección térmica).
    k_lure: 0.13,       // Coste de mantener el señuelo bioluminiscente (∝ prominencia).
    k_graze: 0.50,      // (UI) Pasto extra ∝ masa de nodos (ata la complejidad al nicho herbívoro).
    k_grazeWide: 0.5,   // (UI) Pasto extra ∝ anchura del cuerpo: premia la forma de pastador.
    k_scavThin: 1.0,    // (UI) Carroñeo extra ∝ lo fino/elongado del cuerpo: emerge el gusano carroñero.
    k_flap: 0.7,        // Coste de nado extra por aletear (∝ flapWork): aletear es ráfaga cara.
    k_effort: 1.6,      // (UI) Coste extra de moverse ∝ esfuerzo (gen speed).
    moveCost: 0.015,    // (UI) Coef. del coste de nado ∝ velocidad² (frena la carrera de velocidad).
    k_haul: 0.2,        // (UI) Coste de transporte ∝ masa: arrastrar un cuerpo grande cuesta al moverse.
    k_drag: 0.4,        // (UI) Coste de nado ∝ arrastre de la forma (Dmul); complementa k_haul (masa). 0 = inerte.
    dragRef: 1.1,       // (UI) Arrastre de referencia del coste k_drag: solo paga el Dmul por encima de esto.
    E_max_base: 70,     // (UI) Energía máxima base · eMax = E_max_base · masa.
    preyGain: 0.90,     // (UI) Fracción de energía de la presa aprovechada al cazarla.
    carcassValue: 0.20, // (UI) Biomasa del cadáver (∝ eMax) que suma a su energía al cazar. Palanca dominante herbivoría↔carnivoría.
    scrapReturn: 0.15,  // (UI) Sobras: fracción de la biomasa de una presa CAZADA que queda como carroña (modelo abierto).
    corpseReturn: 0.5,  // (UI) Fracción de la carroña decaída que vuelve al pasto (modelo abierto; en pecera mineraliza a N).
  },

  // ───── Locomoción emergente: la FORMA produce el movimiento (el gen 'speed' = esfuerzo) ─────
  // Frontera auditable: todo aquí es FÍSICA (geometría→fuerza). Cada empuje va emparejado con su arrastre (trade-off).
  loco: {
    kThrust: 7.1,       // (UI) Calibra la velocidad-capacidad típica de la morfología.
    headThrust: 0.06,   // (UI) Empuje de la cabeza (motor base débil): bajo → nadar bien exige cola/aletas.
    paddleEff: 0.6,     // Peso del remo lateral en el gait (aleta lateral propulsa, menos que la cola trasera).
    oscFloor: 0.15,     // Suelo de amplitud de oscilación por nodo.
    phaseGain: 0.5,     // (UI) Cuánto penaliza la marcha descoordinada → nadar coordinado emerge.
    elongMax: 3.0,      // Techo de la elongación derivada de la geometría de nodos (streamlining).
    symBase: 0.4,       // Empuje útil hacia delante mínimo (la asimetría desvía empuje a girar).
    streamBase: 1.0,    // Arrastre base del cuerpo.
    streamGain: 0.5,    // Cuánto reduce el arrastre la elongación (hidrodinámica).
    effortFloor: 0.2,   // Esfuerzo mínimo de nado.
    vMin: 0.15,         // Suelo de velocidad-capacidad.
    vMax: 3.0,          // (UI) Techo de velocidad-capacidad (u/tick).
    turnBase: 0.18,     // (UI) Agilidad de giro base.
    turnAsym: 0.35,     // La asimetría del grafo de nodos mejora el giro.
    turnSize: 0.15,     // Los cuerpos grandes giran peor.
    turnElong: 0.08,    // Los cuerpos elongados giran peor.
    turnMin: 0.08,      // Giro mínimo (nadie queda incapaz de virar).
    segThrust: 0.34,    // Empuje de las patas de los segmentos.
    modThrust: 0.3,     // Empuje de los apéndices de los módulos.
    segDrag: 0.22,      // Arrastre extra por segmento.
    modDrag: 0.6,       // Arrastre extra por módulo.
    segTurn: 0.03,      // Cada segmento extra empeora el giro.
    bodyThrust: 1.0,    // Escala del empuje del cuerpo (cabeza+segmentos que ondulan): propulsor principal.
    limbThrust: 0.12,   // Empuje por unidad de área de limbs (tentáculos/aletas finos).
    limbDrag: 0.20,     // Arrastre por unidad de área de limbs (> limbThrust → propulsor ineficiente).
    bodyDrag: 0.30,     // Arrastre por unidad de área de nodo ancho (cabeza/lóbulo).
    bodyMass: 0.30,     // Masa metabólica por área de nodo ancho.
    // Forma del nodo (gen tipShape, neutro en 0.5): silueta base↔punta, compromiso físico.
    tipThrust: 0.4,     // Abrir la punta (aleta) → +empuje; afilar (púa) → −empuje.
    tipDrag: 0.5,       // Abrir → +arrastre; afilar → −arrastre (streamlining).
    tipReach: 0.35,     // Afilar → +longitud (alcance: tentáculo/púa); abrir → más corto.
    // Modo de propulsión (gen gaitMode, neutro en 0 = ondular). Aletear = batir.
    flapGain: 1.2,      // Empuje extra al aletear, ponderado a lo lateral (×se²).
    flapDrag: 0.6,      // Arrastre extra al aletear (golpe de recuperación) → crucero vs ráfaga.
  },

  // ───── Visión emergente: 'sense' fija la inversión; 'e_fov' reparte alcance↔ángulo (conserva área) ─────
  vision: {
    halfFovMin: 0.35,   // Semiángulo mínimo del cono (≈20°): estrecho y frontal (cazador).
    halfFovMax: 2.70,   // Semiángulo máximo (≈155°): casi panorámico (presa).
    fovRef: 3.05,       // FOV de referencia para conservar el área visual.
    rangeExp: 0.4,      // (UI) Exponente del reparto alcance↔ángulo.
  },

  // ───── Dieta ─────
  diet: {
    omniPenalty: 0.15, // (UI) Penalización por dieta intermedia: >0 fuerza a especializarse (herbívoro/carnívoro puro).
    scavPenalty: 0.30, // (UI) Penalización al generalista caza↔carroña: >0 fuerza a especializar (cazador o carroñero).
  },

  // ───── Refugio de presa: cobertura graduada por la vegetación viva local (estabilizador Lotka-Volterra) ─────
  refuge: {
    enabled: true,      // (UI) Activar la cobertura/refugio de presa.
    strength: 0.3,      // (UI) Fuerza de la cobertura: prob. de escape = strength · vegetación_local. 0 = sin refugio.
  },

  // ───── Edad / mortalidad (la madurez y el ritmo de vida son GENES; aquí solo las escalas base) ─────
  age: {
    mortality: 0.0005,  // (UI) Mortalidad base por senescencia (prob./tick tras madurar; el gen senescence la escala).
    scale: 500,         // Escala temporal de la senescencia.
    senesSlow: 0.3,     // Multiplicador de senescencia con senescence=0 (longevo).
    senesFast: 3.0,     // Multiplicador con senescence=1 (vida rápida, muere joven).
  },

  // ───── Reproducción ─────
  repro: {
    cooldown: 60,              // (UI) Enfriamiento entre crías (ticks).
    sexual: true,              // (UI) Reproducción sexual (recombinación de dos padres).
    asexual: true,             // (UI) Permitir clon mutado si no hay pareja compatible cerca.
    speciesGenThreshold: 0.15, // (UI) Distancia genética máxima para cruzarse (= misma especie).
    mateRadius: 70,            // (UI) Radio (u) de búsqueda de pareja al reproducirse.
  },

  // ───── Mutación: una sola tasa por locus, ciega a la función del gen ─────
  mut: {
    rate: 0.05,         // (UI) Prob. de mutación por gen.
    sigma: 0.08,        // (UI) Magnitud de la mutación.
    bigRate: 0.002,     // (UI) Prob. de macromutación (salto grande y raro).
    bigSigmaMult: 5,    // Multiplicador de magnitud de la macromutación.
    recomb: 0.07,       // (UI) Recombinación sexual: prob. de cruce por locus (bajo = ligamiento, tramos contiguos).
  },

  // ───── Combate / depredación (física trófica). Al fallar un ataque el atacante pierde failDamage·eMax (freno denso-dependiente). ─────
  combat: {
    enabled: true,       // (UI) Activar depredación/combate.
    sizeAdvantage: 1.8,  // (UI) Cuánto pesa el tamaño en quién gana el combate.
    failDamage: 0.1,     // (UI) Energía que pierde el atacante al fallar (× su eMax); muere solo si llega a 0.
    fleeSpeed: 1.0,      // (UI) Escape por velocidad: la presa más rápida que el cazador se zafa. 0 = solo cobertura.
    fleeCap: 0.95,       // Tope de la prob. de escape por velocidad (nunca se zafa con certeza).
    handlingTime: 32,    // (UI) Enfriamiento tras una captura (digestión): satura la tasa de caza.
    dietMargin: 0.08,    // (UI) Diferencia de dieta mínima para considerar a otro "presa".
    preyBandLo: 0.15,    // (UI) Ratio presa/depredador mínimo cazable.
    preyBandHi: 1.10,    // (UI) Ratio presa/depredador máximo atacable (>1 = presa mayor, arriesgada).
    lureGate: 0.12,      // Umbral del gen 'orn' para expresar señuelo bioluminiscente.
    lureReach: 0.85,     // Alcance de captura extra que da el señuelo (∝ prominencia).
    lureAttract: 0.5,    // (UI) Atracción de presa por el señuelo (emboscada anglerfish). 0 = solo extiende alcance.
    morphReach: 0.4,     // (UI) Alcance de captura extra por apéndices frontales (∝ fwdReach·radio): forma de cazador.
  },

  // ───── Motor / tiempo ─────
  sim: {
    targetTPS: 20,      // (UI) Ticks por segundo objetivo (0 = pausa).
    frameBudgetMs: 40,  // Máx. ms simulando por frame en modo normal.
    maxBudgetMs: 250,   // Máx. ms simulando por frame en modo "máx velocidad".
  },

  // ───── Render (solo visual; no afecta a la simulación). Aquí "px" = píxeles reales de dibujo. ─────
  render: {
    glow: true,               // Resplandor (bloom).
    worldBounds: true,        // (UI) Pista sutil del límite del mundo (hairline en los bordes de cada tile del toro).
    vegIntensity: 1.0,        // (UI) Realce de la vegetación (brillo del teal del pasto). En vivo.
    vegBoost: 0.75,           // (UI) Realce del pasto tenue (0→1): alto = hasta el pasto ralo se nota. En vivo.
    vegBlur: 1.8,             // (UI) Difuminado del sustrato: disuelve la rejilla de celda. En vivo.
    nutrientEase: 0.1,        // (UI) Suavizado temporal de las manchas de nutriente (bajo = no titilan). En vivo.
    vegColor: [10, 64, 70],          // Color de la vegetación (incremento teal donde hay pasto, RGB 0-255).
    nutrientColor: [124, 108, 214],  // Color de las manchas de nutriente libre (índigo-violeta, RGB 0-255).
    planktonHues: [150, 165, 180, 196, 212], // Tonos HSL de las chispas de plancton/micro-flora.
    dprCap: 2,                // Tope de densidad de píxeles (DPR) en calidad alta.
    maxInternalPx: 960,       // (UI) Cap de resolución interna (borde largo, px): acota el coste por píxel. Solo nitidez, no detalle.
    maxFPS: 20,               // (UI) Tope de FPS del render (0 = sin límite). El motor no depende de esto.
    spriteCache: true,        // (UI) Caché de sprites por nodo (modo rendimiento): conserva la ondulación.
    spriteBakeBudget: 120,    // Máx. horneados de sprite por frame (limita el "hitch" tras un zoom).
    spriteCacheCap: 2400,     // Techo de entradas del caché de sprites.
    quality: 'high',          // (UI) 'low' (móvil, sin bloom/halos) | 'high' (estándar) | 'ultra' (todo el esplendor).
    ultraDprCap: 3,           // Tope de DPR en calidad máxima (supersampling).
    // LOD (nivel de detalle): umbrales de TAMAÑO APARENTE (radio·zoom·WORLD_REF/world.size, sin resolución). ×lodLowMult en baja.
    lodBody: 2,               // rPx mínimo para dibujar cuerpo (debajo = punto plano).
    lodFull: 3,               // rPx mínimo para el grafo completo de nodos (entre lodBody y esto = elipse barata).
    lodEye: 4,                // rPx mínimo para dibujar ojos.
    lodLure: 4,               // rPx mínimo para el señuelo (caro).
    lodWave: 6,               // rPx mínimo para la onda viajera (movimiento).
    lodHalo: 6,               // rPx mínimo para el halo por agente.
    lodLowMult: 2.0,          // Multiplicador de todos los umbrales LOD en calidad baja (alta = ×1).
    lodFlat: 4,               // Nodo por debajo de este tamaño → relleno plano (sin gradiente).
    lodOutline: 4,            // Nodo por debajo de este tamaño → se omite su contorno.
    lodTexture: 10,           // Nodo por encima de este tamaño → bandas de textura (piel).
    grassDensity: 6800,       // Nº de motas de plancton/micro-flora repartidas por el mundo.
    grassRefreshFrames: 3,    // Cada cuántos frames se recompone el sustrato (vegetación fluida).
  },

  // ───── Expresión de genes: rangos lerp desde [0,1]. Frontera "programador ↔ evolución" ─────
  expr: {
    size:      { min: 4.0, max: 9 },    // gen size → radio (u). `min` = suelo de talla: palanca maestra del régimen (afecta a eMax/coste/cría).
    sense:     { min: 10,  max: 80 },   // gen sense → alcance de visión base (u).
    repro_thr: { min: 0.5, max: 0.95 }, // gen repro_thr → umbral de energía para criar (fracción de E_max).
    invest:    { min: 0.2, max: 0.6 },  // gen invest → energía dada a la cría (fracción de E_max).
    mature_age:{ min: 80,  max: 650 },  // gen mature_age → edad de madurez (ticks): gatea la cría e inicia la senescencia.
  },
};
