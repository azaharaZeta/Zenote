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

## Posibles mejoras futuras (no hechas)
- Deriva/hundimiento lento del cuerpo al deshacerse; ligar el desvanecimiento al `carrionDecay` real de su celda.
- Distinguir la causa (desgarro si murió en combate).
