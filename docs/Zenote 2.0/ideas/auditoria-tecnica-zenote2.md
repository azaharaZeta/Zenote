# Auditoría técnica — **(Zenote 2)**

> ## ⚠️ AUDITORÍA DEL MODELO PREVIO (fotosíntesis) — 2026-06-19
> El **2026-06-20 cambiaron los cimientos** (fotosíntesis-en-el-genoma → **solo animales + vegetación parametrizada**;
> ver [`MODELO-ACTUAL.md`](../MODELO-ACTUAL.md)). Esta auditoría se hizo el día ANTES, sobre el modelo de fotosíntesis.
> **Lo que sigue VIGENTE:** todo el eje de ingeniería (arquitectura en capas, motor en Web Worker, SoA + hash O(n),
> determinismo + checksum dorado, gate runner) y la resolución del backlog A1/M1–M5/B1–B6. Eso no lo tocó el cambio de
> cimientos. **Lo SUPERADO:** las menciones a fotosíntesis / `photoCap` / sensor de ∇luz / monedas "luz→fotosíntesis".
> **Auditoría fresca contra el código vivo:** [`auditoria-zenote2-2026-06-20.md`](auditoria-zenote2-2026-06-20.md).

> **Ámbito: ZENOTE 2** (la segunda app, `../../../zenote2/`), no la app v1 de esta carpeta. Auditoría de ingeniería
> (arquitectura · calidad · rendimiento · correctitud · tests) realizada el **2026-06-19** sobre la rama `biorefactor`
> (9 módulos / ~973 líneas de motor + 10 tests). Backlog de deuda y hallazgos para **procesar más adelante** —
> cada punto es accionable por separado. Hallazgos clave en memoria del proyecto: [[zenote2-audit-latent-findings]].
>
> Rutas de la tabla relativas a `../../../zenote2/src/`. Verificación empírica: suite corrida en verde + dos sondas
> read-only (saturación de pool → fuga de materia; mismo seed → estado byte-idéntico).

## Veredicto
Código **maduro, coherente y honesto** para su fase: arquitectura desacoplada (motor en Web Worker + render cliente),
perf medida (~1200 t/s headless), SoA + spatial hash O(n), comentarios ejemplares en la frontera genotipo→física, y
reducción real de parámetros (~45 vs 165). **No hay bugs que rompan la operación normal.** El riesgo concentrado es de
**proceso de validación**, no de diseño: la invariante que es el alma del proyecto (conservación materia+energía) tiene
una **fuga latente sin test** y un **test que debería cubrirla está roto sin que nadie lo note por falta de CI**.

## Estado (2026-06-19): A1 · M1 · M5 RESUELTOS ✅
Procesados en la rama `biorefactor` (el primer bloque de "Primeros pasos"):
- **A1 (fuga de conservación al saturar) — RESUELTO.** `sim.js` reserva el slot **antes** de cobrar: la reproducción
  sólo se compromete si `freeTop − (cunas ya en cola este tick) > 0`. Como `freeTop` sólo crece con las muertes
  posteriores del bucle, el guard garantiza que todo cobro nazca → materia+energía conservadas aun con el pool lleno.
  En régimen normal (pop ≪ cap) el guard nunca dispara → motor **byte-idéntico** (m6/m7 verdes sin cambios).
- **M1 (test M5.3 obsoleto) — RESUELTO.** `totalStored` en `test/m5-invariants.mjs` ahora incluye `gut + mass·eD`.
  Balance de energía/tick: residuo `1.68e+1 → 2.70e-4` (de FALLO a OK).
- **M5 (sin runner/CI) — RESUELTO.** `zenote2/test/run-all.mjs` ejecuta los 7 tests de correctitud como subprocesos y
  gatea por exit-code y marcadores `FALLO`/`✗`; `npm run test:zenote2`. (El `test` raíz sigue siendo el de la app v1.)
- **NUEVO test de saturación** `test/m5-saturation.mjs`: fuerza el pool lleno (cap 600, luz/nutriente altos) y verifica
  conservación. Regresión genuina: pre-fix materia −10.1% / residuo 28 (FALLO); post-fix conserva (exit 0).

Segunda tanda — limpiezas oportunistas (byte-idénticas salvo donde se indica):
- **M2 (doble develop por nacimiento) — RESUELTO.** `sim.js` desarrolla el cuerpo UNA vez en el gate (`develop`+
  `computePhenotype`) y lo pasa a `spawn(…, parts, ph)` vía `_setBody`; `born` lleva ahora 6 entradas/cría. Byte-idéntico
  (pop final M5.3 = 1225, igual que antes).
- **M3 (`trophicRole` con dos definiciones) — RESUELTO.** Única def en `phenotype.js`: `trophicCode(photoCap, thrust,
  mouthCap)` (0/1/2) + `trophicRole(ph)` string sobre ella. El worker la importa y cachea `thrust` en la SoA del Sim →
  inspector/render y tests/scorecard clasifican IGUAL. (Cambia el coloreado por rol del worker — el FIX; verificado en vivo.)
- **B1 (fórmula de distancia fenotípica duplicada) — RESUELTO.** `phenoDistance(...)` exportada de `phenotype.js`; la
  usan `sim._findMate` y `test/m7-speciation`.
- **B6 (guard muerto `serial[i] > maxSer`) — RESUELTO.** Retirado (queda `!alive`); `maxSer` eliminado.
- **M4 (parcial) — `config.js` huérfano BORRADO** + comentada la cota `hash.cell (60) ≥ max(mateRadius, alcance sensorial)`.
  Pendiente lo opcional de M4 (derivar la celda del alcance en código).

Tercera tanda — flecos de correctitud (CAMBIAN la dinámica) + regresión de determinismo:
- **B2 (gradiente de luz no toroidal) — RESUELTO.** El ∇luz del sensado usa vecinos TOROIDALES (antes clampaba en
  borde → banda de artefacto). `sim.js`.
- **B3 (entrada de hambre sin acotar) — RESUELTO.** `inp[6]` acotada a [-1,1] (consistencia con el resto de entradas).
- **NUEVO checksum dorado** `test/m8-determinism.mjs`: corre seed fijo 2× (determinismo) y ancla el estado a un valor
  DORADO (`0xa54c81ce`, motor post-A1/M1/M2/M3/B1/B2/B3/B6) → detecta deriva NO intencionada. En el runner (8º test).
  Cierra el hueco "sin test de regresión de determinismo" de la sección Tests.

Cuarta tanda — cierre del backlog:
- **M4-opcional (derivar `hash.cell`) — RESUELTO.** `sim.js`: celda = `Math.max(60, SIM_P.mateRadius)` (piso = alcance de
  sensado; mateRadius la eleva si lo supera → fin del fallo silencioso). Hoy 60 → byte-idéntico (dorado intacto).
- **B5 (seed reproducible en UI) — RESUELTO.** El worker acepta semilla opcional en `reset` (vacío → aleatoria) y la
  MISMA semilla alimenta mundo+población; devuelve la usada. Panel: campo «Semilla del mundo» + botón 🎲. `worker.js`,
  `main.js`, `index.html`, `styles.css`. Verificado: reset con seed fijo → mundo reproducible (vía mensaje directo al
  worker + dorado headless); el server sirve el `main.js` correcto. (La ruta de click en vivo en el PREVIEW quedó tapada
  por la caché del navegador del preview — `SimpleHTTP` sin `Cache-Control` —, no por el código.)

Pendiente único: **B7** (estilo ultradenso) — descartado a propósito (va contra el estilo deliberado del proyecto).
**Backlog técnico cerrado salvo B7.** La tabla siguiente se conserva íntegra como referencia histórica.

## Hallazgos priorizados

| # | Sev. | Hallazgo | Ubicación | Recomendación |
|---|---|---|---|---|
| **A1** | 🔴 Alto | **Fuga de conservación al saturar el pool.** Si `spawn()` devuelve -1 por `freeTop===0`, el progenitor YA pagó energía y `_takeNutrientAround` YA retiró nutriente del campo, pero no nace nadie → materia/energía desaparecen (el retorno de `spawn` se ignora). Medido: −38% de materia con el pool lleno; conserva con cap holgado. Latente (pop energía-limitada ~1160 ≪ cap 12000) pero alcanzable (cap menor, lab luz/photoEff al máximo). | `sim.js:201-211`, `sim.js:70` | Re-acreditar nutriente+energía si `spawn` falla (como hacía `test/m4-invariants.mjs:111`), o reservar el slot **antes** de cobrar. + test de saturación. |
| **M1** | 🟠 Medio | **Test M5.3 obsoleto = FALLO espurio.** `totalStored` omite el término `gut` (tripa, añadida en M6.2) → al correrlo hoy reporta "Balance de energía/tick FALLO ✗" (residuo ~16.8), contradiciendo al README. NO es bug del motor: m6/m7/m6_3 usan el contador correcto y pasan. | `test/m5-invariants.mjs:11` | Añadir `+ gut[i] + mass[i]*eD` al contador. |
| **M2** | 🟠 Medio | **Doble `develop()`+`computePhenotype()` por nacimiento** (uno en el *gate* de materia, otro en `spawn`→`_expr`): trabajo y asignación de arrays duplicados en ruta frecuente, en un proyecto "sin asignaciones en caliente". | `sim.js:199` + `sim.js:65` | Cachear el cuerpo del *gate* y pasarlo a `spawn`. |
| **M3** | 🟠 Medio | **`trophicRole` definido de dos formas** (con `thrust` vs solo `mouthCap×3`) → la UI/inspector clasifican el oficio distinto que los tests/scorecard. | `phenotype.js:52` vs `worker.js:37` | Una única función compartida. |
| **M4** | 🟠 Medio | **`hash.cell=60` hardcodeado**, acoplado a `mateRadius=50` y al barrido 3×3; `config.js` (cell=40) está huérfano. Si el alcance sensorial/de pareja supera 60, el barrido falla en silencio. | `sim.js:58`, `config.js:15` | Derivar la celda del alcance máx.; retirar `config.js` muerto. |
| **M5** | 🟠 Medio | **Sin runner ni CI.** `package.json` `"test"` apunta a `test/smoke.mjs` (la app **vieja**); los tests de zenote2 se corren a mano → los obsoletos (M1) pasan inadvertidos. | `../../package.json:7` | Runner agregado de `zenote2/test/*` + gate (pre-commit/CI). |
| **B1** | 🟡 Bajo | Fórmula de distancia fenotípica y constantes `/2 /40 /10` duplicadas sim↔test → riesgo de divergencia. | `sim.js:102`, `test/m7-speciation.mjs:21` | Exportar `phenoDistance`. |
| **B2** | 🟡 Bajo | Gradiente de luz **no toroidal** (clampa en bordes) en un mundo que envuelve → banda de artefacto fino en celdas de borde. | `sim.js:130-131` | Vecinos con módulo (toroidal). |
| **B3** | 🟡 Bajo | Entrada de "hambre" `inp[6]` sin acotar a [-1,1] (tanh lo absorbe). | `sim.js:151` | Clamp por consistencia. |
| **B4** | 🟡 Bajo | `WORLD_P.lightBase=0.06` engañoso (todos los llamadores pasan 2.5) → defaults que no reflejan operación. | `world.js:16` | Alinear defaults con el punto de operación. |
| **B5** | 🟡 Bajo | App en vivo **no reproducible** (`Math.random` para seeds) y sin control de seed en UI. (El motor headless SÍ es determinista — verificado.) | `worker.js:15-17` | Exponer un seed opcional en el panel. |
| **B6** | 🟡 Bajo | Guarda `serial[i] > maxSer` es **código muerto** (los nacimientos se difieren → nunca se dispara). | `sim.js:118,120` | Retirar o documentar como defensivo. |
| **B7** | 🟡 Bajo | Estilo ultradenso (múltiples sentencias/línea) dificulta *debug*/diff (compensado por comentarios). | `sim.js`, `genome.js` | Desplegar las líneas del bucle caliente. |

## Notas por eje

**Arquitectura** — limpia y en capas. Flujo: `genome.js` (reglas + cerebro RNN) → `develop()` (grafo → partes, válido por
construcción) → `phenotype.js` (forma→capacidades) → cache SoA → `sim.js step()` (transacciones sobre campos de `world.js`
+ vecindad de `hash.js`) → foto transferible → `main.js` (canvas 2D). Lazo único: reproducción → genoma nuevo. Dos monedas:

```
MATERIA (cerrada):  nutriente ⇄ organismo(masa) ⇄ detrito ──decompose──► nutriente
ENERGÍA (abierta):  LUZ ──fotosíntesis──► reservas/tripa ──metabolismo──► CALOR (sale)
```

**Calidad** — cohesión alta, acoplamiento bajo (salvo M4); comentarios sobresalientes; nombres consistentes; manejo de
errores casi inexistente (aceptable para el alcance, pero el `spawn()→-1` no comprobado es justo el origen de A1).

**Rendimiento** — estructuras correctas (typed arrays, hash O(n), escala lineal). Camino caliente por tick: barrido de
vecindad presa/amenaza + forward del cerebro + plasticidad Hebbiana (todo medido, dentro de presupuesto). El único
derroche concreto es M2 (doble desarrollo por nacimiento).

**Correctitud** — sin condiciones de carrera (motor mono-hilo, buffers transferidos). Determinismo verificado en headless.
Deriva f32 de materia ~1e-4% (ruido, ok). El problema real es A1 (fuga al saturar) y el sesgo de borde del gradiente (B2).

**Tests** — fuertes en las afirmaciones científicas (validez 120k, forma=función, invariantes m4/m5/m6, conducta vs
control aleatorio, especiación m7, scorecard). Huecos: ningún test ejercita la **saturación del pool** (donde vive A1);
M5.3 obsoleto (M1); sin runner/CI (M5); worker/render/`snapshot` sin tests headless; `recombine()`/`mutate()` sin unit
tests de casos límite; sin test de regresión de determinismo (checksum dorado).

## Primeros pasos sugeridos (cuando se procese)
1. ~~**A1 + M1** juntos~~ ✅ HECHO 2026-06-19 (slot reservado antes de cobrar + contador M5.3 con gut + test de saturación).
2. ~~**M5**: runner agregado con gate~~ ✅ HECHO 2026-06-19 (`run-all.mjs` + `npm run test:zenote2`).
3. ~~Limpiezas oportunistas: M2, M3/B1, M4 (`config.js` muerto), B6~~ ✅ HECHO 2026-06-19 (byte-idénticas; gate 7/7 verde).
4. ~~Flecos: B2 (gradiente toroidal), B3 (clamp `inp[6]`) + checksum dorado~~ ✅ HECHO 2026-06-19 (gate 8/8 verde; dorado `0xa54c81ce`).
5. ~~M4-opcional (`hash.cell`), B5 (seed en UI)~~ ✅ HECHO 2026-06-19 (gate 8/8 verde; dorado intacto). **Backlog técnico cerrado salvo B7 (estilo, descartado).** El trabajo pendiente de Zenote 2.0 es ya la pista de honestidad científica (D14/D16, ver auditoría biológica).
