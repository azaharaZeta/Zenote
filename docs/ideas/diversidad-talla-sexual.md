# Diversidad de talla bajo reproducción SEXUAL

> Ficha de idea · **estado: pendiente** · mem. `sexual-repro-flattens-size`.
> Índice: [indice-ideas.md](indice-ideas.md).

**Problema (medido):** la repro solo-sexual APLANA la diversidad de talla — la mezcla grande×pequeño regresa los extremos
a la media (mem. `sexual-repro-flattens-size`). La asexual la conserva, pero el default es sexual.

**Vía (si se retoma):** bajar `repro.speciesGenThreshold` (y/o `mateRadius`) para que los grupos de talla ESPECIEN y dejen
de cruzarse (los extremos no se promedian). **Riesgo de Allee** si el umbral es muy bajo (no encuentra pareja → bajones).
Nota colateral: bajo sexual, `diet.omniPenalty` rinde mejor a ~0.05 que a 0.15. Medir umbral vs estabilidad.
