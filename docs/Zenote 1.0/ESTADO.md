# Estado del proyecto — dashboard

> **Documento ÍNDICE.** Foto del presente + mapa de la documentación. No almacena detalle: la mecánica vive en
> [`SPEC_EVOLUCION.md`](SPEC_EVOLUCION.md), los parámetros en [`src/config.js`](../../src/config.js), la dinámica en
> [`ANALISIS_PARAMETROS.md`](ANALISIS_PARAMETROS.md), las ideas en [`ideas/`](ideas/indice-ideas.md), los hitos en
> [`CHANGELOG.md`](CHANGELOG.md). Aquí solo se sintetiza y se enlaza. Actualizar en cada hito.

**Estado (2026-06):** simulador de evolución **genuinamente emergente** — conducta y morfología bajo selección, sin
reglas de estrategia ni fitness explícito. El **modelo actualizado** (cuerpo generativo por nodos) está consolidado, con
**locomoción por FUERZA** (el cerebro decide el ESFUERZO; la velocidad emerge de empuje−arrastre con inercia) y
morfología evolutiva (forma/función/movimiento de los nodos). Backlog de auditoría **CERRADO (14/14)**.

## Modelo (resumen — detalle en [SPEC_EVOLUCION.md](SPEC_EVOLUCION.md))

Genoma por agente (SoA, typed arrays; nº de genes = `NUM_GENES` en `genome.js`):

| Bloque | Genes | Codifica |
|---|---|---|
| Ecología / fisiología | 11 | size, **speed (musculatura)**, sense, metab, diet, scav (caza↔carroña), repro_thr, invest, hue, mature_age, senescence (ciclo r/K) |
| Identidad / display | 8 | e_fov (visión), orn/pref (selección sexual), c_lum (glow), o_* (señuelo) |
| Cuerpo por NODOS | 80 | 8 nodos × {present, parent, size, aspect, angle, attach, osc_amp, osc_phase, tipShape, gaitMode} → grafo generativo |
| Cerebro | 109 | RNN recurrente (Elman): 11 entradas, **4 salidas** (dirección x,y + impulso de ataque + ESFUERZO dedicado); pesos = genes |

- **Frontera gen→fenotipo única:** `organism.js` + `bodyplan.js`. Masa, arrastre, empuje direccional, giro (con
  inercia angular), forma y modo de nado EMERGEN de la geometría del grafo de nodos.
- **Locomoción por FUERZA:** el cerebro decide la dirección y el ESFUERZO (salida dedicada); la velocidad emerge de
  empuje−arrastre con INERCIA ∝ masa. El gen `speed` = **musculatura** (capacidad de empuje, con coste de mantenerla).
- **Herencia:** sexual (crossover con ligamiento) + asexual fallback; mutación única por locus; especies por
  distancia genética (ecología + forma de nodos; excluye cerebro y color).
- **Fitness 100% emergente** (sobrevivir + criar). Motor en Web Worker; render Canvas 2D desde los nodos.
- **Mundo CERRADO en materia ("pecera"), único escenario:** la materia total se CONSERVA y circula
  (nutriente↔pasto↔organismos↔carroña), capacidad de carga ENDÓGENA. Régimen de **RED TRÓFICA** (herbívoros +
  carroñeros + cazadores); el **suelo de talla** (`expr.size.min`) impide la deriva a cuerpos diminutos que
  saturaría el pool y extinguiría al cazador. Parametrización general **anti-colapso medida multi-escala** (diversidad
  en mundos pequeños y grandes) → memoria `parametrizacion-multiescala-anticolapso`. Mecánica → [SPEC §3ter](SPEC_EVOLUCION.md).

## Qué EMERGE (no cableado)
Especiación · **conducta 100% neuronal** (cazar/huir/pastar **y atacar** emergen de los pesos, sin gen `aggro`) ·
**control de velocidad por ESFUERZO** (descansar/crucear/esprintar; modelo de fuerza con inercia ∝ masa) ·
**morfología generativa** y **gait direccional** (colas atrás propulsan, frentes frenan; ondulantes vs remeros;
ondular↔aletear con coste) · **coordinación de marcha** (coherencia de fase → `osc_phase` funcional) · nichos de
**dieta** y de **talla (r/K)** · **energética alométrica** (almacén ∝ masa, metabolismo ∝ masa^¾ Kleiber) ·
depredación por talla con **refugios móviles** (cobertura por vegetación viva) · **selección sexual** (orn/pref) ·
identidad visual por linaje · **morfología funcional:** apéndices frontales → alcance de caza (`morphReach`), cuerpos
anchos → pastoreo (`k_grazeWide`), gusano fino → carroñeo (`k_scavThin`); la especialización la destraban
`omniPenalty`/`scavPenalty`. · **Carroña:** toda muerte deja cadáver (campo `carrion`, decae→nutriente = ciclo de
materia); `scav` reparte la carne en cazar↔carroñear.

## Huecos / ideas abiertas (→ [ideas/indice-ideas.md](ideas/indice-ideas.md))
Auditoría CERRADA (14/14); trilogía de morfología (Capas 1-3), giro físico con inercia angular, cadáveres con forma y
LOD declarativo: **HECHOS**. Ideas vivas: vegetación tras el dosel (render, fase 2), afinar el balance de carroñeros
finos, diversidad de talla bajo reproducción sexual, + menores. *A vigilar (memoria):* el cazador ápice es estocástico
y frágil en mundos pequeños (Allee); `carcassValue` y `expr.size.min` son palancas de RÉGIMEN bimodales (no se afinan fino).

---

## Mapa de la documentación (qué doc lleva qué)

| Documento | Rol | Contiene |
|---|---|---|
| `CLAUDE.md` | Instrucciones de trabajo | reglas innegociables, pila técnica, cómo contribuir |
| `docs/Zenote 1.0/SPEC_EVOLUCION.md` | **Fuente de verdad del MODELO** | mecánica: genoma, herencia, mutación, selección, energética, física por nodos, rendimiento |
| `src/config.js` | **Parámetros (fuente única)** | cada parámetro: valor, comentario, marca *(UI)*; agrupado por bloque |
| `docs/Zenote 1.0/ANALISIS_PARAMETROS.md` | **Mapa de interacciones** | qué hace cada subsistema a nivel de ECUACIÓN, bucles de realimentación, modos de fallo, jerarquía de palancas (base del finetuning) |
| `docs/Zenote 1.0/VISUAL.md` | Estética y RENDER | look, render por nodos, calidad/LOD, UI, responsive |
| `docs/Zenote 1.0/archivo/AUDIT_EVOLUCION.md` | Auditoría (histórica, congelada) | análisis física/diseño, catálogo de genes, backlog CERRADO 14/14|
| `docs/Zenote 1.0/ideas/indice-ideas.md` | **Índice de ideas** | enumeración + estado; fichas en `ideas/<slug>.md`, archivadas en `ideas/archivo/` |
| `docs/Zenote 1.0/CHANGELOG.md` | Hitos cronológicos | qué cambió y cuándo (reciente arriba) |
| `docs/Zenote 1.0/ESTADO.md` | **Foto del presente + índice** (este) | estado 1-línea, resumen del modelo, qué emerge, huecos, mapa de docs |
| memoria del proyecto | Observaciones / lecciones | dinámicas emergentes y resultados medidos no derivables del código |

**Reglas anti-duplicación (un hecho, un sitio):**
- **Mecánica del modelo** → SOLO en SPEC. ESTADO resume y enlaza.
- **Parámetros** → SOLO en `src/config.js` (comentado). No hay doc de parámetros.
- **Backlog** → AUDIT (histórico, cerrado). **Ideas vivas** → `ideas/`. **Mecánica de una idea hecha** → SPEC (no en su ficha).
- **Hitos** → CHANGELOG. **Observaciones/medidas emergentes** → memoria. Si un dato vive en dos sitios, sobra en uno.
