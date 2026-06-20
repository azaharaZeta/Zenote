# Zenote 2 — MODELO ACTUAL (fuente de verdad del estado vivo)

Este doc describe lo que zenote2 **ES hoy** (el código en `zenote2/`). Los docs de `01-Assessment/` y `02-Redesign/` son el
razonamiento histórico del rediseño; donde contradigan a este, **manda este**. Parámetros exactos: `zenote2/src/config.js`.

## El cambio de cimientos (2026-06-20)
El diseño original hacía EMERGER el eje autótrofo↔heterótrofo del genoma (tejido PHOTO captaba luz). En la práctica degeneró
(todo se volvía sésil fotosintetizando; ver histórico del inmovilismo). **Se rediseñó:** ya no hay autótrofos.

## Qué es zenote2 ahora
- **TODOS los organismos son ANIMALES** (heterótrofos). No fotosintetizan. Tejidos del genoma: `STRUCTURE · MUSCLE · MOUTH`
  (sin PHOTO). Cerebro neuronal (pesos = genes), morfología de reglas (genoma→develop→cuerpo), reproducción sexual/asexual.
- **La VEGETACIÓN es el productor, parametrizado (NO genético).** Campo `world.veg` por celda: crece captando LUZ (energía entra
  al ecosistema aquí) y consumiendo NUTRIENTE (materia), con capacidad ∝ luz local; senesce a detrito. Rebrote con `patchiness`
  (logístico + difusión de semilla al vecindario, adaptado de zenote1) → forma y MIGRA **parches** orgánicos con el pastoreo↔
  rebrote. **Productividad ∝ luz local** → las zonas frondosas SIGUEN al campo de luz (que deriva con "Corriente del abismo")
  → la vegetación FLUYE. Pastoreo con **reserva de rebrote** (`grazeRefuge`, anti-sobrepastoreo) y **forrajeo por ÁREA∝talla**
  (`forageReach`, payoff de talla del herbívoro). No evoluciona — es física del mundo. (Genética en la veg = `ideas/vegetacion-con-genetica.md`, Escenario 2.)
- **Los animales comen** (única vía de energía): **pastan** vegetación · **cazan** presa viva · **carroñean** detrito — todo con
  el mismo gesto neuronal de "abrir boca". El eje **herbívoro↔carnívoro EMERGE de la DIETA realizada** (a qué dedica la boca),
  no de la morfología ni de un if/else. La conducta (forrajear/cazar/huir) emerge del cerebro+selección (regla #1 intacta).
- **Sensores del cerebro (10):** ∇vegetación (olor a comida) · dir-presa · dir-amenaza · hambre · velocidad propia · ∇detrito.

## Libro mayor (CONSERVA — verificado por el gate, m4/m5/m6)
- **MATERIA (cerrada):** `nutriente + vegetación + detritoM + masa_animales = CONSTANTE`. Cicla: nutriente→veg (crecer) /
  veg→nutriente (pastoreo) / veg→detrito (senescencia) / animal→detrito (muerte) / detrito→nutriente (descomposición).
- **ENERGÍA (abierta):** entra como LUZ (capturada por la vegetación), se almacena (`veg·vegEcoef + reservas + tripa + detritoE`),
  sale como CALOR (metabolismo, digestión ineficiente, senescencia/descomposición). Sin luz → la vegetación se apaga → todo muere.

## Parámetros clave (UI en vivo · `config.js`)
- Productor: `vegGrowth/vegKcoef/vegEcoef/vegDecay/vegSeed/vegDiffuse` (WORLD_P, NO UI).
- Lab vivo: **Pastoreo** (`grazeRate`), **Carroñeo** (`scavRate`), Metabolismo basal, Umbral de cría, Luz solar (`lightMul`,
  escala la productividad vegetal), **Corriente del abismo** (`lightFlow`, el campo de luz deriva → los parches de vegetación
  fluyen), Ritmo de mutación, Reproducción.
- Arranque (reinicio): Tamaño de mundo, Sembrado inicial, Extensión, Diversidad, + `vegInit` (NO UI).

## Render
- Fondo = **campo de VEGETACIÓN** (nebulosa TEAL con parches; más brillo = más comida; realce del pasto tenue; fluye/migra). Sustituye a la antigua nebulosa de luz.
- Organismos: siluetas por nodo, color por modo (Natural=linaje · Tejido · **Oficio**=herbívoro/carnívoro/omnívoro por dieta · Linaje).
  Ojos = fracción carnívora de la dieta. Cadáveres con forma que se desvanecen. Inspector: dieta "pasto/caza/carroña" + linaje.

## Resultados medidos
Conserva (gate 8/8, dorado `0xe6e247bd`); emerge estructura trófica (herbívoros + carnívoros); **~94% de la población en
movimiento** (sin fotosíntesis no hay subsidio a estar quieto → comer obliga a moverse). Memoria: `zenote2-animals-only-vegetation`.
