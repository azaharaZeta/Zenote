// Configuración por defecto ("Zenote"): ÚNICA fuente de los parámetros (el motor lee de aquí).
// Anotación UI: cada línea lleva `UI «Nombre» (Sección)` = etiqueta y sección del control en el laboratorio
//   (LAB_SPEC en src/ui/controls.js; fuente del orden y los nombres de la UI), o `no-ui` si no tiene control.
//   ↻ = requiere pulsar Reiniciar para aplicarse. El orden del fichero NO sigue al de la UI (búscalo por su «Nombre»).
// Unidades: el MOTOR trabaja en unidades de mundo (u), no en píxeles; la resolución solo cambia la nitidez.
// Solo el bloque `render` usa "px" reales. El detalle/historial de tuning vive en docs/ y CHANGELOG.

export const config = {
  // ───── Mundo ─────
  world: {
    size: 1000,    // UI «Tamaño del mundo» (Mundo y población) ↻ · Lado del mundo cuadrado (toro) en u. Dial de DENSIDAD: la materia/alimento TOTAL escala con el área (Modelo A, ver sim._aScale) → misma densidad a cualquier tamaño.
    matterBudget: 40000, // UI «Materia total (presupuesto)» (Mundo y población) ↻ · Materia total del mundo (pecera); escala ×área. Regulador del total de biomasa.
    closedRegen: 0.0055, // UI «Fotosíntesis (pecera)» (Comida y vegetación) · Ritmo de fotosíntesis (N→pasto) en la pecera: regulador principal de la comida.
    nutrientDiffuse: 0.15, // no-ui · Difusión del campo de nutriente libre por tick (bajo = manchas fértiles locales).
    birthGatherR: 2,     // no-ui · Radio en celdas del vecindario del que la cría reúne materia al nacer.
  },

  // ───── Recurso / vegetación (campo de comida en rejilla) ─────
  resource: {
    gridCols: 56,       // no-ui · Columnas de la rejilla (a tamaño 1000); escala ×size → celda de tamaño constante.
    gridRows: 56,       // no-ui · Filas (= gridCols → celdas cuadradas).
    R_max: 1.0,         // no-ui · Recurso máximo por celda.
    gradient: 'perlin', // no-ui · Forma del campo de capacidad: 'perlin' | 'center' | 'uniform'.
    capFloor: 0.1,      // no-ui · Suelo de la capacidad de carga (fracción de R_max): ningún baldío permanente.
    patchiness: 0.75,   // UI «Comida en parches» (Comida y vegetación) · Dinámica de rebrote: 0 = lineal · 1 = logístico + difusión → parches que migran.
    seedFloor: 0.04,    // no-ui · Rebrote espontáneo mínimo (banco de semillas): evita el estado absorbente (todo a cero).
    absRate: 0.15,      // UI «Ritmo de absorción» (Comida y vegetación) · Ritmo de pastado por tick (alto = pelan zonas → escasez local).
    absMetabBase: 0.5,  // no-ui · Suelo del factor metabólico en la absorción: a metab 0 aún se pasta algo.
    energyPerUnit: 10,  // UI «Energía por unidad» (Comida y vegetación) · Energía obtenida por unidad de recurso comida.
    grazeRefuge: 0.20,  // UI «Reserva de rebrote» (Comida y vegetación) · Reserva de rebrote intocable por celda (fracción): evita el sobrepastoreo letal.
    forageReach: 2,     // UI «Alcance de forrajeo (talla)» (Comida y vegetación) · Alcance de forrajeo por talla (celdas): el grande pasta de un área → payoff de talla. 0 = solo su celda.
    carrionDecay: 0.010, // UI «Descomposición de cadáveres» (Carroña) · Ritmo de descomposición de la carroña por tick (bajo = los cadáveres duran más).
    carrionAbsRate: 0.10, // UI «Ritmo de carroñeo» (Carroña) · Ritmo de carroñeo: fracción de la carroña de la celda que absorbe quien procesa carne.
    carrionScent: 3,    // no-ui · Escala del "olfato" de carroña en el gradiente de búsqueda (más alto = la carroña tira menos).
  },

  // ───── Población ─────
  pop: {
    initial: 150,            // UI «Sembrado inicial» (Mundo y población) ↻ · Nº de fundadores. FIJO: NO escala con el tamaño del mundo (se siembran en un círculo central, ver seedDensity).
    seedDensity: 0.0016,     // no-ui · Densidad del sembrado (fundadores/u²): se colocan en un CÍRCULO CENTRAL de área = initial/seedDensity (independiente del mundo). 0.0016 ≈ 150 fundadores en un círculo central de radio ~173 u.
    maxAgentsCeiling: 3000,  // UI «Tope de población» (Mundo y población) ↻ · Tope duro del pool (memoria/rendimiento). NO escala con el mundo. El punto real de población lo pone la comida/materia, por debajo.
    seed: 123,               // no-ui · Semilla por defecto (vacía el campo Semilla → mundo aleatorio).
    seedDietLow: false,      // no-ui · Sembrar todos herbívoros (true) vs dieta diversa con proto-carnívoros (false).
    carnivoreSeedFrac: 0.20, // UI «Siembra de carnívoros» (Mundo y población) ↻ · Fracción de fundadores sembrados como proto-carnívoros (condición inicial, no estrategia).
    simpleStart: true,       // no-ui · Fundadores SIMPLES (complejidad y apariencia EMERGEN) · false = genes aleatorios.
    startJitter: 0.06,       // no-ui · Magnitud del jitter gaussiano del sembrado simple.
    startDiversity: 0.1,     // UI «Diversidad inicial» (Mundo y población) ↻ · Diversidad inicial: 0 = fundadores TODOS IGUALES (renacuajos herbívoros idénticos y básicos, sin proto-carnívoros) · 0.5 (def) = moderada (jitter + cohorte carnívoro pleno) · 1 = variados. Escala jitter, nodos extra y el cohorte carnívoro.
  },

  // ───── Energética y costes (qué cuesta vivir, moverse, criar) ─────
  // Alometría: eMax ∝ masa; metabolismo ∝ masa^kleiber (Kleiber). Expresión en organism.js.
  // NOTA UI: este objeto se reparte por VARIAS secciones de la UI (Comida, Carroña, Metabolismo, Locomoción, Edad, Combate) — ver cada «Nombre».
  energy: {
    c_base: 0.024,      // UI «Coste basal» (Metabolismo y cuerpo) · Coste basal por tick (mantenimiento).
    massExp: 1.3,       // UI «Escala talla→masa» (Metabolismo y cuerpo) · Exponente alométrico talla→masa: sizeMass=(radius/refRadius)^massExp.
    kleiber: 0.75,      // UI «Metabolismo de escala» (Metabolismo y cuerpo) · Exponente metabólico: coste basal ∝ masa^kleiber (¾ = Kleiber).
    k_sense: 0.3,       // UI «Coste por visión» (Metabolismo y cuerpo) · Coste de la visión (alcance).
    k_metab: 0.6,       // UI «Coste por metabolismo» (Metabolismo y cuerpo) · Coste del metabolismo.
    k_lifespan: 0.35,   // UI «Coste de longevidad» (Edad y longevidad) · Coste basal extra de la longevidad (disposable soma): evita la senescencia "inmortal".
    k_lure: 0.07,       // no-ui · Coste de mantener el señuelo bioluminiscente (∝ prominencia). Bajo para que el órgano de emboscada SE SOSTENGA en quien caza (el no-cazador igual lo paga sin beneficio → lo pierde).
    k_graze: 0.50,      // UI «Pasto extra por masa» (Comida y vegetación) · Pasto extra ∝ masa de nodos (ata la complejidad al nicho herbívoro).
    k_grazeWide: 0.5,   // UI «Pasto extra por anchura» (Comida y vegetación) · Pasto extra ∝ anchura del cuerpo: premia la forma de pastador.
    k_scavThin: 1.0,    // UI «Carroñeo por cuerpo fino» (Carroña) · Carroñeo extra ∝ lo fino/elongado del cuerpo: emerge el gusano carroñero.
    k_flap: 0.7,        // no-ui · Coste de nado extra por aletear (∝ flapWork): aletear es ráfaga cara.
    k_effort: 1.6,      // UI «Coste por esfuerzo» (Locomoción y visión) · Coste extra de moverse ∝ esfuerzo (gen speed).
    moveCost: 0.02,     // UI «Coste de nado (v²)» (Locomoción y visión) · Coef. del coste de nado ∝ velocidad² (frena la carrera de velocidad). Subido un poco para el modelo de fuerza (el movimiento se abarató al hacerse por esfuerzo).
    k_muscle: 0.6,      // UI «Coste de musculatura» (Locomoción y visión) · Coste basal de mantener musculatura (gen speed → vmax): ∝ exceso sobre el neutro. Músculo potente sin usar = caro → trade-off r/K (la velocidad-capacidad tiene precio).
    k_haul: 0.2,        // UI «Coste de transporte (masa)» (Locomoción y visión) · Coste de transporte ∝ masa: arrastrar un cuerpo grande cuesta al moverse.
    k_drag: 0.4,        // UI «Coste de arrastre (forma)» (Locomoción y visión) · Coste de nado ∝ arrastre de la forma (Dmul); complementa k_haul (masa). 0 = inerte.
    dragRef: 1.1,       // no-ui · Arrastre de referencia del coste k_drag: solo paga el Dmul por encima de esto.
    E_max_base: 70,     // UI «Energía máxima base» (Metabolismo y cuerpo) · Energía máxima base · eMax = E_max_base · masa.
    preyGain: 0.90,     // UI «Energía de la presa» (Combate y dieta) · Fracción de energía de la presa aprovechada al cazarla.
    carcassValue: 0.14, // UI «Valor del cadáver (biomasa)» (Combate y dieta) · Biomasa estructural del cuerpo (∝ eMax): se bloquea del pool N al nacer y vuelve como carroña al morir. Palanca DOMINANTE herbivoría↔carnivoría: bajada para el modelo de fuerza (la caza se volvió más eficaz → menos recompensa por carne recupera la base herbívora).
  },

  // ───── Locomoción emergente: la FORMA produce el movimiento (el gen 'speed' = esfuerzo) ─────
  // Frontera auditable: todo aquí es FÍSICA (geometría→fuerza). Cada empuje va emparejado con su arrastre (trade-off).
  loco: {
    forceModel: true,   // no-ui ↻ · Locomoción por FUERZA: el cerebro decide el ESFUERZO (módulo de su salida) y la dirección; la velocidad EMERGE de empuje−arrastre con inercia (∝masa). false = modelo viejo (velocidad fijada a vmax).
    dragLin: 1.0,        // UI «Arrastre del agua» (Locomoción y visión) · Coef. de arrastre lineal del modelo de fuerza: fija la INERCIA / respuesta de velocidad (velResp en organism.js, ∝ dragLin·Dmul/masa) — cuánto tarda en acelerar/parar. NO fija la velocidad terminal (esa la dan kThrust/vMax).
    wander: 0.08,        // no-ui · Deriva térmica de fondo (física, no estrategia): pequeño jitter de velocidad → explora aunque el cerebro calle (evita que un fundador se congele en un baldío).
    kThrust: 7.1,       // UI «Empuje base» (Locomoción y visión) · Calibra la velocidad-capacidad típica de la morfología.
    headThrust: 0.06,   // UI «Empuje de la cabeza» (Locomoción y visión) · Empuje de la cabeza (motor base débil): bajo → nadar bien exige cola/aletas.
    paddleEff: 0.6,     // no-ui · Peso del remo lateral en el gait (aleta lateral propulsa, menos que la cola trasera).
    oscFloor: 0.15,     // no-ui · Suelo de amplitud de oscilación por nodo.
    phaseGain: 0.5,     // UI «Coordinación de marcha» (Locomoción y visión) · Cuánto penaliza la marcha descoordinada → nadar coordinado emerge.
    elongMax: 3.0,      // no-ui · Techo de la elongación derivada de la geometría de nodos (streamlining).
    symBase: 0.4,       // no-ui · Empuje útil hacia delante mínimo (la asimetría desvía empuje a girar).
    streamBase: 1.0,    // no-ui · Arrastre base del cuerpo.
    streamGain: 0.5,    // no-ui · Cuánto reduce el arrastre la elongación (hidrodinámica).
    effortFloor: 0.2,   // no-ui · Esfuerzo mínimo de nado.
    muscleMin: 0.6,     // no-ui · Multiplicador de empuje (vmax) con gen speed=0 (poco músculo: lento pero barato de mantener).
    muscleMax: 1.4,     // no-ui · Multiplicador de empuje (vmax) con gen speed=1 (mucho músculo: rápido pero caro). min+max=2 → neutro (×1) al sembrado speed≈0.5.
    vMin: 0.15,         // no-ui · Suelo de velocidad-capacidad.
    vMax: 3.0,          // UI «Velocidad máxima» (Locomoción y visión) · Techo de velocidad-capacidad (u/tick).
    speedSizeExp: 0.5,  // UI «Velocidad por talla (zancada)» (Locomoción y visión) · vmax_mundo ∝ (radio/medio)^este exp: el grande da ZANCADAS mayores (avanza más por el mundo); el pequeño es rápido EN SU ESCALA pero se desplaza poco. 0 = velocidad-mundo independiente de la talla (modelo previo).
    turnBase: 0.18,     // UI «Agilidad de giro» (Locomoción y visión) · Agilidad de giro base.
    angInertia: 0.5,    // UI «Inercia de giro» (Locomoción y visión) · Momento angular del giro ∝ masa (sobre el medio): alto = los grandes tardan en girar y sobregiran/contragiran; 0 = giro casi instantáneo (modelo previo). El techo de agilidad lo da «Agilidad de giro».
    turnAsym: 0.35,     // no-ui · La asimetría del grafo de nodos mejora el giro.
    turnSize: 0.15,     // no-ui · Los cuerpos grandes giran peor.
    turnElong: 0.08,    // no-ui · Los cuerpos elongados giran peor.
    turnMin: 0.08,      // no-ui · Giro mínimo (nadie queda incapaz de virar).
    segThrust: 0.34,    // no-ui · Empuje de las patas de los segmentos.
    modThrust: 0.3,     // no-ui · Empuje de los apéndices de los módulos.
    segDrag: 0.22,      // no-ui · Arrastre extra por segmento.
    modDrag: 0.6,       // no-ui · Arrastre extra por módulo.
    segTurn: 0.00,      // no-ui · Cada segmento extra empeora el giro.
    bodyThrust: 1.0,    // no-ui · Escala del empuje del cuerpo (cabeza+segmentos que ondulan): propulsor principal.
    limbThrust: 0.12,   // no-ui · Empuje por unidad de área de limbs (tentáculos/aletas finos).
    limbDrag: 0.20,     // no-ui · Arrastre por unidad de área de limbs (> limbThrust → propulsor ineficiente).
    bodyDrag: 0.30,     // no-ui · Arrastre por unidad de área de nodo ancho (cabeza/lóbulo).
    bodyMass: 0.30,     // no-ui · Masa metabólica por área de nodo ancho.
    // Forma del nodo (gen tipShape, neutro en 0.5): silueta base↔punta, compromiso físico.
    tipThrust: 0.4,     // no-ui · Abrir la punta (aleta) → +empuje; afilar (púa) → −empuje.
    tipDrag: 0.5,       // no-ui · Abrir → +arrastre; afilar → −arrastre (streamlining).
    tipReach: 0.35,     // no-ui · Afilar → +longitud (alcance: tentáculo/púa); abrir → más corto.
    // Modo de propulsión (gen gaitMode, neutro en 0 = ondular). Aletear = batir.
    flapGain: 1.2,      // no-ui · Empuje extra al aletear, ponderado a lo lateral (×se²).
    flapDrag: 0.6,      // no-ui · Arrastre extra al aletear (golpe de recuperación) → crucero vs ráfaga.
  },

  // ───── Visión emergente: 'sense' fija la inversión; 'e_fov' reparte alcance↔ángulo (conserva área) ─────
  vision: {
    halfFovMin: 0.35,   // no-ui · Semiángulo mínimo del cono (≈20°): estrecho y frontal (cazador).
    halfFovMax: 2.70,   // no-ui · Semiángulo máximo (≈155°): casi panorámico (presa).
    fovRef: 3.05,       // no-ui · FOV de referencia para conservar el área visual.
    rangeExp: 0.4,      // UI «Reparto alcance/ángulo» (Locomoción y visión) · Exponente del reparto alcance↔ángulo.
  },

  // ───── Dieta ─────
  diet: {
    omniPenalty: 0.15, // UI «Penalización omnívora» (Combate y dieta) · Penalización por dieta intermedia: >0 fuerza a especializarse (herbívoro/carnívoro puro).
    scavPenalty: 0.30, // UI «Penalización caza/carroña» (Combate y dieta) · Penalización al generalista caza↔carroña: >0 fuerza a especializar (cazador o carroñero).
  },

  // ───── Refugio de presa: cobertura graduada por la vegetación viva local (estabilizador Lotka-Volterra) ─────
  refuge: {
    enabled: true,      // UI «Refugio de presa» (Refugio de presa) · Activar la cobertura/refugio de presa.
    strength: 0.45,     // UI «Cobertura del refugio» (Refugio de presa) · Fuerza de la cobertura: prob. de escape = strength · vegetación_local. 0 = sin refugio. Subida para el modelo de fuerza: más presa escapa por cobertura → protege la base herbívora y reduce los colapsos al ápice-carnívoro.
  },

  // ───── Edad / mortalidad (la madurez y el ritmo de vida son GENES; aquí solo las escalas base) ─────
  age: {
    mortality: 0.0005,  // UI «Mortalidad por edad» (Edad y longevidad) · Mortalidad base por senescencia (prob./tick tras madurar; el gen senescence la escala).
    scale: 500,         // no-ui · Escala temporal de la senescencia.
    senesSlow: 0.3,     // no-ui · Multiplicador de senescencia con senescence=0 (longevo).
    senesFast: 3.0,     // no-ui · Multiplicador con senescence=1 (vida rápida, muere joven).
  },

  // ───── Reproducción ─────
  repro: {
    cooldown: 60,              // UI «Enfriamiento de cría» (Reproducción) · Enfriamiento entre crías (ticks).
    sexual: true,              // UI «Reproducción sexual» (Reproducción) · Reproducción sexual (recombinación de dos padres).
    asexual: false,             // UI «Permitir reproducción asexual» (Reproducción) · Permitir clon mutado si no hay pareja compatible cerca.
    speciesGenThreshold: 0.15, // UI «Umbral de especie» (Reproducción) · Distancia genética máxima para cruzarse (= misma especie).
    mateRadius: 70,            // UI «Radio de pareja» (Reproducción) · Radio (u) de búsqueda de pareja al reproducirse.
  },

  // ───── Mutación: una sola tasa por locus, ciega a la función del gen ─────
  mut: {
    rate: 0.05,         // UI «Tasa de mutación» (Mutación) · Prob. de mutación por gen.
    sigma: 0.08,        // UI «Sigma de mutación» (Mutación) · Magnitud de la mutación.
    bigRate: 0.002,     // UI «Tasa de macromutación» (Mutación) · Prob. de macromutación (salto grande y raro).
    bigSigmaMult: 5,    // no-ui · Multiplicador de magnitud de la macromutación.
    recomb: 0.07,       // UI «Recombinación (ligamiento)» (Mutación) · Recombinación sexual: prob. de cruce por locus (bajo = ligamiento, tramos contiguos).
  },

  // ───── Combate / depredación (física trófica). Al fallar un ataque el atacante pierde failDamage·eMax (freno denso-dependiente). ─────
  combat: {
    enabled: true,       // UI «Combate activo» (Combate y dieta) · Activar depredación/combate.
    sizeAdvantage: 1.8,  // UI «Ventaja de tamaño» (Combate y dieta) · Cuánto pesa el tamaño en quién gana el combate.
    failDamage: 0.1,     // UI «Daño al fallar ataque» (Combate y dieta) · Energía que pierde el atacante al fallar (× su eMax); muere solo si llega a 0.
    fleeSpeed: 1.0,      // UI «Escape por velocidad» (Combate y dieta) · Escape por velocidad: la presa más rápida que el cazador se zafa. 0 = solo cobertura.
    fleeCap: 0.95,       // no-ui · Tope de la prob. de escape por velocidad (nunca se zafa con certeza).
    handlingTime: 48,    // UI «Tiempo de manejo (digestión)» (Combate y dieta) · Enfriamiento tras una captura (digestión): satura la tasa de caza. Subido para el modelo de fuerza (la caza por ráfaga se volvió más eficaz → limita la tasa de depredación para que herbívoros/carroñeros aguanten).
    dietMargin: 0.08,    // UI «Margen de dieta (presa)» (Combate y dieta) · Diferencia de dieta mínima para considerar a otro "presa".
    preyBandLo: 0.15,    // UI «Suelo de banda de caza» (Combate y dieta) · Ratio presa/depredador mínimo cazable.
    preyBandHi: 1.10,    // UI «Techo de banda de caza» (Combate y dieta) · Ratio presa/depredador máximo atacable (>1 = presa mayor, arriesgada).
    lureGate: 0.5,       // no-ui · Umbral del gen 'o_len' para EMPEZAR a expresar el señuelo (más alto = órgano más raro: hay que SELECCIONARLO, no viene de serie). Desacoplado de la selección sexual.
    lureReach: 0.85,     // no-ui · Alcance de captura extra que da el señuelo (∝ prominencia).
    lureAttract: 0.9,    // UI «Atracción del señuelo (emboscada)» (Combate y dieta) · Atracción de presa por el señuelo (emboscada anglerfish). 0 = solo extiende alcance. Alto = el señuelo RINDE → el nicho de emboscada se sostiene.
    morphReach: 1.2,     // UI «Alcance de caza (apéndices)» (Combate y dieta) · Alcance de captura extra por apéndices frontales (∝ fwdReach·radio): forma de cazador. Es ahora el alcance PRINCIPAL del cazador activo (antes lo dominaba el señuelo universal; el señuelo pasó a ser nicho de emboscada).
  },

  // ───── Motor / tiempo ─────
  sim: {
    targetTPS: 20,      // UI «Velocidad» (barra de velocidad principal) · Ticks por segundo objetivo (0 = pausa).
    frameBudgetMs: 40,  // no-ui · Máx. ms simulando por frame en modo normal.
    maxBudgetMs: 250,   // no-ui · Máx. ms simulando por frame en modo "máx velocidad".
  },

  // ───── Render (solo visual; no afecta a la simulación). Aquí "px" = píxeles reales de dibujo. ─────
  render: {
    glow: true,               // no-ui · Resplandor (bloom).
    worldBounds: true,        // UI «Límite del mundo» (Estética) · Pista sutil del límite del mundo (hairline en los bordes de cada tile del toro).
    vegIntensity: 1.0,        // UI «Brillo de la vegetación» (Estética) · Realce de la vegetación (brillo del teal del pasto). En vivo.
    vegBoost: 0.75,           // UI «Realce del pasto tenue» (Estética) · Realce del pasto tenue (0→1): alto = hasta el pasto ralo se nota. En vivo.
    vegBlur: 1.8,             // UI «Suavizado del sustrato» (Estética) · Difuminado del sustrato: disuelve la rejilla de celda. En vivo.
    nutrientEase: 0.1,        // UI «Reactividad del nutriente» (Estética) · Suavizado temporal de las manchas de nutriente (bajo = no titilan). En vivo.
    vegColor: [10, 64, 70],          // no-ui · Color de la vegetación (incremento teal donde hay pasto, RGB 0-255).
    nutrientColor: [124, 108, 214],  // no-ui · Color de las manchas de nutriente libre (índigo-violeta, RGB 0-255).
    planktonHues: [150, 165, 180, 196, 212], // no-ui · Tonos HSL de las chispas de plancton/micro-flora.
    dprCap: 2,                // no-ui · Tope de densidad de píxeles (DPR) en calidad alta.
    maxInternalPx: 960,       // UI «Resolución interna» (resSlider, junto al botón Calidad) · Cap de resolución interna (borde largo, px): acota el coste por píxel. Solo nitidez, no detalle.
    maxFPS: 20,               // UI «Límite de FPS» (fpsCapSlider, junto a Calidad) · Tope de FPS del render (0 = sin límite). El motor no depende de esto.
    spriteCache: true,        // UI «Caché de sprites» (spriteCacheChk, modo rendimiento) · Caché de sprites por nodo: conserva la ondulación.
    spriteBakeBudget: 120,    // no-ui · Máx. horneados de sprite por frame (limita el "hitch" tras un zoom).
    spriteCacheCap: 2400,     // no-ui · Techo de entradas del caché de sprites.
    quality: 'high',          // UI «Calidad» (botón, cicla Baja/Alta/Máxima) · 'low' (móvil, sin bloom/halos) | 'high' (estándar) | 'ultra' (todo el esplendor).
    ultraDprCap: 3,           // no-ui · Tope de DPR en calidad máxima (supersampling).
    // LOD (nivel de detalle): umbrales de TAMAÑO APARENTE (radio·zoom·WORLD_REF/world.size, sin resolución). ×lodLowMult en baja.
    lodBody: 2,               // no-ui · rPx mínimo para dibujar cuerpo (debajo = punto plano).
    lodFull: 3,               // no-ui · rPx mínimo para el grafo completo de nodos (entre lodBody y esto = elipse barata).
    lodEye: 4,                // no-ui · rPx mínimo para dibujar ojos.
    lodLure: 4,               // no-ui · rPx mínimo para el señuelo (caro).
    lodWave: 6,               // no-ui · rPx mínimo para la onda viajera (movimiento).
    lodHalo: 6,               // no-ui · rPx mínimo para el halo por agente.
    lodLowMult: 2.0,          // no-ui · Multiplicador de todos los umbrales LOD en calidad baja (alta = ×1).
    lodFlat: 4,               // no-ui · Nodo por debajo de este tamaño → relleno plano (sin gradiente).
    lodOutline: 4,            // no-ui · Nodo por debajo de este tamaño → se omite su contorno.
    lodTexture: 10,           // no-ui · Nodo por encima de este tamaño → bandas de textura (piel).
    grassDensity: 6800,       // no-ui · Nº de motas de plancton/micro-flora repartidas por el mundo.
    grassRefreshFrames: 3,    // no-ui · Cada cuántos frames se recompone el sustrato (vegetación fluida).
  },

  // ───── Expresión de genes: rangos lerp desde [0,1]. Frontera "programador ↔ evolución" ─────
  expr: {
    size:      { min: 2.0, max: 12 },    // UI «Talla mínima (px)» / «Talla máxima (px)» (Metabolismo y cuerpo) · gen size → radio (u). `min` = suelo de talla: palanca maestra del régimen (afecta a eMax/coste/cría).
    sense:     { min: 10,  max: 80 },   // no-ui · gen sense → alcance de visión base (u).
    repro_thr: { min: 0.5, max: 0.95 }, // no-ui · gen repro_thr → umbral de energía para criar (fracción de E_max).
    invest:    { min: 0.2, max: 0.6 },  // no-ui · gen invest → energía dada a la cría (fracción de E_max).
    mature_age:{ min: 80,  max: 650 },  // no-ui · gen mature_age → edad de madurez (ticks): gatea la cría e inicia la senescencia.
  },
};
