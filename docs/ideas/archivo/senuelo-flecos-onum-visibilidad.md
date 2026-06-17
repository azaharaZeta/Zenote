# Señuelo: flecos (coste `o_num` + visibilidad) — explorados y DESCARTADOS

> Ficha de idea · **estado: DESCARTADA** (ambas mitades, probadas) · 2026-06-17 · archivada (congelada).
> Índice: [../indice-ideas.md](../indice-ideas.md) · Mecánica del señuelo: `SPEC_EVOLUCION.md` §3.

Tras el rediseño del señuelo (nicho de emboscada real, gen propio `o_len`/`o_bulb`) quedaban dos "flecos". Ambos PROBADOS
y DESCARTADOS por la misma causa estructural.

## 1. Coste por cantidad (`o_num`) — ❌
`o_num` (nº de tallos; render `np=1+6·o_num²`) era decorativo. Costé `baseCost *= (1+k_lureNum·o_num²)` solo si `lure>0`.
Barrido `k_lureNum` 0→12 (multi-seed, 20k): el `o_num` medio de los portadores **no baja** (~0.24 a cualquier coste). Los
portadores son una subpoblación pequeña dominada por DERIVA y realimentada desde la mayoría sin-señuelo → el equilibrio lo
fija la inmigración, no el coste. REVERTIDO.

## 2. Visibilidad (el señuelo te delata) — ❌
Idea: un señuelo brillante hace que tus DEPREDADORES te detecten como presa desde más lejos (coste anti-depredación), con
la atracción de la presa intacta (decepción anglerfish). Implementado limpio (percepción de presa extendida por el señuelo
de la presa; **byte-idéntico con `lureVisible=0`**, verificado por checksum). Barrido 0/25/50 (multi-seed, 25k): efecto
**caótico, no un trade-off** — p.ej. seed 5 `vis=25` colapsó el nicho a 0% pero `vis=50` lo devolvió a 100%. REVERTIDO.

## Causa estructural (la lección)
Los portadores de señuelo son **cazadores cerca del ápice trófico**: casi nadie puede comérselos (para ser presa de otro
hace falta dieta aún mayor + talla en banda, rarísimo entre cazadores). Así que "más visible a tus depredadores" no tiene
depredadores sobre los que actuar, y "costar la decoración" no muerde en una subpoblación dominada por deriva. El nicho de
emboscada es además **biestable** (colapsa a 0% o explota a ~100% según seed).

**Conclusión:** el trade-off del señuelo ya está bien capturado por `k_lure` (la prominencia cuesta basal) vs atracción/alcance
(beneficio). No añadir más costes sobre un nicho near-apex + biestable. Ver memoria `decor-gene-cost-noop-in-small-subpop`.
