# Señuelo: coste por `o_num` (DESCARTADO) + visibilidad (abierto)

> Ficha de idea · **estado: parcial** — coste `o_num` PROBADO y DESCARTADO (2026-06-17); visibilidad pendiente.
> Índice: [indice-ideas.md](indice-ideas.md).

El rediseño convirtió el señuelo en un nicho de emboscada real (desacoplado de `orn`, gen propio `o_len`/`o_bulb`).
Quedaban dos matices:

## 1. Coste por cantidad (`o_num`) — ❌ PROBADO y DESCARTADO (2026-06-17)
`o_num` (nº de tallos; render `np = 1 + 6·o_num²` → 1-7) es DECORATIVO: no cuesta ni da alcance/atracción. Idea: costar
energía el nº de tallos para que no emerjan racimos "gratis".

**Implementado y medido** (`baseCost *= (1 + k_lureNum·o_num²)` solo si `lure>0`; barrido `k_lureNum` 0→12, multi-seed 20k):
- El fenotipo costaba bien (con señuelo el coste subía con `o_num`; sin señuelo, gratis).
- **Pero NO curva los racimos:** el `o_num` medio de los portadores se queda ~0.24 a cualquier `k_lureNum` (incluso 12,
  donde 7 tallos pagarían ×2.3 el basal). Causa: los portadores son una subpoblación diminuta dominada por DERIVA y
  **realimentada** desde la mayoría sin-señuelo (donde `o_num` deriva libre ~0.25) → el equilibrio lo fija la inmigración,
  no el coste. Además a `o_num`~0.25 el render ya pinta solo 1-2 tallos → los racimos apenas emergen bajo deriva.
- **REVERTIDO** (era un no-op sobre un problema menor; añadía un knob sin efecto). Lección → memoria.

**Si se retomara:** un coste no basta para un gen DECOR en subpoblación pequeña; haría falta darle a `o_num` un BENEFICIO
real (que cuente en la selección) o meterlo en la distancia de especie (que las líneas con señuelo diverjan) — ambos más
invasivos que el "fleco" original.

## 2. Visibilidad — ⬜ pendiente
Que exhibir señuelo aumente tu rango de detección por otros → trade-off honesto pro-reproducción (liga con `orn`) vs
anti-depredación. Mecánica nueva — medir que no rompa el equilibrio.
