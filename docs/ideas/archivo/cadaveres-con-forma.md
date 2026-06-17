# Cadáveres con FORMA (render)

> Ficha de idea · **estado: ✅ HECHO (2026-06-17)** · render, NO toca la simulación.
> Índice: [indice-ideas.md](../indice-ideas.md) · CHANGELOG: `../../CHANGELOG.md`.

## Idea
La carroña (campo `carrion`) se dibujaba solo como mancha gris. Mostrar además el CUERPO real del muerto en su sitio,
grisáceo, deshaciéndose. La carroña como CAMPO sigue siendo la mecánica (sin coste en la sim).

## Implementación (hecha)
Marcadores de render EFÍMEROS, alimentados por el motor pero sin tocar la dinámica:
- **Motor (`sim.js`):** `_kill` registra en un buffer plano (`deathLog`, `DEATH_STRIDE` = x,y,radius,heading,hue + 80
  genes de nodo; `DEATH_CAP` 256) **solo las muertes NATURALES** (hambre/vejez/combate). La presa CAZADA (`'eaten'`) NO
  deja cuerpo (el depredador se lo llevó) → no se marca; semánticamente coherente con que esa muerte no deposita carroña
  entera. Es SOLO escritura de datos: no toca posiciones/energía/rng → dinámica byte-idéntica (smoke conserva).
- **Worker (`worker.js`):** drena `deathLog` en cada foto (`deaths`/`deathsN`, transferible) y resetea `deathLogN`. Solo se
  adjunta si hubo muertes.
- **Render (`canvas.js`):** `ingestDeaths` acumula los cadáveres (objeto con su bloque de nodos + `tBorn` + pose congelada);
  `_drawCorpses` los pinta BAJO los vivos, desaturados (sat~9), **sin ojos ni señuelo**, pose CONGELADA (sin onda) y con
  alpha que decae (`CORPSE_FADE` 70 ticks). LOD: cuerpo real (grafo) si se ven grandes, elipse gris si pequeños. Techo de
  240 marcadores; se purgan al desvanecerse. `clearCorpses` al reiniciar (mundo nuevo). Comparte la escala LOD con `_drawAgents`.

## Verificado (preview)
Muertes naturales → marcadores creados (nodos=80, sin error de dibujo); se ven cuerpos grises eyeless desvaneciéndose bajo
los vivos; smoke OK (conservación −0.0001%); consola sin errores.

## Ampliación (2026-06-17): el cadáver SUSTITUYE a la mancha de carroña, ligado al nutriente
La antigua viz de carroña (`_carrionSprite`: mancha gris radial por celda, opacidad ∝ `carrion[celda]`) se ha RETIRADO: el
cuerpo con forma la sustituye. Su desvanecido ya no usa el temporizador fijo (70 ticks) sino el NUTRIENTE restante en su
celda: `fade = carrion[celda]/carrion0` (referencia `carrion0` capturada al morir), MONÓTONO no creciente (`_purgeCorpses`,
para que no "reviva" si cae otro muerto en la misma celda), con tope de edad de seguridad (`CORPSE_MAXAGE` 800 por si
`carrionDecay≈0`). Así cuerpo y carroña co-terminan (antes el cuerpo desaparecía a los 70 ticks pero la carroña duraba
~600). Verificado: el fade queda atado EXACTAMENTE al nutriente (maxFadeAboveFrac=0). Hueco asumido: la carroña SIN cuerpo
(restos de depredación, minoría) ya no se pinta como mancha. Solo render. (CHANGELOG 2026-06-17.)

## Posibles mejoras futuras (no hechas)
- Cubrir los restos de DEPREDACIÓN con cuerpos tenues (emitir marcador también para `'eaten'`, alpha ∝ su carroña pequeña).
- Deriva/hundimiento lento del cuerpo al deshacerse.
- Distinguir la causa (desgarro si murió en combate).
