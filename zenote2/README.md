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
- [x] **Perfil + determinismo** (`test/perf.mjs`): `node test/perf.mjs`.
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

## De-risking COMPLETO → construir la pila
Los tres riesgos retirados: **M2 (R1)·M1 (R2)·M3 (R3) = GO**. Ningún kill-criterion se dispara. Siguiente:
**M4** leyes del mundo (2.1, con invariantes §8) → **M5** cuerpo+desarrollo+render → **M6** fisiología+conducta →
**M7** bucle evolutivo → **M8** cruce vs baseline.
