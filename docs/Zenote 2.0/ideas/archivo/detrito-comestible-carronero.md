# Detrito comestible → nicho carroñero/descomponedor emergente (#4)

**Estado: IMPLEMENTADA (2026-06-20).** Hermana de [cadáveres con forma](cadaveres-con-forma.md) (#3).

## Petición
Que los cadáveres (detritusM/E) sean ingeribles → que emerja un nicho de CARROÑERO/descomponedor,
no solo herbívoro/cazador. Decisión del usuario: versión completa, **con sensor de detrito en el cerebro**.

## Qué se implementó
1. **Ingesta de carroña (conserva).** El MISMO gesto de "abrir boca" (`attack`, salida 3 del cerebro) que come presa
   viva rebaña también el `detritusE` (energía residual de las muertes) de la celda → tripa. Mueve energía DENTRO del
   sistema (detritusE → tripa → reservas → calor); no crea ni destruye → invariantes intactos (m6 ✓). `SIM_P.scavRate`
   (palanca de UI "Carroñeo", default 0.5). **Sin estrategia cableada**: la misma boca come presa o carroña → el oficio
   carroñero EMERGE del reparto morfología+cerebro.
2. **Sensor de ∇detrito en el cerebro** (`BRAIN.I` 8→10, entradas 8,9 = gradiente de detritusE; reusa las celdas vecinas
   del ∇luz). Sembrado en el seedBrain como relé débil "acércate a la carroña" (igual que presa/luz) → la conducta
   carroñera puede evolucionar/aprender a rastrear carroña.
3. **`eDensity` 0→4** (NO UI). **Hallazgo de fondo, matemático, no ajustable:** con conservación estricta, la ÚNICA forma
   de que un cadáver lleve energía es habérsela puesto en vida (energía embebida, pagada por el progenitor al nacer,
   liberada al morir → detritusE). Con eD=0 el organismo muere con E≈0 → carroña VACÍA → no hay nicho. Curiosamente eD NO
   hacía falta para depredadores (la presa viva lleva reservas); **el carroñeo es justo el caso donde eD importa.**

## Medición (spikes/scavenger-niche/probe.mjs, 25k ticks)
- **Conserva en TODOS los casos** (materia <1e-3, energía/tick <1e-2) ✓.
- Con eD=0: flujo de carroñeo ínfimo (~0.4%), stock detE≈0 → sin nicho (cadáver magro).
- Con eD=4 + scavRate 0.5: el carroñeo lleva ~3% del ingreso y BAJA el stock de detrito ~30% (se consume antes de
  descomponerse a calor). Barriendo `decompose` a la baja sube hasta ~10% pero a 0.001 la pop colapsa (se ahoga el
  reciclaje de materia) → se deja decompose sin tocar.
- **Lo que emerge es carroñeo FACULTATIVO**, no obligado: heterótrofos/depredadores suplementan ~15-18% de su dieta con
  carroña; el TIPO carroñero obligado es marginal (~1-3% de la pop). Es ecológicamente realista (el descomponedor obligado
  es raro; la carroña es un recurso fino, y a escala pecera más — coherente con [[vision-organo-neutra-sin-coste]] y
  [[pecera-pequena-contemplativa-scope]]). El sensor + cadáveres visibles (#3) hacen el comportamiento OBSERVABLE.

## Verificación
- Gate 8/8 verde; dorado re-fijado `0xfc785e37` (eD 0→4 + scavRate + sensor BRAIN.I 8→10). Determinismo OK.
- eD=4 NO colapsa (popcheck): a la config de arranque del usuario (seed100/spread0.30/div0) la pop es ~76 con eD=0 y eD=4
  por igual; la pop baja es por sembrar clones en disco central, no por eD. En config de test (seed800) eD=4 da pop ~1000.
- Instrumentación por-agente del ORIGEN de energía (photoIn/preyIn/scavIn, solo escritura → byte-idéntico) — disponible
  para mostrar el oficio real en el inspector (#5) como "luz X% · caza Y% · carroña Z%".

## Reabrir si
El usuario quiere un nicho carroñero PROMINENTE (no facultativo). Palanca = agrandar el recurso (bajar `decompose`, con
cuidado del colapso de reciclaje) y/o subir scavRate; pero el techo lo pone la escala pecera (sol domina la energía).
