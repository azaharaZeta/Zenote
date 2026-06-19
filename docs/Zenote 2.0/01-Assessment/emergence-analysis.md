# Análisis de emergencia — Zenote

> **Propósito.** Para cada conducta importante del ecosistema, separar **lo que es genuinamente emergente** (sale
> de la selección sobre genes) de **lo que está cableado** (física escrita por el programador), **lo que depende
> del tuning** y **lo que colapsa si se quita el tuning**. Es la prueba de fuego de la regla §1 de CLAUDE.md
> ("emergencia real").
>
> Se apoya en el [mapa de arquitectura](evolution-architecture-map.md), el [inventario](evolution-inventory.md),
> el [informe de deuda](evolution-debt-report.md), `ANALISIS_PARAMETROS.md`, `CHANGELOG.md` y las memorias del
> proyecto. No propone cambios.

## Marco de análisis — tres capas

Toda conducta del simulador se sitúa en tres capas, y "emergente" significa cosas distintas en cada una:

1. **Física del mundo (cableada).** Lo que el programador define: cómo se absorbe pasto, cómo se resuelve un
   combate, qué cuesta nadar. Son **leyes inmutables**. Nunca dicen *qué gen es bueno*.
2. **Expresión gen→fenotipo (cableada, pero la entrada evoluciona).** La frontera (`organism.js`/`bodyplan.js`):
   traduce genes a física. La *fórmula* es del programador; el *valor* del gen evoluciona.
3. **Conducta y estrategia (emergente).** Qué hace el organismo (cazar, huir, pastar, atacar, parar, criar) sale
   del **cerebro neuronal (pesos=genes)** y de la **deriva de los genes ecológicos** bajo selección.

**Definición operativa de "emergente" aquí:** un resultado es emergente si **nadie lo escribió como objetivo** y
**aparece (o no) según quién sobrevive y se reproduce**. Distingo tres grados:

- 🟢 **Emergente genuino** — sale de la selección; el programador solo puso la física y la posibilidad.
- 🟡 **Andamiado (bootstrapped)** — el *mecanismo* es emergente, pero hay que **sembrar la semilla** o **inclinar
  la báscula** (impuesto) para que aparezca; sin ese empujón, no surge desde cero.
- 🔴 **Cableado / impuesto** — es una regla fija o un estabilizador externo; no emerge, se programa.

---

## Tabla veredicto (de un vistazo)

| Conducta | Decisión (qué hacer) | Mecánica (cómo funciona) | Que EXISTA el patrón | ¿Colapsa sin tuning? |
|---|---|---|---|---|
| Herbivoría | 🟢 emergente (cerebro) | 🔴 cableada | 🟢 robusta (default) | Diversidad sí (forageReach) |
| Carnivoría | 🟢 emergente (cerebro) | 🔴 cableada | 🟡 **andamiada (sembrada)** | **Sí — frágil** |
| Carroñeo | 🟢 emergente (cerebro) | 🔴 cableada | 🟡 andamiado (gusano sembrado) | Forma sí |
| Competencia | 🟢 **emergente pura** | 🔴 recurso finito | 🟢 robusta | No |
| Estrategias r/K | 🟢 emergente (deriva) | 🔴 umbral cableado | 🟢 emerge de energética | **Sí (suelo de talla)** |
| Depredador-presa | 🟡 oscilación emergente | 🔴 **estabilizadores cableados** | 🔴 **comprada con constantes** | **Sí — el más frágil** |
| Control de población | 🟢 endógeno (materia) | 🔴 conservación + tope | 🟢 si el régimen es sano | **Sí (régimen)** |
| Diversidad morfológica | — | 🔴 física de forma | 🟡 **sembrada + impuestos** | **Sí (sembrado + penalizaciones)** |
| Diversidad conductual | 🟢 **emergente pura (RNN)** | 🔴 arquitectura fija | 🟡 arranque sembrado | Repertorio no; viabilidad sí |

---

## 1. Herbivoría

**Genuinamente emergente** 🟢
- La **decisión** de pastar: el cerebro asciende por el gradiente de comida (entradas 0,1, ponderadas por
  `effHerb`). Nadie programó "busca pasto"; es el cerebro evolucionado.
- La deriva del gen `diet` hacia el extremo herbívoro bajo selección.
- La **morfología de pastador** (cuerpo ancho → `k_grazeWide` premia barrer más recurso) emerge de la geometría
  de nodos seleccionada.

**Cableado** 🔴
- La **mecánica de absorción**: `absEff`, el descuento del refugio de rebrote (`grazable = res − grazeRefuge·cap`),
  la conversión `units·epu·effHerb`, el residuo no asimilado que va a nutriente. Todo es física fija.
- `effHerb = (1−diet)·omni` — la fórmula de eficiencia es del programador.

**Depende del tuning**
- `absRate`, `energyPerUnit`, `k_graze`/`k_grazeWide`, `forageReach`, y la productividad (`closedRegen`,
  `matterBudget`).
- `omniPenalty` decide si existe el **herbívoro puro** (sin él, el omnívoro domina).

**Qué colapsa si se quita el tuning**
- La herbivoría *como tal* es **robusta** (es el estado por defecto sembrado y el más fácil de sostener).
- Pero **sin `grazeRefuge`/`seedFloor`** → sobrepastoreo hasta el **estado absorbente** (pasto→0 irreversible;
  memoria `herbivore-overgrazing`).
- **Sin `forageReach`** → el ingreso no escala con la talla → todos derivan a enanos → desaparece la **diversidad
  de talla** dentro del gremio (deuda D5). La herbivoría sobrevive; su diversidad no.

---

## 2. Carnivoría

**Genuinamente emergente** 🟢
- La **decisión de atacar**: `atkOut` es la 3ª salida del cerebro; cazar emerge de los pesos, **no hay gen
  `aggro`**. La persecución, el elegir presa por talla relativa (entrada 8) y por escapabilidad (entrada 9) son
  conducta neuronal.
- La deriva de `diet` hacia carne y la **morfología cazadora** (visión frontal estrecha vía `e_fov`, garra frontal
  vía `fwdReach`→`morphReach`).

**Cableado** 🔴
- La **resolución del combate**: `P = fi/(fi+fj)` con `fi=(size+0.1)^sizeAdvantage`; la elegibilidad por banda de
  talla; el botín `preyGain·(E+carcassValue·eMax)·effHunt`. La transferencia trófica es física fija.

**Depende del tuning** (intensamente)
- `carcassValue` (palanca **dominante** y bimodal), `sizeAdvantage`, `handlingTime`, `preyBandLo/Hi`, `morphReach`,
  `scavPenalty`, y toda la productividad de abajo (Bucle 3 de `ANALISIS_PARAMETROS.md`).

**Qué colapsa si se quita el tuning** 🟡→🔴 **(el más dependiente)**
- **La carnivoría NO emerge desde cero**: vive en un **valle de fitness** y hay que **sembrar la cohorte
  proto-carnívora** (deuda D1). Sin sembrado, no aparece (memoria `carnivore-extinction-mutation`).
- **Sin `carcassValue`** → los cazadores se extinguen rodeados de presa magra (memoria
  `lean-prey-starves-predators`).
- El cazador ápice es **estocástico y frágil** (Allee en mundos pequeños): incluso bien tuneado, fluctúa y puede
  extinguirse. Es el gremio que primero se rompe (Bucle 3).
- **Veredicto:** decisión y morfología emergentes, pero la **existencia del gremio está andamiada y es frágil**.

---

## 3. Carroñeo

**Genuinamente emergente** 🟢
- La decisión de buscar carroña: el gradiente de comida incluye `effScav·∇carrion`; el cerebro asciende por él.
- La deriva del gen `scav` (cazar↔carroñear) y la **forma de gusano fino** (premiada por `k_scavThin`) que emerge
  de la geometría.

**Cableado** 🔴
- El campo `carrion` (toda muerte deja cuerpo), `decayCarrion` (mineraliza a N), `carrionAbsRate`, el reparto
  `effHunt`/`effScav`. Física fija.

**Depende del tuning**
- `scavPenalty` (decide si existe el carroñero puro), `k_scavThin`, `carrionAbsRate`, `carrionDecay`,
  `carrionScent`.

**Qué colapsa si se quita el tuning** 🟡
- **El gusano carroñero se siembra** (proto-gusano, cadena axial; deuda D1): la **forma** no emerge desde cero
  (valle morfológico).
- **Sin `scavPenalty`** → no se especializa (el omnívoro/generalista absorbe el nicho).
- El carroñeo *como función* es relativamente robusto (es un colchón en la escasez), pero su **silueta
  especializada** está andamiada.

---

## 4. Competencia

**Genuinamente emergente** 🟢 **(emergencia pura — el caso más limpio)**
- **Competencia por explotación**: el recurso es un campo finito y agotable; quien llega antes deja menos. Nadie
  escribió "compite": es consecuencia directa de un recurso compartido depletable + el spatial hash que localiza a
  todos en el mismo espacio.
- **Competencia por interferencia**: vía combate (la depredación es competencia directa).
- Los trade-offs r/K que reparten a los competidores por estrategia.

**Cableado** 🔴
- Solo la existencia del recurso finito y su agotamiento local (la física del mundo).

**Depende del tuning**
- La intensidad la fija la capacidad de carga (`matterBudget`, `closedRegen`), pero la competencia *existe* a
  cualquier valor.

**Qué colapsa si se quita el tuning**
- **Nada.** La competencia es una propiedad estructural de un mundo de materia finita; no hay un parche que la
  sostenga. Es de lo más genuinamente emergente del simulador.

---

## 5. Estrategias de reproducción (eje r/K, sexual/asexual, selección sexual)

**Genuinamente emergente** 🟢
- El **eje r/K emerge de la energética**: el pequeño llena su depósito antes (`reproRef ∝ sizeMass`) → cría rápido
  (r); el grande es K. Nadie lo programó como estrategia; sale de la fórmula del umbral + la deriva de `size`,
  `repro_thr`, `invest`, `mature_age`, `senescence`.
- La **elección de pareja** (qué compatible cercano) y el desempate por ornamento (`_findMate`).

**Cableado** 🔴
- La **regla de cría**: `E ≥ reproNeedE && age ≥ matureAge`; `reproRef = E_max_base·sizeMass`; el `cooldown`; el
  gate "no nace sin materia" (`birthGatherR`). Los operadores `crossover`/`copyMutated`.
- La **selección sexual** (runaway de Fisher, `1−|orn−pref|`) está cableada como mecanismo.

**Depende del tuning**
- `expr.size.min` (gobierna el r-runaway), `expr.repro_thr/invest/mature_age`, `E_max_base`, `cooldown`,
  `speciesGenThreshold` (compatibilidad).

**Qué colapsa si se quita el tuning** 🟢→🔴
- **Sin `expr.size.min`** → el extremo **r gana siempre** y satura el pool con enanos → el extremo **K y la
  diversidad de talla colapsan** (deuda D2, memoria `parametrizacion-multiescala-anticolapso`). El *equilibrio*
  r/K es muy dependiente del régimen.
- La **selección sexual es de carga débil** (deuda D16): `orn`/`pref` derivan casi neutrales; si se quita, apenas
  se nota. La reproducción **solo-sexual aplana la diversidad de talla** (memoria `sexual-repro-flattens-size`),
  por eso `asexual` está ON como fallback — otra dependencia de configuración.

---

## 6. Dinámica depredador-presa (oscilaciones, coexistencia, manadas)

**Genuinamente emergente** 🟢
- Las **oscilaciones** depredador-presa y el **clustering tipo manada** emergen (repro local + objetivos
  compartidos + mate-radius). La "manada" **no es caza coordinada programada** (memoria
  `emergent-pack-clustering`).
- La **patchiness espacial** (parches que migran, Huffaker) emerge de `patchiness`.

**Cableado / impuesto** 🔴 **(aquí está casi toda la deuda de estabilización)**
- **Todos los estabilizadores Lotka-Volterra son cableados** (deuda D6/D7): `refuge.strength` (cobertura),
  `fleeSpeed`/`fleeCap` (escape por velocidad, **nunca certero**), `handlingTime` (saturación de caza, Holling
  II), `failDamage` (freno denso-dependiente), `preyBandLo/Hi`+`dietMargin` (acoplamiento de talla cableado).

**Depende del tuning** (intensamente)
- Los cinco anteriores + `carcassValue`. El CHANGELOG los movió en bloque repetidamente.

**Qué colapsa si se quita el tuning** 🔴 **(el más frágil del simulador)**
- **Sin estabilizadores → boom-bust y colapso.** `ANALISIS_PARAMETROS.md §6` lo dice: "todos los estabilizadores
  L-V viven aquí". Quitar `failDamage` rompe el freno (boom-bust, probado). Sin `refuge`/`fleeSpeed`, la presa
  llega a cero.
- **Veredicto:** el *fenómeno* (oscilar, agruparse) es emergente, pero la **coexistencia estable se compra con
  constantes**, no emerge. Es la conducta menos genuinamente emergente del ecosistema: el mundo no tiene fricción
  ecológica natural (refugios espaciales, saciedad, coste de intento), así que se inyecta toda a mano.

---

## 7. Control de población

**Genuinamente emergente** 🟢
- **Capacidad de carga endógena**: la población se autorregula por la **materia** (una cría no nace si no hay
  nutriente en la zona para construir su cuerpo). Es un techo emergente, local y dinámico — no un número fijo.

**Cableado** 🔴
- La **conservación de materia** (pecera), el gate `nutrientAround < bodyMatter → no nace`, y el tope **duro**
  `maxAgentsCeiling` (memoria/perf).

**Depende del tuning**
- `expr.size.min`, `matterBudget`, `closedRegen`, `carcassValue` (cuánta materia se bloquea en cuerpos).

**Qué colapsa si se quita el tuning** 🟢→🔴
- El control endógeno por materia es genuino **solo si el régimen es sano**. En el modo de fallo (Bucle 2,
  r-runaway), la comida **no** frena la población → el **tope técnico del pool se vuelve el regulador real**
  (deuda D9) → degradación (enjambre de enanos, pasto cropeado uniforme). El control de población es emergente
  **dentro del régimen correcto**, y ese régimen depende de `size.min` (bifurcación).

---

## 8. Diversidad morfológica

**Genuinamente emergente** 🟢 **(la mejor historia de emergencia del proyecto… con asteriscos)**
- El **cuerpo es un grafo generativo de nodos**; la **locomoción emerge de la forma** (empuje−arrastre+inercia),
  no es un gen directo. Velocidad, giro (de la asimetría), streamlining, coordinación de marcha (`osc_phase`
  funcional), gait direccional (colas atrás propulsan, frentes frenan; ondular↔aletear) — todo emerge de la
  geometría seleccionada.
- Las **tres siluetas funcionales** (ancho=pastador, fino=gusano, garra=cazador) están ligadas a nichos por
  física (`k_grazeWide`, `k_scavThin`, `morphReach`).

**Cableado** 🔴
- La **física forma→fuerza** entera (`bodyplan.js`): cada coeficiente de empuje emparejado con su arrastre. La
  *fórmula* de cómo una forma produce movimiento es del programador.

**Depende del tuning**
- Decenas de coeficientes de `config.loco`; `omniPenalty`/`scavPenalty` (destraban la divergencia);
  `morphReach`/`k_grazeWide`/`k_scavThin` (tiran de `elongN` a formas opuestas).

**Qué colapsa si se quita el tuning** 🟡→🔴
- **Sin sembrar las proto-formas** (gusano, garra) → las **formas complejas no emergen** (valles morfológicos;
  deuda D1, memoria `morphology-valley-needs-seeding`). Subir `morphReach ×4` **no** induce la garra: hay que
  plantarla.
- **Sin `omniPenalty`/`scavPenalty`** → "la morfología no diverge" (memoria `omnipenalty-gates-specialization`):
  queda un generalista único, sin tres gremios.
- **Veredicto:** el *mecanismo* (forma generativa → física) es genuinamente emergente y es lo más impresionante
  del simulador, pero la *diversidad* concreta de tres siluetas está **sembrada y forzada por impuestos**. La
  forma simple (renacuajo) sí emerge sola; la compleja no.

---

## 9. Diversidad conductual

**Genuinamente emergente** 🟢 **(emergencia pura — el caso más fuerte junto a la competencia)**
- **Toda la conducta es la RNN (pesos=genes).** Cazar, huir, pastar, atacar, **parar/crucear/esprintar** (control
  de esfuerzo por la 4ª salida + propiocepción), uso táctico del refugio, evitar presa grande, no atacar a la que
  escapará — **todo emerge de los pesos evolucionados**, sin ningún `if/else` de estrategia.
- Está **medido**: tras desacoplar el esfuerzo (CHANGELOG 2026-06-17), 3-11% se paran, 18-26% van despacio, el
  resto esprinta — la modulación de velocidad **emergió**, no se sembró.

**Cableado** 🔴
- La **arquitectura del cerebro** (`I:11, H:5, O:4`), el conjunto de **entradas sensoriales** (lo que *puede*
  percibir) y las **salidas** (lo que *puede* hacer). El repertorio conductual está acotado por qué entradas
  existen: añadir las entradas 8/9 (talla/escapabilidad de presa) fue lo que *habilitó* la conducta de evitar
  presa grande/escurridiza (CHANGELOG 2026-06-14). El programador define el **espacio de conductas posibles**; la
  selección elige cuáles se usan.

**Depende del tuning**
- `BRAIN.scale` (rango de pesos), `mut.rate/sigma` (velocidad de exploración conductual).

**Qué colapsa si se quita el tuning** 🟡
- **Sin `seedBrain` (cerebro competente de partida)** → cerebros aleatorios → **extinción antes de evolucionar**
  (deuda D1). El *repertorio* es emergente, pero el **punto de partida competente está sembrado**.
- **Sin `wander`** (deriva térmica) → un organismo sin estímulo se **congela y muere** sin explorar (deuda D12):
  la conducta exploratoria en ausencia de señal **no emerge** sola.
- **Veredicto:** la diversidad conductual es lo más genuinamente emergente del simulador (no hay estrategia
  cableada en ningún sitio), pero su **viabilidad inicial** está andamiada (arranque competente + ruido
  exploratorio).

---

## 10. Otros fenómenos

### Especiación 🟢/🟡
- **Emergente**: los clústeres de especies se forman por aislamiento genético + espacial bajo deriva/selección.
- **Cableado/curado**: la **métrica** de especie es una distancia euclídea con **exclusiones a mano** (cerebro,
  decorativos, fase; deuda D14) y un **umbral** (`speciesGenThreshold`). El número de especies ≈
  `speciesGenThreshold ÷ mut.sigma × aislamiento`. Depende del tuning; el concepto de especie no es emergente
  (no hay aislamiento reproductivo real, solo una distancia).

### Nicho de emboscada (señuelo anglerfish) 🟡
- **Emergente** en mecanismo (atracción de presa, alcance), pero **marginal, sembrado y muy parametrizado**
  (deuda D17): minoría de una minoría, sostenido por 2 genes físicos + 3 decorativos + 4 parámetros + sembrado.

### Identidad visual por linaje 🟢 (neutral)
- El `hue` deriva neutralmente y marca linajes. Emergente como **rasgo neutral** (no bajo selección desde que se
  quitó el match color↔luz, CHANGELOG 2026-06-11).

### Control de velocidad / propiocepción 🟢
- El lazo "velocidad propia → cerebro → esfuerzo" se cierra con la entrada 10; la modulación de velocidad emerge
  (medido). Genuino.

---

## Síntesis: el espectro de emergencia

Ordenando las conductas de **más a menos genuinamente emergentes**:

1. 🟢🟢 **Competencia** y **diversidad conductual** — emergencia casi pura (recurso finito; RNN sin estrategia
   cableada). Lo más sólido.
2. 🟢 **Estrategias r/K**, **control de población**, **herbivoría**, **control de velocidad** — emergen de la
   energética/cerebro, pero su *salud* depende del régimen (sobre todo `size.min`).
3. 🟡 **Diversidad morfológica**, **carroñeo** — *mecanismo* emergente y elegante, pero la *diversidad concreta*
   está **sembrada** (proto-formas) y **forzada por impuestos** (`omni/scavPenalty`).
4. 🟡→🔴 **Carnivoría** — decisión y forma emergentes, pero la **existencia del gremio está andamiada** (sembrado)
   y es **frágil** (apex estocástico).
5. 🔴 **Dinámica depredador-presa estable** — el fenómeno oscila emergentemente, pero la **coexistencia se compra
   con constantes** (estabilizadores L-V cableados). Lo menos emergente.

**Las dos costuras donde "emergente" se vuelve "andamiado/cableado":**

- **(C1) Valles de fitness → sembrado.** Carnivoría, carroñeo y morfología compleja no cruzan sus valles; se
  plantan las semillas (D1). El *mecanismo* selecciona; el *punto de partida* lo pone el programador.
- **(C2) Falta de fricción ecológica natural → estabilizadores cableados.** La coexistencia depredador-presa, la
  divergencia de dieta y el control de talla no son estables por física propia; se imponen con refugios, impuestos
  y suelos (D2, D4, D6, D7).

**Lectura final.** El simulador cumple su tesis **en la capa de conducta y de física generativa** (nadie escribe
estrategias; la forma produce el movimiento). Donde la tesis se diluye es en la **composición del ecosistema**:
qué gremios existen, en qué proporción y de forma estable depende de **sembrar** las semillas correctas y **tunear**
las palancas de régimen. La emergencia es real **dentro** de un escenario que el programador prepara y sostiene con
cuidado — emergencia *guiada*, no espontánea.
```
