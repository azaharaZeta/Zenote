# Por qué la resolución no cambia los FPS

> Ficha de idea · **estado: investigación** · 2026-06-17.
> Índice: [indice-ideas.md](indice-ideas.md).

El ajuste de resolución (slider `maxInternalPx`) no parece mover los fps (mínima vs máxima ≈ iguales). **Hipótesis:** el
tope de FPS (`maxFPS`) los limita por debajo del coste real de pintar → no se nota; o el cuello, a los tamaños probados,
está en el motor/otra cosa y no en los píxeles. Contrastar con la memoria `render-perf-resolution-bound` (que midió el
render como pixel-bound). **Medir** fps SIN cap a varias resoluciones para aislar el efecto.
