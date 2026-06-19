# Fondo del abismo — **(Zenote 2)** · IMPLEMENTADO (estético) 2026-06-19

> Idea de usuario: "Fondo del abismo. Meter algo estético, o incluso pensar en algo funcional en el ecosistema."

## Hecho — versión ESTÉTICA (render puro, no toca la sim)
El sustrato era una **rejilla de cuadrados** (`fillRect` por celda del campo de luz) — técnica y bloqueada. Ahora el campo
de luz (estático) se hornea a una **mini-textura** (1 px/celda, `lightCv` vía `createImageData`/`putImageData`) y se
reescala **SUAVIZADA** (`imageSmoothingEnabled=true`, bilinear) a cada tile del mundo → una **nebulosa fosforescente
teal/algas tenue** sobre el abismo, sin cuadrícula ni costuras, que sigue mostrando dónde se acumula la luz (lectura real).
Color: intensidad de luz → teal sobre azul-casi-negro (tenue, desaturado, distinto del cian brillante de los bichos).

- `bakeLight()` (main.js): se rehornea solo al (re)iniciar el mundo (mensaje `world`) → coste ~0 por frame.
- `drawLight()`: un `drawImage(lightCv, ...)` por tile (mini-textura → tile) en vez del bucle de celdas.
- Verificado a zoom 1 y 2.5: nebulosa suave, sin seams, criaturas encima; sin errores. Render puro → sim byte-idéntica.

## Pendiente (opcional): versión FUNCIONAL
"Algo funcional en el ecosistema" (corrientes que arrastren, gradientes térmicos, zonas de peligro/refugio) sería MECÁNICA
NUEVA → toca la simulación (riesgo + scope) y habría que medir que no rompa los invariantes/emergencia. No abordado;
queda como idea de ecología futura, no como fondo.
