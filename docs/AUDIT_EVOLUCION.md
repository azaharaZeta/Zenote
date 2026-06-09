# Auditoría evolutiva — hacia un modelo científico simplificado (v2.0)

**Fecha:** 2026-06-09 · rama `revision-genes`.

## Propósito

Revisar, de lo más *core* a lo más periférico, cada mecanismo que toca la cadena
**gen → fenotipo → coste → supervivencia → reproducción**, para distinguir:

- 🟢 **FÍSICA** — derivado de un principio físico/biológico defendible. Lo mantenemos.
- 🟡 **DISEÑO** — un mapa o coeficiente elegido a mano (una *perilla*). No es ley natural,
  pero no rompe la emergencia: solo fija la forma del paisaje. Revisable, no urgente.
- 🔴 **MULETA** — cortocircuita un *resultado* evolutivo: suprime un desenlace "indeseado"
  o inyecta una conducta/estructura para que la simulación "funcione". Es lo que más
  contamina el realismo. Candidato a eliminar o sustituir por un mecanismo emergente.

Objetivo: un **modelo de simulación científica simplificado pero ágil** (corre a miles de
agentes en el navegador). La regla de oro: *el programador define la física del mundo y la
expresión de los genes; nunca qué genes son buenos* (CLAUDE.md regla nº1).

> **Nota de coste computacional:** casi todas las mejoras de realismo de esta lista son
> **gratis en CPU** (un `pow()` extra al nacer, ya cacheado; cambiar un cruce; borrar un tope).
> El coste real de subir el realismo no es rendimiento, es **estabilidad y tuning**: al quitar
> muletas la dinámica se vuelve más honesta y más propensa a oscilar/colapsar. Eso es esperado
> y aceptable en esta fase (el usuario ha dicho que no importa romper la supervivencia ahora).

---

## El dogma central (cadena causal real, hoy)

```
        genoma [0,1]^128                         (genome.js: SoA, herencia, mutación)
            │
            │  computePhenotype()  ◄── ÚNICA frontera programador↔evolución
            ▼                          (organism.js: traduce, no juzga)
   fenotipo cacheado: radius, vmax, turnRate, senseR, eMax, baseCost, lure,
                      absEff, effHerb/effCarn, reproNeedE, investE, wFood/Prey/Flee…
            │
            │  step()                                              (sim.js)
            ▼
   percepción (cono visual) → DESEO de movimiento
            │   ├─ reactivo: combinación lineal w_food·∇comida + w_prey·presa − w_flee·amenaza
            │   └─ neural (por defecto): MLP recurrente, pesos = genes → deseo
            ▼
   movimiento (giro limitado por turnRate) → coste de nado ∝ v²
            ▼
   ENERGÉTICA: E -= baseCost·(1+coste térmico) + coste de nado ; E += pasto/caza/carroña
            ▼
   MUERTE (E≤0 inanición · vejez estocástica · cazado · combate fallido)
   REPRODUCCIÓN (E ≥ reproNeedE y sin cooldown → cría: sexual con cruce / asexual clon+mut)
```

**Lo bueno (ya es sólido):**
- La frontera gen→fenotipo está **en un solo sitio** (`organism.js`) y está comentada como tal. ✅
- **No existe función de fitness.** El "fitness" es 100% emergente: balance energético + sobrevivir
  + criar. Nadie puntúa a un organismo. ✅ Esto es lo más difícil de conseguir y ya está bien.
- El cerebro neuronal (modo por defecto) hace que la **conducta** sea emergente: los pesos son genes
  bajo selección, no hay if/else de estrategia. ✅
- Linaje heredado sin mutar (ascendencia auditable) y distancia genética → especies. ✅

---

## Principios del modelo objetivo (norte de la v2.0)

1. **Una sola frontera** gen→fenotipo (ya la hay). Nada de física dispersa.
2. **Mapas gen→fenotipo con base, no lineales por defecto.** Donde la biología dice *ley de
   potencia* (alometría), usarla. Límites **blandos** (coste creciente) en vez de topes duros que
   la evolución no puede cruzar.
3. **Mutación ciega a la función.** Una tasa por locus (con hotspots si se quiere), *no* clasificada
   por categoría fenotípica. La recombinación respeta el **ligamiento** (genes contiguos → co-heredados).
4. **Fitness 100% emergente** de energía + supervivencia + reproducción. **Cero fudges por categoría**
   (nada de "los herbívoros grandes pagan extra para que no saturen").
5. **Capacidad de carga emergente del recurso.** Sin topes duros de población. La estabilidad, si hace
   falta, de **mecanismos reales** (estructura del hábitat/refugio físico, tiempo de manejo, depredación
   estructurada por talla), no de perillas estabilizadoras.
6. **El ambiente es paisaje fijo del programador** (recurso, temperatura, luz); la adaptación a él
   emerge. Esto es legítimo y se mantiene.
7. **La morfología ES fenotipo seleccionado, no decoración.** La física (empuje, arrastre, masa, giro,
   visión, alimentación, combate) se **deriva de la geometría real** del organismo. No hay catálogo de
   tipos de pieza hardcodeados ("cabeza", "antena", "módulo"): el cuerpo se construye de una primitiva
   genérica y la forma útil emerge. → Ver **[Pilar de la v2.0](#pilar-de-la-v20--forma-y-movimiento-emergentes)**.

---

## Clasificación rápida de mecanismos

| Mecanismo | Dónde | Tipo | Nota |
|---|---|---|---|
| Frontera única gen→fenotipo | organism.js | 🟢 | Mantener |
| Sin función de fitness (emergente) | sim.js | 🟢 | Mantener |
| Cerebro neural (pesos=genes) | sim/genome | 🟢 | Mantener (modo por defecto) |
| Cerebro REACTIVO (plantilla de conducta fija, no default) | sim.js | 🟡→✂️ | Esqueleto a mano (`w_food·∇ + w_prey − w_flee`); solo los pesos evolucionan. **DECISIÓN: cortar** (neural-only) — ver Catálogo |
| Visión: `e_fov` reparte alcance↔ángulo (r²·fov=cte) | organism.js | 🟢 | Buen modelo |
| Coste de nado ∝ v² (arrastre) | sim.js | 🟢 | Físico |
| Locomoción: empuje vs arrastre (forma→velocidad) | organism.js | 🟢 con perillas 🟡 | Físico de fondo, muchos coef. a mano |
| Combate estocástico fi/(fi+fj) por fuerza | sim.js | 🟢/🟡 | Lanchester-like; `sizeAdvantage` es perilla |
| Banda de talla de presa (`preyBandLo/Hi`) | sim.js | 🟢 | Depredación estructurada por talla (real) |
| Campos ambientales (temp, luz, capacidad) | world.js | 🟢 | Paisaje del programador (legítimo) |
| Pasto logístico + difusión (`patchiness`) | world.js | 🟢 | Parches emergentes (ya rehecho) |
| Senescencia estocástica | sim.js | 🟢 | Real |
| **Mapa gen→fenotipo LINEAL (lerp) en todo** | organism.js | 🟡 | Sin alometría; ver Capa 1 |
| **Topes duros `expr.{min,max}`** | config/organism | 🟡 | La evolución no puede cruzarlos |
| **3 tasas de mutación por categoría** (base/form/decor) | genome.js | 🔴 | La mutación no conoce la función |
| **Crossover uniforme (sin ligamiento)** | genome.js | 🟡 | Rompe complejos co-adaptados; ver Capa 2 |
| **Reproducción desacoplada del tamaño** (0.85+0.3·size) | organism.js | 🔴 | Aplana el gradiente r/K a propósito |
| **`maxAlive` (tope duro de población)** | sim.js | 🔴 | Capacidad de carga debería emerger |
| **`carnUpkeep`** (descuento de coste ∝ dieta carnívora) | organism.js | 🔴 | Muleta de resiliencia carnívora |
| **`k_sizeHerb`** (coste extra solo a herbívoros) | organism.js | 🔴 | Hoy =0; muleta latente |
| **Refugio de presa (no cazable)** | sim/world | 🟡/🔴 | Estabilizador L-V; tiene base (Huffaker) pero hoy es interruptor |
| **`grazeRefuge`** (reserva intocable) | sim.js | 🟡 | Banco de semillas (defendible) o muleta anti-colapso |
| Cohorte proto-carnívora + cerebro "competente" al sembrar | sim/genome | 🟡 concesión | Condición inicial, no estrategia; cruza el valle de fitness |
| Genes decorativos neutrales (DECOR) | genome.js | 🟢 | Deriva neutral (real); la *lista* es elección 🟡 |
| Color como pigmento (`hue` vs `lightHue`, `matchPenalty`) | sim.js/world.js | 🟢 | Camuflaje FUNCIONAL (eje de nicho); **NO** es deriva neutral pese al nombre "linaje" |
| Reciclaje de nutrientes (cadáver→recurso, `corpseReturn`) | sim.js | 🟢 | Descomposición devuelve energía al campo (real) |
| Penalización de omnívoro (`omniPenalty`) | organism.js | 🟡 | Compromiso de especialización; hoy =0 (desactivada) |
| Comentario "orn/pref se heredan juntos" | genome/sim | ⚠️ | Impreciso con crossover uniforme; ver Issues |
| Comentario `geneticDistance` "sin hue" | genome.js | ⚠️ | Falso: `hue` SÍ entra en la distancia; ver Issues |

---

## Hallazgos por capa (de core a periférico)

### Capa 1 — Representación del genoma y mapa gen→fenotipo  *(el corazón)*

**Hoy:** cada gen es un float `[0,1]` independiente; el fenotipo sale de `lerp(min,max,gen)`
**lineal** y acotado por `expr.{min,max}`. Hay pleiotropía *manual* sensata (p. ej. `size`
alimenta radio, eMax, coste, giro y reproducción) — eso está bien.

**Problemas de realismo:**
1. **Todo es lineal.** En biología los rasgos escalan con *leyes de potencia* (alometría). El caso
   canónico: **metabolismo ∝ masa^0.75** (Kleiber), y masa ∝ tamaño³ (volumen). Aquí el coste basal
   es *lineal* en `size` (`1 + k_size·size`) y la masa de segmentos va por *área* (size²). No hay un
   esqueleto alométrico coherente. → **Dirección:** definir masa = f(size, complejidad) por volumen y
   derivar coste metabólico, eMax y quizá velocidad de ahí con exponentes alométricos. Un `Math.pow`
   al nacer; coste CPU nulo.
2. **Topes duros (`expr.min/max`).** La evolución no puede explorar fuera del rango (p. ej. `size`
   tope 9px). → **Dirección:** límites *blandos*: dejar el gen sin clamp duro de fenotipo y que el
   **coste creciente** (alométrico) sea quien ponga el techo. Así el tamaño máximo lo decide la
   selección, no una constante.
3. **Clamp01 en mutación** acumula alelos en los bordes 0 y 1 (artefacto). → reflejar/transformar en
   vez de recortar (menor prioridad).

### Capa 2 — Variación: mutación + herencia  *(el motor de la evolución)*

1. **🔴 Tres tasas de mutación por categoría** (`rate`/`formRate`/`decorRate`). Una mutación física
   **no sabe** si cae en un gen de color, de forma o de metabolismo. Esto se metió por *estética*
   (que la apariencia varíe rápido y vistosa), no por biología. Es, para mí, **la decisión menos
   científica del proyecto**. → **Dirección:** una sola tasa por locus. Si se quiere que la apariencia
   varíe, que sea porque es **neutral** (sin presión que la fije), no porque muta más rápido. Hay que
   medir: probablemente la variedad visual se sostiene sola por deriva neutral con una tasa única.
2. **🟡 Crossover uniforme** (cada gen al azar de un padre). Destruye el **ligamiento**: los complejos
   de genes co-adaptados (p. ej. el bloque de forma contiguo, o kit cazador) se barajan cada
   generación. En biología los loci cercanos se heredan juntos. → **Dirección:** cruce por **bloques/
   puntos de corte** que respete la contigüidad del genoma (el bloque de forma ya es contiguo a
   propósito). Coste CPU nulo, y hace la herencia mucho más realista.
3. **Tasa de mutación no evolucionable** (se quitó el gen `mut_rate`). En la naturaleza la tasa
   evoluciona. Concesión por estabilidad — aceptable de momento, anotado.

### Capa 3 — Energética = el paisaje de fitness implícito  *(aquí vive la presión selectiva)*

Los coeficientes `k_*` **son** los gradientes de selección. La mayoría son perillas a dedo. Triage:

- 🟢 `moveCost·v²`, `k_sense`, costes de masa/arrastre: tienen base física.
- 🔴 **`reproRef` desacoplado del tamaño** (`0.85 + 0.3·size` en vez de `0.5 + size`): el comentario
  lo admite — se *aplana a propósito* el gradiente r/K porque, con el natural, el pequeño criaba ~3×
  más rápido y todo colapsaba al mínimo. Es suprimir un **resultado evolutivo real** (selección r) por
  inconveniente. → **Dirección:** restaurar el compromiso r/K honesto y, si el colapso a talla mínima
  es indeseado, contrarrestarlo con un **mecanismo real** (depredación estructurada por talla que
  penalice a los muy pequeños, coste alométrico) en vez de falsear la reproducción.
- 🔴 **`carnUpkeep`** (carnívoro gasta menos basal): muleta explícita de resiliencia. Tiene un *resquicio*
  biológico (los depredadores ayunan mejor), pero hoy está puesto para que no se extingan. Revisar
  cuando abordemos los carnívoros.
- 🔴 **`k_sizeHerb`** (coste extra solo a herbívoros): muleta para que no haya herbívoros gigantes que
  saturen el mapa. Hoy =0, pero sigue en el código como tentación. → eliminar el concepto; que la talla
  la regule la alometría + depredación.

### Capa 4 — Física del mundo y ecología

- 🔴 **`maxAlive` (tope duro).** La capacidad de carga real **emerge del recurso**; un tope numérico es
  no-ecológico. → **Dirección:** quitarlo (o dejarlo solo como límite de memoria = `maxAgents`). Que la
  población la limite la comida.
- 🟡/🔴 **Refugio de presa** y **`grazeRefuge`**: estabilizadores Lotka-Volterra. El refugio *físico*
  (cobertura espacial donde la presa escapa) tiene base ecológica sólida (experimentos de Huffaker), así
  que **un refugio espacial es defendible**; lo que es muleta es usarlo como interruptor de "no cazable".
  → revisar como estructura de hábitat, no como flag binario.
- 🟢 Pasto logístico + difusión de semilla (`patchiness`): ya es emergente, bien. El suelo de semilla
  `0.04` (banco de semillas) es una concesión pequeña y defendible (evita estado absorbente).
- 🟢 Campos de temperatura/luz/capacidad: paisaje del programador, legítimo.

### Capa 5 — Mapas de rasgos concretos

- 🟢 **Visión** (`e_fov` conserva área del cono): modelo elegante, mantener.
- 🟢/🟡 **Locomoción** (empuje·simetría / arrastre·elongación·segmentos): física de fondo correcta, pero
  con ~12 constantes de calibración (`kThrust`, `waveFloor`, `segDrag`…). Revisar si alguna esconde una
  decisión de "qué forma es buena". Decisión defendible: los apéndices son *decorativos* (no afectan al
  nado) para que la silueta no la uniformice la selección — concesión estética consciente.
- 🟢/🟡 **Combate:** fuerza = (size+0.1)^`sizeAdvantage`·(0.5+aggro), victoria estocástica. Razonable.
  `failDamage` (recién añadido) es perilla de estabilización. `preyBand` por talla es buen realismo.

### Capa 6 — Historia de vida / reproducción

- Madurez y senescencia a edades fijas (perillas). **DECISIÓN: pasan a ser genes** (`mature_age`,
  `senescence`) → emergen estrategias r/K y vidas cortas-rápidas vs largas-lentas. Ver Catálogo (#12).
- `cooldown` de reproducción fijo, no evolucionable — perilla menor (candidato a gen junto al #12).
- El desacople r/K ya tratado en Capa 3 (es el punto caliente de esta capa).

### Capa 7 — Cosmético / periférico

- Colores por parte, estilo de ojo, piel y estilo de señuelo (`c_*`, `s_curve`, `tex2`, `o_hue`, `o_num`):
  **deriva neutral**, base de selección sexual y reconocimiento. Correcto como está (a consolidar, ver
  Catálogo). Pega: hoy mutan más rápido por la regla de 3 tasas (ver Capa 2); si la unificamos, comprobar
  que la variedad visual aguanta por deriva.
- ⚠️ **`o_len` y `o_bulb` NO son neutrales** pese a estar en `DECOR`: fijan la **prominencia del señuelo**
  (`organism.js`), que **cuesta energía** (`k_lure`) y **extiende el alcance de caza** (`lureReach`). Es un
  diseño deliberado (gen "decorativo" con consecuencia funcional para que la presión de caza lo mueva), pero
  son FUNCIONALES. En la v2.0 se subsumen en un nodo-señuelo (ver Catálogo y Pilar).
- ⚠️ **`hue` NO es neutral** (aunque la etiqueta de UI lo llame "Color (linaje)"). El tono **afecta a
  la alimentación**: cuanto mejor sintoniza con la luz local (`lightHue`), más pasto capta (camuflaje
  funcional, `matchPenalty=0.6`); y además **cuenta para la distancia genética/especie**. Es un rasgo
  **FUNCIONAL** (eje de nicho de camuflaje), no decorativo. Reclasificado en la tabla; el "linaje" real
  y auditable es el campo `lineage` (heredado sin mutar), no `hue`.

---

## Concesiones que probablemente conviene MANTENER (pragmatismo)

- **Condición inicial sembrada** (cohorte proto-carnívora + cerebro "competente"): no es estrategia
  codificada, es el *estado de partida*. Cruza el valle de fitness herbívoro→cazador que, desde pesos
  aleatorios, casi nunca se cruza en tiempo de navegador. Es como sembrar un ecosistema con especies
  fundadoras. Legítimo siempre que **la conducta siga evolucionando** después (lo hace).
- **Genes decorativos neutrales:** la neutralidad es real; marcar explícitamente cuáles son neutrales
  es una simplificación honesta.
- **Paisaje ambiental fijo:** el programador define el mundo; eso no es una muleta.
- **Banco de semillas (suelo 0.04 de rebrote):** evita un estado absorbente artificial; los bancos de
  semillas existen.

---

## Backlog priorizado (orden de ataque sugerido)

De más fundacional / mayor retorno de realismo a más periférico.
**Progreso: 6/14 hechos** → ✅ #1, #2, #4, #5, #6, #11.

0. ⬜ **🏛️ PILAR v2.0 — Forma y movimiento emergentes** (arco grande, incremental A→B). Es el titular del
   rediseño y subsume gran parte de las Capas 1 y 5. Ver sección dedicada abajo. Puede solaparse/ordenarse
   con los pasos siguientes (la alometría #3 y los límites blandos son su lenguaje físico natural).
1. ✅ **Mutación: unificar a una tasa por locus** (quitar las 3 categorías). *La decisión menos científica.*
   *Hecho: `rate=0.05`, `sigma=0.08` (punto medio); fuera `decor*`/`form*` y el set `FORM`.* — *Capa 2*
2. ✅ **Crossover con ligamiento** (recombinación por locus en vez de uniforme). *Hecho: `mut.recomb=0.07`
   (0.5 ≡ uniforme); preserva complejos co-adaptados y co-herencia `orn`/`pref`.* — *Capa 2*
3. ⬜ **Alometría en el mapa gen→fenotipo** (masa por volumen; coste metabólico ∝ masa^¾; límites blandos
   por coste en vez de topes duros). Gran palanca de realismo, coste CPU nulo. — *Capa 1*
4. ✅ **Restaurar el compromiso r/K honesto** (quitar el desacople de `reproRef`). *Hecho: `reproRef = eMaxBase`
   = `E_max_base·(0.5+size)`; fuera `reproBase`/`reproSizeCost`. r/K emerge de la talla. Pendiente observar si
   colapsa a talla mínima → entonces compensar con depredación/coste estructurado por talla.* — *Capa 3/6*
5. ✅ **Quitar `maxAlive`**: capacidad de carga emergente del recurso. *Hecho: único límite = `maxAgents`
   (pool físico); retirado también el diagnóstico `atCap` del worker.* — *Capa 4*
6. ✅ **Retirar muletas energéticas** (`carnUpkeep`, `k_sizeHerb`). *Hecho: coste basal independiente de la
   dieta.* — *Capa 3*
7. ⬜ **Repensar el refugio** como estructura de hábitat espacial, no flag "no cazable". — *Capa 4*
8. ⬜ **Auditar las constantes de locomoción** por si alguna fija "qué forma es buena". — *Capa 5*

**Catálogo de genes (decidido el 2026-06-09, ver sección dedicada):**

9. ⬜ **Cortar el modo reactivo** y los genes `w_food`/`w_prey`/`w_flee` (cerebro neural-only). — *Catálogo*
10. ⬜ **Plegar `aggro` en el cerebro** (nueva salida de ataque, `O: 2→3`). — *Catálogo*
11. ✅ **Eliminar el subsistema de carroña** (código `carrion`). *Hecho: `corpseReturn` se mantiene.* — *Catálogo*
12. ⬜ **Añadir genes de historia de vida** (`mature_age`, `senescence`). — *Catálogo*
13. ⬜ **Consolidar los genes de color/adorno** casi-redundantes (sin perder identidad visual). — *Catálogo*

> Cada paso es pequeño y verificable por separado, como pide el flujo del proyecto. Conviene un commit
> por paso y medir la deriva de algún gen / la dinámica antes de seguir.

### Orden de ejecución y dependencias (factibilidad)

El orden de arriba es por *retorno de realismo*, no por dependencias. Para ejecutar sin rehacer trabajo:

- **Calentamiento aislado, bajo riesgo (no tocan el layout del genoma):** #11 (quitar carroña) y #5
  (quitar `maxAlive`) son recortes limpios → buen primer paso para coger ritmo en la rama.
- **Cambios de LAYOUT del genoma** (#0 Pilar, #9 cortar `w_*`, #10 salida de ataque del cerebro, #12 genes
  de vida, #13 consolidar color): **todos** mueven `NUM_GENES`/índices y obligan a tocar a la vez distancia
  genética, sembrado (`_seedSimple`/`_seedInitial`), `GENE_LABELS`/`GENE_GROUPS` y los histogramas de UI.
  → **agruparlos** (idealmente dentro del rediseño del Pilar #0, que es el que más reescribe) para hacer el
  bookkeeping de índices **una sola vez**. Nota: cortar `aggro`/`w_*` y `O:2→3` recalculan también `BRAIN_W`.
- **#1 (mutación) y #2 (crossover)** tocan `genome.js` pero NO el layout → pueden ir cuando sea; hacerlos
  pronto da una base de variación limpia para medir el resto.
- **#3 (alometría) y #4 (r/K)** dependen de tener definida la **masa**; #3 encaja junto al Pilar (la masa
  por nodos es su insumo natural).
- **Verificación:** cada paso se mide con la instrumentación que **ya existe** (histograma por gen, curvas
  de población/especies, gráfica de causas de muerte) + runs headless donde haga falta. **Definir la métrica
  de éxito ANTES** de cada paso (sobre todo el criterio de "la forma está bajo selección", ver A1).

---

## Pilar de la v2.0 — Forma y movimiento emergentes

> El cambio más grande del rediseño. Hoy la morfología es, en gran parte, **estética sin consecuencia
> evolutiva**. El objetivo: que la forma y el modo de moverse sean fenotipos sometidos a selección natural.

### El diagnóstico: la morfología vive en dos mitades desconectadas

- **Mitad física:** ~5 genes escalares (`m_wave`, `m_sym`, `m_elong`, nº de segmentos, presencia/tamaño
  de módulos) alimentan una **fórmula cerrada** (`organism.js`) que produce `vmax`, `turnRate`, masa y
  `eMax`. Es lo único de la forma que importa para sobrevivir.
- **Mitad cosmética:** un **catálogo grande de piezas** (nº/largo/grosor de apéndices, 2 módulos con
  ángulo/distancia, patas del cuerpo, silueta de cabeza, piel, señuelo…) que **solo lee el render**. En
  `organism.js` está escrito: *"los apéndices NO afectan al nado"*.

**Consecuencia:** la forma **no está bajo selección**. Lo que se ve es ruido evolutivo, no adaptación.
Dos criaturas visualmente opuestas nadan idéntico si coinciden esos ~5 escalares. Eso contradice la
regla nº1 del proyecto (la morfología real se selecciona; aquí deriva gratis).

Hoy hay **tres estatus** de gen morfológico — el objetivo es colapsar los dos primeros en "funcional":
1. **Funcional** (alimenta la física): `m_wave`, `m_sym`, `m_elong`, `m_seg`, módulos on/size.
2. **Forma inerte** (muta y cuenta para especie, pero NO toca la física): nº/largo/grosor de apéndices,
   patas, ramificación, núcleo, silueta de cabeza… ← *el limbo a eliminar.*
3. **Decoración neutral** (color, piel, ángulos de módulo, señuelo): **se mantiene** como deriva neutral
   honesta (ver nota de variedad visual abajo).

### El principio único

> **La física debe LEER la morfología real, no una fórmula paralela.** Empuje, arrastre, masa, giro,
> visión, alimentación y combate se derivan de la geometría que el organismo efectivamente tiene (y
> dibuja). Ese es el quid, sea cual sea la representación del cuerpo.

### La restricción dura (y por qué es asumible)

Simular física por-pieza de cuerpos arbitrarios (Karl Sims: rígidos + articulaciones + músculos +
fluido) es **inviable** para miles de agentes en navegador. Pero la morfología es **fija durante la
vida**, así que se ensambla el cuerpo y se **reduce a propiedades físicas UNA vez al nacer** (cachear
`vmax`, perfil de arrastre, masa, giro, posición de sensores, área de boca…). El bucle caliente sigue
O(1) por agente. **El coste de este realismo no es CPU, es el refactor y la estabilidad.**

### Representación objetivo (B): cuerpo generativo de UNA primitiva

Eliminar las categorías de pieza. El cuerpo es un **grafo/árbol de nodos** de una sola primitiva
("un segmento con tamaño, orientación relativa al padre y reglas de hijos"). "Cabeza", "antena",
"pata", "aleta" dejan de ser tipos → son nodos en posiciones/escalas que resultaron útiles.

Encaje **SoA-friendly** (sin genoma de longitud variable, para no romper los typed arrays): un **pool
fijo de nodos** (p. ej. ≤8), cada nodo un bloque de genes pequeño y fijo:
`{ present, parent (índice/regla de anclaje), length, width, angle, osc_amp, osc_phase, osc_freq }`.
La topología abierta surge de `present` (on/off) + el puntero al padre; la recursión de Karl Sims se
sustituye por este pool acotado (compromiso ágil para navegador).

**Física derivada del cuerpo ensamblado (todo cacheado al nacer):**
- **Masa** = Σ volumen de nodos (∝ length·width²) → `eMax` y coste basal (vía alometría, Capa 1).
- **Arrastre** = Σ área frontal de cada nodo proyectada perpendicular al movimiento → cuerpo alineado y
  esbelto = poco arrastre; nodos transversales = mucho. La hidrodinámica emerge de la forma.
- **Giro** = asimetría del empuje/arrastre respecto al eje → cuerpos asimétricos giran mejor; grandes/
  elongados, peor. (El espíritu de la fórmula actual, ahora derivado de la geometría.)
- **Visión/alimentación/combate** ("y quizá más"): nodos-sensor → dirección/cobertura del cono (subsume
  `e_fov`); área de un nodo-boca → ritmo de pasto; nodos que proyectan hacia delante → alcance/fuerza de
  ataque. Toda interacción lee la geometría.

### Movimiento: la marcha también emerge (Nivel 2, decisión tomada)

El **modo de moverse** es fenotipo, no solo la capacidad. Los nodos **oscilan** con amplitud/fase/
frecuencia evolucionables (un CPG diminuto = genes `osc_*`). El empuje neto = suma de las brazadas
proyectadas sobre el rumbo, contra el arrastre:
- Fases **coordinadas** (una onda viajera por una cadena de nodos = ondulación tipo anguila) → empuje
  neto alto. Fases **descoordinadas** → se cancelan, gastan energía sin avanzar.
- → **una marcha eficiente EMERGE** por selección (la coordinación no se programa; se premia).
- El **coste de moverse** = trabajo contra el arrastre (∝ v²) + coste de oscilar partes (∝ amp²·freq·masa)
  → mover apéndices grandes cuesta → ata la marcha a la energética → hay presión real sobre el gait.

**Cómo hacerlo barato (clave de viabilidad del Nivel 2):** computar la **locomoción efectiva** (empuje
medio, perfil de arrastre, ganancia de giro, coeficiente de coste) **una vez al nacer** — promedio
analítico del ciclo del gait o un *rollout* corto. El **render anima la oscilación en vivo** (visual,
desacoplado de la física). Así el gait se selecciona y se VE, pero el bucle caliente sigue O(1)/cacheado.

### Plan incremental A → B (cada paso verificable, estilo "fases" del proyecto)

- **A1 — Hacer físicas las piezas actuales.** Enrutar los genes de "forma inerte" (apéndices, patas,
  módulos, silueta) por la física: cada uno suma arrastre + masa (+ algo de empuje). El empuje/arrastre/
  giro pasan a sumarse **sobre la geometría real**; se pliega o retira la fórmula `wave·sym`. *Render sin
  cambios.* **Criterio (cuidado: no confundir deriva con selección — hoy ya derivan neutralmente):** un
  gen de forma muestra **respuesta a la selección**, p. ej. correlaciona con el nicho (los cazadores
  convergen a cuerpos hidrodinámicos) o un *knockout* del acoplamiento físico cambia su distribución.
- **A2 — Empuje desde superficies que oscilan.** Sustituir el gen abstracto `m_wave` por empuje generado
  por partes que se mueven → puente hacia el gait.
- **B1 — Geometría única (compatibilidad).** Introducir el pool de nodos por debajo expresando las
  piezas actuales como nodos, de modo que **render y física compartan una sola geometría**.
- **B2 — Colapsar las categorías.** Eliminar las distinciones hardcodeadas cabeza/segmento/módulo/
  apéndice; topología por `present` + padre. **Criterio:** runs distintas hacen emerger planes
  corporales cualitativamente distintos sin tipos predefinidos.
- **B3 — Gait emergente (Nivel 2).** Genes `osc_*` por nodo → locomoción efectiva cacheada al nacer;
  render anima. **Criterio:** emergen marchas coordinadas (ondulación, remo) seleccionadas por eficiencia.

### Qué rompe (esperado; es una v2.0)

Layout del genoma (`NUM_GENES`, índices) → distancia genética, umbral de especie, sembrado, histogramas/
labels de UI; **reescritura del render** para dibujar grafos de nodos arbitrarios; versionado/guardado.

### Nota de variedad visual (para no llevarse un susto)

Al volverse funcional la forma, la **deriva morfológica "gratis" desaparece**: la selección puede hacer
**converger** los cuerpos de un mismo nicho (eso es realista — la convergencia existe). La variedad visual
pasará a venir de (a) **nichos/especies distintos**, y (b) los **ejes genuinamente neutrales** (color,
patrón de piel) que mantenemos a propósito. El menagerie se verá menos aleatorio y más "diseñado por la
selección" — que es justo el objetivo.

---

## Revisión del catálogo de genes (¿se gana cada gen su sitio?)

> Revisión del **genoma** (no de los mecanismos) bajo la misión: una evolución **visual y fascinante**
> bajo selección natural. Esto describe el **catálogo OBJETIVO de la v2.0**, no el estado de hoy.
> Las 4 decisiones de abajo ya están **tomadas** (2026-06-09).

### Criterio: un gen merece existir si cumple ≥1 de estos papeles

- **(a) Nicho/estrategia ecológica** que se ve divergir (dieta, talla, clima…).
- **(b) Morfología visible bajo selección** — se *ve* la adaptación en el cuerpo.
- **(c) Conducta emergente** (pesos del cerebro).
- **(d) Identidad visible / selección sexual** que se ve desplegarse (color, glow, ornamento).

El pecado a evitar: la **"forma inerte"** (genes de forma que ni son funcionales ni son honestamente
"identidad neutral"). Esos se subsumen o se cortan.

### Decisiones tomadas

1. **Cerebro NEURAL como único modo** → se corta el modo reactivo y con él `w_food`, `w_prey`, `w_flee`.
2. **Atacar emerge del cerebro** → se corta `aggro`; el cerebro gana una **3ª salida** (impulso de ataque), `O: 2→3`.
3. **Eliminar el subsistema de carroña** (no hay gen; estaba off; era muleta). Coste 0 genes. *Ojo:* el
   reciclaje de nutrientes vía `corpseReturn` (cadáver→campo de recurso) es un mecanismo **distinto** y se
   mantiene; hoy solo actúa en muertes por **vejez** → oportunidad de extenderlo a TODAS las muertes
   (inanición, depredación) para un ciclo de nutrientes honesto que sustituya al carroñeo.
4. **Historia de vida evolucionable** → madurez y senescencia/longevidad pasan de config global a **genes nuevos**.

### Veredicto por gen

Leyenda: **KEEP** se queda · **CHANGE** se queda recontextualizado · **SUBSUME** se absorbe en los nodos
del cuerpo (Pilar v2.0) · **CUT** se elimina · **ADD** gen nuevo a introducir.

**🟢 Ecología / fisiología — núcleo (crean los nichos que dan el drama visual):**

| Gen | Veredicto | Nota |
|---|---|---|
| `diet` | KEEP | Eje herbívoro↔carnívoro; el motor del espectáculo depredador-presa |
| `size` | KEEP* | *Puede pasar a EMERGER como suma del tamaño de los nodos (decidir al implementar) |
| `metab` | KEEP | Compromiso coste↔ritmo de alimentación |
| `temp_pref` | KEEP | Nicho térmico → zonación espacial visible |
| `repro_thr` | KEEP | Estrategia r (cuándo criar) |
| `invest` | KEEP | Inversión parental por cría (r/K) |
| `speed` | CHANGE | Hoy = "esfuerzo". **Cuestión abierta:** con `osc_*` por nodo puede solaparse → decidir si queda como un acelerador global (incluso una SALIDA del cerebro) o se subsume en los `osc_*` |
| `sense` | CHANGE* | *Puede emerger del tamaño/colocación de un nodo-sensor |

**🧠 Conducta:**

| Gen | Veredicto | Nota |
|---|---|---|
| `br0..br76` (pesos) | KEEP + crecer | Motor de conducta emergente; `O: 2→3` (añade salida de ataque) |
| `aggro` | CUT | Atajo conductual; pasa a ser salida del cerebro |
| `w_food`, `w_prey`, `w_flee` | CUT | Vestigiales en modo neural (solo los usaba el reactivo, ya cortado) |

**🔧 Morfología — SE RECONSTRUYE entera (Pilar v2.0): se subsume en genes de nodo:**

| Genes | Veredicto | Nota |
|---|---|---|
| `m_app`, `m_len`, `m_width`, `m_sym`, `m_elong`, `m_wave` | SUBSUME | Apéndices/forma → geometría de nodos + `osc_*` |
| `m_seg`, `m_segtaper`, `m_segspace` | SUBSUME | Segmentos = cadena de nodos |
| `mod0_*`, `mod1_*` | SUBSUME | Un módulo = un nodo |
| `s_asym`, `s_place`, `s_branch`, `s_core` | SUBSUME/CUT | Forma inerte → nodos o se elimina |
| `leg_len`, `leg_grad` | SUBSUME | Patas = nodos |
| `b_aspect` | SUBSUME/CUT | Esbeltez → ancho de nodos |
| `e_fov` | SUBSUME | Campo de visión → emerge de un nodo-sensor |
| `o_len`, `o_bulb` | SUBSUME | Señuelo = nodo emisor de luz (función) |

**🎨 Identidad / display — se quedan (sirven a la misión visual), pero a CONSOLIDAR:**

| Gen | Veredicto | Nota |
|---|---|---|
| `hue` | KEEP | **Funcional** (camuflaje vs luz local); no neutral |
| `orn`, `pref` | KEEP | Selección sexual (runaway de Fisher) = espectáculo emergente |
| `c_lum` (glow), `c_sat` | KEEP | Ejes neutrales que dan cara reconocible al linaje |
| `s_curve`, `tex2` | KEEP/consolidar | Patrón de piel (neutral) |
| `c_app`, `c_tip`, `c_eye` | consolidar | Colores por parte; hoy casi redundantes → fusionar |
| `o_hue`, `o_num` | CUT/consolidar | Adorno del señuelo; estilo, poco valor |

**➕ Genes que FALTAN (ADD):**

| Gen(es) | Papel | Nota |
|---|---|---|
| Nodos del cuerpo: `present`, `parent`, `length`, `width`, `angle`, `osc_amp`, `osc_phase`, `osc_freq` (×N) | (b) | El gran añadido del Pilar v2.0 |
| Salida de ataque del cerebro | (c) | Sustituye a `aggro`; cazar/agredir emerge |
| `mature_age`, `senescence` (longevidad) | (a) | Estrategias r/K, vidas cortas-rápidas vs largas-lentas |
| *(opcional)* preferencia de presa por talla | (a/c) | Ya en `IDEAS.md`; como entrada/salida del cerebro |

### Nota sobre los ejes neutrales (no son "relleno")

El color/glow/patrón **no se seleccionan**, pero son **esenciales para la misión visual**: dan a cada
linaje una **identidad reconocible**, así *ves* las especies separarse en pantalla. Es la división limpia
de la v2.0: **forma = función**, **color = identidad/sexo**. Conviene **consolidarlos** (hoy hay demasiados
genes de color casi-redundantes) pero no eliminarlos.

---

## Issues de corrección detectados (no decisiones de diseño, posibles errores)

- ⚠️ **Comentarios "orn/pref se heredan juntos → runaway"** (`genome.js` BASE_GENES y `sim.js` `_findMate`):
  con **crossover uniforme** cada gen se hereda **independientemente**, así que `orn` y `pref` *no* viajan
  físicamente juntos. El runaway de Fisher aún puede surgir por **desequilibrio de ligamiento** que
  construye el apareamiento selectivo, pero es **más débil** de lo que el comentario afirma. Si se
  implementa el cruce con ligamiento (backlog #2) y se colocan `orn`/`pref` contiguos, el comentario
  pasaría a ser correcto. Anotado para no olvidar.
- ⚠️ **`geneticDistance` dice "sin hue" pero SÍ incluye `hue`** (`genome.js`): el comentario afirma que
  excluye el tono, pero `FUNCTIONAL` solo descarta el cerebro y los `DECOR`, y `hue` no está en `DECOR`
  → el color **sí pesa** en la distancia genética y, por tanto, en la identidad de especie. Es coherente
  con que `hue` sea funcional (camuflaje), pero el comentario engaña. Decidir si es lo querido
  (probablemente sí) y corregir el comentario.
