# Cadáveres CON FORMA que se desvanecen con su carroña (#3, "A5")

**Estado: IMPLEMENTADA (2026-06-20).** Hermana de [detrito comestible](detrito-comestible-carronero.md) (#4):
los cadáveres SON la carroña — #3 los hace visibles, #4 los hace comestibles.

## Petición
Muerte visible: cuerpos muertos con su forma que se desvanecen con su carroña ("A5" del estudio de color/fascinación).

## Qué se implementó (render puro — NO toca la dinámica → byte-idéntico)
- **Motor (`sim.js`)**: buffer CIRCULAR acotado de muertes recientes (`CORPSE_CAP=400`): posición, rumbo final, tono de
  linaje, tick de muerte y la forma (partes [lx,ly,r,aspect,dir]). `_recordCorpse(i)` se llama en las DOS muertes
  (inanición y depredación) ANTES de anular el genoma. Preasignado (sin asignaciones en el bucle caliente). Solo lo ESCRIBE
  el motor / lo LEE el snapshot; la dinámica no lo lee → no cambia el checksum (dorado intacto, confirmado).
- **Worker (`worker.js`)**: el snapshot envía los cadáveres con edad < `CORPSE_LIFE` (240 ticks ≈ lo que tarda su carroña
  en mineralizarse con decompose 0.02), aplanados como los organismos (offset + stride 5) + `dcfade` = edad/vida.
- **Render (`main.js`, `drawCorpses`)**: bajo el glow de los vivos, silueta del cuerpo en su orientación final (sin
  ondulación ni ojos), en el tono del linaje muy DESATURADO y OSCURO; alpha y luminosidad caen con el fade → se funde con
  el fondo a la vez que su carroña se consume/mineraliza. Culling + LOD (salta partes diminutas).

## Verificación
Preview en origen FRESCO (puerto distinto — ver nota de caché): `dcm=13` cadáveres fluyendo con fades 0.6-0.97 (distintas
fases de descomposición); screenshot a zoom 10 muestra siluetas oscuras desvaneciéndose bajo los organismos vivos.
Coherente con la estética abisal. Gate 8/8 verde.

## Nota de caché del preview (importante)
SimpleHTTP no manda Cache-Control → el navegador del preview cachea el GRAFO DE MÓDULOS DEL WORKER y `new Worker(url)` no
lo refresca aunque main.js sí. Workaround fiable: arrancar el preview en OTRO PUERTO (origen nuevo = sin caché). Ver
[[preview-simplehttp-caches-main-js]].

## Posible refinement (no hecho)
Acoplar el fade del cadáver al `detritusE` real de su celda (que se desvanezca MÁS RÁPIDO cuando un carroñero lo come, no
solo por edad). Se dejó por fijo (lifespan) por simplicidad; la sinergia narrativa #3+#4 ya se ve (carroñeros sobre cadáveres).
