# Arquitectura evolutiva ideal desde primeros principios — Zenote

> **Fase 2 — Rediseño.** Diseño desde primeros principios del sustrato evolutivo. Asume que el sistema biológico
> actual se borra; ignora compatibilidad, genes y valores de parámetros previos. Toma como input toda la auditoría
> de [`../01-Assessment/`](../01-Assessment/), y responde explícitamente a sus **4 causas raíz**.
>
> **Objetivo:** el **conjunto MÍNIMO de mecanismos fundamentales** capaz de GENERAR (no cablear ni sembrar):
> diversidad morfológica, ecológica, conductual, dinámica de población, formación de nichos y relaciones
> depredador-presa con coexistencia estable.
>
> **Principio rector:** **reemplazar parámetros tuneados por leyes y restricciones.** Cada parámetro que sobreviva
> debe estar justificado. Un fenómeno que hoy se sostiene con un dial debe, en este diseño, **caer de una ley**.
>
> NO hay código ni plan de migración aquí (eso es la siguiente fase).

---

## 0. La decisión central: energía ABIERTA, materia CERRADA

El hallazgo #1 de la auditoría fue la ausencia de termodinámica: en el modelo actual *energía = materia
relabelada* (`E = materia × epu`), sin fuente, sin sumidero, sin entropía. Es un bucle cerrado de materia que
nunca se degrada — un móvil perpetuo. De esa única laguna cuelga casi toda la deuda de régimen.

**Decisión:** el mundo es **abierto en energía y cerrado en materia.** Es como funcionan los ecosistemas reales y
es la palanca de diseño más potente disponible:

```
        ☀ ENERGÍA  ─────────►  [ trabajo biológico ]  ─────────►  🔥 CALOR (sale del sistema)
        (flujo del sol,            cada transacción              irrecuperable; es la 2ª ley
         un solo sentido)          disipa una fracción           hecha mecánica)

        🪨 MATERIA  ◄───────────────────  CICLA  ───────────────────►  🪨 MATERIA
        nutriente → tejido → detrito → nutriente   (CONSERVADA, Σ constante)
```

**Por qué esta decisión sola elimina media auditoría:**
- La **pirámide trófica** deja de necesitar `preyGain`/`carcassValue`: emerge de la disipación (cada nivel pierde
  energía utilizable como calor → el mundo solo sostiene los niveles que el flujo permite).
- La **capacidad de carga** deja de ser `closedRegen` × `matterBudget`: es el **flujo de energía entrante** (una
  condición de contorno del mundo, no un dial de balance).
- Desaparece el `epu` (energía y materia son magnitudes **distintas**, no intercambiables a tasa fija).
- El ecosistema tiene por fin una **razón de existir** (necesita el sol) y de **morir** (sin flujo, se apaga) —
  honesto termodinámicamente.

Conservar la **materia cerrada** retiene el mejor cimiento del modelo actual (la pecera, la única ley fundamental
que ya funcionaba). Lo nuevo es separar la energía y hacerla fluir.

---

## 1. Principios de diseño

1. **Tres capas, frontera auditable** (se mantiene la disciplina de CLAUDE.md §1):
   - **(A) Física del mundo** — leyes inmutables. Nunca dicen qué gen es bueno.
   - **(B) Expresión gen→fenotipo (desarrollo)** — traduce el genoma a un organismo físico.
   - **(C) Lo que evoluciona** — el genoma. La selección es el único árbitro; **no hay fitness explícito**.
2. **Constraints > parámetros.** Si un comportamiento se puede derivar de una ley de conservación o de la geometría,
   no se pone un dial.
3. **Nada de estrategia cableada, nada de sembrado, nada de impuestos.** Los gremios, las formas y las conductas
   deben **emerger** desde un arranque simple, sin proto-formas plantadas ni penalizaciones a generalizar.
4. **Ejecutable de verdad.** Miles de agentes a tiempo real en navegador, responsive. Cada mecanismo indica su
   coste; los caros llevan su aproximación barata.
5. **Belleza e identidad.** Propósito contemplativo; color = linaje (marcador neutro heredable).

---

## 2. El conjunto mínimo: 8 mecanismos en 3 capas

> Numerados L (leyes), O (organismo), E (evolución). Cada uno: **por qué existe · fenómenos que habilita ·
> parámetros que elimina (y el constraint que los reemplaza) · cómo se observaría / modo de fallo.**

### CAPA A — Leyes del mundo (física inmutable)

---

#### L1 · Termodinámica de doble moneda con disipación
**Qué es.** Dos magnitudes físicamente distintas:
- **Energía** — entra como un **campo de luz** espacial (flujo continuo, condición de contorno). Se gasta en todo
  trabajo (mantenimiento, movimiento, construcción de tejido). **Cada conversión tiene eficiencia < 1; lo perdido
  es calor que abandona el sistema.** No se almacena sin pérdida ni se recicla.
- **Materia** — conservada y cíclica (nutriente → tejido → detrito → nutriente). Construir un cuerpo retira materia
  del pool; morir la devuelve.

El movimiento se cobra aquí: nadar es **trabajo contra el medio viscoso** (potencia ∝ fuerza·velocidad, disipada
como calor). La velocidad **emerge** de potencia muscular vs arrastre, no de un coeficiente de empuje.

**Por qué existe.** Es la ley que faltaba (RC1). Da fuente, sumidero y flecha del tiempo. Hace que la energía sea
un **recurso que se agota de verdad** y la materia un **stock que circula**.

**Fenómenos que habilita.** Pirámide trófica (niveles limitados por disipación) · capacidad de carga endógena (la
fija el flujo de luz) · gradientes espaciales de productividad (zonas más iluminadas = más ricas) · dinámica de
población acoplada al flujo · coste de movimiento físico real.

**Parámetros que elimina** → reemplazados por: `energyPerUnit` (energía y materia ya no son convertibles) ·
`preyGain` y `carcassValue` (la eficiencia trófica = disipación termodinámica, emergente) · `closedRegen`
(productividad = flujo de luz, contorno) · `moveCost`/`kThrust`/`k_drag`/`k_haul`/`k_effort` (coste de nado =
trabajo disipado, un cálculo, no diales) · todos los `(1+k·rasgo)` de coste (cada coste = energía real consumida).

**Cómo se observaría que emergió.** Una **pirámide de biomasa** (más herbívoros que carnívoros) sin haberla
impuesto; la población escala con la irradiancia total; eficiencias tróficas medidas <100% sin pararse a fijarlas.
**Modo de fallo.** Si la disipación por transacción es demasiado alta → nadie cierra balance, extinción térmica;
demasiado baja → reaparece el casi-móvil-perpetuo. (Pero la disipación es una constante **física única**, no un
dial por subsistema → un punto de calibración honesto en vez de docenas.)

**Coste.** Barato: dos campos en rejilla (luz, nutriente) — ya existe la maquinaria de campos.

---

#### L2 · Espacio finito y disputado (ocupación física)
**Qué es.** El espacio es un recurso. Un cuerpo **ocupa** lugar; el hacinamiento local tiene un techo geométrico.
Implementación ideal: exclusión de volumen. Aproximación barata (recomendada): el espacio es un **campo de
ocupación** —cada zona tiene "sitio" finito; la presencia lo consume; amontonarse encarece (sombra mutua por la
luz, estorbo al moverse, menos acceso al recurso)—, igual que el campo de nutriente.

**Por qué existe.** Es la **fricción ecológica espacial** que falta (RC3). Sin ella, infinitos agentes coinciden en
un punto y la competencia por sitio no existe.

**Fenómenos que habilita.** Competencia por interferencia (no solo por explotación) · **refugios espaciales
naturales** (la presa se mete donde no cabe/no llega el depredador, o donde la estructura estorba) · nichos
espaciales · denso-dependencia (la mortalidad/natalidad suben con el hacinamiento) · pago real al tamaño (un
cuerpo grande captura más flujo de luz por el área que ocupa).

**Parámetros que elimina** → reemplazados por: `maxAgentsCeiling` como regulador (la población la limita el
espacio+energía+materia, todo físico) · gran parte de `refuge.strength`/`fleeSpeed`/`fleeCap` (el refugio es
espacial, emergente de la estructura del entorno, no una probabilidad cableada) · `grazeRefuge` en su rol de
cobertura (la cobertura es ocupación real).

**Cómo se observaría.** La densidad local **se satura** a un techo sin un cap global; surgen **patrones espaciales**
(territorios, agregados, zonas vacías) sin programarlos; las presas persisten refugiándose en estructura.
**Modo de fallo.** Si el coste de hacinamiento es nulo → colapsa al modelo actual (todos encima); si es brutal →
dispersión forzada, sin agregados. Es UN parámetro físico (capacidad espacial por celda), no una familia.

**Coste.** Medio-bajo con la versión de campo; alto con exclusión dura (colisiones par-a-par). Se recomienda campo.

---

### CAPA B — El organismo (frontera gen→fenotipo)

---

#### O1 · Codificación del desarrollo (genotipo→fenotipo recursivo/modular)
**Qué es.** El genoma no es una lista plana de rasgos: es un **programa de desarrollo** (gramática tipo L-system /
red de regulación) que **crece** el cuerpo y cablea el controlador. Las mutaciones actúan sobre **módulos y reglas**:
duplicar un segmento, repetir un apéndice, modificar una regla que afecta a muchas partes a la vez, activar/desactivar
un módulo.

**Por qué existe.** Es la respuesta de primer principio a los **valles de fitness** (RC2). Una mutación regulatoria
produce un **cambio fenotípico grande y COORDINADO** (p.ej. "añade un par de apéndices simétricos") en un **solo
paso** → lo que en el modelo actual exige decenas de mutaciones puntuales coordinadas (un valle infranqueable que
había que **sembrar**) aquí es **alcanzable de un salto**. Además, una codificación redundante crea **redes
neutrales**: la población deriva gratis por crestas iso-fitness hasta nuevas cuencas.

**Fenómenos que habilita.** **Innovación morfológica sin sembrado** (formas complejas emergen de cero) · simetría y
repetición de partes (consecuencia natural de reglas recursivas) · evolvabilidad (el morfoespacio se vuelve
navegable) · ligamiento del desarrollo (módulos co-adaptados se heredan juntos).

**Parámetros/sistemas que elimina** → reemplazados por: **todo el aparato de sembrado** (cohorte proto-carnívora,
proto-gusano, proto-garra) · `carnivoreSeedFrac` · `startDiversity` · gran parte de `seedBrain` (un cerebro
plausible puede crecer de reglas, no hace falta sembrar pesos competentes a mano). El constraint que los reemplaza:
**variación estructurada por el desarrollo** (la innovación es barata y coordinada por construcción).

**Cómo se observaría.** Partiendo de un organismo **mínimo** (una célula/segmento), aparecen linajes con cuerpos
ramificados, segmentados, simétricos **que nadie plantó**; el registro fósil de linajes muestra **saltos
morfológicos** correlacionados con mutaciones de módulo. **Modo de fallo.** Si las reglas son demasiado expresivas
→ caos morfológico sin herencia estable; demasiado rígidas → poca diversidad. El equilibrio es la elección del
**lenguaje de desarrollo**, no un parámetro numérico.

**Coste.** Barato en ejecución: el desarrollo se computa **una vez al nacer** y se cachea (como hoy). El coste está
en el diseño del lenguaje generativo.

---

#### O2 · El cuerpo como máquina física: la forma determina TODA función
**Qué es.** No existen rasgos escalares libres de "dieta", "velocidad", "visión", "caza" o "carroñeo". Lo que un
organismo **puede hacer** es una **consecuencia de su cuerpo** dentro de las leyes L1-L2:
- Qué y cómo come ← geometría de la boca/aparato + tamaño + cómo se mueve + sensores.
- Cómo nada ← forma (empuje/arrastre) bajo L1.
- A quién vence ← masa, estructura, alcance, bajo la mecánica.
- Qué percibe ← órganos sensoriales (su coste energético sale de L1).

**Por qué existe.** Es la fuente natural de **nichos por trade-off físico** (RC3 en su cara trófica): un cuerpo
optimizado para barrer recurso (ancho, bocón) es **físicamente peor** cazando (no es hidrodinámico) y viceversa.
La **incompatibilidad es geométrica**, no un impuesto. El **generalista es el que es mediocre en todo** → pierde
**sin que nadie lo penalice**.

**Fenómenos que habilita.** **Especialización y formación de nichos sin impuestos** · diversidad morfológica
*funcional* (cada forma "significa" un modo de vida) · co-evolución forma↔conducta · convergencia (formas
parecidas para nichos parecidos en linajes distintos).

**Parámetros que elimina** → reemplazados por geometría+física: los genes `diet`, `scav`, `speed` (escalares
libres) · `omniPenalty`, `scavPenalty` (el castigo al generalista es físico, no parabólico) · `effHerb/Hunt/Scav`,
`k_grazeWide`, `k_scavThin`, `morphReach` (todas las eficiencias caen de la forma) · la familia `vision.*`
(la visión = órganos con coste energético real).

**Cómo se observaría.** Al graficar forma vs modo de alimentación, los gremios aparecen como **cúmulos
morfológicos separados** sin haber definido "dieta"; los intermedios existen pero **rinden peor** y son raros.
**Modo de fallo.** Si la física forma→función es demasiado plana (todas las formas igual de buenas en todo) → no
hay nichos; si es demasiado escarpada → un único óptimo gana. Esto vuelve a recaer en el **diseño de la física**,
no en diales de balance.

**Coste.** Barato: se evalúa al nacer (como el fenotipo actual).

---

#### O3 · Estado fisiológico (tripa, almacenes, crecimiento) en el libro mayor
**Qué es.** El organismo tiene estado interno físico: una **tripa finita** que se llena al comer y se **vacía
digiriendo** a lo largo del tiempo (con su coste energético y su eficiencia <1, L1); **almacenes** de energía y de
materia estructural; y **crece** (convierte recurso en masa, pagando energía disipada). Comer de más no cabe;
digerir lleva tiempo.

**Por qué existe.** Es la **fricción ecológica fisiológica** que falta (RC3): saciedad, tiempo de manejo y riesgo
dejan de ser constantes cableadas y pasan a ser **consecuencias de tener un cuerpo que procesa materia/energía en
el tiempo**.

**Fenómenos que habilita.** **Respuesta funcional (saciedad)** emergente → amortigua las oscilaciones
depredador-presa · **coexistencia depredador-presa estable** sin estabilizadores L-V cableados · crecimiento
ontogénico (los individuos cambian de talla → cambian de nicho a lo largo de la vida) · estados de hambre/saciedad
que el cerebro puede leer.

**Parámetros que elimina** → reemplazados por fisiología: `handlingTime` (= tiempo real de digestión) ·
`failDamage` (= coste energético/lesión real de una contienda) · parte de la banda de talla `preyBand*` (lo que
cabe en la tripa y lo que se puede someter es físico).

**Cómo se observaría.** Un depredador saciado **deja de cazar** aunque haya presa (sin un `handlingTime` fijo); las
curvas presa-depredador **oscilan amortiguadas** en vez de boom-bust. **Modo de fallo.** Tripa demasiado grande →
sin saciedad, vuelve el sobre-disparo; demasiado pequeña → inanición crónica. Es un rasgo **evolvable** (tamaño de
tripa), no un dial global.

**Coste.** Barato: unos escalares por agente.

---

#### O4 · Controlador neuronal evolvable (con plasticidad opcional en vida)
**Qué es.** La conducta sale de una **red neuronal cuyo cableado lo produce el desarrollo (O1)** y cuyos pesos
evolucionan. Lee **sensores reales** (gradientes de luz/recurso, presencia de otros, estado interno de O3,
propiocepción). **Opción (recomendada): plasticidad en vida** —aprendizaje local (Hebbiano/modulado por recompensa
fisiológica: comer = refuerzo)— que produce el **efecto Baldwin**.

**Por qué existe.** Es el motor de conducta (se mantiene como el activo más emergente del modelo). La **plasticidad**
es la respuesta de primer principio a los **valles conductuales** (RC2 en su cara conductual): un cerebro torpe
**aprende** a ser viable dentro de su vida → el paisaje conductual se **suaviza** → la selección puede asimilar
después lo aprendido, **sin sembrar cerebros competentes**.

**Fenómenos que habilita.** **Diversidad conductual emergente** (cazar/huir/pastar/descansar/explorar sin
estrategia cableada) · adaptación en vida · exploración como conducta aprendida (no como ruido `wander` inyectado) ·
co-evolución conducta↔morfología.

**Parámetros/sistemas que elimina** → reemplazados por aprendizaje/sensado real: el resto de `seedBrain` (el
arranque competente lo da el aprendizaje, no la siembra) · `wander` (la exploración emerge de un impulso de
aprendizaje/curiosidad) · `BRAIN.scale` y la arquitectura fija (el desarrollo O1 dimensiona la red).

**Cómo se observaría.** Individuos de genoma idéntico que **divergen en conducta** según lo vivido (firma de
aprendizaje); poblaciones que adquieren una conducta nueva **fenotípicamente** antes de fijarla genéticamente
(Baldwin). **Modo de fallo.** Aprendizaje demasiado rápido → todos convergen, la genética deja de importar;
demasiado lento → vuelve la fragilidad del arranque. Es la pieza **más cara y más opcional**.

**Coste.** El sustrato evolutivo es barato (forward por tick, ya existe). La **plasticidad por tick es lo más caro**
del diseño; alternativa barata si hace falta: sin plasticidad + arranque suave del mundo (energía abundante y baja
presión hasta que la población crece) para que los cerebros aleatorios tengan margen de evolucionar.

---

### CAPA C — El bucle evolutivo

---

#### E1 · Reproducción como inversión real + herencia/variación + historia de vida alométrica
**Qué es.** Reproducirse = **convertir materia + energía en descendencia**, pagando: materia estructural (del pool,
L1), energía (con disipación, L1) y **tiempo de desarrollo ∝ complejidad** del hijo. La herencia copia el **programa
de desarrollo** (O1) con mutación; recombinación sexual opcional. Los **tiempos vitales** (madurez, vejez,
gestación) **escalan con la masa** como consecuencia metabólica (Kleiber: `∝ masa^¼`), no son genes libres.

**Por qué existe.** Cierra el ciclo evolutivo y, sobre todo, **elimina el sesgo a la talla mínima (RC4) por física,
no por un suelo.** Ser diminuto deja de ser gratis: un cuerpo pequeño (a) almacena poca energía → no aguanta la
escasez, (b) ocupa mal el espacio disputado y captura poco flujo (L2), (c) pierde contiendas y no puede explotar
nichos que exigen estructura (O2), y (d) vive rápido pero muere joven (alometría). Hay un **óptimo de talla
interior por nicho**, no una carrera al fondo.

**Fenómenos que habilita.** **Eje r/K honesto** (pequeño = vida rápida/muchas crías baratas; grande = vida
lenta/pocas crías caras) emergente de la energética+alometría · estrategias reproductivas diversas · dinámica de
población acoplada a la productividad real · pago real al tamaño.

**Parámetros que elimina** → reemplazados por física/alometría: `expr.size.min` (suelo de talla) y `forageReach`
(el pago a la talla es físico) · `k_lifespan` (la longevidad cuesta porque mantener masa cuesta energía, L1) ·
`mature_age`/`senescence`/`age.scale` como genes/diales libres (los tiempos son alométricos) · `repro_thr`/`invest`
quedan como **estrategia evolvable** (legítima), no como diales globales.

**Cómo se observaría.** La distribución de talla es **multimodal con óptimos interiores** (no clavada al mínimo) sin
suelo impuesto; correlación negativa talla↔tasa reproductiva y positiva talla↔longevidad (firma r/K) **emergente**.
**Modo de fallo.** Si el pago a la talla (L2/O2) es débil, reaparece la deriva al mínimo — pero ahora el remedio es
**fortalecer una ley** (captura de flujo por área, ventaja de masa en contienda), no añadir un suelo artificial.

**Coste.** Barato.

---

#### E2 · Compatibilidad reproductiva emergente (especiación sin métrica curada)
**Qué es.** Quién se cruza con quién **no** lo decide una distancia euclídea con genes excluidos a mano. La
**compatibilidad es un rasgo fenotípico**: reconocimiento de pareja (señales y preferencias que el cerebro/los
sentidos leen, ellas mismas evolvables) + co-localización espacial. El aislamiento reproductivo **emerge** del
emparejamiento asortativo + la estructura espacial.

**Por qué existe.** Resuelve la fragilidad de la métrica de especie (deuda D14 / problema P7): hoy hay que excluir
el cerebro, los decorativos y las fases para que la "especie" no sea espuria. Si la compatibilidad es un fenotipo
sujeto a selección, la especie es una **consecuencia**, no una definición curada.

**Fenómenos que habilita.** **Especiación real** (aislamiento reproductivo que surge de la divergencia ecológica y
espacial) · selección sexual emergente (las señales de pareja pueden engancharse en runaway, pero ahora con carga
real) · radiación adaptativa.

**Parámetros que elimina** → reemplazados por fenotipo: `speciesGenThreshold` y toda la curación
`FUNCTIONAL`/`DECOR`/exclusiones de fase · la métrica de distancia ad hoc · `mateRadius` como dial global (el
alcance de cortejo es un rasgo sensorial).

**Cómo se observaría.** Aparecen grupos que **dejan de cruzarse** aunque sean genéticamente cercanos (aislamiento
conductual) o que se cruzan pese a divergir; el nº de especies responde a la heterogeneidad del entorno **sin**
fijar un umbral. **Modo de fallo.** Sin presión que ligue reconocimiento a ecología → o no especia nunca, o especia
en exceso (toda variación se vuelve barrera). Es un fenómeno a **observar y medir**, no a clavar.

**Coste.** Barato (el reconocimiento es lectura sensorial, ya existe la maquinaria de vecindad).

---

## 3. Tabla de trazabilidad: mecanismo → fenómenos → parámetros eliminados

| Mecanismo | Fenómenos que habilita | Parámetros/sistemas que ELIMINA |
|---|---|---|
| **L1** Termodinámica doble-moneda + disipación | Pirámide trófica, capacidad de carga endógena, coste de movimiento físico, dinámica de población | `epu`, `preyGain`, `carcassValue`, `closedRegen`, `moveCost`, `kThrust`, `k_drag`, `k_haul`, `k_effort`, `k_flap`, `dragRef`, todos los `(1+k·rasgo)` de coste |
| **L2** Espacio finito disputado | Competencia por interferencia, refugios espaciales, nichos espaciales, denso-dependencia, pago a la talla | `maxAgentsCeiling` (como regulador), `refuge.strength`, `fleeSpeed`, `fleeCap`, `grazeRefuge` (cobertura) |
| **O1** Desarrollo modular | Innovación morfológica sin sembrado, simetría/repetición, evolvabilidad, redes neutrales | **todo el sembrado**, `carnivoreSeedFrac`, `startDiversity`, `seedBrain` (mayor parte) |
| **O2** Forma = función | Nichos por trade-off físico, diversidad morfológica funcional, convergencia | `diet`, `scav`, `speed`, `omniPenalty`, `scavPenalty`, `effHerb/Hunt/Scav`, `k_grazeWide`, `k_scavThin`, `morphReach`, `vision.*` |
| **O3** Fisiología (tripa/almacén) | Saciedad (respuesta funcional), coexistencia depredador-presa, crecimiento ontogénico | `handlingTime`, `failDamage`, parte de `preyBand*` |
| **O4** Cerebro evolvable + plasticidad | Diversidad conductual, adaptación en vida (Baldwin), exploración aprendida | `seedBrain` (resto), `wander`, `BRAIN.scale` + arquitectura fija |
| **E1** Reproducción-inversión + alometría | Eje r/K honesto, estrategias reproductivas, pago a la talla | `expr.size.min`, `forageReach`, `k_lifespan`, `mature_age`/`senescence`/`age.scale` (como diales) |
| **E2** Compatibilidad reproductiva emergente | Especiación real, selección sexual con carga, radiación | `speciesGenThreshold`, curación `FUNCTIONAL`/`DECOR`, métrica de distancia, `mateRadius` (global) |

**Lo que SOBREVIVE como condición de contorno legítima (no deuda):** el flujo de luz total y su geometría, la
materia total (tamaño del frasco), la constante de disipación física, el lenguaje de desarrollo, y las **tasas de
mutación** (velocidad de exploración — inherente a cualquier sistema evolutivo). Son pocos y cada uno es un
**parámetro físico o de contorno**, no un dial de balance ecológico.

---

## 4. Cómo el diseño ataca las 4 causas raíz de la auditoría

| Causa raíz (auditoría) | Mecanismo(s) que la resuelven | De parámetro → a constraint |
|---|---|---|
| **RC1 — Sin termodinámica** (energía = materia) | **L1** | La pirámide, la capacidad de carga y la eficiencia trófica caen de la disipación y el flujo de luz, no de `preyGain`/`carcassValue`/`closedRegen` |
| **RC2 — Evolución no cruza valles** (→ sembrado) | **O1** (+ **O4** plasticidad) | La innovación es barata y coordinada por el desarrollo (y suavizada por el aprendizaje), no plantada a mano |
| **RC3 — Sin fricción ecológica** (→ estabilizadores L-V) | **L2** (espacio) + **O3** (fisiología) | Refugio, saciedad y riesgo emergen de espacio y fisiología, no de `refuge`/`fleeSpeed`/`handlingTime`/`failDamage` |
| **RC4 — Eje de talla sesgado al mínimo** | **L2** + **O2** + **E1** | El tamaño tiene pago físico (flujo por área, contienda, nicho) y los tiempos son alométricos, no hace falta `size.min`/`forageReach`/`k_lifespan` |
| *(P7 — especie curada a mano)* | **E2** | La especie es un fenotipo emergente, no un umbral de distancia |

---

## 5. Qué EMERGE (y de qué mecanismos)

| Fenómeno pedido | Emerge de | ¿Sin sembrado ni impuestos? |
|---|---|---|
| **Diversidad morfológica** | O1 (desarrollo) + O2 (forma=función) + selección vía L1/L2 | ✅ |
| **Diversidad ecológica / nichos** | O2 (trade-offs físicos) + L1 (tipos de recurso/flujo) + L2 (nichos espaciales) | ✅ |
| **Diversidad conductual** | O4 (cerebro+plasticidad) leyendo un mundo rico (L1/L2/O3) | ✅ |
| **Dinámica de población** | L1 (flujo de energía) + L2 (espacio) + O3 (fisiología) + E1 (reproducción) | ✅ (endógena) |
| **Formación de nichos** | O2 + L2 + E2 (aislamiento reproductivo emergente) | ✅ |
| **Relaciones depredador-presa** | O2 (quién come a quién, físico) + O3 (saciedad) + L2 (refugio) | ✅ (coexistencia sin estabilizadores cableados) |

---

## 6. Argumento de minimalidad (por qué cada mecanismo es irreducible)

Quitar uno **pierde** un fenómeno o **reintroduce** un parche:

- **Sin L1** → vuelve el móvil perpetuo; no hay pirámide ni capacidad de carga reales → reaparecen
  `preyGain`/`carcassValue`/`closedRegen`.
- **Sin L2** → sin fricción espacial; la coexistencia exige estabilizadores cableados; la talla deriva al mínimo.
- **Sin O1** → la evolución no cruza valles → hay que sembrar formas y gremios.
- **Sin O2** → la dieta vuelve a ser un escalar libre → hace falta `omniPenalty`/`scavPenalty` para que haya nichos.
- **Sin O3** → no hay saciedad ni coste físico de la caza → boom-bust → estabilizadores cableados.
- **Sin O4** → no hay conducta (el corazón del proyecto); sin plasticidad, el arranque vuelve a necesitar siembra.
- **Sin E1** → no hay herencia/selección, o la talla se sesga al mínimo y el r/K es deshonesto (`k_lifespan`).
- **Sin E2** → la especie vuelve a ser una métrica curada a mano y frágil.

No veo un mecanismo eliminable sin reintroducir deuda. La plasticidad de O4 es la única pieza **graduable**
(opcional/cara), con un sustituto barato (mundo de arranque suave).

---

## 7. Lo que NO se añade (y preguntas abiertas)

- **No** se añade dinámica newtoniana de momento completa: el coste de movimiento ya cae de L1 (trabajo disipado);
  la inercia se puede modelar barata sin conservar momento estrictamente. Es mejora deseable, no irreducible.
- **No** hay fitness explícito, ni metas, ni recompensas globales: solo sobrevivir y reproducirse.
- **No** se decide aquí el **lenguaje de desarrollo concreto** (L-system vs GRN vs grafo recursivo) — es la decisión
  de diseño más importante de la siguiente fase y merece su propio análisis.
- **Preguntas abiertas para la fase siguiente:** ¿la luz es uniforme, en gradiente o con ciclo día/noche? ¿la
  materia tiene tipos (varios nutrientes) o uno? ¿la plasticidad entra o se difiere? ¿el espacio es campo o
  exclusión dura? ¿hay un medio (agua) con corrientes que muevan recurso?

---

## 8. Nota de ejecutabilidad

Coste relativo de los mecanismos en tiempo real (miles de agentes, navegador):

| Mecanismo | Coste | Mitigación |
|---|---|---|
| L1 (campos luz/materia) | Bajo | Rejilla, ya existe |
| L2 (espacio) | **Medio** | Campo de ocupación (barato); exclusión dura solo si se puede pagar |
| O1 (desarrollo) | Bajo en runtime | Se computa al nacer y se cachea |
| O2 (forma=función) | Bajo | Al nacer, cacheado |
| O3 (fisiología) | Bajo | Escalares por agente |
| O4 (cerebro) | Bajo (forward) / **Alto (plasticidad)** | Plasticidad opcional; regla local barata o diferirla |
| E1 / E2 | Bajo | Eventos puntuales |

El diseño es **plausiblemente ejecutable**: la base SoA + spatial hash + Web Worker del modelo actual (un activo a
conservar) soporta L1/L2/O1-O3/E1-E2 sin cambios de paradigma. La única pieza que exige vigilancia de coste es la
**plasticidad en vida** (O4) — por eso se deja graduable.

---

## 9. Síntesis

**8 mecanismos** —2 leyes, 4 del organismo, 2 del bucle— generan los seis fenómenos pedidos **sin sembrar ni
imponer impuestos**, sustituyendo **~30 parámetros de balance** por **un puñado de constantes físicas y de
contorno**. La idea central: **una sola decisión termodinámica (energía abierta, materia cerrada) más un genotipo
que se desarrolla** desmonta las cuatro causas raíz de la auditoría. La emergencia deja de ser *guiada* (sembrada y
tuneada) para volverse *espontánea* dentro de un mundo con leyes honestas.

Lo que se conserva del modelo actual no es casualidad: **materia cerrada**, **cerebro neuronal**, **morfología
generativa** y la **base técnica** ya eran los activos sólidos de la auditoría — aquí se re-derivan desde primeros
principios y se les quita el andamiaje. Lo que se elimina es exactamente lo que la auditoría marcó como deuda: los
parámetros que ocupaban el lugar de leyes ausentes.

*(Sin código ni plan de migración — siguiente fase.)*
```
