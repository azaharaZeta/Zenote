# ¿Bug? Organismo estático que escupe descendencia anómala que se aleja y muere — **(Zenote 2)** · NO ES BUG (descartado) 2026-06-19

> Idea de usuario: «en la emulación, más de una vez he visto un organismo estático, que cada cierto tiempo produce una
> descendencia totalmente distinta, que se aleja rápido y muere enseguida. Revisar si esto es síntoma de algún error en el modelo.»

## Veredicto: comportamiento EMERGENTE esperado, no un defecto
Es **mutación + selección purificadora** alrededor de un pico de fitness, hecho visible a escala de individuo:
- El "organismo estático" es un **autótrofo sésil** (plántula PHOTO: vmax=0, sin músculo) bien adaptado y longevo.
- Cada reproducción asexual = `mutate(padre)`. Las **tasas de mutación estructural son altas a propósito** (favorecen
  exploración y cruce de valles morfológicos): por nacimiento ~10% añadir módulo + 8% duplicar + 5% borrar, y por módulo
  8% de cambio de tejido que puede **cruzar de categoría** (PHOTO→MUSCLE), 6% toggle recursión, 6% toggle simetría (`genome.js:123-139`).
- Por eso de vez en cuando ("cada cierto tiempo") sale una cría **muy distinta**: gana músculo (→ se mueve, empujada por
  el seedBrain que ya cablea ir-hacia-luz/presa) y/o pierde fotosíntesis (→ sin ingreso). Paga coste de nado + metabolismo
  con menos energía → **muere pronto** (sobre todo por inanición). La selección la purga: es variación siendo descartada.

## Evidencia medida — `spikes/static-anomalous-offspring/probe.mjs`
Sobre 20 000 crías de UNA mutación del MISMO padre sésil (plántula PHOTO, rol=autótrofo, vmax=0, photoCap=35.5):
- cambió nº de módulos (estructural): **20.7%** · perdió ≥50% fotosíntesis: **8.3%** · cambió de oficio: **2.6%**
- ganó movilidad (vmax>0.5): **0.8%** · "totalmente distinta" (dist>1, >2× el umbral de especie): **4.3%**
- distancia fenotípica media padre↔cría: 0.28 (la mayoría son crías PARECIDAS; la cola larga son las anómalas)

Run real (5000 ticks): edad media de los VIVOS — **móviles (vmax>0.5): 1402 (n=14)** vs **sésiles: 3113 (n=910)**.
Los móviles son raros y la mitad de viejos → no persisten. Muertes: inanición **1365** vs depredación **613**
(domina el hambre, consistente con crías mal adaptadas). Materia/energía se conservan al morir (invariantes, gate 8/8).

## ¿Palanca opcional (no es fix)?
Si se quisiera MENOS de esta "purga visible" (más gradualismo), se bajarían las tasas de mutación estructural —sobre todo
el cambio de tejido que cruza categoría (8%) y añadir/duplicar/borrar módulo—. Pero eso reduce la exploración y el cruce
de valles, que los spikes mostraron **load-bearing** para que emerja la morfología compleja. Es un **trade-off de diseño**
para el usuario, no una corrección de correctitud. Relacionado: auditoría biológica (tasas "órdenes de magnitud sobre lo
biológico", gradualidad bajo fuerte presión mutacional) → [[zenote2-biological-audit]].
