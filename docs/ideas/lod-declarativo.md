# LOD declarativo: desacoplar los umbrales de la lista de elementos visuales

> Ficha de idea · **estado: pendiente** (arquitectura/mantenibilidad del render).
> Índice: [indice-ideas.md](indice-ideas.md).

Los parámetros del LOD tienen **dependencia dura** con la lista de elementos visuales (cuerpo, ojos, señuelo, onda, halo +
por-nodo). Cada uno es un `lodX` suelto con su gate cableado a mano en VARIOS sitios (`config.js`, `_drawAgents`,
`_drawBodyGraph`, `_bakeSprite` — replicar el gate) → frágil, fácil de desincronizar (ya causó una costura vivo↔sprite en
el señuelo). **Vía:** una **tabla declarativa** `{ nombre, umbral, aplica(rPx), dibuja(...) }` sobre la que iteren el
dispatch y el horneado → añadir un elemento = una entrada; el caché hereda el mismo gate. Refactor acotado, sin cambio de
comportamiento. No urge; rentable si se añaden más elementos o junto al **esqueleto** (sprites por nodo).
