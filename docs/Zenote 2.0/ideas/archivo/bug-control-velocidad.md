# Bug — control de velocidad (t/s) desalineado — **(Zenote 2)** · RESUELTO 2026-06-19

> Idea de usuario (backlog): «velocidad no ajusta a control de velocidad; no es que se quede por debajo por rendimiento,
> a veces va por encima. A control velocidad mínima marca 0, pero el mundo sigue ejecutándose. Revisar que esté bien alineado.»

## Diagnóstico
Dos defectos, ambos en el bucle del motor `zenote2/src/engine/worker.js` (`loop()`):

```js
// ANTES
else { let n = Math.max(1, Math.round(tps / 30)); const t0 = performance.now(); while (n-- > 0 && performance.now() - t0 < 28) sim.step(); }
```

1. **Se pasa del valor (#1).** `Math.round(tps / 30)` cuantiza los pasos/loop a múltiplos de 30: tps=10→30, tps=20→30,
   tps=50→60… → el t/s real (que el HUD mide de `frame.tick`) salta por ENCIMA del slider.
2. **El mínimo no para (#2).** `Math.max(1, …)` fuerza ≥1 paso por loop → a tps=0 el mundo sigue corriendo a ~30 t/s
   (el loop itera ~30×/s). El slider en 0 debería PARAR.

## Fix
Sustituido por un **acumulador temporal**: cada loop ejecuta `tps × (tiempo transcurrido)` pasos, arrastrando la
fracción → el t/s real sigue al slider con fidelidad y `tps=0` ⇒ parado. Presupuesto de cómputo por frame intacto
(28 ms); si no se alcanza el ritmo se descartan ticks (sin spiral de deuda). `maxSpeed` y pausa sin cambios.

```js
// DESPUÉS (resumen)
acc += tps * (now - lastLoopT) / 1000;
while (acc >= 1) { if (performance.now() >= budgetEnd) { acc = 0; break; } sim.step(); acc -= 1; }
// running&&tps>0 ; else acc = 0  → pausado o tps=0 NO avanza
```

## Verificación (preview, midiendo `frame.tick`)
- tps=0 → **0 t/s** (mundo parado) ✓ · tps=10 → **10 t/s** exacto ✓ (antes ~30).
- tps altos (50/300) topan en ~40 t/s **en el preview** porque su tab en segundo plano throttlea `setTimeout` a ~15 Hz
  (medido) → tope = 15 loops/s × presupuesto/frame. Es el caso «por debajo por rendimiento» (que el usuario excluyó), no
  el bug; en foreground el loop corre a 30 Hz y los alcanza, y «max» da ritmo libre. Ver [[preview-simplehttp-caches-main-js]]
  (mismo entorno; aquí el problema es throttle de timers, no caché — `worker.js` sí se refresca).

Tests headless (gate 8/8) no tocan `worker.js` → sin cambios. Motor byte-idéntico.
