# Mapa de arquitectura del sistema evolutivo — Zenote

> **Propósito.** Descripción de alto nivel de CÓMO está construido el simulador evolutivo: subsistemas,
> relaciones, flujos de datos, ciclo de vida de un organismo y ciclo de la materia/energía. Es un documento
> de COMPRENSIÓN (no propone cambios). Para la mecánica exacta → [`SPEC_EVOLUCION.md`](SPEC_EVOLUCION.md);
> para los parámetros → [`../src/config.js`](../src/config.js); para las interacciones dinámicas →
> [`ANALISIS_PARAMETROS.md`](ANALISIS_PARAMETROS.md). Foto del estado vivo → [`ESTADO.md`](ESTADO.md).

---

## 0. Vista de pájaro

Zenote es una aplicación web sin backend. La arquitectura se divide en **dos hilos**:

```
┌──────────────────────── HILO PRINCIPAL ────────────────────────┐      ┌──────────── WEB WORKER ────────────┐
│                                                                 │      │                                    │
│  main.js  ──orquesta──►  Renderer (render/canvas.js)            │      │   worker.js                        │
│     │                    Charts   (ui/charts.js)                │      │      │                             │
│     │                    Controls (ui/controls.js)              │      │      ▼                             │
│     │                                                           │      │   Sim (engine/sim.js)              │
│     ▼ simProxy (imita la interfaz de Sim, solo lectura)         │      │      ├─ World    (engine/world.js)  │
│                                                                 │      │      ├─ Genome   (engine/genome.js)│
│   ◄──── 'frame' / 'world' (foto compacta, TypedArrays) ─────────┼──────┤      ├─ Organism (engine/organism)│
│   ───── 'set' / 'reset' / 'pick' / 'gene' / 'tps' … (comandos) ─┼──────►      └─ BodyPlan (engine/bodyplan)│
│                                                                 │      │                                    │
└─────────────────────────────────────────────────────────────────┘      └────────────────────────────────────┘
```

- **El MOTOR (toda la evolución) corre en el Worker.** No conoce el render. Avanza por *ticks*.
- **El hilo principal solo DIBUJA y controla.** Recibe "fotos" (snapshots) por frame y emite comandos.
- **La frontera es el mensaje.** El motor empaqueta el estado mínimo necesario para pintar; el render nunca
  toca la lógica. Esto cumple la regla de "lógica desacoplada del render" (CLAUDE.md §2).

La pieza conceptual central es la **frontera gen→fenotipo** (`organism.js` + `bodyplan.js`): el único lugar
donde el genoma `[0,1]` se traduce a física. El programador define ahí *la física del mundo*; **nunca qué
genes son buenos**. El "bien/mal" lo dicta la supervivencia en el bucle de `sim.js`.

---

## 1. Subsistemas principales

### 1.1 Genética (`engine/genome.js`)
Define el **orden de los genes**, la **copia con mutación**, el **crossover sexual**, la **distancia genética**
y el **sembrado de cerebros competentes**. Es el contrato de qué es un genoma; no ejecuta dinámica.

- `NUM_GENES` = 208, agrupados en cuatro bloques (ver §2).
- `copyMutated()` — herencia asexual (clon + mutación por locus).
- `crossover()` — herencia sexual con **ligamiento** (`recomb` bajo → tramos contiguos co-adaptados).
- `geneticDistance()` — distancia euclídea normalizada sobre los genes **funcionales** (define especie).
- `seedBrain()` — siembra un cerebro de partida que ya se mueve hacia la comida y huye de la amenaza
  (no son pesos ciegos; la *modulación* fina la aprende la selección).
- `FUNCTIONAL` / `DECOR` — partición de genes que **cuentan** para la especie vs. los decorativos/neutrales.

### 1.2 Genotipo (representación) — SoA en `engine/sim.js`
El genoma de cada agente es un tramo contiguo de `NUM_GENES` floats `[0,1]` dentro de un único
`Float32Array` global (`sim.genes`, de tamaño `cap × NUM_GENES`). Es una representación **Structure-of-Arrays**:
no hay objeto "organismo"; cada propiedad vive en su propio array typed indexado por *slot*. Esto es lo que
permite miles de agentes sin GC en el bucle caliente (CLAUDE.md §2).

### 1.3 Generación de fenotipo (`engine/organism.js`)
`computePhenotype(sim, i)` lee el genoma del agente `i` y **cachea** su fenotipo físico en los arrays SoA
(radio, vmax, masa, eMax, costes, eficiencias de dieta, alcance de caza, etc.). Se ejecuta **una vez al nacer**
(y al re-expresar tras mover un slider). Es la frontera auditable: cada línea *traduce*, ninguna *juzga*.

### 1.4 Morfología (`engine/bodyplan.js`)
El cuerpo es un **grafo generativo de hasta 8 nodos**. `computeBodyPlan()` arma la geometría (cabeza +
segmentos + apéndices) y `reducePlan()` la reduce a escalares físicos: masa, arrastre, empuje direccional,
streamlining, alcance frontal. Es la fuente de **toda la forma y de la locomoción**: velocidad y giro
*emergen* de la geometría, no son genes directos. Usa scratch a nivel de módulo → cero asignaciones por
nacimiento.

### 1.5 Comportamiento — cerebro neuronal (`Sim._brain` en `engine/sim.js`)
Una **RNN recurrente (Elman)** cuyos pesos SON genes (bloque `br*`). Toma 11 entradas sensoriales, mantiene
estado oculto (memoria entre ticks) y produce 4 salidas: dirección de empuje (x,y), impulso de ataque y
**esfuerzo/throttle**. Es el **único motor de conducta**: cazar, huir, pastar y atacar emergen de los pesos.
No hay ningún `if` de estrategia ni un gen "agresividad".

### 1.6 Reproducción (`Sim.step` + `Sim._findMate` en `engine/sim.js`)
Sexual con fallback asexual. La sexual busca **pareja compatible** (distancia genética < umbral) dentro de un
radio, con **selección sexual** (atractivo = encaje ornamento↔preferencia, runaway de Fisher). El hijo se
construye por crossover + mutación; **solo nace si hay materia (nutriente) en la zona** para construir su cuerpo.

### 1.7 Mundo y ecología (`engine/world.js`)
Campos escalares en rejilla de baja resolución + spatial hash:
- `resource` — pasto/vegetación (lo que comen los herbívoros).
- `carrion` — carroña (deja toda muerte; la comen los carroñeros; decae a nutriente).
- `N` — **nutriente libre** (la "materia" disponible para fabricar pasto y cuerpos).
- `capacity` — capacidad de carga por celda (gradiente fijo: perlin/center/uniform).
- Spatial hash (lista enlazada) para vecindad O(n) (nada de O(n²)).

Aquí viven la **regeneración del pasto** (fotosíntesis: N→pasto), la **descomposición de carroña** (→N) y la
**difusión del nutriente**.

### 1.8 Dinámica de población (emergente, en `Sim.step`)
No hay un "controlador de población". El número de individuos es **endógeno**: lo fija el balance entre comida
disponible, costes metabólicos, depredación y el **techo de materia** (una cría no nace si no hay nutriente
para su cuerpo). El único límite duro es `maxAgentsCeiling` (tamaño del pool, por memoria/perf).

### 1.9 Especiación (`worker.js: classifySpecies`)
Clustering periódico tipo k-means con umbral sobre los genes funcionales. Asigna a cada agente una especie
(centroide más cercano dentro del umbral, o funda una nueva). Es **observación**: no afecta a la dinámica
(salvo que el umbral de cruce define quién es pareja compatible, eso sí vive en `sim.js`).

### 1.10 Render, gráficas y UI (hilo principal)
- `render/canvas.js` — dibuja organismos desde el grafo de nodos, vegetación, nutriente, carroña, cadáveres.
- `ui/charts.js` — curvas de población por dieta, histograma de genes, demografía, pools de materia.
- `ui/controls.js` — sliders (UI) que envían comandos `set` al worker; inspector de genoma.
- `main.js` — orquesta: recibe fotos, mantiene `simProxy`, gobierna el bucle de dibujado bajo demanda.

### 1.11 Otros (utilidades)
- `util/rng.js` — PRNG determinista sembrado (reproducibilidad; `rng.next()`, `rng.gaussian()`).
- `util/color.js` — utilidades de color (HSL→linaje).

---

## 2. Genotipo: estructura del genoma (208 genes)

| Bloque | Nº | Offset | Contenido | ¿Define especie? |
|---|---|---|---|---|
| **Ecología / fisiología** | 9 | 0 | size, speed (musculatura), sense, metab, diet, scav, repro_thr, invest, hue | sí (salvo hue) |
| **Historia de vida** | 2 | 9 | mature_age, senescence (eje r/K) | sí |
| **Identidad / display** | 8 | 11 | e_fov, orn, pref, c_lum, o_len, o_bulb, o_hue, o_num | parcial |
| **Cuerpo por NODOS** | 80 | 19 (`NODE0`) | 8 nodos × 10 campos: present, parent, size, aspect, angle, attach, osc_amp, osc_phase, tipShape, gaitMode | sí (forma) |
| **Cerebro (RNN)** | 109 | 99 (`BRAIN0`) | pesos del MLP recurrente (`br0`…`br108`) | **no** (su deriva dominaría) |

- **Genes funcionales** (`FUNCTIONAL`): ecología + forma de nodos. Definen la **especie** (distancia genética).
- **Genes decorativos** (`DECOR`): `c_lum`, estilo del señuelo (`o_hue`/`o_num`), las fases de oscilación.
  Se excluyen de la distancia para no producir especiación espuria por deriva neutral.
- El **cerebro se excluye** de la distancia (109 pesos dominarían la métrica).

Cada gen vive en `[0,1]`; la expresión (`organism.js`) lo *lerp*-ea a su rango físico definido en `config.expr`.

---

## 3. Relaciones entre subsistemas

```
                       ┌───────────────────────────── config.js (parámetros, fuente única) ──────────────────────────────┐
                       │  Todo subsistema LEE de aquí en vivo (los sliders ↻ requieren reset; el resto afecta en caliente) │
                       └────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                              │
        genome.js  ──define el orden/herencia──►  sim.genes (SoA)  ──leído por──►  organism.js (computePhenotype)
            │                                          ▲                                 │ usa
            │ crossover/copyMutated                    │ escribe                         ▼
            │ (en reproducción)                        │                            bodyplan.js (forma→física)
            ▼                                          │                                 │
     Sim.step() ────────────────────────────────────────────────────────────────────────┤ cachea fenotipo en SoA
        │  cada tick:                                                                     │
        │  1. World.regen / decayCarrion / diffuseNutrient   ◄── world.js (campos + hash) │
        │  2. percepción (spatial hash) → entradas del cerebro                            │
        │  3. _brain() (RNN, pesos=genes) → deseo de mov. + ataque + esfuerzo  ◄──────────┘
        │  4. movimiento (modelo de fuerza: empuje−arrastre+inercia)
        │  5. energética (coste, alimentación, carroñeo)
        │  6. combate/depredación
        │  7. muerte (→ carroña) / reproducción (→ nueva cría si hay materia)
        ▼
     worker.js  ──classifySpecies (periódico) + snapshot()──►  postMessage('frame')
        ▲                                                                  │
        └──── onmessage('set','reset','pick',…) ◄── controls.js            ▼
                                                                       main.js → renderer / charts / inspector
```

**Dependencias clave:**
- `organism.js` **depende de** `bodyplan.js` (la forma produce la física) y de `genome.js` (índices `G`).
- `sim.js` **orquesta** todo: posee el SoA, llama a `computePhenotype` al nacer, ejecuta el cerebro, el mundo,
  el combate y la reproducción.
- `worker.js` **envuelve** a `Sim`: lo hace avanzar, clasifica especies y serializa la foto.
- El render **no depende** del motor salvo por la forma de la foto (contrato de `simProxy`).
- **Nadie codifica estrategia.** La selección (qué sobrevive/se reproduce en `sim.step`) es el único árbitro.

---

## 4. Flujos de datos

### 4.1 Motor → Render (por frame, `worker.js: snapshot()`)
La foto es un mensaje con **TypedArrays compactados** (solo agentes vivos, índice 0..n−1) que se **transfieren**
(zero-copy) al hilo principal. Campos:
- Posición/cinemática: `x, y, radius, heading, spd`.
- Apariencia: `hue, diet, eFrac, tint(señuelo), eye, face, deco, nodes(forma)`.
- Clasificación: `species, role, lineage, serial`.
- Mundo: `resource, carrion, nutrient` (rejillas).
- Histogramas/series para gráficas (solo cuando hay muestra nueva, `histDirty`).
- `sel` — genoma completo del organismo seleccionado (inspector).
- `deaths` — registro de muertes naturales del frame (cuerpo + pose) para dibujar cadáveres desvaneciéndose.

Optimización: el buffer `nodes` (el mayor) hace **ping-pong** — el hilo principal lo devuelve (`returnNodes`)
y el worker lo reutiliza → cero asignación en régimen permanente.

### 4.2 Render → Motor (comandos, `worker.js: onmessage`)
`running`, `maxSpeed`, `tps`, `set` (slider → `config` + re-expresa fenotipos vivos), `gene` (gen del
histograma), `pick`/`deselect`/`pickSpecies` (selección), `reset` (re-siembra), `returnNodes`.

### 4.3 Flujo interno por tick (dentro de `Sim.step`, por agente)
```
PERCEPCIÓN → CEREBRO → MOVIMIENTO → ENERGÉTICA → (COMBATE) → MUERTE → REPRODUCCIÓN
   │            │           │            │            │           │          │
 gradiente   RNN (pesos   empuje−      coste v²,   depredación  E≤0 →     crossover+
 de comida   = genes) →   arrastre,    alimenta-   por talla    starv,    mutación;
 + presa/    dirección,   inercia      ción, carro- + escape    vejez,    nace si hay
 amenaza     ataque,      (∝masa)      ñeo         (cobertura/  combate   nutriente
 (hash)      esfuerzo                              velocidad)             en la zona
```

### 4.4 Frontera gen→fenotipo (el flujo más importante del proyecto)
```
genoma [0,1]  ──organism.js──►  radius, vmax, mass, eMax, baseCost, effHerb/Hunt/Scav, reproNeedE, …
   │                                │
   │            bodyplan.js          │ (cacheado en SoA, fijo durante la vida)
   └──nodos──► massMul, Dmul, Psum, straight, elongN, fwdReach, flapWork ──┘
```
Aquí se traduce, no se decide nada sobre fitness. Comentado en el código para auditoría (CLAUDE.md §"Cómo trabajar").

---

## 5. Ciclo de vida de un organismo

```
       SEMBRADO (fundador)                    o          NACIMIENTO (cría)
   _seedInitial / _seedSimple                       reproducción (Sim.step)
   genoma inicial + seedBrain                  crossover/copyMutated + computePhenotype
            │                                            │
            └──────────────────────┬─────────────────────┘
                                   ▼
                          _alloc() → slot del pool
                          serial único, lineage, generation
                          computePhenotype() → fenotipo cacheado
                          bodyMatter = carcassValue · eMax (materia del cuerpo, tomada del nutriente)
                          E inicial = 0.5·eMax (fundador) / investE del padre (cría)
                                   │
                                   ▼
                    ┌──────────── VIDA (un tick tras otro) ────────────┐
                    │  percibe → cerebro decide → se mueve (gasta E)    │
                    │  come (pasto/carroña) o caza → repone E           │
                    │  envejece (age++)                                 │
                    │  si maduro (age≥matureAge) y E≥reproNeedE:        │
                    │     busca pareja → cría (si hay materia) → −investE│
                    └───────────────────────────────────────────────────┘
                                   │
                                   ▼
                              MUERTE (_kill), por causa:
                      ┌──────────┬──────────┬──────────┬──────────┐
                    starv      combat       age       eaten
                   (E≤0)    (ataque        (senes-   (cazado por
                            fallido)       cencia)    otro)
                      │          │           │           │
                      └──────────┴─────┬─────┘           │
                       cuerpo entero → carroña     no deja cuerpo
                       + se registra para el       (el depredador
                       render (cadáver con forma)   se lo llevó)
                                   │
                                   ▼
                      slot liberado al pool (free stack); su materia vuelve al ciclo
```

**Notas del ciclo:**
- El **fenotipo es fijo** durante la vida (cacheado al nacer). Solo cambia si un slider re-expresa a los vivos.
- El **cerebro tiene memoria** (estado oculto recurrente) que persiste entre ticks y se pone a cero al nacer.
- La **madurez** (`matureAge`, gen) gatea la reproducción e inicia la senescencia → hace honesto el eje r/K.
- El **serial** es un id único por organismo (≠ slot): permite al render invalidar su caché de sprites cuando
  un slot del pool se reutiliza para otro individuo.

---

## 6. Ciclo de la energía y la biomasa (la "pecera" cerrada)

El mundo es **cerrado en materia**: la materia total se **conserva** (salvo redondeo f32 despreciable y medido)
y circula en un ciclo. El presupuesto total es `matterBudget · área`. Los **cinco pools** que lo reparten:

```
                    ┌─────────────────────────── MATERIA TOTAL (conservada) ──────────────────────────────┐
                    │                                                                                       │
   ┌────────────┐  fotosíntesis   ┌────────────┐   pastoreo    ┌──────────────┐   depredación   ┌────────┐
   │ NUTRIENTE  │ ───(regen)────► │   PASTO    │ ─────────────► │  ORGANISMOS  │ ──────────────► │organismo│
   │ libre (N)  │   N→pasto       │ (resource) │  herbívoros    │  E + cuerpo  │   (cazador come   │  cazador│
   │            │ ◄───────────────│            │                │ (bodyMatter) │    a la presa)    └────────┘
   └────────────┘  (lo no asimi-  └────────────┘                └──────────────┘
        ▲           lado vuelve a N)                                   │
        │                                                              │ MUERTE
        │  ◄──── metabolismo (respiración: E gastada → N local) ───────┤ (natural/combate/vejez)
        │                                                              ▼
        │  ◄──── descomposición ──────────────────────────────  ┌────────────┐
        └────────────(decayCarrion: carroña → N)──────────────  │  CARROÑA   │ ◄── toda muerte deja cuerpo
                                                                 │ (carrion)  │     (E + bodyMatter), salvo
                                                                 └────────────┘     la presa cazada (ya repartida)
                                                                       │
                                                                       └── carroñeros la comen (effScav) → ORGANISMOS
```

**Reglas de conservación (todas en `sim.js` / `world.js`):**
1. **Fotosíntesis (regen):** el pasto crece **consumiendo** nutriente local `N`. El sol solo convierte N→pasto;
   no crea materia. Si no hay N en la celda, el rebrote se escala a lo disponible.
2. **Pastoreo:** el herbívoro asimila parte (`effHerb`); el resto del pasto removido → nutriente local (detrito).
3. **Metabolismo:** todo coste de vivir/nadar resta de `E` y **vuelve como nutriente** a la celda (respiración).
   Topado a la E disponible (E baja a 0, nunca a negativo).
4. **Construcción del cuerpo:** al nacer, `bodyMatter = carcassValue · eMax` se **toma del nutriente** del
   vecindario (`takeNutrientAround`). Si no hay suficiente → **la cría no nace** (techo de población endógeno).
5. **Depredación:** la presa aporta su materia real (`E + bodyMatter`); el cazador asimila `preyGain · effHunt`,
   lo no comido → restos (carroña), lo que rebosa su tope → nutriente local.
6. **Muerte → carroña:** toda muerte natural deposita el cuerpo entero (`E + bodyMatter`) como carroña.
   La presa cazada no (su materia ya la repartió la depredación → sin doble conteo).
7. **Descomposición:** la carroña decae cada tick y **mineraliza** a nutriente local → cierra el ciclo.
8. **Difusión:** el nutriente libre difunde despacio → manchas fértiles que migran (conservativa).

**Inicialización del balance** (`Sim.reset`): `N_inicial = matterBudget·área − (pasto en pie · epu) − (E + cuerpo
de los fundadores)`. El sobrante arranca como nutriente libre repartido uniforme.

**Energética alométrica** (la física del coste, en `organism.js`):
- `eMax ∝ masa` (almacén ∝ volumen). `mass = sizeMass · massMul` (talla × complejidad de nodos).
- Coste basal `∝ masa^kleiber` (¾, ley de Kleiber) × metabolismo × longevidad × órganos (visión, señuelo, músculo).
- Coste de nado `∝ v²` × esfuerzo × aleteo × transporte(masa) × arrastre(forma).
- Reproducción: umbral y energía a la cría son fracciones de `E_max_base · sizeMass` (el pequeño cría antes = r).

---

## 7. Dónde vive cada cosa (índice rápido archivo→responsabilidad)

| Archivo | Responsabilidad |
|---|---|
| `src/config.js` | **Todos** los parámetros y rangos de genes (fuente única). |
| `src/engine/genome.js` | Orden de genes, mutación, crossover, distancia genética, sembrado de cerebro. |
| `src/engine/organism.js` | **Frontera gen→fenotipo** (expresión física) + clasificación trófica (lectura). |
| `src/engine/bodyplan.js` | Morfología por nodos → escalares de locomoción (masa, arrastre, empuje, forma). |
| `src/engine/sim.js` | Estado SoA, pool, **bucle de tick** (percepción, cerebro, movimiento, energética, combate, muerte, reproducción), sembrado. |
| `src/engine/world.js` | Campos de rejilla (pasto, carroña, nutriente, capacidad), spatial hash, regen/decay/difusión. |
| `src/engine/worker.js` | Ejecuta el motor, clasifica especies, serializa la foto, recibe comandos. |
| `src/main.js` | Orquestación del hilo principal: simProxy, recepción de fotos, bucle de dibujado. |
| `src/render/canvas.js` | Render Canvas 2D (organismos desde nodos, mundo, cadáveres, LOD). |
| `src/ui/charts.js` | Gráficas (población, histograma, demografía, pools de materia). |
| `src/ui/controls.js` | Sliders, inspector, comandos al worker. |
| `src/util/rng.js`, `color.js` | PRNG determinista, utilidades de color. |

---

## 8. Invariantes de diseño (lo que la arquitectura GARANTIZA)

1. **Emergencia real.** Ninguna conducta está cableada. La única lógica de "qué es bueno" es la supervivencia
   en `Sim.step`. Los genes solo se traducen a física en `organism.js`/`bodyplan.js`.
2. **Conservación de materia.** El mundo es una pecera cerrada; los cinco pools (N, pasto, organismos, carroña,
   cuerpo) suman el presupuesto total (deriva por redondeo f32, medida y despreciable).
3. **Rendimiento.** SoA + typed arrays + spatial hash O(n) + cero asignaciones en el bucle caliente + motor en
   Worker desacoplado del render + ping-pong de buffers.
4. **Población endógena.** No hay control externo del número de individuos; lo fija el balance trófico y el techo
   de materia. El único límite duro es el tamaño del pool (`maxAgentsCeiling`).
5. **Determinismo reproducible.** Todo el azar pasa por un PRNG sembrado (`rng`); misma semilla → misma evolución.
6. **Render como espejo de solo lectura.** El hilo principal nunca muta el estado de la simulación; solo lee la
   foto y emite comandos declarativos.
```
