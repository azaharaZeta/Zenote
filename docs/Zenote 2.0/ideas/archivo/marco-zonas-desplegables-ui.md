# Marco a las zonas desplegables de la UI

**Estado: IMPLEMENTADA (2026-06-20).**

## Petición
Remarcar con algún marco las zonas desplegables del panel (los `<details class="lab">`:
"Mundo nuevo" y "Laboratorio") para que se lean como secciones colapsables acotadas.

## Solución
Cambio **solo de CSS** (`zenote2/styles.css`, regla `.lab`) — capa de render/UI, no toca la
simulación (sin re-fijar el dorado; el gate no cubre CSS).

Antes: `.lab` solo tenía un `border-top` tenue. Ahora es una tarjeta:
- `border: 1px solid rgba(120,140,170,.18)` + `border-radius: 8px`
- fondo sutil `rgba(120,140,170,.04)`, padding `8px 11px`
- al abrir (`.lab[open]`) sube ligeramente el contraste del borde/fondo (transición .15s)
- el `margin-bottom` del summary pasa a aplicarse solo cuando está abierto

## Verificación
Preview (puerto 8732): la tarjeta "Mundo nuevo" se ve claramente enmarcada al abrirla;
"Laboratorio" lleva el mismo marco cerrada. Estética abisal respetada (gris-azulado tenue).
