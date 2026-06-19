# Visión como órgano evolutivo — **(Zenote 2)**

> **Ámbito: ZENOTE 2** (la segunda app, `../../../zenote2/`), no la app v1 de esta carpeta. Análisis de viabilidad +
> plan de spike. Spike: [`zenote2/spikes/vision-organo/`](../../../zenote2/spikes/vision-organo/) · resultado medido:
> [`RESULT.md`](../../../zenote2/spikes/vision-organo/RESULT.md).

## Problema
Hoy en Zenote 2 la percepción es **abstracta y universal**: el motor calcula 8 señales (∇luz, dirección a presa/amenaza
más cercanas, hambre, velocidad) y las entrega a la RNN ([`sim.js`](../../../zenote2/src/engine/sim.js) §sensado). **No hay
órgano de visión** (tejidos = ESTRUCTURA·PHOTO·MUSCLE·MOUTH). Es la **única capacidad que NO emerge de la forma** —
fotosintetizar/mover/comer sí salen del tejido ("forma=función"), pero ver es gratis e igual para todos.

## Idea
Un **5º tejido SENSOR** (ojo) cuyo **alcance de percepción emerja de su área** (como `photoCap`/`mouthCap`). Sin ojo →
casi ciego; con ojo → ve más lejos. Cierra la asimetría de forma=función y abre fenómenos nuevos: ceguera adaptativa del
autótrofo sésil, carreras de armamento cazador↔presa, nichos sensoriales (emboscada vs persecución).

## Riesgo central: el valle de fitness (huevo–gallina)
Un ojo **cuesta** (masa) pero **no rinde hasta que el cerebro lo usa**, y el cerebro no aprende a usar una señal que no
existe → mutación que añade ojo = puro coste → seleccionada en contra. Es el patrón de **M6.3** (el cerebro en blanco no
arrancaba → hubo que sembrar). Mitigaciones:
1. **Degradación suave** — sin ojo, alcance mínimo innato; el órgano lo *extiende* (rampa, no acantilado).
2. **Modular, no cambiar topología** — el órgano modula el *valor* de las entradas presa/amenaza, no su número (cerebro
   y recombinación estables).
3. **Sembrar un ojo** en los fundadores (como el seedBrain). El seedBrain **ya** está cableado a presa/amenaza → un ojo
   recién aparecido se usa de inmediato → el valle podría ser poco profundo *gracias* al seedBrain.
4. **Separar modalidades** — la luz sigue innata/gratis (fototaxis); solo la **detección de organismos** depende del ojo
   → el autótrofo conserva su sentido útil sin coste.

## Diseño mínimo (el que prueba el spike)
- Tejido **SENSOR**; `senseRange = senseBase + senseGain·área`, capado a `senseMax` (≈ alcance del barrido 3×3 del hash
  → coste de perf ≈ 0).
- Entradas del cerebro **fijas (8)**; el órgano **gatea** la detección de presa/amenaza por `senseRange²`.
- Degradación suave + ojo sembrado.

## Integración (código real)
| Archivo | Cambio |
|---|---|
| `genome.js` | `TISSUE` +SENSOR, `TISSUE_N 4→5`, `tissueOf` re-binnea; `makeFounder` siembra ojo. |
| `phenotype.js` | rama `SENSOR` → `senseRange` (de `área`). |
| `sim.js` | gatear el sensado por `senseRange²` (en 'free' = ∞ → baseline). |
| `main.js` | color del tejido SENSOR + (bonito) radio de visión del inspeccionado. |

## Rendimiento
El barrido de vecinos ya es ~40% del motor (compute-bound). **Capar `senseRange` al radio del barrido 3×3** → solo se
añade una comparación por candidato → **coste ≈ 0**. Alcances mayores (rejilla secundaria) = fase 2. El ojo es **masa**
(materia, conservada) → no introduce energía → invariantes intactos.

## Extensiones (fase 2, solo si fase 1 da GO)
FOV direccional (cono vs rumbo; ojo: el rumbo solo existe si se mueve → v1 omnidireccional) · acuidad/ruido (absorbe
**M6.4**, que se difirió por payoff nulo *en abstracto*: con órgano el trade-off coste↔beneficio es real) · modalidad
evolucionable.

## Plan del spike + criterios de muerte
Headless, multi-seed, 20–40k ticks, 3 condiciones de ablación contra el baseline de sensado-gratis:
- `free` (baseline, gate ∞) · `organ-seeded` (fundadores con ojo → ¿lo retienen cazadores y lo SUELTAN autótrofos?) ·
  `organ-blind` (fundadores ciegos → ¿se INVENTA el ojo?).
- **Hipótesis**: (1) ¿cruza el valle? (2) **¿la inversión en ojo se diferencia por nicho?** ← el test discriminante.
  (3) ¿no degrada la red trófica? (4) perf >1000 t/s. (5) materia conservada.
- **Criterio de MUERTE** (descartar y documentar, como M6.4/M6.1): si el ojo nunca se establece aun sembrado, o si se
  establece **sin diferenciación por nicho** (autótrofos cargando ojos inútiles) → complejidad sin payoff.

## Veredicto MEDIDO (spike, 30k · 3 seeds) → **NULL parcial: el ojo es selectivamente NEUTRO** ✗
Resultado completo: [`RESULT.md`](../../../zenote2/spikes/vision-organo/RESULT.md). En corto:
- **NO se diferencia por nicho**: autótrofos cargan tanto ojo como cazadores (het/auto = 0.9×). No emergen "autótrofos
  ciegos / cazadores de vista aguda".
- **El ojo aparece por DERIVA, no por selección**: en `free` (ojo inútil, gate ∞) el 38% ya lo tiene → es el nivel de
  deriva; `organ-blind` da 34% ≈ lo mismo → sin presión positiva. **Causa raíz**: el SENSOR cuesta solo masa = es
  intercambiable con ESTRUCTURA (lastre) → cero presión para soltarlo o invertir en él.
- Controles sanos: no degrada la red trófica, perf OK, **materia conservada** (la mecánica funciona; falla el payoff).

**Variante con coste de sensado (M6.4), MEDIDA**: se añadió coste metabólico ∝ alcance y se barrió. **Tampoco
diferencia** — al subir el coste, el ojo colapsa para **TODOS** (auto y cazador), no solo para los autótrofos; la
heterotrofía se hunde por estrés metabólico antes de que aparezca un nicho de "vista aguda".

**Veredicto FINAL — NO viable en la pecera contemplativa (parar).** La causa no es la implementación ni el gradiente de
coste, sino de **ESCALA/ECOLOGÍA**: en un mundo pequeño y denso la presa suele estar dentro del alcance innato barato →
la vista de largo alcance **no rinde para nadie** → no hay nicho sensorial. La idea solo tendría sentido en un **mundo
grande y disperso** (localizar presa lejana = cuello de botella) → ámbito del futuro proyecto nativo/GPU
([[pecera-pequena-contemplativa-scope]]). La percepción se queda **abstracta** (decisión correcta para este alcance).
