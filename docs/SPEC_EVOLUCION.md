# Especificación del motor evolutivo — "Zenote"

Este documento define las reglas exactas de la simulación. Es la **fuente de verdad**
sobre genética, mutación y selección. El motor debe implementar esto fielmente; la
parte visual es secundaria al cumplimiento de estas reglas.

> **Modelo v2.0 (jun 2026).** El cuerpo dejó de ser categorías hechas a mano
> (cabeza/segmentos/apéndices) y pasó a ser un **genoma generativo por nodos**: forma y
> locomoción EMERGEN de la selección. Si encuentras menciones a `m_app`, `m_seg`, `mod*`,
> `s_*` o `maxAlive` en código o notas viejas, son del modelo
> anterior. El estado vivo está en `ESTADO.md` (foto) y `CHANGELOG.md` (hitos); el porqué histórico de v2.0, en
> `archivo/AUDIT_EVOLUCION.md` (auditoría cerrada).

## 0. Filosofía de diseño

No replicamos la biología terrestre. Construimos un ecosistema artificial mínimo pero
suficiente para que emerjan, **sin estar programados explícitamente**:

- Especiación (divergencia de poblaciones en grupos genéticamente distintos).
- Carreras armamentísticas depredador-presa.
- Estrategias de vida divergentes (rápido y numeroso vs. lento y eficiente — eje r/K).
- Adaptación a gradientes ambientales (zonas frías/calientes, ricas/pobres, luz).
- **Forma y modo de nadar** (cuerpos hidrodinámicos, colas que propulsan, aletas que reman).

Regla irrenunciable: **nada de comportamiento ni de morfología "buena" debe estar codificado
a mano.** Toda conducta y toda forma provienen de un genoma sujeto a herencia, mutación y
selección. El programador define la *física* del mundo y la *expresión* de los genes; nunca
las estrategias o las formas "buenas". Esas deben emerger.

## 1. El mundo

> **Unidades (u) — el motor es independiente de la resolución de dibujo.** El motor trabaja en **unidades de mundo
> (u)**, NO en píxeles de pantalla. La resolución (DPR, `render.maxInternalPx`, backing store, CSS) no entra en NINGÚN
> cálculo lógico ni en el tamaño *aparente*: `aparente_CSS = radio · (viewport / world.size) · zoom` → la resolución se
> **cancela** (solo cambia la NITIDEZ, nunca QUÉ se simula ni cómo de grande se ve). El tamaño absoluto en u es un
> **gauge libre**: escalar TODAS las longitudes (`world`, `expr.size`, `sense`, `mateRadius`, `vMin/vMax`) por k y
> `energy.moveCost` por 1/k² da una simulación y una apariencia idénticas → solo importan los **ratios** (radio/mundo =
> densidad, sense/mundo, etc.). La biomasa también es adimensional en px (`sizeMass=(radio/refRadius)^massExp`, normalizada).
> Catálogo dimensional completo en la cabecera de `src/config.js`.

- Rejilla continua (coordenadas float), **siempre un toro** (bordes envueltos) para
  evitar artefactos de borde. El mundo es **CUADRADO**: un solo valor `world.size` (lado en u). El **ecosistema ESCALA**
  con `world.size` (**Modelo A**): lo EXTENSIVO (`matterBudget`, rejilla `gridCols/Rows`) crece con el ÁREA a densidad y
  dinámica constantes; lo INTENSIVO (talla, sensores, velocidades, tasas, costes) no escala. El pool de agentes es un **tope
  duro fijo** (`pop.maxAgentsCeiling`, por rendimiento) que NO escala con el mundo. El **sembrado inicial** (`pop.initial`)
  tampoco escala: nº FIJO de fundadores en un **círculo CENTRAL de densidad fija** (`pop.seedDensity`) → colonizan hacia fuera.
- **Recurso difuso** ("energía solar/química") en un campo escalar de baja resolución
  (`resource.gridCols`×`gridRows`). Capacidad por celda según `resource.gradient`
  (`perlin` | `center` | `uniform`). Se acumula hasta `R_max` por celda.
- **Rebrote** (`world.closedRegen`, fotosíntesis N→pasto) por celda. Con `resource.patchiness > 0` el rebrote es **logístico +
  difusión de semilla** → los **parches de recurso emergen y migran** del juego pastoreo↔rebrote
  (no son fijos). `grazeRefuge` reserva una fracción intocable por celda (evita el sobrepastoreo letal).
- **Refugio de presa = COBERTURA graduada** (`refuge`, #7): no hay zona binaria "no cazable". La **vegetación
  VIVA local** (el propio campo de recurso) es escondite: en el combate (§3.1) la presa **escapa** con
  probabilidad `refuge.strength · vegetación_de_su_celda`. Como el pasto se come y rebrota, la cobertura es
  **espacialmente dinámica** → refugios que migran solos (Huffaker emergente): la presa está a salvo en parches
  densos y expuesta en los claros pastados. Estabilizador Lotka-Volterra (la presa nunca llega a cero) sin la
  muleta del interruptor. Es física del mundo, no conducta.
- **Mundo CERRADO en materia** (la "pecera", único escenario): la **materia total es constante** y circula
  (nutriente↔pasto↔organismos↔carroña), con capacidad de carga endógena. Mecánica completa en **§3ter**.

## 2. El organismo

Cada agente tiene **estado dinámico** (fenotipo que cambia en vida) y un **genoma** (fijo en
vida, heredado con mutación).

### Estado dinámico
- posición (x, y), velocidad (vx, vy), energía `E` (muere si `E ≤ 0`), edad, cooldown de cría.
- estado oculto del cerebro recurrente (memoria entre ticks, ver §cerebro).
- `lineageId` (id del fundador ancestral, **heredado sin mutación** → ascendencia auditable) y
  `generation`. No afectan a la física; son trazadores de linaje, independientes del color.

### Genoma — vector de floats en `[0,1]` (SoA: `Float32Array`; nº total = `NUM_GENES` en `genome.js`)

El genoma se divide en cuatro bloques contiguos (orden en `genome.js`):

| Bloque | Nº | Genes |
|--------|----|-------|
| **Ecología / fisiología** | 11 | `size`, `speed`(musculatura), `sense`, `metab`, `diet`, `scav`(caza↔carroña), `repro_thr`, `invest`, `hue`, `mature_age`, `senescence` |
| **Identidad / display** | 8 | `e_fov`, `orn`, `pref`, `c_lum`, `o_len`, `o_bulb`, `o_hue`, `o_num` |
| **Cuerpo por NODOS** | 80 | 8 nodos × 10 campos (ver §2bis) |
| **Cerebro neuronal** | 109 | pesos de la RNN (ver §cerebro; 11 entradas, 4 salidas) |

**Genes de ecología/fisiología:**

| Gen | Expresión / efecto |
|-----|--------------------|
| `size` | radio = `lerp(expr.size)` px → **masa alométrica** (§3): mayor tamaño → más `E_max` (almacén ∝ masa) y ventaja en combate, pero más coste metabólico absoluto (∝ masa^¾) y peor giro. **No afecta a la velocidad** (ver §2bis). |
| `speed` | (modelo de fuerza, por defecto) **MUSCULATURA**: inversión en capacidad de empuje → escala `vmax` (`loco.muscleMin/Max`) y cuesta basal mantenerla (`energy.k_muscle`); el cerebro decide cuánto USA → músculo sin usar = caro (r/K), §2bis. Modelo viejo: ESFUERZO de nado fijo (acelerador 0..1) que modula amplitud y coste. |
| `sense` | inversión visual → alcance base de visión + coste (`k_sense`). El reparto alcance↔ángulo lo hace `e_fov` (§2ter). |
| `metab` | escala a la vez el ritmo de alimentación y el coste basal (`k_metab`). Alto = come y rinde más pero quema más. Trade-off, sin "mejor". |
| `diet` | 0 = herbívoro puro (come del campo), 1 = carnívoro puro (caza). Intermedio = omnívoro penalizado (`omniPenalty`). |
| `scav` | **eje caza↔carroña** dentro de la dieta carnívora: reparte la capacidad comecarne entre CAZAR presa viva (`effHunt`) y CARROÑEAR cadáveres (`effScav`), con `scavPenalty` al generalista. Mecánica completa en §3bis. |
| `repro_thr` | umbral de energía para criar: `lerp(expr.repro_thr)` de la referencia (§4). |
| `invest` | energía transferida a cada cría: `lerp(expr.invest)` de la referencia. |
| `hue` | tono del organismo (su color en pantalla). Gen **neutro** (no afecta a la física): deriva libre y se hereda → traza el linaje a ojo. Muta como cualquier gen. |
| `mature_age` | **historia de vida (#12)**: edad de madurez `Tm = lerp(expr.mature_age)`. Gatea la reproducción (no se cría antes de `Tm`) **e** inicia la senescencia (no hay muerte por vejez antes de `Tm`). Madurar pronto = criar antes (r) pero envejecer antes; tarde = retrasar la cría pero vivir más (K). |
| `senescence` | **historia de vida (#12)**: ritmo de vida `lifeFast ∈ [0,1]`. Escala la pendiente de la mortalidad por vejez (`senesMult`, ver §3) y, por **disposable soma**, el coste basal: ser longevo (`lifeFast` bajo) cuesta más mantenerse. Crea el eje r/K vivir-rápido↔longevo sin degenerar. |

**Genes de identidad / display:** luminosidad/glow (`c_lum`) y color/nº del señuelo
(`o_hue`, `o_num`) son **NEUTRALES** (solo render, derivan por linaje → identidad visual de especie).
**Excluidos de la distancia genética** (`o_len`/`o_bulb` también, aunque son funcionales — ver abajo). Funcionales en este bloque:
- `e_fov` = **campo de visión** (reparte el presupuesto de `sense` entre alcance y ángulo, §2ter).
- `orn`/`pref` = **selección sexual** PURA (`orn` = cuánto exhibe el ornamento; `pref` = ornamento
  preferido en la pareja). Dirigen la elección de pareja → runaway de Fisher (§4). Ya **no** tocan el señuelo.
- `o_len`/`o_bulb` = **señuelo de emboscada** (órgano de caza con genética propia, §3): tamaño y bulbo del señuelo.
  Excluidos de la distancia (solo lo expresan los pocos cazadores con `o_len > lureGate`; contarlos metería ruido en la mayoría).

### Cerebro (decisión) — RNN neuronal por defecto
La decisión la toma una **red neuronal recurrente diminuta (Elman)** cuyos **pesos SON genes**.
Es el **único** modo de conducta (se retiró la regla reactiva y sus genes `w_*`, backlog #9):

- Topología `BRAIN = {I, H, O}` y nº de pesos `BRAIN_W` = I·H + H·H + H + H·O + O (valores en `genome.js`):
  entrada→oculta, **oculta→oculta (memoria)**, sesgos ocultos, oculta→salida, sesgos salida.
  El estado oculto **persiste entre ticks** (memoria → búsqueda/persistencia emergente).
- **Entradas (11):** gradiente de comida (x,y), dirección a la presa (x,y), dirección a la amenaza (x,y),
  energía, **cobertura local** (vegetación de su celda → uso táctico del refugio), **talla relativa de la presa**
  (evitar presa grande), **escapabilidad de la presa** (cobertura de la celda DE la presa → no atacar a la que
  escapará) y **velocidad propia** (#10, propiocepción → cierra el lazo del control de velocidad, §2bis). Las entradas
  no cableadas en `seedBrain` (energía, cobertura, talla/escapabilidad de presa, velocidad propia) arrancan a peso ~0 → su uso EMERGE, no cableado.
  **Salidas (4):** DIRECCIÓN de empuje (dx,dy, se normaliza → rumbo) + **impulso de ataque** `a = (tanh(out₂)+1)/2 ∈ [0,1]` +
  **ESFUERZO** `throttle = (tanh(out₃)+1)/2 ∈ [0,1]`, **independiente de la dirección** → el cerebro decide cuánta fuerza poner
  (frenar/parar, ir despacio o esprintar), no acoplado a "hacia dónde". Sembrado a ~0.7 (competente); la modulación EMERGE.
  Pesos = `(gen−0.5)·scale`.
- Nada de estrategia programada: pastar/cazar/huir **y atacar/agredir** emergen **100% de los pesos
  seleccionados** (el ataque ya no es el gen `aggro`, retirado en #10 → ver §3.1). El "ceño" feroz del render
  refleja el impulso de ataque suavizado: los depredadores parecen feroces porque **evolucionan a atacar**.
- Los pesos se **excluyen de la distancia genética** (no contaminan las especies). Un fundador se siembra con
  una conducta competente de partida y la evolución la **afina**; los carnívoros fundadores se siembran con un
  sesgo de ataque positivo (cazan en contacto desde el arranque).

## 2bis. Locomoción y forma emergentes — el cuerpo GENERATIVO por nodos

La velocidad, el giro y la forma **no son genes directos**: emergen de un **grafo de nodos**. El
programador define la física (empuje vs. arrastre por orientación); la selección esculpe el grafo.
La frontera vive en `bodyplan.js` (geometría → escalares) y `organism.js` (escalares → fenotipo),
cacheada al nacer. Todo en unidades del radio de cabeza (`r` se cancela: empuje y arrastre escalan
igual con el tamaño → **encoger no regala velocidad**; clave para la coexistencia presa-depredador).

### El grafo de nodos (80 genes = 8 nodos × 10 campos)
Una sola primitiva: el **nodo**. `NODE_COUNT = 8`. Campos por nodo:
`present`, `parent`, `size`, `aspect`, `angle`, `attach`, `osc_amp`, `osc_phase`, `tipShape`, `gaitMode`.

- **Nodo 0 = raíz (cabeza)**, siempre presente. Su `aspect` define el ancho del cuerpo
  (redondo → ancho con masa+arrastre; fino → estilizado). Propulsa **DÉBIL** (`loco.headThrust`, bajo): la cabeza
  es sobre todo **carga** (masa + arrastre), NO el motor. → nadar bien **exige propulsores** (cola trasera con
  `gait≈+1`, aletas laterales) → las colas/aletas **emergen por selección** (más realista: un blob liso no se
  autopropulsa). `headThrust=1` recupera el régimen "cabeza nadadora" previo.
- **Nodos 1..7 opcionales, con PRESENCIA GRADUADA.** `present < 0.4` → ausente; en `[0.4, 0.6]` el nodo
  **aparece de forma continua** (peso `w = 0→1` que **escala su área** → masa, arrastre y empuje en
  proporción); `≥ 0.6` → pleno. Convierte el "acantilado" de añadir un nodo (antes umbral duro en 0.5) en una
  **rampa**: la morfología puede evolucionar y exaptar gradualmente (más diversidad de cuerpos). El render usa
  la **misma banda** → el nodo **crece visualmente** al aparecer (no es un cambio "oculto"). Cada nodo:
  - `aspect` 0 = **lóbulo/segmento** redondo (aporta **masa + arrastre**, `_ar`); 1 = **tentáculo/aleta**
    fino y largo (aporta **superficie hidrodinámica** `_limbAr`, sin masa). El continuo lóbulo↔tentáculo
    es una sola primitiva — no hay "tipos" de pieza.
  - `angle` → orientación real `emit = angle·π` ∈ [0,π] (0 = al frente, π = atrás del eje de nado).
  - Un nodo **lateral** (`min(emit, π−emit) > EPS_AXIS`, 0.35) se cuenta **espejado** (par bilateral ×2);
    uno **medial** va solo. La **simetría bilateral EMERGE** del ángulo, no se impone.
  - `parent`/`attach` definen la topología (de quién cuelga y dónde). `osc_amp` = cuánto ondula este
    nodo. `osc_phase` = fase de su oscilación (**funcional**: coordinación de marcha, ver más abajo).
  - `tipShape` (Capa 1) = **silueta** base↔punta. `<0.5` **afila** (púa/garra/tentáculo), `≈0.5` elipse,
    `>0.5` **abre** (aleta/paleta/ala). Compromiso físico honesto, **NEUTRO en 0.5**: abrir → +empuje y
    +arrastre (paleta que empuja más agua); afilar → −empuje, −arrastre (streamlining) y **+alcance** (alarga
    el nodo). Coeficientes `loco.tipThrust/tipDrag/tipReach`. El render dibuja la silueta real (no es solo cosmético).
  - `gaitMode` (Capa 3) = **modo de propulsión**. `0` = **ondular** (el nodo va en la onda viajera del cuerpo,
    anguila; crucero eficiente); `1` = **aletear/batir** (golpe activo). Aletear da **más empuje en nodos
    LATERALES** (`effFlap = 1 + flapGain·gaitMode·sin²(emit)` → ponderado a lo lateral: las aletas/remos baten, las
    colas mediales ondulan) pero **cuesta más arrastre** (golpe de recuperación, `×(1+flapDrag·gaitMode)`). NEUTRO
    en 0. Crea el eje **crucero eficiente ↔ ráfaga/maniobra potente**; una aleta abierta (`tipShape`) que además
    bate = un ala. Coeficientes `loco.flapGain/flapDrag`. (El render anima el batido: ver VISUAL.)

### Física emergente (`bodyplan.js`)
- **Empuje DIRECCIONAL por nodo:** `gait = −cos(emit) + paddleEff·sin²(emit)`.
  → atrás (π) = **+1** (propulsa hacia delante), frente (0) = **−1** (frena), lateral (π/2) = **+paddleEff**
  (rema). Un cuerpo "ilógico" (mucha superficie frontal) tiene empuje **neto negativo**.
- **Amplitud de oscilación por nodo:** `amp = (oscFloor + (1−oscFloor)·osc_amp) · effort`. En el modelo de fuerza
  `effort = 1` (capacidad a tope; el esfuerzo vivo lo decide el cerebro, abajo); en el viejo `effort = effortFloor + (1−effortFloor)·speed`.
- **Empuje total con COHERENCIA DE FASE:** cada nodo propulsor aporta un **fasor** `c_k·e^{iφ_k}`, con
  `c_k = (ar·eff + limbAr·limbThrust)·amp·gait` y `φ_k = osc_phase·2π`. Las contribuciones **hacia delante**
  (`c_k>0`) se suman como vectores: en fase → refuerzan; dispersas (aleteo descoordinado) → se cancelan
  parcialmente. Las de **freno** (`c_k<0`, p. ej. nodo frontal) penalizan a pleno.
  `coh = |Σ_{c>0} c_k·e^{iφ_k}| / Σ_{c>0} c_k ∈ [0,1]` (1 = todos en fase, o un solo propulsor → **cabeza
  sola = base intacta**). `Psum = (1 − phaseGain·(1−coh))·P_fwd − P_brake`; `PsumEff = max(0, Psum)`.
  Solo **reduce** el empuje de los cuerpos descoordinados (nunca supera la suma en fase → acotado;
  `phaseGain=0` recupera el modelo previo). Así **nadar coordinado EMERGE** por selección, sin reglas.
- **Streamlining EMERGENTE:** se acumula extensión axial vs. lateral de los nodos →
  `elongN ∈ [1, elongMax]`; `stream = streamBase + streamGain·(elongN−1)` (cuerpo largo/fino =
  menos arrastre). Sustituye al viejo gen `m_elong`.
- **Arrastre total** `Dmul`: base 1 + arrastre de segmentos (`segDrag`), módulos (`modDrag`),
  tentáculos (`limbDrag`) y cuerpo ancho (`bodyDrag`).
- **Velocidad TERMINAL a esfuerzo máximo:** `vmax = kThrust · PsumEff · straight · (stream / Dmul) · zancada`, acotada a `[vMin, vMax]`.
  Es la **cota física** de la morfología, NO la velocidad de cada tick.
- **ZANCADA por talla:** la física de nodos es en unidades de radio (r se cancela) → `vmax` NO escalaba con el tamaño.
  Se reintroduce `zancada = (radio / radio_medio)^speedSizeExp` (`speedSizeExp` ≈ 0.5, *UI*; 0 = como antes): el grande
  **avanza más por golpe** (zancada mayor), el pequeño es rápido EN SU ESCALA pero se desplaza poco. La masa ya penaliza
  aparte (inercia/coste/giro). Medido: además de cumplir la intuición, es un **payoff de talla** que contrarresta la deriva
  a lo diminuto → ↑ diversidad de talla y ↓ dominancia carnívora. (Render: la ondulación va relativa al `vmax` PROPIO → el
  pequeño bate igual de vivo aunque avance menos.)
- **Giro:** `turn = turnBase + turnAsym·asym − turnSize·size − turnElong·(elongN−1) − segTurn·nSeg`,
  acotado a `[turnMin, 1]` = **techo de agilidad**. La **asimetría del grafo** (`straight < 1`) desvía empuje a giro: cuerpos
  asimétricos viran mejor pero avanzan menos recto. Grandes/elongados/con muchos segmentos giran peor.
  **INERCIA ANGULAR** (`loco.angInertia`): el rumbo gira con MOMENTO — una vel. angular `omega` se acerca al objetivo
  (`turn·error_angular`, capado a ±`turn`) con lag `angResp = 1/(1+angInertia·max(0,masa−1))` → los grandes tardan en girar
  y sobregiran/contragiran; los ligeros giran casi al instante. `angInertia=0` → giro instantáneo (modelo previo).
- **CONTROL POR FUERZA (`loco.forceModel`, por defecto).** El organismo **no elige velocidad: elige ESFUERZO.** El cerebro
  emite la **dirección** de empuje (salidas 0,1, se normaliza; gira ≤ `turnRate`) y, en una **salida DEDICADA e independiente**,
  el **esfuerzo** (throttle 0..1, salida 3) → decide a la vez *a dónde* y *con cuánta fuerza* (parar/despacio/esprintar). La
  velocidad **no se fija**: se acerca a `vmax·esfuerzo·dir` con lag exponencial = **INERCIA**
  (`velResp = 1−e^(−dragLin·Dmul/masa)`; masa grande / poco arrastre → planea; pequeña → ágil). Así decide **cuándo moverse,
  cuándo parar** (esfuerzo→0 → frena por arrastre: descanso/emboscada), **cuándo esprintar y a dónde** — todo del MISMO output
  neuronal, sin if/else. Una entrada de **propiocepción** (velocidad propia, entrada #10) cierra el lazo de control. Medido:
  la dispersión de esfuerzo es ~7× la del modelo viejo (que iba en piloto automático a `vmax`). En este modelo `effort = 1`
  (la capacidad se computa a tope; el esfuerzo vivo lo pone el cerebro). El gen `speed` se reinterpreta como **MUSCULATURA**:
  escala la capacidad de empuje (`vmax`, `loco.muscleMin/Max`) y cuesta basal mantenerla (`energy.k_muscle`) → el cerebro decide
  cuánto USA (músculo sin usar = caro, r/K). Medido: diverge por nicho (carroñeros sedentarios ~bajo · herbívoros/cazadores ~alto).
- **Coste por POTENCIA:** `moveCost·v²·(0.3 + 0.7·esfuerzo)·(1+flapCost)·haulMul·dragMul`. Parado (v≈0) es casi gratis
  (descanso/emboscada); planear a velocidad cuesta algo; esprintar es caro. El presupuesto enseña al cerebro a **dosificar**
  → crucero al forrajear, ráfaga al cazar, escape al huir: las velocidades por nicho EMERGEN. (Modelo viejo `forceModel=false`:
  la velocidad se FIJA a `vmax` en la dir deseada y el coste usa el gen `speed`; sin control de esfuerzo ni inercia.)

> **Resultado esperado:** divergencia morfológica por nicho — depredadores fusiformes con colas
> propulsoras (nadadores rápidos); herbívoros redondos/lobulados (pastadores baratos y maniobrables).
> Conviven "ondulantes" (tentáculos) y "remeros" (aletas laterales). La presión hacia cuerpos
> hidrodinámicos surge sola del gait direccional, sin reglas.

## 2ter. Visión emergente y direccional — los ojos producen la visión

`sense` fija la **inversión** visual (alcance base + coste). `e_fov` reparte ese presupuesto entre
**alcance y ángulo**, conservando aprox. el área del cono:

- `r_efectivo = r_base · (fovRef / (2·halfFov))^rangeExp`.
- `halfFov = lerp(halfFovMin, halfFovMax, e_fov)` → cono **estrecho frontal** (ve lejos, solo delante)
  ↔ **ancho panorámico** (ve cerca, casi todo el entorno).
- En la percepción, un agente solo se ve si cae **dentro del cono** centrado en el rumbo (test de
  producto escalar con `visCos`, sin sqrt/acos → coste despreciable). El combate por solape NO se
  filtra (si te tocan, peleas). Parado (sin rumbo fiable) → visión omnidireccional.

> **Resultado esperado:** depredadores con visión **frontal y de mayor alcance**; herbívoros con
> visión **panorámica**. Emergente, no cableado.

## 3. Energética (el corazón de la selección)

**Capacidad (ALOMÉTRICA, #3).** La talla es una **masa física**: `sizeMass = (radius / refRadius)^massExp`
(normalizada al radio medio → un organismo medio tiene `sizeMass≈1`; `refRadius` = radio en el punto medio
del gen; exponente `massExp`, constante en `config.js`). `mass = sizeMass · massMul` (los nodos lóbulo/segmento suman masa real, `massMul ≥ 1`).
La **capacidad escala con la masa** (almacén ∝ volumen): `E_max = E_max_base · mass`. La masa añade **reserva**
(buffer para hambrunas), pero —clave— la **reproducción NO depende de la masa de nodos** (ver §4): la complejidad
da reserva pero no frena la cría. `energyPerUnit` convierte recurso normalizado a energía
(**parámetro de equilibrio más sensible**: muy bajo → mueren al arranque; muy alto → explota al tope).

Por tick, cada organismo:

- **Coste basal (ALOMÉTRICO, #3):**
  `c_base · mass^kleiber · (1 + k_metab·metab) · (1 + k_lifespan·(1−lifeFast)) · (1 + k_sense·sense + k_lure·lure)`.
  El mantenimiento del cuerpo escala con `mass^kleiber` (**ley de Kleiber**: exponente sub-lineal ≈¾ por la propia
  ley; el valor vive en `kleiber`, `config.js`): los grandes gastan
  **más en absoluto pero menos por unidad de masa** (economía de escala). Esto subsume el viejo coste lineal por
  tamaño y por masa de nodos (`k_size`/`k_body`, retirados). Visión y señuelo son **órganos** (coste aparte,
  multiplicativo). El término `(1 + k_lifespan·(1−lifeFast))` es el coste de **longevidad** (disposable soma, #12):
  vivir lento cuesta mantener el cuerpo → contrapeso que impide que la senescencia colapse a "inmortal". El coste es el
  **mismo sea cual sea la dieta** (sin descuentos por categoría; las muletas `carnUpkeep`/`k_sizeHerb`
  se retiraron, auditoría #6). Los nodos finos (tentáculos) son hidrodinámicos pero **no cuestan masa**.
- **Movimiento (nado):** coste extra `moveCost · dist² · (factor de esfuerzo) · (1 + flapCost) · (1 + k_haul·max(0,mass−1)) · (1 + k_drag·max(0,Dmul−dragRef))` (fórmula exacta en `sim.js`; en el modelo de fuerza vigente el factor de esfuerzo lo da el throttle del cerebro — el modelo viejo usaba `1 + k_effort·effort`),
  **cuadrático en la velocidad** (arrastre). El basal cobra por *tener* cuerpo; el nado cobra por *usarlo* yendo rápido.
  **`flapCost`** (Capa 3) = `k_flap · flapWork` (trabajo de aleteo, lateral): **aletear ENCARECE el nado** (el golpe
  activo gasta). Hace honesto el eje **ondular (crucero barato) ↔ aletear (ráfaga cara)**: el aleteo da +empuje
  (§2bis) pero cuesta, así que solo compensa a quien necesita la ráfaga (cazador que lancea); el pastador tranquilo
  prefiere ondular. Coste ligado a la propulsión de aleteo → coste↔beneficio. Solo lo paga quien aletea (neutro en 0).
  **`haulMul`** (A, *coste de transporte*) = `1 + k_haul·max(0,mass−1)`: **arrastrar masa ENCARECE el nado** — el
  sobrecoste ACTIVO de DESPLAZAR un cuerpo grande o con muchos/grandes apéndices (mantenerlo ya se paga en el basal,
  `mass^kleiber`). Referencia en `mass=1` (organismo medio): por debajo no recarga; por encima paga ∝ exceso de masa.
  El aerodinámico ahorra y el complejo paga; QUÉ forma gana lo decide la selección.
  **`dragMul`** (B, *coste de arrastre*) = `1 + k_drag·max(0,Dmul−dragRef)`: **la FORMA con resistencia ENCARECE el nado** —
  `Dmul` es el arrastre emergente de la geometría (`reducePlan`: cuerpo/aletas anchos, apéndices), cacheado por agente (SoA
  `drag`). Complementa A (que es por MASA): difieren en aletas/garras (mucho arrastre, poca masa). Cierra el incentivo
  perverso del *arrastre gratis* (antes el arrastre solo FRENABA, `v=…/Dmul`, y como el coste va con `v²` un cuerpo con
  arrastre nadaba **más barato** → ahora una forma con resistencia es lenta **y** agotadora). `dragRef` da un colchón
  (solo paga el `Dmul` por encima). Medido: efecto sutil en el régimen lento por defecto, mayor bajo presión de velocidad;
  neutro a `k_drag=0`. `k_drag`/`dragRef` se leen en vivo.
- **Alimentación** (ritmo `absEff = absRate · (0.5 + metab) · (1 + k_graze·(massMul−1)) · (1 + k_grazeWide·anchura)`;
  más masa = más superficie de pasto. **`anchura`** (Capa 2) = `1 − (elongN−1)/(elongMax−1)` ∈ [0,1]: un cuerpo
  **ancho/aplanado** (baja elongación) **barre más recurso** que uno fino/aerodinámico → premia la morfología de
  **pastador** (aletas/hojas anchas). Es el reverso del cazador (que afila+alarga para nadar y alcanzar, §2bis/§3.1):
  la MISMA elongación empuja a herbívoros (anchos) y carnívoros (aerodinámicos) a formas OPUESTAS → divergencia por
  dieta. Solo rinde a quien pasta (`effHerb`) → el carnívoro no se ensancha por esto):
  - **Eficiencia de dieta:** `omni = 1 − omniPenalty · 4·diet·(1−diet)` (0 en los extremos, máx en 0.5);
    `effHerb = (1−diet)·omni`, `effCarn = diet·omni`. El especialista no paga; el omnívoro sí.
  - Herbívoro absorbe `min(E_falta, recurso_celda · absEff · energyPerUnit) · effHerb`;
    el recurso de la celda baja en lo absorbido. Carnívoro: gana al cazar (§3.1).
  - **Forrajeo por talla (`forageReach`):** un cuerpo grande pasta de un ÁREA `(2·forageR+1)²` celdas, con
    `forageR = round(forageReach · size)` → **cubre más terreno** y cosecha más aunque cada celda esté pelada (ventaja
    que la escasez local NO borra). Es lo que da PAYOFF a la talla: sin esto el ingreso de pasto no escala con la talla
    pero el coste de cría (`reproRef ∝ sizeMass`) sí → todo deriva al mínimo (medido headless: con `forageReach`=0
    la talla converge al mínimo; con su valor por defecto y `omniPenalty` activo → DOS grupos de talla, pequeño y grande, + carnívoros). `forageReach`=0 = solo su celda (modelo previo).
    FRONTERA: defino "más grande barre más área"; QUÉ talla gana lo decide la selección.
- **Señuelo bioluminiscente** (`lure`): órgano de emboscada con **genética PROPIA** (`o_len`, `o_bulb`), **desacoplado
  de la selección sexual** (`orn`). Gate SUAVE sobre `o_len`: `lure = (o_len − lureGate)/(1 − lureGate) · (0.4 + o_bulb)`
  si `o_len > lureGate`, si no 0 → no viene de serie, la selección tiene que CONSTRUIRLO. Cuesta energía SIEMPRE
  (`k_lure`, en `baseCost`), **extiende el alcance de captura** al cazar (`combat.lureReach`) y **ATRAE a la presa**
  (emboscada): emite "comida aparente" que sesga el gradiente de comida de quien lo ve hacia el portador
  (`combat.lureAttract` · prominencia · 1/dist²) → emerge el **cazador EMBOSCADA** (anglerfish). El carnívoro lo
  recupera cazando → lo conserva; el herbívoro solo paga el coste sin beneficio → lo PIERDE. Resultado medido (8 seeds ×
  25k): lo expresa **~el 23% = la fracción cazadora** (antes el 100%, acoplado a `orn`); el alcance base del cazador
  activo lo da ahora `morphReach` (apéndices). La correlación señuelo↔caza **emerge**; es un nicho, no un buff universal.
  Se siembra en los proto-cazadores (`o_len` alto) para cruzar el valle de fitness; su valor lo decide la selección.
- **Reproducción:** §4. **Muerte por hambre:** `E ≤ 0`.
- **Muerte por vejez** (senescencia estocástica, #12): cada tick muere con prob.
  `age.mortality · senesMult · (max(0, edad − Tm) / age.scale)²`, donde `Tm` = edad de madurez (gen `mature_age`)
  y `senesMult = lerp(age.senesSlow, age.senesFast, lifeFast)` (gen `senescence`). Antes de madurar no hay
  riesgo de vejez. Sin tope duro.
- **Reciclaje del cadáver:** toda muerte deposita un cuerpo en el campo `carrion` de su celda (la presa
  **cazada** solo deja *restos* —lo no extraído por el depredador, que ya se llevó casi todo); la carroña
  **decae** y **mineraliza** íntegra al nutriente `N` de su celda (cierra el ciclo de materia) y la
  **consumen los carroñeros**. Mecánica completa en **§3bis** (carroña) y **§3ter** (pecera).

La selección **NO es una función de fitness explícita**: simplemente, **los que se quedan sin energía
mueren y no se reproducen.** El fitness emerge.

### 3.1 Combate / depredación (física trófica, no conducta)
El atacante solo puede atacar a un agente que, al **solaparse** (distancia < suma de radios + bonus
de señuelo `lureReach` + **alcance morfológico** `morphReach`), cumpla:
- **(a) talla cazable:** el ratio `presa/depredador` está en la banda `[preyBandLo, preyBandHi]`
  (ni demasiado pequeña para que compense, ni mayor de lo que `preyBandHi` permita arriesgar);
- **(b) dieta:** la presa está al menos `dietMargin` **más abajo en la dieta** (presa real, no un igual);
- **(c)** el atacante **no está en tiempo de manejo** y **decide atacar** (con probabilidad = su **impulso de
  ataque** `a`, la 3ª salida del cerebro). Cazar/agredir emerge del cerebro, no de un gen `aggro` (retirado, #10).

**Alcance morfológico (`morphReach`, Capa 2).** El radio de captura se **extiende con los apéndices que apuntan
AL FRENTE** (`plan.fwdReach` = Σ de su longitud·proyección frontal·presencia; ver `bodyplan.js`/`organism.js`):
una garra/púa/tentáculo frontal permite golpear desde más lejos. **Compromiso honesto y emergente:** esos
nodos frontales **frenan el nado** (`gait < 0`) y suman masa/arrastre, así que solo **compensan al depredador**
(rentabiliza el alcance); el herbívoro que los desarrollara solo pagaría el coste de nado → no los conserva. La
**morfología de agarre EMERGE en los carnívoros**, no está cableada por dieta. Escala con `combat.morphReach`.
Afilar (`tipShape < 0.5`, alarga el nodo) da más alcance → liga la Capa 1 (forma) con la caza.

> **Por qué (a) y (b)** (física trófica, no conducta codificada): un depredador no caza a otro de
> dieta similar (evita canibalismo y la **carrera al gigantismo**); y la banda de talla acopla el
> tamaño del depredador al de su presa. **Las fugas de la presa quedan cerradas:** hacerse gigante
> (caro: coste metabólico alométrico + cría más lenta, §3), encoger por debajo de la banda (deja de rentar
> como presa pero pierde otras ventajas), o subir su propia dieta (paga eficiencia herbívora). Resultado:
> **coexistencia estable**.

- **Escape por COBERTURA (`refuge`, #7):** cuando el atacante decide atacar, la presa **se escabulle** con
  probabilidad `refuge.strength · vegetación_de_su_celda` (sin combate ni `failDamage`: no la alcanzó entre la
  maleza). Graduado y dinámico (ver §1): casi inatacable en parches densos, expuesta en claros pastados.
- **Escape por VELOCIDAD (`combat.fleeSpeed`):** si la cobertura no la salva, la presa que nada **más rápido** que el
  atacante se zafa, con prob. `fleeSpeed · (vmax_presa/vmax_atacante − 1)` (tope 0.95). Convierte la persecución en un
  **duelo de velocidad** → la velocidad y la **morfología propulsora** (colas/aletas) pasan a ser selectivas (carrera
  armamentística presa↔cazador). `fleeSpeed=0` = solo cobertura (modelo previo). Medido: con cobertura baja
  (`refuge.strength` en su valor por defecto, modesto) la `vmax` evoluciona al alza por MORFOLOGÍA (no por el gen de
  esfuerzo, que se queda en su óptimo de coste); demasiado alto (o cobertura nula) → la presa escapa siempre y los
  carnívoros se quedan sin comer.
  **Sin esto la velocidad es ~neutra**: forrajear no es una carrera (deriva al gradiente), así que nada la premiaba.
- **Tiempo de manejo (`handlingTime`):** tras una captura el ganador no puede atacar durante N ticks
  (digestión). Satura la tasa de depredación → la presa amortigua → coexistencia en vez de colapso.
- **Resolución estocástica:** fuerza de cada contendiente `f = (size+0.1)^combat.sizeAdvantage` (tamaño + azar;
  ya no pesa `aggro` — las ganas de atacar están en la tasa de decisión `a`). `P(gana atacante) = f_att / (f_att
  + f_def)`. Nadie gana "por regla".
- **Al vencer:** el perdedor muere; el ganador recibe `preyGain · (E_perdedor + bodyMatter_perdedor) · effCarn`
  (limitado a `E_max`; lo no extraído por ineficiencia trófica + lo que rebose el tope → **restos** de carroña /
  nutriente, ver §3bis). `bodyMatter = carcassValue·eMax` es la **biomasa estructural** del cuerpo (∝ masa, bloqueada
  del pool `N` al nacer), que alimenta ADEMÁS de la energía almacenada → comer un animal nutre aunque viniera
  hambriento. Con `carcassValue` bajo la ganancia ≈ solo energía almacenada: en un mundo escaso la presa cría hasta
  la capacidad de carga pero **magra** (poca E), y cazarla da calorías vacías → los carnívoros **se extinguen
  rodeados de presa abundante** (medido). Un herbívoro puro (`effCarn≈0`) no gana nada atacando → la agresión solo
  se sostiene si la dieta carnívora coevoluciona (emergencia, no la regla "los herbívoros no atacan").
- **Coste al fallar (`failDamage`):** si el ataque falla, el atacante **pierde energía**
  (`failDamage · su eMax`) y muere solo si llega a 0. Es el **freno denso-dependiente** que estabiliza
  la depredación: sin coste al fallar, los carnívoros sobre-disparan y colapsan el sistema.

El combate puede desactivarse (`combat.enabled=false`) para validar la selección solo con herbívoros.

### 3bis. Carroña (cadáveres) — hacia el nicho carroñero
Toda muerte deposita un **cuerpo** en el campo `carrion` de su celda (en unidades de energía directa):
- **Muerte natural** (vejez, hambre, combate): cuerpo entero = energía que quede + **biomasa estructural**
  (`bodyMatter = carcassValue·eMax`, el tejido). El que muere de hambre tiene `E≈0` → deja solo tejido (cadáver magro).
- **Cazado:** la depredación (§3.1) ya repartió la materia de la presa → la muerte en sí deposita **0** (sin doble
  conteo); los **restos** (ineficiencia trófica + lo no comido) los deposita el propio combate.

La carroña **decae** cada tick (`resource.carrionDecay`) y **mineraliza** íntegra al nutriente `N` de su celda
→ **ciclo de materia** (cadáver→descomposición→nutriente→pasto). La **consume** quien puede procesar carne
(`effCarn`, ritmo `resource.carrionAbsRate`) → puente carroñero que da colchón a los carnívoros en la escasez
(medido a `closedRegen` bajo: el carroñeo multiplica los carnívoros). Render: el cuerpo del muerto se dibuja en su sitio, gris y desvaneciéndose con su carroña (ver VISUAL).

**Eje CAZA ↔ CARROÑA (Fase 2, gen `scav`):** la capacidad carnívora (`meat = diet·omni`) se reparte entre cazar
presa VIVA (`effHunt = meat·(1−scav)·spec`) y CARROÑEAR cadáveres (`effScav = meat·scav·spec·(1+k_scavThin·thin)`),
con `spec = 1 − scavPenalty·4·scav·(1−scav)` que penaliza al generalista → especializa en CAZADOR o CARROÑERO. El
carroñeo rinde más con cuerpo FINO/elongado (`k_scavThin·thin`, reverso del pastador ANCHO). La predación usa
`effHunt`; el carroñeo, `effScav`. El gradiente de comida del cerebro es DEPENDIENTE de dieta (`effHerb·∇recurso +
effScav·∇carroña`) → el carroñero navega hacia los cadáveres con la conducta de búsqueda ya evolucionada. EMERGE el
GUSANO: carroñero pequeño y elongado. La proto-forma (cadena axial de nodos) se SIEMBRA en media cohorte comecarne
para cruzar el valle morfológico (el nicho solo no basta para una forma compleja); cruzado, se mantiene por inercia +
streamlining. Especies/herencia: `scav` es gen base → cuenta en la distancia genética (un carroñero es otra especie).

### 3ter. Ecosistema CERRADO en materia ("pecera" — único escenario)
> Rationale (histórico): un modelo **abierto en materia** —el sol creando biomasa de la nada y el cuerpo
> "conjurándose" al morir— se midió creando ≈17% de la entrada de la nada y asentando la población en el tope
> del pool, no en la capacidad de carga: NO conservaba. Por eso la pecera cerrada es el único modelo.

El mundo es **cerrado en MATERIA** (abierto en energía sol→calor, cerrado en materia — como un ecosistema real).
**Moneda única** (materia = unidades de energía); cantidad **conservada**:

> `Σ N[celda] + Σ(recurso·epu) + Σ_vivos(E + bodyMatter) + Σ(carroña) = constante` (= `world.matterBudget`)

- **`N`** = CAMPO ESPACIAL de nutriente libre disuelto **por celda** (`world.N`; antes un escalar global). Las plantas lo
  captan LOCALMENTE → **manchas fértiles** donde muere/respira algo. Se **DIFUNDE** despacio entre vecinos
  (`world.nutrientDiffuse`, conservativa en el toro) → las manchas se difuminan y migran. Σ del campo = pool global.
- **`bodyMatter[i] = carcassValue·eMax`** = materia ESTRUCTURAL del cuerpo (SoA). Se **retira del nutriente del VECINDARIO
  5×5 del progenitor al nacer** (el cuerpo se construye reuniendo materia de la ZONA, no de una sola celda que no bastaría
  de golpe) — y **nacer se BLOQUEA si la zona no tiene `bodyMatter`** → la cría se acopla a la fertilidad local; se
  **devuelve a la carroña al morir**. Ya no se conjura: el cuerpo se paga con materia real.
- **Rebrote** (`World.regen`): cada celda crece CONSUMIENDO su `N` LOCAL a ritmo `world.closedRegen` (la fotosíntesis,
  N→pasto) → el pasto rebrota DONDE hay nutriente (manchas fértiles). Si el `N` local no llega, se escala ESA celda.
  El sol no crea materia: solo permite convertir `N`→pasto.
- **Retornos a `N`** (la materia no se evapora), todos en la **CELDA donde ocurren**: metabolismo + nado, pérdida trófica
  de la depredación, conversión de pasto no asimilada (`1−effHerb`), y el sobrante por tope de `eMax`. El metabolismo no
  puede dejar `E` negativa (se topa a 0: no se gasta materia que no se tiene). La **carroña mineraliza ÍNTEGRA** al `N` de
  su celda (`carrionDecay`) → el cadáver fertiliza su propia zona.
- **Techo ENDÓGENO**: la capacidad de carga la pone la materia (y el ritmo `closedRegen`), no el sol ni `maxAgentsCeiling`. El
  sobrante de materia por encima de la capacidad ecológica queda como `N` libre = **buffer** de la pecera.
- **DOS ATRACTORES** (medido headless multi-seed): "pequeño-numeroso-con-carroñeros" ↔ "grande-escaso-solo-herbívoro";
  el seed decide → cada Sembrar varía. Con los valores por defecto (`world.closedRegen` + `pop.maxAgentsCeiling` +
  `combat.fleeSpeed` + `diet.scavPenalty` + **`expr.size.min`** (suelo de talla), todos en `config.js`) → régimen de **RED TRÓFICA**: herbívoros + carroñeros +
  CAZADORES de presa viva coexisten (trío estable en la mayoría de siembras; los cazadores son una minoría ÁPICE
  fluctuante, los carroñeros el grueso del comecarne, los herbívoros la base). CLAVE: cazar presa viva exige
  productividad alta (mundo magro → solo el carroñeo rinde), y esa productividad sube la pop → exige holgura de pool
  (`maxAgentsCeiling` con margen; si queda corto, satura y se distorsiona). Bajar `closedRegen` → pecera magra y contemplativa
  pero el gremio CAZADOR es FRÁGIL (colapsa en varias siembras → solo herbívoro/carroñero); bajarlo aún más → población
  plácida solo-herbívora. La siembra de proto-carnívoros (`carnivoreSeedFrac`) ayuda al gremio a establecerse.
- **SUELO DE TALLA (`expr.size.min`) = freno del colapso a LARGO PLAZO.** Sin suelo, a horizontes largos (>10k ticks)
  el mundo deriva al runaway r-estratega: cuerpos cada vez más DIMINUTOS (que crían rápido y, al pesar poca materia,
  caben muchos) → la población **satura `maxAgentsCeiling`** (el pool, no la materia: queda nutriente libre sin usar) y, al
  desaparecer la talla, se borra la base de presa → el gremio CAZADOR se extingue (el trío resultaba **transitorio**:
  válido a ~5-8k ticks, colapsado a 30k). Poner un **suelo a `expr.size.min`** impide los cuerpos infinitesimales → la
  población no puede inflarse → la **MATERIA vuelve a ser el límite endógeno** (pop por debajo del pool) y queda una base
  de presa con talla → el cazador **persiste a 30k+** (medido headless 7/7 seeds, verificado en vivo). Es la palanca que
  hace honesto el principio "la capacidad de carga la pone la materia, no `maxAgentsCeiling`" también a largo plazo.
- **Guard de `energyPerUnit`** (epu): es el tipo de cambio recurso↔materia y entra en el balance. Cambiarlo EN VIVO
  reescalaría la materia de la vegetación en pie → el worker ABSORBE el salto en `N` (`N -= Σrecurso·Δepu`)
  → la conservación no salta. Cualquier otro parámetro (costes, eficiencias, talla, combate) ya conserva
  solo (solo cambia el equilibrio). `matterBudget`/`maxAgentsCeiling` requieren **Reiniciar** para aplicarse.

Validado headless: la materia se conserva salvo una **fuga sistemática diminuta** por redondeo `Float32` al acreditar
la comida en la **alimentación herbívora** (la energía `E` y el nutriente `N` son almacenes de mayor magnitud que el
recurso `res` → rejilla f32 más gruesa al guardarles el crédito). Es un **sesgo a la baja** (NO ruido simétrico),
proporcional a la actividad de pastoreo, pero **acotado y despreciable** (no provoca runaway). El diseño sigue siendo
robusto: el motor enruta toda pérdida a un pool sea cual sea el valor de los coeficientes, por eso conserva ante
cambios de parámetros en vivo.

## 4. Reproducción y herencia

### Siembra inicial
`pop.initial` fundadores. Con `pop.simpleStart=true`, cuerpos **simples** (cabeza + pocos nodos) y
genes con jitter pequeño (`startJitter`) → la complejidad y la apariencia EMERGEN; con `false`, genes
uniformes en `[0,1]`. `startDiversity` (`pop.startDiversity`, valor en `config.js`) regula la variedad inicial: **0 = fundadores TODOS IGUALES** (renacuajos
herbívoros idénticos y básicos, sin proto-carnívoros), 0.5 = moderada, 1 = variado. Una fracción `carnivoreSeedFrac` se
siembra como proto-carnívoros (cruza el "valle de fitness" del arranque), **escalada por la diversidad** (`min(1, div·2)`:
nula a div=0, plena a div≥0.5). Los fundadores se colocan en un **círculo central de densidad fija** (`pop.seedDensity`). Energía inicial
`E = 0.5·E_max`. Si `pop.seed` es un número, el RNG es **reproducible** (mismo seed → misma corrida).

### Referencia de reproducción y compromiso r/K (auditoría #4)
`reproRef = E_max_base · sizeMass` (acoplada a la **masa de TALLA**, no a la masa total: la complejidad de nodos
da reserva en `eMax` pero NO encarece la cría — preserva #4).
- **Gate de madurez (#12):** además del umbral de energía, no se cría antes de `edad ≥ Tm` (gen `mature_age`).
- Umbral para criar: `reproNeedE = max(repro_thr, invest) · reproRef` (el `max` garantiza que pagar la
  cría nunca deja al progenitor en negativo).
- Coste: transfiere `investE = invest · reproRef` a la cría.

Como criar cuesta una **fracción constante de la energía-máxima-por-talla**, el **pequeño** (eMax bajo)
llena su depósito antes y cría más rápido (ventaja **r** natural); el **grande** es **K-estratega**.
El compromiso r/K **emerge de la talla**, sin un knob aparte que lo aplane (se retiraron
`reproBase`/`reproSizeCost`, auditoría #4). No usa la masa: la complejidad da reserva, no frena la cría.

### Reproducción sexual + especiación (`repro.sexual=true`, por defecto)
Al cumplir energía/cooldown, el organismo busca **pareja compatible** cercana (vecino vivo dentro de
`mateRadius` con **distancia genética < `speciesGenThreshold`**). La cría es **recombinación** de los
dos genomas + mutación. El progenitor pone la energía y entra en cooldown. **Si no hay pareja
compatible al alcance → fallback ASEXUAL** (clon mutado), para que los aislados no dejen de reproducirse.

**Crossover CON LIGAMIENTO:** no se elige cada gen al azar (uniforme destruye los complejos
co-adaptados); se parte de un padre y, con prob. `recomb` **por locus**, se cambia de padre → se
heredan **tramos contiguos** (como cromosomas). `recomb=0.5 ≡ uniforme`; `→0` = ligamiento fuerte
(cerebro, forma, `orn`/`pref` adyacentes pasan casi intactos y co-evolucionan de verdad).

La **compatibilidad por distancia genética** produce **especies reales**: cuando dos grupos divergen
más allá del umbral, dejan de poder cruzarse → aislamiento reproductivo → divergen por su cuenta.
**Especies = clústeres genéticos**, calculados periódicamente en el worker (centroides estables) →
contador de especies + modo de render "colorear por especie".

### Selección sexual — runaway de Fisher
`orn` (cuánto exhibe el ornamento) y `pref` (ornamento preferido). Al **elegir pareja**, entre las
compatibles al alcance se queda con la **más atractiva** (mejor encaje con `pref`). Como `orn`/`pref`
son adyacentes y se heredan ligados, se **correlacionan** → cada linaje "se dispara" (Fisherian
runaway) → ornamentos divergentes por especie. Solo afecta a la elección y al render.

### Mutación (una sola tasa por locus, auditoría #1)
- Por cada gen, con prob. `mut.rate` se añade ruido gaussiano `N(0, mut.sigma)`; luego clamp a `[0,1]`.
- Macromutación rara: con prob. `mut.bigRate`, ruido con `sigma · bigSigmaMult` (saltos macro).
- **Una sola tasa, CIEGA a la función del gen** (color, forma y ecología mutan al mismo ritmo): la
  mutación no debe "saber" para qué sirve un gen. (Antes había 3 tasas por categoría → retirado.)

### Distancia genética y genes funcionales
Métrica única (compatibilidad sexual + clústeres de especie): **euclídea normalizada sobre los genes
FUNCIONALES** → `dist = sqrt( Σ_func (g1ᵢ − g2ᵢ)² / n_func ) ∈ [0,1]`.
- **FUNCIONALES** = ecología + `e_fov` + `orn`/`pref` + **forma de nodos** (incl. `osc_amp`).
- **EXCLUIDOS:** el **cerebro** (todos sus pesos `BRAIN_W`; su deriva dominaría) y los genes **decorativos/neutrales**
  (color `hue`, glow `c_lum`, estilo de señuelo `o_*`). **`osc_phase`** también se excluye
  aunque afecta a la física: solo importa su **dispersión dentro de un cuerpo**, no el valor absoluto (dos
  bichos igual de coordinados con fase global distinta nadan idéntico) → contarlo daría especiación espuria.

Así las especies se definen por lo que importa para sobrevivir (ecología + forma), no por el color:
dos bichos con misma ecología y forma pero **distinto color son la misma especie** → morfos de color
intra-especie por deriva neutral.

## 5. Bucle de simulación y rendimiento

Objetivo: miles de agentes a 30–60 ticks/s en el navegador. Decisiones obligatorias:

- **Lógica desacoplada del render.** La velocidad se fija en **ticks por segundo** (`targetTPS`), no
  por frame: cada frame el motor ejecuta los ticks que tocan según el tiempo real y dibuja una vez.
- **Motor en Web Worker** (`engine/worker.js`): corre en su hilo y envía "fotos" (snapshots) compactas
  por frame al hilo principal, que solo renderiza (vía un `simProxy` que imita la interfaz del Sim).
  Render fluido + más ticks/s; el motor sigue en segundo plano.
- **Spatial hashing / uniform grid** para vecindad: **nunca O(n²)**.
- **Typed arrays / Structure of Arrays:** un `Float32Array` por atributo (x[], y[], E[], genes…).
  Reduce GC y mejora caché. **El plan corporal se computa en scratch reutilizable** (`bodyplan.js`):
  cero asignaciones por nacimiento, sin inflar el SoA por agente.
- **Render con Canvas 2D** (no DOM por agente). El cuerpo se dibuja desde el grafo de nodos.
- **Sin asignaciones en el bucle caliente.** Pool de agentes (índices libres) para nacimientos/muertes.
- **Tope de población** `pop.maxAgentsCeiling`: límite **duro del pool** (memoria/FPS) que NO escala con el mundo,
  no un punto de operación — la capacidad de carga la pone el recurso, no un número (se retiró el viejo `maxAlive`,
  auditoría #5; y el `maxAgents` escalable por área, 2026-06). Al alcanzarlo, el nacimiento se bloquea y el progenitor reintenta tras el cooldown.

Estructura de archivos:
- `engine/world.js` — estado, grid espacial, recurso, campos (nutriente, capacidad/luz).
- `engine/organism.js` — **frontera gen→fenotipo** (expresión, energética). Llama a `bodyplan.js`.
- `engine/bodyplan.js` — **geometría del cuerpo por nodos** → escalares de física (masa, arrastre,
  empuje direccional, giro, streamlining). Fuente única de la forma.
- `engine/genome.js` — definición de genes, copia, mutación, crossover, distancia genética, cerebro.
- `engine/sim.js` — bucle de ticks, percepción, decisión, combate, nacimientos/muertes, pool.
- `engine/worker.js` — hilo del motor + snapshots.
- `render/canvas.js` — dibujo del mundo y de los agentes desde los nodos.
- `ui/controls.js`, `ui/charts.js`, `main.js` — UI, gráficas, orquestación + `simProxy`.

## 6. Parámetros por defecto
Ver `src/config.js` (**fuente única**: cada parámetro con su valor, comentario y marca *(UI)*, agrupado por bloque).
Deben poder cambiarse sin tocar el motor; los *(UI)* afectan a la simulación en vivo.

## 7. Criterios de aceptación (¿funciona la emergencia?)
Sin tocar el código de estrategias ni de formas, debe observarse al menos:
1. La distribución de algún gen se desplaza con el tiempo (selección actuando), visible en la gráfica.
2. Proto-especiación: aparición espontánea de grupos con genes/forma divergentes, idealmente
   correlacionada con nichos espaciales, dietas o tallas.
3. Con carnívoros, oscilaciones tipo depredador-presa reconocibles en las curvas de población.
4. **Divergencia morfológica:** cuerpos distintos por nicho (p. ej. depredadores fusiformes con cola
   vs. herbívoros redondos) — la forma y el modo de nadar responden a la selección.
5. Reversibilidad: cambiar `mut.sigma`, `world.closedRegen` o `combat.*` altera visiblemente qué estrategias y
   formas dominan, demostrando que la selección responde al ambiente.

Estos criterios deben poder comprobarse desde la propia UI (gráficas, inspector), no leyendo logs.
