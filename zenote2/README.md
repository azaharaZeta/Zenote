# Zenote 2 — segunda aplicación (modelo desde primeros principios)

Segunda app que implementa el modelo rediseñado en [`../docs/refactor/02-Redesign/`](../docs/refactor/02-Redesign/)
(2.1-2.6). **La app actual (`../src/`) NO se toca** — queda de baseline medido. La promoción (si algún día sustituye
a la actual) es una decisión futura y separada.

Convenciones heredadas de la app actual: vanilla JS (ES modules), SoA + typed arrays, spatial hash O(n), Web Worker
(cuando entre el render), motor ejecutable headless en Node. RNG mulberry32 determinista.

## Estado: M0 — Andamio + baseline (en curso)

Construcción **headless-first, guiada por riesgo** (roadmap → [`2.6`](../docs/refactor/02-Redesign/2.6-reconstruction-roadmap.md)).

- [x] **Andamio de plataforma** (SoA + pool, spatial hash toroidal, bucle de tick). **SIN biología** (los agentes
  hacen marcha aleatoria + escaneo de vecindad que ejercita el hash). Solo prueba que la plataforma escala.
  - `src/engine/state.js` · `src/engine/hash.js` · `src/engine/sim.js` · `src/engine/config.js` · `src/util/rng.js`
- [x] **Perfil + determinismo** (`test/perf.mjs`): `node test/perf.mjs`.
  - Medido (motor solo, sin render): 1k ag ≈ 0.18 ms/tick · 3k ≈ 0.9 ms · 5k ≈ 2.0 ms · 10k ≈ 7.4 ms.
  - Presupuesto a 20 t/s = 50 ms/tick → **holgura amplia hasta 10k agentes** (go-criterion de perf de M0 ✓).
  - Determinismo (mismo seed → checksum idéntico) ✓.
- [ ] **Baseline scorecard sobre la app actual** (`../src/`): correr el emergence scorecard de 2.6 §4 headless para
  fijar los números a batir. *(pendiente — siguiente sub-paso de M0)*

> Nota de honestidad: M0 solo retira **parte** de R2 (el sustrato base no es el cuello). Los mecanismos caros
> (plasticidad por tick, recombinación, productores-agente) se estresan en el **spike M1**, no aquí.

## Próximos hitos (de-risk antes de construir)
- **M1** spike de coste (R2) · **M2** spike de coexistencia emergente (R1, la puerta) · **M3** spike de convergencia
  del genoma (R3) → luego M4 leyes → M5 cuerpo+render → M6 fisiología+conducta → M7 bucle → M8 cruce vs baseline.
