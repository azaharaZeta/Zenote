# Control de velocidad: pausa/MAX apagan la barra — **(Zenote 2)** · IMPLEMENTADO 2026-06-19

> Idea de usuario: al pulsar pausa o MAX, "apagar" la barra de velocidad; al volver a pulsar la barra, fijar la velocidad
> donde se pulse y desmarcar pausa y MAX.

`main.js`: estado `running`/`maxOn` + `syncSpeedUI()` que atenúa (`.dim`, opacidad en `styles.css`) el slider `#tps` cuando
`!running || maxOn`. El `input` del slider fija la velocidad, **reanuda** (running=true) y **desmarca MAX** (maxOn=false) →
"tocar la barra = quiero esta velocidad ya, en modo normal". Pausa y MAX son toggles independientes que atenúan la barra.
Render/UI puro (los mensajes running/tps/maxSpeed al worker no cambian).
