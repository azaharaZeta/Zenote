# Especificación del motor evolutivo — "Zenote"

Este documento define las reglas exactas de la simulación. Es la **fuente de verdad**
sobre genética, mutación y selección. El motor debe implementar esto fielmente; la
parte visual es secundaria al cumplimiento de estas reglas.

> **Modelo v2.0 (jun 2026).** El cuerpo dejó de ser categorías hechas a mano
> (cabeza/segmentos/apéndices) y pasó a ser un **genoma generativo por nodos**: forma y
> locomoción EMERGEN de la selección. Si encuentras menciones a `m_app`, `m_seg`, `mod*`,
> `s_*`, `maxAlive` o "carroña comestible" en código o notas viejas, son del modelo
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

- Rejilla continua (coordenadas float), por defecto un **toro** (bordes envueltos) para
  evitar artefactos de borde.
- **Recurso difuso** ("energía solar/química") en un campo escalar de baja resolución
  (`resource.gridCols`×`gridRows`). Capacidad por celda según `resource.gradient`
  (`perlin` | `center` | `uniform`). Se acumula hasta `R_max` por celda.
- **Rebrote** `R_regen` por celda. Con `resource.patchiness > 0` el rebrote es **logístico +
  difusión de semilla** → los **parches de recurso emergen y migran** del juego pastoreo↔rebrote
  (no son fijos). `grazeRefuge` reserva una fracción intocable por celda (evita el sobrepastoreo letal).
- **Temperatura:** eje escalar continuo por región con gradiente espacial (`resource.tempFreq`).
  El gen `temp_pref` es el óptimo térmico; desviarse multiplica el coste basal (`energy.k_temp`).
- **Refugio de presa = COBERTURA graduada** (`refuge`, #7): no hay zona binaria "no cazable". La **vegetación
  VIVA local** (el propio campo de recurso) es escondite: en el combate (§3.1) la presa **escapa** con
  probabilidad `refuge.strength · vegetación_de_su_celda`. Como el pasto se come y rebrota, la cobertura es
  **espacialmente dinámica** → refugios que migran solos (Huffaker emergente): la presa está a salvo en parches
  densos y expuesta en los claros pastados. Estabilizador Lotka-Volterra (la presa nunca llega a cero) sin la
  muleta del interruptor. Es física del mundo, no conducta.

## 2. El organismo

Cada agente tiene **estado dinámico** (fenotipo que cambia en vida) y un **genoma** (fijo en
vida, heredado con mutación).

### Estado dinámico
- posición (x, y), velocidad (vx, vy), energía `E` (muere si `E ≤ 0`), edad, cooldown de cría.
- estado oculto del cerebro recurrente (memoria entre ticks, ver §cerebro).
- `lineageId` (id del fundador ancestral, **heredado sin mutación** → ascendencia auditable) y
  `generation`. No afectan a la física; son trazadores de linaje, independientes del color.

### Genoma — **185 genes** float en `[0,1]` (SoA: `Float32Array`)

El genoma se divide en cuatro bloques contiguos (orden en `genome.js`):

| Bloque | Nº | Genes |
|--------|----|-------|
| **Ecología / fisiología** | 11 | `size`, `speed`(esfuerzo), `sense`, `metab`, `diet`, `repro_thr`, `invest`, `hue`, `temp_pref`, `mature_age`, `senescence` |
| **Identidad / display** | 11 | `e_fov`, `c_eye`, `orn`, `pref`, `c_lum`, `c_sat`, `o_len`, `o_bulb`, `o_hue`, `o_num`, `tex2` |
| **Cuerpo por NODOS** | 80 | 8 nodos × 10 campos (ver §2bis) |
| **Cerebro neuronal** | 83 | pesos de la RNN (ver §cerebro) |

**Genes de ecología/fisiología:**

| Gen | Expresión / efecto |
|-----|--------------------|
| `size` | radio = `lerp(expr.size)` px → **masa alométrica** (§3): mayor tamaño → más `E_max` (almacén ∝ masa) y ventaja en combate, pero más coste metabólico absoluto (∝ masa^¾) y peor giro. **No afecta a la velocidad** (ver §2bis). |
| `speed` | **ESFUERZO de nado** (acelerador 0..1), NO velocidad. Modula la amplitud de oscilación de los nodos (`effort`) y el coste de moverse. La velocidad EMERGE de la forma (§2bis). |
| `sense` | inversión visual → alcance base de visión + coste (`k_sense`). El reparto alcance↔ángulo lo hace `e_fov` (§2ter). |
| `metab` | escala a la vez el ritmo de alimentación y el coste basal (`k_metab`). Alto = come y rinde más pero quema más. Trade-off, sin "mejor". |
| `diet` | 0 = herbívoro puro (come del campo), 1 = carnívoro puro (caza). Intermedio = omnívoro penalizado (`omniPenalty`). |
| `repro_thr` | umbral de energía para criar: `lerp(expr.repro_thr)` de la referencia (§4). |
| `invest` | energía transferida a cada cría: `lerp(expr.invest)` de la referencia. |
| `hue` | tono del organismo (su color en pantalla). Gen **neutro** (no afecta a la física): deriva libre y se hereda → traza el linaje a ojo. Muta como cualquier gen. |
| `temp_pref` | óptimo térmico; la desviación frente a la temperatura local multiplica el coste basal (`k_temp`). Segundo eje de nicho. |
| `mature_age` | **historia de vida (#12)**: edad de madurez `Tm = lerp(expr.mature_age)`. Gatea la reproducción (no se cría antes de `Tm`) **e** inicia la senescencia (no hay muerte por vejez antes de `Tm`). Madurar pronto = criar antes (r) pero envejecer antes; tarde = retrasar la cría pero vivir más (K). |
| `senescence` | **historia de vida (#12)**: ritmo de vida `lifeFast ∈ [0,1]`. Escala la pendiente de la mortalidad por vejez (`senesMult`, ver §3) y, por **disposable soma**, el coste basal: ser longevo (`lifeFast` bajo) cuesta más mantenerse. Crea el eje r/K vivir-rápido↔longevo sin degenerar. |

**Genes de identidad / display:** color de ojo (`c_eye`),
luminosidad/saturación (`c_lum`, `c_sat`), estilo del señuelo (`o_len`, `o_bulb`, `o_hue`, `o_num`)
y piel (`tex2`) son **NEUTRALES** (solo render, derivan por linaje → identidad visual de especie;
**excluidos de la distancia genética**). Dos excepciones **funcionales** en este bloque:
- `e_fov` = **campo de visión** (reparte el presupuesto de `sense` entre alcance y ángulo, §2ter).
- `orn`/`pref` = **selección sexual** (`orn` = cuánto exhibe el señuelo; `pref` = ornamento
  preferido en la pareja). Dirigen la elección de pareja → runaway de Fisher (§4). `orn` además
  **gatea el señuelo bioluminiscente**, que es funcional en la caza (§3).

> **Color adaptativo, no neutral.** El `hue` está enganchado a la física del mundo (sintonía
> con la luz local) para que el color *emerja* de la selección (pigmentos, cripsis), no que
> solo derive. La ascendencia se ve por `lineageId` (heredado sin mutar), no por color: el color
> dice *a qué ambiente se adapta* un organismo; el linaje, *de quién desciende*.

### Cerebro (decisión) — RNN neuronal por defecto
La decisión la toma una **red neuronal recurrente diminuta (Elman)** cuyos **pesos SON genes**.
Es el **único** modo de conducta (se retiró la regla reactiva y sus genes `w_*`, backlog #9):

- Topología `BRAIN = {I:7, H:5, O:3}`, **83 pesos** (`BRAIN_W` = I·H + H·H + H + H·O + O):
  entrada→oculta, **oculta→oculta (memoria)**, sesgos ocultos, oculta→salida, sesgos salida.
  El estado oculto **persiste entre ticks** (memoria → búsqueda/persistencia emergente).
- **Entradas (7):** gradiente de comida (x,y), dirección a la presa (x,y), dirección a la amenaza (x,y),
  energía. **Salidas (3):** deseo de movimiento (dx,dy) + **impulso de ataque** `a = (tanh(out₂)+1)/2 ∈ [0,1]`.
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
- **Amplitud de oscilación por nodo:** `amp = (oscFloor + (1−oscFloor)·osc_amp) · effort`, con
  `effort = effortFloor + (1−effortFloor)·speed` (el throttle global, gen `speed`).
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
- **Velocidad-capacidad:** `v = kThrust · PsumEff · straight · (stream / Dmul)`, acotada a `[vMin, vMax]`.
  **`effort` NO se vuelve a multiplicar** (ya está dentro de `amp`; si no, sería `effort²`).
- **Giro:** `turn = turnBase + turnAsym·asym − turnSize·size − turnElong·(elongN−1) − segTurn·nSeg`,
  acotado a `[turnMin, 1]`. La **asimetría del grafo** (`straight < 1`) desvía empuje a giro: cuerpos
  asimétricos viran mejor pero avanzan menos recto. Grandes/elongados/con muchos segmentos giran peor.
- **Coste de nado ∝ v²** (arrastre real): se cobra en el movimiento (`moveCost·dist²·(1+k_effort·effort)`),
  no en el basal. Ir al máximo es carísimo → la velocidad la limita el presupuesto energético: la presa
  (renta de pasto pobre) no puede ir al máximo; el depredador (energía rica de la presa) sí → recupera
  ventaja de velocidad. **Mecanismo clásico depredador-presa, ahora 100% emergente de la forma.**

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
(normalizada al radio medio → un organismo medio tiene `sizeMass≈1`; `refRadius` = radio a size=0.5;
`massExp` ≈ 1.5, tunable). `mass = sizeMass · massMul` (los nodos lóbulo/segmento suman masa real, `massMul ≥ 1`).
La **capacidad escala con la masa** (almacén ∝ volumen): `E_max = E_max_base · mass`. La masa añade **reserva**
(buffer para hambrunas), pero —clave— la **reproducción NO depende de la masa de nodos** (ver §4): la complejidad
da reserva pero no frena la cría. `energyPerUnit` convierte recurso normalizado a energía
(**parámetro de equilibrio más sensible**: muy bajo → mueren al arranque; muy alto → explota al tope).

Por tick, cada organismo:

- **Coste basal (ALOMÉTRICO, #3):**
  `c_base · mass^kleiber · (1 + k_metab·metab) · (1 + k_lifespan·(1−lifeFast)) · (1 + k_sense·sense + k_lure·lure)`.
  El mantenimiento del cuerpo escala con `mass^kleiber` (**ley de Kleiber**, `kleiber ≈ 0.75`): los grandes gastan
  **más en absoluto pero menos por unidad de masa** (economía de escala). Esto subsume el viejo coste lineal por
  tamaño y por masa de nodos (`k_size`/`k_body`, retirados). Visión y señuelo son **órganos** (coste aparte,
  multiplicativo). El término `(1 + k_lifespan·(1−lifeFast))` es el coste de **longevidad** (disposable soma, #12):
  vivir lento cuesta mantener el cuerpo → contrapeso que impide que la senescencia colapse a "inmortal". El coste es el
  **mismo sea cual sea la dieta** (sin descuentos por categoría; las muletas `carnUpkeep`/`k_sizeHerb`
  se retiraron, auditoría #6). Los nodos finos (tentáculos) son hidrodinámicos pero **no cuestan masa**.
- **Movimiento (nado):** coste extra `moveCost · dist² · (1 + k_effort·effort) · (1 + flapCost) · (1 + k_haul·max(0,mass−1))`,
  **cuadrático en la velocidad** (arrastre). El basal cobra por *tener* cuerpo; el nado cobra por *usarlo* yendo rápido.
  **`flapCost`** (Capa 3) = `k_flap · flapWork` (trabajo de aleteo, lateral): **aletear ENCARECE el nado** (el golpe
  activo gasta). Hace honesto el eje **ondular (crucero barato) ↔ aletear (ráfaga cara)**: el aleteo da +empuje
  (§2bis) pero cuesta, así que solo compensa a quien necesita la ráfaga (cazador que lancea); el pastador tranquilo
  prefiere ondular. Coste ligado a la propulsión de aleteo → coste↔beneficio. Solo lo paga quien aletea (neutro en 0).
  **`haulMul`** (A, *coste de transporte*) = `1 + k_haul·max(0,mass−1)`: **arrastrar masa ENCARECE el nado** — el
  sobrecoste ACTIVO de DESPLAZAR un cuerpo grande o con muchos/grandes apéndices (mantenerlo ya se paga en el basal,
  `mass^kleiber`). Referencia en `mass=1` (organismo medio): por debajo no recarga; por encima paga ∝ exceso de masa.
  El aerodinámico ahorra y el complejo paga; QUÉ forma gana lo decide la selección. Pendiente el coste por la FORMA del
  arrastre (no solo la masa) — idea "coste de arrastre en locomoción" en `ideas/indice-ideas.md`.
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
    pero el coste de cría (`reproRef ∝ sizeMass`) sí → todo deriva al mínimo (medido headless: `forageReach` 0 → talla
    media 0.22; 3 (default, con omniPenalty 0.15) → DOS grupos de talla (~0.25 y ~0.55, 21% grandes) + carnívoros). `forageReach=0` = solo su celda (modelo previo).
    FRONTERA: defino "más grande barre más área"; QUÉ talla gana lo decide la selección.
- **Señuelo bioluminiscente** (`lure`): órgano FUNCIONAL gateado por `orn` (`orn > 0.12`),
  prominencia `(0.2 + o_len)·(0.4 + o_bulb)`. Cuesta energía (`k_lure`) y **extiende el alcance de
  captura** al cazar (`combat.lureReach`). El carnívoro lo recupera cazando → evoluciona señuelos
  largos; el herbívoro solo paga → los pierde. La correlación señuelo↔dieta **emerge**.
- **Reproducción:** §4. **Muerte por hambre:** `E ≤ 0`.
- **Muerte por vejez** (senescencia estocástica, #12): cada tick muere con prob.
  `age.mortality · senesMult · (max(0, edad − Tm) / age.scale)²`, donde `Tm` = edad de madurez (gen `mature_age`)
  y `senesMult = lerp(age.senesSlow, age.senesFast, lifeFast)` (gen `senescence`). Antes de madurar no hay
  riesgo de vejez. Sin tope duro.
- **Reciclaje del cadáver:** al morir **por hambre o vejez** deposita `corpseReturn · E` como recurso
  en su celda (respetando `R_max`). Una presa muerta **por depredación NO deposita cadáver** (su
  energía ya se la queda el depredador → la energía se conserva, no se contabiliza dos veces).
  *(No existe subsistema de "carroña comestible": se retiró en auditoría #11; el cadáver solo
  realimenta el campo de recurso.)*

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
  (`refuge.strength≈0.3`) la `vmax` evoluciona al alza por MORFOLOGÍA (no por el gen de esfuerzo, que se queda en su
  óptimo de coste); demasiado alto (o cobertura nula) → la presa escapa siempre y los carnívoros se quedan sin comer.
  **Sin esto la velocidad es ~neutra**: forrajear no es una carrera (deriva al gradiente), así que nada la premiaba.
- **Tiempo de manejo (`handlingTime`):** tras una captura el ganador no puede atacar durante N ticks
  (digestión). Satura la tasa de depredación → la presa amortigua → coexistencia en vez de colapso.
- **Resolución estocástica:** fuerza de cada contendiente `f = (size+0.1)^combat.sizeAdvantage` (tamaño + azar;
  ya no pesa `aggro` — las ganas de atacar están en la tasa de decisión `a`). `P(gana atacante) = f_att / (f_att
  + f_def)`. Nadie gana "por regla".
- **Al vencer:** el perdedor muere (deja solo SOBRAS de carroña, `scrapReturn·biomasa`, ver §3bis); el ganador recibe `preyGain · (E_perdedor +
  carcassValue · eMax_perdedor) · effCarn` (limitado a `E_max`). El término `carcassValue·eMax` es la
  **biomasa** del cuerpo (∝ masa), que alimenta ADEMÁS de la energía almacenada → comer un animal nutre
  aunque viniera hambriento. Sin él (`carcassValue=0`, modelo previo) la ganancia = solo energía almacenada:
  en un mundo escaso la presa cría hasta la capacidad de carga pero **magra** (poca E), y cazarla da calorías
  vacías → los carnívoros **se extinguen rodeados de presa abundante** (medido). Un herbívoro puro (`effCarn≈0`)
  no gana nada atacando → la agresión solo se sostiene si la dieta carnívora coevoluciona (emergencia, no la
  regla "los herbívoros no atacan").
- **Coste al fallar (`failDamage`):** si el ataque falla, el atacante **pierde energía**
  (`failDamage · su eMax`) y muere solo si llega a 0. Es el **freno denso-dependiente** que estabiliza
  la depredación: sin coste al fallar, los carnívoros sobre-disparan y colapsan el sistema.

El combate puede desactivarse (`combat.enabled=false`) para validar la selección solo con herbívoros.

### 3bis. Carroña (cadáveres) — hacia el nicho carroñero
Toda muerte deposita un **cuerpo** en el campo `carrion` de su celda (en unidades de energía directa):
- **Muerte natural** (vejez, hambre, combate): cuerpo entero = energía que quede + **biomasa** (`carcassValue·eMax`,
  el tejido). El que muere de hambre tiene `E≈0` → deja solo tejido (cadáver magro).
- **Cazado:** solo **sobras** (`scrapReturn·biomasa`); el depredador ya se llevó casi todo → "restos".

La carroña **decae** cada tick (`resource.carrionDecay`); lo descompuesto vuelve en parte al pasto
(`energy.corpseReturn`) → **ciclo de nutrientes** (cadáver→descomposición→vegetación). La **consume** quien puede
procesar carne (`effCarn`, ritmo `resource.carrionAbsRate`) → puente carroñero que da colchón a los carnívoros en la
escasez (medido: a R_regen 0.0035 multiplica los carnívoros). Render: mancha gris en la celda, opacidad ∝ carroña.

**Eje CAZA ↔ CARROÑA (Fase 2, gen `scav`):** la capacidad carnívora (`meat = diet·omni`) se reparte entre cazar
presa VIVA (`effHunt = meat·(1−scav)·spec`) y CARROÑEAR cadáveres (`effScav = meat·scav·spec·(1+k_scavThin·thin)`),
con `spec = 1 − scavPenalty·4·scav·(1−scav)` que penaliza al generalista → especializa en CAZADOR o CARROÑERO. El
carroñeo rinde más con cuerpo FINO/elongado (`k_scavThin·thin`, reverso del pastador ANCHO). La predación usa
`effHunt`; el carroñeo, `effScav`. El gradiente de comida del cerebro es DEPENDIENTE de dieta (`effHerb·∇recurso +
effScav·∇carroña`) → el carroñero navega hacia los cadáveres con la conducta de búsqueda ya evolucionada. EMERGE el
GUSANO: carroñero pequeño y elongado. La proto-forma (cadena axial de nodos) se SIEMBRA en media cohorte comecarne
para cruzar el valle morfológico (el nicho solo no basta para una forma compleja); cruzado, se mantiene por inercia +
streamlining. Especies/herencia: `scav` es gen base → cuenta en la distancia genética (un carroñero es otra especie).

## 4. Reproducción y herencia

### Siembra inicial
`pop.initial` fundadores. Con `pop.simpleStart=true`, cuerpos **simples** (cabeza + pocos nodos) y
genes con jitter pequeño (`startJitter`) → la complejidad y la apariencia EMERGEN; con `false`, genes
uniformes en `[0,1]`. `startDiversity` regula la variedad inicial. Una fracción `carnivoreSeedFrac`
puede sembrarse como proto-carnívoros (cruza el "valle de fitness" del arranque). Energía inicial
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
`orn` (cuánto exhibe el señuelo) y `pref` (ornamento preferido). Al **elegir pareja**, entre las
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
- **EXCLUIDOS:** el **cerebro** (83 pesos; su deriva dominaría) y los genes **decorativos/neutrales**
  (colores, `c_eye`, `c_lum`, `c_sat`, estilo de señuelo `o_*`, `tex2`). **`osc_phase`** también se excluye
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
- **Tope de población** `pop.maxAgents`: límite **duro del pool** (memoria/FPS), no un punto de
  operación — la capacidad de carga la pone el recurso, no un número (se retiró el viejo `maxAlive`,
  auditoría #5). Al alcanzarlo, el nacimiento se bloquea y el progenitor reintenta tras el cooldown.

Estructura de archivos:
- `engine/world.js` — estado, grid espacial, recurso, campos (luz, temperatura, refugio).
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
5. Reversibilidad: cambiar `mut.sigma`, `R_regen` o `combat.*` altera visiblemente qué estrategias y
   formas dominan, demostrando que la selección responde al ambiente.

Estos criterios deben poder comprobarse desde la propia UI (gráficas, inspector), no leyendo logs.
