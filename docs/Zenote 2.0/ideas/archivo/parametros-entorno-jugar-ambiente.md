# Parámetros para "jugar a ser el ambiente" — **(Zenote 2)** · IMPLEMENTADO 2026-06-19

> Ideas de usuario (3 entradas del índice): parámetros de arranque (tamaño del mundo, cantidad de sembrado) marcados
> "necesita reinicio"; ritmo de mutación en la UI; toggle sexual/asexual; controlar el volumen/densidad de sembrado.

Interacción central de VISUAL.md ("jugar a ser el ambiente"). Defaults elegidos = comportamiento ANTERIOR → motor
byte-idéntico (gate 8/8, checksum dorado `0x0cb2b800` intacto).

## Qué se añadió
**Parámetros de ARRANQUE (necesitan reiniciar; etiqueta "↻ reinicia" en el panel):**
- **Tamaño del mundo** (`worldSize`, 800–3000, def 1500): `worker.js` `SIZE`→variable; `init()` recrea World+Sim con ese
  lado. El render ya lee `WORLD.size` de la foto → se adapta solo. (Densidad = sembrado/área → controlable combinando ambos.)
- **Sembrado inicial** (`seedCount`, 100–2500, def 800): `sim.seed(seedCount)`.
- Se envían en el mensaje `reset` (con la semilla); `init({seed, worldSize, seedCount})` los conserva entre resets.

**En vivo (laboratorio):**
- **Ritmo de mutación** (`GENOME_P.mutRate`, slider 0–3×, def 1): `mutate()` escala las PROBABILIDADES por `mutRate` vía
  `chance(p)=rng.next()<p·mutRate` (no las magnitudes). A 1× consume el RNG y compara EXACTO igual → byte-idéntico. 0 =
  clones; >1 = más churn (enlaza con [[anomalous-offspring-is-mutation-load]]). El worker enruta `set mutRate`→GENOME_P.
- **Reproducción** (selector 3 estados, `SIM_P.reproMode`, def `'both'`): `both` = sexual si hay pareja + RESPALDO asexual ·
  `asexual` = siempre clon · `sexual` = OBLIGADA, sin respaldo (sin pareja compatible no se reproduce ese intento → puede
  frenar la natalidad en poblaciones dispersas). En `step()`: `mate = reproMode!=='asexual' ? _findMate : -1`; se reproduce
  si `mate>=0 || reproMode!=='sexual'`. Enlaza con [[sexual-repro-flattens-size]]. Verificado: both ≈ mayormente sexual +
  respaldo; asexual → 0 sexuales; sexual → 0 asexuales.

## Verificado (preview)
- worldSize 2500 → `world.size`=2500; seedCount 1500 → pop inicial ≈1500. Etiquetas y reset OK.
- Sexual OFF → nacimientos sexuales caen a 0, todo asexual. Sin errores. Gate 8/8.
