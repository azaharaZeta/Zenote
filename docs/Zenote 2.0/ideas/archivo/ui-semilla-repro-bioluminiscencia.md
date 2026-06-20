# Tanda UI: semilla, reproducción, bioluminiscencia — **(Zenote 2)** · IMPLEMENTADO 2026-06-19

> 3 ideas de usuario de UI (render puro, sin tocar el motor → gate intacto):

- **Quitar Semilla + 🎲 de la UI; siempre aleatorio.** Se quitó el input `#seed` y el botón `#seedRandom` del panel
  "Mundo nuevo". `resetWorld()` manda `seed: null` siempre → el worker elige semilla aleatoria en cada inicio y reinicio.
  (El motor sigue siendo determinista dado un seed; simplemente la UI ya no lo fija.) Verificado: dos resets → seeds distintas.

- **Reproducción: desplegable → dos checkboxes (sexual / asexual).** `#reproSex` + `#reproAsex` → `SIM_P.reproMode`:
  ambos = `both` (sexual si hay pareja + respaldo asexual) · solo asexual = `asexual` · solo sexual = `sexual` (obligada).
  No se permite dejar los DOS apagados (revierte el último cambiado). Sincronizados desde `SIM_P.reproMode` al cargar.

- **Quitar "Bioluminiscencia" de la UI (solo de la UI).** Se quitó el slider `#bloom`; el EFECTO se mantiene
  (`bloomStrength` queda fijo en `RENDER_P.bloom`=0.75; el bloom/aura sigue renderizándose). Si se quiere reactivar el
  control, basta re-añadir el slider y su handler.

Verificado en vivo: controles fuera, mapeo de reproducción correcto, bloom sigue brillando, sin errores. main.js/index.html.
