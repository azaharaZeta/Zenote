# Índice de ideas

Enumeración de ideas del proyecto y su estado. **Cómo funciona:**

- Una idea **pendiente** vive aquí: pitch breve + el **análisis original** que se hizo al concebirla. Aquí NO se
  documentan avances ni análisis posteriores.
- Al decidir trabajarla → estado **en curso** y se crea su **ficha de trabajo** en `docs/ideas/<slug>.md`, donde van
  todos los análisis/decisiones/cambios/tests relevantes (sin sobredocumentar).
- Al terminar (**hecha**), descartar (**descartada**) o aparcar, su ficha se mueve a `docs/ideas/archivo/` (congelada)
  y aquí se marca el estado. La **mecánica** de lo implementado vive en `SPEC_EVOLUCION.md` (no se duplica aquí).

Otros docs: mecánica → `SPEC_EVOLUCION.md` · parámetros → `src/config.js` (comentado) · render → `VISUAL.md` ·
auditoría histórica → `../archivo/AUDIT_EVOLUCION.md` · estado/foto → `../ESTADO.md` · hitos → `../CHANGELOG.md` ·
observaciones/lecciones de ecología → memoria del proyecto.

## Estado de las ideas

| Idea | Estado | Ficha / nota |
|---|---|---|
| Morfología evolutiva por nodos (Capas 1-3) | ✅ hecha | [archivo/morfologia-nodos-capas-1-3.md](archivo/morfologia-nodos-capas-1-3.md) · mecánica en SPEC §2bis/§3 |
| Cabeza ya no es el motor (`headThrust`) | ✅ hecha | [archivo/cabeza-no-motor.md](archivo/cabeza-no-motor.md) |
| Amplificar refugios móviles (`patchiness`) | ✅ hecha | default subido a 0.3 (knob de UI) |
| Forrajeo por talla (payoff de talla) | ✅ hecha | [archivo/forrajeo-por-talla.md](archivo/forrajeo-por-talla.md) · mecánica en SPEC §3.1 |
| Que la velocidad IMPORTE (escape por velocidad) | ✅ hecha | `combat.fleeSpeed` + `refuge.strength`↓ · mecánica SPEC §3.1 · memoria `speed-is-a-race-quantity` |
| Cazar viable en escasez (biomasa de la presa) | ✅ hecha | `energy.carcassValue` · SPEC §3.1 · memoria `lean-prey-starves-predators` |
| Carroña + GUSANO carroñero (Fases 1-2) | ✅ hecha | campo `carrion` + gen `scav` (caza↔carroña) + proto-gusano sembrado · SPEC §3bis · memoria `morphology-valley-needs-seeding` · pdte: cadáveres con forma (abajo) |
| Gráfica de biomasa (reparto de materia) | ✅ hecha | `charts._drawBiomass` (organismos/vegetación/carroña/nutriente apilados + total); en lab, pecera y abierto |
| Leyenda "Rol" ponderada por totales | ✅ hecha (2026-06-14) | banda ∝ nº de individuos por oficio + 4º oficio (omnívoro, vía `trophicRole`), viva por frame · análisis abajo |
| Giro físico (que use los segmentos) | 🔄 en curso | [giro-fisico.md](giro-fisico.md) — C hecho; B (par+inercia) y A (cerebro izq/der) pendientes |
| Coste de arrastre en locomoción | ⬜ pendiente | análisis abajo — complementa A (`k_haul`, ya hecho); remate de "revisar nado" |
| Selección de presa por talla | ⬜ pendiente | análisis abajo |
| Nuevas entradas sensoriales del cerebro | ⬜ pendiente | análisis abajo |
| Dibujado de vegetación: dosel (Fase 2) | ⬜ pendiente | análisis abajo (Fase 1 hecha) |
| Cadáveres con FORMA (render) | ⬜ pendiente | análisis abajo — marcadores efímeros, no toca la sim |
| Diversidad de talla bajo repro sexual | ⬜ pendiente | análisis abajo · memoria `sexual-repro-flattens-size` |
| Revisar señuelos (coste / atracción / visibilidad) | ⬜ pendiente | análisis abajo |
| Apiñamiento de hermanos (render) | ⬜ pendiente | nota abajo |
| LOD declarativo (desacoplar de la lista de elementos visuales) | ⬜ pendiente | análisis abajo — arquitectura/mantenibilidad del render |
| Pecera: nutriente ESPACIAL + viz de la materia | ⬜ pendiente | análisis abajo — extiende el ecosistema cerrado (SPEC §3ter) |
| Mejoras de UI / bugs menores | ⬜ pendiente | análisis abajo — bug cámara al soltar pinza · visor de especie en móvil |
| ¿"Reciclaje de cadáveres → pasto" es un leak? | ✅ resuelto | análisis abajo — NO es bug (en cerrado no se usa; en abierto, pérdida intencional del modelo no-conservativo) |
| Variabilidad temporal del recurso (boom-bust) | ❌ descartada (probada) | nota abajo — no diversifica, mete desorden |
| Bandeja de entrada (sin procesar) | ✅ vacía | procesada 2026-06-14 (ver final) |

---

## Selección de presa por talla (forrajeo óptimo) — EMERGENTE
*(pendiente, 2026-06-09)*

**Idea (del usuario):** que el cazador, al elegir presa, tenga en cuenta el tamaño — buscar la que da más comida y
es más fácil de atacar (ni muy pequeña, da poca; ni muy grande, que lo mata).

**Hoy:** el objetivo de presa es el **más cercano** dentro del cono de visión (`bestPrey`/`bestContact` en `sim.js`,
por distancia). La selectividad por tamaño NO es un rasgo evolucionable.

**Por qué NO cablearlo:** programar "elige argmax(comida × prob_victoria)" inyecta una ESTRATEGIA escrita a mano →
choca con la regla nº1. "El más cercano" es una heurística perceptual neutra; "lo más rentable y seguro" es una
optimización de fitness que debe EMERGER.

**Vía fiel a la emergencia (si se retoma):**
- *Reactivo:* gen `prey_pref` (ratio talla presa/depredador preferido) + opcional `prey_focus` (selectividad); el
  targeting puntúa cada presa por distancia × cercanía a la preferencia.
- *Neuronal (el activo):* añadir la **talla relativa de la presa como ENTRADA del cerebro** → los pesos aprenden a
  evitar presa grande y emerge solo. Implica `BRAIN.I`+1 y resembrar.
- Coste: gen(es) nuevo(s) → `NUM_GENES`, seeding, FUNCTIONAL, labels. Moderado, acotado.

**Relación:** `combat.failDamage` ataca la misma fragilidad carnívora desde el otro lado (suaviza la consecuencia de
la mala pelea); medir su efecto antes de decidir si este hace falta.

---

## Coste de ARRASTRE en locomoción — el arrastre debe COSTAR, no solo frenar
*(pendiente, 2026-06-11 · "opción B" del análisis de energética; la "opción A", `k_haul`, ya está hecha)*

**Idea:** hoy el arrastre (`Dmul`, emergente de la forma) solo BAJA la velocidad (`v = …·stream/Dmul`); no cuesta
energía. Como el coste de nado va con `dist² ∝ v²`, un cuerpo con mucho arrastre nada **más barato** (va lento → menos
`dist²` → menos gasto): el arrastre se premia energéticamente y solo se castiga con lentitud.

**Qué arregla A (ya hecho) y qué NO:** A (`energy.k_haul`) hace que arrastrar **masa** cueste al moverse. Pero masa ≠
arrastre: un cuerpo grande pero aerodinámico (poca `Dmul`) y otro de igual masa pero con apéndices anchos (mucha `Dmul`)
pagan **lo mismo** con A. B distinguiría la FORMA hidrodinámica del mero bulto.

**Vía (si se retoma):** cachear una proxy de arrastre por agente (`Dmul` de `reducePlan`, hoy no se guarda en SoA) y
multiplicar el coste de nado por `(1 + k_drag·(Dmul − Dmul_ref))`. Más realista (una forma con resistencia es lenta **y**
agotadora) y cierra el incentivo perverso del arrastre gratis.

**Coste/riesgo:** moderado — un `Float32Array` nuevo seteado en `organism.js` + recalibrar. Cuidado de no penalizar
TRIPLE al cuerpo ancho (ya es lento, ya paga A por masa, y pagaría B por arrastre): medir antes de defaults agresivos.

**Relación:** complementa A; juntos cubren "más grande / más apéndices / más arrastre = más gasto al moverse". Es el
**remate de "revisar nado"** (garras/cabezas frontales que nadaban sin coste aparente; ya atacado con `headThrust`↓ y
`k_haul`, esto cerraría el flanco de la FORMA del arrastre).

---

## Nuevas ENTRADAS sensoriales del cerebro (uso táctico emergente)
*(pendiente, 2026-06-10)*

El cerebro tiene 7 entradas: gradiente de comida (x,y), dirección a presa (x,y), dirección a amenaza (x,y), energía.
**No percibe ni la cobertura ni a los congéneres** → ciertas conductas no PUEDEN evolucionar porque falta la señal.
Dos entradas candidatas (misma implementación: `BRAIN.I`+N → relayout del genoma + ampliar `seedBrain`):

- **Cobertura/vegetación local** → emergería el **uso TÁCTICO del refugio**: huir HACIA la maleza al ser perseguido.
  Hoy el beneficio de la cobertura es POSICIONAL (te salva si estás en lush), no una decisión.
- **Dirección al congénere más cercano** → emergería **caza/movimiento coordinado en manada** (hoy las "manadas" son
  solo clustering por reproducción local, no coordinación; ver memoria `emergent-pack-clustering`).

**Coste:** moderado. Riesgo: más entradas = espacio de pesos mayor → la conducta tarda más en afinarse (ver
`carnivore-extinction-mutation`).

---

## Dibujado de vegetación: organismos tras el dosel (Fase 2)
*(pendiente; Fase 1 hecha 2026-06-10)*

**Fase 1 (hecha):** la vegetación se lee por contraste sobre el sustrato abisal casi negro; el plancton son chispas
pequeñas con glow y color, densidad por cantidad (lush = muchas). (`render/canvas.js`.)

**Fase 2 (pendiente):** vegetación translúcida dibujada DELANTE de los organismos en zonas densas → se *ve* que se
esconden (liga con el refugio). Enfoques: (A) velo de dosel (2º buffer sobre los agentes), (B) fundido del agente
según su cobertura, (C) ambas. Reinterpretar en clave abisal (velo de algas/partículas) — el `meadow` ya no existe.
El render NO toca la simulación (regla 3 de VISUAL.md).

---

## Apiñamiento de hermanos (render) — menor
*(pendiente)*

Varios nodos con el mismo `parent` y `emit` parecido se solapan al dibujarse. Posible reparto angular sutil entre
hermanos (solo render, no toca genética).

---

## LOD declarativo: desacoplar los umbrales de la lista de elementos visuales — arquitectura
*(pendiente, 2026-06-13)*

**Idea (del usuario):** los parámetros del LOD tienen **dependencia dura** con la lista de elementos visuales del
organismo (hoy: cuerpo, ojos, señuelo, onda, halo + por-nodo plano/contorno/textura). Cada elemento es un `lodX` suelto
en `config.js` con su gate cableado a mano. **Añadir un elemento visual nuevo obliga a tocar en VARIOS sitios** de forma
coordinada → frágil y fácil de desincronizar. De momento NO hace falta (la lista es estable y pequeña), pero puede
volverse necesaria.

**Hoy — dónde hay que tocar para meter UN elemento nuevo:** (1) `config.js` (nuevo umbral `lodX`); (2) `canvas.js
_drawAgents` (dispatch de tier / gate del halo); (3) `canvas.js _drawBodyGraph` (gate interno `doX = full || rPxG >
lodX·lm`); (4) `_bakeSprite` (REPLICAR ese gate para que el sprite cacheado coincida con el vivo — p. ej. `showEyes`); (5)
mantener el ORDEN coherente de la rampa (`lodBody ≤ lodFull ≤ lodEye ≤ lodWave ≤ lodLure`); (6) docs. Es fácil olvidar uno
— de hecho el punto (4) ya causó la costura vivo↔sprite que hubo que arreglar (señuelo que parpadeaba en el cruce).

**Vía a futuro (si se retoma):** una **tabla declarativa** de elementos visuales — cada entrada `{ nombre, umbral,
aplica(rPx, lm), dibuja(...) }` — y que el dispatch y el horneado del sprite ITEREN sobre ella en vez de tener gates a
mano repetidos. Añadir un elemento = una entrada (umbral + función de dibujo); el caché de sprites hereda el MISMO gate
automáticamente (sin replicar) → desaparece el riesgo de desincronización vivo↔sprite.

**Coste / cuándo:** refactor de render acotado, SIN cambio de comportamiento (puro de mantenibilidad). No urge ahora; se
vuelve rentable si se añaden varios elementos visuales más, o si reaparece la desincronización vivo↔sprite. Buen momento
para hacerlo: junto al **esqueleto** (sprites por nodo), que tocaría exactamente estos mismos gates.

---

## Variabilidad temporal del recurso (boom-bust) — DESCARTADA (probada 2026-06-11)
**Idea:** oscilar el rebrote (`R_regen`) en boom-bust para que la reserva (`eMax ∝ talla`) pague en los valles → eje r/K.
**Probado headless** (`cycleAmp=1`, periodo 4000, asexual): falla en los dos ejes.
- **No diversifica:** forage=0 → media de talla 0.24→0.07 (todos al mínimo); forage=3 → pierde el grupo bimodal y la
  dieta cae (dietH 0.55→0.20). `sizeStd` plano.
- **Mete desorden:** popSwing 0.72–0.94 — la población se desploma a 47–99 (de 1000) en cada valle, al borde de extinción.

**Por qué:** el boom-bust premia sobrevivir-con-poco + repoblar-rápido = el pequeño r-estratega; la reserva del grande no
compensa su coste alto y su cría lenta → REFUERZA el sesgo a pequeño. Revertido (código sin rastro). Lección en memoria
`boom-bust-no-diversifica-talla`. Si alguna vez se quisiera premiar el buffer: catástrofes RARAS impredecibles (no ciclos
regulares) y con red anti-extinción — otro mecanismo, especulativo.

---

## Pecera (ecosistema cerrado): nutriente ESPACIAL + viz del flujo de materia
*(pendiente, 2026-06-12 · extiende el ecosistema cerrado, SPEC §3ter)*

**Hoy:** en modo cerrado (`world.closedMatter`) el nutriente libre `N` es un ESCALAR global (un único número). Conserva
la materia y da techo endógeno, pero el reciclaje es instantáneamente global: un cadáver en una esquina fertiliza todo
el mundo por igual (vía `regen` que bebe del `N` global).

**Idea (la más jugosa del cerrado):** hacer `N` un CAMPO espacial (rejilla como `resource`/`carrion`) con DIFUSIÓN lenta
→ la materia mineralizada queda LOCAL un tiempo → **manchas fértiles donde muere algo** (un cadáver abona su zona; el
pasto rebrota antes cerca de la descomposición). Daría estructura espacial emergente (puntos calientes de nutriente,
frentes de descomposición) y un ciclo de nutrientes geográfico de verdad. Coste: +1 campo + una pasada de difusión
O(celdas)/tick (barato); reescribir `_regenClosed` para beber del `N` LOCAL de cada celda, y los retornos/mineralización
para depositar local. La conservación se mantiene (Σ del campo + lo demás = const).

**Acompañar con VIZ del flujo de materia** (el payoff contemplativo): hoy `N` solo se ve como número en la cabecera.
Pintar el campo de nutriente (neblina tenue de fertilidad sobre el sustrato) → se *ve* la materia fluir del cadáver al
pasto. Solo render (regla 3 de VISUAL).

**Relacionado (mismo modo):**
- **Carnívoros VIVOS en la pecera:** hoy el mundo cerrado magro solo sostiene CARROÑEROS; los cazadores de presa viva no
  emergen (exigen una productividad que satura el tope global). Un nutriente ESPACIAL con zonas ricas podría crear bolsas
  de alta densidad de presa donde la caza activa SÍ rinda → quizá emerjan cazadores localmente. A explorar al espacializar.
- **"Suelo metabólico" (decisión de modelo):** en cerrado el metabolismo topa `E` a 0 (no se gasta materia que no se
  tiene) → los de baja energía pagan algo menos que en abierto (descuento implícito). Alternativa igual de conservativa
  pero más dura: morir por FALLO metabólico si el coste supera a `E`. Revisar si distorsiona la ecología (medir).

---

## Mejoras de UI / bugs menores
*(2026-06-12 · de la bandeja)*

**(a) Leyenda "Rol" ponderada por totales — ✅ HECHA (2026-06-14).** La franja del modo *Colorear por → Rol* ya no son
bloques iguales: cada oficio ocupa un ancho PROPORCIONAL a su nº de individuos (mini-gráfica de composición trófica viva,
refrescada cada frame por `main.js`), con **4 oficios** (se añadió OMNÍVORO al unificar el criterio con la curva de
población vía `trophicRole`, en `organism.js` — antes el rol no tenía omnívoro). `controls.js updateLegend` lee los
conteos de `charts.hist*`; etiquetas recoloreadas con su conteo. El matiz "clave vs dato" se resolvió haciéndola ambas
cosas (clave de color + barra de composición). Solo render/UI. (`fallback` a bloques iguales si no hay población.)

**(b) Bug: salto de cámara al soltar UN dedo de la pinza (móvil).** ⬜ pendiente. Con dos dedos, soltar los dos a la vez
va bien; soltar uno → la cámara salta. Diagnóstico: en `controls.js` (handlers de puntero), al pasar de 2→1 punteros,
`endPointer` borra el levantado pero NO resetea `lastX/lastY` al que QUEDA → el siguiente `pointermove` calcula
`dx = clientX − lastX` con un `lastX` viejo → salto. Fix acotado: en `endPointer`, si queda exactamente 1 puntero tras
borrar, fijar `lastX/lastY` a su posición actual (delta 0 en el siguiente move). Bug claro, fix localizado.

**(c) Visor de especie (móvil).** ⬜ pendiente (de la bandeja). Añadir la DIETA al panel de especie en móvil; recordar
qué grupos `<details>` del genoma quedaron desplegados al cerrar/reabrir el inspector o al cambiar de especie (hoy se
reconstruye el panel y se cierran todos). Solo UI.

---

## Diversidad de talla bajo reproducción SEXUAL
*(pendiente · elevada de la bandeja 2026-06-14)*

**Problema (medido):** la repro solo-sexual APLANA la diversidad de talla — la mezcla grande×pequeño regresa los extremos
a la media (headless; memoria `sexual-repro-flattens-size`). La asexual la conserva, pero el default es sexual.

**Vía (si se retoma):** recuperar la diversidad sin volver a asexual → bajar `repro.speciesGenThreshold` (y/o
`mateRadius`) para que los grupos de talla ESPECIEN y dejen de cruzarse (así los extremos no se promedian). No probado;
**riesgo de Allee** si el umbral es muy bajo (no se encuentra pareja compatible → bajones de población). Nota colateral:
bajo sexual, `diet.omniPenalty` rinde mejor a ~0.05 (más diversidad de dieta) que a 0.15. Medir umbral vs estabilidad.

---

## Revisar señuelos (coste / atracción / visibilidad)
*(pendiente · elevada de la bandeja 2026-06-14)*

**Hoy:** la prominencia FUNCIONAL del señuelo = `o_len·o_bulb` (gateada por `orn`), cuesta `k_lure` y EXTIENDE el alcance
de captura (`combat.lureReach`). El nº de señuelos (`o_num`) es DECORATIVO: no cuesta ni añade alcance → a veces emergen
racimos enormes "gratis". El señuelo NO atrae presa (no existe esa mecánica) ni te hace más visible/cazable.

**Tres mini-ideas a decidir:**
- **Coste por cantidad:** que `o_num` (o la prominencia total) cueste energía → frena los racimos enormes. Lo más directo.
- **Atracción de presa:** que el señuelo sesgue el gradiente/targeting de la presa hacia el portador → emboscada emergente
  (anglerfish de verdad). Es una mecánica NUEVA, no solo un coste — medir que no rompa el equilibrio depredador-presa.
- **Visibilidad:** que exhibir señuelo aumente tu rango de detección por otros → trade-off honesto pro-reproducción
  (selección sexual, liga con `orn`) vs anti-depredación (te cazan antes).

**Coste/riesgo:** el coste por `o_num` es trivial; atracción/visibilidad son mecánicas nuevas (moderado).

---

## Cadáveres con FORMA (render)
*(pendiente · elevada de la bandeja 2026-06-14)*

Hoy la carroña (campo `carrion`) se dibuja como mancha gris en la celda. Idea: mostrar el CUERPO real del organismo
muerto en su sitio, grisáceo, deshaciéndose con el tiempo. **Vía:** marcadores de render EFÍMEROS — el worker manda las
muertes del frame (pos + nodos + causa) y el render dibuja el cuerpo desaturado que se desvanece; la carroña como CAMPO
sigue siendo la mecánica (sin coste en la simulación, regla 3 de VISUAL). Pedido por el usuario al hacer la Fase 1 de carroña.

---

## ¿"Reciclaje de cadáveres → pasto" (`corpseReturn`) es un leak de biomasa? — RESUELTO (analizado 2026-06-14)
**No es un bug.** `world.decayCarrion` se comporta distinto según el modo:
- **CERRADO (pecera, default):** `corpseReturn` se IGNORA — toda la carroña decaída MINERALIZA ÍNTEGRA al pool `N`
  (`this.N += d`) → la materia se conserva (medido ±0.05 %, memoria `closed-matter-conservation-measured`). Sin leak.
- **ABIERTO:** solo la fracción `corpseReturn·d` vuelve al pasto (topada a la capacidad de la celda); el resto se PIERDE.
  Es una pérdida REAL pero **intencional**: el modo abierto NO conserva por diseño (el sol crea biomasa y el cuerpo se
  conjura al morir, SPEC §3ter) → esa fuga equivale a respiración/calor. Subir `corpseReturn`→1 reciclaría todo el
  detrito, pero el abierto seguiría sin conservar por el resto del modelo.

Conclusión: comportamiento correcto; el "leak" solo existe en abierto y es coherente con su naturaleza no-conservativa.

---

## Bandeja de entrada (sin procesar)
*Ideas crudas del usuario, a analizar y convertir en ideas con su pitch cuando se aborden.*

*(Vacía — procesada el 2026-06-14. Reparto de lo que había: «diversidad de talla bajo sexual», «revisar señuelos» y
«cadáveres con forma» → ideas con pitch arriba; «gráfica de biomasa» → ya estaba HECHA (`_drawBiomass`); «¿reciclaje de
cadáveres = leak?» → RESUELTO (no es bug); «visor de especie» → Mejoras de UI (c); «revisar nado» → se solapa con «coste
de arrastre en locomoción».)*