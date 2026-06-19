# Resumen final de auditoría evolutiva — Zenote

> **Propósito.** Capstone de la auditoría de refactorización. Sintetiza los cinco documentos previos y responde
> cinco preguntas decisivas. **No propone una arquitectura nueva** — solo consolida el diagnóstico.
>
> **Documentos auditados (todos en `docs/Zenote 2.0/`):**
> 1. [`evolution-architecture-map.md`](evolution-architecture-map.md) — subsistemas, flujos, ciclos de vida.
> 2. [`evolution-inventory.md`](evolution-inventory.md) — 208 genes, ~120 parámetros, fenotipo, reglas.
> 3. [`evolution-debt-report.md`](evolution-debt-report.md) — 21 ítems de deuda (D1-D21).
> 4. [`emergence-analysis.md`](emergence-analysis.md) — qué emerge vs qué se cablea.
> 5. [`first-principles-analysis.md`](first-principles-analysis.md) — leyes de conservación presentes/ausentes.
>
> Apoyado además en `ANALISIS_PARAMETROS.md`, `CHANGELOG.md` y las memorias del proyecto.

---

## TL;DR

Zenote logra **emergencia genuina en dos capas** (conducta neuronal sin estrategia cableada; morfología
generativa donde la forma produce el movimiento) sobre una base técnica sólida (SoA + spatial hash + Worker +
conservación de materia). Pero **la composición del ecosistema —qué gremios existen, en qué proporción y de forma
estable— no emerge: se siembra y se tunea.** La causa raíz es de primer principio: el modelo tiene **una sola
ley de conservación (materia)** y **sustituye casi todas las demás restricciones físicas por parámetros**
(termodinámica, espacio, momento, alometría temporal). El resultado es un sistema **bimodal** cuyas palancas
maestras viven en una **frontera de colapso** — porque sostienen con números lo que debería sostener una ley.

---

## 1. ¿Cuáles son los mayores problemas de arquitectura?

Ordenados por profundidad (causa raíz primero):

**P1 — La energía no existe como magnitud física; es materia relabelada (sin termodinámica).** `E = materia × epu`.
No hay fuente de energía libre (el "sol" no inyecta nada), ni sumidero (el metabolismo devuelve el 100% a
nutriente, [`sim.js:671`](../../src/engine/sim.js)), ni entropía. El ecosistema es un **bucle cerrado de materia
sin disipación** — un móvil perpetuo de 2ª especie que solo "funciona" porque la energía nunca se degrada. **Todo
lo que en biología surge del flujo unidireccional de energía (pirámide trófica, límite de niveles, por qué hace
falta el sol) aquí se emula con parámetros** (`preyGain`, `carcassValue`, `closedRegen`). Es la laguna que genera
casi toda la deuda de régimen. → first-principles §0, §2.1.

**P2 — La evolución es hill-climbing local sin forma de cruzar valles de fitness.** El operador de variación
(mutación gaussiana + crossover) explora localmente; no hay temperatura evolutiva, andamiaje de complejidad ni
neutralidad estructural. Consecuencia: carnivoría, carroñeo y morfología compleja **no emergen desde cero** — se
**siembran** a mano (proto-carnívoro, proto-gusano, proto-garra) y se arranca con cerebros ya competentes
(`seedBrain`). Tensiona la regla §1 de CLAUDE.md. → debt D1, emergence §C1.

**P3 — La estabilidad ecológica se compra con constantes, no emerge.** El mundo no tiene fricción ecológica
natural (refugios espaciales, saciedad, coste físico del intento, exclusión de volumen), así que toda la
coexistencia depredador-presa descansa en estabilizadores Lotka-Volterra cableados (`refuge.strength`,
`fleeSpeed`/`fleeCap`, `handlingTime`, `failDamage`) + banda de talla (`preyBand*`). → debt D6/D7, emergence §6, §C2.

**P4 — El eje de talla está estructuralmente sesgado al mínimo → bifurcación de régimen.** El ingreso no penaliza
ser pequeño tanto como el umbral de cría premia serlo (`reproNeedE ∝ size^massExp`). Se parchea con un **suelo de
talla** (`expr.size.min`) y **forrajeo por área** (`forageReach`). `expr.size.min` es una palanca **maestra
bimodal** que decide la rama (colapso vs sano), no un dial fino. → debt D2/D5, first-principles §"tiempo/biomasa".

**P5 — Acoplamientos peligrosos: un parámetro técnico regula la ecología.** `maxAgentsCeiling` (tope de pool por
memoria) **se vuelve el regulador de población real** en el modo de fallo (r-runaway). Un límite de implementación
con consecuencias ecológicas es un síntoma de arquitectura. → debt D9.

**P6 — Deuda de migración y de caché incrustada en el hot path.** La doble vía `forceModel` (modelo viejo +
nuevo) con parámetros legados inertes (`effort`/`k_effort`/`effortFloor`); el fenotipo cacheado al nacer que
obliga a `recomputePhenotypes()` con sus excepciones; la marca de agua de `serial` por reutilización de slot. No
son biológicos, pero triplican la superficie de razonamiento del motor. → debt D8/D10/D13.

**P7 — La especie no es un concepto emergente, sino una distancia euclídea curada a mano.** Hay que excluir el
cerebro (dominaría), los decorativos y las fases (especiación espuria). No hay aislamiento reproductivo real. La
métrica es frágil: cada gen nuevo obliga a decidir si "cuenta". → debt D14.

---

## 2. ¿Cuáles son las mayores fuentes de explosión de parámetros?

~120 valores en `config.js`; la mayoría son **"mixtos"** (mecanismo fundamental, valor ad hoc). Los focos:

**E1 — `config.loco` (~40 coeficientes): el mayor bucket.** Pares thrust/drag (`seg/mod/body/limb`×`Thrust/Drag`),
familia `tip*` (3), familia `flap*` (2), familia `turn*` (5), `kThrust/headThrust/paddleEff/symBase/oscFloor/
stream*/elongMax/vMin/vMax/muscle*/...`. Razón: la física forma→fuerza se calibró a mano coeficiente a coeficiente
para que el nado "emerja con aspecto orgánico". → inventory §9, debt D20.

**E2 — El patrón "loadings como impuestos" en la energética.** `baseCost` es un **producto de factores
`(1+k·rasgo)`** (`k_metab`, `k_lifespan`, `k_sense`, `k_lure`, `k_muscle`) y `absEff`/`effScav` suman más
(`k_graze`, `k_grazeWide`, `k_scavThin`). **Cada rasgo nuevo añade su `k_`.** No hay un balance de potencia común
del que se deriven los costes; hay un impuesto sumado por órgano. → inventory §8, first-principles §"coste metabólico".

**E3 — Parámetros que sustituyen a constraints ausentes (y por eso DEBEN tunearse y son bimodales).** Cada ley que
falta (P1, P3, P4) se reemplaza por uno o varios diales delicados: `carcassValue`/`preyGain` (≈ disipación
trófica), `omniPenalty`/`scavPenalty` (≈ incompatibilidad fisiológica), los 4 estabilizadores L-V (≈ fricción
ecológica), `size.min`/`forageReach` (≈ alometría de talla), `k_lifespan` (≈ alometría temporal). **La explosión
de parámetros es el coste de la ausencia de leyes.** → first-principles §5.

**E4 — Cojines de calibración sin significado propio.** `dragRef`, `absMetabBase`, `carrionScent`, `fovRef`,
varios `*Floor`, `seed`. Existen para que otra fórmula "se porte bien" en los bordes. → debt D20.

**E5 — El nicho de emboscada (señuelo): superficie desproporcionada.** 2 genes físicos (`o_len`/`o_bulb`) + 3
decorativos + 4 parámetros (`lureGate`/`lureReach`/`lureAttract`/`k_lure`) + sembrado, para un gremio que es
minoría de una minoría. → debt D17.

---

## 3. ¿Qué sistemas deberían probablemente eliminarse por completo?

(Candidatos de borrado para que un rediseño los considere — **no es la propuesta de rediseño**.)

| Sistema | Por qué borrarlo | Confianza |
|---|---|---|
| **Modelo de velocidad viejo** (rama `forceModel=false`) + `effort`/`k_effort`/`effortFloor` | Código muerto de migración; `forceModel` es `true` y `↻`. Triplica la lógica de movimiento. (debt D8) | **Alta** |
| **Genes decorativos `c_lum`/`o_hue`/`o_num`** | Sin rol selectivo; se intentó darles carga y falló (memoria `decor-gene-cost-noop`). Peso muerto en genoma y distancia. (debt D15) | **Alta** |
| **Ramas de sembrado muertas** (`seedDietLow`, `simpleStart=false` aleatorio) | 3 modos de arranque, 1 vivo. Confunden `_seedInitial`/`_seedSimple`. (debt D19) | **Alta** |
| **`seed=123` por defecto** | Vestigial: el worker lo sobrescribe con aleatorio siempre. (debt D20) | **Alta** |
| **Nicho de emboscada / señuelo** (`o_len`/`o_bulb`/`lure*` + sembrado) | Coste/beneficio pésimo: mucha superficie genética+paramétrica por un fenómeno raro, frágil y sembrado. (debt D17) | **Media** |
| **Selección sexual `orn`/`pref`** | Carga selectiva débil; derivan casi neutrales. Marcada "load-bearing" pero sin efecto medido fuerte. (debt D16) | **Media** (verificar antes con una ablación medida) |

**Nota:** todos los "borrar" de confianza media exigen una **ablación medida multi-seed a 20-40k** antes (lección
del proyecto: el sistema es bimodal y el single-seed/horizonte corto engaña).

---

## 4. ¿Qué sistemas deberían probablemente sobrevivir a un rediseño?

Estos son los **activos**: lo que funciona, emerge de verdad o es un cimiento sólido.

| Sistema | Por qué conservarlo |
|---|---|
| **Conservación de materia (la pecera)** | La **única ley de primer principio robusta** del modelo; rigurosa, medida. El cimiento más sólido. (first-principles §1) |
| **Morfología generativa por nodos + locomoción de la forma** (`bodyplan.js`) | La mejor historia de emergencia: velocidad, giro, gait, coordinación de marcha **emergen de la geometría**. El *mecanismo* es genuino (aunque la diversidad concreta se siembre). (emergence §8) |
| **Cerebro neuronal como único motor de conducta** (RNN, pesos=genoma) | Emergencia más pura: cazar/huir/pastar/atacar/parar/esprintar **sin un solo `if` de estrategia**; modulación de velocidad medida como emergente. (emergence §9) |
| **Base técnica: SoA + spatial hash O(n) + Web Worker + ping-pong** | Cumple la regla §2 de rendimiento; desacopla motor y render limpiamente. (architecture §0, §8) |
| **Metabolismo alométrico `mass^kleiber`** | Una ley física **real** (Kleiber ¾), no un parche. (first-principles §"coste metabólico") |
| **Natalidad limitada por materia local** (no nace sin nutriente) | Un techo de población **endógeno y constraint-enforzado** — de lo poco que una restricción real gobierna directamente. (first-principles §"coste reproductivo") |
| **Núcleo de herencia** (mutación + crossover con ligamiento + especie por distancia) | El sustrato evolutivo funciona; la deuda está en la *métrica de especie*, no en la herencia. |
| **Eje r/K emergente de la energética** + **competencia por recurso finito** | Emergencia genuina (la competencia es la más limpia del simulador). (emergence §4, §5) |

---

## 5. Los 10 hallazgos más importantes

1. **La energía es materia relabelada; no hay termodinámica.** Sin fuente, sin sumidero, sin entropía. Es la causa
   raíz de la que cuelga casi toda la deuda de régimen. *(first-principles §0)*

2. **La pirámide trófica no está enforzada por disipación energética**, sino por parámetros (`preyGain`,
   `carcassValue`). La "ineficiencia" del 10% real aquí se **recicla** como materia. Por eso no hay límite físico
   al número de niveles. *(first-principles §2.1)*

3. **La innovación (gremios, formas complejas) no emerge de cero: se siembra.** Subir `morphReach ×4` no induce la
   garra — hay que plantarla. La evolución solo hace hill-climbing local. *(debt D1, emergence §C1)*

4. **La coexistencia depredador-presa se compra con 4 estabilizadores L-V cableados**, no emerge. Es la conducta
   menos emergente y la más frágil del ecosistema. *(debt D6, emergence §6)*

5. **El sistema es bimodal y vive en un punto de bifurcación.** Las palancas maestras (`size.min`, `carcassValue`,
   `maxAgentsCeiling`) "no se afinan fino" — un valor mal puesto degenera el ecosistema entero. Esa fragilidad es
   el síntoma de sostener con números lo que debería ser una ley. *(debt D2/D3, ANALISIS Bucle 2)*

6. **La conducta es genuinamente emergente; la composición del ecosistema no.** Nadie escribe estrategias (RNN
   pura), pero *qué gremios existen y en qué proporción estable* depende de sembrar + tunear. Emergencia *guiada*,
   no espontánea. *(emergence §síntesis)*

7. **La explosión de parámetros (~120) es mayormente el coste de las constraints ausentes** + el patrón "loadings
   como impuestos" (cada rasgo añade su `k_`). `config.loco` (~40) y `config.energy` (~20) son los focos.
   *(inventory §8/§9, first-principles §5)*

8. **Un parámetro técnico (`maxAgentsCeiling`) regula la ecología** en el modo de fallo. Acoplamiento
   límite-de-memoria ↔ control-de-población. *(debt D9)*

9. **Hay deuda no-biológica acotada y barata de saldar conceptualmente:** doble vía `forceModel`, caché-al-nacer +
   re-expresión, marca de agua del pool, genes decorativos, ramas de sembrado muertas. *(debt D8/D10/D13/D15/D19)*

10. **El núcleo sólido es pequeño y claro, y es lo que hay que proteger:** conservación de materia, morfología
    generativa, cerebro neuronal, base técnica SoA/Worker, metabolismo alométrico, natalidad materia-limitada.
    Casi toda la complejidad restante es calibración alrededor de ese núcleo. *(emergence §síntesis, secciones 3-4)*

---

## Mapa de causa raíz (cómo todo conecta)

```
        ┌─────────────────────────────────────────────────────────────────────┐
        │  CAUSA RAÍZ 1: sin termodinámica (energía = materia, sin disipación)  │
        └───────────────┬─────────────────────────────────────────────────────┘
                        │ obliga a emular con parámetros…
        ┌───────────────┼────────────────────┬──────────────────────┐
   carcassValue     preyGain            closedRegen            (pirámide trófica
   (herb↔carn,      (eficiencia          (productividad         sin límite físico)
    bimodal D3)      trófica plana)       sin luz limitante)
                        │
        ┌─────────────────────────────────────────────────────────────────────┐
        │  CAUSA RAÍZ 2: evolución sin cruce de valles (hill-climbing local)    │
        └───────────────┬─────────────────────────────────────────────────────┘
                        │ obliga a…
            sembrado de nichos/formas (D1) + seedBrain + omni/scavPenalty (D4)
                        │
        ┌─────────────────────────────────────────────────────────────────────┐
        │  CAUSA RAÍZ 3: sin fricción ecológica natural (espacio, saciedad…)    │
        └───────────────┬─────────────────────────────────────────────────────┘
                        │ obliga a…
            estabilizadores L-V cableados (refuge, fleeSpeed, handlingTime,
            failDamage, preyBand) (D6/D7)
                        │
        ┌─────────────────────────────────────────────────────────────────────┐
        │  CAUSA RAÍZ 4: eje de talla sesgado al mínimo (ingreso plano)         │
        └───────────────┬─────────────────────────────────────────────────────┘
                        │ obliga a…
            size.min (maestra bimodal D2) + forageReach (D5) + maxAgentsCeiling
            como regulador de facto (D9)
                        │
                        ▼
        SÍNTOMA OBSERVABLE: sistema bimodal, palancas en frontera de colapso,
        ~120 parámetros que NO se afinan fino, cazador ápice frágil/estocástico.
```

**Conclusión del auditor.** El proyecto cumple su tesis donde más importa estéticamente (conducta y forma emergen
de verdad) y tiene un cimiento técnico y de conservación de materia sólido. La deuda no está en el código del
hot-path ni en la genética: está en que **el ecosistema descansa sobre una sola ley (materia) y reemplaza el resto
de la física por parámetros tuneados a mano**, lo que produce un sistema biestable difícil de equilibrar y una
composición de gremios que hay que sembrar. Cualquier rediseño debería **proteger el núcleo emergente** (secciones
3-4) y atacar las cuatro causas raíz del mapa anterior — pero eso es el siguiente documento.
```
