// Configuración por defecto — "Zenote"
// Espejo fiel de docs/CONFIG.md. ÚNICO lugar donde viven los parámetros.
// El motor lee de aquí; nada debe estar hardcodeado disperso.
// Los marcados *(UI)* se exponen como controles en vivo (ver ui/controls.js).

export const config = {
  world: {
    width: 1200,   // px lógicos (NO cambia con el tamaño de pantalla)
    height: 800,
    wrap: true,    // toro
  },
  resource: {
    gridCols: 64,
    gridRows: 48,
    R_max: 1.0,
    R_regen: 0.0016,    // (tune A/T2) "Comida disponible": ritmo de REBROTE del recurso por tick. Bajado para contener la población herbívora. En este ecosistema el
                        // recurso está sobrepastoreado (las celdas rara vez llegan a su techo), así que ESTE es el
                        // lever real de cuánta comida hay (no R_max). Bajado (0.003→0.0024, ~20% menos) para no
                        // sobrealimentar → poblaciones más contenidas y dispersas. Ajustable en vivo desde la UI.
                        // (Ajustable en vivo desde el modo Laboratorio.)
    gradient: 'perlin', // 'perlin' | 'center' | 'uniform'
    patchiness: 0,      // (UI) 0 = campo suave (como siempre) … 1 = comida en PARCHES con huecos
                        // baldíos (sin gradiente que seguir) → premia la BÚSQUEDA y la MEMORIA del
                        // cerebro neuronal. Aplica al sembrar (reconstruye el campo de capacidad).
    tempFreq: 3,        // frecuencia del campo térmico: bajo = zonas grandes y uniformes →
                        // los organismos viven en UN clima y especializarse rinde (el 0.5 deja de ser cómodo)
    // ---- PARTICIÓN DEL RECURSO POR TALLA (Propuesta B: nichos de talla herbívora) ----
    // El pasto tiene un "grano" espacial (campo grain en world.js); la eficiencia de pasto = encaje gaussiano
    // entre la talla del herbívoro y el grano local → distintas tallas prosperan en distintas zonas (no compiten).
    grainFreq: 3,       // frecuencia del campo de grano (bajo = zonas grandes, como el clima)
    grainMatch: 0,      // FUERZA del encaje (0 = off; 1 = el ingreso depende del todo del encaje talla-grano).
                        // Medido: con A (banda) activa, B fuerte extingue carnívoros (sube K herbívoro). Desactivado
                        // hasta afinar el filo A+B en una búsqueda en equilibrio. El campo grain queda listo en world.js.
    grainSigma: 0.18,   // ancho del nicho: cuánto margen de talla rinde bien en una zona dada
    absRate: 0.30,      // (UI) fracción absorbible/tick antes de escalar por metab. SUBIDO 0.12→0.30: los herbívoros
                        // pastan más rápido → dejan zonas PELADAS donde se agolpan (escasez local visible, ~20% de
                        // celdas a ras del refugio vs 6% antes) → la comida limita de forma visible, manteniendo la
                        // coexistencia (medido 3/3). Más alto agota más pero empieza a sacrificar carnívoros.
    energyPerUnit: 20,  // conversión recurso→energía (parámetro de equilibrio crítico)
    grazeRefuge: 0.3,   // fracción de cada celda que NO se puede pastar (reserva de rebrote)
                        // → siempre queda vegetación en pie (crece y florece) y frena el sobrepastoreo
                        // calibrado por observación: enjambre denso y bien alimentado.
                        // El recurso de fondo queda tenue porque los herbívoros
                        // sobrepastorean; el paisaje frondoso emerge con depredadores (Fase 2).
  },
  pop: {
    initial: 400,
    maxAgents: 4000,
    maxAlive: 500,      // (UI) TOPE de organismos vivos: al alcanzarlo no nacen nuevas crías. 0 = sin límite (solo
                        // limita el pool físico maxAgents). Slider en el laboratorio (1..1000) + botón "máx".
                        // NOTA (medido): a 500 el tope queda BAJO la capacidad de carga natural (~800) → comprime la
                        // población y fragiliza a los carnívoros (coexist 4/6 vs 5/6 sin tope). Es el precio de tener
                        // menos organismos (rendimiento). Subirlo hacia ~900-1000 o ponerlo en 0 mejora la coexistencia.
    seed: 123,          // semilla por defecto que muestra coexistencia depredador-presa robusta
                        // (vacía el campo "semilla" y pulsa Sembrar para un mundo aleatorio)
    seedDietLow: false,     // Fase 2: dieta inicial diversa para que emerjan carnívoros
    carnivoreSeedFrac: 0.14, // fracción de fundadores sembrados como proto-carnívoros. BAJADO 0.32→0.14: con menos
                            // depredadores al inicio, la presa establece base ANTES → el primer ciclo no hace boom-crash
                            // violento (que extinguía carnívoros en el transitorio ~2k ticks). Medido: coexist 5/8→6/8 y
                            // más carnívoros (86→108). Demasiado bajo (<0.08) no aporta; 0.22 fue ruido peor.
    simpleStart: true,      // SEMBRAR SENCILLO: los fundadores arrancan como organismos simples (pequeños,
                            // simétricos, 1 segmento, sin módulos/ramas, cabeza/ojos lisos, sin ornamento) con
                            // solo un pequeño jitter. La complejidad y la apariencia EMERGEN por evolución →
                            // cada ejecución diverge hacia algo distinto (dependiente del camino). false = el
                            // arranque antiguo (genes uniformes [0,1] → mucha variedad de golpe, runs parecidos).
    startJitter: 0.06,      // desviación del jitter gaussiano sobre la línea base sencilla (variación inicial sutil)
    startDiversity: 0.5,    // (UI: slider "Diversidad inicial" junto a Sembrar) 0 = sembrado MONÓTONO (fundadores
                            // casi idénticos) … 1 = VARIADO. Escala jitter + dispersión decorativa. Aplica al Sembrar.
  },
  energy: {
    c_base: 0.02,
    carnUpkeep: 0.15,   // (UI) RESILIENCIA carnívora: descuento de coste basal ∝ dieta (0.15 = −15% al gasto en
                        // dieta 100% carnívora) → aguantan mejor los valles de presa sin tocar el combate. 0 = off.
    k_size: 0.67,       // coste basal por tamaño (muy bajado 1.8→0.3): el tamaño es CASI NEUTRO energéticamente
                        // → deriva libre por todo el rango (como los genes de apariencia) → coexisten tamaños
                        // variados en la misma run. El tamaño sigue contando en el combate (depredador > presa).
    k_grazeSize: 0,     // (lever de búsqueda) ingreso de pasto EXTRA ∝ tamaño (alometría). 0 = desactivado.
                        // En aislado infla población; combinado con costes de talla puede abrir abanico herbívoro.
    k_sizeHerb: 1.5,    // (UI) coste de tamaño EXTRA solo para HERBÍVOROS (∝ size·(1-diet)): frena al herbívoro
                        // grande sin tocar al carnívoro. Va de la mano con preyBandHi: con la banda a 1.0 la presa
                        // YA NO escapa creciendo (sigue cazable hasta su propio tamaño), así que NO hace falta
                        // encarecer su talla → se deja bajo (1.5) y emergen HERBÍVOROS GRANDES. Si se subiera la
                        // banda solo no bastaría; juntos dan herb~carn de tamaño. 0 = desactivado. Ver organism.js.
    k_speed: 1.6,       // (legado; en F-B la velocidad emerge de la morfología, no de este gen)
    k_sense: 0.3,
    k_metab: 0.6,
    k_temp: 1.9,        // coste extra por desviarse del óptimo térmico (0 = sin selección térmica)
    k_sizeTemp: 0,      // (desactivado) nicho de tamaño por clima: inefectivo porque los organismos NADAN y
                        // cruzan zonas frías/cálidas → la ventaja por celda se promedia. Se deja el gancho por si
                        // en el futuro los bichos buscan activamente su clima (entonces sí crearía nichos de tamaño).
    k_app: 1.0,         // coste de MANTENER/arrastrar apéndices grandes (por su área, aunque esté quieto)
    k_appN: 0.02,       // coste fijo POR apéndice: MUY suave → el nº de apéndices es casi NEUTRO y deriva
                        // libre por todo el rango (1..8) en vez de converger a un óptimo. Diversidad por deriva.
    k_appGraze: 0.0,    // (desactivado) atar el pasto al nº empujaba a los herbívoros —mayoría— a "muchos"
                        // → la población entera se veía bushy. Mejor dejar el nº libre (neutro) → variedad real.
    k_body: 0.10,       // coste basal extra por MASA corporal (0.22→0.10: alargarse compensa → gusanos largos.
                        // Solo afecta a cuerpos con masa extra; los simples no lo pagan).
    k_lure: 0.13,       // coste de mantener el SEÑUELO bioluminiscente (∝ prominencia). El carnívoro lo recupera
                        // cazando (alcance extendido); el herbívoro solo paga → los señuelos↔dieta se separan por selección.
    k_graze: 0.30,      // cuánto más PASTA un cuerpo con más masa (ata la complejidad al nicho herbívoro)
                        // Sin esto el ingreso es independiente del tamaño y el coste sube con él → herbívoros
                        // siempre al mínimo. Con esto, ser grande deja de ser puro coste → tamaños variados.
    k_effort: 1.59,     // (búsqueda cand#2) coste extra de moverse según el esfuerzo (gen speed) → nadar fuerte es caro
    moveCost: 0.015,    // coef. del coste de nado ∝ velocidad² (frena la carrera de velocidad)
    E_max_base: 71,     // (búsqueda cand#2) E_max = E_max_base * (0.5 + size)
    reproBase: 0.9,     // (UI) coste base de una cría (× E_max_base), independiente del tamaño
    reproSizeCost: 1.0, // (UI) ⭐ cuánto MÁS cuesta criar al ser grande (compromiso r/K por talla). Subido
                        // 0.18→1.0 (medido a 30k×6 semillas): los grandes (carnívoros) crían más lento por
                        // ENERGÍA → no sobre-disparan a la presa → carnívoros 3/6→5/6 Y diversidad de tamaño
                        // 0.19→0.23. Freno energético (no temporal) → amortigua sin impedir el reemplazo (a
                        // diferencia de carnSlow, que los extinguía). Óptimo en campana: 1.3 ya colapsa la talla.
    preyGain: 0.90,     // (búsqueda cand#2) energía aprovechada de la presa
    corpseReturn: 0.5,
  },
  // ---- Locomoción emergente (F-B): la FORMA produce el movimiento --------------------
  // Física que define el programador; los genes de morfología solo la alimentan. La
  // velocidad y el giro REALES salen de aquí (el gen 'speed' pasa a ser 'esfuerzo').
  loco: {
    kThrust: 2.5,       // calibra la velocidad-capacidad típica (bajado 3.2→2.5 → movimiento más calmado)
    waveFloor: 0.3,     // empuje mínimo sin ondular (un apéndice quieto empuja poco)
    symBase: 0.4,       // empuje útil hacia delante mínimo (asimétrico desvía empuje a girar)
    streamBase: 1.0,    // arrastre base del cuerpo
    streamGain: 0.5,    // cuánto reduce el arrastre la elongación (hidrodinámica)
    effortFloor: 0.2,   // esfuerzo mínimo (el gen 'speed' es el acelerador 0..1)
    vMin: 0.15,         // suelo de velocidad-capacidad (ningún cuerpo queda 100% inmóvil)
    vMax: 3.0,          // techo de seguridad (bajado 3.5→3.0 acorde al ritmo más calmado)
    turnBase: 0.18,     // agilidad de giro base (fracción que la dirección rota hacia el deseo/tick)
    turnAsym: 0.35,     // la asimetría (m_sym bajo) mejora el giro
    turnSize: 0.15,     // los cuerpos grandes giran peor (inercia)
    turnElong: 0.08,    // los cuerpos elongados giran peor (menos maniobrables)
    turnMin: 0.08,      // giro mínimo (nadie queda totalmente incapaz de virar)
    // Complejidad corporal (F-C funcional): segmentos y módulos suman empuje, arrastre y peor giro.
    // Todos valen 0 de efecto para un cuerpo SIMPLE (1 segmento, sin módulos).
    // TRADE-OFF: la complejidad cuesta VELOCIDAD/AGILIDAD (arrastre>empuje) pero da depósito de
    // energía. Así los estilos rápidos (huir/perseguir) se quedan simples y los lentos
    // (pastar/emboscar) se complejizan → nichos distintos. NO da velocidad → no hay carrera presa-depredador.
    segThrust: 0.34,    // empuje de las patas de los segmentos ≈ segDrag (0.22) → alargarse es casi NEUTRO para el
                        // nado (sin carrera de velocidad que rompa la ecología); los gusanos persisten por deriva
    modThrust: 0.3,     // empuje extra de los apéndices de los módulos
    segDrag: 0.22,      // arrastre extra por segmentos (0.4→0.22 → segmentarse penaliza poco el nado → gusanos viables)
    modDrag: 0.6,       // arrastre extra por módulos
    segTurn: 0.03,      // cada segmento extra empeora el giro (bajado 0.06→0.03 → gusanos largos no tan penalizados)
    appTurn: 0.01,      // cada apéndice mejora un poco el giro (flavor menor; la agilidad del cazador
                        // viene sobre todo de tamaño/asimetría → el nº de apéndices NO está acoplado a cazar)
  },
  // ---- Visión emergente y direccional (F-D): los ojos producen la visión ----------------
  // El gen `sense` fija la INVERSIÓN visual (alcance base + coste, ya en energy). El gen
  // `e_fov` reparte ese presupuesto entre ALCANCE y ÁNGULO, conservando el área visual:
  // estrecho-frontal → ve lejos pero solo delante (cazador); ancho → panorámica corta (presa).
  vision: {
    halfFovMin: 0.35,   // semiángulo mínimo (rad ≈ 20°): cono estrecho frontal
    halfFovMax: 2.70,   // semiángulo máximo (rad ≈ 155°): casi panorámico
    fovRef: 3.05,       // FOV de referencia (rad) para conservar área (r = base·(fovRef/fov)^rangeExp)
    rangeExp: 0.4,      // exponente del reparto alcance↔ángulo (0.5 = conserva área; <0.5 = ventaja frontal más suave)
  },
  diet: {
    omniPenalty: 0.28, // (búsqueda cand#2) más suave: el eje dieta es más "escalable" (omnívoros viables)
  },
  // ---- Carroñeo: red de seguridad para los carnívoros en los VALLES de la oscilación --------------
  // Cuando un organismo muere de hambre o vejez deja un CADÁVER (energía de carroña) en su celda; los
  // carnívoros pueden comerlo (escala con effCarn). En las hambrunas (cuando las presas vivas se hunden)
  // hay muchas muertes → carroña abundante → los carnívoros sobreviven el valle y rebrotan. Es energía
  // NUEVA pero acotada por la tasa de muertes y la pudrición (decay). Como la diversidad de TAMAÑO emerge
  // de tener depredadores, sostener a los carnívoros sostiene AMBOS objetivos. NO toca la caza de presas vivas.
  carrion: {
    enabled: false,     // (UI) DESACTIVADO por defecto: medido que NO enhebra la aguja — suave = inútil;
                        // fuerte = los carnívoros viven de cadáveres en bucle (monocultivo carroñero, presas
                        // casi extintas, diversidad de tamaño colapsada). Se deja en el lab para experimentar.
    yield: 0.3,         // energía de carroña que deja un cadáver = yield × E_max del difunto (≈ su biomasa)
    decay: 0.01,        // pudrición por tick (la carroña se descompone → ventana limitada para aprovecharla)
    absRate: 0.3,       // fracción de la carroña de la celda que un carnívoro absorbe/tick (× effCarn)
    maxPerCell: 80,     // tope de carroña acumulada por celda (evita "mataderos" infinitos)
  },
  // ---- Refugio de presa: el estabilizador clásico de Lotka-Volterra (Gause/Huffaker) ----------------
  // Las zonas de VEGETACIÓN MÁS DENSA actúan como cobertura: una presa que está en una celda-refugio NO
  // es cazable (el depredador no la percibe ni la alcanza). Como ahí también hay comida, las presas se
  // congregan y crían a salvo → SIEMPRE queda un suelo de presas; cuando agotan el pasto del refugio salen
  // a forrajear y se exponen → alimentan a los carnívoros. Esto rompe el boom-bust (que en un mundo
  // homogéneo y bien mezclado lleva a la extinción del depredador) sin desacoplar al carnívoro de la presa
  // viva (a diferencia del carroñeo) → preserva la estructura depredador-presa y, con ella, la diversidad
  // de tamaño. Es FÍSICA del mundo (no conducta): la presa no "sabe" ir al refugio, simplemente las que
  // están ahí sobreviven. frac requiere volver a Sembrar (reconstruye el mapa de refugios).
  refuge: {
    enabled: true,      // (UI)
    frac: 0.18,         // (UI ↻) fracción del mundo que es refugio (las celdas de mayor capacidad). Requiere Sembrar.
  },
  color: {
    // Cuánto penaliza tener un color desajustado con la luz local (0 = neutral, 1 = máx).
    // Fase 1: reduce la absorción de recurso. Fase 2: reducirá también el camuflaje.
    matchPenalty: 0.6,
  },
  age: {
    mature: 300,
    mortality: 0.0005,
    scale: 500,
  },
  repro: {
    cooldown: 60,
    carnSlow: 0,        // (UI) DESACTIVADO: medido que EMPEORA (3/6→0/6) — los carnívoros de esta sim no
                        // sobre-disparan, son marginales y apenas se reponen; frenar su cría los extingue.
                        // Se deja el lever en el lab. K-ESTRATEGIA del depredador: la dieta carnívora ALARGA el enfriamiento de cría
                        // → cooldown_efectivo = cooldown · (1 + carnSlow · dieta). Un carnívoro puro (dieta=1)
                        // cría (1+carnSlow)× más lento que un herbívoro. Imita que los depredadores reales son
                        // K-estrategas (numérica lenta) → NO pueden sobre-disparar a la presa → amortigua el
                        // boom-bust que extingue a los carnívoros. La dieta sigue siendo un gen que evoluciona.
    sexual: true,            // Fase 4: reproducción sexual (recombinación de dos padres) ACTIVA.
    asexual: true,           // (búsqueda cand#2: clave para sostener carnívoros) ¿permitir reproducción ASEXUAL (clon) cuando NO hay pareja compatible cerca?
                             // false (def.): sin pareja → no hay cría (mala suerte) → encontrar pareja es una
                             // presión selectiva real (favorece agruparse, dispersarse poco, ornamentos…).
                             // true: si no halla pareja, se clona a sí mismo con mutación (como antes).
                             // (Ajustable desde el modo Laboratorio.)
    speciesGenThreshold: 0.15, // distancia genética máx. para cruzarse = misma "especie". Más allá → aislados.
                               // Bajado (0.25→0.15) al incluir la FORMA en la distancia: clusters más finos y
                               // COHESIVOS → los miembros de una especie comparten plan corporal (se parecen).
    mateRadius: 70,          // radio (px) en el que se busca pareja compatible al reproducirse (subido 55→70 para
                             // compensar la menor densidad: que la cría no falle al haber menos parejas cerca)
  },
  mut: {
    rate: 0.034,        // (búsqueda cand#2) (UI)
    sigma: 0.05,        // (UI)
    bigRate: 0.002,
    bigSigmaMult: 5,
    // Genes de APARIENCIA (decorativos, ver genome.DECOR): mutan MUCHO más para que dentro de una
    // misma especie haya variedad visible de apéndices/forma/color (morfos), no clones. Como no
    // afectan a la física ni cuentan en la distancia genética, esta mutación alta no desestabiliza
    // ni la ecología ni las especies.
    decorRate: 0.05,    // (bajado 0.12→0.05) MENOS mutabilidad decorativa → el colorido/señuelo es COHERENTE
                        // dentro de una especie/run (no "circo de payasos"); la diversidad cromática emerge
                        // despacio y, sobre todo, ENTRE runs distintas (cada ejecución, una paleta propia).
    decorSigma: 0.10,
    // Genes de FORMA (cuerpo + apéndices, ver genome.FORM): mutación INTERMEDIA (> base, < decor). Cuentan
    // para la especie, así que esto controla a qué ritmo las formas EXPLORAN y las especies se diversifican
    // en planes corporales distintos. La cohesión intra-especie la mantienen el apareamiento + el umbral.
    formRate: 0.08,
    formSigma: 0.11,
    // MUTABILIDAD EVOLUTIVA (gen `mut_rate`): si está activa, cada organismo lleva su propia mutabilidad como
    // gen, que escala (×mMin..mMax) la prob. de mutación que aplica al copiar su genoma. Evolución de la
    // evolucionabilidad: emerge mutabilidad baja en entornos estables y alta cuando el ambiente cambia. El
    // suelo (mMin>0) evita que un linaje se "congele" sin poder volver a adaptarse; el techo (mMax) evita la
    // catástrofe de error. (UI) Off por defecto: con off, M=1 y el gen solo deriva neutro (idéntico a antes).
    evolvable: false,
    mMin: 0.3,          // multiplicador mínimo de mutabilidad (nunca 0 → nadie deja de evolucionar del todo)
    mMax: 3.0,          // multiplicador máximo (suave: base 0.03→0.09/gen; la selección poda a los hipermutadores)
  },
  combat: {
    enabled: true,      // Fase 2: combate activo.
    sizeAdvantage: 0.82, // (tune A/T2)
    handlingTime: 31,   // (búsqueda cand#2) ticks de enfriamiento tras una captura (tiempo de manejo/digestión).
                        // Subido al añadir visión direccional: satura la tasa de caza → amortigua
                        // las oscilaciones depredador-presa para que el valle no toque cero.
    // Reglas de quién puede cazar a quién (física trófica, no conducta):
    //  1) la presa debe estar en la BANDA DE TAMAÑO del depredador (ver preyBand*), y
    //  2) estar claramente MÁS abajo en la dieta (`dietMargin`) → es presa real, no un igual.
    dietMargin: 0.15,   // (búsqueda cand#2)
    // ---- DEPREDACIÓN SELECTIVA POR TAMAÑO (mecanismo estructural para nichos de talla) ----
    // Un depredador solo caza presa cuyo radio sea una FRACCIÓN de su propio radio dentro de [preyBandLo, preyBandHi]:
    // lo MUY pequeño no compensa (coste de manejo) y lo demasiado igualado (>Hi) es inviable. Antes era "cualquier
    // presa menor" (Hi=1, Lo=0) → todos los carnívoros comían de todo → convergían a grandes y aplastaban toda talla
    // de presa. Con la banda: distintas tallas de carnívoro cazan distintas tallas de presa (NICHOS) → coexisten varios
    // tamaños en AMBAS dietas, y la talla de presa sin depredador de banda adecuada queda a salvo (refugio por tamaño).
    preyBandLo: 0.30,   // radio_presa / radio_depredador MÍNIMO cazable
    preyBandHi: 1.0,    // MÁXIMO ratio presa/depredador ATACABLE. A 1.0 el depredador caza presa HASTA de su propio
                        // tamaño: cierra el "refugio por tamaño" (la presa no escapa creciendo → no se extinguen los
                        // carnívoros) Y deja depredador≈presa → emergen CARNÍVOROS y HERBÍVOROS de TAMAÑO SIMILAR
                        // (medido con k_sizeHerb 1.5: herb≈carn≈4.1, coexist ~4/5). Subirlo (1.8) da carnívoros grandes
                        // / herbívoros pequeños pero más robusto; bajarlo (<0.9) reabre el refugio → carnívoros extintos.
    // NOTA (experimento descartado): se probó que un ataque fallido NO matara al cazador (riesgo residual
    // ligado al tamaño). Resultado MEDIDO: los carnívoros sobre-disparan → arrasan las presas → colapso
    // y extinción de todos. El riesgo de muerte al fallar es un freno denso-dependiente ESENCIAL para la
    // estabilidad depredador-presa. La caza ya es rentable (×5 de superávit por presa); el cuello de
    // botella real es sobrevivir los VALLES de la oscilación, no el riesgo por ataque.
    lureReach: 0.85,    // SEÑUELO como herramienta de caza (anglerfish): extiende el radio de captura del depredador
                        // ∝ prominencia del señuelo → cazar con señuelo largo/grande rinde → los carnívoros lo evolucionan.
  },
  // ---- Física de cuerpos: separación suave (no-solape blando) ----------------------
  // Tras mover, los cuerpos que se TOCAN se empujan suavemente (proporcional al solape) para no
  // apilarse. Es FÍSICA del mundo (post-proceso tras la decisión del cerebro), no una conducta:
  // no entra en la percepción ni en el deseo de movimiento → no contamina la emergencia.
  // EXCLUYE los pares depredador-presa: el cazador necesita solapar a la presa para atacar
  // (si se repeliera, la depredación moriría). Usa un hash de colisión FINO propio (ver world.js).
  physics: {
    separation: {
      enabled: true,    // (UI) ON por defecto: los cuerpos no se apilan. Apágalo para comparar en vivo.
      strength: 0.6,    // fracción del "solape efectivo" que se corrige por tick (suave; <1 = no rígido → sin jitter)
      margin: 10,       // ESPACIO PERSONAL extra (px) sobre la suma de radios: los cuerpos se repelen cuando la
                        // distancia < radio_i + radio_j + margin → mantienen un HUECO entre ellos, no solo "sin
                        // solapar". Muy por debajo del mateRadius (70px) → NO afecta al apareamiento. Los pares
                        // depredador-presa están excluidos de la separación → tampoco afecta a la caza.
      cell: 40,         // tamaño de celda del hash de colisión: debe ser ≥ 2·radio_max + margin (=28) para que la
                        // vecindad 3×3 capture cualquier par dentro del radio de repulsión.
      maxPush: 2.0,     // tope de desplazamiento por tick (px): evita "explosiones" en multitudes muy densas
    },
  },
  sim: {
    targetTPS: 20,      // (UI) ticks por SEGUNDO objetivo (arranque tranquilo). Desacoplado de los fps:
                        // el motor ejecuta los ticks que toquen según el tiempo real.
                        // 0 = pausa.
    frameBudgetMs: 40,  // máx. ms simulando por frame. Si mantener targetTPS exige más,
                        // bajan los fps en vez de congelarse (nunca bloquea el render).
    maxBudgetMs: 250,   // modo "max": simula a tope durante estos ms por frame
    brain: 'neural',    // cerebro neuronal RECURRENTE (pesos = genoma, sembrado competente) por DEFECTO:
                        // el comportamiento emerge/evoluciona. ('reactive' sigue en el código pero ya no
                        // se expone en la UI.) Brilla especialmente con "Comida en parches" alta.
  },
  render: {
    trails: false,         // (UI)
    glow: true,            // (UI)
    showResourceField: true, // (UI) hierba/vegetación (el fondo es siempre el mapa térmico)
    ambiance: 'abyssal',   // (UI) ESCENARIO POR DEFECTO: 'abyssal' = fondo oscuro atmosférico (regiones + comida
                           // fosforescente) + glow reforzado → ecosistema bioluminiscente contemplativo.
                           // 'meadow' = pradera serena (hierba+flores tenues). Solo afecta al render (no a la sim).
                           // (Escenario fijo en config; sin toggle de UI por ahora.)
    dprCap: 2,
    quality: 'high',          // (UI) 'high' | 'low'. BAJA = DPR 1, sin bloom, menos nieve, sustrato simple y LOD agresivo
                              // → mejora mucho el rendimiento en móvil. Se autodetecta a 'low' en táctil/pantalla pequeña.
    narrowBreakpoint: 700,
    grassDensity: 6800,       // nº de matojos de hierba repartidos por el mundo
    grassSpriteCount: 22,     // variedad de formas de matojo precalculadas al arrancar
    grassRefreshFrames: 15,   // cada cuántos frames se redibuja la capa de hierba
    flowerSpriteCount: 12,    // variedad de flores precalculadas
    flowerFrac: 0.45,         // fracción de matas que pueden florecer (bajado 0.8→0.45 → flores como ACENTO,
                              // no alfombra → la pradera respira y las criaturas son el foco)
    flowerThreshold: 0.5,     // solo florecen las matas con vegetación por encima de esto (subido → menos flores)
  },

  // ---- Rangos de expresión de genes (lerp desde [0,1]) ----
  // Esta es la frontera "lo que define el programador" ↔ "lo que evoluciona".
  expr: {
    size:      { min: 1.7, max: 9 },    // → radio px (encogido: solo afecta a render/contacto, NO a la energía;
                                        // bichos un poco menores → mundo se ve más amplio, menos "hormiguero")
    speed:     { min: 0.2, max: 2.0 },  // → v_max
    sense:     { min: 10,  max: 80 },   // → radio visión px
    repro_thr: { min: 0.5, max: 0.95 }, // → fracción E_max
    invest:    { min: 0.2, max: 0.6 },  // → fracción E_max a la cría
    wMax:      2,                        // w_food/w_prey/w_flee → factor lerp(0, 2)
  },
};
