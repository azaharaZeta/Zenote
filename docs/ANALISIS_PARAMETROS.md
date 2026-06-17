# Análisis de parámetros — mapa de interacciones del motor

> **Qué es esto.** No es un catálogo de parámetros (eso vive, por valor y comentario, en `src/config.js`,
> fuente única). Esto es el **mapa dinámico**: qué hace cada subsistema *a nivel de ecuación*, en qué impacta
> subir/bajar, y —sobre todo— **cómo interactúa todo con todo** (los bucles de realimentación y los modos de
> fallo). Es la base para el finetuning de parametrización.
>
> **Metodología.** Derivado de las ECUACIONES del motor (`organism.js`, `bodyplan.js`, `sim.js`, `world.js`,
> `genome.js`). NO me fío de comentarios ni de los rangos de los sliders de la UI: la verdad la da el código.
> Analiza la "pecera" cerrada en materia (único escenario). Fecha: 2026-06-15.

## Marco

Dos clases de número, no confundir:
- **Física del mundo** (`config.*`): la fija el programador, son leyes inmutables. Es lo que se analiza aquí.
- **El genoma** (genes ∈[0,1]; nº = `NUM_GENES` en `genome.js`): evoluciona. La física **traduce** genes→fenotipo en `organism.js` (la "frontera"), una sola vez al nacer.

### La ecuación maestra (por organismo, por tick)
```
ΔE = INGRESO − COSTE ;  muere si E ≤ 0 ;  cría si (E ≥ reproNeedE  y  edad ≥ matureAge)

COSTE = baseCost                                                                  ← mantenimiento
      + moveCost·v²·(0.3 + 0.7·esfuerzo)·(1+flapCost)·haulMul·dragMul              ← nado por POTENCIA (modelo de fuerza)
        # esfuerzo = salida DEDICADA del cerebro (throttle 0..1, independiente de la dirección, decidido tick a tick); parado v≈0 → gratis; esprintar = caro.
        # la velocidad EMERGE de empuje−arrastre con inercia (∝masa); no se fija. (Modelo viejo: ·(1+k_effort·effort_gen), v fijada a vmax.)

INGRESO (según dieta):
  herbívoro: Σceldas min(grazable·absEff, necesidad)·epu·effHerb   (grazable = res − grazeRefuge·cap)
  carroñero: min(carrion·carrionAbsRate·effScav, hueco, carrion)
  cazador:   preyGain·(E_presa + carcassValue·eMax_presa)·effHunt   (topado a eMax)
```

### La ley de conservación (pecera)
```
matterBudget = Σ N + Σ res·epu + Σ_vivos(E + bodyMatter) + Σ carrion = CONSTANTE
bodyMatter = carcassValue·eMax    (materia encerrada en el cuerpo; sale del pool N al nacer, vuelve al morir)
```
La materia no se crea ni se destruye: circula `N → vegetación → organismo → (carroña/N)`. Casi todos los modos de fallo son materia que se **atasca** en un compartimento.

---

## 1. Economía de materia → capacidad de carga
`matterBudget · closedRegen · energyPerUnit · R_max · capFloor · gradient · patchiness · seedFloor · grazeRefuge · nutrientDiffuse · gridCols/Rows · birthGatherR`

Rebrote cerrado (`World.regen()` en `world.js`): cada celda convierte su `N` local en pasto a ritmo `closedRegen`, topado a `capacity[i]`; la conversión cuesta materia (`Δres·epu` sale de `N`).

- **`matterBudget`** — tamaño total del bote de materia (constante de conservación, cota dura de toda la biomasa). Sube → más de todo a misma dinámica relativa (cambia la escala, no la dinámica).
- **`closedRegen`** — productividad primaria (N→pasto). **Regulador #1 de la comida.** Sube → más flujo hacia arriba en la pirámide → más población y cadenas más largas; baja → mundo magro/plácido.
- **`energyPerUnit` (epu)** — tipo de cambio pasto↔materia↔energía. Aparece en el ingreso (`·epu`) Y en la conservación (`res·epu`). Multiplicador sensible y transversal.
- **`grazeRefuge`** — fracción intocable del pasto. Doble función: (a) evita el estado absorbente (pasto→0); (b) es la **cobertura** del refugio anti-depredador (§6). Sube → menos comida efectiva pero más escondite.
- **`patchiness`** — lineal↔logístico+difusión de semilla. >0 → parches que emergen y migran (Huffaker) → heterogeneidad espacial.
- **`nutrientDiffuse`** — difusión de `N`. Bajo → manchas fértiles locales y persistentes (ciclo de nutrientes geográfico); alto → N casi global.
- **`capFloor`/`gradient`** — techo de capacidad por celda (perlin). En pecera está parcialmente eclipsado por la dinámica de `N`.
- **`seedFloor`** — banco de semillas (rebrote espontáneo mínimo).
- **`gridCols/Rows`** — resolución del campo (grano espacial). Estructural.
- **`birthGatherR`** — radio del que la cría reúne `bodyMatter`. Acopla natalidad a fertilidad local (sin N en la zona → no nace = techo endógeno local).

---

## 2. El eje TALLA (alometría) — el subsistema más apalancado
`expr.size{min,max} · massExp · kleiber · E_max_base · c_base · forageReach · k_haul`
```
radius   = lerp(size.min, size.max, gen_size)
refRadius= (size.min + size.max)/2
sizeMass = (radius/refRadius)^massExp
mass     = sizeMass·massMul
eMax     = E_max_base·mass
baseCost = c_base·mass^kleiber·(…)
reproRef = E_max_base·sizeMass         →   reproNeedE = max(repro_thr,invest)·reproRef
```
`sizeMass` es una **ley de potencia** de la talla (exponente `massExp`) y entra en TODO: depósito (lineal), mantenimiento (`^kleiber`, sublineal) y, decisivo, en el **umbral de cría**. El **eje r/K emerge** de aquí: el pequeño llena su depósito antes y cría rápido (r); el grande es K.

- **`expr.size.min`** — **el suelo de talla = el techo de la TASA reproductiva máxima** (`reproNeedE ∝ size.min^massExp`). Palanca MAESTRA del modo de fallo (ver Bucle 2). Bajo → cuerpos baratísimos → r-runaway → satura el pool. Alto → cría lenta → la comida limita por debajo del pool.
- **`expr.size.max`** — techo de talla (rango de K-estrategas/presa grande).
- **`massExp`** — curvatura del eje. Alto → grandes muy caros → comprime hacia pequeño.
- **`kleiber`** — economía de escala del mantenimiento (<1 = ventaja del grande por unidad de masa).
- **`E_max_base`** — escala global energía/materia por masa (sube depósito y coste de cría a la vez; afecta la capacidad de carga en pecera).
- **`c_base`** — impuesto de existir (sube → vida cara → pop baja, selección dura).
- **`forageReach`** — **contrapeso que hace pagar la talla**: el grande pasta un área `(2·round(forageReach·size)+1)²`. Sin esto, el ingreso no escala con la talla pero `reproRef` sí → todo deriva al mínimo. Decide si emerge un grupo grande o todo colapsa a pequeño.
- **`k_haul`** — coste de transporte ∝ masa (freno al gigantismo vía nado).

---

## 3. Locomoción y forma → física (velocidad emergente)
`kThrust · headThrust · paddleEff · symBase · oscFloor · effortFloor · elongMax · streamBase/Gain · vMin/vMax · turnBase/Asym/Size/Elong/Min · {seg,mod,body,limb}Thrust · {seg,mod,body,limb}Drag · bodyMass · tip{Thrust,Drag,Reach} · flapGain/flapDrag · phaseGain` + coste: `moveCost · k_effort · k_haul · k_drag · dragRef · k_flap`
```
v = kThrust·max(0,Psum)·straight·(stream/Dmul)   acotado [vMin,vMax]
Psum = (1 − phaseGain·(1−coherencia))·empuje_fwd − empuje_freno   (suma fasorial por osc_phase)
stream = streamBase + streamGain·(elongN−1) ;  Dmul = 1 + arrastres·shapeDrag
giro = turnBase + turnAsym·asim − turnSize·size − turnElong·(elongN−1) − segTurn·nSeg
```
Principio de diseño: **cada empuje va emparejado con su arrastre**, y `headThrust` bajo hace la cabeza CARGA (no motor) → nadar bien EXIGE propulsores → emergen por selección.

- **`kThrust`** ganancia global de velocidad · **`headThrust`** bajo = fuerza propulsores (morfología rica) · **`vMax`** techo (interactúa con `fleeSpeed`) · **`phaseGain`** premia coordinación de marcha · pares thrust/drag + `tip*`/`flap*`/`elongMax`/`paddleEff` = trade-offs físicos que esculpen el morfoespacio.
- Coste de nado **∝ v²** (`moveCost`): ir rápido se dispara → la presa (renta pobre) no puede ir al máximo, el depredador (energía de la presa) sí. `k_effort/k_haul/k_drag/k_flap` = recargos honestos; `dragRef` = colchón.

---

## 4. Visión
`expr.sense{min,max} · halfFovMin/Max · fovRef · rangeExp · k_sense`
```
alcance = lerp(sense.min,sense.max,gen) · (fovRef/(2·halfFov))^rangeExp ;  visCos = cos(halfFov)
```
Conserva el área del cono: `rangeExp` reparte alcance↔ángulo. Cazador → cono estrecho largo; presa → panorámico corto. `k_sense` = coste (en baseCost). *(El alcance está acotado en la práctica por el tamaño de celda del hash, escaneo 3×3–7×7.)*

---

## 5. Dieta y nichos tróficos
`diet(gen) · omniPenalty · scav(gen) · scavPenalty · k_graze · k_grazeWide · k_scavThin · absRate · absMetabBase`
```
omni    = 1 − omniPenalty·4·diet·(1−diet)          (parábola, máx en 0.5 → impuesto a generalizar)
effHerb = (1−diet)·omni
meat    = diet·omni ;  spec = 1 − scavPenalty·4·scav·(1−scav)
effHunt = meat·(1−scav)·spec ;  effScav = meat·scav·spec·(1 + k_scavThin·thin)
absEff  = absRate·(absMetabBase+metab)·(1+k_graze·(massMul−1))·(1+k_grazeWide·breadth)
```
`omniPenalty`/`scavPenalty` son **impuestos a la generalización** que fuerzan a los extremos → sin ellos no diverge la morfología. `k_grazeWide` premia ANCHO (pastador), `k_scavThin` premia FINO (gusano): tiran de la misma `elongN` a formas opuestas. `absRate` = velocidad de pastado.

---

## 6. Depredación / combate
`combat.{sizeAdvantage, failDamage, fleeSpeed, fleeCap, handlingTime, dietMargin, preyBandLo/Hi, morphReach, lure*} · refuge.strength · energy.{carcassValue, preyGain}`
```
ataca si (solapan) preyBandLo ≤ R_presa/R_att ≤ preyBandHi ; diet_att−diet_presa > dietMargin ; rng < impulso(cerebro)
escapa si rng < refuge.strength·veg_celda  O  rng < min(fleeCap, fleeSpeed·(vmax_presa/vmax_att −1))
gana att con P = f_att/(f_att+f_def), f=(size+0.1)^sizeAdvantage
botín = preyGain·(E_presa + carcassValue·eMax_presa)·effHunt
```
**Todos los estabilizadores Lotka-Volterra viven aquí:**
- `preyBand*`+`dietMargin` acoplan talla depredador↔presa, evitan canibalismo/gigantismo → coexistencia.
- `refuge.strength` (cobertura) + `fleeSpeed` (duelo de velocidad, topado por `fleeCap`) → la presa nunca llega a cero.
- `handlingTime` (digestión) satura la tasa de caza → amortigua oscilaciones.
- `failDamage` (coste al fallar) = freno **denso-dependiente** (sin él, sobre-disparo y colapso).
- `carcassValue` (el más sutil): el cuerpo vale su biomasa ∝eMax **además** de su energía → cazar presa magra rinde; sin él, carnívoros extintos rodeados de presa pobre.
- `preyGain` eficiencia trófica · `sizeAdvantage` peso de la talla · `morphReach`/`lure*` alcance de captura.

---

## 7. Otros subsistemas (denso)
- **Carroña** (`carrionDecay·carrionAbsRate·carrionScent`): toda muerte deja cuerpo; decae→mineraliza a `N` (pecera); lo consumen los carroñeros (`effScav`). Puente que da colchón al comecarne en la escasez.
- **Ciclo de vida** (`expr.mature_age · gen senescence · age.{mortality,scale,senesSlow,senesFast} · k_lifespan`): muerte por vejez `P = mortality·senesMult·((edad−Tm)/scale)²`. Eje vivir-rápido↔longevo; `k_lifespan` = coste de longevidad (disposable soma) que impide el "inmortal".
- **Reproducción/especiación** (`expr.repro_thr/invest · cooldown · sexual/asexual · mateRadius · speciesGenThreshold · mut.recomb`): sexual = pareja compatible (`dist<speciesGenThreshold`) en `mateRadius`, si no → asexual. Especies = clústeres por distancia genética sobre genes FUNCIONALES (excluye cerebro/decorativos). `recomb` = ligamiento.
- **Mutación** (`rate·sigma·bigRate·bigSigmaMult`): velocidad de exploración evolutiva. Crítica para la especiación (junto a `speciesGenThreshold`).
- **Selección sexual** (`gen orn/pref`): runaway de Fisher; elección de pareja por ornamento. Desacoplada del señuelo.
- **Señuelo de emboscada** (`gen o_len/o_bulb · lureGate · lureReach · lureAttract · k_lure`): órgano de caza con genética PROPIA (gate suave sobre `o_len`); cuesta siempre (`k_lure`), atrae+alcanza presa al cazar. Nicho EMERGENTE: lo expresa ~la fracción cazadora (no universal). El alcance base del cazador activo lo da `morphReach` (apéndices).

## 8. Escala y población (estructural)
- **`world.size`** — dial de DENSIDAD (Modelo A: escala materia/fundadores/rejilla con el ÁREA; el pool NO escala). Grande = disperso → menos depredación, más especies.
- **`maxAgentsCeiling`** — tope DURO del pool (memoria), fijo (no escala con el mundo), **no** punto de operación. Cuando la comida NO limita por debajo (r-runaway), este número se vuelve el límite real → degradación.
- **`carnivoreSeedFrac`** siembra inicial de proto-carnívoros · **`startDiversity`/`simpleStart`** variedad inicial · **`targetTPS`** solo velocidad de sim (el tick es la unidad de tiempo).

---

## 🗺️ EL MAPA: cómo interactúa todo con todo

**Bucle 1 — Triángulo de materia (pecera).** `N → pasto → biomasa → (carroña/N)`, gobernado por `closedRegen`×`epu`×`matterBudget`. La materia atascada en un compartimento desabastece al resto. (Esto mató a `vegDecay`: pasto→N → más rebrote → más capacidad de carga → peor.)

**Bucle 2 — Eje talla → r/K → saturación del pool. (MODO DE FALLO CENTRAL.)**
```
size.min ↓ → reproNeedE_mín ↓ → cría r explosiva → ¿qué frena la población?
   ├─ la frena la COMIDA → pop estable < maxAgentsCeiling → queda estructura de talla → cazador vive ✅
   └─ la frena el POOL (maxAgentsCeiling) → saturación → todos diminutos, pasto cropeado uniforme
                                    → desaparece la presa con talla en banda → CAZADOR muere ❌
```
Condición de fallo: r-runaway hasta el pool cuando el cuerpo más barato cría más rápido de lo que la comida lo frena. Palancas: `size.min` (dominante), `massExp`, `forageReach`, `E_max_base`, `repro_thr/invest`, `cooldown`, `mut.rate`, y `closedRegen`/`matterBudget` (más comida → más fácil saturar). Por eso `size.min` es palanca maestra (decide la rama), no un dial fino.

**Bucle 3 — Viabilidad del depredador.** Vive solo si: (a) hay presa con talla en `[preyBandLo,preyBandHi]·R_att` (roto por el Bucle 2 si todo es diminuto), (b) el retorno calórico > coste (`carcassValue`+`preyGain` vs `c_base`+nado), (c) puede alcanzarla (`fleeSpeed`/`refuge.strength`/`vMax`/`morphReach`). El gremio más frágil: depende de todo lo de abajo.

**Bucle 4 — Divergencia morfológica.** `omniPenalty`/`scavPenalty` destraban la especialización; `k_grazeWide` (ancho→pastador), `k_scavThin` (fino→gusano), `morphReach` (frontal→cazador) tiran de la misma `elongN` a formas opuestas. Sin los impuestos, no hay tres gremios.

**Bucle 5 — Carrera de velocidad.** `v²·moveCost` encarece la velocidad; `fleeSpeed` la vuelve selectiva (duelo presa-cazador); `refuge.strength` alto la enmascara (esconderse en vez de correr).

**Bucle 6 — Especiación.** Nº de especies ≈ `speciesGenThreshold` ÷ `mut.sigma` × aislamiento espacial (`world.size`/`mateRadius`).

### Tensiones clave (a equilibrar en el tuning)
1. **Comida ↑ (`closedRegen`/`matterBudget`/`epu`) ↔ saturación del pool.** Más productividad alimenta cazadores pero acelera el r-runaway si `size.min` no sujeta la talla.
2. **`grazeRefuge`:** comida efectiva ↓ vs refugio ↑.
3. **`size.min` alto:** sujeta la población vs bichos más grandes / menos diversidad de talla.
4. **`mut.sigma` alto:** explora/especia rápido vs rompe co-adaptaciones.
5. **`carcassValue` alto:** rescata al cazador vs ablanda el freno L-V → boom-bust.

### Jerarquía de palancas
- **Maestras (deciden el RÉGIMEN):** `expr.size.min`, `closedRegen`, `matterBudget`, `maxAgentsCeiling`, `massExp`, `forageReach`.
- **De gremio (QUIÉN coexiste):** `omniPenalty`, `scavPenalty`, `carcassValue`, `fleeSpeed`, `refuge.strength`, `dietMargin`, `preyBand*`, `handlingTime`, `carrionAbsRate`.
- **De morfología:** `k_grazeWide`, `k_scavThin`, `morphReach`, `headThrust`, `kThrust`, pares thrust/drag.
- **Finos (matizan, no cambian régimen):** mayoría de `k_*` de coste, `vision.*`, `age.*`, `repro.cooldown`, `mut.*` (salvo su efecto en especiación).

### Conclusión operativa
El sistema tiene un **punto de bifurcación (Bucle 2)** gobernado sobre todo por `size.min` × productividad × `maxAgentsCeiling`; la **salud del cazador (Bucle 3)** es el indicador que primero se rompe. Finetuning: **primero fijar el régimen (Bucle 2), luego ajustar gremios (Bucle 4)** sobre él.
