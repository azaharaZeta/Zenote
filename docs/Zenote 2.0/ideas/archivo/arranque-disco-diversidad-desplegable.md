# Arranque: desplegable + sembrado en disco + diversidad inicial — **(Zenote 2)** · IMPLEMENTADO 2026-06-19

> 3 ideas de usuario (cluster "arranque"): (a) agrupar los parámetros que requieren reinicio en un desplegable propio;
> (b) sembrar en un DISCO CENTRAL (no por todo el mundo) con densidad parametrizada; (c) slider de DIVERSIDAD inicial
> (0 = organismos básicos y todos iguales · máx = la actual).

Todos con default = comportamiento actual → motor **byte-idéntico** (gate 8/8, dorado intacto).

## Qué se añadió
**(a) Desplegable "Mundo nuevo ↻ al reiniciar"** (`<details>` en el panel): agrupa Semilla · Tamaño del mundo · Sembrado
inicial · Extensión del sembrado · Diversidad inicial. Limpia el panel; todo lo de arranque junto.

**(b) Sembrado en disco** (`sim.seed(n, spread, div)`): `spread`=1 → uniforme por todo el mundo (actual); `spread`<1 →
disco central de radio `spread·mundo/2` (punto uniforme en disco: `ang=rng·2π`, `r=radio·√rng`). **Orden RNG genoma→x→y
intacto** → spread=1 byte-idéntico. UI "Extensión del sembrado" (5%–100%). Verificado: spread 0.2 → los 800 fundadores en
bbox ~[600,900] del mundo 1500 = disco de radio ~150 centrado.

**(c) Diversidad inicial** (`makeFounder(rng, div)` → `seedBrain/makeBrain(rng, div)`): `div` mezcla las partes variables
(fase/tono/ruido del cerebro) hacia un valor fijo con `div`; consume el MISMO RNG (a div=1 el valor es exactamente
`rng.next()` → byte-idéntico). div=0 → fundadores IDÉNTICOS (mismo tono/fase/cerebro; la morfología base ya es la plántula
PHOTO mínima). UI "Diversidad inicial" (0%–100%). Verificado: div=0 → 1 solo tono (clones).

`worker.js`: `spawnSpread`/`diversity` como params de arranque (en el mensaje `reset`, conservados entre resets).

## Resultado
Inóculo central clonal (disco de un color) que al reproducirse se EXPANDE y DIVERSIFICA → fascinante de ver + jugoso
(diversidad sembrada vs emergente). [[zenote2-env-params-ui]].
