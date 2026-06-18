# Análisis de primeros principios — Zenote

> **Propósito.** Determinar qué **leyes de conservación** existen en el modelo biológico, cuáles se **violan o
> faltan**, y qué fenómenos se **mantienen artificialmente** (con parámetros) en lugar de surgir de una
> restricción fundamental. NO rediseña el sistema: solo localiza dónde el modelo se apoya en parámetros en vez de
> en constraints.
>
> Se apoya en el código (`sim.js`, `world.js`, `organism.js`), el [mapa de arquitectura](evolution-architecture-map.md),
> el [informe de deuda](evolution-debt-report.md) y las memorias `closed-matter-conservation-measured`,
> `energy-ledger-not-conserved`. Referencias `archivo:línea` verificadas.

---

## 0. El hallazgo maestro: una sola moneda disfrazada de dos

El modelo aparenta tener **dos monedas** —energía (`E`) y materia (`N`, pasto, carroña, `bodyMatter`)— pero en la
práctica son **la misma**, ligadas por un tipo de cambio fijo `energyPerUnit` (epu). Toda transacción lo confirma:

- **Metabolismo** ([`sim.js:671`](../../src/engine/sim.js)): `W.N[tcell] += metabRet; E[i] -= metabRet`. El coste
  de vivir/nadar **NO se disipa**: el 100% de la energía gastada vuelve como nutriente reutilizable a la celda.
- **Fotosíntesis** ([`world.js:125-128`](../../src/engine/world.js)): el pasto crece **consumiendo** `N`
  (`want = g·epu; N[i] -= want`). El "sol" **no añade energía**: solo relabela N→pasto. No hay fuente externa.
- **Trofismo** ([`sim.js:533-538`](../../src/engine/sim.js)): la "ineficiencia trófica" `(1−preyGain)` va a
  **carroña** (`remainder`), no a un sumidero; la carroña decae a `N`. Nada se pierde.

**Consecuencia de primer principio:** el sistema es un **bucle cerrado de materia sin disipación**. No existe un
sumidero de energía (calor), no existe una fuente de energía libre (sol real), no existe entropía. La "energía" es
materia relabelada que **circula para siempre sin degradarse**. Esto es lo que permite que la "vida" persista
indefinidamente en un sistema cerrado — algo que en termodinámica real sería un **móvil perpetuo de segunda
especie**. Funciona solo porque la energía aquí no es energía: es un nombre alternativo de la materia.

Todo lo demás en este documento se deriva de esa observación.

---

## 1. Leyes de conservación PRESENTES

### 1.1 Conservación de la materia (la única ley fundamental real) ✅
```
matterBudget·área = Σ N + Σ res·epu + Σ_vivos(E + bodyMatter) + Σ carrion = CONSTANTE
```
Es el invariante más fuerte y mejor cuidado del simulador. Cada transacción re-enruta materia sin crearla ni
destruirla:
- Alimentación: pasto removido = `units`; `effHerb·units·epu`→E, `(1−effHerb)·units·epu`→N ([`sim.js:687-689`](../../src/engine/sim.js)).
- Nacimiento: `bodyMatter` y `childE` salen del nutriente del vecindario; el rebose del tope→N ([`sim.js:758-767`](../../src/engine/sim.js)).
- Muerte: el cuerpo entero (E+bodyMatter)→carroña; la presa cazada ya repartió su materia (sin doble conteo).
- Difusión de N y decaimiento de carroña: conservativos por construcción ([`world.js:133-141,165-177`](../../src/engine/world.js)).

**Estado:** se cumple con una **deriva sistemática negativa por redondeo `Float32`** localizada en la acreditación
de la alimentación herbívora — **medida y despreciable** (≈−0.0001%; memoria `closed-matter-conservation-measured`).

### 1.2 Sub-conservaciones derivadas ✅
- **Difusión de nutriente** — conservativa (Σ N constante; `world.js: diffuseNutrient`).
- **Decaimiento de carroña** — íntegro a N local (no se pierde; `world.js: decayCarrion`).
- **Tope de almacén** — `E` no supera `eMax`; el exceso→N (no se acumula de la nada).

**Veredicto:** el modelo tiene **una** ley de conservación de primer principio (materia), implementada con rigor.
Es su cimiento más sólido.

---

## 2. Leyes de conservación AUSENTES o VIOLADAS

### 2.1 Energía / termodinámica — AUSENTE ❌ (la gran laguna)
No existe ninguna ley de conservación de energía **independiente** de la materia, ni su corolario (la 2ª ley):
- **No hay fuente de energía libre.** El "sol" (comentario en `world.js`) no inyecta nada; el sistema arranca con
  `matterBudget` y lo recicla. Un ecosistema real es una **estructura disipativa** alimentada por un flujo
  continuo de energía solar; Zenote es un frasco sellado.
- **No hay sumidero (calor).** El metabolismo devuelve el 100% como nutriente ([`sim.js:671`](../../src/engine/sim.js)).
  En biología, el metabolismo **disipa** energía como calor irrecuperable; aquí no.
- **No hay degradación trófica.** La famosa "regla del 10%" (cada nivel trófico pierde ~90% como calor) **no está
  enforzada por disipación**: la `(1−preyGain)` se recicla como materia. → ver §"fenómenos artificiales".

**Históricamente fue una violación abierta:** antes de la pecera cerrada, `carcassValue·eMax` al morir **creaba
biomasa de la nada** (≈17% de la entrada; memoria `energy-ledger-not-conserved`). La pecera lo convirtió en
conservación de materia — pero **a costa de eliminar la termodinámica**, no de añadir un balance de energía.

### 2.2 Espacio / volumen — AUSENTE ❌
- **No hay exclusión de volumen.** Los organismos **se solapan libremente**; el spatial hash sirve para
  *percibir*, no para *ocupar*. Infinitos agentes pueden coincidir en un punto.
- **El tamaño del cuerpo no ocupa espacio.** `radius` afecta a combate/visión/render, pero no impone densidad
  máxima local. No hay "no caben dos cuerpos en el mismo sitio".
- **Consecuencia:** la competencia por el **espacio** no existe como constraint; solo existe la competencia por el
  **recurso** (campo agotable). El hacinamiento es ilimitado salvo por el alimento y el tope global del pool.

### 2.3 Momento / dinámica newtoniana — AUSENTE (pese al nombre "modelo de fuerza") ❌
- El "modelo de fuerza" **no integra F=ma con momento conservado**. Es un **lag de primer orden**:
  `v += (v_objetivo − v)·velResp` ([`sim.js:626`](../../src/engine/sim.js)) y `omega += (omT − omega)·angResp`.
  Es una **relajación exponencial** hacia una velocidad objetivo, no una segunda ley de Newton.
- No hay colisiones, ni intercambio de momento, ni energía cinética contabilizada (la velocidad se "fabrica" desde
  el empuje sin restar de un depósito de momento). `velResp`/`angResp` **emulan** inercia (∝1/masa) pero no la
  conservan.

### 2.4 Tiempo / escalas de vida alométricas — PARCIALMENTE AUSENTE ⚠️
- El **tick** es la unidad de tiempo; no hay sub-tick. Correcto, pero hay una laguna de acoplamiento:
- **Las escalas temporales de la historia de vida NO son alométricas.** `mature_age` (80-650) y `senescence`
  (`age.scale`=500) son **genes/parámetros libres**, independientes de la masa. En biología, el tiempo de vida y
  de madurez escalan con la masa (`∝ mass^0.25`, el reverso de Kleiber). Aquí el metabolismo **sí** es alométrico
  (`mass^kleiber`) pero el **reloj vital no está atado a él** → un organismo puede ser metabólicamente "rápido" y
  longevo a la vez salvo por el coste ad hoc `k_lifespan` (deuda, no constraint).
- **No hay escala absoluta de tiempo/longitud** (gauge libre, documentado): escalar todas las longitudes por k y
  `moveCost` por 1/k² da un sistema idéntico → solo importan los ratios. Es coherente, pero significa que el
  tiempo es relativo a los parámetros, no a una física absoluta.

### 2.5 Información / coste de sensar — AUSENTE ❌
- La **percepción es gratis salvo un impuesto plano** (`k_sense`). No hay coste por bit de información, ni
  trade-off precisión/alcance derivado (el reparto alcance↔ángulo conserva un "área" arbitraria vía `fovRef`,
  parámetro). El cerebro recibe entradas perfectas y sin ruido (talla, escapabilidad, gradientes exactos).

---

## 3. Análisis por tópico (lo pedido)

### Energía
- **Conservación:** no como cantidad independiente; es materia × epu.
- **Violada/ausente:** sin fuente externa, sin disipación, sin entropía (§2.1).
- **Se apoya en parámetros:** `epu` (tipo de cambio materia↔energía, transversal y sensible), `closedRegen`
  (productividad primaria — pero limitada por N, no por luz), `preyGain` (eficiencia trófica plana).
- **Constraint que falta:** un flujo de energía de un solo sentido (fuente→trabajo→calor) desacoplado del ciclo de
  materia.

### Biomasa
- **Conservación:** sí, `bodyMatter = carcassValue·eMax`, y como `eMax ∝ mass` (incluye `massMul` de nodos), la
  biomasa **sí escala con la masa real** del cuerpo. Tomada de N al nacer, devuelta al morir.
- **Se apoya en parámetros:** la **fracción** estructural (`carcassValue`) es un **dial libre** —y el dominante
  herb↔carn, bimodal (deuda D3)— no una consecuencia de la composición del tejido. Dos cuerpos de igual masa pero
  distinta complejidad de nodos tienen idéntica biomasa: **construir complejidad es gratis** más allá de la masa.
- **Constraint que falta:** coste de biomasa derivado de la estructura (un grafo de 8 nodos debería "costar"
  materia/tiempo de ensamblaje más que un renacuajo de igual masa).

### Materia
- **Conservación:** ✅ presente y rigurosa (§1.1). **Es la única ley fundamental del modelo.**
- **Se apoya en parámetros:** solo en `matterBudget` (el tamaño del frasco) — legítimo, es una condición inicial,
  no un parche.
- **Constraint que falta:** ninguna; este eje está bien.

### Espacio
- **Conservación:** ❌ ausente. Sin exclusión de volumen, sin densidad máxima local (§2.2).
- **Se apoya en parámetros:** la competencia espacial se **sustituye** por el agotamiento del campo de recurso
  (`grazeRefuge`, `absRate`) y por el tope global `maxAgentsCeiling` (no espacial).
- **Constraint que falta:** ocupación física (un cuerpo de radio r reserva su área; el hacinamiento tiene un techo
  geométrico).

### Tiempo
- **Conservación:** N/A (no es cantidad conservada), pero **escalas no acopladas** (§2.4).
- **Se apoya en parámetros:** `mature_age`, `age.scale`, `senesSlow/Fast`, `cooldown`, `handlingTime` — todos
  tiempos en ticks fijados a mano, **no derivados de la masa/metabolismo**.
- **Constraint que falta:** alometría temporal (vida/madurez ∝ mass^¼), que cerraría el eje r/K por física en vez
  de por `k_lifespan` ad hoc.

### Coste metabólico
- **Conservación / ley:** ✅ **parcial y real**: `baseCost ∝ mass^kleiber` es una ley alométrica genuina (Kleiber ¾).
- **Se apoya en parámetros:** el coste base se multiplica por **sumas de impuestos independientes**
  `(1+k_metab·metab)(1+k_lifespan·…)(1+k_sense·sense+k_lure·lure)(1+k_muscle·…)` — cada `k_` es un loading ad hoc,
  no un coste derivado. El presupuesto metabólico es una **suma de tasas**, no una contabilidad cerrada de qué
  consume qué.
- **Constraint que falta:** que cada coste (visión, músculo, señuelo) salga de un balance de potencia común, no de
  un impuesto sumado aparte. Y la **no disipación** (§2.1): el coste vuelve íntegro a N.

### Coste reproductivo
- **Conservación:** ✅ buena. `investE` sale del padre y va a la cría (exceso→N); `bodyMatter` de la cría se toma
  del nutriente del vecindario, y **si no hay materia, no nace** ([`sim.js:758-760`](../../src/engine/sim.js)) →
  techo de población **endógeno y constraint-enforzado**. Este es uno de los pocos sitios donde una restricción
  fundamental (materia disponible) gobierna directamente un fenómeno (natalidad). 👍
- **Se apoya en parámetros:** el **umbral** de cría (`repro_thr`/`invest` × `reproRef`) es estrategia evolvable
  (legítimo), pero no hay **coste de gestación** ni **tiempo de desarrollo** ligado a la complejidad: una cría de
  cuerpo complejo aparece instantánea por el mismo precio/masa que una simple.
- **Constraint que falta:** tiempo/coste de desarrollo ∝ complejidad estructural.

### Coste de movimiento
- **Conservación / ley:** `moveCost·v²·(0.3+0.7·throttle)·…` ([`sim.js:667`](../../src/engine/sim.js)) — la
  dependencia cuadrática en v es físicamente motivada (arrastre), pero **no se conserva energía cinética** (§2.3):
  el coste se descuenta de E y vuelve a N; la velocidad no sale de un depósito de momento.
- **Se apoya en parámetros:** `moveCost`, y los multiplicadores `flapCost`/`haulMul`/`dragMul` (loadings),
  `velResp`/`angResp` (lag, no inercia conservada), `kThrust`/`vMax` (calibran la velocidad terminal).
- **Constraint que falta:** dinámica de segundo orden con momento (y, en rigor, energía cinética) conservados; el
  "modelo de fuerza" es un lag de primer orden con nombre de física.

### Otros relevantes
- **Número de organismos:** acotado por `maxAgentsCeiling`, un tope **no físico** (memoria/perf) que, en el modo
  de fallo, se vuelve el regulador ecológico (deuda D9). No es una constraint, es un límite de implementación.
- **Información genética:** sin coste de genoma (208 loci cuestan lo mismo que 10); la complejidad genética es
  gratis. (Se probó costar genes decorativos y no podó nada — deuda D15.)
- **Conservación de especies/linajes:** N/A (la evolución no conserva tipos), pero la **métrica de especie** es una
  distancia curada a mano, no una consecuencia de aislamiento reproductivo real (deuda D14).

---

## 4. Fenómenos mantenidos ARTIFICIALMENTE (parámetro en vez de constraint)

| Fenómeno | Cómo se mantiene HOY (parámetro) | Constraint fundamental que lo daría | Severidad de la sustitución |
|---|---|---|---|
| **Persistencia indefinida del ecosistema** | Reciclaje sin pérdidas (metabolismo→N al 100%) | Flujo de energía externo (sol) + disipación (calor) | **Crítica** (es el cimiento implícito) |
| **Pirámide / niveles tróficos limitados** | `preyGain`, `carcassValue` (la "ineficiencia" se recicla) | Disipación energética por nivel (~90% a calor) | **Alta** |
| **Capacidad de carga** | `matterBudget`, `closedRegen`, `grazeRefuge` | Materia (✅ presente) + luz limitante (ausente) | **Media** (la materia ya la enforza en parte) |
| **Techo de población local** | `bodyMatter` desde N (✅ constraint real) + `maxAgentsCeiling` (tope técnico) | Materia local (✅) | **Baja** (mayormente bien) |
| **Densidad espacial máxima** | Agotamiento del recurso + tope global del pool | Exclusión de volumen | **Media** |
| **Eje r/K honesto** | `k_lifespan` (impuesto a la longevidad) | Alometría temporal (vida ∝ mass^¼) | **Media** |
| **Especialización de gremios** | `omniPenalty`/`scavPenalty` (impuestos) | Incompatibilidad fisiológica derivada | **Alta** (deuda D4) |
| **Coexistencia depredador-presa** | Estabilizadores L-V cableados (refugio, fleeSpeed, handlingTime, failDamage) | Refugios espaciales + saciedad + coste de intento físicos | **Alta** (deuda D6) |
| **Coste de velocidad** | `moveCost·v²` (sin energía cinética conservada) | Dinámica newtoniana con momento/KE | **Media** |
| **Inercia** | `velResp`/`angResp` (lag de 1er orden ∝1/masa) | F=ma de 2º orden | **Media** |

---

## 5. Síntesis: dónde el modelo usa parámetros en vez de constraints

**El patrón de fondo.** Zenote tiene **una sola conservación fundamental robusta (materia)** y, sobre ella,
**sustituye casi todas las demás restricciones físicas por parámetros**:

1. **La termodinámica está ausente y sustituida por contabilidad de materia.** No hay fuente ni sumidero de
   energía; "energía" es materia × `epu`. Todo lo que en biología real surge del **flujo unidireccional de energía
   y su disipación** (la pirámide trófica, el límite al número de niveles, el por qué un ecosistema necesita el
   sol) aquí se **emula con parámetros** (`preyGain`, `carcassValue`, `closedRegen`) sobre un bucle de materia que
   nunca se degrada. **Es la laguna de primer principio más grande.**

2. **El espacio no es una restricción.** Sin exclusión de volumen, la competencia espacial y el hacinamiento se
   sustituyen por el agotamiento del recurso y un tope global de pool. La "densidad" no tiene techo geométrico.

3. **La dinámica de movimiento no conserva momento ni energía cinética.** El "modelo de fuerza" es un lag de
   primer orden calibrado (`velResp`, `kThrust`, `moveCost`) que *emula* inercia y arrastre sin las leyes que los
   generan.

4. **Las escalas temporales de vida no son alométricas.** El metabolismo escala con la masa (Kleiber, ✅) pero la
   vida y la madurez son genes libres, atados al metabolismo solo por un impuesto ad hoc (`k_lifespan`).

5. **La biomasa estructural y la información genética son casi gratis.** La complejidad (8 nodos, 208 loci) no
   cuesta materia, tiempo ni energía de ensamblaje más allá de su masa; su "valor" como cadáver es un parámetro
   plano (`carcassValue`).

**Dónde el modelo SÍ se apoya en una constraint real (y funciona bien):**
- Conservación de **materia** (la pecera) — rigurosa.
- **Natalidad limitada por materia local** (no nace sin nutriente) — un techo endógeno genuino.
- **Coste metabólico alométrico** (`mass^kleiber`) — una ley física real, aunque rodeada de loadings ad hoc.

**Lectura para la refactorización.** La mayoría de las palancas de RÉGIMEN que el [informe de deuda](evolution-debt-report.md)
marcó como críticas/altas (`carcassValue`, `omniPenalty`, los estabilizadores L-V, `size.min`) son **exactamente
los puntos donde un parámetro ocupa el lugar de una constraint ausente**: disipación energética, incompatibilidad
fisiológica, fricción ecológica espacial y alometría temporal. La fragilidad bimodal de esos diales no es mala
suerte de tuning: es el síntoma de **sostener con números lo que debería sostener una ley**.
```
