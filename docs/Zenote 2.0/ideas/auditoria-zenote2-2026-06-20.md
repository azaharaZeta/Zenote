# Auditoría Zenote 2 — modelo VIVO (animales + vegetación) · 2026-06-20

> Auditoría **técnica (arquitecto) + funcional (biólogo)** sobre el código vigente tras el **cambio de cimientos** del
> 2026-06-20 (fotosíntesis-en-el-genoma → **solo animales + vegetación parametrizada**). Reemplaza, para el modelo de hoy,
> a [`auditoria-tecnica-zenote2.md`](auditoria-tecnica-zenote2.md) y [`auditoria-biologica-zenote2.md`](auditoria-biologica-zenote2.md)
> (que auditaron el modelo PREVIO; su eje de ingeniería y casi toda su biología siguen vigentes — ver sus banners).
> Fuente de verdad del estado: [`../MODELO-ACTUAL.md`](../MODELO-ACTUAL.md) + `zenote2/src/config.js`.
>
> **Método:** lectura del motor completo (9 módulos) + render/UI + tests; gate corrido (8/8 verde); **medición headless**
> (3 semillas a 30k con la config del dorado + 2 semillas a 30k con la config de producción + barridos a 50k). Las cifras
> de aquí son medidas, no estimadas.

---

## Veredicto

Ingeniería **madura y honesta**; modelo **genuinamente darwiniano y ecológicamente mejor que su predecesor**. El cambio de
cimientos resolvió el colapso a sesilidad del modelo-foto y logró lo que el baseline de v1 casi nunca lograba: **una red
trófica de tres niveles que persiste de forma robusta**. La auditoría destapó un hallazgo nuevo — **la locomoción decaía con
el tiempo evolutivo** — que se ha **corregido en esta misma pasada** (escape-por-velocidad `fleeSpeed`, ver abajo).

---

## 1. Assessment técnico (arquitecto)

**Fortalezas**
- **Capas limpias + frontera genotipo→física explícita y comentada** (`config` → `genome` → `develop` → `phenotype` → `sim`
  → `worker` → `main`). Hace auditable la regla #1 (emergencia). Motor↔render desacoplados (Web Worker + typed arrays transferibles).
- **Disciplina de rendimiento real:** SoA + pooling + spatial hash O(n) toroidal + nacimientos diferidos + sin asignaciones
  en el bucle caliente. ~1000-2000 t/s headless.
- **Determinismo + conservación como tests:** mulberry32 + checksum dorado (m8) + gate runner (`npm run test:zenote2`).
  Materia conservada a ruido f32 (deriva 0.000-0.004% a 30k, medido). El backlog técnico del 2026-06-19 (A1/M1–M5/B1–B6)
  está realmente cerrado.
- **Los tests SIGUEN al modelo nuevo** (0 referencias a `photo` en `test/`). La integridad de la suite está intacta.

**Hallazgos (por severidad)**
| Sev. | Hallazgo | Estado |
|---|---|---|
| 🟠 | **Deriva doc↔código:** README/auditorías/`02-Redesign` describían el modelo de fotosíntesis. | **RESUELTO** esta pasada (banners + sync de README + MODELO-ACTUAL + esta auditoría). |
| 🟠 | **`step()` es una god-function** de ~150 líneas (sensado+cerebro+3 ingestas+metabolismo+plasticidad+repro); tests solo a nivel de invariante. | Abierto (no urge). Extraer `_graze/_hunt/_metabolize/_reproduce` daría unit tests de borde. |
| 🟡 | **Sin CI** (el gate se corre a mano; ~80s). | Abierto (GitHub Action en backlog de ideas). |
| 🟡 | **Render por-agente** puede ahogarse si la pob sube mucho (hoy energía-limitada a ~400-480 ≪ cap → no es problema). | Abierto (tener toggle de calidad si la pob despega). |

## 2. Assessment funcional (biólogo)

**Lo que es de verdad fuerte (medido)**
1. **Estructura trófica persistente y emergente:** herbívoros + carnívoros + carroñeros coexisten a 30-50k en TODAS las
   semillas (≈65/15/20% por dieta). **El cazador NO se extingue** (el baseline de v1 lo perdía en 5/5 a mundo 1000).
   Mortalidad **depredación-dominante** (~2:1 vs inanición) → control top-down real.
2. **Nicho por DIETA, no por morfología** (la misma boca pasta/caza/carroñea; el eje herbívoro↔carnívoro emerge de a qué
   dedica el esfuerzo). Respeta la regla #1.
3. **Diversidad genuinamente emergente:** arrancando de **clones** (diversity=0), la talla se dispersa a σ≈2.0 y aparece la
   estructura trófica. No está sembrada.
4. **Conservación termodinámica real:** materia cerrada + energía luz→calor. Sin `carcassValue` ni `eDensity` (eD=0) → **no
   se crea energía** (mejora conceptual sobre v1, que sí la creaba).
5. **Fitness implícito + Baldwin (no Lamarck) + mapa genotipo→fenotipo generativo** (intactos del modelo previo).

**Debilidades / afirmaciones a re-calibrar**
- 🔴→✅ **La locomoción decaía** (el hallazgo nuevo). Ver §3 — **corregido**.
- ⚠️→✅ **`mouthCap` inflaba casi neutra** (~50×: la economía es digestión-limitada → la boca era redundante y derivaba al
  alza con el cuerpo). **CORREGIDO** con un coste de mantenimiento de la boca (`SIM_P.mouthCost`) → la ingesta pasa a
  selección. Ver §6.
- ⚠️ **D16 (selección sexual con carga): no se cumple.** `mateCompat`/`phenoDistance` es métrica fija de 3 ejes
  (masa/mouthCap/maxMouthR), sin señal↔preferencia evolvable ni runaway de Fisher. (Carry-over, vigente.)
- ⚠️ **D14: especiación clinal, no discreta** (núcleo interfértil + clústeres + singletons). (Carry-over, ya reformulado en m7.)
- ⚠️→✅/∅ **Eje r/K:** `reproE`/`investE` ya son **genes** (`reproK`/`investFrac`, ver §5) — pero **MEDIDO: el eje r↔K NO
  diverge** (near-neutral). Hallazgo, no fracaso: ver §5.
- ⚠️ **Conducta sembrada, no de cero** (seedBrain; la evolución del cerebro aporta ~18%). Defendible, no "100% emergente".
- Haploide, sin genética mendeliana: legítimo por diseño (modelo de evo-devo, no de genética de poblaciones).

## 3. Fix aplicado en esta pasada: escape-por-velocidad (`fleeSpeed`)

**Problema (medido):** sin presión que premie la velocidad, el músculo (caro: coste de masa super-lineal + arrastre +
`moveCost·v²`) se podaba. La depredación era por **contacto** dentro de `maxMouthR+eatReach`, sin escape por velocidad
relativa → la velocidad no era ni defensa ni ataque → **la locomoción decaía monótonamente**:

| `fleeSpeed` | spMean@30k | vmax@30k | spMean@50k | músculo% | cazador (C) | veredicto |
|---|---|---|---|---|---|---|
| **0.0** (antiguo) | 0.197 | 0.29 | **0.18** (sigue cayendo) | 22-30% | 27-66 | a paso de tortuga |
| **1.0** (nuevo def) | 0.37 | 0.48 | **0.30** (meseta) | 29-33% | 37-52 | **vivo y estable** |
| 1.5 | 0.39-0.45 | 0.49-0.56 | — | 25-33% | 21-43 | rápido pero exprime al cazador |

**Mecanismo:** la presa escapa de la captura si corre más rápido que el depredador (× `fleeSpeed`) → ser rápido es **defensa
(huir)** y **ataque (alcanzar)** → carrera armamentística que mantiene el músculo bajo selección. CONSERVA (un escape = no
hay kill). Sigue sin estrategia cableada (el cerebro decide hacia dónde/cuánto correr). `fleeSpeed=0` = comportamiento antiguo.

**Resultado (50k, decisivo):** con `fleeSpeed=1.0` la locomoción **se estabiliza en meseta** (spMean ~0.30, vmax ~0.41) en vez
de seguir cayendo — **no solo retrasa el decaimiento, lo detiene**. Coexistencia intacta (cazador sano, pob estable ~435,
incluso un poco MENOS bloat). `fleeSpeed=1.0` elegido por equilibrio locomoción↔robustez del cazador.

**Cambios:** `sim.js` (gate de captura por velocidad) · `config.js` (`SIM_P.fleeSpeed=1.0`, UI) · `index.html` + `main.js`
(slider de laboratorio "Escape por velocidad") · `m8` dorado re-fijado `0x5a8fb59e → 0xe5d3f569` (física intencionada). Gate
**8/8 verde**. Spike reproducible: `zenote2/spikes/flee-speed/` (`run.mjs` barrido, `hold50k.mjs` confirmación de meseta).

## 4. Siguientes pasos (por orden de impacto)
1. ~~**r/K evolvable**~~ → **HECHO (genes) + HALLAZGO NULO de divergencia.** Ver §5.
2. ~~**Boca bajo selección, no deriva**~~ → **HECHO** (coste de boca `mouthCost=0.001`). Ver §6.
3. **D16 real** (señal↔preferencia evolvables) o seguir con la afirmación rebajada (asortativo por forma, clinal).
4. ~~**CI** que corra el gate en cada push~~ → **HECHO** (`.github/workflows/zenote2-gate.yml`: corre `npm run test:zenote2` en push/PR que toquen `zenote2/**`).
5. ~~**Promover spikes a tests de regresión** (anti-bloat + balance trófico)~~ → **HECHO** (`test/m9-ecology.mjs`, en el gate: ancla coexistencia trófica + anti-bloat + conservación a escala de ecosistema, con umbrales generosos y seeds fijos → determinista, no flaky; cubre el hueco que el dorado m8 no ve).

## 5. r/K evolvable — HECHO + hallazgo nulo de divergencia (2026-06-20)

**Hecho:** `reproE` (umbral de cría) e `investE` (energía por cría) eran CONSTANTES globales; ahora son **genes** heredables/
mutables/recombinables: `reproK` (multiplicador del umbral sobre el baseline `SIM_P.reproE`, que sigue siendo la palanca del lab)
e `investFrac` (energía por cría = fracción del umbral propio). Fundador idéntico a los defaults previos (reproK=1, investFrac=
0.4375). Conserva, **gate 8/8 verde**, dorado `0xebd987f9`. El inspector muestra el umbral e inversión PROPIOS de cada organismo.

**Hallazgo (medido, 3 semillas × 30k + barrido de disturbio):** el eje **r↔K NO diverge** — `reproK` se queda en 1.0±0.1 e
`investFrac` en 0.44±0.07, sin diferencia por nicho (herbívoro≈carnívoro) ni correlación con la talla. **Causa (mecanística):**
la pecera es **cerrada y está saturada** (natalidad limitada por la MATERIA local, no por la fecundidad del progenitor) → hacer
más crías no sube el fitness (mueren en la competencia) → la *calidad* (K) iguala o gana a la *cantidad* (r). Es ecología real:
la **r-selección exige entornos NO saturados / en expansión** que un equilibrio cerrado no ofrece. Probado bajo **disturbio**
(flujo de luz ×10, mortalidad ×3, ambos) → sigue sin diverger (si acaso, el flujo alto empuja LEVEMENTE a K). Spike reproducible: `zenote2/spikes/rk-lifehistory/run.mjs`.

**Se probó y se REVIRTIÓ** un mecanismo de **NIDADA** (presupuesto fijo repartido en N crías: investFrac bajo→muchas baratas)
para forzar el trade-off: **cero divergencia medida** (98-100% nidada=1 en todos los regímenes) → revertido por la regla del
proyecto "no añadir complejidad sin beneficio medible" (precedente M6.4 / eDensity-off / boom-bust). 

**Decisión:** se **mantienen los genes** (dial→gen, lo pedía la auditoría biológica; conserva; sustrato correcto para una futura
dinámica abierta/perturbada donde r/K SÍ podría expresarse) y se documenta el resultado nulo. **NO perseguir r/K** sin abandonar
la premisa de pecera-cerrada-en-equilibrio (lo cual choca con la conservación, que es el alma del proyecto). Resultado honesto.

## 6. Boca bajo selección — HECHO (coste de boca) (2026-06-20)

**Problema (medido):** `mouthCap` (capacidad de ingesta) **inflaba ~50×** sobre lo funcional (mouthCap **55±48**, 95% > 5; la
boca funcional ≈ 1.2) porque la economía está **limitada por DIGESTIÓN** (`digestRate=0.6/tick`), no por ingestión → una boca
grande es redundante y, costando lo mismo que cualquier tejido (vía masa), **derivaba al alza** con el cuerpo. La morfología de
ingesta no estaba bajo selección.

**Fix:** `SIM_P.mouthCost` = coste metabólico de mantenimiento ∝ mouthCap (energía → calor, CONSERVA). El aparato de ingesta
**paga su precio** → selección hacia el tamaño funcional (el mínimo que mantiene alimentado al animal, dependiente del alimento).

**Resultado (medido, spikes/mouth-cost, 30k):** con `mouthCost=0.001` la boca **deja de inflar**: mouthCap 55→**~9** (6× menos),
distribución ABIERTA (no 95% saturada). **Coexistencia intacta** (cazador 26-37, herbívoros y pob ↑, menos bloat, conserva).
0.004 ya exprime al cazador (→7). **Diferenciación de nicho EMERGENTE (lo mejor):** a 0.001 el **carnívoro mantiene boca ~2× la
del herbívoro** (carn ~18-20 vs herb ~9-10; a 0 ambos inflados sin señal) → la morfología de ingesta ahora **refleja el oficio**
(la boca grande del depredador paga su coste manejando presa; el pastador la recorta). Eso es "boca bajo selección".

**Cambios:** `sim.js` (término `+mouthCost·mouthCap` en el metabolismo) · `config.js` (`SIM_P.mouthCost=0.001`) · `m8` dorado
re-fijado `0xebd987f9 → 0xf5375391` (física intencionada). Gate **9/9 verde** (m9 confirma coexistencia + anti-bloat). Spikes:
`zenote2/spikes/mouth-cost/` (`run.mjs` barrido, `role.mjs` diferenciación de nicho).

## 7. Especiación: homología compartida (#4) HECHO · barrera post-cigótica (#3) NULA → revertida (2026-06-20)

Objetivo: cerrar **D14** (la estructura reproductiva es CLINAL, no especies discretas) añadiendo aislamiento POST-cigótico (híbridos
de padres divergentes menos viables → selección disruptiva contra intermedios → ¿morfos discretos?). Plan #4→#3.

**#4 — Homología compartida (HECHO, KEEPER):** el módulo del fundador (par de aletas) tenía marca de homología ÚNICA por fundador
(`HOM++`) → al recombinar dos linajes ese módulo NO alineaba → se heredaba como "presente en uno solo" (prob 0.6) → un hijo podía
salir con **0, 1 o 2 pares de aletas al azar** (recombinación entre linajes = ruido, no homóloga). Fix: marca **FIJA compartida**
(`FOUNDER_HOM=1`) → todos los fundadores la comparten → la recombinación entre linajes alinea el módulo ancestral (hereda UNO, como
los padres). Corrección real (no cosmética). `genome.js`. Dorado `0xf5375391 → 0xe8984a53`.

**#3 — Barrera post-cigótica (PROBADA → REVERTIDA, resultado NULO + contraproducente):** `SIM_P.postZygotic` penalizaba la energía
del híbrido ∝ distancia fenotípica parental (Dobzhansky–Muller; conserva, la parte malograda → calor). Barrido `postZygotic{0,2,4} ×
mateCompat{0.5,1.5}`, 30k, 2 seeds (`spikes/postzygotic`): **(a)** el morfo INTERMEDIO (omnívoro morfológico) NO baja (~50-66% en
todos los casos) → **no discretiza**; **(b)** erosiona al **cazador** (dieta carnívora 58→24 a mateCompat 0.5; 81→14 a 1.5) — la
penalización golpea al EXTREMO RARO (la pareja de un carnívoro suele ser menos carnívora → distancia alta → cría penalizada), no al
centro. **Causa:** sin **preferencia de apareamiento EVOLVABLE (D16)** no hay **refuerzo**; y seleccionar contra híbridos en una
pecera cerrada/saturada adelgaza la minoría extrema en vez de partir el grueso. Revertido (sim.js + config). Patrón r/K / boom-bust:
resultado nulo honesto. **D14 sigue clinal.** Cerrarlo de verdad exigiría D16 (preferencia evolvable) — mecánica nueva, no elegida.
