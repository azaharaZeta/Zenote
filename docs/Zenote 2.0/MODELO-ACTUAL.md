# Zenote 2 — MODELO ACTUAL (fuente de verdad del estado vivo)

Este doc describe lo que zenote2 **ES hoy** (el código en `zenote2/`). Los docs de `01-Assessment/` y `02-Redesign/` son el
razonamiento histórico del rediseño; donde contradigan a este, **manda este**. Parámetros exactos: `zenote2/src/config.js`.

## El cambio de cimientos (2026-06-20)
El diseño original hacía EMERGER el eje autótrofo↔heterótrofo del genoma (tejido PHOTO captaba luz). En la práctica degeneró
(todo se volvía sésil fotosintetizando; ver histórico del inmovilismo). **Se rediseñó:** ya no hay autótrofos.

## Qué es zenote2 ahora
- **TODOS los organismos son ANIMALES** (heterótrofos). No fotosintetizan. Tejidos del genoma: `STRUCTURE · MUSCLE · MOUTH`
  (sin PHOTO). Cerebro neuronal (pesos = genes), morfología de reglas (genoma→develop→cuerpo), reproducción sexual/asexual.
  El genoma incluye además genes de **historia de vida r/K** (`reproK` = umbral de cría · `investFrac` = inversión por cría),
  evolucionados sobre el baseline `SIM_P.reproE` (slider). MEDIDO: el eje r↔K queda **near-neutral** (no diverge) en la pecera
  cerrada y saturada — resultado honesto, ver `ideas/auditoria-zenote2-2026-06-20.md` §5.
- **La VEGETACIÓN es el productor, parametrizado (NO genético).** Campo `world.veg` por celda: crece captando LUZ (energía entra
  al ecosistema aquí) y consumiendo NUTRIENTE (materia), con capacidad ∝ luz local; senesce a detrito. Rebrote con `patchiness`
  (logístico + difusión de semilla al vecindario, adaptado de zenote1) → forma y MIGRA **parches** orgánicos con el pastoreo↔
  rebrote. **Productividad ∝ luz local** → las zonas frondosas SIGUEN al campo de luz (que deriva con "Corriente del abismo")
  → la vegetación FLUYE. Pastoreo con **reserva de rebrote** (`grazeRefuge`, anti-sobrepastoreo) y **forrajeo por ÁREA∝talla**
  (`forageReach`, payoff de talla del herbívoro). No evoluciona — es física del mundo. (Genética en la veg = `ideas/vegetacion-con-genetica.md`, Escenario 2.)
- **Los animales comen** (única vía de energía): **pastan** vegetación · **cazan** presa viva · **carroñean** detrito — todo con
  el mismo gesto neuronal de "abrir boca". El eje **herbívoro↔carnívoro EMERGE de la DIETA realizada** (a qué dedica la boca),
  no de la morfología ni de un if/else. La conducta (forrajear/cazar/huir) emerge del cerebro+selección (regla #1 intacta).
- **La caza depende de la VELOCIDAD relativa (`fleeSpeed`, 2026-06-20):** una presa escapa de la captura si corre más rápido que
  su depredador (× `fleeSpeed`). Así **ser rápido es defensa (huir) y ataque (alcanzar)** → carrera armamentística que mantiene el
  **músculo y el movimiento bajo selección**. Sin esto, nada premiaba la velocidad → el músculo se podaba y la locomoción decaía con
  el tiempo evolutivo (todo derivaba a lento). Sigue sin estrategia cableada: el cerebro decide hacia dónde y cuánto correr.
- **Sensores del cerebro (10):** ∇vegetación (olor a comida) · dir-presa · dir-amenaza · hambre · velocidad propia · ∇detrito.

## Libro mayor (CONSERVA — verificado por el gate, m4/m5/m6)
- **MATERIA (cerrada):** `nutriente + vegetación + detritoM + masa_animales = CONSTANTE`. Cicla: nutriente→veg (crecer) /
  veg→nutriente (pastoreo) / veg→detrito (senescencia) / animal→detrito (muerte) / detrito→nutriente (descomposición).
- **ENERGÍA (abierta):** entra como LUZ (capturada por la vegetación), se almacena (`veg·vegEcoef + reservas + tripa + detritoE`),
  sale como CALOR (metabolismo, digestión ineficiente, senescencia/descomposición). Sin luz → la vegetación se apaga → todo muere.

## Parámetros (todos en `config.js`, fuente única). Laboratorio en vivo AGRUPADO por tipo (11 sliders):
- **Luz y vegetación:** Luz solar (`lightMul`) · Corriente del abismo (`lightFlow`) · Productividad (`vegGrowth`) · Comida en
  parches (`patchiness`) · Reserva de rebrote (`grazeRefuge`).
- **Alimentación:** Pastoreo (`grazeRate`) · Alcance de forrajeo (`forageReach`) · Carroñeo (`scavRate`) · Escape por velocidad (`fleeSpeed`).
- **Metabolismo y cría:** Metabolismo basal (`baseCost`) · Umbral de cría (`reproE`) · Reproducción (`reproMode`).
- **Evolución:** Ritmo de mutación (`mutRate`).
- NO UI (config): `vegKcoef/vegEcoef/vegDecay/vegSeed/vegDiffuse/forageMassRef`, `massCost/massCostExp`, etc.
- Arranque (reinicio): Tamaño de mundo, Sembrado inicial, Extensión, Diversidad, + `vegInit` (NO UI).
- El worker `set` acepta claves de SIM_P, GENOME_P (mutRate), `world.lightMul` y cualquier clave de `world.P` (lightFlow/vegGrowth/patchiness…) → afectan en vivo.

## Render y observación
- Fondo = **campo de VEGETACIÓN** (nebulosa TEAL con parches; más brillo = más comida; realce del pasto tenue; fluye/migra). Sustituye a la antigua nebulosa de luz.
- Organismos: **siluetas bézier por nodo** (gota/aleta/tentáculo que afila hacia afuera según `aspect` → criaturas, no óvalos)
  con **sombreado volumétrico** (gradiente radial luz→sombra al acercar → gelatina 3D; LOD: plano a vista de mundo), **costillas
  transversales** (segmentación, color = sombra del cuerpo → anatomía) y **contorno suave unificado** (reborde, sin líneas duras).
  Color por modo (Natural=linaje · Tejido · **Oficio**=herbívoro/carnívoro/omnívoro por dieta · Linaje). Ojos = fracción carnívora
  de la dieta. Cadáveres con forma que se desvanecen. Inspector: dieta "pasto/caza/carroña" + linaje + r/K (umbral·inversión).
- **Abismo vivo:** nebulosa de vegetación TEAL con **profundidad** (campo frío↔cálido fundido en el bake) + **plancton/micro-flora**
  (chispas que florecen donde hay veg) + **nieve marina** (detrito a la deriva que titila) bajo los organismos → profundidad y vida.
  Bloom/aura (bioluminiscencia, gatea plancton+nieve en móvil/Baja) + viñeta. (Referencia estética: el render de zenote1, `src/render/canvas.js`.)
- Gráficas en vivo: población / nacimientos (sex·asex) / muertes (predación·inanición) / **talla (masa) media por oficio en el
  tiempo** (ver la talla evolucionar + divergir entre nichos) + **HISTOGRAMA de un rasgo seleccionable**
  (masa · boca · v.máx · nº partes · umbral de cría r/K · inversión por cría · linaje), apilado por oficio (herbívoro/resto) sobre eje
  fijo → ver la distribución DERIVAR (prueba visual de la selección) y la diferenciación de nicho (p.ej. boca: herbívoros bajos,
  carnívoros altos). Se computa en el worker (solo viajan los bins). Mensaje `histTrait`.

## Resultados medidos (headless, 3-5 semillas, 30-50k ticks)
- **Conserva** materia (deriva ~0.004% = ruido f32) + energía (luz→calor): gate **9/9 verde** (`npm run test:zenote2`; incluye m9 = regresión ecológica + CI en `.github/`).
- **Estructura trófica robusta y persistente:** herbívoros + carnívoros + carroñeros coexisten a 30-50k en TODAS las semillas
  (≈65%/15%/20% por dieta); el **cazador NO se extingue** (el baseline de v1 lo perdía en 5/5 a mundo pequeño). Mortalidad
  **depredación-dominante** (~2:1 frente a inanición). Diversidad de talla emerge incluso desde clones (σ≈2.0).
- **Población estable** (no boom-bust): ~400-480 en mundo 1500, energía-limitada (≪ cap).
- **Locomoción viva y estable** (gracias al escape-por-velocidad `fleeSpeed`): el "94% móvil" de antes era un **transitorio de la
  siembra** (t≈500, dirigido por el seedBrain). Sin `fleeSpeed` la velocidad **decaía a paso de tortuga** con la evolución
  (spMean 1.66→0.18, vmax→0.27 a 50k; el músculo se podaba). Con `fleeSpeed=1.0` se **ESTABILIZA en meseta** (spMean ~0.30,
  vmax ~0.41, +52-64% vs sin él) → el movimiento ya no se apaga con el tiempo. El equilibrio real es **~60% móvil a paso vivo**, no 94%.
- **Boca bajo selección** (coste de boca `mouthCost`): antes la `mouthCap` inflaba ~50× (economía limitada por digestión → boca
  redundante que derivaba). Con coste, deja de inflar (mouthCap 55→~9) y **emerge diferenciación de nicho**: el carnívoro mantiene
  boca ~2× la del herbívoro (la boca del depredador paga su coste manejando presa; el pastador la recorta). Sin romper coexistencia.
- El **dorado vivo** está en `zenote2/test/m8-determinism.mjs` (hoy `0xf5375391`; cámbialo solo con cambios de física INTENCIONADOS).
- Memoria: `zenote2-animals-only-vegetation`.

## Historia (memorias SUPERADAS por el cambio de cimientos — no aplicarlas como vigentes)
El modelo PREVIO tenía fotosíntesis en el genoma. Quedaron obsoletas: `zenote2-immobility-photohalf-fix` (photoHalf),
`photomotion-sessility-lever` (photoMotionK, ya no existe), `zenote2-scavenger-needs-edensity` (eD=0 ahora), parte de
`zenote2-abyss-flowing-light` (la corriente ahora mueve la veg vía productividad∝luz). `zenote2-bloat-masscostexp` SIGUE
vigente (massCostExp aplica a los cuerpos animales).
