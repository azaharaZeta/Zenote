# Auditoría del modelo evolutivo — **(Zenote 2)**

> ## ⚠️ AUDITORÍA DEL MODELO PREVIO (fotosíntesis) — 2026-06-19
> El **2026-06-20 cambiaron los cimientos** (fotosíntesis-en-el-genoma → **solo animales + vegetación parametrizada**;
> ver [`MODELO-ACTUAL.md`](../MODELO-ACTUAL.md)). Esta auditoría se hizo el día ANTES. La **maquinaria genética/reproductiva
> NO cambió**, así que la mayoría de los hallazgos **SIGUEN VIGENTES** contra el código de hoy: fitness implícito,
> Baldwin (no Lamarck), mapa genotipo→fenotipo generativo, haploidía, **D16** (sin selección sexual de Fisher; `mateCompat`
> es métrica curada — hoy sobre masa/mouthCap/maxMouthR), **D14** (especiación clinal, no discreta), **seedBrain** (conducta
> sembrada, evo aporta ~18%), **r/K no evolvable** (`reproE`/`investE` constantes). **SUPERADO:** el eje trófico ya no es
> autótrofo↔heterótrofo por `photoCap` sino **herbívoro↔carnívoro por DIETA** sobre vegetación — y la estructura trófica
> ahora es **más robusta** (el cazador ya no se extingue). **Hallazgo NUEVO** (no cubierto aquí): la **locomoción decaía**
> con el tiempo evolutivo. **Auditoría fresca + medidas:** [`auditoria-zenote2-2026-06-20.md`](auditoria-zenote2-2026-06-20.md).

> **Ámbito: ZENOTE 2** (la segunda app, `../../../zenote2/`), no la app v1 de esta carpeta. Auditoría **del modelo
> evolutivo desde la biología evolutiva** (mecanismos, plausibilidad, supuestos, fenómenos reproducibles), realizada el
> **2026-06-19** sobre la rama `biorefactor`. Complementa la [auditoría TÉCNICA](auditoria-tecnica-zenote2.md) del mismo
> día (ingeniería) con el eje científico. Hallazgos para **procesar más adelante** — cada punto es accionable por separado.
>
> Rutas relativas a `../../../zenote2/`. Lectura: motor completo (`genome.js`, `sim.js`, `phenotype.js`, `world.js`,
> `rng.js`, `worker.js`) + diseño [`2.4-bucle-evolutivo`](../02-Redesign/2.4-bucle-evolutivo.md) + tests
> (m5-evolution, m5-formfunction, m6_3-behavior, m7-speciation, spike m3).

## Veredicto

Zenote 2 es un modelo **genuinamente darwiniano y arquitectónicamente honesto** de evolución de **rasgos cuantitativos y
del desarrollo**. Tres aciertos mayores son reales: **fitness implícito** (no hay función objetivo escrita; el éxito
reproductivo emerge de la física), un **mapa genotipo→fenotipo de verdad** (genoma-de-reglas generativo, no una lista de
rasgos), y una **separación Baldwin/Lamarck impecable** (lo aprendido no se hereda).

Los límites son de dos clases. Unos **estructurales y legítimos**: el organismo es **haploide** (sin alelos, diploidía ni
heterocigosis) → no es un modelo de genética mendeliana de poblaciones, y *Hardy-Weinberg queda fuera de alcance por
diseño, no por error*. Otros son **brechas entre lo que el diseño (2.4) prometía y lo que el código hace**, y estas sí
afectan a las conclusiones publicitadas: la **especiación "sin métrica curada" (D14) no se cumple** (la curación se
reubicó del genoma al fenotipo), la **selección sexual "load-bearing" (D16) no existe** en el código, la **conducta no
emerge de cero** (hay un `seedBrain` cableado), y el **eje r/K no es plenamente evolvable** (el umbral de cría es una
constante global).

La tesis **contemplativa central** del proyecto (ver forma y función evolucionar por selección emergente) NO está
invalidada. Las afirmaciones puntuales D14/D16 de Zenote 2 SÍ están sobre-vendidas frente al código actual.

## 1. Inventario de mecanismos evolutivos

| Mecanismo | Estado | Implementación | Dónde |
|---|---|---|---|
| **Variación / mutación** | ✅ Robusto | Paramétrica gaussiana por locus + estructural (añadir/duplicar/borrar módulos, *toggle* recursión/simetría) + mutación de pesos del cerebro + mutación de marca de homología | `src/engine/genome.js:111` |
| **Herencia** | ✅ Correcto | Transmisión fiel del genoma-de-reglas + pesos *de nacimiento*; lo aprendido NO se hereda (Baldwin) | `genome.js:77`, `sim.js:75` |
| **Selección** | ✅ Implícita | Viabilidad (muerte por `E≤0`) + fecundidad (criar exige `E≥reproE` + materia local). Sin fitness explícito | `sim.js:178`, `sim.js:196` |
| **Deriva génica** | ✅ Emergente | Muestreo en población finita + reproducción estocástica; marcador neutro `hue` | `genome.js:73` |
| **Migración / flujo génico** | ⚠️ Parcial | Aislamiento por distancia *continuo* (dispersión local ±6, `mateRadius` 50). NO hay demes ni modelo de islas | `sim.js:205`, `sim.js:91` |
| **Recombinación** | ✅ Sí | Por módulos homólogos con ligamiento + *crossover* de un punto en el cerebro | `genome.js:149` |

Los seis mecanismos clásicos están presentes en alguna forma; la calidad varía mucho entre ellos.

## 2. Plausibilidad biológica, mecanismo a mecanismo

### Mutación — plausible y bien diseñada
- **Variación heredable real** ✅: `mutate()` opera sobre un clon del genoma y perturba parámetros continuos y estructura; todo se transmite.
- **Espectro de efectos realista** ✅: paramétrica frecuente/suave (≈ SNPs) + estructural rara/gran efecto (≈ CNV/reordenamientos). La **duplicación de módulos** (`genome.js:122`) es motor real de innovación (neofuncionalización al duplicar y mutar el tejido). **Pleiotropía y epistasis emergen** del genoma-de-reglas (un módulo recursivo+simétrico afecta muchas partes; el `partBudget` compartido acopla módulos).
- **Tasas órdenes de magnitud sobre lo biológico** ⚠️: el cerebro muta ≈ `0.08 × 118 ≈ 9.4` pesos por evento reproductivo; cada parámetro de módulo 6–15%. Régimen de **mutación alta**: mucha variación, pero la selección débil queda dominada por la lluvia mutacional. Legítimo en mundo artificial (genoma diminuto, generaciones cortas), pero la "gradualidad" ocurre bajo fuerte presión mutacional.
- **La duplicación rompe la paralogía** ⚠️: la copia recibe marca de homología *nueva* (`genome.js:123`). En biología dos copias recién duplicadas son inicialmente homólogas y divergen después; aquí nacen ya con identidades distintas → no se alinean en recombinación. Contradice la analogía Hox del diseño.

### Herencia — el punto más fuerte
- Alta fidelidad ✅ (clon+mutación / recombinación+mutación).
- **Baldwin, no Lamarck, correctamente implementado** ✅✅: la plasticidad Hebbiana modifica solo la *copia de trabajo* `wbrain` (`sim.js:183`); `mutate`/`recombine` actúan sobre `genome.brain` (cerebro de nacimiento); `spawn` reinicia `wbrain` desde el genoma (`sim.js:75`). **Lo aprendido en vida no entra nunca en la línea germinal.** Evoluciona la *capacidad de aprender* y su punto de partida; no la experiencia.
- **Homología no compartida entre fundadores** ⚠️: cada `makeFounder` asigna marcas distintas (`genome.js:71`). Dos fundadores con módulos PHOTO idénticos no se reconocen como homólogos → la recombinación entre linajes distintos degenera en unión/pérdida aleatoria de módulos (`genome.js:158`). La recombinación homóloga "real" solo opera *dentro* de un linaje.

### Selección — implícita y coherente (con un recorte importante)
- **Fitness implícito, no explícito** ✅✅: no hay función de fitness. El éxito emerge de captación de energía (`sim.js:125`), coste metabólico (∝ masa + nado, `sim.js:176`), capacidad de cazar/evitar caza (`sim.js:140`) y el *gate* de materia local. El programador define la física, no qué genes son buenos. Cumple la regla innegociable nº 1.
- **La selección ve el fenotipo** ✅: las magnitudes que importan se derivan del cuerpo desarrollado en `phenotype.js`, no del genotipo directo.
- **Presión coherente con el entorno** ✅: luz en parches (`world.js:49`) + sombra por ocupación (competencia por luz, `world.js:75`) + nutriente local finito → selección densodependiente y espacialmente variable. Viabilidad + fecundidad + dependencia de talla/frecuencia vía depredación.
- **La estrategia reproductiva no evoluciona** ⚠️: `reproE=16` e `investE=7` son **constantes globales** (`sim.js:21`), no genes. "Cuánto acumular antes de criar / cuánto invertir por cría" no está en el genoma `{root, modules, brain, hue}`. El diseño (2.4 §1.1) lo pedía explícitamente evolvable.

### Deriva génica — presente, pero sin estado absorbente
- Emerge de población finita (~1160 vivos sobre `cap` 12000) + reproducción estocástica ✅.
- **Locus neutro explícito** ✅: `hue` no afecta a ninguna transacción (solo color de render) → sustrato ideal para deriva.
- Pero `hue` **muta continuamente** ⚠️ (`genome.js:141`) → no hay fijación clásica (estado absorbente); la mutación recurrente lo re-dispersa. Lo que sí ocurre es **deriva genealógica / coalescencia** (un linaje llega a ser el ancestro común de toda la población → `hue` converge a una banda).

### Migración / flujo génico — estructura espacial continua, no metapoblación
- Toro único. Reproducción local (cría a ±6) y apareamiento local (`mateRadius` 50 sobre mundo 1500) → **aislamiento por distancia** débil emergente.
- **No hay demes discretos ni tasa de migración** ❌ (no es modelo de islas de Wright); no se puede medir F_ST entre subpoblaciones porque no las hay. La especiación alopátrica de 2.4 §3.2 exigiría dispersión/alcance pequeños frente al mundo y poca mezcla; con difusión de nutriente y movilidad, la panmixia espacial es probablemente alta.

### Recombinación — real, pero haploide
- Por módulos homólogos con ligamiento (puntos de cruce, tramos contiguos, `genome.js:154`); cerebro por *crossover* de un punto ✅. **Preserva validez por construcción.** El módulo como unidad co-adaptada es razonable.
- **No hay diploidía ni meiosis** ⚠️: recombinación entre dos genomas haploides → hijo haploide (más cercana a conjugación / fase haploide que al ciclo sexual diploide). Sin segregación mendeliana ni pares de alelos.
- **Sin recombinación intra-módulo** ⚠️: los parámetros de un módulo viajan siempre juntos (ligamiento perfecto interno).

## 3. Supuestos incorrectos y simplificaciones problemáticas

| Sospecha | Hallazgo |
|---|---|
| Herencia lamarckiana implícita | ❌ No existe. Baldwin correctamente implementado (§2). Punto fuerte. |
| Selección sin variación | ❌ No. Coexisten variación abundante y selección. |
| Variación sin selección | ❌ No (salvo `hue`, neutro a propósito). |
| Fitness mal definido | ❌ No: bien definido como implícito. El matiz está en el `seedBrain` (c). |
| Falta de equilibrio mutación-selección | ⚠️ Puede emerger, pero desplazado (tasas altas + selección a veces débil → más variación). Sin diploidía no hay el equilibrio clásico de recesivos deletéreos `q̂ = √(μ/s)`. |
| Poblaciones sin estructura | ⚠️ Hay estructura espacial *continua*, no de metapoblación; probablemente débil. |

Tres simplificaciones tocan las conclusiones:

**(a) Haploidía / ausencia de genética mendeliana — la más consecuente.** Sin alelos, loci diploides, dominancia,
recesividad ni heterocigosis. Es un modelo de rasgos cuantitativos de valor real + estructura modular, haploide. *No es
incorrecto* (es coherente con 2.4), pero determina qué fenómenos puede mostrar (§4).

**(b) `mateCompat` es la métrica curada que decían eliminar, reubicada.** El diseño (2.4 eje 3) prometía **señal +
preferencia evolvables** con selección sexual de Fisher. El código usa una **distancia fenotípica fija** en tres ejes
(`masa/2`, `photoCap/40`, `mouthCap/10`) con umbral `0.5` (`sim.js:101`): apareamiento asortativo positivo por
similitud — ingrediente válido —, pero **métrica curada con pesos/loci elegidos a mano** (la curación no desapareció, se
trasladó del genoma al fenotipo) y **sin preferencia evolvable** → sin canal de selección sexual / *runaway* de Fisher.
**D16 no se cumple.**

**(c) `seedBrain` — la conducta no emerge de cero.** Todos los fundadores arrancan con un cerebro cableado a mano (ir a
presa/luz, huir, atacar en contacto, `genome.js:38`). Es siembra de *conducta*. El test m6_3 compara contra salidas
aleatorias (≥1.5× más caza) — pero eso mide sobre todo el `seedBrain`, no la evolución (un cerebro recién sembrado ya
cazaría más que uno aleatorio). **Falta el brazo de control `seedBrain`-congelado** (sin mutación ni plasticidad) para
aislar la aportación evolutiva. Los comentarios "cero estrategia cableada" (`genome.js:26`, `sim.js:147`) son inexactos.

**(d) No hay barrera post-cigótica.** El diseño (2.4 §2/§3.2) prometía que cruzar divergentes daría "crías mal integradas,
menos viables". El código no lo implementa: `recombine()` siempre produce un cuerpo **válido por construcción**, sin
penalización de viabilidad por divergencia parental. El único aislamiento es **pre-cigótico** (`mateCompat`).

## 4. ¿Reproduce fenómenos evolutivos conocidos?

**Hardy-Weinberg en ausencia de selección — ❌ fuera de alcance (estructural, no bug).** H-W describe proporciones
genotípicas (p², 2pq, q²) en población **diploide** panmíctica con loci alélicos. Este modelo es haploide y sin alelos
discretos: **no existen genotipos diploides ni heterocigotos**, así que las categorías de H-W no están definidas. El
análogo "frecuencia de alelo neutro constante" falla porque la población es finita (deriva) y `hue` muta sin cesar. No
está construido para enseñar genética de poblaciones mendeliana.

**Fijación de alelos por deriva — ⚠️ parcial.** El mecanismo (población finita + reproducción estocástica) existe y `hue`
es el sustrato neutro ideal, pero la mutación recurrente impide el estado absorbente. Lo observable es **coalescencia de
linaje** (deriva genealógica). Fijación clásica sería demostrable apagando la mutación del marcador y midiendo el tiempo
de fijación frente a N.

**Adaptación gradual — ✅ sí, y es lo más sólido.** m5-evolution: `photoCap` sube y la diversidad emerge desde un fundador
simple. m5-formfunction: el **eje autótrofo↔heterótrofo** y el **trade-off del generalista** emergen de la física (sin
`omniPenalty`). Spike m3: **convergencia fiable al mismo óptimo locomotor en 4/4 semillas** + cadenas recursivas y
simetrías sin sembrar. Adaptación gradual + convergencia + cruce de valles genuino. (Salvedad: paisaje del spike simple,
con óptimo global claro.)

**También capta bien:** duplicación génica → neofuncionalización; pleiotropía y trade-offs físicos; **efecto Baldwin**;
selección densodependiente; **capacidad de carga endógena** (materia local limita natalidad, sin techo artificial).

**No capta:** dominancia/sobredominancia/carga por recesivos; selección sexual de Fisher y dimorfismo; especiación con
aislamiento post-cigótico real; fijación absorbente por deriva; estructura de metapoblación y F_ST entre demes.

## 5. Omisiones: ¿invalidan las conclusiones pretendidas?

| Conclusión pretendida | Veredicto |
|---|---|
| "Morfología/función evolucionan bajo selección, fitness implícito, mapa genotipo→fenotipo real" | ✅ **Sólida.** No invalidada. Es el logro real del modelo. |
| "Conducta 100% emergente / cero estrategia cableada" | ⚠️ **Parcialmente invalidada** por el `seedBrain`. Defendible: "conducta neuronal que evoluciona y aprende desde un arranque sembrado". |
| "Especiación emergente sin métrica curada (D14)" | ❌ **No demostrada.** La curación se reubicó; el nº de especies (~32) es un **conteo de cobertura voraz** (`test/m7-speciation.mjs:15`) = *dispersión*, no componentes aislados; el aislamiento por similitud con umbral da compatibilidad **no transitiva** (estructura clinal/de anillo), no especies discretas. |
| "Selección sexual load-bearing (D16)" | ❌ **No cumplida.** Sin preferencia evolvable ni canal de Fisher. |
| "Eje r/K emergente sin `size.min`" | ⚠️ **Parcial.** La talla evoluciona y paga física (bien, sin `size.min`), pero la *asignación reproductiva* es constante global → r/K amputado respecto al diseño. |
| "Conservación materia + energía" | ✅ Sólida en régimen normal (ingeniería; salvedad A1 en la auditoría técnica). |

**Conjunto:** las omisiones **no invalidan la tesis contemplativa central** —Zenote 2 no pretende ser un simulador de
genética de poblaciones, sino de **evolución del desarrollo y la función**, y ahí es bueno y honesto—. Lo **sobre-vendido
frente al código** son las afirmaciones puntuales más fuertes: **D14** (especiación sin curación) y **D16** (selección
sexual con carga). Si figuran como resultados del proyecto, hoy **no están respaldadas** y deberían reformularse o
completarse.

## Estado (2026-06-19): honestidad D14/D16 procesada (pasos 1–3) ✅
Rama `biorefactor`. Subconjunto de honestidad (bajo riesgo: tests/métricas + texto, sin mecánica nueva):
- **D14 reformulado y MEDIDO (paso 2) ✅.** `test/m7-speciation` ya no cuenta el recubrimiento voraz como "especies"
  (era dispersión). Ahora calcula **componentes conexos** de un grafo de compatibilidad (arista si `phenoDistance <
  mateCompat`) + tamaños. Medido (3 seeds, 15k): ~61–71 componentes totales pero **solo ~16–23 con ≥3 miembros**, y el
  **mayor agrupa 26–53%** de la muestra → núcleo interfértil dominante + clústeres menores + muchos singletons. NO es ni
  una nube panmíctica única ni especies discretas limpias: estructura **clinal/parcial**. El GO de m7 ya **no gatea** un
  nº de especies; valida la MECÁNICA (recombinación válida + sexo + invariantes) y REPORTA la estructura como observable.
- **Brazo de control `seedBrain`-congelado (paso 3) ✅.** Nuevo flag `Sim({freezeBrain})` (seedBrain canónico para todos,
  sin mutación/recombinación/plasticidad del cerebro; la morfología sí evoluciona). `test/m6_3-behavior` corre 3 brazos.
  Medido: seedBrain vs aleatorio **1.81×** (el arranque sembrado YA es competente); evo+plast vs seedBrain **solo 1.18×**
  → **la conducta la sostiene el seedBrain, no la emergencia**. El "1.5× vs aleatorio" original medía el seed, no la
  evolución. Comentarios de código corregidos ("cero estrategia cableada" → "arranque sembrado que evoluciona/aprende").
- **D16 (paso 1): claim REBAJADA, no implementada.** No hay señal↔preferencia evolvable ni runaway de Fisher en el código;
  `mateCompat` es una métrica fenotípica fija de 3 ejes. Implementarla de verdad es la pista AMBICIOSA (mecánica nueva,
  no elegida). Comentarios de `sim.js` corregidos para no vender D14/D16. La afirmación honesta del proyecto: "apareamiento
  asortativo por forma con estructura reproductiva emergente clinal", NO "especiación discreta / selección sexual con carga".

## Primeros pasos sugeridos (cuando se procese), por impacto en la validez evolutiva
1. ~~Señal + preferencia evolvables (D16) **o** rebajar la afirmación~~ → **rebajada** ✅ (implementarla = pista ambiciosa, pendiente si se quiere el fenómeno).
2. ~~Componentes de un grafo de compatibilidad~~ ✅ HECHO (m7; clinal confirmado, núcleo 26–53%).
3. ~~Brazo de control `seedBrain`-congelado~~ ✅ HECHO (m6_3; el seed domina, evo aporta ~18%).
4. **SIGUIENTE** — Volver evolvables `reproE`/`investE` (genes, no constantes) para que el eje r/K emerja como promete 2.4.
5. Detalles de homología: marcas compartidas entre fundadores + preservar paralogía en la duplicación.
