# Zenote 2 — segunda aplicación (modelo desde primeros principios)

Segunda app que implementa el modelo rediseñado en [`../docs/refactor/02-Redesign/`](../docs/refactor/02-Redesign/)
(2.1-2.6). **La app actual (`../src/`) NO se toca** — queda de baseline medido. La promoción (si algún día sustituye
a la actual) es una decisión futura y separada.

Convenciones heredadas de la app actual: vanilla JS (ES modules), SoA + typed arrays, spatial hash O(n), Web Worker
(cuando entre el render), motor ejecutable headless en Node. RNG mulberry32 determinista.

## Estado: M0 — Andamio + baseline ✅ CERRADO

Construcción **headless-first, guiada por riesgo** (roadmap → [`2.6`](../docs/refactor/02-Redesign/2.6-reconstruction-roadmap.md)).

- [x] **Andamio de plataforma** (SoA + pool, spatial hash toroidal, bucle de tick). **SIN biología** (los agentes
  hacen marcha aleatoria + escaneo de vecindad que ejercita el hash). Solo prueba que la plataforma escala.
  - `src/engine/state.js` · `src/engine/hash.js` · `src/engine/sim.js` · `src/engine/config.js` · `src/util/rng.js`
- [x] **Perfil + determinismo** (andamio; `perf.mjs`/`state.js`/scaffold `sim.js` retirados al llegar el motor real M4-M5):
  - Medido (motor solo, sin render): 1k ag ≈ 0.18 ms/tick · 3k ≈ 0.9 ms · 5k ≈ 2.0 ms · 10k ≈ 7.4 ms.
  - Presupuesto a 20 t/s = 50 ms/tick → **holgura amplia hasta 10k agentes** (go-criterion de perf de M0 ✓).
  - Determinismo (mismo seed → checksum idéntico) ✓.
- [x] **Baseline scorecard sobre la app actual** (`test/baseline-current.mjs`) → [`baseline-scorecard.md`](baseline-scorecard.md).
  - Hallazgo: la coexistencia trófica del baseline es **FRÁGIL** (cadena plena ~3/8 seeds; **cazador ápice
    extinción-propenso**). App actual = **165 params (136 sim + 29 render)**, 441–823 t/s headless.
  - → el **listón a batir en M2 es modesto**: igualar esa coexistencia con ~0 diales de balance ya valida la tesis.

> Nota de honestidad: M0 solo retira **parte** de R2 (el sustrato base no es el cuello). Los mecanismos caros
> (plasticidad por tick, recombinación, productores-agente) se estresan en el **spike M1**, no aquí.

## M2 — Spike de coexistencia emergente (la puerta R1) ✅ **GO**

`spikes/m2-coexistence/` → [`RESULT.md`](spikes/m2-coexistence/RESULT.md). Reproducir:
`node zenote2/spikes/m2-coexistence/run.mjs 8000 1,2,3 1000,1500,2000,2500`

- La coexistencia depredador-presa **EMERGE** de **refugio espacial (tamaño de mundo, Huffaker)** + **tripa/saciedad
  (respuesta funcional)**, **sin** los 5 diales cableados (`handlingTime`/`failDamage`/`fleeCap`/`refuge`/`preyBand`).
- gut+cover: **3/3 seeds a 20k ticks** (size≥2000) → **iguala/supera el baseline (~3/8) con CERO diales de balance**.
- Caveats: oscilatoria (CV 0.5-0.8), necesita mundo ≥1500-2000, conducta aún codificada a mano (evolucionada = M6).
- **R1 retirado (GO); el kill-criterion mayor no se dispara.**

## M1 — Spike de coste en tiempo real (R2) ✅ **GO**

`spikes/m1-cost/` → [`RESULT.md`](spikes/m1-cost/RESULT.md). Reproducir: `node zenote2/spikes/m1-cost/run.mjs 400`

- Cerebro por tick + **plasticidad Hebbiana** + ocupación + productores-agente, a escala (5k ag), **caben**: peor
  caso 13 ms/tick (76 t/s, 3.8× el objetivo de 20); realista 2.6–8 ms (122–391 t/s). Memoria ≤21 MB.
- La plasticidad (la pieza temida) añade solo ~30-60% sobre el forward → **cabe sin degradar a los fallbacks**.
- **R2 retirado (GO).** Motor en Web Worker → presupuesto independiente del render.

## M3 — Spike de convergencia del genoma (R3) ✅ **GO**

`spikes/m3-genome/` → [`RESULT.md`](spikes/m3-genome/RESULT.md). Reproducir: `node zenote2/spikes/m3-genome/evolve.mjs 200 1`

- El genoma generativo (grafo recursivo de 2.2) **converge** (fiable al mismo óptimo en 4/4 seeds, NO deriva al caos)
  y **gana 1.7-1.9×** a la codificación directa (slots fijos + paramétrica).
- **Cruza valles SIN sembrar:** en 4/4 emergen cadenas recursivas (gusano) + pares simétricos (apéndices) — las
  formas que la app actual debe SEMBRAR (D1). **0 cuerpos inválidos en 160k desarrollos** (validez por construcción).
- **R3 retirado (GO).**

## De-risking COMPLETO
Los tres riesgos retirados: **M2 (R1)·M1 (R2)·M3 (R3) = GO**. Ningún kill-criterion se dispara.

## M4 — Leyes del mundo (Capa A, 2.1) ✅ KEEPER

Primer código que se queda: `src/engine/world.js` (la base física del motor). Dos monedas independientes —**materia
cerrada** (nutriente↔organismo↔detrito) + **energía abierta** (luz→reservas→calor)— campos en rejilla (luz
heterogénea + día/noche + sombra, nutriente, detrito, ocupación), difusión y descomposición conservativas.
Validación: `node zenote2/test/m4-invariants.mjs` (agentes-sonda codificados a mano ejercitan todas las transacciones).

- **Invariantes de 2.1 §8 — TODOS pasan:** (1) materia conservada (deriva ~1e-4% = ruido f32) · (2) balance de
  energía por tick (Δalmacenada = capturada − calor) · (3) calor monótono · (4) **NO móvil perpetuo** (luz=0 →
  energía→0, todos mueren, materia sigue conservada — el test decisivo que distingue del modelo viejo).
- La sonda no está tuneada para prosperar (declina a la capacidad de carga limitada por energía — correcto; la
  ecología viva es M5/M6). Es scaffolding: M5 reemplaza la sonda por el organismo real (genoma/desarrollo).

## M5 — Cuerpo, desarrollo, forma=función (sobre M4) · en curso ([plan](M5-PLAN.md))

Keepers: `src/engine/genome.js` (genoma de reglas + `develop` + mutación) · `src/engine/phenotype.js` (forma=función) ·
`src/engine/sim.js` (sim integrado, reemplaza la sonda M4).

- [x] **M5.1** desarrollo (`test/m5-develop.mjs`): **0 inválidos en 120k desarrollos** (validez por construcción); cadenas/pares/4 tejidos emergen sin sembrar.
- [x] **M5.2** forma=función (`test/m5-formfunction.mjs`): 10/10 asserts; eje autótrofo↔heterótrofo + trade-off del generalista (mediocre) emergen **sin `omniPenalty`**.
- [x] **M5.3** sim integrado (`test/m5-invariants.mjs`): **los 4 invariantes de 2.1 §8 SIGUEN pasando** con el organismo real; mundo VIVO (pop ~1160 estable, energía-limitada); 6300 t/s. Repro asexual + mutación → la morfología puede evolucionar.
- [x] **M5.4** evolución morfológica (`test/m5-evolution.mjs`): sin sembrar, photoCap 35→44, diversidad 0→±23, partes 3→4.3, heterótrofos 0→7% (3 seeds). La FORMA evoluciona (divergencia trófica plena = M6).
- [x] **M5.5** render (R6) — `index.html` + `src/main.js` (Canvas 2D, cenote oscuro, organismos por grafo de partes coloreados por tejido). Servidor: launch.json `zenote2` (puerto 8732). Legible y calmado; pulido (glow/ondulación) = pasada posterior.
- [ ] **M5.6** Web Worker (motor en hilo aparte) — *aplazable; el render va fluido en síncrono*.

## M6 — Fisiología + conducta · en curso

- [x] **M6.1** energía-en-biomasa (2.3) — **MEDIDO y dejado OFF** (`eDensity=0` por defecto, parametrizado). El ledger
  con energía embebida conserva (invariantes ✓ a eD=4) PERO es net-negativo aquí (penaliza cuerpos grandes y la presa
  no es magra → no compensa). Resultado nulo honesto: el limitante de la heterotrofía es la CONDUCTA (M6.3), no la energía.
  `test/m6-invariants.mjs`.
- [x] **M6.3** controlador neuronal (RNN, pesos=genes) + plasticidad Hebbiana + **seedBrain** (`test/m6_3-behavior.mjs`).
  La máquina (cerebro = único motor de conducta, Baldwin) reemplaza la conducta placeholder; invariantes ✓.
  **Hallazgo medido:** desde cerebros EN BLANCO la competencia NO arrancaba (caza ≈ aleatorio) → desafió el supuesto de
  2.3 ("plasticidad reemplaza seedBrain"). **Fix (decisión del usuario): seedBrain** = arranque competente (ir a presa/luz,
  huir, atacar en contacto), la conducta sigue evolucionando/aprendiendo desde ahí. **Resultado: conducta ADAPTATIVA
  emerge — caza ~3× más que el control aleatorio.** Caveat honesto: re-introduce siembra de CONDUCTA (no de morfología:
  el viejo sembraba ambas; el nuevo solo el cerebro — forma/nichos/especies siguen emergiendo sin sembrar).
- [x] **M6.2** tripa/saciedad (`sim.js`): energía en tránsito; comer llena (tope ∝ masa) → SACIEDAD (respuesta
  funcional, recorta caza ~50% mecánicamente); digiere a reservas. Conserva (invariantes ✓). Payoff pleno espera a la conducta.
- [~] **M6.4** sensado coste/ruido — **DIFERIDO** (payoff nulo con conducta débil; lección de M6.1: no añadir complejidad sin beneficio medible).
- [x] **M6.5** scorecard modelo nuevo vs baseline (`test/m6_5-scorecard.mjs`): ver veredicto abajo.

## M6.5 — Scorecard (modelo nuevo vs baseline) · estado honesto

| | Modelo NUEVO (Zenote 2) | Baseline (Zenote v1) |
|---|---|---|
| Parámetros | **45 constantes físicas (~0 diales de balance)** | 165 (136 sim + 29 render) |
| Conservación | materia **+ energía** (termodinámica) | solo materia |
| Evolución morfológica | emerge sin sembrar (photoCap σ23, partes 5±4) | sembrada |
| Riqueza trófica | **56% autótrofo / 44% heterótrofo — red trófica EMERGENTE y estable** (a 30k, con seedBrain) | cadena ~3/8 seeds (cazador frágil) |
| Especiación | **emergente** (~32, por divergencia morfológica) | métrica curada a mano (D14) |
| Perf headless | ~1200 t/s | 441-823 t/s |

**Veredicto (≈ M8):** el modelo nuevo **gana en parámetros (~3.5×), limpieza, conservación termodinámica, evolución
morfológica y especiación emergente** — y, tras el seedBrain, **alcanza la paridad+ en riqueza trófica** (red
autótrofo↔heterótrofo emergente y estable, conducta competente, vs la cadena frágil ~3/8 del viejo). Caveat: la
conducta usa seedBrain (como el viejo), pero el nuevo **solo siembra el cerebro**; la morfología, los nichos y las
especies siguen emergiendo sin sembrar.

## M7 — Bucle evolutivo (recombinación homóloga + especiación emergente) ✅ **GO**

`test/m7-speciation.mjs`. Recombinación por marcas de homología → **0 cuerpos inválidos** (preserva validez de 2.2);
**75-80% de nacimientos sexuales**; **~32 especies emergentes** por divergencia morfológica (sin métrica curada →
**ataca D14**); invariantes ✓. El genoma-de-reglas se recombina y especia sin romperse.

## Estado: modelo nuevo ESTRUCTURALMENTE COMPLETO

Cadena completa de punta a punta, toda desde primeros principios, conservando materia+energía: leyes del mundo (M4)
→ organismo generativo + desarrollo + forma=función (M5) → fisiología/tripa (M6.2) + cerebro neuronal (M6.3) +
recombinación/especiación (M7) → render (M5.5). **~45 params (vs 165), >1000 t/s.**

Con el **seedBrain** (M6.3), la conducta es competente y **la red trófica emerge** (44% heterótrofos, estable a 30k):
el último gap está cerrado. El modelo nuevo es **estructuralmente superior y ecológicamente a la par+**.

## Próximos hitos
El cruce **M8** está esencialmente alcanzado (ver scorecard). Pendiente menor/pulido: **M5.6** (Web Worker, aplazable) ·
**R6** (pulido visual del render: glow/ondulación) · afinar el balance trófico (mundo/luz) si se quiere más biomasa ·
revisitar plasticidad/sensado (M6.4) como mejoras. El bloque de reconstrucción (M0-M8) está, en lo esencial, **completo**.
