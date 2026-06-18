# Inventario de complejidad biológica — Zenote

> **Propósito.** Catálogo EXHAUSTIVO de todo lo que participa en la evolución y la ecología del simulador:
> genes, campos del genotipo, rasgos del fenotipo, parámetros de conducta/ecología/reproducción/metabolismo,
> reglas cableadas y valores de configuración. Para cada ítem: **propósito · dónde se usa · dependencias ·
> ¿fundamental o ad hoc?**. Acompaña al [mapa de arquitectura](evolution-architecture-map.md).
>
> **Criterio "fundamental vs ad hoc"** (juicio de auditoría, no del código):
> - **Fundamental** = define la *física del mundo* o la *representación evolutiva*; quitarlo cambia la naturaleza
>   del modelo (la tesis de emergencia, la conservación de materia, el sustrato genético).
> - **Ad hoc** = constante de calibración / atajo de sembrado / valor empírico elegido por tuning; podría variar
>   sin cambiar la estructura del modelo.
> - **Mixto** = mecanismo fundamental con valor concreto ad hoc.
>
> Fuente de verdad: el código (`src/`). Las referencias `archivo:línea` son orientativas.

---

## Índice
1. [Genes (genotipo completo)](#1-genes-genotipo-completo)
2. [Campos del genotipo (representación)](#2-campos-del-genotipo-representación)
3. [Rasgos del fenotipo (caché SoA)](#3-rasgos-del-fenotipo-caché-soa)
4. [Estado dinámico por organismo](#4-estado-dinámico-por-organismo)
5. [Parámetros de conducta (cerebro y decisión)](#5-parámetros-de-conducta-cerebro-y-decisión)
6. [Parámetros ecológicos (mundo y recurso)](#6-parámetros-ecológicos-mundo-y-recurso)
7. [Parámetros de reproducción y mutación](#7-parámetros-de-reproducción-y-mutación)
8. [Parámetros de metabolismo y energética](#8-parámetros-de-metabolismo-y-energética)
9. [Parámetros de locomoción y morfología](#9-parámetros-de-locomoción-y-morfología)
10. [Parámetros de combate / depredación](#10-parámetros-de-combate--depredación)
11. [Reglas cableadas (hardcoded)](#11-reglas-cableadas-hardcoded)
12. [Otros sistemas relevantes](#12-otros-sistemas-relevantes)
13. [Resumen: recuento y veredicto](#13-resumen-recuento-y-veredicto)

---

## 1. Genes (genotipo completo)

El genoma son **208 floats `[0,1]`** (`NUM_GENES`) por agente, en cuatro bloques. Definición en
[`genome.js`](../../src/engine/genome.js). La expresión (traducción a física) vive en
[`organism.js`](../../src/engine/organism.js) y [`bodyplan.js`](../../src/engine/bodyplan.js).

### 1.1 Bloque ecología / fisiología (índices 0–8)

| Gen | idx | Propósito | Dónde se usa | Dependencias | Veredicto |
|---|---|---|---|---|---|
| `size` | 0 | Talla → radio (`lerp(size.min,size.max)`); base de masa, eMax, fuerza de combate, zancada | `organism.js` (radius, sizeMass), `sim.js` (combate `fi/fj`, forageReach, banda de talla) | `expr.size`, `energy.massExp`, `combat.sizeAdvantage` | **Fundamental** (eje r/K y de talla) |
| `speed` | 1 | **Musculatura**: escala la capacidad de empuje (vmax) y cuesta basal mantenerla | `organism.js` (`muscle`, `baseCost`) | `loco.muscleMin/Max`, `energy.k_muscle` | **Fundamental** (reinterpretado del viejo "esfuerzo") |
| `sense` | 2 | Inversión en visión: alcance base del cono | `organism.js` (`senseR`, `baseCost`) | `expr.sense`, `vision.*`, `energy.k_sense` | **Fundamental** |
| `metab` | 3 | Tasa metabólica: sube coste basal y ritmo de pastoreo | `organism.js` (`baseCost`, `absEff`) | `energy.k_metab`, `resource.absMetabBase` | **Fundamental** |
| `diet` | 4 | Eje herbívoro(0)↔carnívoro(1): reparte eficiencia herbívora vs carnívora | `organism.js` (`effHerb`, `meat`), `sim.js` (presa/amenaza, gradiente) | `diet.omniPenalty`, `combat.dietMargin` | **Fundamental** (define nicho trófico) |
| `scav` | 5 | Eje cazar(0)↔carroñear(1): reparte la capacidad carnívora | `organism.js` (`effHunt`, `effScav`) | `diet.scavPenalty`, `energy.k_scavThin` | **Fundamental** |
| `repro_thr` | 6 | Umbral de energía para criar (fracción de eMax) | `organism.js` (`reproNeedE`) | `expr.repro_thr` | **Fundamental** (estrategia r/K) |
| `invest` | 7 | Energía dada a cada cría (fracción) | `organism.js` (`investE`, `reproNeedE`) | `expr.invest` | **Fundamental** |
| `hue` | 8 | Color de linaje (identidad visual) | `organism.js` (`hue`), render | — (excluido de especie) | **Fundamental** como rasgo neutral (display) |

### 1.2 Bloque historia de vida (índices 9–10)

| Gen | idx | Propósito | Dónde se usa | Dependencias | Veredicto |
|---|---|---|---|---|---|
| `mature_age` | 9 | Edad de madurez: gatea cría e inicia senescencia | `organism.js` (`matureAge`), `sim.js` (gate de reproducción y vejez) | `expr.mature_age`, `age.*` | **Fundamental** (eje r/K) |
| `senescence` | 10 | Ritmo de vida: 1=rápido/barato, 0=longevo/caro (disposable soma) | `organism.js` (`senesMult`, `baseCost`) | `age.senesSlow/Fast`, `energy.k_lifespan` | **Fundamental** |

### 1.3 Bloque identidad / display (índices 11–18)

| Gen | idx | Propósito | Dónde se usa | Dependencias | Veredicto |
|---|---|---|---|---|---|
| `e_fov` | 11 | Reparte la visión entre alcance y ángulo (conserva área) | `organism.js` (`senseR`, `visCos`) | `vision.*` | **Fundamental** (trade-off cazador/presa) |
| `orn` | 12 | Ornamento: cuánto exhibe (selección sexual) | `sim.js` (`_findMate` atractivo) | `repro.*` | **Mixto** (mecanismo fundamental; carga selectiva débil) |
| `pref` | 13 | Preferencia de pareja (ornamento preferido) → runaway de Fisher | `sim.js` (`_findMate`) | `repro.mateRadius` | **Mixto** |
| `c_lum` | 14 | Luminosidad/glow (decorativo, neutral) | render (`deco`) | — (`DECOR`) | **Ad hoc** (puramente estético) |
| `o_len` | 15 | Señuelo: largo del órgano de emboscada (gate físico) | `organism.js` (`lure`) | `combat.lureGate` | **Mixto** (nicho de emboscada real, valor empírico) |
| `o_bulb` | 16 | Señuelo: tamaño del bulbo (prominencia) | `organism.js` (`lure`) | `combat.lure*` | **Mixto** |
| `o_hue` | 17 | Señuelo: color del bulbo (decorativo) | render (`deco`) | — (`DECOR`) | **Ad hoc** |
| `o_num` | 18 | Señuelo: número de filamentos (decorativo) | render (`deco`) | — (`DECOR`) | **Ad hoc** |

### 1.4 Bloque cuerpo por NODOS (índices 19–98) — `NODE0=19`, 8 nodos × 10 campos

Cada nodo (`n0`…`n7`) tiene 10 genes (`NODE_STRIDE=10`). El nodo 0 es la cabeza (raíz, siempre presente).
Se expresan en [`bodyplan.js`](../../src/engine/bodyplan.js). **Todo el bloque es fundamental**: es el sustrato
de la morfología generativa, base de la locomoción emergente.

| Campo de nodo | Propósito | Dónde se usa | Veredicto |
|---|---|---|---|
| `present` | Presencia GRADUADA del nodo (rampa `PRES_LO..PRES_HI`) → morfología evoluciona suave | `bodyplan.js` (`presWeight`) | **Fundamental** |
| `parent` | Índice del nodo padre (topología del grafo) | `bodyplan.js` (cadena/ramas) | **Fundamental** |
| `size` | Radio del nodo / radio de cabeza | `bodyplan.js` (`sz`, área, longitud) | **Fundamental** |
| `aspect` | Lóbulo redondo(0)↔tentáculo fino(1): masa vs apéndice hidrodinámico | `bodyplan.js` (`asp`, umbral 0.5) | **Fundamental** |
| `angle` | Orientación respecto al eje (0=frente, π=atrás) → empuje direccional | `bodyplan.js` (`emit`, `_gait`, `EPS_AXIS`) | **Fundamental** |
| `attach` | Punto de anclaje sobre el padre (geometría/render) | `bodyplan.js`, render | **Fundamental** |
| `osc_amp` | Amplitud de oscilación del nodo (propulsión) | `bodyplan.js` (`_amp`, `ampOf`) | **Fundamental** |
| `osc_phase` | Fase de oscilación → coherencia de marcha (neutral para especie) | `bodyplan.js` (`_phase`, fasor) | **Fundamental** (valor absoluto neutral) |
| `tipShape` | Silueta púa↔elipse↔aleta: +empuje/+arrastre vs +alcance | `bodyplan.js` (`effShape`, `lengthShape`, `_shapeDrag`) | **Fundamental** |
| `gaitMode` | Modo ondular(0)↔aletear(1): empuje lateral extra con coste | `bodyplan.js` (`effFlap`, `flapWork`) | **Fundamental** |

### 1.5 Bloque cerebro RNN (índices 99–207) — `BRAIN0=99`, `BRAIN_W=109`

109 pesos del MLP recurrente (Elman) con `BRAIN = {I:11, H:5, O:4, scale:6}`. Nombres `br0`…`br108`.
Reparto: entrada→oculta (`I·H`=55) + oculta→oculta/memoria (`H·H`=25) + sesgos ocultos (`H`=5) +
oculta→salida (`H·O`=20) + sesgos salida (`O`=4).

- **Propósito:** son el **único motor de conducta**. Decodifican señales sensoriales → dirección, ataque, esfuerzo.
- **Dónde se usa:** `sim.js: _brain()`; sembrado competente en `genome.js: seedBrain()`.
- **Dependencias:** `BRAIN.scale` (peso = `(gen−0.5)·scale`); entradas/salidas (§5).
- **Veredicto:** **Fundamental** — es la encarnación de la regla §1 de CLAUDE.md (conducta 100% emergente).
  **Excluidos de la distancia genética** (su deriva dominaría la métrica de especie).

---

## 2. Campos del genotipo (representación)

Estructuras que ENCODEAN el genoma (no rasgos físicos). En [`genome.js`](../../src/engine/genome.js) y
[`sim.js`](../../src/engine/sim.js).

| Campo | Propósito | Dónde se usa | Dependencias | Veredicto |
|---|---|---|---|---|
| `sim.genes` (`Float32Array cap·NUM_GENES`) | El genoma de TODA la población, SoA contiguo | todo el motor | `NUM_GENES` | **Fundamental** (representación raíz) |
| `GENES` / `G` (mapa nombre→idx) | Acceso a genes sin strings en el bucle | todo | `BASE_GENES`, `BRAIN_W` | **Fundamental** |
| `FUNCTIONAL` (lista de idx) | Genes que DEFINEN especie (ecología + forma) | `geneticDistance`, `classifySpecies` | `DECOR`, `BRAIN0` | **Fundamental** |
| `DECOR` (set de idx) | Genes neutrales excluidos de la especie (`c_lum`, `o_hue/num`, fases) | construcción de `FUNCTIONAL` | `G` | **Mixto** (qué se excluye es decisión de diseño) |
| `GENE_GROUPS` / `GENE_LABELS` | Agrupación y nombres para la UI (histograma/inspector) | `controls.js`, `charts.js` | — | **Ad hoc** (presentación) |
| `NODE_COUNT=8`, `NODE_STRIDE=10`, `NODE0`, `NODE_FIELDS` | Geometría del bloque de nodos | `bodyplan.js`, `sim.js`, `worker.js` | — | **Fundamental** (cardinalidad de morfología) |
| `lineage` (`Int32Array`) | Id del fundador ancestral (heredado sin mutar) | color de linaje, inspector | — | **Fundamental** (genealogía) |
| `generation` (`Int32Array`) | Profundidad genealógica (gen padre+1) | inspector, render key | — | **Mixto** (instrumentación útil) |
| `serialOf` (`Int32Array`) | Id único por organismo (≠ slot) | invalidación de caché de sprites, seguir selección | `_serial` | **Mixto** (necesario por el pool, no biológico) |

---

## 3. Rasgos del fenotipo (caché SoA)

Calculados **una vez al nacer** por `computePhenotype()` ([`organism.js`](../../src/engine/organism.js)) y
cacheados en arrays SoA de `sim`. Fijos durante la vida (salvo re-expresión por slider). Es la **frontera
gen→física**: todos son fundamentales como *traducción*, pero su FÓRMULA mezcla física fundamental con
coeficientes ad hoc (ver §8–§9).

| Rasgo (SoA) | Propósito | Derivado de | Dónde se consume |
|---|---|---|---|
| `radius` | Radio físico (px/u) | `size` + `expr.size` | combate, render, banda de talla, forageReach |
| `vmax` | Velocidad terminal a esfuerzo máximo | morfología (`Psum`, `stream`, `Dmul`) + `muscle` + zancada | movimiento, escape por velocidad |
| `velResp` | Respuesta de velocidad (inercia lineal ∝1/masa) | `dragLin·Dmul/masa` | integración de velocidad (modelo de fuerza) |
| `angResp` | Respuesta de giro (inercia angular ∝1/masa) | `angInertia·(masa−1)` | giro físico |
| `turnRate` | Agilidad de giro (techo) | asimetría, talla, elongación, nº segmentos | giro |
| `effort` | Capacidad muscular base (modelo viejo) / 1 (fuerza) | `loco.forceModel`, `speed` | coste de movimiento |
| `flapCost` | Coste de nado extra por aletear | `plan.flapWork` | energética de movimiento |
| `haulMul` | Coste de transporte ∝ masa | `mass`, `k_haul` | energética de movimiento |
| `drag` | Arrastre de la forma (Dmul crudo) | `reducePlan` | encarece nado (`k_drag`) |
| `senseR` | Alcance visual efectivo | `sense`, `e_fov`, `vision.*` | percepción, spatial scan |
| `visCos` | Coseno del semiángulo del cono | `e_fov` | visión direccional |
| `gazeX/Y` | Dirección de la mirada (solo render) | presa/amenaza/avance | render (pupila) |
| `eMax` | Energía máxima (almacén ∝ masa) | `E_max_base·mass` | reproducción, muerte, combate |
| `bodyMatter` | Materia estructural bloqueada en el cuerpo | `carcassValue·eMax` | conservación (pecera) |
| `baseCost` | Coste basal/tick (mantenimiento) | masa^kleiber × metab × longevidad × órganos × músculo | energética |
| `lure` | Prominencia del señuelo (coste + alcance + atracción) | `o_len`, `o_bulb`, `lureGate` | combate, coste basal |
| `morphReach` | Alcance de captura por apéndices frontales | `plan.fwdReach`, `radius`, `combat.morphReach` | combate |
| `absEff` | Eficiencia de pastoreo | `absRate`, `metab`, `massMul`, `breadth` | alimentación herbívora |
| `effHerb` | Eficiencia herbívora (con penalización omnívora) | `diet`, `omniPenalty` | gradiente de comida, alimentación |
| `effHunt` | Eficiencia cazando presa viva | `diet`, `scav`, `scavPenalty` | depredación |
| `effScav` | Eficiencia carroñeando (sube con cuerpo fino) | `diet`, `scav`, `k_scavThin`, `thin` | carroñeo, gradiente |
| `investE` | Energía absoluta dada a la cría | `invest`, `E_max_base·sizeMass` | reproducción |
| `reproNeedE` | Energía umbral para reproducirse | `max(repro_thr,invest)·reproRef` | reproducción |
| `matureAge` | Edad de madurez (ticks) | `mature_age` + `expr.mature_age` | gate de cría y senescencia |
| `senesMult` | Multiplicador de senescencia | `senescence`, `age.senesSlow/Fast` | mortalidad por vejez |
| `diet`, `hue` | Copias del gen para lectura rápida | genes | combate, render, clasificación |
| `atkOut` | Impulso de ataque del último tick (3ª salida cerebro) | `_brain` | probabilidad de atacar |
| `atkDrive` | Impulso de ataque suavizado (EMA) | `atkOut` | "ceño" del render |

**`trophicRole(diet, effHunt, effScav)`** ([`organism.js:139`](../../src/engine/organism.js)) — clasificación
trófica (herbívoro/carroñero/cazador/omnívoro). Es **LECTURA** del fenotipo (no afecta a la sim); fuente única
del color "role" y la curva de población. **Mixto** (umbrales 0.4/0.6 ad hoc).

---

## 4. Estado dinámico por organismo

Arrays SoA que cambian cada tick ([`sim.js`](../../src/engine/sim.js)). Todos **fundamentales** como estado de
la simulación; no son biología sino mecánica.

| Campo | Propósito |
|---|---|
| `x, y` | Posición en el toro |
| `vx, vy` | Velocidad (la integra el modelo de fuerza) |
| `omega` | Velocidad angular (giro con inercia) |
| `heading` | Rumbo de empuje persistente |
| `E` | Energía actual (combustible + materia) |
| `age` | Edad en ticks |
| `cooldown` | Enfriamiento entre crías |
| `attackCD` | Enfriamiento tras atacar (handlingTime) |
| `alive` | Vivo/muerto (Uint8) |
| `brainHid` (`cap·H`) | Memoria del cerebro recurrente (persiste entre ticks) |
| `free`/`active`/`freeTop`/`activeCount` | Pool (free stack) y lista activa O(1) |

---

## 5. Parámetros de conducta (cerebro y decisión)

El cerebro es la **única fuente de conducta**. No hay parámetros de "estrategia"; sí la arquitectura de la red y
las señales que la alimentan.

### 5.1 Arquitectura (`BRAIN` en `genome.js:32`)
| Campo | Valor | Propósito | Veredicto |
|---|---|---|---|
| `BRAIN.I` | 11 | Nº de entradas sensoriales | **Mixto** (la elección de entradas es de diseño) |
| `BRAIN.H` | 5 | Neuronas ocultas (capacidad/memoria) | **Ad hoc** (capacidad elegida) |
| `BRAIN.O` | 4 | Salidas (dir x,y + ataque + esfuerzo) | **Fundamental** (la 4ª salida desacopla esfuerzo) |
| `BRAIN.scale` | 6 | Escala de pesos (`(gen−0.5)·scale`) | **Ad hoc** (calibración de rango) |

### 5.2 Entradas sensoriales (11, en `sim.js: _brain` setup ~588)
`0,1` ∇comida dependiente de dieta · `2,3` dir a presa · `4,5` dir a amenaza · `6` energía relativa ·
`7` cobertura local (vegetación de la celda) · `8` talla relativa de la presa · `9` escapabilidad de la presa
(cobertura de su celda) · `10` **propiocepción** (velocidad propia/capacidad → cierra el lazo de control).
**Veredicto:** **Fundamental** — son la "ventana al mundo"; cada una habilita una conducta emergente concreta
(p.ej. la 8/9 permiten *no* atacar presa grande o escurridiza sin un `if` que lo ordene).

### 5.3 Salidas (4)
`0,1` dirección de empuje (rumbo, se normaliza) · `2` impulso de ataque ∈[0,1] (prob. de atacar en contacto) ·
`3` esfuerzo/throttle ∈[0,1] (parar/crucear/esprintar, independiente de la dirección).
**Veredicto:** **Fundamental**.

### 5.4 Decisión de combate (no es el cerebro, es la resolución física)
- Atacar = hay contacto **y** `attackCD≤0` **y** `rng < atkOut` (el impulso lo da el cerebro).
- La presa escapa por **cobertura** (`refuge.strength·vegetación`) o por **velocidad** (`fleeSpeed·ventaja`).
- Ganador estocástico: `fi/(fi+fj)` con `fi=(size+0.1)^sizeAdvantage`.
- **Veredicto:** **Fundamental** (física trófica) con coeficientes **ad hoc** (§10).

---

## 6. Parámetros ecológicos (mundo y recurso)

### 6.1 `config.world`
| Param | Valor | Propósito | Dónde | Veredicto |
|---|---|---|---|---|
| `size` | 1000 | Lado del toro (u); dial de densidad (materia ∝ área) | `world.js`, `sim._aScale` | **Mixto** (mecanismo fundamental, valor por defecto) |
| `matterBudget` | 65000 | Materia total de la pecera (∝ área) | `sim.reset` (balance N) | **Fundamental** (techo del ecosistema) |
| `closedRegen` | 0.0055 | Ritmo de fotosíntesis (N→pasto) | `world.regen` | **Mixto** (palanca de productividad) |
| `nutrientDiffuse` | 0.15 | Difusión del nutriente libre | `world.diffuseNutrient` | **Ad hoc** (textura espacial) |
| `birthGatherR` | 2 | Radio (celdas) del que la cría reúne materia | `sim.step` reproducción | **Ad hoc** |

### 6.2 `config.resource`
| Param | Valor | Propósito | Veredicto |
|---|---|---|---|
| `gridCols/gridRows` | 56/56 | Resolución de la rejilla (∝√área) | **Ad hoc** (discretización) |
| `R_max` | 1.0 | Recurso máx. por celda | **Fundamental** (escala del campo) |
| `gradient` | 'perlin' | Forma de la capacidad de carga | **Mixto** |
| `capFloor` | 0.1 | Suelo de capacidad (sin baldíos permanentes) | **Ad hoc** |
| `patchiness` | 0.75 | Lineal(0)↔logístico+difusión(1): parches que migran | **Mixto** |
| `seedFloor` | 0.04 | Rebrote mínimo (banco de semillas, evita estado absorbente) | **Fundamental** (estabilidad) |
| `absRate` | 0.15 | Ritmo de pastado | **Mixto** (palanca) |
| `absMetabBase` | 0.5 | Suelo metabólico de absorción | **Ad hoc** |
| `energyPerUnit` | 10 | Energía por unidad de recurso (factor de conversión) | **Fundamental** (acoplamiento materia↔energía) |
| `grazeRefuge` | 0.20 | Reserva de rebrote intocable (anti-sobrepastoreo) | **Fundamental** (estabilizador) |
| `forageReach` | 5 | Alcance de forrajeo por talla (payoff de área) | **Fundamental** (resuelve la deriva a talla mínima) |
| `carrionDecay` | 0.010 | Ritmo de descomposición de carroña → N | **Mixto** |
| `carrionAbsRate` | 0.10 | Fracción de carroña absorbible por tick | **Mixto** |
| `carrionScent` | 3 | Escala del olfato de carroña en el gradiente | **Ad hoc** |

### 6.3 `config.refuge` (estabilizador Lotka-Volterra)
| Param | Valor | Propósito | Veredicto |
|---|---|---|---|
| `enabled` | true | Activa la cobertura de presa | **Fundamental** (estabilidad depredador-presa) |
| `strength` | 0.65 | Prob. de escape = strength·vegetación local | **Mixto** (palanca dominante) |

### 6.4 `config.pop` (sembrado — condición inicial, no estrategia)
| Param | Valor | Propósito | Veredicto |
|---|---|---|---|
| `initial` | 150 | Nº de fundadores (fijo, no escala con mundo) | **Ad hoc** |
| `seedDensity` | 0.0016 | Densidad del disco de sembrado central | **Ad hoc** |
| `maxAgentsCeiling` | 3000 | Tope duro del pool (memoria/perf) | **Mixto** (límite no biológico pero load-bearing) |
| `seed` | 123 | Semilla del PRNG (la sobrescribe el worker con aleatoria) | **Ad hoc** |
| `seedDietLow` | false | Sembrar todo herbívoro vs diverso | **Ad hoc** |
| `carnivoreSeedFrac` | 0.20 | Fracción de proto-carnívoros sembrados | **Mixto** (siembra el nicho para cruzar el valle de fitness) |
| `simpleStart` | true | Fundadores simples (complejidad emerge) vs genes aleatorios | **Fundamental** para la tesis (la forma emerge) |
| `startJitter` | 0.06 | Magnitud del ruido gaussiano del sembrado simple | **Ad hoc** |
| `startDiversity` | 0.3 | Diversidad inicial (escala jitter, nodos extra, cohorte) | **Mixto** |

---

## 7. Parámetros de reproducción y mutación

### 7.1 `config.repro`
| Param | Valor | Propósito | Dónde | Veredicto |
|---|---|---|---|---|
| `cooldown` | 60 | Enfriamiento entre crías (ticks) | `sim.step` | **Mixto** |
| `sexual` | true | Reproducción sexual (recombinación) | `sim.step`, `_findMate` | **Fundamental** |
| `asexual` | false | Permitir clon mutado sin pareja | `sim.step` (`copyMutated`) | **Fundamental** (fallback) |
| `speciesGenThreshold` | 0.15 | Distancia genética máx. para cruzarse (= especie) | `_findMate`, `classifySpecies` | **Fundamental** (base de especiación) |
| `mateRadius` | 70 | Radio de búsqueda de pareja | `_findMate` | **Mixto** |

### 7.2 `config.mut`
| Param | Valor | Propósito | Veredicto |
|---|---|---|---|
| `rate` | 0.05 | Prob. de mutación por locus | **Fundamental** (motor de variación) |
| `sigma` | 0.08 | Magnitud de la mutación gaussiana | **Fundamental** |
| `bigRate` | 0.002 | Prob. de macromutación (salto raro) | **Mixto** |
| `bigSigmaMult` | 5 | Multiplicador de magnitud de la macromutación | **Ad hoc** |
| `recomb` | 0.07 | Prob. de cruce por locus (bajo = ligamiento de bloques) | **Fundamental** (preserva bloques co-adaptados) |

### 7.3 Mecanismos de herencia (`genome.js`)
- `copyMutated()` — asexual: copia + mutación por locus (rate y bigRate). **Fundamental**.
- `crossover()` — sexual: cambia de padre con prob. `recomb` (ligamiento) + mutación. **Fundamental**.
- `_findMate()` ([`sim.js:794`](../../src/engine/sim.js)) — pareja compatible más cercana, con **selección
  sexual** (atractivo = `1 − |orn − pref|`, runaway de Fisher). **Fundamental** (con valores ad hoc).

---

## 8. Parámetros de metabolismo y energética (`config.energy`)

Núcleo de la energética alométrica. Expresión en `organism.js`; consumo en `sim.js`.

| Param | Valor | Propósito | Fórmula (dónde entra) | Veredicto |
|---|---|---|---|---|
| `c_base` | 0.024 | Coste basal por tick | `baseCost` (multiplica todo) | **Fundamental** (calibración del reloj energético) |
| `massExp` | 1.3 | Exponente talla→masa | `sizeMass=(r/refR)^massExp` | **Fundamental** (alometría) |
| `kleiber` | 0.75 | Exponente metabólico (ley de Kleiber ¾) | `baseCost ∝ mass^kleiber` | **Fundamental** (alometría real) |
| `k_sense` | 0.3 | Coste de la visión | `baseCost` | **Mixto** |
| `k_metab` | 0.6 | Coste del metabolismo | `baseCost` | **Mixto** |
| `k_lifespan` | 0.35 | Coste extra de longevidad (disposable soma) | `baseCost` | **Fundamental** (honra el eje r/K) |
| `k_lure` | 0.07 | Coste de mantener el señuelo | `baseCost` | **Ad hoc** (calibrado para que el órgano se sostenga) |
| `k_graze` | 0.50 | Pasto extra ∝ masa de nodos | `absEff` | **Mixto** (ata complejidad al nicho) |
| `k_grazeWide` | 0.5 | Pasto extra ∝ anchura del cuerpo | `absEff` | **Mixto** (premia forma de pastador) |
| `k_scavThin` | 1.0 | Carroñeo extra ∝ cuerpo fino | `effScav` | **Mixto** (hace emerger el gusano) |
| `k_flap` | 0.7 | Coste de nado por aletear | `flapCost` | **Ad hoc** |
| `k_effort` | 1.6 | Coste de moverse ∝ esfuerzo (modelo viejo) | `metabCost` (no-force) | **Ad hoc** (legado) |
| `moveCost` | 0.02 | Coef. del coste de nado ∝ v² | `metabCost` | **Fundamental** (frena la carrera de velocidad) |
| `k_muscle` | 0.6 | Coste basal de musculatura | `baseCost` | **Mixto** (precio del gen speed) |
| `k_haul` | 0.2 | Coste de transporte ∝ masa | `haulMul` | **Mixto** |
| `k_drag` | 0.4 | Coste de nado ∝ arrastre de la forma | `dragMul` | **Mixto** |
| `dragRef` | 1.1 | Arrastre de referencia (solo paga el exceso) | `dragMul` | **Ad hoc** |
| `E_max_base` | 70 | Energía máxima base (eMax = E_max_base·masa) | `eMax`, `reproRef` | **Fundamental** (escala del almacén) |
| `preyGain` | 0.90 | Fracción de la presa aprovechada (eficiencia trófica) | combate | **Fundamental** (transferencia trófica <1) |
| `carcassValue` | 0.07 | Biomasa estructural del cuerpo (∝eMax) | `bodyMatter` | **Fundamental** (palanca DOMINANTE herb↔carn, conservación) |

`config.age` (mortalidad por senescencia): `mortality` 0.0005 (**Fundamental**), `scale` 500 (**Ad hoc**),
`senesSlow` 0.3 / `senesFast` 3.0 (**Mixto**, rango del eje de ritmo de vida).

---

## 9. Parámetros de locomoción y morfología (`config.loco` + `config.vision`)

Frontera auditable: **todo aquí es FÍSICA** (geometría→fuerza). Cada empuje va emparejado con un arrastre.
La mayoría son **Mixtos**: el mecanismo es fundamental (existe el trade-off), el coeficiente es ad hoc (calibrado).

### 9.1 Modelo de fuerza (núcleo)
| Param | Valor | Propósito | Veredicto |
|---|---|---|---|
| `forceModel` | true | Locomoción por fuerza (cerebro decide esfuerzo; velocidad emerge) | **Fundamental** |
| `dragLin` | 1.0 | Arrastre lineal → fija la inercia (velResp) | **Fundamental** (mecanismo de inercia) |
| `wander` | 0.08 | Deriva térmica de fondo (explora aunque el cerebro calle) | **Ad hoc** (evita congelarse) |
| `kThrust` | 7.1 | Calibra la velocidad-capacidad típica | **Ad hoc** (calibración) |
| `vMin`/`vMax` | 0.15/3.0 | Suelo/techo de velocidad-capacidad | **Mixto** |
| `speedSizeExp` | 0.5 | Zancada por talla (el grande avanza más por golpe) | **Mixto** (resuelve velocidad-mundo vs escala) |
| `angInertia` | 0.5 | Momento angular del giro ∝ masa | **Fundamental** (mecanismo) / valor **Mixto** |
| `muscleMin`/`muscleMax` | 0.6/1.4 | Rango del multiplicador de empuje del gen speed | **Mixto** |
| `effortFloor` | 0.2 | Esfuerzo mínimo (modelo viejo) | **Ad hoc** (legado) |

### 9.2 Geometría → fuerza (coeficientes de empuje y arrastre)
`headThrust` 0.06, `paddleEff` 0.6, `oscFloor` 0.15, `phaseGain` 0.5, `elongMax` 3.0, `symBase` 0.4,
`streamBase` 1.0, `streamGain` 0.5, `segThrust` 0.34, `modThrust` 0.3, `segDrag` 0.22, `modDrag` 0.6,
`segTurn` 0.0, `bodyThrust` 1.0, `limbThrust` 0.12, `limbDrag` 0.20, `bodyDrag` 0.30, `bodyMass` 0.30,
`tipThrust` 0.4, `tipDrag` 0.5, `tipReach` 0.35, `flapGain` 1.2, `flapDrag` 0.6, `turnBase` 0.18,
`turnAsym` 0.35, `turnSize` 0.15, `turnElong` 0.08, `turnMin` 0.08.
- **Propósito:** cada uno pesa una contribución geométrica al empuje/arrastre/giro en `bodyplan.js`.
- **Dónde:** `computeBodyPlan` / `reducePlan` ([`bodyplan.js`](../../src/engine/bodyplan.js)).
- **Veredicto:** **Mixto** en bloque — el principio "cada empuje con su arrastre" es **fundamental**; los
  valores concretos son **ad hoc** (calibrados para que el nado emerja con aspecto orgánico).

### 9.3 `config.vision`
| Param | Valor | Propósito | Veredicto |
|---|---|---|---|
| `halfFovMin` | 0.35 | Cono estrecho frontal (cazador) | **Mixto** |
| `halfFovMax` | 2.70 | Cono panorámico (presa) | **Mixto** |
| `fovRef` | 3.05 | FOV de referencia (conserva área visual) | **Ad hoc** |
| `rangeExp` | 0.4 | Exponente del reparto alcance↔ángulo | **Mixto** |

`config.diet`: `omniPenalty` 0.15 y `scavPenalty` 0.30 — penalización al generalista; **Fundamental** como
mecanismo (destraban la especialización de nicho), valor **Mixto**.

---

## 10. Parámetros de combate / depredación (`config.combat`)

| Param | Valor | Propósito | Veredicto |
|---|---|---|---|
| `enabled` | true | Activa depredación | **Fundamental** |
| `sizeAdvantage` | 1.8 | Peso del tamaño en quién gana | **Fundamental** (mecanismo) / valor **Mixto** |
| `failDamage` | 0.1 | Energía perdida al fallar (×eMax) | **Mixto** (freno denso-dependiente) |
| `fleeSpeed` | 1.0 | Escape por velocidad relativa | **Fundamental** (selecciona velocidad) |
| `fleeCap` | 0.95 | Tope de prob. de escape | **Ad hoc** |
| `handlingTime` | 60 | Enfriamiento tras captura (satura la caza) | **Fundamental** (respuesta funcional tipo II) |
| `dietMargin` | 0.08 | Diferencia de dieta mínima para ser presa | **Mixto** |
| `preyBandLo` | 0.15 | Ratio presa/depredador mínimo | **Fundamental** (nichos de talla) |
| `preyBandHi` | 1.10 | Ratio máximo (>1 = presa mayor, arriesgada) | **Fundamental** |
| `lureGate` | 0.5 | Umbral de `o_len` para expresar señuelo | **Mixto** (hay que seleccionarlo) |
| `lureReach` | 0.85 | Alcance de captura extra por señuelo | **Ad hoc** |
| `lureAttract` | 0.9 | Atracción de presa por señuelo (emboscada) | **Mixto** (sostiene el nicho de emboscada) |
| `morphReach` | 1.2 | Alcance de captura por apéndices frontales | **Fundamental** (alcance principal del cazador) |

---

## 11. Reglas cableadas (hardcoded)

Lógica/constantes embebidas en el código (NO en `config.js`). Son las decisiones de "física del programador".

### 11.1 Morfología (`bodyplan.js`)
| Regla | Valor/fórmula | Propósito | Veredicto |
|---|---|---|---|
| `PRES_LO`/`PRES_HI` | 0.4 / 0.6 | Banda de presencia graduada (rampa de aparición de nodo) | **Fundamental** (evolución suave de la forma) |
| `EPS_AXIS` | 0.35 | Umbral medial↔lateral (par bilateral ×2) | **Fundamental** (simetría corporal) |
| `headW` | `1.5 − aspect·0.95` | Ancho de cuerpo desde el aspecto de la cabeza | **Mixto** |
| `sz` | `0.15 + size·0.85` | Radio de nodo / cabeza | **Ad hoc** (rango) |
| `crossR`/`length` | `sz·(1−0.85·asp)` / `sz·(1+1.5·asp)·lengthShape` | Sección y longitud del nodo | **Mixto** |
| `_gait` | `−cos(emit) + paddleEff·sin²(emit)` | Empuje DIRECCIONAL (cola atrás +, frente −, lateral rema) | **Fundamental** (clave del gait emergente) |
| umbral `asp>0.5` | — | Tentáculo (limbAr, sin masa) vs lóbulo (masa) | **Fundamental** |
| coherencia de fase | fasor `c·e^{iφ}` | Propulsores en fase refuerzan; dispersos se cancelan | **Fundamental** (marcha coordinada emerge) |

### 11.2 Expresión (`organism.js`)
| Regla | Fórmula | Propósito | Veredicto |
|---|---|---|---|
| Penalización omnívora | `1 − omniPenalty·4·diet·(1−diet)` | Parábola que castiga la dieta intermedia | **Fundamental** (mecanismo) |
| Penalización caza/carroña | `1 − scavPenalty·4·scav·(1−scav)` | Ídem para el eje cazar/carroñear | **Fundamental** |
| `breadth`/`thin` | `1 − min(1,(elongN−1)/(elongMax−1))` | Anchura ↔ aerodinámica (liga forma a nicho) | **Fundamental** |
| `reproRef` | `E_max_base · sizeMass` | La cría usa solo sizeMass (la complejidad no frena criar) | **Fundamental** (decisión de diseño) |
| `trophicRole` | umbrales `diet>0.6`, `<0.4` | Clasificación trófica (lectura, no dinámica) | **Mixto** |
| `lure` | gate sobre `o_len` × `(0.4+o_bulb)` | Señuelo: construido por selección, no de serie | **Mixto** |

### 11.3 Bucle de simulación (`sim.js`)
| Regla | Valor | Propósito | Veredicto |
|---|---|---|---|
| `scanR` adaptativo | `min(3, max(1, ceil(reach/hc)))` | Radio de escaneo de vecinos (cap 3) | **Fundamental** (perf O(n)) |
| `threatLo`/`threatHi` | `1/preyHi`, `1/preyLo` | Banda de amenaza precalculada (simetría con presa) | **Fundamental** |
| EMA de `atkDrive` | `·0.92 + atk·0.08` | Suavizado del "ceño" (solo render) | **Ad hoc** |
| E inicial fundador | `0.5·eMax` | Condición inicial | **Ad hoc** |
| jitter de cría | `±3 u` (`(rng−0.5)·6`) | Posición de la cría junto al padre | **Ad hoc** |
| ataque | `rng < atkOut && attackCD≤0` | La caza emerge del cerebro | **Fundamental** |
| ganador combate | `fi/(fi+fj)`, `fi=(size+0.1)^sizeAdv` | Resolución estocástica por talla | **Fundamental** |
| señuelo vecino | umbral `lure>0.12` | Quién emite atracción de emboscada | **Ad hoc** |

### 11.4 Sembrado (`sim.js: _seedInitial`/`_seedSimple`)
Decenas de valores `jit(...)` que fijan la **condición inicial** de fundadores y cohortes (proto-carnívoro,
proto-gusano carroñero, proto-cazador-garra). **Veredicto: Ad hoc por valor, pero fundamentales en intención** —
siembran los nichos para **cruzar valles de fitness** (ver memorias `morphology-valley-needs-seeding` y
`carnivore-extinction-mutation`). No codifican conducta: la selección decide si persisten.

### 11.5 Cerebro sembrado (`genome.js: seedBrain`)
Pesos de partida que conectan `+∇comida +hacia_presa −amenaza` a las salidas, con sesgo de esfuerzo `0.56`
(throttle base ≈0.7) y `atkBias` para cazadores. **Mixto** — el mecanismo (arrancar competente, no ciego) es
**fundamental** para que la población no se extinga antes de evolucionar; los valores son **ad hoc**.

### 11.6 Mundo (`world.js`)
| Regla | Detalle | Veredicto |
|---|---|---|
| Ruido de valor | 4 octavas, `freq=2+oct·3`, periódico (toro sin costura) | **Mixto** (gradiente de capacidad) |
| `smooth(t)` | `t²(3−2t)` (smoothstep) | **Ad hoc** (interpolación) |
| Regen logística | `dr·(seedFloor + r/c + meanNb/c)` | Rebrote con difusión de semilla → parches | **Fundamental** (dinámica de vegetación) |
| Conservación | pasto crece consumiendo N; carroña → N; metabolismo → N | **Fundamental** (pecera cerrada) |

---

## 12. Otros sistemas relevantes

| Sistema | Dónde | Propósito | Veredicto |
|---|---|---|---|
| **Especiación (k-means)** | `worker.js: classifySpecies` (cada 60 ticks) | Clustering por distancia genética funcional → ids estables | **Mixto** (observación; el umbral SÍ es load-bearing vía `_findMate`) |
| **Spatial hash** | `world.js` (lista enlazada, celda=`sense.max`) | Vecindad O(n) sin O(n²) | **Fundamental** (rendimiento, regla §2) |
| **Pool / free stack** | `sim.js` | Reciclaje de slots sin GC | **Fundamental** (perf) |
| **Conservación de materia** | `sim.reset` (balance inicial) + todas las transacciones | 5 pools (N, pasto, organismos, carroña, cuerpo) = `matterBudget·área` | **Fundamental** (tesis de la pecera) |
| **Registro de muertes (deathLog)** | `sim._kill`, `DEATH_STRIDE=5+nodos`, `DEATH_CAP=256` | Cadáveres con forma para el render | **Ad hoc** (cosmético; no toca la dinámica) |
| **Escalado multi-escala** | `sim._aScale = (size/1000)²` | Lo extensivo (materia, rejilla) ∝ área; misma densidad | **Fundamental** (responsive del mundo lógico) |
| **PRNG determinista** | `util/rng.js` | Reproducibilidad (misma semilla → misma evolución) | **Fundamental** |
| **Histórico de gráficas** | `worker.js` (`HIST_K=40`, `HIST_WINDOW=4800`, `HIST_BINS=24`) | Series temporales muestreadas por ticks | **Ad hoc** (instrumentación) |
| **Demografía** | `sim.deathCause`, `birthCount` | Conteo de muertes por causa / nacimientos por tipo | **Ad hoc** (instrumentación) |
| **Snapshot / ping-pong** | `worker.js: snapshot`, `main.js` | Foto compacta zero-copy + reutilización del buffer `nodes` | **Fundamental** (perf del puente hilo↔hilo) |

---

## 13. Resumen: recuento y veredicto

| Categoría | Nº de ítems | Predominio |
|---|---|---|
| Genes (loci) | 208 (19 nombrados + 80 nodos + 109 cerebro) | Fundamentales (sustrato evolutivo) |
| Rasgos de fenotipo cacheados | ~31 arrays SoA | Fundamentales como traducción; fórmulas mixtas |
| Parámetros de `config.js` | ~120 valores en 13 bloques | Mayoría **Mixtos** (mecanismo fundamental, valor ad hoc) |
| Entradas/salidas del cerebro | 11 / 4 | Fundamentales |
| Reglas cableadas significativas | ~30 | Reparto fundamental/ad hoc según sección |

**Lectura de alto nivel para la refactorización:**

1. **El núcleo fundamental e irreductible** es pequeño y claro: el genoma SoA (208 loci), la frontera
   gen→fenotipo (`organism.js`+`bodyplan.js`), el cerebro RNN como único motor de conducta, la herencia
   (mutación + crossover con ligamiento + selección sexual), la conservación de materia (5 pools), la
   energética alométrica (Kleiber) y la física trófica (banda de talla, refugio, handling time). Quitar
   cualquiera cambia *qué es* el modelo.

2. **La mayor masa de complejidad es de calibración** (`config.loco`, `config.energy`, coeficientes de
   `bodyplan.js`): mecanismos fundamentales parametrizados por **valores ad hoc** afinados empíricamente
   (documentados en CHANGELOG y memorias). Son "mixtos": el trade-off es real, el número es negociable.

3. **Lo puramente ad hoc y separable** es: el sembrado (decenas de `jit()` que cruzan valles de fitness),
   los genes decorativos (`c_lum`, `o_hue`, `o_num`), y la instrumentación (deathLog, histórico, demografía).
   Nada de esto pertenece a la física; existe para arrancar el sistema, pintarlo o medirlo.

4. **Zonas grises a vigilar** (señaladas por las memorias del proyecto): `carcassValue` y `expr.size.min` son
   palancas de RÉGIMEN bimodales (no se afinan fino); la selección sexual (`orn`/`pref`) y el señuelo de
   emboscada son "load-bearing" pero de carga débil; el cazador ápice es estocástico y frágil en mundos
   pequeños (Allee).
```
