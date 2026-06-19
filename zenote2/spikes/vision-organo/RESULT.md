# SPIKE visión-órgano — RESULTADO

**Pregunta:** ¿la visión como ÓRGANO (tejido SENSOR, alcance ∝ área) (a) cruza el valle de fitness y (b) se diferencia
por nicho? **Diseño mínimo:** el ojo cuesta solo su MASA; el sensado de presa/amenaza se gatea por `senseRange`; luz
innata; degradación suave. Análisis: [`../../../docs/ideas/vision-organo-zenote2.md`](../../../docs/ideas/vision-organo-zenote2.md).

Reproducir: `node zenote2/spikes/vision-organo/run.mjs 30000 1,2,3 free,organ-seeded,organ-blind`

## Medido (30k ticks · seeds 1,2,3 · mundo 1500 · 800 fundadores)

| modo | pop | het% | con ojo | áreaOjo (auto) | áreaOjo (het) | het/auto | alcance | t/s | ΔmateriaM |
|---|---|---|---|---|---|---|---|---|---|
| `free` (baseline, sensado gratis) | 460 | 41% | **38%** | 7.63 | 8.09 | 1.1× | 40 | 2181 | −0.003% |
| `organ-seeded` (nace con ojo) | 563 | 50% | 76% | 14.78 | 12.80 | **0.9×** | 57 | 1778 | −0.001% |
| `organ-blind` (nace ciego) | 736 | 37% | **34%** | 7.88 | 7.38 | 0.9× | 37 | 1607 | −0.001% |

## Veredicto: **NULL parcial — el ojo es selectivamente NEUTRO con este diseño** ✗ (no shippear tal cual)

1. **NO hay diferenciación por nicho** (el test discriminante): los autótrofos cargan **tanto ojo como** los cazadores
   (het/auto = 0.9× — incluso *menos* en heterótrofos). La predicción "autótrofos ciegos / cazadores de vista aguda"
   **NO emerge**.
2. **El ojo "aparece" pero por DERIVA, no por selección.** Clave: en `free` el ojo es **inútil** (gate ∞) y aun así el
   **38%** lo tiene → ése es el nivel de **deriva**. `organ-blind` da **34%** ≈ el mismo nivel → el ojo **no está
   positivamente seleccionado**, solo deriva. (El "cruza el valle ✓" del runner es un falso positivo del umbral naíf:
   hay que leerlo contra la deriva del baseline.)
3. **Causa raíz:** el tejido SENSOR cuesta **solo masa**, igual que ESTRUCTURA → es **funcionalmente intercambiable con
   "lastre"** → no hay presión para que el autótrofo lo suelte (ahorra masa ínfima) ni para que el cazador invierta más
   que la deriva. La visión no desbloquea estructura emergente nueva; replica las mismas conductas que el sensado gratis,
   solo que más cara y ruidosa.

**Controles sanos:** no degrada la red trófica (het 41%→50%), perf OK (1607 t/s peor), **materia conservada** (|ΔM|
≤0.003% — el ojo es masa y conserva, invariante intacto). La mecánica funciona; lo que falla es el **payoff evolutivo**.

## Conclusión accionable — **re-motiva M6.4 (coste/ruido del sensado)**
La visión-órgano solo será interesante (diferenciación por nicho) si **ver cuesta de verdad**: un **coste metabólico
explícito por alcance** (energía/tick ∝ `senseRange`), no solo la masa del ojo. Eso es exactamente **M6.4**, que se
difirió "por payoff nulo en abstracto" — este spike muestra que **con un órgano el coste de M6.4 sí tendría un
trade-off real** (ver lejos ↔ pagar energía ↔ poder estar ciego). 

**Recomendación:** **NO** shippear la visión-órgano con el diseño mínimo (sería complejidad sin payoff, como M6.1/M6.4).
El siguiente paso natural —añadir un coste de sensado explícito— se PROBÓ ↓.

## Variante con COSTE DE SENSADO (M6.4) — MEDIDO (`run-cost.mjs`, organ-seeded, 30k · 3 seeds)
Se añadió un coste metabólico `senseCost·(senseRange − mínimo_innato)` (energía/tick → calor) y se barrió `senseCost`.
Reproducir: `node zenote2/spikes/vision-organo/run-cost.mjs 30000 1,2,3 0,0.0001,0.0003,0.0008`

| senseCost | pop | het% | áreaOjo (auto) | áreaOjo (het) | het/auto | con ojo (auto/het) |
|---|---|---|---|---|---|---|
| 0 (sin coste) | 563 | 50% | 14.78 | 12.80 | 0.9× | 80% / 71% |
| 0.0001 | 573 | 44% | 7.05 | 5.25 | **0.7×** | 62% / 50% |
| 0.0003 | 899 | 35% | 0.86 | 0.90 | 1.1× | 13% / 17% |
| 0.0008 | 555 | 18% | 0.67 | 1.01 | 1.5× | 14% / 8% |

**Tampoco diferencia por nicho — y revela la causa más profunda.** Al subir el coste, **el ojo colapsa para TODOS**
(auto 14.8→0.67, het 12.8→1.0), no solo para los autótrofos. El ratio het/auto nunca despega con ecosistema sano (a
0.0008 da 1.5× pero sobre ojos casi nulos y con la heterotrofía hundida al 18% por el estrés metabólico). A coste bajo
(0.0001) los autótrofos incluso conservan **más** ojo que los cazadores (0.7×).

**Causa raíz (la lección de verdad):** en una **pecera pequeña y densa** (mundo 1500, pop ~500–1000), la presa/amenaza
suele estar **dentro del alcance innato barato** (~16 u); la vista de **largo alcance tiene poco valor marginal para
NADIE** —tampoco para el cazador— porque casi nunca hay nada lejos que valga la pena ver más temprano. No existe un
régimen donde "ver lejos" rinda lo bastante para crear un nicho sensorial. El coste, entonces, no diferencia: solo
universaliza la ceguera (todos caen al mínimo innato y la caza sigue, a corta distancia).

## Veredicto final — **NO viable en la pecera contemplativa** (parar; revisar solo a macro-escala)
Ni con coste-solo-masa (neutro → deriva) ni con coste de sensado explícito (→ ceguera universal) emerge la
diferenciación cazador↔autótrofo. El bloqueo **no es de implementación ni de gradiente de coste, sino de ESCALA/ECOLOGÍA**:
la visión de alcance es la solución a un problema —encontrar presa **dispersa y lejana**— que esta pecera densa no tiene.
La idea solo cobraría sentido en un **mundo grande y disperso** (donde localizar presa lejana es el cuello de botella) →
ámbito del **futuro proyecto nativo/GPU**, no de la pecera web. La percepción se queda **abstracta** (es la decisión
correcta para este alcance). Perf sana en todo el barrido (1850 t/s peor), materia conservada (|ΔM|≤0.004%).
