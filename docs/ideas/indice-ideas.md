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
| Que la velocidad IMPORTE (escape por velocidad) | ✅ hecha | `combat.fleeSpeed=2` + `refuge.strength`↓ · mecánica SPEC §3.1 · memoria `speed-is-a-race-quantity` |
| Cazar viable en escasez (biomasa de la presa) | ✅ hecha | `energy.carcassValue` · SPEC §3.1 · memoria `lean-prey-starves-predators` |
| Carroña + GUSANO carroñero (Fases 1-2) | ✅ hecha | campo `carrion` + gen `scav` (caza↔carroña) + proto-gusano sembrado · SPEC §3bis · memoria `morphology-valley-needs-seeding` · pdte: cadáveres con forma (abajo) |
| Giro físico (que use los segmentos) | 🔄 en curso | [giro-fisico.md](giro-fisico.md) — C hecho; B (par+inercia) y A (cerebro izq/der) pendientes |
| Coste de arrastre en locomoción | ⬜ pendiente | análisis abajo — complementa A (`k_haul`, ya hecho) |
| Selección de presa por talla | ⬜ pendiente | análisis abajo |
| Nuevas entradas sensoriales del cerebro | ⬜ pendiente | análisis abajo |
| Dibujado de vegetación: dosel (Fase 2) | ⬜ pendiente | análisis abajo (Fase 1 hecha) |
| Apiñamiento de hermanos (render) | ⬜ pendiente | nota abajo |
| Pecera: nutriente ESPACIAL + viz de la materia | ⬜ pendiente | análisis abajo — extiende el ecosistema cerrado (SPEC §3ter) |
| Mejoras de UI / bugs menores | ⬜ pendiente | análisis abajo (leyenda Rol ponderada · salto de cámara al soltar pinza) |
| Variabilidad temporal del recurso (boom-bust) | ❌ descartada (probada) | nota abajo — no diversifica, mete desorden |
| Bandeja de entrada (sin procesar) | 📥 | abajo |

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

**Relación:** complementa A; juntos cubren "más grande / más apéndices / más arrastre = más gasto al moverse". Liga con
la bandeja *"Revisar nado"* (garras frontales que nadaban sin coste aparente).

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
*(pendiente, 2026-06-12 · de la bandeja)*

**(a) Leyenda "Rol" ponderada por totales.** Hoy la franja del modo *Colorear por → Rol* muestra 3 bloques IGUALES
(33/33/33 %) como clave de color. Idea: anchos PROPORCIONALES a los conteos vivos de herbívoros/carroñeros/cazadores →
de un vistazo se ve la composición trófica. El worker ya manda `role` por agente (mismo conteo que la gráfica de
población), así que `controls.js` (`updateLegend`) puede leer `simProxy.role` y dimensionar los bloques; habría que
refrescarla periódicamente (hoy se construye una vez al cambiar de modo). Solo render/UI. **Matiz:** una leyenda es una
CLAVE (qué significa cada color), no un dato; ponderarla la vuelve mini-barra apilada de composición. Alternativa más
limpia: mantener la clave + añadir una barra de proporción fina aparte. Decidir cuál.

**(b) Bug: salto de cámara al soltar UN dedo de la pinza (móvil).** Con dos dedos, soltar los dos a la vez va bien;
soltar uno → la cámara salta. Diagnóstico: en `controls.js` (handlers de puntero), al pasar de 2→1 punteros, `endPointer`
borra el levantado pero NO resetea `lastX/lastY` al que QUEDA → el siguiente `pointermove` calcula `dx = clientX − lastX`
con un `lastX` viejo → salto. Fix acotado: en `endPointer`, si queda exactamente 1 puntero tras borrar, fijar
`lastX/lastY` a su posición actual (delta 0 en el siguiente move). Bug claro, fix localizado.

---

## Bandeja de entrada (sin procesar)
*Ideas crudas del usuario, a analizar y convertir en ideas con su pitch cuando se aborden.*

- **Diversidad de talla bajo reproducción SEXUAL:** la repro solo-sexual APLANA la diversidad de talla (la mezcla
  grande×pequeño regresa los extremos a la media; medido headless — memoria `sexual-repro-flattens-size`). Para
  recuperarla sin volver a asexual: bajar `repro.speciesGenThreshold` (y/o `mateRadius`) para que los grupos de talla
  ESPECIEN y dejen de cruzarse. No probado; riesgo de Allee si el umbral es muy bajo (no se encuentra pareja → bajones).
  Bajo sexual, además, `omniPenalty` rinde mejor a 0.05 (más diversidad de dieta) que a 0.15.

- **Revisar nado:** ¿la "cabeza nadadora" todavía emerge? Cazadores con garras delanteras enormes que parecían sin
  coste y apenas propulsores. Atacado en parte: `headThrust`→0.06 (la cabeza no es motor) + (A) coste de transporte ∝
  masa (garras grandes = más masa = más coste de nado). El remate fino es la idea "coste de arrastre" (arriba).
- **Revisar señuelos:** a veces emergen racimos enormes de señuelos (¿debería costar más?); ¿el señuelo atrae presas?;
  ¿debería hacerte más visible (pro reproducción, pero también para ser cazado)?
- **Visor de especie:** en móvil añadir la dieta; recordar los menús desplegados al cerrar/reabrir o al cambiar de especie.
- **Cadáveres con FORMA (render):** hoy la carroña (Fase 1) se dibuja como mancha gris en la celda. Mostrar el cuerpo
  real del organismo muerto en su sitio, grisáceo, deshaciéndose con el tiempo. Vía: marcadores de render efímeros
  (el worker manda las muertes del frame con pos+nodos+causa; el render dibuja el cuerpo desaturado que se desvanece),
  sin coste en la simulación (la carroña como CAMPO sigue siendo la mecánica). Pedido por el usuario al hacer la Fase 1.
