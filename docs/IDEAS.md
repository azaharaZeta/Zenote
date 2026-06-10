# Ideas / backlog

Ideas estudiadas pero no implementadas (aún). Cada una con su contexto para poder retomarla en frío.

---

## Diversidad morfológica — afinar el sistema de nodos

**Contexto:** poca variedad de cuerpos: el sembrado a `startDiversity=0` es renacuajo (cabeza+cola), el
renacuajo base ya nada bien (**selección estabilizadora**) y añadir un nodo era un **acantilado** (umbral duro
`present≥0.5` + coste de golpe en masa/arrastre/decoherencia de fase).

**HECHO (2026-06-10) — Presencia GRADUADA (lever 1):** `present` deja de ser on/off. Banda `[0.4,0.6]`: el nodo
**aparece de forma continua** (peso 0→1 que escala su área → masa/arrastre/empuje en proporción), pleno ≥0.6,
ausente <0.4. El render usa la misma banda → el nodo **crece visualmente** al aparecer (`bodyplan.js` `presWeight`,
`canvas.js`, SPEC §2bis). Acantilado → rampa: la morfología puede exaptar gradualmente.
**HECHO — anclaje:** el suelo del factor de distancia hijo↔padre subió de 0.4 a **0.85** (`canvas.js` `_drawBodyGraph`)
→ los nodos hijos dejan de quedar **enterrados bajo el padre** (apiñamiento que se veía).

### Hoja de ruta por CAPAS (estudio 2026-06-10) — hacer poco a poco, en este orden

Diagnóstico: hoy cada nodo es **una elipse** (`aspect` solo cambia la elongación) y el movimiento es **una sola
oscilación** por nodo (el render ya ondula vía onda viajera, pero la física no distingue ondular de aletear). Para
ver evolucionar alas/tentáculos/garras "como en la naturaleza" se recomienda añadir variedad **por capas**:

- **CAPA 1 — FORMA del nodo (`tipShape`). HECHO (2026-06-10).** Gen nuevo por nodo (genoma 169→177): afila a la
  punta (`<0.5`: púa/garra/tentáculo) ↔ elipse (`≈0.5`) ↔ se abre (`>0.5`: aleta/paleta/ala). **Física honesta y
  neutra en 0.5** (`bodyplan.js`): abrir → +empuje +arrastre; afilar → −empuje, −arrastre, +alcance. Coefs
  `loco.tipThrust/tipDrag/tipReach`. **Render**: silueta paramétrica en `drawNode` (`silPath`, base↔punta) que
  crece con la presencia. Tests `tipShape` 6/6. *Pendiente de afinar en preview* las proporciones de la silueta;
  *no hecho*: anclar por la BASE (se quedó en anclaje centrado + suelo 0.85); revisitar si las puntas se entierran.
- **CAPA 2 — FUNCIONES ecológicas de los nodos.** Apoyándose en las formas de la capa 1 → morfospacio multi-pico.
  - **HECHO (2026-06-10) — alcance de captura morfológico:** los apéndices FRONTALES extienden el radio de caza
    (`plan.fwdReach` → `sim.morphReach` → combate en `sim.js`; `combat.morphReach`). Cuesta nado (`gait<0`) → solo
    rentabiliza al depredador → morfología de agarre (garras/tentáculos al frente) EMERGE en carnívoros. Test 5/5.
    Founders sembrados con cola trasera → `morphReach=0`; el alcance debe evolucionar. *A vigilar en ecología:* que
    no haga la caza demasiado fácil (bajar `morphReach` si los carnívoros dominan); afinar.
  - **HECHO (2026-06-10) — superficie de PASTOREO:** el pasto escala además con la ANCHURA del cuerpo (baja
    elongación): `absEff ·(1 + k_grazeWide·anchura)`, `anchura = 1 − (elongN−1)/(elongMax−1)` (`organism.js`;
    `energy.k_grazeWide`). Cuerpo ancho/aplanado pasta más; afilar/alargar sirve para nadar+alcanzar → la MISMA
    elongación tira de herbívoros (anchos) y carnívoros (aerodinámicos) a formas opuestas. Solo rinde a `effHerb`.
    Test 3/3 (ancho 0.49 vs largo 0.29). *A vigilar:* que no dispare la población herbívora (bajar `k_grazeWide`).
  - **MANIOBRA — probablemente ya emergente, sin lever nuevo.** El giro (`turnRate`, emergente de asimetría/talla)
    YA da ventaja vía la dinámica de persecución/evasión: quien gira mejor cierra distancia con la presa o escapa
    del depredador (el cerebro controla el rumbo; `turnRate` limita cuán rápido). No hace falta un bonus de combate
    explícito (sería heavy-handed / menos emergente). → **Capa 2 se da por completa** con alcance + pastoreo + maniobra implícita.
- **CAPA 3 — MODOS de movimiento (`gaitMode`). El escalón grande.** Mezclar *ondular* (flexión axial, actual) ↔
  *aletear* (barrido del ángulo `emit` = batir) — un nodo lateral abierto que ADEMÁS bate = un ala de verdad.
  Cada modo nuevo = su curva de empuje/arrastre/coste en la física + su animación en el render → es lo más caro;
  dejarlo para después de las capas 1-2.

**PENDIENTE (menor) — apiñamiento de hermanos:** varios nodos con el mismo `parent` y `emit` parecido se
solapan. Posible reparto angular sutil entre hermanos (solo render, no toca genética).

---

## "Cabeza nadadora / cabezas voladoras" — la cabeza ya NO es el motor (HECHO, en pruebas)

**Estado: IMPLEMENTADO** (2026-06-10), pendiente de verificación ecológica en el navegador.
**Hecho:** `loco.headThrust` (0.15) → la cabeza propulsa débil (es carga, no motor); `kThrust` recalibrado a 7.1
(un nadador con cola ≈ v1, cabeza sola ~0.47). Sembrado "renacuajo" (cabeza + cola propulsora) para no colapsar
al arrancar. Slider "Empuje de la cabeza" para tunear la presión (1 = régimen previo). Verificado numéricamente:
cabeza sola 0.47 ≪ cabeza+cola 1.0 → la cola RINDE. **A vigilar en el navegador:** que la población no colapse y
que proliferen colas/aletas (menos cabezas peladas). Texto histórico de la idea abajo.

---
**(Contexto original)**

**Hoy:** el nodo raíz (cabeza) es un "motor base" — `gait=+1` y amplitud propia (`osc_amp`), así que un
organismo de **1 solo nodo nada bien** (interpretación: el cuerpo se contorsiona, como un renacuajo). Se
decidió así para que los organismos simples sembrados sean viables (si no, casi nadie se movería al arrancar).

**El problema (para la misión visual):** si una cabeza pelada ya nada bien, **hay poca presión selectiva
para evolucionar colas/aletas** (una cola añade empuje pero cuesta arrastre/masa) → el mundo tiende a
dominarse de cabezas simples, en vez de morfologías variadas y "vivas".

**Idea a probar:** **reducir o quitar el empuje base de la cabeza** (`_gait[0]`/amplitud raíz en
`bodyplan.js`), de modo que nadar bien EXIJA estructuras propulsoras (cola trasera con `gait≈+1`, aletas
laterales). Así emergerían colas por selección → cuerpos más elaborados. Más realista (un blob liso no se
propulsa en fluido — teorema de la concha de vieira). 

**Riesgo / por qué es un ajuste DELIBERADO, no trivial:** es un cambio de **balance ecológico** — al
principio muchos organismos nadarían poco → más mortalidad → fuerte selección hacia colas. Hay que medir
(¿colapsa la población?, ¿emergen colas o se extingue todo?). Probar con un suelo pequeño de empuje base
(no cero) y observar. Relacionado con el dominio de cabezas que ya se observó en B2.

---

## Selección de presa por talla (forrajeo óptimo) — EMERGENTE

**Estado:** propuesta, sin implementar (2026-06-09).

**Idea original (del usuario):** que el cazador, al elegir presa, tenga en cuenta el tamaño —
buscar la que le da más comida y es más fácil de atacar (ni muy pequeña, da poca comida; ni muy
grande, que lo mata).

**Cómo funciona hoy:** el objetivo de presa es **el más cercano** dentro del cono de visión
(`bestPrey` / `bestContact` en `sim.js`, elegidos por distancia). Los genes `aggro` (prob. de
atacar) y `w_prey` (peso de la presa en el deseo de movimiento) modulan *cuánto* perseguir/atacar,
pero **no qué presa** — la selectividad por tamaño NO es un rasgo evolucionable.

**Por qué NO hacerlo cableado:** programar "elige argmax(comida × prob_victoria)" inyecta una
ESTRATEGIA de forrajeo óptimo escrita a mano → choca con la regla nº1 (la conducta debe emerger de
genes bajo selección, no decidir el programador qué es óptimo). "El más cercano" es una heurística
perceptual neutra; "lo más rentable y seguro" es una optimización de fitness.

**Vía fiel a la emergencia (la recomendada si se retoma):**
- **Modo reactivo:** añadir un gen `prey_pref` (ratio de talla presa/depredador preferido) y opcional
  `prey_focus` (selectividad). El targeting puntúa cada presa en banda por distancia × cercanía a la
  preferencia, en vez de solo distancia.
- **Modo neuronal (el activo por defecto):** añadir la **talla relativa de la presa como ENTRADA del
  cerebro** (hoy las entradas no la incluyen). Así los pesos (= genoma) pueden aprender a evitar presa
  grande y emerge solo. Implica `BRAIN.I` +1 y reentrenar/resembrar.
- Coste: gen(es) nuevo(s) → `NUM_GENES`, seeding, clasificación FORM/FUNCTIONAL, labels, grupos.
  Moderado pero acotado (insertar entre los genes de conducta, antes del bloque de forma contiguo).

**Por qué es interesante:** si los carnívoros se vuelven selectivos sería un RESULTADO medible
(forrajeo óptimo emergiendo), no un regalo del programador. Y reduciría el desgaste de combate
(hoy con `preyBandHi=2.0` atacan presa hasta 2× su talla, ~47% de morir por ataque).

**Relación con lo ya hecho:** el [cambio 1 — fallar un ataque hiere en vez de matar
(`combat.failDamage`)] ataca la misma fragilidad carnívora desde el otro lado (suaviza la
*consecuencia* en vez de evitar la *mala pelea*). Conviene medir el efecto del cambio 1 ANTES de
decidir si este hace falta — puede que con failDamage ajustado ya no sea urgente.

---

## Nuevas ENTRADAS sensoriales del cerebro (uso táctico emergente)

**Estado:** propuesta, sin implementar (2026-06-10). Surgió analizando el refugio (#7) y la "manada".

Hoy el cerebro tiene 7 entradas: gradiente de comida (x,y), dirección a presa (x,y), dirección a amenaza
(x,y), energía. **No percibe ni la cobertura ni a los congéneres** → ciertas conductas no PUEDEN evolucionar
porque al cerebro le falta la señal. Dos entradas candidatas (misma implementación: `BRAIN.I` +N → relayout
del genoma + ampliar `seedBrain`, como en #9/#10):

- **Cobertura/vegetación local** (densidad de vegetación en la celda, o gradiente hacia lo tupido) → permitiría
  que emerja el **uso TÁCTICO del refugio**: huir HACIA la maleza al ser perseguido, no solo huir de la amenaza.
  Hoy el beneficio de la cobertura (#7) es POSICIONAL (te salva si estás en lush), no una decisión. Con esta
  entrada, esconderse podría volverse conducta seleccionada.
- **Dirección al congénere más cercano** → permitiría que emerja la **caza/movimiento coordinado en manada**
  (hoy las "manadas" son solo clustering por reproducción local + objetivos compartidos, no coordinación; ver
  memoria `emergent-pack-clustering`). Con esta entrada, cardúmenes/manadas reales podrían emerger por selección.

**Coste:** cada entrada nueva = `BRAIN.I` +1, recalcular `BRAIN_W`, ampliar `seedBrain`, percibir la señal en
`sim.js`. Moderado. Riesgo: más entradas = espacio de pesos mayor → la conducta tarda más en afinarse (ver la
fragilidad carnívora con mutación baja, memoria `carnivore-extinction-mutation`).

---

## Amplificar los refugios MÓVILES (patchiness por defecto) — HECHO

**Estado: HECHO** (2026-06-10): el default de `resource.patchiness` se subió a **0.3** (antes 0).

Tras #7 (cobertura = vegetación viva), la dinámica de **refugios que migran** (claros pastados ↔ parches que
rebrotan, Huffaker) es mucho más rica con `resource.patchiness > 0` (rebrote logístico + difusión → parches
que emergen y migran). Con el default a **0.3** ya se aprecia de serie el bucle "comer destruye tu escondite".
Sigue siendo knob de UI por si se quiere subir más (parches escasos → hambrunas locales más duras).

---

## Mejorar el DIBUJADO de la vegetación (legibilidad)

**Estado: FASE 1 HECHA** (2026-06-10) · Fase 2 pendiente.
**Nota (2026-06-10):** se eliminó el escenario `meadow` (pradera); el Cenote abisal es el ÚNICO escenario.
La "vegetación" hoy es la fosforescencia teal + plancton del sustrato abisal. La Fase 2 (dosel) habría que
reinterpretarla en clave abisal (velo de algas/partículas delante de los bichos en zonas densas).

**Problema (resuelto en Fase 1):** la vegetación apenas se distinguía del fondo abisal. 

**FASE 1 — hecha** (`render/canvas.js`, abisal, render puro): fondo casi negro donde no hay vegetación → la
vegetación se lee por **contraste** (tinte teal/algas tenue, con techo por debajo del brillo de los bichos);
el "plancton" pasó de discos blancos planos a **chispas pequeñas con glow y color** (5 tonos verde→cian,
sprites pre-renderizados, **densidad por cantidad**: lush = muchas, claros = casi ninguna). Ya se ven los
parches densos vs los claros pastados. (Ajustes a ojo afinados en preview con la usuaria.)

**FASE 2 — pendiente: organismos escondidos tras el dosel.** La idea que más gustó: vegetación translúcida
dibujada DELANTE de los organismos en zonas densas → se *ve* que se esconden (liga directo con el refugio #7)
y da profundidad por capas. Enfoques: (A) velo de dosel (segundo buffer sobre los agentes), (B) fundido del
agente según su cobertura, (C) ambas. La usuaria eligió "solo Fase 1 de momento" → la Fase 2 queda aquí para
retomar. Recordar: el render NO toca la simulación (regla 3 de VISUAL.md). Bonus: ver los claros abrirse al
pastar = ver el Huffaker emerger.
