# Cabeza nadadora — la cabeza ya NO es el motor

> Ficha de idea · **estado: HECHA** · 2026-06-10 · archivada (congelada).
> Índice: [../indice-ideas.md](../indice-ideas.md) · Mecánica final: `SPEC_EVOLUCION.md` §2bis (`loco.headThrust`).

## Problema (original)
El nodo raíz (cabeza) era un "motor base" (`gait=+1` + amplitud propia) → un organismo de 1 solo nodo nadaba bien.
Para la misión visual eso es malo: si una cabeza pelada ya nada, **hay poca presión para evolucionar colas/aletas**
(añaden empuje pero cuestan arrastre/masa) → el mundo se dominaba de cabezas simples, no de morfologías variadas.

## Lo hecho
`loco.headThrust = 0.15` → la cabeza propulsa débil (es carga, no motor); `kThrust` recalibrado a 7.1 (un nadador
con cola ≈ v1, cabeza sola ~0.47). Sembrado "renacuajo" (cabeza + cola propulsora) para no colapsar al arrancar.
Slider "Empuje de la cabeza" para tunear la presión (1 = régimen previo). Verificado numéricamente: cabeza sola
0.47 ≪ cabeza+cola 1.0 → la cola RINDE. Más realista (un blob liso no se propulsa en fluido — concha de vieira).

## Observación pendiente (ver bandeja de entrada en el índice)
En la observación posterior se vio que **algunos cazadores "cabeza nadadora con garras enormes"** se mueven bien
sin desarrollar apenas propulsores. A revisar si el empuje base de la cabeza o el coste de las garras necesitan ajuste.
