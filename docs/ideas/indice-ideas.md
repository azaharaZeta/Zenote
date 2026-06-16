# Índice de ideas

Enumeración de ideas del proyecto y su estado. **Cómo funciona:**

- Una idea **pendiente** vive aquí: pitch breve + su **análisis** (abajo). Al decidir trabajarla → estado **en curso**
  y se crea su **ficha** en `docs/ideas/<slug>.md` con los análisis/decisiones/cambios.
- Al terminar (**hecha**), descartar (**descartada**) o aparcar, la ficha se mueve a `docs/ideas/archivo/` (congelada)
  y aquí queda **solo la fila de la tabla** con el puntero. **La mecánica de lo HECHO vive en `SPEC_EVOLUCION.md` y en la
  memoria del proyecto — no se duplica aquí.** (Por eso las ideas hechas no llevan análisis inline; las pendientes sí.)

Otros docs: mecánica → `SPEC_EVOLUCION.md` · parámetros → `src/config.js` (comentado) · render → `VISUAL.md` ·
auditoría histórica → `../archivo/AUDIT_EVOLUCION.md` · estado/foto → `../ESTADO.md` · hitos → `../CHANGELOG.md` ·
observaciones/lecciones de ecología → memoria del proyecto.

## Estado de las ideas

### Hechas (mecánica en SPEC/memoria; ficha en archivo si la hay)
| Idea | Estado | Puntero |
|---|---|---|
| Morfología evolutiva por nodos (Capas 1-3) | ✅ hecha | [archivo/morfologia-nodos-capas-1-3.md](archivo/morfologia-nodos-capas-1-3.md) · SPEC §2bis/§3 |
| Cabeza ya no es el motor (`headThrust`) | ✅ hecha | [archivo/cabeza-no-motor.md](archivo/cabeza-no-motor.md) |
| Forrajeo por talla (payoff de talla) | ✅ hecha | [archivo/forrajeo-por-talla.md](archivo/forrajeo-por-talla.md) · SPEC §3.1 |
| Amplificar refugios móviles (`patchiness`) | ✅ hecha | default 0.75 (knob UI) |
| Que la velocidad IMPORTE (escape por velocidad) | ✅ hecha | `combat.fleeSpeed` + `refuge` · SPEC §3.1 · mem. `speed-is-a-race-quantity` |
| Cazar viable en escasez (biomasa de la presa) | ✅ hecha | `energy.carcassValue` · SPEC §3.1 · mem. `lean-prey-starves-predators` |
| Carroña + GUSANO carroñero | ✅ hecha | campo `carrion` + gen `scav` + proto-gusano · SPEC §3bis · mem. `morphology-valley-needs-seeding` |
| Coste de ARRASTRE en locomoción | ✅ hecha | `energy.k_drag`/`dragRef` · SoA `drag`=Dmul · SPEC §3 · mem. `swim-cost-minor-at-low-speed` |
| Selección de presa por talla | ✅ hecha | vía entrada neuronal (talla relativa) · SPEC §cerebro |
| Nuevas entradas sensoriales del cerebro | ✅ hecha | cobertura + talla + escapabilidad de la presa; **manada APLAZADA** (mem. `pecera-pequena-contemplativa-scope`) |
| Pecera: nutriente ESPACIAL + viz de la materia | ✅ hecha | campo `N` por celda + difusión + viz índigo · SPEC §3ter |
| Gráfica de biomasa (reparto de materia, pecera) | ✅ hecha | `charts._drawBiomass` (organismos/vegetación/carroña/nutriente + total) |
| Leyenda "Rol" ponderada por totales | ✅ hecha | banda ∝ nº por oficio + 4º oficio (omnívoro) vía `trophicRole`, viva por frame |
| **Control de velocidad por ESFUERZO (decidir cuándo moverse/parar/correr)** | ✅ hecha (2026-06-17) | modelo de FUERZA: el cerebro decide esfuerzo, la velocidad emerge de empuje−arrastre con inercia ∝masa · SPEC §2bis · mem. `locomocion-modelo-fuerza` |
| **Rediseño del señuelo (nicho de emboscada real)** | ✅ hecha (2026-06-16) | desacoplado de `orn` → gen propio `o_len`/`o_bulb`; lo expresa ~la fracción cazadora, no universal · SPEC §3 · mem. `simplificacion-ablacion-2026-06` |
| **Simplificación / poda** | ✅ hecha (2026-06) | modo abierto, `wrap`, nicho térmico, genes decorativos (c_eye/c_sat/tex2), `maxAgents` escalable — eliminados · mem. `open-mode-removed-closed-only`, `simplificacion-ablacion-2026-06` |

### Descartadas / resueltas (lección, no reintentar)
| Idea | Estado | Nota |
|---|---|---|
| Variabilidad temporal del recurso (boom-bust) | ❌ descartada (probada) | no diversifica la talla y casi extingue la pop · mem. `boom-bust-no-diversifica-talla` |
| ¿`corpseReturn` es un leak de biomasa? | ✅ obsoleta | el modo abierto (donde existía la duda) se eliminó; en pecera la carroña mineraliza íntegra a `N` (conserva) |

### Pendientes / en curso (análisis abajo)
| Idea | Estado | Nota |
|---|---|---|
| Giro físico (que use los segmentos) | 🔄 en curso | [giro-fisico.md](giro-fisico.md) — C hecho; B (par+inercia) y A (cerebro izq/der) pendientes |
| Velocidad relativa a la TALLA (zancadas) | ⬜ pendiente | el modelo de fuerza dio inercia ∝masa, pero NO escala de velocidad con la talla — análisis abajo |
| Afinar balance del modelo de fuerza | ⬜ pendiente | cola de colapso (~2/6 seeds) + carroñeros finos tras bajar `carcassValue` — análisis abajo |
| Repurposar gen `speed` → capacidad muscular | ⬜ pendiente | hoy `speed` quedó INACTIVO en el modelo de fuerza — análisis abajo |
| Por qué la resolución no cambia los FPS | ⬜ investigación | el slider de resolución no parece mover los fps — análisis abajo |
| Señuelo: coste por `o_num` + visibilidad | ⬜ pendiente (flecos) | el rediseño hizo el nicho; faltan estos dos matices — análisis abajo |
| Diversidad de talla bajo repro sexual | ⬜ pendiente | la sexual aplana la talla — análisis abajo · mem. `sexual-repro-flattens-size` |
| Dibujado de vegetación: dosel (Fase 2) | ⬜ pendiente | render, no toca la sim — análisis abajo (Fase 1 hecha) |
| Vegetación poco visible / sin valor (render) | ⬜ pendiente | la fosforescencia teal es muy sutil → ni informa ni decora; realzar contraste sin romper la penumbra |
| Cadáveres con FORMA (render) | ⬜ pendiente | marcadores efímeros del cuerpo muerto — análisis abajo |
| Apiñamiento de hermanos (render) | ⬜ pendiente | reparto angular sutil entre nodos con igual `parent`/`emit` (solo render) |
| LOD declarativo (tabla de elementos visuales) | ⬜ pendiente | arquitectura/mantenibilidad del render — análisis abajo |
| Visor de especie en móvil | ⬜ pendiente | añadir DIETA al panel; recordar qué `<details>` quedaron abiertos (solo UI) |

---

## Velocidad relativa a la TALLA (zancadas)
*(pendiente · de la bandeja, 2026-06-17)*

El **modelo de fuerza** (recién hecho) dio inercia ∝ masa, pero **no** que la velocidad escale con la talla. Observación
del usuario: hoy los pequeños se desplazan rápido en el mundo y los grandes lento. Lo realista sería al revés en
"longitudes de cuerpo": el pequeño se mueve rápido **en su escala** pero apenas avanza en el mundo; el grande, lento por
su masa pero con **zancadas grandes** → avance macroscópico mayor. **Vía a explorar:** que el empuje/`vmax` escale con el
radio (no solo con la masa), o medir el desplazamiento en longitudes-de-cuerpo. Medir el efecto en la ecología (cambia
quién alcanza a quién). Liga con el modelo de fuerza y con la depredación por velocidad relativa.

---

## Afinar balance del modelo de fuerza
*(pendiente · flecos del modelo de fuerza, 2026-06-17)*

El modelo de fuerza quedó consolidado y re-balanceado (`carcassValue 0.14` + `refuge 0.45` + `moveCost 0.02` +
`handlingTime 48`), con la diversidad y la base herbívora restauradas. Quedan dos flecos medidos:
- **Cola de colapso:** ~2/6 seeds aún caen al ápice-carnívoro (bimodalidad inherente, algo más probable con el modelo nuevo).
- **Carroñeros finos** (0.13 vs 0.36 base): al bajar `carcassValue` perdieron recompensa de carroña.

**Levers a probar (sin re-subir `carcassValue`):** `scavPenalty`↓ / `carrionAbsRate`↑ (revivir carroñeros), `fleeSpeed`↑ /
`refuge`↑ (cortar la cola de colapso), o un **barrido sistemático** multi-parámetro. Detalle en mem. `locomocion-modelo-fuerza`.

---

## Repurposar el gen `speed` → capacidad muscular
*(pendiente · flecos del modelo de fuerza, 2026-06-17)*

En el modelo de fuerza el esfuerzo lo decide el cerebro tick a tick y la capacidad se computa a tope (`effort=1`), así que
el gen `speed` quedó **inactivo** (deriva neutral, aún cuenta en la distancia genética). Idea: convertirlo en **inversión
en musculatura** → escala la capacidad de empuje (`vmax`) y cuesta algo de basal mantenerla; el cerebro decide cuánto de
esa capacidad USA. Añade un trade-off r/K (músculo potente que no usas = caro) y le devuelve sentido al gen. Coste bajo.

---

## Por qué la resolución no cambia los FPS
*(investigación · de la bandeja, 2026-06-17)*

El ajuste de resolución (slider `maxInternalPx`) no parece mover los fps (mínima vs máxima ≈ iguales). **Hipótesis:** el
tope de FPS (`maxFPS=20`) los limita por debajo del coste real de pintar → no se nota; o el cuello, a los tamaños probados,
está en el motor/otra cosa y no en los píxeles. Contrastar con la memoria `render-perf-resolution-bound` (que midió el
render como pixel-bound, `maxInternalPx` 4K→1600 = 8.6×). **Medir** fps SIN cap a varias resoluciones para aislar el efecto.

---

## Señuelo: coste por `o_num` + visibilidad
*(pendiente · flecos del rediseño del señuelo, 2026-06-16)*

El rediseño convirtió el señuelo en un nicho de emboscada real (desacoplado de `orn`, gen propio). Quedan dos matices:
- **Coste por cantidad:** `o_num` (nº de señuelos) sigue siendo DECORATIVO — no cuesta ni añade alcance → pueden emerger
  racimos "gratis". Que cueste energía frenaría los racimos. Lo más directo.
- **Visibilidad:** que exhibir señuelo aumente tu rango de detección por otros → trade-off honesto pro-reproducción
  (liga con `orn`) vs anti-depredación. Mecánica nueva — medir que no rompa el equilibrio.

---

## Diversidad de talla bajo reproducción SEXUAL
*(pendiente)*

**Problema (medido):** la repro solo-sexual APLANA la diversidad de talla — la mezcla grande×pequeño regresa los extremos
a la media (mem. `sexual-repro-flattens-size`). La asexual la conserva, pero el default es sexual.

**Vía (si se retoma):** bajar `repro.speciesGenThreshold` (y/o `mateRadius`) para que los grupos de talla ESPECIEN y dejen
de cruzarse (los extremos no se promedian). **Riesgo de Allee** si el umbral es muy bajo (no encuentra pareja → bajones).
Nota colateral: bajo sexual, `diet.omniPenalty` rinde mejor a ~0.05 que a 0.15. Medir umbral vs estabilidad.

---

## Dibujado de vegetación: organismos tras el dosel (Fase 2)
*(pendiente; Fase 1 hecha)*

**Fase 1 (hecha):** la vegetación se lee por contraste sobre el sustrato abisal; el plancton son chispas con glow, densidad
por cantidad. **Fase 2 (pendiente):** vegetación translúcida DELANTE de los organismos en zonas densas → se *ve* que se
esconden (liga con el refugio). Enfoques: (A) velo de dosel (2º buffer sobre los agentes), (B) fundido del agente según su
cobertura, (C) ambas. El render NO toca la simulación (regla 3 de VISUAL.md).

---

## Cadáveres con FORMA (render)
*(pendiente)*

Hoy la carroña (campo `carrion`) se dibuja como mancha gris. Idea: mostrar el CUERPO real del muerto en su sitio, grisáceo,
deshaciéndose. **Vía:** marcadores de render EFÍMEROS — el worker manda las muertes del frame (pos + nodos + causa) y el
render dibuja el cuerpo desaturado que se desvanece; la carroña como CAMPO sigue siendo la mecánica (sin coste en la sim).

---

## LOD declarativo: desacoplar los umbrales de la lista de elementos visuales
*(pendiente · arquitectura)*

Los parámetros del LOD tienen **dependencia dura** con la lista de elementos visuales (cuerpo, ojos, señuelo, onda, halo +
por-nodo). Cada uno es un `lodX` suelto con su gate cableado a mano en VARIOS sitios (`config.js`, `_drawAgents`,
`_drawBodyGraph`, `_bakeSprite` — replicar el gate) → frágil, fácil de desincronizar (ya causó una costura vivo↔sprite en
el señuelo). **Vía:** una **tabla declarativa** `{ nombre, umbral, aplica(rPx), dibuja(...) }` sobre la que iteren el
dispatch y el horneado → añadir un elemento = una entrada; el caché hereda el mismo gate. Refactor acotado, sin cambio de
comportamiento. No urge; rentable si se añaden más elementos o junto al **esqueleto** (sprites por nodo).

---

## Bandeja de entrada (sin procesar)
*Ideas crudas del usuario, a analizar y convertir en ideas con su pitch cuando se aborden.*

✅ vacía (procesada 2026-06-17).
