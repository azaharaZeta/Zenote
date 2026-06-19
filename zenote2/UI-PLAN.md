# Zenote 2 — análisis de UI y plan de mejoras

Estado de partida: la UI de zenote 2 es mínima (canvas + HUD + leyenda; vista fija centrada; **sin interacción**).
La app actual (`../src/` + `../index.html` + `../styles.css` + `ui/`) tiene la UI completa; aquí se **adaptan los
patrones** (no se copia código vivo) al motor-en-worker de zenote 2.

## Huecos (lo que la app actual tiene y zenote 2 NO)

| Área | Actual (v1) | zenote 2 (v2) | Prioridad |
|---|---|---|---|
| **Cámara** | zoom + paneo + **visión toroidal infinita** (mosaico sin costuras) | vista fija centrada, sin paneo, sin toro | **P1** |
| **Velocidad** | pausa/play · slider t/s · máx | tick rate fijo (~30) en el worker | **P1** |
| **Zoom** | slider + rueda + pinza | ninguno (ventana fija ~620u) | **P1** |
| **Reinicio** | botón ↻ + semilla | ninguno (recarga la página) | **P1** |
| **Panel/menú** | aside ocultable + modo contemplación | HUD fijo | **P1** |
| **Gráficas** | población por gremio · biomasa/pools · demografía | ninguna | **P2** |
| **Filtros/color** | colorear por tejido/rol/linaje/gen · histograma · leyenda | solo por tejido (fijo) | **P2** |
| **Laboratorio** | sliders de parámetros EN VIVO + marca ↻ | params son consts del motor | **P3** |
| **Inspector** | click → genoma/stats · seguir cámara · navegar especies | ninguno | **P4** |
| **Perf/calidad** | calidad · resolución · FPS cap · caché sprites | DPR fijo | **P4** |
| **Intro / responsive / táctil** | portada + móvil | nada | **P4** |

## Plan (incremental, verificable en navegador)

- **P1 — Núcleo + cámara toroidal** ✅ HECHO (verificado en navegador): panel ocultable · velocidad de sim (pausa +
  slider t/s + máx, → worker) · **límite de FPS de render** (slider 5-120, def 20; throttle del rAF en el cliente, no
  toca la sim) · zoom (slider + rueda con zoom-al-cursor) · paneo (arrastrar, envuelve mod size) · **visión toroidal
  infinita** (render en mosaico de tiles visibles, sin costura) · reinicio (→ worker reseed) · HUD (fps · t/s · pop ·
  tick). Worker: tps variable + pausa + reset + burst.
- **P2 — Observación** ✅ HECHO (verificado): gráfica de población apilada autótrofo/heterótrofo (el worker envía
  `histPop/histAuto/histHet`, ventana de 160 muestras) · modos de color (tejido / oficio trófico / linaje) +
  leyenda dinámica. Gen de linaje `hue` heredable (deriva lenta en mutación, heredado en clon/recombinación);
  `arole` per-agente en la foto.
- **P3 — Laboratorio** ✅ HECHO (verificado end-to-end): sliders EN VIVO de luz solar (`world.lightMul`, mult. sobre
  el campo horneado) · metabolismo basal · umbral de cría · eficiencia de fotosíntesis (campos de `SIM_P`, leídos
  por referencia cada tick → efecto instantáneo) + botón restaurar. Mensaje `{set,key,value}` al worker; el reset
  re-aplica el lab (el mundo nuevo nace con `lightMul=1`). Probado: luz 0.2×→extinción, 0.6×→remanente, 1.0×→pleno;
  metabolismo 3.3×→colapso por deuda metabólica. (Tamaño de mundo: estructural, pendiente, marcaría ↻.)
- **P4 — Inspección + extras** (PARCIAL):
  - ✅ **Inspector** (verificado): clic/toque en un organismo → tarjeta flotante con detalle EN VIVO (oficio trófico,
    barra de energía E/cría, masa, nº de partes, v.máx, edad, foto/boca) + anillo de selección en el lienzo +
    "seguir cámara" + cerrar (✕ / Esc). El worker manda `aid` (serial) por agente en la foto y un `detail` del
    seleccionado cada frame; el cliente reenvía `inspect` hasta que el worker confirma (`frame.sel`) → autosana
    mensajes perdidos y detecta la muerte ("† murió"). Probado: selección 3/3, stats en vivo, muerte, seguimiento.
  - ✅ **Responsive/táctil** (verificado a 375px): controles táctiles (pointer events + `touch-action:none`); zoom por
    slider en móvil; media query ≤460px → panel a lo ancho (acotado a 62vh) + inspector abarcando el fondo, sin
    solapar. El mundo lógico/sim NO cambia con el tamaño (regla 3 CLAUDE.md): la adaptación vive solo en UI.
  - ⬜ **Pendiente**: pellizco (pinch) para zoom · controles de calidad/resolución/FPS · histograma de un rasgo ·
    portada/intro · navegar entre especies/linajes.

## Notas de arquitectura (motor en worker)
- La interacción de CÁMARA es 100% del hilo de render (no toca el motor) → fluida e independiente de la sim.
- Los controles que tocan la sim (velocidad, reset, params del lab, filtros que necesitan datos nuevos) van por
  **mensaje al worker**; el worker responde ajustando o reenviando la foto.
- La **visión toroidal** se dibuja teselando: para cada tile visible (tx,ty) se dibuja la escena desplazada
  `tx·size, ty·size`, con culling. El paneo envuelve la cámara mod size. (Patrón de `canvas.js` v1.)
