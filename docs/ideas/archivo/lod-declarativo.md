# LOD declarativo: desacoplar los umbrales de la lista de elementos visuales

> Ficha de idea · **estado: ✅ HECHO (2026-06-17)** (alcance acotado, ver abajo) · render, sin cambio de comportamiento.
> Índice: [indice-ideas.md](../indice-ideas.md) · CHANGELOG: `../../CHANGELOG.md`.

## Problema
Los gates LOD por-organismo (ojos, señuelo, onda, halo) tenían **dependencia dura** replicada a mano: el mismo
`rPx > lodX·lm` se escribía por separado en el dibujo en VIVO (`_drawAgents`/`_drawBodyGraph`) y en el HORNEADO del sprite
(`_bakeSkeleton`) → frágil, fácil de desincronizar (ya causó una costura vivo↔sprite en el señuelo).

## Hecho
Registro ÚNICO `LOD_ELEMENTS` (`{ name, key }` → clave de umbral en `config.render`) + un gate compartido
`Renderer._lodVisible(name, rPx)` (`full/ultra → siempre; si no, rPx > umbral·lodMul`). Lo consultan POR IGUAL el dibujo en
vivo y el horneado → **imposible desincronizar**. Sustituidos los gates inline de `eye`/`lure`/`wave`/`halo` en
`_drawAgents`, `_drawBodyGraph` y `_bakeSkeleton`. Añadir un elemento = una entrada en `LOD_ELEMENTS` + su llamada al gate.

**Sin cambio de comportamiento:** verificado por EQUIVALENCIA (barrido `rPx` × {eye,lure,wave,halo} × lodMul {1, 2.6} ×
{alta, baja}: 784 comprobaciones, **0 discrepancias**; ultra siempre dibuja) + render visual correcto + consola limpia.

## Alcance (qué NO entró, a propósito)
Se dejó como estaba lo que ya tenía **fuente única** (no es la fragilidad): los TIERS punto/elipse/grafo
(`lodBody`/`lodFull`, solo en `_drawAgents`) y los gates POR NODO (`lodOutline`/`lodFlat`/`lodTexture`, solo en `_drawNode`,
compartido por vivo y horneado). La tabla los documenta. La versión "ideal" de la ficha (tabla con `dibuja(...)` sobre la que
iterара el dispatch) se descartó por riesgo/over-engineering: las llamadas de dibujo tienen firmas muy distintas y el problema
real (desincronía de gates cross-site) ya queda resuelto con el gate compartido.
