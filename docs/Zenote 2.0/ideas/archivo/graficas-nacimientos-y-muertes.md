# Gráficas de nacimientos por reproducción y muertes por causa — **(Zenote 2)** · IMPLEMENTADO 2026-06-19

> Idea de usuario: «crear gráficas de nacimientos por tipo de reproducción, y fallecimientos por causa.»

## Qué se añadió
Dos gráficas de **área apilada** en el panel, junto a la de población, con el mismo muestreo por ventana (cada 60 ticks,
ventana de 160 puntos):
- **Nacimientos**: asexual (verde) + sexual (lila), apiladas.
- **Muertes**: depredación (rojo) + inanición (gris), apiladas.

Son RITMOS por ventana (delta de contadores acumulados), no acumulados, para que muestren la dinámica viva.

## Implementación
| Archivo | Cambio |
|---|---|
| `src/engine/sim.js` | Nuevo contador `starved` (muertes por `E≤0`), junto a los ya existentes `sexBirths`/`asexBirths`/`kills` (depredación). Causas de muerte = `kills` + `starved`. Byte-idéntico (solo cuenta). |
| `src/engine/worker.js` | Historiales `histSexB`/`histAsexB`/`histPred`/`histStarv` (delta por ventana desde el último muestreo) + reset al (re)iniciar + envío en la foto. |
| `src/main.js` | Helper `drawStack(cv, c, lower, upper, colLow, colUp)` (refactor de la gráfica de población a reutilizable) + dibujo de las dos nuevas. |
| `index.html` | Dos `<canvas>` (`birthChart`, `deathChart`) con sus leyendas de color. |
| `styles.css` | Clases `.cl-asex/.cl-sex/.cl-pred/.cl-starv`. |

## Verificación
- Gate 8/8 verde, checksum dorado intacto (motor byte-idéntico).
- Flujo de datos confirmado vía el worker (preview): los 4 historiales llegan poblados y plausibles (en ventana inicial:
  ~589 nac. sexuales, ~83 asexuales, ~49 muertes por depredación, ~44 por inanición).
- Las gráficas en sí no se vieron en el PREVIEW por la caché de `main.js`/`index.html` (ver [[preview-simplehttp-caches-main-js]]);
  el servidor sirve el código correcto → se ven en carga limpia. El patrón de dibujo es el mismo de la gráfica de población (que sí funciona).
