# Especificación del motor evolutivo — "Zenote / Primordia"

Este documento define las reglas exactas de la simulación. Es la **fuente de verdad**
sobre genética, mutación y selección. El motor debe implementar esto fielmente; la
parte visual es secundaria al cumplimiento de estas reglas.

> **Modelo v2.0 (jun 2026).** El cuerpo dejó de ser categorías hechas a mano
> (cabeza/segmentos/apéndices) y pasó a ser un **genoma generativo por nodos**: forma y
> locomoción EMERGEN de la selección. Si encuentras menciones a `m_app`, `m_seg`, `mod*`,
> `s_*`, `maxAlive` o "carroña comestible" en código o notas viejas, son del modelo
> anterior. La progresión y el estado vivo del proyecto están en `ESTADO.md` y `AUDIT_EVOLUCION.md`.

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
- **Campo de "color de la luz":** un tono fijo por región (ruido de baja frecuencia). Define qué
  color de pigmento absorbe mejor el recurso en cada zona (ver §3 y el gen `hue`). El paisaje
  lumínico lo pone el programador; el color de los organismos lo decide la evolución.
- **Temperatura:** eje escalar continuo por región con gradiente espacial (`resource.tempFreq`).
  El gen `temp_pref` es el óptimo térmico; desviarse multiplica el coste basal (`energy.k_temp`).
- **Refugio de presa** (`refuge`): una fracción del mundo (`refuge.frac`, celdas de mayor
  capacidad) donde la presa **no es cazable**. Estabilizador tipo Lotka-Volterra (la presa
  nunca llega a cero → evita el colapso del sistema). Es física del mundo, no conducta.

## 2. El organismo

Cada agente tiene **estado dinámico** (fenotipo que cambia en vida) y un **genoma** (fijo en
vida, heredado con mutación).

### Estado dinámico
- posición (x, y), velocidad (vx, vy), energía `E` (muere si `E ≤ 0`), edad, cooldown de cría.
- estado oculto del cerebro recurrente (memoria entre ticks, ver §cerebro).
- `lineageId` (id del fundador ancestral, **heredado sin mutación** → ascendencia auditable) y
  `generation`. No afectan a la física; son trazadores de linaje, independientes del color.

### Genoma — **167 genes** float en `[0,1]` (SoA: `Float32Array`)

El genoma se divide en cuatro bloques contiguos (orden en `genome.js`):

| Bloque | Nº | Genes |
|--------|----|-------|
| **Ecología / fisiología** | 13 | `size`, `speed`(esfuerzo), `sense`, `metab`, `diet`, `aggro`, `w_food`, `w_prey`, `w_flee`, `repro_thr`, `invest`, `hue`, `temp_pref` |
| **Identidad / display** | 13 | `c_app`, `c_tip`, `e_fov`, `c_eye`, `orn`, `pref`, `c_lum`, `c_sat`, `o_len`, `o_bulb`, `o_hue`, `o_num`, `tex2` |
| **Cuerpo por NODOS** | 64 | 8 nodos × 8 campos (ver §2bis) |
| **Cerebro neuronal** | 77 | pesos de la RNN (ver §cerebro) |

**Genes de ecología/fisiología:**

| Gen | Expresión / efecto |
|-----|--------------------|
| `size` | radio = `lerp(expr.size)` px. Mayor tamaño → más `E_max` y ventaja en combate, pero más coste basal (`k_size`) y peor giro. **No afecta a la velocidad** (ver §2bis). |
| `speed` | **ESFUERZO de nado** (acelerador 0..1), NO velocidad. Modula la amplitud de oscilación de los nodos (`effort`) y el coste de moverse. La velocidad EMERGE de la forma (§2bis). |
| `sense` | inversión visual → alcance base de visión + coste (`k_sense`). El reparto alcance↔ángulo lo hace `e_fov` (§2ter). |
| `metab` | escala a la vez el ritmo de alimentación y el coste basal (`k_metab`). Alto = come y rinde más pero quema más. Trade-off, sin "mejor". |
| `diet` | 0 = herbívoro puro (come del campo), 1 = carnívoro puro (caza). Intermedio = omnívoro penalizado (`omniPenalty`). |
| `aggro` | probabilidad de iniciar ataque al contactar a una presa válida (§3.1). También define el "ceño" en el render (los depredadores parecen feroces porque *evolucionan* aggro alto). |
| `w_food`/`w_prey`/`w_flee` | pesos del **modo reactivo** (atracción a comida / a presa / repulsión de amenaza). Solo se usan si `sim.brain='reactive'`; con el cerebro neuronal (defecto) derivan. Factor `lerp(0, expr.wMax)`. |
| `repro_thr` | umbral de energía para criar: `lerp(expr.repro_thr)` de la referencia (§4). |
| `invest` | energía transferida a cada cría: `lerp(expr.invest)` de la referencia. |
| `hue` | tono del organismo. **Rasgo adaptativo:** cuanto mejor sintoniza con el "color de la luz" local, mejor absorbe el recurso (§3). Muta como cualquier gen. |
| `temp_pref` | óptimo térmico; la desviación frente a la temperatura local multiplica el coste basal (`k_temp`). Segundo eje de nicho. |

**Genes de identidad / display:** color por partes (`c_app`, `c_tip`), color de ojo (`c_eye`),
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
La decisión la toma una **red neuronal recurrente diminuta (Elman)** cuyos **pesos SON genes**
(`sim.brain='neural'`, por defecto):

- Topología `BRAIN = {I:7, H:5, O:2}`, **77 pesos** (`BRAIN_W` = I·H + H·H + H + H·O + O):
  entrada→oculta, **oculta→oculta (memoria)**, sesgos ocultos, oculta→salida, sesgos salida.
  El estado oculto **persiste entre ticks** (memoria → búsqueda/persistencia emergente).
- **Entradas (7):** gradiente de comida (x,y), dirección a la presa (x,y), dirección a la
  amenaza (x,y), energía. **Salidas (2):** vector de deseo de movimiento (dx,dy). Pesos = `(gen−0.5)·scale`.
- Nada de estrategia programada: pastar/cazar/huir **emerge 100% de los pesos seleccionados**.
- Los pesos se **excluyen de la distancia genética** (no contaminan las especies). Un fundador
  se siembra con una conducta competente de partida (≈ regla reactiva) y la evolución la **afina**.
- **Modo reactivo** (`'reactive'`): alternativa de regla fija parametrizada por `w_food/w_prey/w_flee`;
  sigue en el código pero no se expone en la UI. (Backlog #9/#10: retirar el modo reactivo y plegar
  `aggro` como una salida más del cerebro → conducta 100% neuronal.)

## 2bis. Locomoción y forma emergentes — el cuerpo GENERATIVO por nodos

La velocidad, el giro y la forma **no son genes directos**: emergen de un **grafo de nodos**. El
programador define la física (empuje vs. arrastre por orientación); la selección esculpe el grafo.
La frontera vive en `bodyplan.js` (geometría → escalares) y `organism.js` (escalares → fenotipo),
cacheada al nacer. Todo en unidades del radio de cabeza (`r` se cancela: empuje y arrastre escalan
igual con el tamaño → **encoger no regala velocidad**; clave para la coexistencia presa-depredador).

### El grafo de nodos (64 genes = 8 nodos × 8 campos)
Una sola primitiva: el **nodo**. `NODE_COUNT = 8`. Campos por nodo:
`present`, `parent`, `size`, `aspect`, `angle`, `attach`, `osc_amp`, `osc_phase`.

- **Nodo 0 = raíz (cabeza)**, siempre presente. Su `aspect` define el ancho del cuerpo
  (redondo → ancho con masa+arrastre; fino → estilizado). Es el motor base (empuja hacia delante).
- **Nodos 1..7 opcionales** (`present ≥ 0.5`). Cada uno:
  - `aspect` 0 = **lóbulo/segmento** redondo (aporta **masa + arrastre**, `_ar`); 1 = **tentáculo/aleta**
    fino y largo (aporta **superficie hidrodinámica** `_limbAr`, sin masa). El continuo lóbulo↔tentáculo
    es una sola primitiva — no hay "tipos" de pieza.
  - `angle` → orientación real `emit = angle·π` ∈ [0,π] (0 = al frente, π = atrás del eje de nado).
  - Un nodo **lateral** (`min(emit, π−emit) > EPS_AXIS`, 0.35) se cuenta **espejado** (par bilateral ×2);
    uno **medial** va solo. La **simetría bilateral EMERGE** del ángulo, no se impone.
  - `parent`/`attach` definen la topología (de quién cuelga y dónde). `osc_amp` = cuánto ondula este
    nodo. `osc_phase` = fase de su oscilación (**funcional**: coordinación de marcha, ver más abajo).

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

**Capacidad.** `eMaxBase = E_max_base · (0.5 + size)`; `E_max = eMaxBase · massMul`, donde
`massMul ≥ 1` viene de la masa corporal (nodos lóbulo/segmento). La masa añade **reserva** (buffer
para hambrunas), pero —clave— la **reproducción NO depende de la masa** (ver §4): así la complejidad
no frena la cría ni da velocidad. `energyPerUnit` convierte recurso normalizado a energía
(**parámetro de equilibrio más sensible**: muy bajo → mueren al arranque; muy alto → explota al tope).

Por tick, cada organismo:

- **Coste basal:**
  `c_base · (1 + k_metab·metab) · (1 + k_size·size + k_sense·sense + k_body·(massMul−1) + k_lure·lure)`.
  Más grande, con más visión, más masa y con señuelo luminoso → más caro de mantener. El coste es el
  **mismo sea cual sea la dieta** (sin descuentos por categoría; las muletas `carnUpkeep`/`k_sizeHerb`
  se retiraron, auditoría #6). Los nodos finos (tentáculos) son hidrodinámicos pero **no cuestan masa**.
- **Movimiento (nado):** coste extra `moveCost · dist² · (1 + k_effort·effort)`, **cuadrático en la
  velocidad** (arrastre). El basal cobra por *tener* cuerpo; el nado cobra por *usarlo* yendo rápido.
- **Alimentación** (ritmo `absEff = absRate · (0.5 + metab) · (1 + k_graze·(massMul−1))`; más masa =
  más superficie de pasto → ata la complejidad al nicho herbívoro):
  - **Eficiencia de dieta:** `omni = 1 − omniPenalty · 4·diet·(1−diet)` (0 en los extremos, máx en 0.5);
    `effHerb = (1−diet)·omni`, `effCarn = diet·omni`. El especialista no paga; el omnívoro sí.
  - **Sintonía de color:** `colorMatch = 1 − matchPenalty · 2·distCirc(hue, luz_local)`. Pigmento
    sintonizado capta más recurso; desajustado, menos. Aquí el color se vuelve seleccionable.
  - Herbívoro absorbe `min(E_falta, recurso_celda · absEff · colorMatch · energyPerUnit) · effHerb`;
    el recurso de la celda baja en lo absorbido. Carnívoro: gana al cazar (§3.1).
- **Señuelo bioluminiscente** (`lure`): órgano FUNCIONAL gateado por `orn` (`orn > 0.12`),
  prominencia `(0.2 + o_len)·(0.4 + o_bulb)`. Cuesta energía (`k_lure`) y **extiende el alcance de
  captura** al cazar (`combat.lureReach`). El carnívoro lo recupera cazando → evoluciona señuelos
  largos; el herbívoro solo paga → los pierde. La correlación señuelo↔dieta **emerge**.
- **Reproducción:** §4. **Muerte por hambre:** `E ≤ 0`.
- **Muerte por vejez** (senescencia estocástica): cada tick muere con prob.
  `age.mortality · (max(0, edad − age.mature) / age.scale)²`. Sin tope duro.
- **Reciclaje del cadáver:** al morir **por hambre o vejez** deposita `corpseReturn · E` como recurso
  en su celda (respetando `R_max`). Una presa muerta **por depredación NO deposita cadáver** (su
  energía ya se la queda el depredador → la energía se conserva, no se contabiliza dos veces).
  *(No existe subsistema de "carroña comestible": se retiró en auditoría #11; el cadáver solo
  realimenta el campo de recurso.)*

La selección **NO es una función de fitness explícita**: simplemente, **los que se quedan sin energía
mueren y no se reproducen.** El fitness emerge.

### 3.1 Combate / depredación (física trófica, no conducta)
El atacante solo puede atacar a un agente que, al **solaparse** (distancia < suma de radios + bonus
de señuelo `lureReach`), cumpla:
- **(a) talla cazable:** el ratio `presa/depredador` está en la banda `[preyBandLo, preyBandHi]`
  (ni demasiado pequeña para que compense, ni mayor de lo que `preyBandHi` permita arriesgar);
- **(b) dieta:** la presa está al menos `dietMargin` **más abajo en la dieta** (presa real, no un igual);
- **(c)** el atacante **no está en tiempo de manejo** y **decide atacar** (con probabilidad `aggro`).

> **Por qué (a) y (b)** (física trófica, no conducta codificada): un depredador no caza a otro de
> dieta similar (evita canibalismo y la **carrera al gigantismo**); y la banda de talla acopla el
> tamaño del depredador al de su presa. **Las fugas de la presa quedan cerradas:** hacerse gigante
> (caro por `k_size`), encoger por debajo de la banda (deja de rentar como presa pero pierde otras
> ventajas), o subir su propia dieta (paga eficiencia herbívora). Resultado: **coexistencia estable**.

- **Tiempo de manejo (`handlingTime`):** tras una captura el ganador no puede atacar durante N ticks
  (digestión). Satura la tasa de depredación → la presa amortigua → coexistencia en vez de colapso.
- **Resolución estocástica:** fuerza de cada contendiente ∝ tamaño y `aggro`, con el tamaño elevado a
  `combat.sizeAdvantage`. `P(gana atacante) = f_att / (f_att + f_def)`. Nadie gana "por regla".
- **Al vencer:** el perdedor muere (sin cadáver); el ganador recibe `preyGain · E_perdedor · effCarn`
  (limitado a `E_max`). Un herbívoro puro (`effCarn≈0`) no gana nada atacando → la agresión solo se
  sostiene si la dieta carnívora coevoluciona (emergencia, no la regla "los herbívoros no atacan").
- **Coste al fallar (`failDamage`):** si el ataque falla, el atacante **pierde energía**
  (`failDamage · su eMax`) y muere solo si llega a 0. Es el **freno denso-dependiente** que estabiliza
  la depredación: sin coste al fallar, los carnívoros sobre-disparan y colapsan el sistema.

El combate puede desactivarse (`combat.enabled=false`) para validar la selección solo con herbívoros.

## 4. Reproducción y herencia

### Siembra inicial
`pop.initial` fundadores. Con `pop.simpleStart=true`, cuerpos **simples** (cabeza + pocos nodos) y
genes con jitter pequeño (`startJitter`) → la complejidad y la apariencia EMERGEN; con `false`, genes
uniformes en `[0,1]`. `startDiversity` regula la variedad inicial. Una fracción `carnivoreSeedFrac`
puede sembrarse como proto-carnívoros (cruza el "valle de fitness" del arranque). Energía inicial
`E = 0.5·E_max`. Si `pop.seed` es un número, el RNG es **reproducible** (mismo seed → misma corrida).

### Referencia de reproducción y compromiso r/K (auditoría #4)
`reproRef = eMaxBase = E_max_base · (0.5 + size)` (acoplada al tamaño igual que la energía).
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
- **EXCLUIDOS:** el **cerebro** (77 pesos; su deriva dominaría) y los genes **decorativos/neutrales**
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
Ver `CONFIG.md` (referencia completa de parámetros, rangos y cuáles son *(UI)*). Deben poder
cambiarse sin tocar el motor; los *(UI)* afectan a la simulación en vivo.

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
