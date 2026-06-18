# SPIKE M1 — techo de coste en tiempo real (R2) → **GO**

> Riesgo R2 de 2.5: ¿caben los mecanismos MÁS caros del modelo nuevo (cerebro neuronal por tick + plasticidad
> Hebbiana + campo de ocupación + productores-como-agentes) en tiempo real, a escala? Agentes "tontos" que ejecutan
> solo esas operaciones. Reproducir: `node zenote2/spikes/m1-cost/run.mjs 400`

## Veredicto: **GO** ✅ — cabe con holgura, sin necesitar fallbacks

Presupuesto: 20 t/s → **50 ms/tick**. Motor en Web Worker (hilo aparte del render → presupuesto independiente).

| Régimen | pop | pesos/red | fwd+plasticidad | t/s | margen |
|---|---|---|---|---|---|
| **Realista** (red pequeña/media, la que el desarrollo produce) | 3000–5000 | 222–566 | **2.6–8.2 ms** | 122–391 | 6–19× |
| **Pesimista** (red grande + pop alta) | 5000 | 1038 | **13.1 ms** | 76 | 3.8× |

Todos los casos `< 50 ms/tick`. Incluso el peor (5k agentes × ~1000 pesos × forward+plasticidad por tick) corre a
**76 t/s**, casi 4× el objetivo.

### Desglose del coste
- **Base** (sensado por hash + ocupación + mover, sin red): 0.7–1.5 ms/tick → confirma M0 (la base no es el cuello).
- **Forward** del cerebro (Elman): el coste DOMINANTE (añade ~1–7 ms según tamaño de red).
- **Plasticidad** (Hebbiano por sinapsis, O(pesos)/tick): añade solo **~30–60%** sobre el forward — **NO es el
  asesino** que 2.5 temía. (5k×1038: fwd 8.8 ms → +plast 13.1 ms.)
- **Memoria** de los pesos por agente: ≤ 21 MB (5k × 1038) — trivial para navegador.

## Implicación
- **R2 retirado (GO).** La plasticidad en vida (la pieza que 2.5 marcó como la más cara y la única graduable) **cabe
  directamente**, sin degradar a "aprender cada N ticks" ni a "campo de productores". Esos fallbacks quedan como
  **margen** para redes mayores, poblaciones mayores, o para dejar presupuesto a otras tareas.
- El **desarrollo mantiene las redes pequeñas** (2.2/2.3) → el régimen realista (~hundreds de pesos) tiene holgura
  de 6–19×.

## Caveats (honestidad)
- Medido en Node/V8 monohilo, sin render. Como el motor irá en **Web Worker** (hilo separado), es representativo del
  presupuesto real del motor; el render compite aparte (otro hilo).
- Forward de MLP densa = cota superior razonable para un nº de pesos dado; una topología desarrollada podría ser más
  dispersa (más barata).
- Probado hasta 5k agentes / 1038 pesos. Si la escala real superara eso, entran los fallbacks (con margen probado).
- No mide el coste del **desarrollo** (se computa una vez al nacer, no por tick → amortizado, como en la app actual)
  ni de la **recombinación por homología** (evento puntual al reproducirse, no por tick → despreciable).

## Estado de los spikes de de-risking
- **M2 (coexistencia, R1)** ✅ GO · **M1 (coste, R2)** ✅ GO · **M3 (convergencia del genoma, R3)** ⬜ pendiente.
Dos de los tres riesgos que podían tumbar el rediseño, retirados. Falta M3 antes de levantar la pila por capas (M4→).
