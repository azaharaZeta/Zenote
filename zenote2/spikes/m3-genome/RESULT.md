# SPIKE M3 — ¿converge el genoma generativo o deriva al caos? (R3) → **GO**

> Riesgo R3 de 2.5: las codificaciones generativas pueden ser difíciles de evolucionar (paisajes engañosos,
> morfologías degeneradas). ¿El lenguaje de desarrollo de 2.2 (grafo recursivo) **converge** a cuerpos coherentes y
> mejorando bajo selección, y sus operadores estructurales **cruzan valles sin sembrar**?
>
> Test: evolucionar morfología hacia eficiencia locomotora (empuje coherente en fase / arrastre — el valle de 2.2 §4),
> comparando DIRECTA (slots fijos, solo paramétrica = análogo del modelo actual) vs GENERATIVA (módulos + recursión/
> duplicación/simetría/regulatoria). Reproducir: `node zenote2/spikes/m3-genome/evolve.mjs 200 <seed>`

## Veredicto: **GO** ✅

Medido en 4 seeds (POP 200 × 200 generaciones):

| | Directa (paramétrica) | Generativa (operadores) |
|---|---|---|
| Fitness final | 2.33–2.63 | **4.511 (idéntico en las 4 seeds)** |
| Ventaja generativa | — | **1.71–1.94×** |
| Estructuras emergentes (sin sembrar) | — | cadena recursiva máx (8) + 2–7 pares simétricos, en **4/4** |
| Cuerpos inválidos | 0 | **0 de 160.000 desarrollos** |

### 1. Converge — NO deriva al caos
Ambas codificaciones mejoran desde un fundador casi vacío (fitness ~0). La generativa converge **de forma fiable al
MISMO óptimo (4.511) en las 4 seeds** — lo contrario del caos que temía R3. El genoma de reglas es evolucionable y
está bien condicionado.

### 2. Cruza valles SIN sembrar (la tesis de 2.2 / deuda D1)
En **todas** las seeds, la generativa desarrolla por sí sola:
- **Cadenas recursivas** (longitud máxima 8 — el cuerpo gusano/anguila, propulsor coherente).
- **Pares simétricos** (apéndices bilaterales).
Son exactamente las formas que la app actual NO alcanza por mutación puntual y que tiene que **SEMBRAR a mano**
(proto-gusano, proto-garra, deuda D1). Aquí **emergen y se seleccionan** porque un operador estructural (recursión/
duplicación/simetría) produce la estructura coordinada YA coherente en una sola mutación.

### 3. Validez por construcción
**0 cuerpos inválidos en 160.000 desarrollos** (4 seeds × 40k). La garantía de 2.2 (todo genotipo → cuerpo válido)
se sostiene empíricamente.

## Caveats (honestidad)
- La directa NO fracasa por completo (llega a ~2.5): con 12 slots activables puede armar un propulsor multi-parte,
  pero le cuesta la COHERENCIA (alinear fases de slots independientes) → se queda ~1.8× por debajo. La generativa la
  obtiene "gratis" (duplicar/recursar copia la fase). La tesis no es "la directa no anda", sino "la generativa
  alcanza formas coordinadas que a la directa le cuestan" — coherente con que la app actual necesitara SEMBRARLAS.
- La generativa converge al mismo 4.511 porque el paisaje de este test es simple (hay un óptimo global claro). En la
  ecología real el paisaje es más rico y dinámico; esto valida **evolvabilidad + convergencia + cruce de valle** en
  aislamiento, no la complejidad emergente completa (eso es M5/M6).
- Morfología→locomoción aislada; la integración con el mundo (forma=función completa, autótrofo/heterótrofo) es M5.
- Las cadenas se topan en 8 = el límite de recursión configurado (acotado por diseño).

## Estado de los spikes de de-risking — COMPLETOS
- **M2 (coexistencia, R1)** ✅ GO · **M1 (coste, R2)** ✅ GO · **M3 (genoma, R3)** ✅ GO.

**Los TRES riesgos que podían tumbar el rediseño están retirados.** Ningún kill-criterion de 2.6 se dispara. Se
puede levantar la pila por capas con confianza razonable: **M4 (leyes del mundo) → M5 (cuerpo+render) → M6
(fisiología+conducta) → M7 (bucle) → M8 (cruce vs baseline)**.
