# Por qué la resolución no cambia los FPS — RESUELTA (no es bug)

> Ficha de idea · **estado: RESUELTA** (investigación) · 2026-06-17 · archivada (congelada).
> Índice: [../indice-ideas.md](../indice-ideas.md) · Detalle medido: memoria `render-perf-resolution-bound`.

**Pregunta:** el slider de resolución (`render.maxInternalPx`) no parece mover los FPS.

**Respuesta (medido en navegador, cronometrando `renderer.draw()` síncrono a varias resoluciones):** es CORRECTO por diseño,
por tres razones en orden de peso:
1. **El FPS lo fijan dos comportamientos, no el coste de pintar:** el dibujado es BAJO DEMANDA (redibuja solo al cambiar
   tick/cámara/selección) y está CAPADO a `render.maxFPS` (def 20); con el worker a `targetTPS` 20 → ~20 dibujos/s. La
   resolución cambia el COSTE por frame, no el RECUENTO (que es lo que muestra el readout).
2. **Holgura enorme:** `draw()` ≈ 2-5 ms medido vs 50 ms de presupuesto (a 20 fps) → cualquier resolución cabe. El FPS solo
   bajaría si un draw superara ~50 ms (equipo muy débil / 4K / muchísimos agentes).
3. **A resoluciones de escritorio (backing ≤ ~4 Mpx) el render ni siquiera es pixel-bound:** coste PLANO (~2-5 ms) de
   0.14→4.1 Mpx, en calidad alta Y ultra → domina la CONSTRUCCIÓN por-agente (vectores/gradientes), independiente de los
   píxeles. El pixel-bound solo aparece a 4K (medición previa en la memoria).

**Conclusión:** el slider hace su trabajo real (NITIDEZ del backing; rescatar 4K / equipos lentos), pero por diseño no toca
el readout de FPS a tamaños normales. NO se tocó código. (Caveat: el preview topaba a 1280×800 → 4K no testeable aquí; el
régimen pixel-bound se apoya en la medición previa.) Posible mejora menor: aclararlo en el tooltip del slider.
