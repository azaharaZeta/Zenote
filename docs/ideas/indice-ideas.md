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

## Bandeja de entrada (sin procesar)
*Ideas crudas del usuario, a analizar y convertir en ideas con su pitch cuando se aborden.*

- **Diversidad de talla bajo reproducción SEXUAL:** la repro solo-sexual APLANA la diversidad de talla (la mezcla
  grande×pequeño regresa los extremos a la media; medido headless — memoria `sexual-repro-flattens-size`). Para
  recuperarla sin volver a asexual: bajar `repro.speciesGenThreshold` (y/o `mateRadius`) para que los grupos de talla
  ESPECIEN y dejen de cruzarse. No probado; riesgo de Allee si el umbral es muy bajo (no se encuentra pareja → bajones).
  Bajo sexual, además, `omniPenalty` rinde mejor a 0.05 (más diversidad de dieta) que a 0.15.

- **Tamaño de especies:** RESUELTO (2026-06-11). "Los herbívoros siempre al tamaño mínimo" era ESTRUCTURAL: el pasto
  no escalaba con la talla pero la cría sí (`reproRef ∝ sizeMass`) → deriva al mínimo. Lo arregla el **forrajeo por
  talla** (`resource.forageReach`: el grande pasta de un área) → ahora emergen grandes + diversidad (ver
  `archivo/forrajeo-por-talla.md` + SPEC §3.1). La banda de caza min-max también quedó completa (`combat.preyBandLo`/`preyBandHi`).
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
