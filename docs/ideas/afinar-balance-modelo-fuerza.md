# Afinar balance del modelo de fuerza

> Ficha de idea · **estado: pendiente** (flecos del modelo de fuerza) · 2026-06-17.
> Índice: [indice-ideas.md](indice-ideas.md).

El modelo de fuerza quedó consolidado y re-balanceado (`carcassValue 0.14` + `refuge 0.45` + `moveCost 0.02` +
`handlingTime 48`); la **zancada por talla** (`speedSizeExp` 0.5) subió la diversidad y **redujo** la cola de colapso al
ápice-carnívoro. Fleco que queda:
- **Carroñeros finos** (~0.13-0.23 vs 0.36 base): al bajar `carcassValue` perdieron recompensa de carroña.

**Levers a probar (sin re-subir `carcassValue`):** `scavPenalty`↓ / `carrionAbsRate`↑ (revivir carroñeros), o un
**barrido sistemático** multi-parámetro. Detalle en mem. `locomocion-modelo-fuerza`.
