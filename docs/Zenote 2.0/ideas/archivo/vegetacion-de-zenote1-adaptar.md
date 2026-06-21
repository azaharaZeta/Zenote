# Adaptar la vegetación de zenote1 a zenote2 — análisis

> **ESTADO: Tier 1 + Tier 2 IMPLEMENTADOS (2026-06-20).**
> - **Tier 1**: (A) parches migrantes (`patchiness` en `world.vegStep`) + (B) pulido visual (teal + realce `^0.45` en `bakeVeg`).
> - **Tier 2**: (C) **reserva de rebrote** (`grazeRefuge`=0.06, anti-sobrepastoreo) + (D) **forrajeo por área∝talla** (`forageReach`=3,
>   radio efectivo ∝ mass/forageMassRef) en el bloque de pastoreo de `sim.js`. Medido (calibración multi-valor): el combo da pop
>   sana (~940), **máxima diversidad de talla** (SD 1.47→1.90 → nicho herbívoro morfológico) y vegetación sostenible (sin sobrepastoreo).
>   Visto: grandes pastadores junto a pequeños + patrones de pastoreo en la veg. Conserva (gate 8/8, dorado `0x29e1fea5`).
> - **Fix corriente (2026-06-20):** la "Corriente del abismo" no movía la veg visiblemente porque la veg estaba desacoplada de
>   la luz (zonas frondosas por autocatálisis, no por luz). Arreglado: **productividad vegetal ∝ luz** en `vegStep` → las zonas
>   frondosas SIGUEN a la luz (corr veg↔luz 0.79) → la corriente las MUEVE. Default `lightFlow` 0.00012→0.0004. Dorado `0x5a8fb59e`.
> - **Pendiente (fichas propias):** Tier 3 cobertura → [[cobertura-vegetal-refugio]]. Micro-flora/plancton → [[micro-flora-plancton]].

**Petición:** zenote1 tenía la vegetación muy lograda (visual y funcional). ¿Qué se puede replicar/adaptar en zenote2 que tenga
sentido y NO rompa los objetivos de zenote2 (conservación, emergencia, vegetación PARAMETRIZADA —no genética—, contemplativo)?

## Cómo era la vegetación en zenote1 (qué la hacía buena)
**Funcional** (`src/engine/world.js regen()`, `sim.js`, `config.js resource`):
1. **Campo de capacidad** fijo (perlin) → parches ricos/pobres con suelo `capFloor` (ningún baldío permanente).
2. **Rebrote con PARCHES MIGRANTES** (`patchiness`): mezcla rebrote lineal + **logístico con difusión de semilla** al vecindario
   (`logGrow = dr·(seedFloor + r/c + meanNb/c)`). Los parches EMERGEN y MIGRAN del baile pastoreo↔rebrote. `seedFloor` evita el
   estado absorbente (todo a cero). Conserva (el pasto crece consumiendo nutriente N local).
3. **`grazeRefuge`**: una fracción del pasto de cada celda es INTOCABLE → evita el sobrepastoreo letal (la base no se pela a cero).
4. **`forageReach` + `k_graze`/`k_grazeWide`**: un cuerpo grande/ancho pasta de un ÁREA (∝ talla) → **payoff de talla/forma para el
   herbívoro** (nicho herbívoro con estructura morfológica, no solo "boca").
5. **Cobertura / refugio**: la presa escapa al depredador con prob ∝ vegetación viva local → la veg da COBERTURA (estabilizador
   Lotka-Volterra: amortigua el ciclo depredador-presa, protege la base herbívora).

**Visual** (`src/render/canvas.js`, `config.render`):
- Sustrato teal (`vegColor [10,64,70]`) sobre abismo casi negro; **realce del pasto tenue** (LUT food^exp con exponente bajo →
  hasta el pasto ralo brilla), **blur** que disuelve la rejilla de celda, **micro-flora** (motas de plancton, `grassDensity`),
  recompuesto cada pocos frames → **"vegetación fluida"**. Sliders en vivo: brillo, realce, suavizado.

## Qué tiene zenote2 HOY
Campo `veg` con crecimiento logístico hacia K∝luz, `vegSeed`, senescencia, difusión aparte. Pastoreo = `grazeRate·mouthCap`
(sin refugio de rebrote, sin payoff de talla, sin cobertura). Render: campo verde plano horneado por frame (sqrt), sin motas
ni blur ni realce. → funcional y visualmente MÁS POBRE que zenote1.

## Qué adaptar (todo encaja con los objetivos de zenote2)
Nada de esto requiere genética en la vegetación ni cablear conducta animal (la veg sigue siendo física del mundo; los animales
deciden por cerebro). Todo es conservativo (materia/energía siguen cuadrando).

**Tier 1 — el corazón de lo que gustaba (visual + sensación "viva"):**
- **A. Parches migrantes** (`patchiness`: plegar el término de difusión-de-semilla del vecindario en el crecimiento de `vegStep`,
  como zenote1). La vegetación formaría y MIGRARÍA parches orgánicos con el pastoreo → los animales persiguen comida móvil
  (más dinámica espacial) y se VE vivo. Conservativo. **Recomendado primero.**
- **B. Pulido visual**: paleta teal + realce del pasto tenue (LUT/exponente) + blur del sustrato + micro-flora opcional → el look
  contemplativo "fluido". Solo render, sin riesgo de sim. **Recomendado primero.**

**Tier 2 — riqueza funcional (emergente):**
- **C. `grazeRefuge`** (fracción de rebrote protegida): evita el sobrepastoreo letal → estabiliza la base herbívora (ataca el
  boom-bust). Parámetro limpio.
- **D. Forrajeo por ÁREA ∝ talla** (`forageReach`): el herbívoro grande pasta de un área → payoff morfológico para el pastador →
  más diversidad emergente en el nicho herbívoro. (Hoy el pastoreo es solo ∝ boca; se mezclaría: área ∝ talla, ritmo ∝ boca.)

**Tier 3 — estabilizador ecológico (con cuidado de mantenerlo físico):**
- **E. Cobertura/refugio** (la presa escapa ∝ vegetación viva local): regla FÍSICA de captura (no un gen "esconderse"), amortigua
  el ciclo depredador-presa. Encaja, pero añade un modificador a la depredación → medir que no anule a los carnívoros.

## Qué NO traer (rompería objetivos)
- **Genética en la vegetación** → es el Escenario 2 ([[vegetacion-con-genetica]]), aparte.
- El modelo energético de zenote1 si no respeta la separación energía-abierta/materia-cerrada de zenote2 → al adaptar pastoreo/
  forrajeo, mantener el libro mayor de zenote2 (energía de veg = `veg·vegEcoef`, capturada de la luz).
- Cualquier estrategia animal cableada (esconderse/pastar por if/else) → la conducta sigue emergiendo del cerebro.

## Recomendación
Empezar por **Tier 1 (A parches migrantes + B pulido visual)** — es justo lo que se echaba en falta (lo vivo y lo bonito),
conservativo y de bajo riesgo. Luego **Tier 2 (C+D)** para la riqueza del nicho herbívoro. **Tier 3 (E)** opcional, midiendo el
balance trófico. Medir cada uno multi-seed (la vegetación afecta toda la economía).
