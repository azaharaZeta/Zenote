# Zoom mínimo = mundo entero — **(Zenote 2)** · IMPLEMENTADO 2026-06-19

> Idea de usuario: a zoom 0.5× aparecían varios mundos en mosaico; restringir el zoom mínimo a 1.0.

`main.js`: `MINZ` 0.5 → **1** y el slider `#zoom` `min` 0.5 → 1. A zoom 1.0 el mundo entero cabe (la dimensión menor llena
el viewport); no se puede alejar más. (En apaisado aún se ve el toro rellenando el lado ancho —decisión de VISUAL.md:
mosaico sin barras—, pero ya no se ven mundos completos repetidos.) Render/UI puro.
