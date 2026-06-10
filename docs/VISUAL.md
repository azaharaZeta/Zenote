# Guía visual — "Primordia"

El objetivo emocional es **fascinación contemplativa**. Debe apetecer mirarlo
moverse durante minutos, como un acuario o una lámpara de lava. La belleza viene
del movimiento orgánico y de los patrones que emergen, no de adornos pesados.

## Principios
- **Calma y oscuridad.** Fondo oscuro (casi negro azulado o tinta) para que los
  organismos brillen. Estética de microscopio / fondo abisal / placa de Petri.
- **Color = información.** El tono (hue) es un rasgo **adaptativo**: los organismos
  evolucionan para sintonizar con el "color de la luz" de su región (mejor absorción;
  camuflaje en Fase 2). Ver los organismos **igualar el color de su zona** ES ver
  adaptación local emerger. El fondo dibuja ese campo de luz (regiones de color),
  para que se lea la sintonía. (El linaje/ascendencia ya no se ve por color: se consulta
  por `lineageId` en el inspector.) No usar color decorativo que compita con esa lectura.
- **Movimiento orgánico.** Interpolar posiciones; evitar saltos. Estela/halo suave
  opcional. Tamaño del círculo = gen de tamaño. Brillo/opacidad ∝ energía (los
  hambrientos se atenúan: la muerte se *ve* venir).
  *Ojo con el toro:* un agente que cruza un borde envuelto NO debe interpolarse entre
  los dos lados (daría un latigazo de lado a lado). Detectar el salto > medio mundo y, ese
  frame, dibujarlo sin interpolar.
- **El suelo = sustrato abisal (Cenote).** Único escenario. El fondo es una **nebulosa casi negra**
  sobre-muestreada: tinte sutil por **temperatura** del mundo (frío = azul casi negro; cálido =
  azul-violeta apagado), con moteado orgánico por ruido periódico (tesela sin costura en el toro).
  Es world-space (panea/zoomea con la cámara) y se ve a qué clima se adapta cada organismo (gen
  `temp_pref`), pero por contraste suave, no por colores chillones.
- **El recurso como fosforescencia.** El campo de recurso se dibuja, sobre el sustrato, como una
  **fosforescencia tenue teal/algas** (verde-azul desaturado, DISTINTA del cian brillante de los
  bichos) que se lee por contraste contra la oscuridad. Encima, motas de **micro-flora/plancton**
  luminoso (`render.grassDensity` posiciones fijas con sprites de chispa precalculados) que brillan
  donde hay comida, con densidad **por cantidad** (zona rica = casi todas encienden; claro pastado =
  casi ninguna). Se dibuja en un **búfer del tamaño de la pantalla con la cámara aplicada** (nítido
  a cualquier zoom), re-renderizado solo al mover la cámara o cambiar el recurso (cada
  `render.grassRefreshFrames`), con culling → más zoom = más barato.
- **Sin ruido visual.** Nada de bordes duros, sombras pesadas, ni UI recargada.
  Tipografía fina, controles discretos en un panel lateral semitransparente que
  se pueda ocultar para modo "solo contemplación".

## Paleta sugerida (ajustable)
- Fondo: `#0a0e14` → degradado a `#0d1320`.
- Recurso: verdes/teal muy desaturados y translúcidos sobre el fondo.
- Organismos: tono libre por `hue`, saturación media-alta, luminosidad según energía.
- Texto UI: gris claro `#c7d0dd`; acentos en un cian suave `#5ad1c4`.

## Render
- **Cuerpo dibujado desde el grafo de nodos** (modelo v2.0): el render NO usa categorías
  de pieza; recorre los nodos del genoma (`render/canvas.js`, `_drawBodyGraph`) y dibuja cada
  uno como lóbulo o tentáculo según su `aspect`, con su orientación (`angle`), su par bilateral
  emergente, ojos, señuelo bioluminiscente y una onda viajera de undulación acumulada padre→hijo.
  Es la **misma geometría que usa la física** (`bodyplan.js`) → lo que ves coincide con cómo nada.
  Detalle por LOD (los bichos lejanos/diminutos se simplifican). El color por partes, glow,
  saturación y textura de piel salen de los genes decorativos (`c_*`, `o_*`, `tex2`).
- Canvas 2D. Glow barato vía `shadowBlur` moderado o dibujando un segundo círculo
  más grande y translúcido (más rápido que blur real). Medir FPS antes de abusar.
- Estelas: dibujar el fondo con una capa negra a baja opacidad cada frame en vez de
  borrarlo del todo → rastros suaves. Hacerlo opcional (puede reducir claridad).
- Transiciones suaves al nacer (fade-in + pequeño "pop" de escala) y al morir
  (fade-out). Esto da el carácter de "vida".

> **Gráficas sin dependencias.** Los histogramas y curvas se dibujan a mano en un
> Canvas 2D aparte (barras y polilíneas básicas). No se añade ninguna librería de
> gráficas: el coste de implementarlas es bajo y mantenemos el proyecto en vanilla JS
> desplegable como estáticos (ver CLAUDE.md, regla 5).

## Responsive y móvil (sin tocar la simulación)
**Principio rector:** el mundo es lógico y fijo (`world.width`×`world.height`, toro);
la pantalla solo lo *muestra*. El motor nunca ve píxeles de pantalla. Toda la
adaptación ocurre en la capa de render/UI. Esto garantiza que ver en móvil **no
altera ni limita** la genética, la energética ni la dinámica de población: una misma
`pop.seed` produce idéntica corrida en un portátil y en un teléfono.

- **Escalado, no recorte.** El canvas ocupa el viewport con `width:100%` por CSS, pero
  su resolución de dibujo se fija en píxeles del dispositivo. Se calcula un factor
  `scale = min(canvasPx_w / world.width, canvasPx_h / world.height)` y se aplica con
  `ctx.setTransform` (o `translate`+`scale`) para encajar el mundo completo con letterbox
  (barras vacías) si la relación de aspecto difiere. Nunca se estira de forma anisotrópica
  ni se cambia `world.width/height` para "rellenar". El toro se sigue viendo entero.
- **DevicePixelRatio con tope.** Resolución del canvas = `cssPx * min(devicePixelRatio,
  render.dprCap)`. El tope (p.ej. 2) evita que una pantalla retina de móvil dispare el
  número de píxeles a dibujar y hunda los FPS. Reaccionar a `resize` y a cambios de
  orientación recalculando tamaño y `scale` (con debounce).
- **Coordenadas de entrada → mundo.** El tap/clic llega en píxeles de pantalla; se
  invierte la transformación (`scale`, letterbox, DPR) para obtener la coord. lógica y
  buscar el organismo. Mismo código para ratón y dedo (`pointerdown`).
- **LOD por RADIO EN PANTALLA (3 niveles).** El coste de dibujar un bicho se escala con su tamaño en píxeles
  (`rPx`), no con el zoom directamente: **punto plano** (`rPx < lodBody`) → **cuerpo barato** (elipse de volumen
  orientada, 1 gradiente; `lodBody ≤ rPx < lodFull`) → **grafo de nodos completo** (`rPx ≥ lodFull`), y DENTRO
  del grafo los detalles caros entran por umbral propio (ojos `lodEye`, onda+contorno `lodWave`, señuelo `lodLure`).
  Así al alejar (miles de bichos diminutos) casi todo son puntos baratos, y al acercar emergen forma → ojos →
  onda → señuelo con gracia. El **halo por agente** (un gradiente/bicho) solo se pinta por encima de `lodHalo` y
  en calidad alta; los puntos ya brillan por el **bloom global** de la capa de organismos. Umbrales en `config.render`.
- **Calidad alta/baja.** Baja (móvil/equipos lentos): sin bloom (blur), **sin halos por agente**, sin nieve marina,
  menos chispas de plancton, y todos los umbrales LOD ×`lodLowMult` (≈×2.6 → muchos más puntos). Render medido:
  worst-case ~2 ms/frame en alta con 4000 agentes a la vista; baja ≈ la mitad.
- **Rendimiento es calidad de *render*, no de simulación.** En equipos lentos se bajan
  efectos visuales (glow, estelas, mostrar campo de recurso) y se puede reducir
  `sim.targetTPS` —que solo cambia la *velocidad* a la que vemos avanzar el tiempo,
  no el resultado—. **No se baja `pop.maxAgents` automáticamente**, porque eso sí cambiaría
  el ecosistema; si el usuario quiere ese ajuste, que sea un control consciente y avisado.
  Detección barata por defecto: si el viewport es estrecho (`< 700px`) o los FPS caen,
  arrancar con `glow:false` (o calidad Baja).
- **Toques de UI.** Áreas táctiles cómodas (mín. ~40px), panel lateral que en pantallas
  estrechas pasa a hoja inferior (bottom sheet) deslizable u oculta tras un botón. El
  modo contemplación (ocultar toda la UI) es aún más valioso en móvil. Evitar depender
  del hover: todo accesible por tap.
- **Sin scroll/zoom accidental.** `touch-action: none` sobre el canvas y `viewport`
  meta con `user-scalable=no` para que arrastrar no haga scroll de la página.

## Datos visibles (panel de observación, ocultable)
- Curva de población total (y por dieta si hay carnívoros).
- Histograma en vivo de 1–2 genes seleccionables (size, speed, diet...). Ver el
  histograma deslizarse es la prueba visual de la selección.
- Contador de "especies" = clústeres por **distancia genética sobre genes funcionales**
  (ecología + forma de nodos; excluye color y cerebro). Modo de render "colorear por especie".
- Reloj de generaciones / tiempo de simulación y FPS.

## Interacción mínima pero deliciosa
- Play / pausa. Slider de velocidad de simulación en **ticks por segundo** (`sim.targetTPS`,
  desacoplado de los fps).
- Sliders de `mut_rate`, `mut_sigma`, `R_regen` para "jugar a ser el ambiente" y
  ver cómo responde la evolución en directo.
- **Cámara con zoom y paneo toroidal:** rueda (o pinza en móvil) para zoom, arrastrar para
  desplazarse. El mundo es un toro y se renderiza **en mosaico**, así el paneo recorre el
  ecosistema sin fin y **nunca se ven los bordes** (el sustrato y el moteado se envuelven con
  ruido periódico → teselan sin costura). Zoom mínimo = el mundo cubre la pantalla (sin letterbox);
  doble clic resetea el zoom. El render es solo lectura: la simulación no cambia con la cámara.
- Click/tap en un organismo (sin arrastrar): muestra su genoma (barras), linaje y generación.
- **Modos de coloreado** (solo render, no tocan la simulación) para *analizar* la evolución:
  *Visión real* (pigmento adaptado a la luz), *Dieta* (verde herbívoro → rojo carnívoro),
  *Linaje* (un color por familia fundadora), *Gen del histograma* (gradiente del rasgo
  elegido) y *Energía*. En los modos analíticos el fondo pasa a gris para que destaquen.
  Una leyenda explica el código de color activo.
- Botón "sembrar de nuevo" (reiniciar con población aleatoria y semilla opcional
  para reproducibilidad).
- Modo contemplación (oculta toda la UI con una tecla).

## No hacer
- No animaciones de "logro", ni gamificación, ni puntuaciones.
- No emojis ni iconos ruidosos.
- No sacrificar FPS por efectos: la fluidez es parte de la belleza.
