# Informe de deuda evolutiva — Zenote

> **Propósito.** Identificar la **deuda evolutiva** y los **parches acumulados**: casos especiales, excepciones,
> mecanismos correctivos, estabilizadores, sistemas de balance artificial, genes/parámetros redundantes y reglas
> que compensan debilidades de otro subsistema. Para cada ítem: **qué problema resolvía · por qué el modelo lo
> necesitaba · qué subsistema es el verdadero responsable · severidad**.
>
> **Este informe NO propone soluciones.** Es diagnóstico. Se apoya en el [mapa de arquitectura](evolution-architecture-map.md),
> el [inventario](evolution-inventory.md), [`ANALISIS_PARAMETROS.md`](../ANALISIS_PARAMETROS.md) y el
> [`CHANGELOG.md`](../CHANGELOG.md) (que documentan el porqué medido de casi cada parche).
>
> **Escala de severidad:**
> - **Crítica** — tensiona la tesis central del proyecto (emergencia real, CLAUDE.md §1) o el sistema falla de
>   forma rutinaria sin el parche.
> - **Alta** — palanca de RÉGIMEN: mal puesta, el ecosistema colapsa o degenera; difícil de afinar (bimodal).
> - **Media** — estabilizador o compensación significativa, principializada a medias y muy tuneada.
> - **Baja** — peso muerto, redundancia inocua o deuda mecánica correcta pero con olor a parche.
>
> **Nota de marco.** Que algo sea "deuda" no implica que esté mal *hoy*. Muchos parches están medidos y
> documentados. Deuda aquí = **el modelo base necesitó una corrección externa porque no producía el resultado
> deseado por sí mismo**. La pregunta de fondo para la refactorización es: *¿cuántos de estos parches
> desaparecerían con un modelo subyacente distinto?*

---

## Resumen ejecutivo (mapa de la deuda)

| # | Ítem | Categoría | Responsable real | Severidad |
|---|---|---|---|---|
| D1 | Sembrado de nichos/proto-formas (proto-carnívoro, gusano, garra) + `seedBrain` | Compensación de valles de fitness | Evolución incapaz de cruzar valles desde cero | **Crítica** |
| D2 | `expr.size.min` (suelo de talla) | Mecanismo correctivo de RÉGIMEN | Eje de talla degenerado + tope de pool | **Alta** |
| D3 | `carcassValue` (biomasa del cadáver) | Regla que compensa el modelo energético | Energética: presa magra = calorías vacías | **Alta** |
| D4 | `omniPenalty` / `scavPenalty` (impuestos a generalizar) | Balance artificial | Dieta: el generalista no se penaliza solo | **Alta** |
| D5 | `forageReach` (forrajeo por área) | Regla que compensa el ingreso plano | Eje de talla: ingreso no escala con talla | **Media-Alta** |
| D6 | Estabilizadores L-V: `refuge.strength`, `fleeSpeed`/`fleeCap`, `handlingTime`, `failDamage` | Estabilización | Depredación Lotka-Volterra inestable | **Media** |
| D7 | Banda de talla `preyBandLo/Hi` + `dietMargin` | Estabilización / caso especial | Combate sin acoplamiento natural de talla | **Media** |
| D8 | Doble vía `forceModel` + legado `effort`/`k_effort`/`effortFloor` | Caso especial / código muerto | Migración de modelo incompleta | **Media** |
| D9 | `maxAgentsCeiling` como regulador de facto | Compensación estructural | r-runaway no frenado por la comida | **Media** |
| D10 | `recomputePhenotypes()` al mover sliders | Caso especial / parche de diseño | Fenotipo cacheado al nacer | **Media** |
| D11 | `seedFloor` + `grazeRefuge` (doble función) | Correctivo / estabilizador | Pastoreo→estado absorbente | **Media** |
| D12 | `wander` (deriva térmica) | Mecanismo correctivo | Cerebro puede "congelarse" | **Baja-Media** |
| D13 | Marca de agua de `serial` (slot reusado en mismo tick) | Caso especial / deuda mecánica | Pool LIFO + nacimiento en el bucle | **Baja-Media** |
| D14 | Exclusiones de `geneticDistance` (cerebro, DECOR, osc_phase) | Excepción | Métrica de especie frágil | **Media** |
| D15 | Genes decorativos `c_lum`/`o_hue`/`o_num` | Genes redundantes | Display sin rol selectivo | **Baja** |
| D16 | `orn`/`pref` (selección sexual de carga débil) | Gen casi redundante | Selección sexual poco apalancada | **Baja-Media** |
| D17 | `o_len`/`o_bulb` (señuelo de nicho minoritario) | Gen casi vestigial | Nicho de emboscada marginal | **Baja-Media** |
| D18 | Rebalanceo de `energyPerUnit` en vivo (worker) | Caso especial de conservación | epu acoplado a la materia en pie | **Baja** |
| D19 | Ramas de sembrado muertas (`seedDietLow`, `simpleStart=false`) | Configuración redundante | Tres modos, uno vivo | **Baja** |
| D20 | Cojines de calibración (`dragRef`, `absMetabBase`, `carrionScent`, `fovRef`, `seed`) | Parámetros redundantes/ad hoc | Superficie de tuning | **Baja** |
| D21 | Caso `'eaten'` (no deja cadáver ni log) | Excepción legítima | Conservación (evita doble conteo) | **Baja** |

---

## Categoría A — Compensaciones de valles de fitness (la deuda más profunda)

### D1 — Sembrado de nichos y proto-formas + cerebro competente · **Crítica**
**Qué es.** El sembrado (`sim.js: _seedInitial`/`_seedSimple`) no parte de organismos aleatorios: coloca a mano
cohortes **proto-carnívoras**, **proto-gusano carroñero** (cadena axial de segmentos) y **proto-cazador-garra**
(apéndices frontales), controladas por `carnivoreSeedFrac` y `startDiversity`. Además, `genome.js: seedBrain()`
arranca todos los cerebros ya **competentes** (van hacia la comida, huyen de la amenaza, con sesgo de ataque en
cazadores).

**Qué problema resolvía.** (a) Con cerebros aleatorios la población se extingue antes de evolucionar conducta
viable. (b) Los nichos (cazador, carroñero) y, sobre todo, las **formas complejas** (gusano elongado, garra de
captura) viven en un **valle de fitness**: el rasgo a medias *cuesta* antes de *pagar* (la garra frena el nado
antes de que su alcance rinda). El CHANGELOG lo dice explícito (2026-06-15): subir `morphReach ×4` **no** inducía
la garra; "fix = sembrar la proto-forma (no es un parámetro)".

**Por qué el modelo lo necesitaba.** El operador de variación (mutación gaussiana por locus + crossover) explora
**localmente**. No hay mecanismo que cruce un valle de fitness ancho (ni temperatura evolutiva, ni andamiaje de
complejidad, ni neutralidad estructural que permita derivar gratis hasta el otro lado). La innovación
morfológica/trófica **no emerge de cero**; hay que depositarla cerca de la solución.

**Subsistema responsable.** El motor evolutivo (genética + selección): la dinámica adaptativa es puramente
*hill-climbing* local sobre un paisaje con valles. El sembrado es el andamio que tapa esa limitación.

**Por qué es crítica.** Tensiona directamente la **regla §1 de CLAUDE.md** ("emergencia real"). El proyecto lo
asume como *bootstrapping legítimo* ("la selección decide si persiste") y está medido (la garra persiste 97-100%
donde sobrevive el gremio). Pero el hecho permanece: **las tres siluetas y los tres gremios no aparecerían sin
plantar sus semillas**. Es deuda conceptual, no un bug. Memorias relacionadas:
`morphology-valley-needs-seeding`, `carnivore-extinction-mutation`.

---

## Categoría B — Mecanismos correctivos de régimen

### D2 — `expr.size.min` (suelo de talla, 4.0) · **Alta**
**Qué problema resolvía.** El **modo de fallo central** (Bucle 2 de `ANALISIS_PARAMETROS.md`): sin suelo, la
población deriva a cuerpos **diminutos** (size µ≈0.13) que, como r-estrategas baratísimos, **saturan el pool**
(`maxAgentsCeiling`, no la materia), pelan el pasto uniforme y borran la presa con talla en banda → el **cazador
se extingue**. El trío trófico solo se validaba a ~5-8k ticks y colapsaba a largo plazo (CHANGELOG 2026-06-14).

**Por qué el modelo lo necesitaba.** Hay un desequilibrio estructural: `reproNeedE ∝ size^massExp` (el pequeño
cría antes) pero el **ingreso** no penaliza ser pequeño lo suficiente. Resultado: presión evolutiva monótona
hacia el mínimo. El suelo es un **tope artificial** que impide expresar esa presión.

**Subsistema responsable.** La energética de talla (alometría) + la ausencia de un coste natural del enanismo.
El `forageReach` (D5) ataca la misma causa por otro lado; entre ambos *parchean* el eje de talla.

**Severidad alta.** Es palanca **MAESTRA** y **bimodal**: "decide la rama, no es un dial fino" (3.0/3.4 aún
satura, 4.0 funciona, 4.5 comprime la diversidad). El sistema vive en un **punto de bifurcación**; un valor mal
puesto degenera el ecosistema entero. Memorias: `parametrizacion-multiescala-anticolapso`,
`trio-trofico-es-transitorio-largo-plazo`.

### D3 — `carcassValue` (biomasa del cadáver, 0.07) · **Alta**
**Qué problema resolvía.** "El cazador se extingue rodeado de presa": al bajar la comida, la presa cría al tope
pero **magra** (poca E almacenada) → cazarla da calorías vacías → carnívoros extintos. `carcassValue` hace que el
cuerpo valga su **biomasa estructural** (∝eMax) *además* de su energía, así cazar presa magra rinde
(memoria `lean-prey-starves-predators`).

**Por qué el modelo lo necesitaba.** El botín de caza estaba ligado solo a la **energía almacenada** de la presa,
que es volátil (una presa hambrienta no vale nada). El modelo energético no reconocía el valor del *tejido*. Para
hacerlo, se introdujo materia estructural en el cuerpo — lo que de paso obligó a la contabilidad de conservación
(`bodyMatter`, tomado del nutriente al nacer).

**Subsistema responsable.** La energética trófica (qué vale una presa) y la representación de "cuerpo" como mero
depósito de energía sin masa estructural propia.

**Severidad alta.** Es la **palanca DOMINANTE herbivoría↔carnivoría** y es **bimodal/no-monótona** (0.18 salió
peor que 0.15 y 0.20; CHANGELOG 2026-06-15): alto → la dieta barre a carnívora y la base herbívora colapsa a
monocultivo comecarne; bajo → cazador casi ausente. "No se puede afinar con precisión, se eligen valores
robustos". Memoria: `carcassvalue-colapso-base-herbivora`.

### D5 — `forageReach` (forrajeo por área, 5) · **Media-Alta**
**Qué problema resolvía.** El ingreso herbívoro era **independiente de la talla** (forrajear una celda), pero el
umbral de cría **sí** dependía de la talla → "todo deriva al mínimo". `forageReach` hace que el grande paste de
un área `(2·round(forageReach·size)+1)²` → la talla **paga** (memoria `forage-area-size-payoff`).

**Por qué el modelo lo necesitaba.** Mismo desequilibrio que D2 visto desde el ingreso. El intento previo de
arreglarlo subiendo el *ingreso-rate* falló por **saturación** del pasto local; hubo que cambiar la *geometría*
del forrajeo. Es explícitamente "el contrapeso que hace pagar la talla" (`ANALISIS_PARAMETROS.md §2`).

**Subsistema responsable.** La alimentación herbívora (acoplamiento talla↔ingreso) y, de fondo, el mismo eje de
talla degenerado de D2.

**Severidad media-alta.** Es palanca de régimen; sin ella el eje de talla colapsa. Más principiada que D2 (modela
algo real: un cuerpo grande barre más terreno), pero sigue siendo un parche dirigido a un síntoma del eje de talla.

### D11 — `seedFloor` + `grazeRefuge` (doble función) · **Media**
**Qué problema resolvía.** `seedFloor` (0.04) evita el **estado absorbente** (pasto→0 irreversible). `grazeRefuge`
(0.20) reserva una fracción intocable del pasto → evita el **sobrepastoreo letal**.

**Por qué el modelo lo necesitaba.** El pastoreo puede llevar una celda a cero y, sin rebrote espontáneo, queda
muerta para siempre (no hay dispersión de semilla suficiente). Y sin reserva, los herbívoros pelan hasta la
extinción local del recurso. Memoria: `herbivore-overgrazing`.

**Subsistema responsable.** La dinámica de vegetación (regeneración) y la ausencia de un refugio espacial natural
del recurso.

**Severidad media + olor a parche.** El olor está en que **`grazeRefuge` hace doble trabajo**: es a la vez (a)
freno del sobrepastoreo y (b) **cobertura del refugio anti-depredador** (`ANALISIS_PARAMETROS.md §1`, §6). Dos
roles ecológicos distintos colgando del mismo número → cualquier ajuste de uno mueve el otro.

---

## Categoría C — Sistemas de balance artificial

### D4 — `omniPenalty` / `scavPenalty` (impuestos a generalizar) · **Alta**
**Qué es.** Parábolas `1 − k·4·x·(1−x)` que **castigan la dieta intermedia** (`omniPenalty`, eje herbívoro↔carne)
y al **generalista caza↔carroña** (`scavPenalty`). Máximo castigo en x=0.5.

**Qué problema resolvía.** "Sin ellos no diverge la morfología" (`ANALISIS_PARAMETROS.md §5`). A `omniPenalty=0`
"los omnívoros arrasan y la morfología no diverge" (memoria `omnipenalty-gates-specialization`). Los impuestos
fuerzan a la población a los **extremos** especialistas → habilitan los tres gremios.

**Por qué el modelo lo necesitaba.** En la física base, el **generalista es demasiado viable**: comer un poco de
todo no tiene un coste intrínseco (no hay incompatibilidad fisiológica real entre rumiar y cazar). La
especialización no emerge de trade-offs naturales, así que se impone con un **impuesto explícito y artificial**.

**Subsistema responsable.** El modelo de dieta: codifica dieta como un escalar continuo `[0,1]` sin maquinaria
digestiva que cree el trade-off por sí misma. La penalización es el sustituto.

**Severidad alta.** Es un **balance artificial declarado**: una mano en la báscula para que existan gremios. Es
palanca de gremio (decide quién coexiste). No es un bug —es deliberado y medido— pero es exactamente "un sistema
de balance artificial" según la pregunta del usuario.

### D6 — Estabilizadores Lotka-Volterra (`refuge.strength`, `fleeSpeed`/`fleeCap`, `handlingTime`, `failDamage`) · **Media**
**Qué es.** Cuatro mecanismos cuyo único fin (declarado en `ANALISIS_PARAMETROS.md §6`: "todos los
estabilizadores Lotka-Volterra viven aquí") es impedir el colapso depredador-presa:
- `refuge.strength` (0.65) — la presa escapa con prob. ∝ vegetación local (cobertura).
- `fleeSpeed`/`fleeCap` (1.0/0.95) — la presa más rápida se zafa, pero **nunca con certeza** (cap 0.95).
- `handlingTime` (60) — enfriamiento tras cazar → satura la tasa de depredación (Holling tipo II).
- `failDamage` (0.1) — coste de fallar un ataque → freno **denso-dependiente**.

**Qué problema resolvía.** La depredación pura es inestable: sobre-disparo del depredador → colapso de la presa →
colapso del depredador (boom-bust). Cada mecanismo amortigua una vía de inestabilidad. `failDamage` bajo se probó
y rompía el freno (boom-bust); `fleeSpeed` se introdujo para que "la presa nunca llegue a cero".

**Por qué el modelo lo necesitaba.** No hay refugios espaciales naturales (el mundo es homogéneo salvo el campo de
pasto), ni saciedad natural del depredador, ni coste físico del intento fallido. Todo eso se **añade a mano** como
constantes de estabilización.

**Subsistema responsable.** La física de combate/depredación, que de base es un proceso de encuentro sin fricción
ecológica. Los cuatro parámetros son la fricción inyectada.

**Severidad media.** Son estabilizadores **principializados** (tienen análogo ecológico real: cobertura,
respuesta funcional, denso-dependencia), pero están **fuertemente tuneados** y acoplados (el CHANGELOG los movió
en bloque varias veces). `fleeCap=0.95` es además una **excepción dura** ("nunca se zafa con certeza") metida para
que el escape no sea absoluto.

### D7 — Banda de talla `preyBandLo/Hi` + `dietMargin` · **Media**
**Qué problema resolvía.** Acopla la talla del depredador a la de la presa (`0.15 ≤ R_presa/R_att ≤ 1.10`) y exige
una diferencia mínima de dieta (`dietMargin`) para considerar presa → evita **canibalismo**, **gigantismo** que
se come todo y estabiliza la coexistencia por nichos de talla.

**Por qué el modelo lo necesitaba.** Sin la banda, cualquiera puede comerse a cualquiera más pequeño → un solo
depredador grande arrasa la cadena. La "selectividad por talla" no emerge de la física de captura; se **impone**
como un rango permitido.

**Subsistema responsable.** El combate: la elegibilidad de presa es una **regla de rango cableada**, no una
consecuencia de la mecánica de captura (alcance, fuerza). `threatLo/Hi` son su espejo precalculado (caso especial
de implementación).

**Severidad media.** Estabilizador de gremio razonable, pero es un **caso especial explícito** ("quién puede
comerse a quién") que sustituye a una mecánica emergente.

---

## Categoría D — Casos especiales, excepciones y deuda mecánica

### D8 — Doble vía `forceModel` + legado `effort`/`k_effort`/`effortFloor` · **Media**
**Qué es.** El bucle de movimiento (`sim.js`) tiene **dos caminos completos**: modelo de fuerza (`forceModel=true`,
actual) y modelo viejo (velocidad fijada a vmax). Persisten parámetros que **solo** sirven al modelo viejo:
`k_effort` (1.6), `effortFloor` (0.2), y el array SoA `effort` (en fuerza siempre vale 1). `organism.js` y
`sim.js` están salpicados de `lo.forceModel ? … : …`.

**Qué problema resolvía.** Es residuo de una **migración de modelo** (CHANGELOG 2026-06-17: locomoción por fuerza).
El camino viejo se conservó por seguridad/comparación.

**Por qué el modelo lo necesitaba.** No lo necesita: `forceModel` es `true` y `↻` (no se toca en caliente). El
camino muerto y sus parámetros son **deuda de migración** pura.

**Subsistema responsable.** Locomoción: la migración no se cerró con una poda.

**Severidad media** (no biológica, sí de mantenibilidad): triplica la superficie de razonamiento del movimiento,
y los parámetros legados aparecen en la UI/inventario como si fueran vivos cuando son inertes con el default.

### D9 — `maxAgentsCeiling` como regulador de facto · **Media**
**Qué problema resolvía.** Es un tope **duro** del pool por memoria/perf. En teoría no debería ser el punto de
operación (la comida debería limitar antes).

**Por qué el modelo lo necesitaba (mal).** En el modo de fallo del Bucle 2 (r-runaway con cuerpos diminutos), la
comida **no** frena la población → el tope del pool se convierte en el **regulador real**, lo que degrada todo
(`ANALISIS_PARAMETROS.md §8`: "este número se vuelve el límite real → degradación"). Es decir, un límite **técnico**
acaba haciendo de **límite ecológico** cuando D2 no sujeta la talla.

**Subsistema responsable.** El cruce entre la dinámica de población (sin regulación natural robusta) y una
restricción de implementación (tamaño del pool). Que un parámetro de memoria tenga consecuencias ecológicas es el
síntoma.

**Severidad media.** Acoplada a D2: si el suelo de talla está bien puesto, este tope no muerde. Pero el
acoplamiento mismo es deuda (un parámetro técnico y uno ecológico comparten la responsabilidad de regular la pop).

### D10 — `recomputePhenotypes()` al mover sliders · **Media**
**Qué problema resolvía.** El fenotipo se cachea **al nacer** (perf). Por eso, mover un slider que se expresa en el
fenotipo solo afectaba a las **crías futuras** → contradecía "los (UI) afectan en vivo" (CLAUDE.md §4). El parche
(CHANGELOG 2026-06-15) re-expresa a **todos los vivos** al cambiar un slider no-render.

**Por qué el modelo lo necesitaba.** Tensión entre dos decisiones: (a) cachear el fenotipo para no recomputar cada
tick, y (b) parámetros configurables en vivo. El caché-al-nacer es la causa.

**Subsistema responsable.** La frontera gen→fenotipo + la política de caché. La re-expresión global es la costura
entre el caché y la UI en vivo; arrastra excepciones ("no toca E/edad/posición/memoria/bodyMatter para conservar").

**Severidad media.** Funciona y está medido (0% de salto), pero es un caso especial que existe **solo** por la
optimización de caché; un modelo sin caché no lo tendría.

### D13 — Marca de agua de `serial` (slot reusado en el mismo tick) · **Baja-Media**
**Qué problema resolvía.** El pool es una pila LIFO: un slot liberado por una muerte y **reutilizado por una cría
en el mismo tick** se re-procesaba en su tick de nacimiento (el guard `!alive` no basta porque el slot "revive").
Se filtra con `serialOf[i] > maxSerial` (CHANGELOG 2026-06-15: 88 casos/2000 ticks → 0).

**Por qué el modelo lo necesitaba.** Consecuencia directa de **iterar la lista activa mientras se crean agentes en
ella** sobre un pool reciclado. Deuda mecánica de la representación SoA + nacimiento dentro del bucle.

**Subsistema responsable.** El bucle de `sim.step` y la gestión del pool.

**Severidad baja-media.** Correcto y barato, pero es un caso especial sutil; junto con `serialOf` (necesario para
invalidar el caché de sprites y seguir la selección) es deuda de la arquitectura SoA/pool, no biológica.

### D14 — Exclusiones de `geneticDistance` (cerebro, DECOR, osc_phase) · **Media**
**Qué es.** La distancia genética (que **define la especie** y la compatibilidad de cruce) **excluye**: los 109
pesos del cerebro, los genes decorativos (`c_lum`, `o_hue`, `o_num`) y, por nodo, `osc_phase`.

**Qué problema resolvía.** Si se incluyera el cerebro, "su deriva dominaría la métrica" (109 de 208 loci). Si se
incluyeran los decorativos o la fase absoluta, habría **especiación espuria** por deriva neutral.

**Por qué el modelo lo necesitaba.** La métrica de especie es **euclídea plana** sobre genes crudos: muy sensible a
qué loci entran y a su escala relativa. No hay un concepto de especie emergente (p.ej. aislamiento reproductivo
real); se aproxima con una distancia que **hay que curar a mano** quitando los loci "molestos".

**Subsistema responsable.** La especiación: definición de especie por umbral de distancia sobre un subconjunto de
genes elegido por el programador. Las exclusiones son la prueba de que la métrica es frágil.

**Severidad media.** Load-bearing (el umbral gobierna `_findMate` → quién se cruza) y a la vez delicada: cualquier
gen nuevo obliga a decidir si "cuenta" para la especie.

### D18 — Rebalanceo de `energyPerUnit` en vivo · **Baja**
**Qué es.** Al cambiar `energyPerUnit` por slider, el worker reabsorbe la diferencia en el pool `N` para que la
materia total no salte (`worker.js: onmessage 'set'`).

**Qué problema resolvía.** `epu` es el tipo de cambio pasto↔materia↔energía y aparece **a la vez** en el ingreso y
en la **ecuación de conservación** (`res·epu`). Cambiarlo en vivo reescalaría la materia en pie → rompería la
conservación.

**Por qué el modelo lo necesitaba.** `epu` es un parámetro **transversal** que toca dos invariantes. La pecera
cerrada obliga a un parche de reajuste cada vez que se mueve.

**Subsistema responsable.** El acoplamiento materia↔energía a través de un único factor `epu` usado en dos roles.

**Severidad baja** (caso aislado y correcto), pero ilustra que la conservación de materia introduce casos
especiales en cada parámetro que toca la materia.

### D21 — Caso `'eaten'` (no deja cadáver ni log de muerte) · **Baja**
**Qué es.** `_kill(i, cause)`: una muerte natural deposita el cuerpo entero como carroña y se registra para el
render; una muerte por depredación (`'eaten'`) **no** (su materia ya la repartió la depredación → evitar doble
conteo).

**Qué problema resolvía / por qué.** Conservación de materia: la depredación ya movió `E + bodyMatter` de la presa
al cazador/restos. Volver a depositar carroña duplicaría materia.

**Subsistema responsable.** Conservación; es una **excepción legítima** de contabilidad, no un parche de balance.

**Severidad baja.** Bien justificado; se lista por completitud (es un caso especial explícito en el código de muerte).

---

## Categoría E — Genes redundantes

### D15 — `c_lum`, `o_hue`, `o_num` (decorativos puros) · **Baja**
**Qué son.** Luminosidad/glow y estilo del señuelo (color del bulbo, número de filamentos). **Excluidos de la
especie** (`DECOR`), sin efecto en la dinámica (solo render).

**Por qué son deuda.** Ocupan loci en el genoma y **no están bajo selección**. La memoria
`decor-gene-cost-noop-in-small-subpop` documenta que se intentó darles carga (costar `o_num`, "visibilidad") y
**ambos enfoques se descartaron** (la deriva los fija por inmigración; el nicho es near-apex y biestable). Son,
por diseño actual, **peso muerto genético**.

**Subsistema responsable.** El display: rasgos cosméticos modelados como genes heredables sin función. La deriva
neutral los mantiene sin que aporten nada a la evolución.

**Severidad baja.** Inocuos (incluso deseables estéticamente), pero son redundancia evolutiva pura: 3 loci que no
hacen evolución.

### D16 — `orn` / `pref` (selección sexual de carga débil) · **Baja-Media**
**Qué son.** Ornamento exhibido y preferencia de pareja → runaway de Fisher en `_findMate` (atractivo
`1−|orn−pref|`).

**Por qué son deuda.** La memoria `simplificacion-ablacion-2026-06` los marca "load-bearing" (no se podaron en la
ablación), pero su **carga selectiva es débil**: la elección de pareja solo desempata entre compatibles dentro del
radio. Están en la frontera entre "mecanismo real" y "rasgo casi neutral". El propio inventario los marca *Mixto*.

**Subsistema responsable.** La reproducción sexual: la selección sexual está implementada pero con un acoplamiento
flojo al éxito reproductivo (no filtra fuerte).

**Severidad baja-media.** Riesgo de ser **complejidad que no se gana su sitio**; difícil de afirmar sin medir su
efecto real sobre la deriva de `orn`/`pref`.

### D17 — `o_len` / `o_bulb` (señuelo de nicho minoritario) · **Baja-Media**
**Qué son.** Tamaño del órgano-señuelo de emboscada. Afectan a la física (alcance + atracción de presa) pero
**solo los expresa la pequeña fracción de cazadores de emboscada** (gate `lureGate`), y se excluyen de la especie.

**Por qué son deuda.** Es un nicho **marginal y frágil** (`pecera-pequena-contemplativa-scope`: el nicho cazador no
tiene masa crítica). Dos loci físicos + tres decorativos + 4 parámetros de combate (`lureGate`, `lureReach`,
`lureAttract`, `k_lure`) sostienen un gremio que es minoría de una minoría. Hubo que **sembrarlo** (D1) para que
existiera.

**Subsistema responsable.** El combate/depredación: un sub-nicho (emboscada) que requiere su propia maquinaria
genética y paramétrica para sostenerse contra la deriva.

**Severidad baja-media.** Relación coste/beneficio cuestionable: mucha superficie (genes + params + sembrado) por
un fenómeno raro. No daña, pero es complejidad concentrada en un caso de borde.

---

## Categoría F — Parámetros redundantes / cojines de calibración

### D19 — Ramas de sembrado muertas · **Baja**
`pop.seedDietLow` (false) y `pop.simpleStart=false` (el camino de genes aleatorios) son **ramas de configuración
prácticamente muertas**: el default es `simpleStart=true`, `seedDietLow=false`. Existen tres modos de sembrado y
solo uno se usa. **Responsable:** acumulación histórica de modos de arranque. **Severidad baja** (código condicional
inerte; confunde al leer `_seedInitial` vs `_seedSimple`).

### D20 — Cojines de calibración ad hoc · **Baja**
Parámetros que existen para **suavizar** otra ecuación, sin significado biológico propio:
- `dragRef` (1.1) — "colchón": el arrastre solo paga por encima de este umbral.
- `absMetabBase` (0.5) — suelo para que a metab=0 aún se paste algo.
- `carrionScent` (3) — escala del olfato de carroña en el gradiente.
- `fovRef` (3.05) — FOV de referencia para "conservar el área visual".
- `seed` (123) — semilla por defecto **sobrescrita** por el worker con una aleatoria → vestigial.
- `oscFloor`, `effortFloor`, `symBase`, `vMin`, `seedFloor` — suelos varios.

**Por qué son deuda.** Cada uno es un número elegido para que una fórmula "se porte bien" en un régimen. Suman a
la **gran superficie de tuning** que `ANALISIS_PARAMETROS.md` clasifica como "finos (matizan, no cambian
régimen)". **Subsistema responsable:** transversal — fórmulas calibradas a mano que necesitan colchones para no
divergir en los bordes. **Severidad baja** individualmente; en conjunto, son la masa de "mixto/ad hoc" del
inventario (la mayor parte de `config.loco` y `config.energy`).

---

## Categoría G — Mecanismos correctivos menores

### D12 — `wander` (deriva térmica, 0.08) · **Baja-Media**
**Qué problema resolvía.** "Explora aunque el cerebro calle (evita que un fundador se congele en un baldío)"
(`config.js`). Un jitter de velocidad de fondo, presentado como "física, no estrategia".

**Por qué el modelo lo necesitaba.** El cerebro puede emitir deseo ≈0 (sin gradiente de comida, sin presa/amenaza)
→ el organismo se **para** en un sitio sin recursos y muere sin moverse. `wander` lo empuja a explorar.

**Subsistema responsable.** El cerebro/locomoción: no hay un impulso exploratorio emergente (curiosidad, marcha
aleatoria) cuando faltan estímulos; se inyecta como ruido externo.

**Severidad baja-media.** Pequeño y razonable (la difusión térmica existe en la naturaleza), pero es una corrección
a que **la conducta de exploración no emerge** del cerebro por sí sola en ausencia de señal.

---

## Lectura transversal (para la refactorización)

**1. Casi toda la deuda alta/crítica converge en dos causas raíz:**
- **(R1) La evolución es hill-climbing local sin forma de cruzar valles** → obliga al sembrado de nichos y formas
  (D1), y a impuestos artificiales que fabrican la divergencia que no emerge (D4).
- **(R2) El eje de talla está estructuralmente sesgado al mínimo** (ingreso plano vs umbral de cría ∝talla) →
  obliga al suelo de talla (D2) y al forrajeo por área (D5), y hace que el tope técnico del pool acabe regulando la
  ecología (D9). `carcassValue` (D3) es la cara trófica del mismo desequilibrio energético.

**2. La estabilidad ecológica se compra con constantes, no emerge.** Toda la coexistencia depredador-presa
descansa en cuatro estabilizadores L-V tuneados (D6) + la banda de talla cableada (D7). El mundo no tiene fricción
ecológica natural (refugios espaciales, saciedad, coste de intento), así que se añade a mano.

**3. Hay deuda de migración y de optimización claramente acotada y barata de saldar conceptualmente:** la doble
vía `forceModel` y sus parámetros legados (D8), el caché-al-nacer y su re-expresión (D10), la marca de agua del
pool (D13). No tocan la biología; son residuos de evoluciones del código.

**4. La periferia genética (display, señuelo, selección sexual) acumula loci de carga débil o nula** (D15, D16,
D17): mucha superficie genética + paramétrica por fenómenos cosméticos o de borde. Riesgo de complejidad que no se
gana su sitio.

**5. La conservación de materia, aunque fundamental, introduce casos especiales en cascada** (D18 epu, D21 eaten,
las excepciones de `recomputePhenotypes`): cada parámetro que toca la materia hereda una regla de reajuste.

**6. El sistema es bimodal y vive en un punto de bifurcación** (D2×D3×D9): las palancas maestras "no se afinan
fino", lo que es en sí un indicador de deuda — un modelo bien condicionado no debería tener sus parámetros
centrales en una frontera de colapso.
```
