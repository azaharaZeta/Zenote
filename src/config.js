// Configuración por defecto — "Zenote". ÚNICO lugar de los parámetros (el motor lee de aquí; nada hardcodeado disperso).
// Cada parámetro lleva su NOMBRE FUNCIONAL para editarlo a mano con rapidez. Los marcados (UI) tienen control
// en vivo en el modo Laboratorio. Frontera de diseño: el programador define la FÍSICA; la conducta y la forma EVOLUCIONAN.

export const config = {
  // ───── Mundo ─────
  world: {
    width: 1200,   // Ancho del mundo (px lógicos; fijo, no depende de la pantalla)
    height: 800,   // Alto del mundo
    wrap: true,    // Mundo toroidal (los bordes envuelven)
    // ── PROTOTIPO: ECOSISTEMA CERRADO EN MATERIA (pecera sellada) ──
    closedMatter: true,  // (↻) DEFAULT ON (pecera; receta del trío trófico en closedRegen). false = modelo ABIERTO (el sol CREA biomasa). true = la
                         //      MATERIA total es CONSTANTE: el sol solo deja a las plantas convertir NUTRIENTE LIBRE (pool N) en
                         //      biomasa; metabolismo/nado/pérdidas/muerte la DEVUELVEN al ciclo (no se evapora); NACER consume
                         //      nutriente del pool y se BLOQUEA si no hay → la capacidad de carga es ENDÓGENA (la pone la materia,
                         //      no el sol ni maxAgents). El cuerpo estructural = energy.carcassValue·eMax, ahora retirado del pool al
                         //      nacer y devuelto al morir (ya NO conjurado). Energía = abierta (sol→calor); materia = cerrada (real).
    matterBudget: 30000, // (↻) Materia total del mundo (energía-materia) cuando closedMatter. Reparto inicial: vegetación + (E+cuerpo)
                         //      de los fundadores + el RESTO como nutriente libre N. REGULADOR del total de biomasa (sustituye al sol
                         //      como límite). El sobrante (por encima de la capacidad ecológica) queda como N libre = buffer de la pecera.
    closedRegen: 0.0034, // (UI) Ritmo de fotosíntesis (captación N→pasto) SOLO en modo cerrado. Separado de resource.R_regen (que rige
                         //      el modelo abierto, sin tocarlo). 0.0034 = régimen de RED TRÓFICA: herbívoros + carroñeros + CAZADORES de
                         //      presa viva coexisten (medido headless multi-seed: trío estable en 4/6 siembras; los cazadores son una
                         //      minoría ápice fluctuante). EXIGE pop.maxAgents≈2000 (la productividad sube la pop a ~1000-2000; con el tope
                         //      en 1000 satura y se distorsiona). Va de la mano de combat.fleeSpeed 1.2 + diet.scavPenalty 0.30 (afinado
                         //      para el trío). DOS atractores: bajar a ~0.0017 → pecera magra y contemplativa (~700-900) pero el gremio
                         //      CAZADOR es FRÁGIL (colapsa en varias siembras → solo herbívoro/carroñero); 0.0012 → ~350 plácido solo-herbívoro. En vivo.
  },

  // ───── Recurso / vegetación (campo de comida en rejilla) ─────
  resource: {
    gridCols: 64,       // Columnas de la rejilla de recurso
    gridRows: 48,       // Filas de la rejilla de recurso
    R_max: 1.0,         // Recurso máximo por celda
    R_regen: 0.0035,    // (UI) Ritmo de rebrote del pasto — REGULADOR PRINCIPAL de cuánta comida sostiene el mundo
    gradient: 'perlin', // Forma del campo de capacidad: 'perlin' | 'center' | 'uniform'
    patchiness: 0.75,      // (UI) Dinámica de rebrote: 0 = lineal (sin parches) … 1 = logístico + difusión de
                        //      semilla → los parches EMERGEN y migran del pastoreo↔rebrote (ver world.regen). En vivo.
    tempFreq: 3,        // Frecuencia del campo térmico (bajo = zonas climáticas grandes → especializarse rinde)
    absRate: 0.20,      // (UI) Ritmo de pastado por tick (alto = pelan zonas → escasez local visible)
    energyPerUnit: 10,  // (UI) Energía obtenida por unidad de recurso comida
    grazeRefuge: 0.20,   // (UI) Reserva de rebrote intocable por celda (fracción) — evita el sobrepastoreo letal
    forageReach: 2,     // (UI) Alcance de FORRAJEO por talla (celdas): el grande pasta de un ÁREA (2·forageR+1)²,
                        //      forageR=round(forageReach·size) → cubre más terreno → da PAYOFF a la talla (la escasez
                        //      local NO lo borra). Sin esto, el ingreso de pasto no escala con la talla pero la cría
                        //      (reproRef ∝ sizeMass) sí → todo deriva al mínimo. 0 = solo su celda (modelo previo).
                        //      Fine-tuning headless (5 semillas): 0 → todo mínimo; 2 → 1 pico; 3 (con omniPenalty 0.15) →
                        //      DOS grupos de talla (~0.25 peque + ~0.55 grande, 21% grandes) y robusto. Va con omniPenalty 0.15.
    carrionDecay: 0.005, // (UI) Ritmo al que se descompone la CARROÑA por tick (cadáveres). Lo decaído vuelve en
                        //      parte al pasto (energy.corpseReturn) = ciclo de nutrientes; el resto se pierde. Bajo =
                        //      los cadáveres tardan en deshacerse (más tiempo para que un carroñero llegue); alto =
                        //      se pudren rápido. A 0.005 y 20 t/s un cuerpo dura ~decenas de segundos. 0 = no decae.
    carrionAbsRate: 0.15, // (UI) Ritmo de CARROÑEO: fracción de la carroña de la celda que absorbe por tick quien
                        //      puede procesar carne (∝ effCarn). Alto = vacían el cadáver rápido. Medido headless (R_regen
                        //      0.0035): 0 → carnívoros ~48; 0.30 → ~284 (×6, pero sobre-dispara); 0.15 = puente SUAVE.
                        //      (Fase 1: el carroñeo lo hace effCarn; la Fase 2 lo hará un eje de dieta propio → gusano.)
  },

  // ───── Población ─────
  pop: {
    initial: 400,            // Nº de fundadores al sembrar
    maxAgents: 2000,         // (UI ↻) Tope físico del pool (límite duro de memoria) · ÚNICO límite de población (la capacidad de
                             //      carga la pone el recurso/materia, no este número — ver auditoría #5). SUBIDO 1000→2000 para dar HOLGURA a la
                             //      red trófica de la pecera (closedRegen 0.0034 lleva la pop a ~1000-2000; con 1000 saturaba). Afecta también al
                             //      modelo abierto (más CPU, pop posible mayor; ~460 t/s a 1000 agentes en 1 hilo → margen de sobra). Cambiarlo
                             //      requiere Reiniciar (re-asigna los arrays SoA + speciesOf en el worker). Slider del lab para experimentar.
    seed: 123,               // Semilla por defecto (vacía el campo Semilla y Sembrar → mundo aleatorio)
    seedDietLow: false,      // Sembrar todos herbívoros (true) vs dieta diversa con proto-carnívoros (false)
    carnivoreSeedFrac: 0.20, // (UI ↻) Fracción de fundadores sembrados como proto-carnívoros. Es condición INICIAL (cruza el valle
                             //      de arranque), no estrategia codificada → la selección decide después. 0.20 da una cohorte de
                             //      establecimiento mayor (antes 0.14 era escasa → en pecera magra el gremio a veces no arrancaba).
    simpleStart: true,       // Fundadores SIMPLES (complejidad y apariencia EMERGEN) · false = genes aleatorios
    startJitter: 0.06,       // Magnitud del jitter gaussiano del sembrado simple
    startDiversity: 0,       // (UI) Diversidad inicial: 0 = fundadores casi CLONALES, lo más básico (renacuajos
                             //      simples idénticos + cohorte carnívora) para ver evolucionar desde cero … 1 = variado
  },

  // ───── Energética y costes (qué cuesta vivir, moverse, crecer, criar) ─────
  // ALOMETRÍA (#3): la talla es una MASA física. eMax ∝ masa (almacén ∝ volumen); metabolismo ∝ masa^kleiber
  // (ley de Kleiber: economía de escala). Ver organism.js. `massExp`/`kleiber` son tunables; las bases están
  // recalibradas para que el organismo MEDIO (size 0.5, head-only) conserve ≈ los valores previos.
  energy: {
    c_base: 0.024,      // (UI) Coste basal por tick (recalibrado por la alometría: antes 0.02 con k_size aparte)
    massExp: 1.5,       // (UI) Exponente alométrico talla→masa: sizeMass=(radius/refRadius)^massExp. 1 = lineal; 2 = área 2D
    kleiber: 0.75,      // (UI) Exponente metabólico: coste basal ∝ masa^kleiber (¾ = Kleiber; <1 = los grandes gastan menos por masa)
    k_sense: 0.3,       // (UI) Coste de la visión (alcance)
    k_metab: 0.6,       // (UI) Coste del metabolismo
    k_lifespan: 0.35,   // (UI) (#12, disposable soma) Coste basal extra de la LONGEVIDAD: factor (1 + k_lifespan·(1−senescence)).
                        //      Vivir lento/longevo cuesta mantener el cuerpo → evita que la senescencia colapse a "inmortal".
    k_temp: 1.9,        // Coste por desviarse del óptimo térmico (0 = sin selección térmica)
    k_lure: 0.13,       // Coste de mantener el SEÑUELO bioluminiscente (∝ prominencia)
    k_graze: 0.50,      // (UI) Pasto EXTRA ∝ masa corporal de nodos (ata la complejidad al nicho herbívoro)
    k_grazeWide: 0.5,   // (UI) (Capa 2) Pasto EXTRA ∝ ANCHURA del cuerpo (baja elongación): cuerpos anchos/aplanados barren
                        //          más recurso → morfología de pastador (aletas/hojas). Reverso del cazador aerodinámico
    k_scavThin: 1.0,    // (UI) (Fase 2) CARROÑEO extra ∝ lo FINO/elongado del cuerpo: effScav·(1+k_scavThin·elongación).
                        //          Rastrear carroña dispersa premia el crucero barato → emerge el GUSANO (reverso del
                        //          pastador ANCHO). 0 = el carroñero no gana por ser fino (no diverge la forma). Afinar midiendo.
    k_flap: 0.7,        // (Capa 3) Coste de NADO extra por ALETEAR (∝ flapWork): el golpe activo gasta → aletear es
                        //          ráfaga CARA. Hace honesto el eje ondular (crucero barato) ↔ aletear (ráfaga cara)
    k_effort: 1.59,     // (UI) Coste extra de moverse ∝ esfuerzo (gen speed)
    moveCost: 0.015,    // (UI) Coef. del coste de nado ∝ velocidad² (frena la carrera de velocidad)
    k_haul: 0.4,        // (UI) (A) Coste de TRANSPORTE ∝ masa: el nado se multiplica por (1 + k_haul·max(0, masa−1)) →
                        //      arrastrar un cuerpo grande / con muchos apéndices cuesta al MOVERSE (mantenerlo ya se paga
                        //      en c_base por Kleiber). 0 = nado ciego a la masa (modelo previo); masa ≤ 1 (≤ medio) sin recargo.
    k_drag: 0.4,        // (UI) (B) Coste de nado ∝ ARRASTRE de la FORMA: el nado se multiplica por (1 + k_drag·max(0, Dmul−dragRef)),
                        //      Dmul = arrastre emergente de la geometría (bodyplan.reducePlan: cuerpo/aletas anchos, apéndices). Complementa
                        //      A (que es por MASA): difieren en aletas/garras (mucho arrastre, poca masa). Cierra el incentivo PERVERSO del
                        //      "arrastre gratis" (antes el arrastre solo FRENABA, v=…/Dmul, y como el coste va con v² un cuerpo con arrastre
                        //      nadaba MÁS BARATO). MEDIDO headless (4000t, pecera): efecto SUTIL en el régimen default —las velocidades son
                        //      bajas (vmax~0.37), así que moveCost·v² es una fracción menor del balance—; SIN daño (pop/dieta estables a 0.4–0.8,
                        //      no machaca al pastador ancho). Muerde MÁS bajo presión de velocidad (fleeSpeed alto / carrera depredador-presa).
                        //      0 = INERTE (el arrastre solo frena). Se lee en vivo (no recachea el fenotipo).
    dragRef: 1.1,       // (UI) Arrastre de REFERENCIA del coste B: solo el Dmul por ENCIMA de dragRef paga (max(0, Dmul−dragRef)) → colchón
                        //      para no cobrar el arrastre típico. Medido: Dmul mediana≈1.17, p90≈1.36 (mínimo 1.0 = cuerpo sin arrastre extra).
    E_max_base: 71,     // (UI) Energía máxima base · eMax = E_max_base · masa. Criar cuesta una fracción de la masa-de-talla
                        //      (reproRef = E_max_base · sizeMass, SIN la masa de nodos → la complejidad no frena la cría, #4).
    preyGain: 0.90,     // (UI) Fracción de energía de la presa aprovechada al cazarla
    carcassValue: 0.25, // (UI) BIOMASA del cadáver (∝ eMax) que SUMA a su energía: la captura rinde preyGain·(E_presa
                        //      + carcassValue·eMax_presa). 0 = solo cuenta la energía ALMACENADA (modelo previo) → en
                        //      mundo escaso la presa cría hasta el tope pero MAGRA (poca E) y cazarla da calorías
                        //      vacías → los carnívoros se extinguen rodeados de presa abundante (medido headless: a
                        //      R_regen 0.003, 3/4 semillas extinguen carnívoros). >0 = un cuerpo vale su tejido (∝
                        //      masa) ADEMÁS de sus reservas → comer un animal alimenta aunque viniera hambriento. 0.25
                        //      rescata el nicho carnívoro en mundo escaso (≈6% estable) conservando el gradiente
                        //      presa-gorda-vale-más (freno L-V parcial). OJO: subirlo mucho ablanda ese freno → en
                        //      comida abundante puede disparar oscilaciones depredador-presa. Afinar por medición.
    scrapReturn: 0.15,  // (UI) SOBRAS: al CAZAR una presa, fracción de su biomasa (carcassValue·eMax) que queda como
                        //      carroña (el depredador ya se llevó casi todo) → "restos". Muertes NATURALES dejan el
                        //      cuerpo entero (factor 1). Bajo = la caza casi no deja nada para carroñeros.
    corpseReturn: 0.5,  // (UI) Fracción de la carroña DECAÍDA que vuelve al pasto (ciclo de nutrientes, ver world.decayCarrion); el resto se pierde
  },

  // ───── Locomoción emergente: la FORMA produce el movimiento (el gen 'speed' = esfuerzo) ─────
  // FRONTERA AUDITABLE (auditoría #8): TODO lo de aquí es FÍSICA (cómo la geometría→fuerza), NO juicios de
  // "qué forma es buena". Cada empuje (bodyThrust/segThrust/modThrust/limbThrust) va emparejado con su arrastre
  // (bodyDrag/segDrag/modDrag/limbDrag) → trade-off, sin barra libre; el giro emerge de asimetría/tamaño/elongación.
  // Qué morfología gana lo decide la SELECCIÓN, no estos números. (Matiz: bodyThrust alto = cabeza buen propulsor
  // → ver idea "cabeza nadadora" en IDEAS.md; es balance, no una regla de forma.)
  loco: {
    kThrust: 7.1,       // (UI) Calibra la velocidad-capacidad típica (recalibrado: un nadador con cola ≈ v1; cabeza sola ~0.47)
    headThrust: 0.06,   // (UI) Empuje de la CABEZA (motor base débil): 1 = cabeza nadadora; bajo = la cabeza es carga
                        //      y nadar bien EXIGE cola/aletas → emergen propulsores. A 0.06 un cuerpo SIN propulsores casi
                        //      no avanza (≈vMin) y un "garras-only" queda clavado en el suelo → nadar depende del fenotipo
                        //      propulsor (mata el residuo de "cabeza voladora"; expone el coste de mobilidad de las garras). Ver bodyplan.js.
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
    vMax: 3.0,          // (UI) Techo de velocidad-capacidad
    turnBase: 0.18,     // (UI) Agilidad de giro base
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
    // FORMA del nodo (Capa 1, gen `tipShape`, NEUTRO en 0.5). Compromiso físico de la silueta base↔punta:
    tipThrust: 0.4,     // Abrir la punta (aleta/paleta) → +empuje al oscilar; afilar (púa) → −empuje. ±factor a forma extrema
    tipDrag: 0.5,       // Abrir → +arrastre; afilar → −arrastre (streamlining). ±factor a forma extrema
    tipReach: 0.35,     // Afilar → +longitud (alcance: tentáculo/púa); abrir → más corto. ±factor a forma extrema
    // MODO de propulsión (Capa 3, gen `gaitMode`, NEUTRO en 0 = ondular). Aletear = batir:
    flapGain: 1.2,      // Empuje extra al aletear, ponderado a lo LATERAL (×se²): una aleta que bate propulsa más
    flapDrag: 0.6,      // Arrastre extra al aletear (golpe de recuperación) → crucero (ondular) vs ráfaga (aletear)
  },

  // ───── Visión emergente: 'sense' fija la inversión; 'e_fov' reparte alcance↔ángulo (conserva área) ─────
  vision: {
    halfFovMin: 0.35,   // Semiángulo mínimo del cono (rad ≈ 20°): estrecho y frontal (cazador)
    halfFovMax: 2.70,   // Semiángulo máximo (rad ≈ 155°): casi panorámico (presa)
    fovRef: 3.05,       // FOV de referencia para conservar el área visual
    rangeExp: 0.4,      // (UI) Exponente del reparto alcance↔ángulo
  },

  // ───── Dieta ─────
  diet: {
    omniPenalty: 0.15, // (UI) Penalización por dieta intermedia. 0 = omnívoros arrasan (generalista gratis, sin
                       //      divergencia morfológica); >0 fuerza a especializarse → emergen herbívoros anchos y
                       //      cazadores con alcance (Capa 1/2). 0.15 = especialización marcada; además ESTABILIZA el
                       //      forrajeo por talla (forageReach 3) → sin esto una semilla colapsaba. (Antes 0.05.)
    scavPenalty: 0.30, // (UI) (Fase 2) Penalización al GENERALISTA del eje caza↔carroña (gen `scav`): un comecarne
                       //      50/50 caza-carroña paga; 0 = sin coste (puede cazar Y carroñear igual de bien → no diverge
                       //      el gusano); >0 fuerza a especializar en CAZADOR (presa viva) o CARROÑERO (cadáveres). Análogo
                       //      a omniPenalty pero dentro de la carne. SUBIDO 0.20→0.30: mantiene una especie CAZADORA distinta en
                       //      la pecera (si no, el comecarne deriva todo a carroñero) → clave para el trío trófico. Medido headless.
  },

  // ───── Refugio de presa (#7): COBERTURA graduada por la vegetación VIVA local (Huffaker), no flag binario.
  //       Estabilizador Lotka-Volterra: en vegetación densa la presa escapa al combate (refugios DINÁMICOS). ─────
  refuge: {
    enabled: true,      // (UI) Activar la cobertura/refugio de presa
    strength: 0.3,      // (UI) Fuerza de la cobertura: prob. de escape = strength · vegetación_local (∈[0,1]).
                        //      En vegetación máxima la presa escapa ~strength de los ataques; 0 = sin refugio. BAJADO de
                        //      0.9 a 0.3 para que el escape dependa de la VELOCIDAD (combat.fleeSpeed), no solo de esconderse
                        //      → la velocidad pasa a importar. Sigue siendo estabilizador L-V parcial. En vivo.
  },


  // ───── Edad / mortalidad ─────
  // Edad / mortalidad. La madurez (inicio de senescencia + gate de cría) y el ritmo de vida son GENES (#12):
  // ver expr.mature_age y el gen `senescence`. Aquí quedan solo las escalas BASE comunes.
  age: {
    mortality: 0.0005,  // (UI) Mortalidad base por senescencia (prob./tick tras madurar; el gen `senescence` la escala)
    scale: 500,         // Escala temporal de la senescencia
    senesSlow: 0.3,     // (#12) multiplicador de senescencia con `senescence`=0 (longevo: envejece despacio)
    senesFast: 3.0,     // (#12) multiplicador con `senescence`=1 (vida rápida: envejece deprisa, muere joven)
  },

  // ───── Reproducción ─────
  repro: {
    cooldown: 60,              // (UI) Enfriamiento entre crías (ticks)
    sexual: true,              // (UI) Reproducción sexual (recombinación de dos padres)
    asexual: true,              // (UI) Permitir clon mutado si no hay pareja compatible cerca. ON conserva la diversidad
                               //      de talla; solo-sexual la APLANA (la mezcla grande×pequeño regresa a la media — medido headless).
    speciesGenThreshold: 0.15, // (UI) Distancia genética máxima para cruzarse (= misma especie)
    mateRadius: 70,            // (UI) Radio (px) de búsqueda de pareja al reproducirse
  },

  // ───── Mutación: UNA sola tasa por locus, CIEGA a la función del gen (auditoría #1) ─────
  // (antes había 3 ritmos por categoría base/forma/decor → la mutación no debe conocer la "función" de un gen).
  mut: {
    rate: 0.05,         // (UI) Prob. de mutación por gen (todos los genes por igual)
    sigma: 0.08,        // (UI) Magnitud de la mutación
    bigRate: 0.002,     // (UI) Prob. de macromutación (salto grande y raro)
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
    failDamage: 0.2,    // (UI) Energía que pierde el atacante al fallar (× su eMax) · muere solo si llega a 0 · ≥1 ≈ muerte segura
    fleeSpeed: 1.2,     // (UI) Escape por VELOCIDAD: la presa que nada más rápido que el cazador se zafa (prob =
                        //      fleeSpeed·(vmax_presa/vmax_cazador − 1), tope 0.95). Hace que huir/cazar sea un DUELO de
                        //      velocidad → la vmax sube por MORFOLOGÍA propulsora (carrera armamentística, gradual). Requiere
                        //      cobertura baja (refuge.strength) o el escondite lo enmascara. 0 = solo cobertura (modelo previo).
                        //      BAJADO 2→1.2: caza algo más fácil → sostiene el nicho CAZADOR de presa viva en la pecera (red trófica;
                        //      bajar a 1.0 lo hace boom-bust, menos robusto — medido). Afecta también al modelo abierto.
                        //      >4 o cobertura nula → la presa escapa demasiado y los carnívoros se quedan sin comer (medido).
    handlingTime: 31,    // (UI) Enfriamiento tras una captura (digestión) — satura la tasa de caza, amortigua oscilaciones
    dietMargin: 0.08,    // (UI) Diferencia de dieta mínima para considerar a otro "presa" (no un igual)
    preyBandLo: 0.15,    // (UI) Ratio presa/depredador MÍNIMO cazable (más pequeño no compensa; alto → fuerza presa grande)
    preyBandHi: 1.10,     // (UI) Ratio presa/depredador MÁXIMO atacable (1.0 = hasta su tamaño; >1 = presa mayor, más arriesgada)
    lureReach: 0.85,     // Alcance de captura extra que da el señuelo (∝ prominencia)
    morphReach: 0.4,     // (UI) (Capa 2) Alcance de captura extra por apéndices FRONTALES (∝ fwdReach·radio). Premia la
                         //          morfología de agarre (garras/tentáculos al frente) en depredadores; cuesta nado (gait<0)
  },


  // ───── Motor / tiempo ─────
  sim: {
    targetTPS: 20,      // (UI) Ticks por segundo objetivo (0 = pausa)
    frameBudgetMs: 40,  // Máx. ms simulando por frame en modo normal (si no llega, bajan fps, no se congela)
    maxBudgetMs: 250,   // Máx. ms simulando por frame en modo "máx velocidad"
  },

  // ───── Render (solo visual; no afecta a la simulación) ─────
  render: {
    glow: true,               // Resplandor (bloom). Solo config (sin control en vivo)
    dprCap: 2,                // Tope de densidad de píxeles (DPR) en calidad ALTA
    // (UI) CAP de RESOLUCIÓN INTERNA (borde largo, px del backing store): el render corre por DEBAJO de la pantalla y
    // el CSS reescala (el blur abisal disimula el upscaling) → el coste por píxel (bloom, sustrato, halos, fills) queda
    // ACOTADO e independiente del tamaño/DPR de pantalla. Es un TECHO: en pantallas más pequeñas se renderiza NATIVO
    // (nunca sobre-renderiza). NO cambia el DETALLE (LOD por tamaño percibido), solo la NITIDEZ. Más bajo = más rápido y
    // más borroso. Se aplica a TODAS las calidades (Máxima supersamplea sin pasar de aquí). Slider "Resolución" en el
    // bloque Rendimiento del laboratorio (rango 640–1280).
    maxInternalPx: 960,
    // (UI) Tope de FPS del RENDER (0 = sin límite). El motor (t/s) NO depende de esto. Con el dibujado BAJO DEMANDA
    // (solo se redibuja si cambió el tick/cámara/selección) evita malgastar GPU+CPU en frames idénticos (pantallas a
    // 120 Hz, o velocidad máxima donde los datos cambian ~4/s). 20 = ligero (≈ ritmo del tick); súbelo para paneo/zoom más fluido.
    maxFPS: 20,
    // ── CACHÉ DE SPRITES (opt-in, modo rendimiento). Cachea cada organismo por NODO en un atlas y lo ensambla con la
    //    onda viva (conserva la ondulación). Rehornea solo al cambiar color o tamaño. Para móvil/equipos modestos. ──
    spriteCache: true,        // (UI) activar el caché de sprites (modo rendimiento)
    spriteBakeBudget: 120,    // máx. horneados por frame (limita el "hitch" tras un cambio de zoom)
    spriteCacheCap: 2400,     // techo de entradas del caché (cota de memoria)
    quality: 'high',          // (UI) 'low' | 'high' | 'ultra'. Baja = sin bloom/halos/nieve, LOD agresivo (móvil).
                              //      Alta = el estándar bonito. MÁXIMA (ultra) = todo el esplendor (ver knobs ultra*).
    // ── MÁXIMA (ultra): superconjunto de ALTA con extras de esplendor (supersampling, doble bloom, SIN LOD = TODO a
    //    grafo completo, más nieve, sustrato más fino). Opt-in (no se autodetecta); pesado, para equipos capaces. ──
    ultraDprCap: 3,           // Tope de DPR en máxima (supersampling: render por encima del DPR del dispositivo → nítido)
    // ── LOD (nivel de DETALLE). Umbrales en unidades de TAMAÑO APARENTE (radio_mundo × zoom × LOD_REF, SIN resolución;
    //    ver canvas.js). Dos métricas: (a) por CRIATURA (radio cabeza): tier punto<lodBody≤elipse<lodFull≤grafo, + halo
    //    (lodHalo), ojos (lodEye), onda+contorno (lodWave), señuelo (lodLure); (b) por NODO: relleno plano si <lodFlat,
    //    sin contorno si <lodOutline, textura si >lodTexture. TODOS se multiplican por lodLowMult en BAJA (×1 en alta;
    //    MÁXIMA los ignora → dibuja todo). Solo render. ──
    lodBody: 2,               // rPx mínimo para dibujar CUERPO (debajo = punto plano)
    lodFull: 3,               // rPx mínimo para el GRAFO completo de nodos (entre lodBody y esto = cuerpo barato/elipse)
    lodEye: 4,               // rPx mínimo para dibujar OJOS (dentro del grafo)
    lodLure: 4,              // rPx mínimo para el SEÑUELO (béziers+gradientes, caro)
    lodWave: 6,              // rPx mínimo para la ONDA viajera (MOVIMIENTO). El contorno ya NO depende de esto (va con el grafo). (18→16: se mueve un pelín antes.)
    lodHalo: 6,               // rPx mínimo para el HALO por agente (los puntos diminutos no lo necesitan; el bloom global ya brilla)
    lodLowMult: 2.0,          // Multiplicador de TODOS los umbrales LOD (criatura Y nodo) en calidad baja (más agresivo). Alta = ×1.
    // Umbrales por NODO (tamaño del NODO, no de la criatura) → detalle fino dentro del grafo:
    lodFlat: 4,               // nodo por debajo de este tamaño → cuerpo con relleno PLANO (sin gradiente de volumen; imperceptible)
    lodOutline: 4,            // nodo por debajo de este tamaño → se OMITE su contorno (outline invisible)
    lodTexture: 10,           // nodo por ENCIMA de este tamaño → bandas de TEXTURA (piel)
    grassDensity: 6800,       // Nº de motas de plancton/micro-flora repartidas por el mundo (chispas abisales)
    grassRefreshFrames: 15,   // Cada cuántos frames se redibuja la capa de sustrato
  },

  // ───── Expresión de genes: rangos lerp desde [0,1]. Frontera "programador ↔ evolución" ─────
  expr: {
    size:      { min: 1.7, max: 9 },    // gen size → radio (px); solo render/contacto, NO afecta a la energía
    sense:     { min: 10,  max: 80 },   // gen sense → alcance de visión base (px)
    repro_thr: { min: 0.5, max: 0.95 }, // gen repro_thr → umbral de energía para criar (fracción de E_max)
    invest:    { min: 0.2, max: 0.6 },  // gen invest → energía dada a la cría (fracción de E_max)
    mature_age:{ min: 80,  max: 650 },  // (#12) gen mature_age → edad de madurez (ticks): gatea la cría e inicia la senescencia
  },
};
