# Inspector al hacer clic en un organismo (#5)

**Estado: IMPLEMENTADA (2026-06-20).** Era "verificar/completar si ya existe parcialmente" → existía y se completó.

## Estado previo
Al tocar un organismo ya se abría una tarjeta con: oficio (autótrofo/heterótrofo/mixótrofo), barra de energía + texto
(energía/cría, tripa), masa, partes, v.máx, edad, foto/boca, y "seguir cámara". Click-para-seleccionar + Esc para cerrar.

## Qué se añadió para completarlo (UI/render puro → byte-idéntico, sin re-fijar dorado)
- **Desglose de DIETA real** (barra apilada + texto "dieta: luz X% · caza Y% · carroña Z%"): de dónde saca la energía ESTE
  organismo, acumulado en vida. Usa la instrumentación por-agente `photoIn/preyIn/scavIn` que ya añadí en #4 (el worker la
  manda en `detail`; main.js la pinta). Revela el OFICIO EMERGENTE real, que la etiqueta morfológica puede esconder — p.ej.
  un "heterótrofo" (tiene boca) que en realidad vive **98% de luz** (el hallazgo del inmovilismo, ahora visible de un clic).
- **Swatch de LINAJE** en la cabecera: círculo con el tono heredado (`hue`) → identificar familias de un vistazo.

Ficheros: `index.html` (#inspHue, #inspDiet, #inspDietTxt), `src/main.js` (updateInspector), `styles.css` (.insp-hue, .insp-diet),
`src/engine/worker.js` (detail += dietL/dietP/dietS). Verificado en preview (origen fresco): tarjeta completa, barra de dieta
y swatch correctos. "genoma" se considera cubierto por el resumen fenotípico (masa/partes/foto/boca/v.máx) + la dieta (función).

## Posible extensión (no hecha)
"Resaltar parientes" (mismo hue/linaje) del organismo inspeccionado — está en la lista de ideas propuestas; encaja con el swatch.
