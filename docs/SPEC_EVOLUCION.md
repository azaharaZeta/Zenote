# Especificación del motor evolutivo — "Primordia"

Este documento define las reglas exactas de la simulación. Es la fuente de verdad
sobre genética, mutación y selección. El motor debe implementar esto fielmente;
la parte visual es secundaria al cumplimiento de estas reglas.

## 0. Filosofía de diseño

No replicamos la biología terrestre. Construimos un ecosistema artificial mínimo
pero suficiente para que emerjan, sin estar programados explícitamente:

- Especiación (divergencia de poblaciones en grupos genéticamente distintos).
- Carreras armamentísticas depredador-presa.
- Estrategias de vida divergentes (rápido y numeroso vs. lento y eficiente).
- Adaptación a gradientes ambientales (zonas frías/calientes, ricas/pobres).

Regla irrenunciable: **nada de comportamiento debe estar codificado a mano.**
Toda conducta proviene de un genoma sujeto a herencia, mutación y selección.
El programador define la *física* del mundo y la *expresión* de los genes, nunca
las estrategias "buenas". Esas deben emerger.

## 1. El mundo

- Rejilla continua (coordenadas float) de tamaño configurable, por defecto un toro
  (los bordes se envuelven) para evitar artefactos de borde.
- Recurso difuso: "energía solar/química" que se regenera por celda en un campo
  escalar de baja resolución (p.ej. 64x64) con un gradiente espacial fijo
  (más recurso en el centro o siguiendo ruido Perlin) para crear nichos.
- Tasa de regeneración por celda: `R_regen` (config). El recurso se acumula hasta
  un máximo `R_max` por celda.
- **Campo de "color de la luz":** un tono fijo por región (ruido de baja frecuencia,
  bandas amplias). Define qué color de pigmento absorbe mejor el recurso en cada zona
  (ver §3 y el gen `hue`). Es física del mundo: el paisaje lumínico lo pone el programador;
  el color de los organismos lo decide la evolución.
- (fase 3, IMPLEMENTADO) un eje escalar continuo por región, "temperatura",
  con un gradiente espacial. Los organismos tienen un gen de preferencia térmica;
  estar lejos del óptimo aumenta su gasto metabólico.

## 2. El organismo

Cada organismo (agente) tiene **estado** (fenotipo dinámico) y un **genoma** (fijo
durante su vida, heredado con mutación).

### Estado dinámico
- posición (x, y), velocidad (vx, vy)
- energía `E` (muere si `E <= 0`)
- edad (ticks vividos)
- contador de reproducción / cooldown
- `lineageId` (id del fundador ancestral, **heredado sin mutación** → ascendencia
  auditable) y `generation` (profundidad genealógica). No afectan a la física; son
  trazadores de linaje, independientes del color.

### Genoma (vector de genes float, normalizados salvo indicación)
Cada gen es un float; algunos se mapean a rango útil por una función de expresión.

| Gen | Símbolo | Rango bruto | Expresión / efecto |
|-----|---------|-------------|--------------------|
| Tamaño | `size` | [0,1] | radio = lerp(2, 12 px). Mayor tamaño: más energía máxima y más daño en combate, pero más coste metabólico. |
| Esfuerzo de nado | `speed` | [0,1] | **F-B: ya NO fija la velocidad** (que emerge de la morfología, ver §2bis). Es el *acelerador* (cuánto rema): modula la velocidad efectiva y el coste de moverse (∝ velocidad²·esfuerzo). |
| Sensor (radio percepción) | `sense` | [0,1] | radio_visión = lerp(10, 80 px). Coste ∝ sense. |
| Metabolismo | `metab` | [0,1] | escala simultáneamente el ritmo de alimentación y el coste basal (ver §3). Alto = come y se mueve más rápido pero quema más; bajo = lento y frugal. Trade-off real, sin "mejor" absoluto. |
| Dieta | `diet` | [0,1] | 0 = herbívoro puro (come recurso del campo), 1 = carnívoro puro (come otros agentes). Valores intermedios: omnívoro con penalización (ver §3, fórmula de eficiencia de dieta). |
| Agresión | `aggro` | [0,1] | propensión a iniciar ataque al contactar a otro agente; entra en la resolución de combate (§3). |
| Peso comida | `w_food` | [0,1] | peso de atracción hacia el **campo de recurso** (la comida del herbívoro). Útil solo si `diet` es bajo; en carnívoros la selección lo apaga. Expresión: factor lerp(0, 2). |
| Peso presa | `w_prey` | [0,1] | peso de atracción hacia **agentes comestibles** (atacables/menores). Útil solo si `diet` es alto. Expresión: factor lerp(0, 2). |
| Peso huida | `w_flee` | [0,1] | peso de repulsión frente a agentes amenazantes (mayores/agresivos). Expresión: factor lerp(0, 2). |
| Umbral reproducción | `repro_thr` | [0,1] | fracción de E_max necesaria para reproducirse: lerp(0.5, 0.95). |
| Inversión parental | `invest` | [0,1] | fracción de energía transferida a cada cría: lerp(0.2, 0.6). |
| Color / pigmento | `hue` | [0,1] | tono del organismo. **Rasgo adaptativo:** cuanto mejor sintoniza con el "color de la luz" local, mejor absorbe el recurso (§3); en Fase 2 reducirá además la visibilidad ante depredadores (camuflaje). Muta como cualquier gen. |
| Pref. térmica | `temp_pref` | [0,1] | óptimo térmico; la desviación frente a la temperatura local multiplica el coste basal (`energy.k_temp`). Segundo eje de nicho → adaptación espacial y especiación térmica. |
| **Morfología** (6 genes) | `m_app` `m_len` `m_width` `m_sym` `m_elong` `m_wave` | [0,1] | nº de apéndices (2..10), su largo, grosor, simetría (repartidos ↔ agrupados atrás), elongación del cuerpo y amplitud de ondulación. **F-A:** definen la forma dibujada (apéndices que ondean; grosor = cilio↔paleta) con LOD. **F-B:** definen la LOCOMOCIÓN (ver §2bis). De cosméticos pasaron a funcionales. |
| **Ornamentación** (2 genes) | `c_app` `c_tip` | [0,1] | color por partes: desfase de tono de los apéndices respecto al cuerpo (`c_app`, ±120°) y acento de tono/brillo en las puntas (`c_tip`). **NEUTRALES** (sin función directa): derivan por linaje → patrones de color divergentes. Solo afectan al render (modos "visión real" y "linaje"). Base para la **selección sexual de Fase 4**. |
| **Forma** (5 genes) | `s_asym` `s_curve` `s_place` `s_branch` `s_core` | [0,1] | **NEUTRALES** (solo render, derivan libres): asimetría izq/der, curvatura/enroscado de la columna de segmentos, colocación del abanico de apéndices de la cabeza (cola↔corona frontal), ramificación de apéndices (coral/asta) y forma del núcleo (elipse↔gota). Amplían el morfospacio para que la deriva genere siluetas originales que la selección no colapsa. Sustrato extra para la selección sexual (Fase 4). |
| **Selección sexual** (2 genes) | `orn` `pref` | [0,1] | `orn` = ornamento de exhibición (penacho/cresta visible que crece con el gen); `pref` = ornamento preferido en la pareja. Dirigen la **elección de pareja** (Fase 4) → runaway de Fisher → ornamentos divergentes/exagerados por linaje. Solo elección + render. |
| **Ojos / visión** (2 genes) | `e_fov` `c_eye` | [0,1] | `e_fov` = **campo de visión** (FUNCIONAL, ver §2ter): estrecho-frontal-largo alcance ↔ panorámico-corto, presupuesto conservado. `c_eye` = color del ojo (neutral). El tamaño del ojo dibujado ∝ `sense`, la posición ∝ `e_fov`, y el **ceño** ∝ `aggro` (los depredadores parecen feroces porque *evolucionan* aggro alto — emergente, no pintado por categoría). |

> **Color adaptativo, no neutral.** El `hue` se enganchó a la física del mundo (sintonía
> con la luz local) para que el color *emerja* de la selección, como la coloración real
> en la naturaleza (pigmentos fotosintéticos, cripsis), en lugar de ser un gen "tonto"
> que solo deriva. La ventana a la ascendencia ya no es el color sino el `lineageId`
> (heredado sin mutación). Color y linaje son ahora cosas distintas: el color dice *a qué
> ambiente está adaptado* un organismo; el linaje, *de quién desciende*.

### Cerebro (decisión) — SIN red neuronal en fase 1
Para garantizar rendimiento y que el comportamiento sea legible, la decisión es
una **regla reactiva parametrizada por genes**, no una IA codificada a mano con
estrategias. El agente, cada tick:

1. Percibe dentro de `radio_visión`: la celda de recurso más rica y los agentes cercanos.
2. Calcula un vector de deseo como suma ponderada de tres términos, cada uno con su gen:
   - `w_food` × atracción hacia la celda de recurso más rica (comida del campo).
   - `w_prey` × atracción hacia el agente comestible más cercano (menor que él).
   - `w_flee` × repulsión frente al agente amenazante más cercano (mayor/agresivo).
   - Como los tres pesos son **genes** independientes, la estrategia (pastar, cazar,
     huir, o mezclas) emerge de qué combinación de pesos sobrevive. Nada está fijado.
3. Se mueve hacia ese vector, pero **girando con la agilidad que le permite su forma**
   (no instantáneo) y a la **velocidad-capacidad que produce su morfología** (§2bis).

> **Cerebro neuronal (Fase 4, opcional) — HECHO.** Con `sim.brain = 'neural'` la suma reactiva se
> sustituye por una **MLP diminuta** (7→5→2, tanh) cuyos **pesos SON genes** (52 pesos, bloque `br0..`).
> Entradas: gradiente de comida (x,y), dirección a presa (x,y), dirección a amenaza (x,y), energía.
> Salidas: deseo de movimiento (dx,dy). Nada de estrategia programada: el comportamiento (pastar/cazar/
> huir) emerge 100% de los pesos seleccionados. Los pesos se **excluyen de la distancia genética**
> (no contaminan las especies; en modo reactivo derivan neutrales). Es un **modo experimento opcional**
> (defecto = regla reactiva, todo lo pulido intacto); al activarlo conviene Sembrar para empezar limpio.
> **Verificado:** desde cerebros aleatorios la población SOBREVIVE y el forrajeo evoluciona (pob crece
> ~1550→2100); los herbívoros prosperan y persisten algunos carnívoros; coexistencia más débil que con
> la regla afinada (esperado). Toggle "🧠 cerebro" en la UI.

## 2bis. Locomoción emergente (F-B) — la FORMA produce el movimiento

La velocidad y el giro **no son genes directos**: emergen de la morfología. El programador
define la física (empuje vs. arrastre); la selección esculpe la forma. Es la frontera, en
`organism.js` (cacheado al nacer). El gen `speed` pasa a ser **esfuerzo** (acelerador 0..1).

- **Empuje** = `finFactor · wave · straight`, con `finFactor` = (nº·largo·grosor de apéndices,
  normalizado), `wave` de `m_wave` (ondular genera empuje), `straight` de `m_sym` (simétrico
  empuja recto; asimétrico desvía empuje a girar).
- **Hidrodinámica:** la elongación (`m_elong`) reduce el arrastre (`stream = 1 + streamGain·(elong-1)`).
- **Velocidad-capacidad** `v_max = kThrust · empuje · stream · esfuerzo`, acotada a `[vMin, vMax]`.
  **Es INDEPENDIENTE del tamaño** (empuje y arrastre escalan igual con el radio → se cancela):
  encoger no regala velocidad. Esto fue clave para la coexistencia (si no, la presa encogía,
  se volvía rápida y barata, y era inalcanzable).
- **Giro:** cada tick la dirección rota hacia el deseo como mucho `turnRate` (de asimetría,
  tamaño y elongación). Cuerpos torpes (grandes/elongados/simétricos) sobrepasan a la presa.
- **Coste de nado ∝ velocidad²** (arrastre real): `moveCost · dist² · (1 + k_effort·esfuerzo)`.
  Ir rápido se dispara en coste → la velocidad la limita el presupuesto energético. La presa
  (renta de pasto pobre) no puede ir al máximo; el depredador (energía rica de la presa) sí →
  recupera ventaja de velocidad. **Mecanismo clásico depredador-presa, ahora emergente.**

> **Resultado verificado (jun 2026):** divergencia morfológica por nicho — depredadores con
> pocos apéndices largos/gruesos y cuerpo fusiforme (nadadores rápidos); herbívoros con muchos
> apéndices cortos y cuerpo redondo (pastadores baratos y maniobrables). Coexistencia estable.

## 2ter. Visión emergente y direccional (F-D) — los ojos producen la visión

Como la forma produce el movimiento (§2bis), los ojos producen la visión. `sense` fija la
**inversión** visual (alcance base + coste, §3). `e_fov` reparte ese presupuesto entre **alcance
y ángulo**, conservando aproximadamente el área del cono visual:

- `r_efectivo = r_base · (fovRef / fov)^rangeExp` (rangeExp 0.4: ventaja frontal suave).
- `halfFov = lerp(halfFovMin, halfFovMax, e_fov)` → cono estrecho frontal (ve lejos pero solo
  delante) ↔ ancho panorámico (ve cerca por casi todo el entorno).
- En la percepción, un agente a distancia solo se ve si cae **dentro del cono** centrado en el
  rumbo (test de producto escalar, sin sqrt/acos → coste despreciable). El combate por solape NO
  se filtra (si te tocan, peleas). Parado (sin rumbo fiable) → visión omnidireccional.

> **Resultado verificado (jun 2026):** divergencia emergente — depredadores con visión más
> **frontal** y de **mayor alcance** (e_fov ~0.55, sense ~0.70) y `aggro` altísimo (~0.94 → ojos
> feroces); herbívoros con visión **panorámica** (e_fov ~0.89) y `aggro` bajo (~0.10 → ojos
> dulces). Coexistencia con oscilaciones depredador-presa sostenidas (amortiguadas con
> `handlingTime` y un `rangeExp` suave para que el valle no toque cero).

## 2quater. Complejidad corporal emergente (F-C) — segmentos y módulos

El cuerpo deja de ser una sola pieza: emergen **cadenas de segmentos** (gusanos/ciempiés, con patas
laterales) y **módulos opcionales** on/off (lóbulos/partes extra). Genoma de longitud FIJA (tope de
piezas) → no rompe el SoA. Genes: `m_seg` (1–5 segmentos), `m_segtaper`, `m_segspace`, y 2 bloques
`mod{0,1}_{on,ang,dist,size}`. Un cuerpo **simple** (1 segmento, sin módulos) reproduce EXACTAMENTE
el modelo previo → la coexistencia base no cambia; los extras añaden:

- **Depósito de energía** (`eMax × masa`) — buffer para sobrevivir hambrunas. **Clave:** la
  reproducción se basa en el tamaño (no en la masa) → la complejidad NO frena la cría (evita el
  colapso a simple) ni da velocidad (evita la carrera presa-depredador).
- **Coste** de mantenimiento (`k_body`), **arrastre** (más lento) y **peor giro** (cuerpo largo).
- **Pasto ∝ masa** (`k_graze`): más cuerpo = más superficie para pastar. Esto ATA la complejidad al
  nicho HERBÍVORO (a un pastador le compensa; a un carnívoro, que no pasta, no) → divergencia ESTABLE.

> **Resultado verificado (jun 2026):** divergencia morfológica por dieta sostenida (>30k ticks):
> **herbívoros segmentados** (~3 segmentos + módulo, "cosechadores" tipo ciempiés) ↔ **carnívoros
> compactos** (1 segmento, sin módulos, ágiles para cazar). Coexistencia intacta (carn ~250, herb ~1900).
> Lección de diseño: una diversidad estable de un rasgo estructural exige ATARLO a un nicho que ya se
> mantiene (la dieta); si no, la selección lo lleva a un óptimo único (colapso).

## 3. Energética (el corazón de la selección)

**Capacidad y escalas.** `E_max = E_max_base * (0.5 + size)` (size 0 → 50, size 1 → 150).
El recurso del campo está normalizado en `[0, R_max]` por celda; se convierte a
energía mediante `energyPerUnit` (CONFIG). Esto es lo que pone en la misma escala
el recurso normalizado y la energía del organismo: 1 unidad de recurso = `energyPerUnit`
puntos de energía. **Es el parámetro de equilibrio más sensible**: si es muy bajo, todos
mueren de hambre al arranque; si es muy alto, la población explota hasta el tope. Ajustar
mirando la curva de población.

Por tick, cada organismo:

- **Coste basal**: `c_base * (1 + k_metab*metab) * (1 + k_size*size + k_sense*sense + k_app*finFactor)`
  Más grande, con más visión, mayor metabolismo y **apéndices más grandes** (`k_app`, mantenerlos
  y arrastrarlos) → más caro de mantener. (En F-B desaparece el término `k_speed*speed²`: la
  velocidad ya no es un gen sino que emerge de la forma; su coste se cobra en el movimiento.)
- **Movimiento (nado)**: coste extra `moveCost * dist² * (1 + k_effort*esfuerzo)`, **cuadrático
  en la velocidad** (arrastre hidrodinámico). El basal cobra por *tener* apéndices; el de nado
  cobra por *usarlos* yendo rápido. Ir al máximo es carísimo → frena la carrera de velocidad y
  hace viable la depredación (ver §2bis).
- **Alimentación** (el ritmo efectivo escala con `metab`: `abs_eff = absRate * (0.5 + metab)`):
  - **Eficiencia de dieta** (penaliza al omnívoro): `eff_herb = (1 - diet) * (1 - omniPenalty * 4*diet*(1-diet))`
    y `eff_carn = diet * (1 - omniPenalty * 4*diet*(1-diet))`. El término `4*diet*(1-diet)`
    vale 0 en los extremos (diet=0 ó 1) y 1 en el centro (diet=0.5): el especialista no
    paga penalización, el omnívoro sí.
  - **Sintonía de color (pigmento):** factor `colorMatch = 1 - matchPenalty * 2*distCirc(hue, luz_local)`,
    donde `distCirc ∈ [0, 0.5]` es la distancia circular de tono. Un pigmento bien sintonizado
    con la luz local capta más recurso (`colorMatch≈1`); uno desajustado capta poco
    (`colorMatch≈1-matchPenalty`). Aquí el color deja de ser neutral y se vuelve seleccionable.
  - Herbívoro: absorbe `min(E_falta, recurso_celda * abs_eff * colorMatch * energyPerUnit) * eff_herb`;
    el recurso de la celda baja en lo absorbido (en unidades de recurso).
  - Carnívoro: si ataca y vence (ver §3.1), gana `preyGain * E_presa * eff_carn`.
- **Reproducción**: ver sección 4.
- **Muerte por hambre**: si `E <= 0`.
- **Muerte por vejez** (senescencia probabilística): cada tick muere con probabilidad
  `age.mortality * (max(0, edad - age.mature) / age.scale)²`. Antes de `age.mature` el
  riesgo es nulo; después crece cuadráticamente. Sin tope duro de edad: es estocástico.
- **Reciclaje del cadáver:** al morir **por hambre o vejez**, deposita `corpseReturn * E`
  como recurso en su celda (repartido respetando `R_max`). En cambio, **una presa muerta
  por depredación NO deposita cadáver**: su energía ya se la queda el depredador (§3.1).
  Así la energía se conserva (no se crea contabilizándola dos veces).

La selección NO es una función de fitness explícita. La selección es **simplemente
que los que se quedan sin energía mueren y no se reproducen.** El fitness emerge.

> **Nota de balance a vigilar (coste de `sense`).** El área percibida crece con el
> *radio²* pero el coste basal de `sense` es lineal. Si al observar la primera corrida
> `sense` colapsa a 1 en toda la población (ver lejos sale gratis y deja de ser un gen
> interesante), cambiar el coste a `∝ sense²` (o proporcional al área) para restaurar el
> trade-off. Es un knob de equilibrio, no una regla de comportamiento.

### 3.1 Combate (resolución exacta)
El potencial atacante solo puede atacar a un agente que sea **(a) más pequeño** (radio menor,
ventaja física) **y (b) esté al menos `combat.dietMargin` más abajo en la dieta** (presa real,
no un igual), con el que se **solapa** (distancia < suma de radios), si **no está en tiempo de
manejo** (ver abajo) y **decide atacar** (con probabilidad `aggro`, evaluada ese tick).

> **Por qué estas dos condiciones** (física trófica, no conducta codificada):
> - **(a) más pequeño:** el cazador necesita ventaja de tamaño.
> - **(b) más abajo en la dieta:** un depredador no caza a otro depredador de dieta similar.
>   Esto evita el canibalismo entre iguales —y, sobre todo, **la carrera al gigantismo**: si
>   los grandes pudieran comerse a los medianos, el tamaño del depredador escalaría sin freno
>   hasta volverse metabólicamente insostenible (`k_size` alto) y extinguirse. Con (b) el
>   depredador no gana nada siendo enorme → se queda **esbelto y barato**.
>
> **Las tres fugas de la presa, cerradas:** (1) hacerse gigante para no caber como presa →
> bloqueada por el coste de tamaño (`energy.k_size` alto); (2) encoger por debajo del alcance
> → no aplica, el depredador come a cualquier presa menor; (3) subir su propia dieta para no
> contar como "presa" → la penaliza el coste de perder eficiencia herbívora. El resultado es
> **coexistencia estable** depredador-presa (§7.3), con el tamaño del depredador acoplado al
> de la presa. Sembrar presa pequeña y depredadores esbeltos al inicio acelera el arranque.

- **Tiempo de manejo (`handlingTime`):** tras una captura, el ganador entra en enfriamiento
  y no puede volver a atacar durante N ticks (digestión). Limita la tasa de depredación →
  el cazador no puede "limpiar" una zona → la presa amortigua → coexistencia en vez de
  colapso. Es la pieza que estabiliza el sistema.
- Fuerza de cada contendiente: `fuerza = (size + 0.1) * (0.5 + aggro)`, elevada al
  exponente `combat.sizeAdvantage` sobre el término de tamaño (sube → el tamaño pesa más).
- Probabilidad de que gane el atacante: `P = fuerza_att / (fuerza_att + fuerza_def)`
  (resolución estocástica; nadie gana "por regla", emerge del genoma).
- El perdedor muere (sin depositar cadáver, ver §3); el ganador recibe
  `preyGain * E_perdedor * eff_carn` (limitado a `E_max`). Si el atacante es herbívoro
  puro (`diet≈0`) su `eff_carn≈0`: atacar no le
  renta, así que la agresión solo se sostiene si la dieta carnívora coevoluciona. Eso es
  emergencia, no una regla "los herbívoros no atacan".

> Nota: el combate puede dejarse desactivado (`combat.enabled=false`) en Fase 1 para
> validar la selección solo con herbívoros (ver criterios §7.1).

## 4. Reproducción y herencia

### Siembra inicial
La población inicial (`pop.initial`) se crea con **cada gen muestreado uniforme en
[0,1] de forma independiente** (incluido `hue`): así no presuponemos ninguna estrategia
de partida y dejamos que la selección esculpa la distribución. Energía inicial
`E = 0.5 * E_max`, posición aleatoria, velocidad cero, cooldown a cero. Si `pop.seed`
es un número, el RNG es reproducible (mismo seed → misma corrida).

> **Fase 1 (combate apagado):** con `diet` uniforme, la mitad de la población nace con
> `eff_herb` baja y pasará hambre hasta que `diet→0`. Eso es una demostración *deseable*
> de §7.1 (ver la distribución de `diet` colapsar a 0), pero implica una mortandad inicial
> fuerte. Si se prefiere un arranque más suave, sembrar `diet` cerca de 0 en Fase 1 (no
> es hacer trampa: solo elige el punto de partida; la selección sigue libre). Decisión de
> configuración, no del motor.

### Reproducción asexual (por defecto)
- Asexual por defecto (más simple y rápido). Un organismo puede reproducirse si
  cooldown a cero **y** `E >= max(repro_thr, invest) * E_max`. La condición usa el
  máximo de ambos genes para garantizar que pagar la cría nunca deja al progenitor en
  energía negativa (si `invest > repro_thr`, manda `invest`). Las combinaciones génicas
  inviables simplemente no se reproducen; la selección las purga, no las programamos fuera.
- Coste: transfiere `invest * E_max(progenitor)` a la cría y resta esa energía de sí mismo.
- La cría aparece junto al progenitor con el **genoma copiado + mutación**. Su energía
  inicial es `min(invest * E_max_progenitor, E_max_cría)`: se recorta al E_max propio de
  la cría (que depende de *su* `size` ya mutado), de modo que la energía no se "crea".
- **Linaje:** la cría hereda el `lineageId` del progenitor **sin mutación** y
  `generation = generation_progenitor + 1`. Los fundadores reciben cada uno un `lineageId`
  único. Permite auditar qué linajes prosperan o se extinguen.
- **Tope de población:** si la población activa alcanza `pop.maxAgents`, el nacimiento se
  **bloquea**; el progenitor conserva su energía (no paga la cría) y reintenta tras el
  cooldown. El tope protege los FPS sin alterar la selección.
### Reproducción SEXUAL + especiación (Fase 4) — `repro.sexual = true`
Al reproducirse (misma condición de energía/cooldown), el organismo busca una **pareja compatible**
cercana (vecino vivo dentro de `repro.mateRadius` con **distancia genética < `speciesGenThreshold`**,
vía spatial hash) y la cría es **recombinación** de los dos genomas (cruce uniforme: cada gen al azar
de un padre) + mutación. El "padre" pone la energía y queda en cooldown. **Si no hay pareja compatible
al alcance → fallback ASEXUAL** (clon), para que los aislados no dejen de reproducirse (evita colapsos).

La **compatibilidad por distancia genética** es lo que produce **ESPECIES reales**: cuando dos grupos
derivan más allá del umbral, **dejan de poder cruzarse** → quedan reproductivamente aislados → divergen
por su cuenta → muchas formas distintas mantenidas por aislamiento (no por nichos). **Especies = clústeres
genéticos**, calculados periódicamente en el worker (k-means con umbral; centroides que siguen a sus
miembros; ids estables) → contador de especies + modo de render "colorear por especie".

> **Resultado verificado (jun 2026):** desde un mundo aleatorio, la población se fragmenta en muchos
> proto-clústeres (~23) que coalescen en un puñado de **especies estables (~6)**, cada una con su color
> (id) y su FORMA divergente (p. ej. rojos espinosos, verdes compactos, azules pequeños, magentas grandes).
> Coexistencia depredador-presa intacta. Población algo menor que en asexual (emparejarse es más exigente).

### Selección sexual (Fase 4) — runaway de Fisher
Dos genes nuevos: `orn` (ornamento de exhibición, visible como un **penacho/cresta** de plumas que CRECE
con el gen) y `pref` (ornamento preferido en la pareja). Al **elegir pareja**, entre las compatibles al
alcance se queda con la **más atractiva** = la que mejor encaja con la preferencia (`1 - |orn_pareja −
pref_propia|`). Como `orn` y `pref` se heredan juntos (crossover), se **correlacionan** → cada linaje
"se dispara" en su dirección (Fisherian runaway) → ornamentos **divergentes y exagerados por especie**.
Solo afecta a la elección de pareja y al render (la cresta); no es coste ni beneficio de supervivencia.

> **Verificado (jun 2026):** el ornamento DIVERGE y se mantiene multimodal (linajes "lisos" sin cresta
> ↔ linajes "exhibidores" con cresta de plumas y ocelos luminosos), estable >17k ticks, coexistencia y
> especies intactas. Cumple el cierre de Fase 4.

### Mutación (precisa y configurable)
- Por cada gen, con probabilidad `mut_rate` (p.ej. 0.03) se añade ruido gaussiano
  `N(0, mut_sigma)` (p.ej. sigma 0.05), luego se recorta (clamp) a [0,1].
- `mut_rate` y `mut_sigma` son globales y configurables. Bajos → evolución lenta y
  estable; altos → exploración caótica. Exponer ambos en la UI (sliders).
- Mutación rara de gran efecto opcional: con prob. `mut_big` (p.ej. 0.002) ruido
  con sigma 5x (saltos macro-evolutivos).

### Distancia genética
Métrica única usada tanto para la compatibilidad sexual (Fase 2) como para el conteo
de "especies" por clustering (VISUAL): **distancia euclídea normalizada sobre TODOS los
genes** (incluido `hue`, que ya es funcional al afectar a la absorción). Con `n` genes:
`dist(g1, g2) = sqrt( Σ (g1ᵢ - g2ᵢ)² / n )`, que queda en `[0,1]`. Dos organismos son
compatibles para cruce sexual si `dist < speciesGenThreshold`.

## 5. Bucle de simulación y rendimiento

Objetivo: miles de agentes a 30–60 ticks/s en un portátil normal, en el navegador.

Decisiones de rendimiento (obligatorias):
- **Lógica desacoplada del render.** La velocidad se fija en **ticks por segundo**
  (`targetTPS`), NO en ticks por frame: cada frame el motor ejecuta los ticks que
  correspondan según el tiempo real transcurrido y dibuja una vez. Así los fps van por
  su cuenta (idealmente 60; si la simulación no llega, bajan sin congelar el render). El
  modo "max" simula a tope. La velocidad real está acotada por el coste de CPU por tick
  (escala con la población); para superarlo, mover el motor a un Web Worker (fase 4).
- **Spatial hashing / uniform grid** para vecindad: nunca O(n²). Construir un grid
  de celdas del tamaño del mayor radio de visión y consultar solo celdas vecinas.
- **Typed arrays / Structure of Arrays**: en vez de un array de objetos, usar
  Float32Array por atributo (x[], y[], E[], genes...). Reduce GC y mejora caché.
- **Render con Canvas 2D** (no DOM por agente). Dibujar como círculos; si hay
  >5000 agentes, considerar puntos o instancing en WebGL (fase 2).
- **Sin asignaciones en el bucle caliente.** Reutilizar buffers; pool de agentes
  (lista de índices libres) para nacimientos/muertes sin realloc.
- **Web Worker** para el motor (fase 4, IMPLEMENTADO): el motor corre en `engine/worker.js`
  y envía "fotos" (snapshots) compactas por frame al hilo principal, que solo renderiza
  (vía un `simProxy` que imita la interfaz del Sim). Render y simulación ya no comparten
  hilo → render fluido + más ticks/s, y el motor sigue corriendo en segundo plano.

Estructura recomendada de archivos:
- `engine/world.js` — estado, grid espacial, recurso.
- `engine/organism.js` — expresión génica, energética, decisión.
- `engine/genome.js` — definición de genes, copia, mutación, distancia genética.
- `engine/sim.js` — bucle de ticks, nacimientos/muertes, pool.
- `render/canvas.js` — dibujo del mundo y agentes.
- `ui/controls.js` — sliders, play/pausa, velocidad.
- `ui/charts.js` — gráficas de población y de distribución de genes.
- `main.js` — orquestación.

## 6. Parámetros por defecto (config inicial)
Ver `CONFIG.md`. Deben poder cambiarse sin tocar el motor.

## 7. Criterios de aceptación (¿funciona la emergencia?)
La simulación se considera lograda si, sin tocar el código de estrategias, se
observa al menos:
1. La distribución de algún gen se desplaza con el tiempo (selección actuando),
   visible en la gráfica de distribución.
2. Aparición espontánea de al menos dos grupos con `hue`/genes divergentes
   (proto-especiación), idealmente correlacionada con nichos espaciales o dietas.
3. Si se activan carnívoros, oscilaciones tipo depredador-presa en las curvas de
   población (no necesariamente estables, pero reconocibles).
4. Reversibilidad: subir `mut_sigma` o cambiar `R_regen` altera visiblemente qué
   estrategias dominan, demostrando que la selección responde al ambiente.

Estos criterios deben poder comprobarse desde la propia UI (gráficas), no leyendo logs.
