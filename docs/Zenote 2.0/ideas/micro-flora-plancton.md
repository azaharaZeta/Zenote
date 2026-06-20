# Micro-flora / plancton (pulido visual de la vegetación, de zenote1)

**Estado: ANOTADA (no implementada).** Pulido visual OPCIONAL del [análisis de adaptación de la vegetación de zenote1](vegetacion-de-zenote1-adaptar.md).
Solo render — NO toca la simulación.

## Idea
zenote1 esparcía **motas de plancton / micro-flora** por el mundo (`render.grassDensity` ≈ 6800 motas) sobre el sustrato de
vegetación → daba textura "viva" y profundidad acuática al fondo, además del campo de pasto teal. zenote2 hoy pinta solo el
campo de vegetación (nebulosa teal con parches) sin esas motas.

## Qué aportaría
Textura fina y sensación de "agua con vida" (micro-organismos a la deriva) sobre la nebulosa de vegetación → más contemplativo,
más cercano a la estética de zenote1. Puramente decorativo.

## Implementación (boceto, render-only)
En `main.js`: un conjunto de N motas con posición fija en el mundo (no en cámara — se recomputan por TIMER, no al panear, para
no "pegarse" a la vista; ver cómo zenote1 lo hacía con `_abyssTimer`/`grassRefreshFrames`). Brillo/alpha de cada mota ∝
vegetación local (más plancton donde más pasto) → las motas también "fluyen" con la corriente. Coste: dibujar N sprites
pequeños por frame (o cachear en una capa que se recompone cada pocos frames). Cuidar rendimiento en móvil (toggle de calidad).

## Riesgo
Ninguno funcional (render puro). Solo vigilar el rendimiento (N motas por frame) — cachear/recomponer cada pocos frames como zenote1.
