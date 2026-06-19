# Movimiento debe emerger en heterótrofos, no en autótrofos — **(Zenote 2)** · IMPLEMENTADO 2026-06-19

> Idea de usuario: «surgen organismos autótrofos con movimiento, y pocos heterótrofos. En el mundo real no pasa, revisar
> modelo, por si no estuviera bien definido o pudiera modelizarse de manera que el movimiento emerja más en heterótrofos.»

## Diagnóstico (medido — `spikes/movement-by-trophic/probe.mjs`)
A 15k ticks, 3 seeds: población dominada por autótrofos (65–83%), heterótrofos pocos (4–15%). Y la inversión irreal:
- **autótrofos**: 8–19% en movimiento (vel ~0.12–0.14) — MÁS que los **heterótrofos** (0–5%).
- El movimiento del autótrofo NO era adaptativo: móviles con energía igual/menor y MUCHO menos longevos (edad ~2100–2450
  vs ~3200–4700 los quietos). Se movían por el seedBrain (fototaxis cableada para todos) + músculo casi-neutro (a baja
  velocidad el coste de nado es ínfimo → nada lo poda). **Nada en la física premiaba la quietud del autótrofo.**

## Fix — la fotosíntesis premia la quietud
Nuevo parámetro `SIM_P.photoMotionK` *(UI)*: la captación de luz se multiplica por `1/(1 + k·velocidad)`. Moverse cuesta
luz → un fotosintetizador rinde más quieto → la **sesilidad emerge** en los autótrofos (plantas) y el movimiento queda en
los heterótrofos (animales que buscan comida). `k=0` = comportamiento anterior. Energía sigue conservando (solo se escala
la entrada de luz, una fuente abierta). Frontera genotipo→física: el programador define el coste de moverse para un
fotosintetizador, no qué oficio es bueno. Archivos: `sim.js` (param + transacción de fotosíntesis), `index.html`/`main.js`
(slider de laboratorio "Quietud fotosíntesis").

## Elección del valor (barrido `sweep-photomotion.mjs`, 3 seeds × 15k)
| k | autótrofos en movimiento |
|---|---|
| 0 | 14% | (baseline, irreal) |
| 1 | 2% |
| **2** | **0%** | ← default |
| 4–8 | 0% pero la pop de autótrofos se dispara y aplasta a los heterótrofos |

**Default `photoMotionK = 2`.** Verificado a 25k (`verify-k2.mjs`, 3 seeds): autótrofos **0% en movimiento** (sésiles),
heterótrofos PERSISTEN (6–22%) e incluso suben en proporción/absoluto, los que se mueven son hetero/mixto, **invariantes
OK**. Gate 8/8 verde; checksum dorado re-fijado (`0x0cb2b800`, dinámica cambiada a propósito). Live (preview): autótrofos
0% en movimiento confirmado.

## Nota sobre "pocos heterótrofos"
La escasez de heterótrofos es un límite ECOLÓGICO conocido y aceptado del nicho cazador en una pecera pequeña/densa (ver
[[lean-prey-starves-predators]], [[pecera-pequena-contemplativa-scope]]), no un bug. El fix no fuerza más heterótrofos,
pero al volver sésiles a los autótrofos sube la diversidad trófica y deja el movimiento como firma de los animales —que es
el objetivo contemplativo: campo de plantas sésiles + animales que vagan.
