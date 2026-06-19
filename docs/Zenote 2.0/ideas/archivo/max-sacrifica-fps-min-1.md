# En velocidad "MAX", sacrificar fps hasta un mínimo de 1 fps — **(Zenote 2)** · IMPLEMENTADO 2026-06-19

> Idea de usuario: «asegurarse de que en velocidad "MAX", los fps se sacrifican si es necesario hasta un mínimo de 1 fps.»

## Problema
El bucle del motor (`worker.js`) en modo MÁX hacía `snapshot()` en CADA iteración (~30/s, o ~15/s con el tab throttled),
con solo 24 ms de simulación por iteración → el render (snapshot = construir typed arrays de todos los agentes + postear)
robaba una fracción grande del tiempo. La velocidad MÁX no priorizaba la simulación como debía.

## Fix
En MÁX, simular EN LOTE hasta que toque el próximo fotograma y snapshotear UNA vez por lote (no una por iteración):

```js
const MAX_SNAP_MS = 250;                       // ~4 fps en MÁX (≤1000 ⇒ ≥1 fps garantizado, el mínimo pedido)
if (running && maxSpeed) {
  const stepUntil = now + MAX_SNAP_MS;
  do { sim.step(); } while (performance.now() < stepUntil);
  snapshot(); setTimeout(loop, 0); return;     // un solo snapshot por lote; re-lanza ya
}
```

Se **sacrifican los fps** (de ~30 a ~4) para dar casi todo el tiempo a la simulación, y el lote de ≤250 ms **garantiza
≥1 fps** aun con la población al tope (250 ms ≤ 1000 ms). Modo normal/pausa sin cambios (snapshot por iteración a ~30 fps).

## Verificación (preview, worker en vivo)
Con MÁX activo: **fps 3.8** (suelo ≥1 ✓), **~23 ticks por fotograma** → el snapshot dejó de ser el cuello de botella
(antes uno por iteración). El t/s absoluto en el preview lo limita la lentitud del step en el navegador + el throttle de
timers del tab en segundo plano (ver [[preview-simplehttp-caches-main-js]]), no el fix; en foreground el lote corre casi
al 100% de duty. `worker.js` no lo importan los tests headless → gate 8/8 intacto.
