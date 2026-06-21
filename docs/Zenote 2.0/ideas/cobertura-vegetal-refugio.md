# Cobertura vegetal = refugio de presa (Tier 3 de la veg de zenote1)

**Estado: ANOTADA (no implementada).** Parte del [análisis de adaptación de la vegetación de zenote1](archivo/vegetacion-de-zenote1-adaptar.md)
(§E / Tier 3). Tier 1 (parches migrantes + visual teal) y Tier 2 (reserva de rebrote + forrajeo por área∝talla) ya están hechos.

## Idea
La **vegetación viva da COBERTURA a la presa**: un animal cazado escapa al depredador con probabilidad ∝ vegetación local
(`prob_escape = coverStrength · veg_local`). Es un **estabilizador Lotka-Volterra** (como en zenote1): donde hay pasto denso,
la presa se esconde → amortigua el ciclo depredador-presa, protege la base herbívora, reduce los colapsos al ápice-carnívoro.

## Por qué encaja con zenote2
- Es una regla **FÍSICA de captura** (la espesura reduce la probabilidad de captura), NO un gen "esconderse" ni una estrategia
  cableada → respeta la emergencia (la conducta sigue saliendo del cerebro; esto solo modula la física de la depredación).
- Conserva (solo cambia SI la captura ocurre, no el balance materia/energía).
- Da a la vegetación un **segundo rol ecológico** (comida + refugio) → más profundidad.

## Implementación (boceto)
En el bloque de depredación de `sim.js`, al confirmar contacto con la presa: `if (rng.next() < coverStrength · W.veg[preyCell]/vegRef) → la presa ESCAPA` (no se captura este intento). Param `coverStrength` (SIM_P, UI «Cobertura del refugio»). Normalizar veg por una referencia (veg típico) para que `coverStrength·vegFrac ∈ [0,1]`.

## Riesgo a medir
Que la cobertura no AHOGUE a los carnívoros (si toda la presa escapa en zonas frondosas, los cazadores se extinguen). Medir
multi-seed la fracción carnívora y la pop con `coverStrength` ∈ {0, 0.3, 0.6}. zenote1 usaba ~0.65 con éxito, pero la economía
de zenote2 es distinta → calibrar.
