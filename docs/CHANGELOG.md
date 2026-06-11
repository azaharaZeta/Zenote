# Changelog — hitos del proyecto

Historia cronológica (lo más reciente arriba). La **foto del presente** vive en `ESTADO.md`; aquí solo se registran
los hitos. Cada cambio de modelo → `SPEC_EVOLUCION.md`; cada parámetro → `src/config.js`; cada idea → `ideas/`.

## 2026-06-11 — Reestructuración de la documentación
- **Retirado `CONFIG.md`** (duplicaba `src/config.js`, que ya está comentado y agrupado y es la **fuente única** de
  parámetros). Referencias actualizadas (CLAUDE, ESTADO, SPEC).
- **Sistema de ideas nuevo:** `IDEAS.md` → `ideas/indice-ideas.md` (índice con estados). Las ideas en curso/hechas
  tienen **ficha** propia (`ideas/<slug>.md`); al cerrarse se archivan (`ideas/archivo/`, congeladas). La mecánica de
  lo implementado vive en SPEC, no se duplica.
- **`CHANGELOG.md`** separado de ESTADO (que queda como foto del presente).

## 2026-06-11 — Morfología evolutiva (Capas 1-3) + calidad máxima
- Trilogía de morfología completa: `tipShape` (forma del nodo: púa↔elipse↔aleta), `morphReach`/`k_grazeWide`
  (función ecológica: alcance del cazador / pastoreo del herbívoro), `gaitMode` + `flapCost` (modo de propulsión
  ondular↔aletear con coste). **Genoma 169→185** (2 campos de nodo nuevos). Render del aleteo + señal visual de giro
  (remado). Ver `ideas/archivo/morfologia-nodos-capas-1-3.md`.
- 3ª calidad **Máxima** (doble bloom, supersampling, +nieve, sustrato 4×, LOD fino).
- `diet.omniPenalty` 0→**0.05** (dial de especialización; ver memoria).
- UI: botón **Reiniciar** movido a la cabecera (ámbar, distinto) para evitar pulsarlo por error.

## 2026-06-10 — Cenote abisal único + limpieza de UI
- Eliminado el escenario `meadow`/pradera → **Cenote abisal único** (quitados sprites de hierba/flores, mapa térmico
  de pradera y los params `ambiance`/`showResourceField`/`flower*`/`grassSpriteCount`). Quitadas las **estelas**
  (`render.trails`, código muerto).
- **Modo simple** simplificado (stats fps·tick·pob, sin histograma ni textos de diagnóstico; `pob` en azul).
- **Gráfica de población** por DIETA (herbívoros/omnívoros/carnívoros + vegetación), sin la curva de total.

## 2026-06-10 — Saldada la deuda v2.0 (modelo de nodos)
- `SPEC_EVOLUCION.md` reescrito al modelo de nodos (genoma por nodos, física direccional, crossover con ligamiento,
  distancia sobre genes funcionales, combate con `failDamage`/banda de talla, r/K honesto). `VISUAL.md` actualizado
  para el render por nodos.

## 2026-06-09/10 — Auditoría evolutiva CERRADA (14/14)
- Backlog #0-#13 cerrado (Pilar v2.0, mutación, crossover, alometría, r/K, maxAlive, muletas, refugio, constantes
  loco, cerebro neural-only, ataque del cerebro, carroña, historia de vida, consolidar color). Detalle en `AUDIT_EVOLUCION.md`.
