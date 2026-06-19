# Ojos en los heterótrofos/cazadores (render) — **(Zenote 2)** · IMPLEMENTADO 2026-06-19

> Idea de usuario: meter OJOS, aunque sean solo estéticos. Si no es viable en el modelo evolutivo, en la capa visual.
> Que aparezcan en los heterótrofos y sean más notables/agresivos cuanto más "cazador" sea el animal.

**Decisión:** capa VISUAL pura (la visión como ÓRGANO de la sim se descartó por escala — [[vision-organo-neutra-sin-coste]]).
Los ojos son una LECTURA del rol depredador, no tocan la simulación (motor byte-idéntico, gate 8/8).

## Implementación
- **`worker.js`**: nuevo `aHunt` por agente = "lo cazador que es" ∈ [0,1] = `mouthCap·3 / (mouthCap·3 + photoCap)` →
  0 autótrofo .. ~1 cazador puro. (Float32 transferible en la foto, como `aE`.)
- **`main.js drawOrgs`**: tras dibujar el cuerpo (solo pasada de núcleo), si `aHunt>0.2` y el cuerpo es grande en pantalla
  (LOD `bodyR>6`px), dibuja **dos ojos** al FRENTE (along rumbo), simétricos: esclera + pupila oscura adelantada. Escala con
  lo cazador: más grandes, **esclera ámbar→roja** (`hsl 40°→8°`) y **pupila más adelantada** (mirada) cuanto mayor `aHunt`.
  `bodyR` se acumula en el bucle de nodos. Coste: 2 arcos (escleras) + 2 (pupilas) por cazador visible grande → barato
  (heterótrofos son minoría + LOD). Van en la capa de organismos → el bloom les da glow.

## Refinamiento (feedback: salían "de repente" y "pegote")
- **Aparición GRADUAL** (sin pop): el tamaño Y la opacidad de los ojos se interpolan por dos rampas — tamaño-en-pantalla
  (`amt` sube con `bodyR` de 4→18 px) y lo cazador (`aHunt` 0.12→0.67). Nada de umbral binario.
- **Más pequeños** (menos pegote): radio máx ≈ 0.12·`bodyR` (antes 0.23) y ×`amt`.
- **Variedad por linaje**: tamaño, separación y distancia frontal varían con un hash de `hue` (cada familia tiene su cara).
- **Color del ojo = TONO del color del organismo** (`hsl(hue,…)`, no un ámbar/rojo fijo): la esclera es una versión clara/
  viva del pigmento del bicho, más saturada cuanto más cazador → armoniza con la criatura y da variedad sola (cada familia, su color de ojo).
- **Posición pegada al frente**: el avance (`fwd`) se basa en el ALCANCE FRONTAL real (`frontExt` = máx. proyección de los
  nodos sobre el rumbo), no en la extensión máxima `bodyR` → en bichos elongados (cola) los ojos NO flotan por delante.
  La separación entre ojos es ∝ tamaño del ojo (no `bodyR`) → nunca quedan anchos/sueltos.
- **Borde del ojo**: trazo oscuro fino (reusa el `strokeStyle` del borde del cuerpo, `lineWidth ∝ er` y restaurado a 1.2) → define el ojo contra el cuerpo.
- **Bug "gafas" (resuelto)**: dibujar las DOS escleras con dos `arc()` en el MISMO path y luego `stroke()` hacía que Canvas
  uniera los círculos con una recta (puente de gafas 🤓). Fix: cada ojo (y cada pupila) en su propio `beginPath()`.
- **Mirada hacia el rumbo**: la pupila se desplaza en la dirección del heading → "mira hacia donde va" (= hacia la presa/
  pareja/luz que persigue, porque el cerebro orienta el cuerpo al objetivo). Gaze por objetivo real exigiría enviar el
  vector de presa desde el motor (posible, no hecho — el rumbo es buen proxy y gratis).

## Verificado (preview)
Ojos rendean en heterótrofos/cazadores y los autótrofos NO; tras el refinamiento son puntitos pequeños que emergen suave
al acercar (no pop). Sin errores. Render puro → la sim no cambia.
