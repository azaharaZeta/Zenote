# Índice de ideas

Enumeración de ideas del proyecto y su estado. **Cómo funciona:**

- Una idea **pendiente** vive aquí: pitch breve + el **análisis original** que se hizo al concebirla. Aquí NO se
  documentan avances ni análisis posteriores.
- Al decidir trabajarla → estado **en curso** y se crea su **ficha de trabajo** en `docs/ideas/<slug>.md`, donde van
  todos los análisis/decisiones/cambios/tests relevantes (sin sobredocumentar).
- Al terminar (**hecha**), descartar (**descartada**) o aparcar, su ficha se mueve a `docs/ideas/archivo/` (congelada)
  y aquí se marca el estado. La **mecánica** de lo implementado vive en `SPEC_EVOLUCION.md` (no se duplica aquí).

Otros docs: mecánica → `SPEC_EVOLUCION.md` · parámetros → `src/config.js` (comentado) · render → `VISUAL.md` ·
auditoría histórica → `AUDIT_EVOLUCION.md` · estado/foto → `ESTADO.md` · hitos → `CHANGELOG.md` ·
observaciones/lecciones de ecología → memoria del proyecto.

## Estado de las ideas

| Idea | Estado | Ficha / nota |
|---|---|---|
| Morfología evolutiva por nodos (Capas 1-3) | ✅ hecha | [archivo/morfologia-nodos-capas-1-3.md](archivo/morfologia-nodos-capas-1-3.md) · mecánica en SPEC §2bis/§3 |
| Cabeza ya no es el motor (`headThrust`) | ✅ hecha | [archivo/cabeza-no-motor.md](archivo/cabeza-no-motor.md) |
| Amplificar refugios móviles (`patchiness`) | ✅ hecha | default subido a 0.3 (knob de UI) |
| Giro físico (que use los segmentos) | 🔄 en curso | [giro-fisico.md](giro-fisico.md) — C hecho; B (par+inercia) y A (cerebro izq/der) pendientes |
| Selección de presa por talla | ⬜ pendiente | análisis abajo |
| Nuevas entradas sensoriales del cerebro | ⬜ pendiente | análisis abajo |
| Dibujado de vegetación: dosel (Fase 2) | ⬜ pendiente | análisis abajo (Fase 1 hecha) |
| Apiñamiento de hermanos (render) | ⬜ pendiente | nota abajo |
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

## Bandeja de entrada (sin procesar)
*Ideas crudas del usuario, a analizar y convertir en ideas con su pitch cuando se aborden.*

- **Tamaño de especies:** los herbívoros tienden siempre al tamaño mínimo; no surgen herbívoros grandes. Cazadores
  deberían restringir su caza a un rango min-max respecto de sí mismos (tenemos max `preyBandHi`; ¿tenemos min? →
  exponer **talla mínima cazable** en la UI).
- **Revisar nado:** ¿la "cabeza nadadora" todavía emerge? Cazadores desarrollan garras delanteras enormes que parecen
  sin coste y apenas extremidades para nadar, pero se mueven bien — revisar coste/balance.
- **Revisar señuelos:** a veces emergen racimos enormes de señuelos (¿debería costar más?); ¿el señuelo atrae presas?;
  ¿debería hacerte más visible (pro reproducción, pero también para ser cazado)?
- **Visor de especie:** en móvil añadir la dieta; recordar los menús desplegados al cerrar/reabrir o al cambiar de especie.
