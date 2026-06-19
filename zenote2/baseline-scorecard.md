# Baseline scorecard — app ACTUAL (Zenote v1)

> **M0.** La vara de medir: la emergencia que la **app nueva (Zenote 2)** deberá **igualar o superar** (roadmap
> [`2.6 §4`](../docs/Zenote%202.0/02-Redesign/2.6-reconstruction-roadmap.md)). Medido **headless, multi-seed**, sobre la
> app actual con su **config de producción**, **sin tocarla** (solo importada). Harness: `zenote2/test/baseline-current.mjs`.
>
> Reproducir: `node zenote2/test/baseline-current.mjs 20000 1,2,3,4,5 1000` (ticks, seeds, tamaño de mundo).

## Resultados (20.000 ticks — régimen estable)

| Métrica | Mundo 1000 (5 seeds) | Mundo 2000 (3 seeds) |
|---|---|---|
| **Coexistencia (cadena PLENA)** | **2/5** | **1/3** |
| Con depredador vivo | 2/5 | 2/3 |
| Cazador ápice (`hunt` medio) | **0%** (extinto en las 5) | 12% (vivo en 2/3) |
| Gremios (% medio) | herb 89 · scav 10 · hunt 0 · omni 2 | herb 87 · scav 1 · hunt 12 |
| Población media | 1397 (47% techo) | 2491 (83% techo) |
| Diversidad de talla (szStd) | 1.56 | 0.75 |
| Especies (nSpec, proxy) | 18.0 | 14.3 |
| Diversidad morfológica (fdiv) | 0.022 | 0.022 |
| Evenness trófica (H) | 0.27 | 0.35 |
| Veredictos | PLENO,PLENO,SIN-DEPRED,MONO,MONO | PLENO,MONO,MONO |

**Estructurales (independientes de seed/size):**
- **Parámetros (config): 165 = 136 simulación + 29 render.** ← el nº que el rediseño quiere llevar a ~12-15 constantes físicas (~0 diales de balance).
- **Perf motor headless: 441–823 t/s** (según población; el render es aparte).

## Lectura honesta (qué bar hay que batir, de verdad)

1. **La coexistencia trófica del baseline es FRÁGIL y estocástica, no robusta.** Agregando ambos tamaños: cadena
   PLENA en **~3 de cada 8 seeds**; depredador vivo en ~4/8. El **cazador ápice es extinción-propenso** (0/5 a
   mundo 1000; 2/3 a mundo 2000) — coincide con las memorias del proyecto (`cazador ápice estocástico/frágil`,
   Allee en mundos pequeños). 3/5 y 2/3 seeds **colapsan a monocultivo herbívoro**.
2. **Implicación para el riesgo R1 / hito M2 (la puerta make-or-break):** el listón de coexistencia que la app
   nueva debe batir es **modesto** — no tiene que superar un ecosistema robusto, sino uno que **con 136 parámetros
   y estabilizadores cableados solo logra ~3/8 de cadena plena y pierde al cazador casi siempre**. Si la
   coexistencia EMERGENTE (tripa/saciedad + refugio espacial) iguala esto, ya es un empate con muchísimos menos
   parámetros; si lo supera, es la validación de la tesis.
3. **Dependencia del tamaño de mundo:** el mundo pequeño (1000) es el extremo frágil (Allee); el grande (2000)
   sostiene mejor al cazador pero satura antes el techo de pool. La app nueva deberá medirse **multi-size** también.

## Caveats de la medición
- Es una **foto a 20k** (el sistema es transitorio; el suelo de talla evita el colapso a >10k pero el ápice sigue
  fluctuando). Para M8 conviene repetir a 30-40k.
- `nSpec` es un proxy **greedy** por distancia genética (no el clustering k-means del worker) → sobreestima; sirve
  como número **relativo** comparable entre app vieja y nueva con el mismo método.
- **Repertorio conductual NO medido aquí** (requiere instrumentar el cerebro; se añade cuando la app nueva tenga
  conducta, M6). 
- Render fps no medido (headless); la app actual ya tiene su perfil de render documentado.

## Veredicto de M0
Baseline **capturado y reproducible**. Junto con el **andamio** ([README](README.md)) — que tickea a 10k agentes
con holgura y es determinista — **M0 queda CERRADO**. Próximo: spikes de de-risking **M1 (coste)** y, sobre todo,
**M2 (coexistencia emergente)**, cuyo listón a batir es justo esta tabla.
