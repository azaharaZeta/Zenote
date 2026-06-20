# Fondo del abismo funcional → la luz que fluye (#1)

**Estado: IMPLEMENTADA (2026-06-20).**

## Petición y aclaración
Idea original: "Fondo del abismo funcional (corrientes que arrastren, gradientes térmicos, zonas de peligro/refugio)".
Al concretar, el usuario aclaró el objetivo real: *"el fondo es estático ahora, no? los organismos se agrupan siempre en
las mismas zonas. quiero que ese fondo vaya fluyendo"*. → No es arrastrar organismos ni térmico: es que el **paisaje de
recurso (el campo de luz) DERIVE y se reorganice con el tiempo**, para que no haya asentamiento permanente.

## Qué se implementó
El campo de luz (`world.light0`, hasta ahora horneado UNA vez al iniciar) ahora puede **fluir en el tiempo formando zonas
random no-direccionales** (2ª iteración a petición del usuario: "que no fluya linealmente en una dirección, sino que forme
zonas random, desde el inicio"):
- `world.js`: el campo = **suma de ~6 LÓBULOS** (ondas planas con frecuencia ENTERA —periódica en el toro—, dirección, fase
  y amplitud ALEATORIAS por semilla → zonas random distintas en cada mundo desde el inicio). `_buildLight` los sortea;
  `_fillLight(s)` rellena en el "tiempo de flujo" s; `stepLight(tick)` avanza `s = lightFlow·tick` (throttle `lightFlowEvery`).
- **No es traslación lineal:** la fase de cada lóbulo **VAGABUNDEA** = base + WA·(suma de osciladores lentos con freqs
  incommensurables) → las zonas se forman/disuelven y se mueven en direcciones variables, sin deriva neta. Llamado desde
  `sim.step` junto a `setDayNight`. **Determinista** (función de tick); s=0 (lightFlow=0) = estático byte-idéntico.
- Default **lightFlow=0.00012** (lento/contemplativo; la 1ª versión 0.0004 se bajó por petición). Slider 0..0.0008.
- `worker.js`: cuando `lightFlow>0` manda el `light0` actual al cliente (throttleado al fotograma); `main.js` re-hornea la
  nebulosa → se ve FLUIR. Palanca de UI viva **"Corriente del abismo"** (`lightFlow`, default 0.0004).
- **Sin tocar el cerebro:** los organismos persiguen el bloom vía su sensor de ∇luz que YA tenían. El efecto ecológico es
  que los cúmulos MIGRAN por recambio nacimiento/muerte siguiendo la luz, no por persecución frenética.

## Por qué la luz y no térmico/arrastre
- **Térmico DESCARTADO** (medido neutro en la 1ª app: sin orden espacial el eje térmico no se expresaba, `thermCorr≈0`).
  Ver [[simplificacion-ablacion-2026-06]].
- **Arrastrar organismos / zonas peligro-refugio**: alternativas válidas no hechas (el usuario quería que el FONDO fluyera,
  no una fuerza sobre los cuerpos). Posibles extensiones futuras.
- La clave: una mecánica de fondo solo aporta si crea **estructura espacial persistente y explotable**. La luz móvil la da
  (y reusa el sensor de ∇luz, conserva trivialmente — la luz es fuente abierta de energía).

## Medición (spikes/abyss-flow/probe.mjs, 25k, seed 800; campo de lóbulos)
- **Conserva en todos los flujos ✓**, rendimiento intacto (1220-1531 t/s; el throttle del re-horneado no penaliza).
- Población: 709 (estático) → 850-949 (fluyendo) — con el campo de lóbulos, FLUIR sube la pop (ilumina más área con el
  tiempo), no la baja. Default lightFlow=0.00012.
- Velocidad media casi no sube → el efecto es reorganización LENTA del paisaje (no carrera), justo "no asentarse siempre".
- Dorado re-fijado `0x0cf51b89`; gate 8/8 verde. Verificado en preview: campo heterogéneo (min 0.75 / max 2.5), la nebulosa
  se REORGANIZA (no traslada) entre capturas a ticks espaciados.

## Reabrir si
El usuario quiere flujo MÁS visible (subir el slider; a 0.0012=3× sigue estable) o las otras interpretaciones (corrientes
que arrastren cuerpos / zonas peligro-refugio).
