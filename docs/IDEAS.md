# Ideas / backlog

Ideas estudiadas pero no implementadas (aún). Cada una con su contexto para poder retomarla en frío.

---

## "Cabeza nadadora" — ¿debería un cuerpo de 1 nodo poder nadar? (ajuste de balance)

**Estado:** decisión consciente, pendiente de revisar (2026-06-10).

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
