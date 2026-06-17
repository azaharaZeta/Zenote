# Repurposar el gen `speed` → capacidad muscular

> Ficha de idea · **estado: HECHA** · 2026-06-17 · archivada (congelada).
> Índice: [../indice-ideas.md](../indice-ideas.md) · Mecánica final: `SPEC_EVOLUCION.md` §2bis (`loco.muscleMin/Max`, `energy.k_muscle`); frontera en `organism.js`.

## Idea (original)
En el modelo de fuerza el esfuerzo lo decide el cerebro tick a tick y la capacidad se computa a tope (`effort=1`), así que
el gen `speed` quedó **inactivo** (deriva neutral, aún cuenta en la distancia genética). Convertirlo en **inversión en
musculatura** → escala la capacidad de empuje (`vmax`) y cuesta basal mantenerla; el cerebro decide cuánto de esa capacidad
USA. Añade un trade-off r/K (músculo potente que no usas = caro) y le devuelve sentido al gen.

## Cómo quedó
- `muscle = muscleMin + (muscleMax−muscleMin)·speed` (0.6…1.4, neutro ×1 al sembrado `speed`≈0.5).
- `vmax *= muscle` (capacidad de empuje) y `baseCost *= (1 + k_muscle·(muscle−1))` (mantenimiento ∝ exceso sobre el neutro).
- Etiqueta de gen: «Musculatura». Slider `energy.k_muscle` (Locomoción y visión). Modelo viejo: `speed`=esfuerzo → muscle=1 (sin cambio).

## Resultado (medido, headless 25k, multi-seed)
- Fenotipo: `speed` 0→1 mueve `vmax` ×2.3 y `baseCost` ×1.6 (antes inerte).
- **Emergencia:** la musculatura DIVERGE por nicho desde el sembrado neutro 0.5 → **carroñeros ~0.2** (sedentarios, cuerpos
  lentos y baratos), **herbívoros/cazadores ~0.6** (necesitan velocidad para huir/perseguir). Gen bajo selección, no codificado.
