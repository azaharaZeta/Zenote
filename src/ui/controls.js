// UI: controles en vivo (sliders que afectan la simulación), inspector de genoma,
// reseed, modo contemplación. Pensado para ratón y táctil (pointer events).

import { GENES, GENE_LABELS, G, NUM_GENES, GENE_GROUPS, DECOR, NODE_COUNT } from '../engine/genome.js';
import { turboCss } from '../util/color.js';

export function setupControls(app) {
  const { sim, renderer, charts, cfg, worker } = app;
  const $ = (id) => document.getElementById(id);
  const send = (msg) => worker.postMessage(msg); // comandos al motor (worker)

  // ---- Play / pausa ----
  const playBtn = $('play');
  // Centraliza el cambio de estado (botón + worker + atenuado del slider de velocidad): lo usan el botón y la
  // auto-pausa por extinción (app.pause, invocada desde main.js al caer la población a 0).
  const setRunning = (run) => {
    app.running = run;
    playBtn.textContent = run ? '❚❚' : '▶';
    playBtn.title = run ? 'Pausar (Espacio)' : 'Reanudar (Espacio)';
    send({ type: 'running', value: run });
    refreshSpeedState();
  };
  playBtn.addEventListener('click', () => setRunning(!app.running));
  app.pause = () => { if (app.running) setRunning(false); };   // auto-pausa (extinción): solo actúa si está corriendo

  // ---- Botón "Máx velocidad" (ignora el slider; simula tanto como quepa por frame) ----
  const maxBtn = $('maxBtn');
  if (maxBtn) maxBtn.addEventListener('click', () => {
    app.maxSpeed = !app.maxSpeed;
    maxBtn.classList.toggle('active', app.maxSpeed); // el caption se queda en "max"
    send({ type: 'maxSpeed', value: app.maxSpeed });
    refreshSpeedState();
  });

  // ---- Estado "desactivado" del slider de velocidad (atenuado en pausa o máx velocidad) ----
  function refreshSpeedState() {
    const tEl = $('ticks'), valEl = $('ticksVal'), row = tEl && tEl.closest('.speed-row');
    if (!tEl) return;
    const off = !app.running || app.maxSpeed;
    // NO se deshabilita el slider: aunque esté en pausa/máx, pincharlo debe "despertarlo" (salir de
    // esos estados y adoptar la velocidad pulsada, ver applyTPS). Solo se atenúa visualmente.
    if (row) row.classList.toggle('speed-off', off); // no se deshabilita: pincharlo despierta la velocidad (applyTPS)
    if (!app.running)      valEl.textContent = 'en pausa';
    else if (app.maxSpeed) valEl.textContent = 'al máximo';
    else                   valEl.textContent = `${posToTps(+tEl.value)} t/s`;
  }

  // ---- Velocidad en ticks/segundo (desacoplada de los fps): mapeo logarítmico del slider (1..1000) → 1..480 t/s. ----
  const TPS_MIN = 1, TPS_MAX = 480, POSN = 1000, LR = Math.log(TPS_MAX / TPS_MIN);
  const posToTps = (pos) => pos <= 0 ? 0 : Math.round(TPS_MIN * Math.exp(LR * (pos - 1) / (POSN - 1)));
  const tpsToPos = (tps) => tps <= 0 ? 0 : Math.round(1 + (POSN - 1) * Math.log(tps / TPS_MIN) / LR);
  const ticksEl = $('ticks'), ticksValEl = $('ticksVal');
  const applyTPS = () => {
    // Arrastrar el slider despierta la velocidad: sale de máx/pausa y adopta la posición pulsada.
    if (app.maxSpeed) {
      app.maxSpeed = false;
      if (maxBtn) maxBtn.classList.remove('active');
      send({ type: 'maxSpeed', value: false });
    }
    if (!app.running) {
      app.running = true;
      playBtn.textContent = '❚❚';
      playBtn.title = 'Pausar (Espacio)';
      send({ type: 'running', value: true });
    }
    const v = posToTps(+ticksEl.value);
    ticksValEl.textContent = v === 0 ? 'pausa' : `${v} t/s`;
    send({ type: 'tps', value: v });
    refreshSpeedState();
  };
  ticksEl.value = tpsToPos(cfg.sim.targetTPS); // posición inicial coherente con el arranque (20 t/s)
  ticksEl.addEventListener('input', applyTPS);
  applyTPS();
  refreshSpeedState(); // refleja pausa/máx en el slider desde el inicio

  // ---- LABORATORIO: todos los parámetros ajustables por categorías (data-driven). Cada control envía {type:'set'} al worker. ----
  setupLab(app, send);

  // ---- Selector de gen para el histograma ----
  const sel = $('geneSel');
  // Genes solo de apariencia (su histograma refleja deriva, no evolución útil): DECOR + color de linaje.
  const COSMETIC = new Set([...DECOR, G.hue]);
  const HIDE_GROUPS = new Set(['Color y ornamento', 'Nodos (cuerpo)']); // grupos fuera del histograma
  // Cantidad derivada (no un gen): VELOCIDAD realizada del organismo (|v|/vMax ∈[0,1]). Índice negativo (centinela) → el worker la binea.
  const HIST_VEL = -2;
  { const og = document.createElement('optgroup'); og.label = 'Movimiento';
    const o = document.createElement('option'); o.value = HIST_VEL; o.textContent = 'Velocidad';
    if (charts.histGene === HIST_VEL) o.selected = true;
    og.appendChild(o); sel.appendChild(og); }
  GENE_GROUPS.forEach((grp) => {            // agrupado en <optgroup> → desplegable navegable, no infinito
    if (HIDE_GROUPS.has(grp.label)) return; // grupos no deseados en el filtro de histograma
    const og = document.createElement('optgroup');
    og.label = grp.label;
    grp.genes.forEach((name) => {
      const i = G[name];
      if (COSMETIC.has(i)) return;          // fuera lo SOLO cosmético → el histograma muestra solo genes con peso evolutivo
      const o = document.createElement('option');
      o.value = i; o.textContent = GENE_LABELS[name] || name;
      if (i === charts.histGene) o.selected = true;
      og.appendChild(o);
    });
    if (og.children.length) sel.appendChild(og); // no añadir grupos que queden vacíos tras el filtro
  });
  renderer.geneIndex = charts.histGene;
  send({ type: 'gene', index: charts.histGene }); // el worker calcula histograma/geneSel de ese gen
  sel.addEventListener('change', () => {
    const gi = +sel.value;
    charts.setGene(gi);
    renderer.geneIndex = gi; // el modo de color 'gene' usa el mismo gen
    send({ type: 'gene', index: gi });
    updateLegend();
  });

  // ---- Modo de coloreado (solo render: reinterpreta el color para analizar) ----
  const colorSel = $('colorMode');
  const legendEl = $('legend');
  const bar = (grad) => `<div class="legend-bar" style="background:linear-gradient(90deg,${grad})"></div>`;
  // Genera la barra muestreando la MISMA fórmula de tono que usa el render (recorre la rueda de tono),
  // para que la leyenda coincida exactamente con los colores reales (no una interpolación RGB de 2 paradas).
  const ramp = (hueOf, sat, lig, n = 7) => { const a = []; for (let i = 0; i < n; i++) { const u = i / (n - 1); a.push(`hsl(${hueOf(u)},${sat}%,${lig}%)`); } return a.join(','); };
  const updateLegend = () => {
    if (!legendEl) return;
    const m = renderer.colorMode;
    if (m === 'diet') legendEl.innerHTML = bar(ramp(u => (1 - u) * 120, 85, 52)) + '<span>herbívoro</span><span>carnívoro</span>';            // h=(1-diet)*120
    else if (m === 'role') {
      // OFICIOS: la banda se PONDERA por los totales actuales de cada oficio (ancho ∝ nº de individuos) → mini-gráfica
      // de composición trófica viva, además de clave de color. Conteos = último muestreo de las series del worker
      // (charts.hist*). main.js la refresca cada frame mientras el modo sea 'role'. Mismos colores que el render y la curva.
      const last = (a) => (a && a.length) ? (a[a.length - 1] | 0) : 0;
      const segs = [
        { c: 'hsl(128,62%,50%)', n: last(charts.histH),    label: 'herbívoro' },
        { c: 'hsl(42,87%,55%)',  n: last(charts.histO),    label: 'omnívoro'  },
        { c: 'hsl(30,55%,50%)',  n: last(charts.histScav), label: 'carroñero' },
        { c: 'hsl(5,82%,56%)',   n: last(charts.histC),    label: 'cazador'   },
      ];
      const total = segs.reduce((acc, s) => acc + s.n, 0);
      let grad;
      if (total > 0) {                                  // segmentos de ancho ∝ su fracción de la población
        let acc = 0; const stops = [];
        for (const s of segs) { if (s.n <= 0) continue; const a0 = acc / total * 100; acc += s.n; stops.push(`${s.c} ${a0.toFixed(2)}% ${(acc / total * 100).toFixed(2)}%`); }
        grad = stops.join(',');
      } else grad = 'hsl(128,62%,50%) 0 25%,hsl(42,87%,55%) 25% 50%,hsl(30,55%,50%) 50% 75%,hsl(5,82%,56%) 75%'; // sin población → bloques iguales
      // Etiquetas coloreadas con su conteo (no 4 spans flex:1, que ya no se alinearían con la banda ponderada).
      const labels = segs.map((s) => `<span style="color:${s.c}">${s.label} ${s.n}</span>`).join(' · ');
      legendEl.innerHTML = bar(grad) + `<em>${labels}</em>`;
    }
    else if (m === 'gene') { const gl = renderer.geneIndex < 0 ? 'Velocidad' : (GENE_LABELS[GENES[renderer.geneIndex]] || GENES[renderer.geneIndex]); const tg = Array.from({ length: 9 }, (_, i) => turboCss(i / 8)).join(','); legendEl.innerHTML = bar(tg) + `<span>${gl}: bajo</span><span>alto</span>`; } // rampa TURBO (bajo→alto), igual que el histograma
    else if (m === 'energy') legendEl.innerHTML = bar(ramp(u => u * 130, 85, 50)) + '<span>hambriento</span><span>lleno</span>';                 // h=ef*130
    else if (m === 'lineage') legendEl.innerHTML = '<em>un color por linaje fundador (familias / proto-especies)</em>';
    else if (m === 'species') legendEl.innerHTML = '<em>un color por ESPECIE (clúster genético; se cruzan entre sí)</em>';
    else legendEl.innerHTML = '<em>tono = pigmento adaptado a la luz local · brillo = energía</em>';
  };
  if (colorSel) colorSel.addEventListener('change', () => { renderer.colorMode = colorSel.value; updateLegend(); if (app.requestDraw) app.requestDraw(); });
  updateLegend();
  app.refreshLegend = updateLegend;   // main.js la llama cada frame en modo 'role' → la banda ponderada por totales vive

  // ---- Reseed (expuesto en app.reseed) + aviso "pendiente reiniciar" ----
  // Los parámetros marcados ↻ (reseed/reseedOnChange) YA NO resiembran solos: al tocarlos se enciende un aviso rojo
  // junto al botón de modo. El cambio se aplica cuando el usuario pulsa Reiniciar (o el propio aviso, que es un atajo).
  const reseedPendingEl = $('reseedPending');
  app.markReseedPending = () => { if (reseedPendingEl) reseedPendingEl.classList.add('show'); };   // lo invoca setupLab al tocar un ↻
  app.reseed = () => {
    const si = $('seedInput');                       // campo semilla oculto de momento → si no existe/vacío, semilla aleatoria
    const raw = si ? si.value.trim() : '';
    const seed = raw === '' ? null : (Number.isFinite(+raw) ? +raw : hashStr(raw));
    if (app._flushPending) app._flushPending();   // aplica los cambios ↻ PENDIENTES (world.size, maxAgentsCeiling, matterBudget…) al worker+config ANTES de resembrar (no en caliente)
    send({ type: 'reset', seed });   // el motor (worker) re-siembra y reenvía el mundo
    charts.clear();
    renderer.resize();
    if (reseedPendingEl) reseedPendingEl.classList.remove('show');   // ya aplicado → apaga el aviso
  };
  $('reseed').addEventListener('click', app.reseed);
  if (reseedPendingEl) reseedPendingEl.addEventListener('click', () => app.reseed());   // pulsar el aviso reinicia (atajo)

  // ---- Calidad gráfica (Baja/Alta/Máxima): baja = sin bloom/nieve, LOD agresivo (móvil). Autodetecta; el botón la fuerza. ----
  const qualityBtn = $('qualityBtn');
  if (qualityBtn) {
    const LS_Q = 'zenote.quality';
    const QLABEL = { low: 'Baja', high: 'Alta', ultra: 'Máxima' };
    const QNEXT = { low: 'high', high: 'ultra', ultra: 'low' }; // el botón cicla baja → alta → máxima → baja
    let q; try { q = localStorage.getItem(LS_Q); } catch (e) {}
    if (q !== 'high' && q !== 'low' && q !== 'ultra') {  // sin preferencia → autodetectar (nunca MÁXIMA: es opt-in)
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      q = (coarse || window.innerWidth < 820) ? 'low' : 'high';
    }
    const applyQuality = (val) => {
      cfg.render.quality = val;
      qualityBtn.textContent = 'Calidad: ' + (QLABEL[val] || 'Alta');
      renderer.resize();                      // recalcula DPR (baja/alta/máxima) y fuerza refresco del fondo (borra el buffer)
      try { charts.resize(); } catch (e) {}
      if (app.requestDraw) app.requestDraw();  // repintar tras el resize (en pausa, si no, quedaría en negro)
    };
    applyQuality(q);
    qualityBtn.addEventListener('click', () => {
      const val = QNEXT[cfg.render.quality] || 'high';
      try { localStorage.setItem(LS_Q, val); } catch (e) {}
      applyQuality(val); qualityBtn.blur();
    });
  }

  // ---- Resolución interna (render): slider junto al botón de Calidad (solo en modo laboratorio, ver CSS .res-ctrl).
  // TECHO del backing store (px del borde largo); el CSS reescala a la pantalla. Cambia la NITIDEZ, no el detalle
  // (el LOD va por tamaño percibido). Se aplica EN VIVO vía renderer.resize(). No se persiste (default = config). ----
  const resSlider = $('resSlider'), resVal = $('resVal');
  if (resSlider) {
    resSlider.value = cfg.render.maxInternalPx;                 // valor inicial desde config
    const syncRes = () => { if (resVal) resVal.textContent = resSlider.value; };
    syncRes();
    resSlider.addEventListener('input', () => {
      const v = +resSlider.value;
      cfg.render.maxInternalPx = v;                              // config del hilo principal (lo lee el render)
      send({ type: 'set', key: 'render.maxInternalPx', value: v }); // espejo en el worker (consistencia)
      syncRes();
      renderer.resize();                                         // aplica el nuevo tope en vivo (redimensiona el buffer → lo BORRA)
      if (app.requestDraw) app.requestDraw();                    // repintar tras el resize (en pausa, si no, quedaría en negro)
    });
  }

  // ---- Límite de FPS del render (solo laboratorio, junto a Resolución). Render-only: frame() (main.js) lee
  // config.render.maxFPS en vivo cada frame (no toca el worker ni hace resize). Combinado con el dibujado bajo
  // demanda, evita malgastar GPU/CPU redibujando frames idénticos. ----
  const fpsCapSlider = $('fpsCapSlider'), fpsCapVal = $('fpsCapVal');
  if (fpsCapSlider) {
    fpsCapSlider.value = cfg.render.maxFPS;
    const syncFps = () => { if (fpsCapVal) fpsCapVal.textContent = fpsCapSlider.value; };
    syncFps();
    fpsCapSlider.addEventListener('input', () => { cfg.render.maxFPS = +fpsCapSlider.value; syncFps(); });
  }

  // Caché de sprites (modo rendimiento, opt-in): toggle del laboratorio. El detalle/LOD lo deciden otros controles;
  // esto solo cambia CÓMO se dibuja el cuerpo de los bichos pequeños (sprite cacheado vs reconstrucción vectorial).
  const spriteCacheChk = $('spriteCacheChk');
  if (spriteCacheChk) {
    spriteCacheChk.checked = !!cfg.render.spriteCache;
    spriteCacheChk.addEventListener('change', () => { cfg.render.spriteCache = spriteCacheChk.checked; if (app.requestDraw) app.requestDraw(); });
  }

  // ---- Modo contemplación (oculta toda la UI) ----
  // El control de velocidad sigue accesible: reubicamos el nodo #speedBlock a una barra flotante
  // (#floatControls) mientras el panel está oculto, y lo devolvemos a su sitio al reabrirlo. Los
  // listeners viajan con el nodo, así que no duplicamos ni la lógica ni el estado (play/slider/max).
  const panel = $('panel');
  const hideBtn = $('hide');
  const showBtn = $('show');
  const speedBlock = $('speedBlock');
  const floatHost = $('floatControls');
  const speedHome = speedBlock.parentNode;        // dónde vive en el panel
  const speedAnchor = speedBlock.nextSibling;     // para reinsertarlo en su posición exacta
  const setHidden = (h) => {
    panel.classList.toggle('hidden', h);
    showBtn.classList.toggle('visible', h);
    if (h) {
      floatHost.appendChild(speedBlock);
      floatHost.classList.add('visible');
    } else {
      speedHome.insertBefore(speedBlock, speedAnchor);
      floatHost.classList.remove('visible');
    }
  };
  hideBtn.addEventListener('click', () => setHidden(true));
  showBtn.addEventListener('click', () => setHidden(false));

  // ---- Móvil: deslizar la HOJA hacia ABAJO la oculta (gesto típico de bottom-sheet), además del botón "contemplar".
  //      Usa eventos TOUCH (no pointer): con `preventDefault()` en `touchmove` no-pasivo el navegador NO hace scroll
  //      ni CANCELA el gesto (con pointer events disparaba pointercancel → snap-back instantáneo). Arranca desde el
  //      "asa" o cualquier zona NO interactiva; respeta sliders/botones y el scroll del lab (solo con scrollTop 0). ----
  {
    let startY = 0, dragY = 0, dragging = false;
    const onMobile = () => window.matchMedia('(max-width: 700px)').matches;
    const isCtrl = (t) => t && t.closest && t.closest('input, button, select, textarea, a, .lab-slider');
    panel.addEventListener('touchstart', (e) => {
      if (!onMobile() || e.touches.length !== 1) return;
      if (isCtrl(e.target) || panel.scrollTop > 0) return;        // no robar controles ni el scroll del lab
      dragging = true; startY = e.touches[0].clientY; dragY = 0;
      panel.style.transition = 'none';                            // seguir el dedo sin lag
    }, { passive: true });
    panel.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      dragY = e.touches[0].clientY - startY;
      if (dragY <= 0) { dragY = 0; panel.style.transform = ''; return; } // hacia arriba → deja scrollear (no preventDefault)
      e.preventDefault();                                          // CLAVE: corta el scroll → el navegador no cancela el gesto
      panel.style.transform = `translateY(${dragY}px)`;            // la hoja sigue al dedo
    }, { passive: false });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      panel.style.transition = '';                                // restaura la transición del CSS (0.3s)
      if (dragY > 90) setHidden(true);                            // bajó lo suficiente → ocultar (= "contemplar ✕")
      panel.style.transform = '';                                 // quita el inline → anima a 0 (o, si .hidden, a translateY(100%))
      dragY = 0;
    };
    panel.addEventListener('touchend', endDrag);
    panel.addEventListener('touchcancel', endDrag);
  }

  // ---- Móvil: REABRIR el menú arrastrando hacia ARRIBA la barra de velocidad (su estado colapsado). Igual que el
  //      gesto de cerrar, se engancha a TODA la barra (no al asa de 4px, imposible de acertar con el dedo); el asa
  //      es solo la pista visual. Respeta el slider y los botones. Mismo umbral; "tirón" elástico de feedback. ----
  {
    let sY = 0, up = 0, drg = false;
    const isCtrl = (t) => t && t.closest && t.closest('input, button, select, textarea, a');
    floatHost.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || isCtrl(e.target)) return;  // no robar el slider/botones de la barra
      drg = true; sY = e.touches[0].clientY; up = 0;
      floatHost.style.transition = 'none';
    }, { passive: true });
    floatHost.addEventListener('touchmove', (e) => {
      if (!drg) return;
      up = sY - e.touches[0].clientY;                          // arriba = positivo
      if (up <= 0) { up = 0; floatHost.style.transform = ''; return; }
      e.preventDefault();
      const lift = Math.min(up * 0.4, 16);                     // tirón elástico (tope 16px) → feedback al arrastrar
      floatHost.style.transform = `translateX(-50%) translateY(${-lift}px)`;
    }, { passive: false });
    const endUp = () => {
      if (!drg) return;
      drg = false;
      floatHost.style.transition = '';                         // restaura la transición → la barra vuelve a su sitio
      floatHost.style.transform = '';                          // (al rest: CSS translateX(-50%))
      if (up > 90) setHidden(false);                           // tiró bastante hacia arriba → reabrir el menú (= botón ☰)
      up = 0;
    };
    floatHost.addEventListener('touchend', endUp);
    floatHost.addEventListener('touchcancel', endUp);
  }
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return; // no robar teclas a los campos
    if (e.key === 'h' || e.key === 'H') setHidden(!panel.classList.contains('hidden'));
    if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
  });

  // ---- Barra de zoom clásica (sincronizada con rueda/pinza/doble-clic) ----
  const zoomEl = $('zoomSlider'), zoomValEl = $('zoomVal');
  // En MÓVIL arranca con algo de zoom (≈1.8×, hacia el centro del mundo) → se ven los bichos al ENTRAR, no
  // diminutos y de lejos. Solo es el valor INICIAL (el usuario lo cambia con la barra/pinza); escritorio → 1× (mundo entero).
  if (window.innerWidth <= 700 && renderer.zoom === 1) renderer.zoom = 1.8;
  const syncZoom = () => {
    if (!zoomEl) return;
    zoomEl.value = renderer.zoom;
    zoomValEl.textContent = renderer.zoom.toFixed(1) + '×';
  };
  if (zoomEl) {
    zoomEl.max = renderer.maxZoom;          // que el tope de la barra siga al del render
    zoomEl.addEventListener('input', () => {
      renderer.zoom = +zoomEl.value;        // zoom hacia el centro de la cámara
      zoomValEl.textContent = renderer.zoom.toFixed(1) + '×';
    });
    syncZoom();
  }

  // ---- Cámara: arrastrar = panear (toro infinito), rueda/pinza = zoom, tap = inspeccionar ----
  const cv = renderer.canvas;
  const pointers = new Map();
  let dragMoved = false, lastX = 0, lastY = 0, pinchDist = 0;
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved = false;
    if (pointers.size === 1) { lastX = e.clientX; lastY = e.clientY; }
    else if (pointers.size === 2) {
      const p = [...pointers.values()];
      pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) { dragMoved = true; app.followSel = false; } // panear suelta la cámara
      renderer.panByScreen(dx, dy);
      lastX = e.clientX; lastY = e.clientY;
    } else if (pointers.size === 2) {
      const p = [...pointers.values()];
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinchDist > 0) { renderer.zoomAt(d / pinchDist, (p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2); syncZoom(); }
      pinchDist = d; dragMoved = true;
    }
  });
  // Suelta un puntero (pointerup/cancel) dejando el estado coherente. CLAVE: al pasar de pinza (2 dedos) a 1, re-ancla
  // lastX/lastY al dedo que QUEDA → el próximo pointermove parte de delta 0. Sin esto, dx se calculaba contra un lastX
  // viejo (en modo 2-dedos no se actualiza) → la cámara pegaba un SALTO al levantar un dedo. (Índice → Mejoras de UI (b).)
  const releasePointer = (id) => {
    pointers.delete(id);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 1) { const p = pointers.values().next().value; lastX = p.x; lastY = p.y; }
  };
  const endPointer = (e) => {
    if (pointers.size === 1 && !dragMoved) { // tap limpio → inspeccionar (lo resuelve el worker)
      const p = renderer.screenToWorld(e.clientX, e.clientY);
      send({ type: 'pick', wx: p.x, wy: p.y });
      app.followSel = true; app._selSeen = false;             // la cámara seguirá al seleccionado (espera al pick)
      if (renderer.zoom < 7) { renderer.zoomAt(7 / renderer.zoom, e.clientX, e.clientY); syncZoom(); } // acercar
    }
    releasePointer(e.pointerId);
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', (e) => releasePointer(e.pointerId)); // mismo re-anclaje → soltar por cancel tampoco salta
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    // zoom más ágil: factor mayor (0.003→0.0075) y delta acotado a ±80 para que un ratón de "saltos" grandes
    // no pegue un zoom desbocado (el trackpad, de delta pequeño, queda proporcional y suave).
    const dz = Math.max(-80, Math.min(80, e.deltaY));
    renderer.zoomAt(Math.exp(-dz * 0.0075), e.clientX, e.clientY);
    syncZoom();
  }, { passive: false });
  cv.addEventListener('dblclick', () => { renderer.zoom = 1; syncZoom(); app.followSel = false; }); // doble clic = reset zoom + soltar cámara

  // Navegación por ESPECIES en el inspector (◀ ▶): delegación (el panel se reconstruye al cambiar).
  const inspBox = $('inspector');
  if (inspBox) inspBox.addEventListener('click', (e) => {
    if (e.target.closest('.insp-close')) {                 // CERRAR la vista de especie → deseleccionar
      send({ type: 'deselect' }); app.followSel = false; app._selSeen = false;
      app.sim.sel = null; inspBox.classList.remove('visible'); // cierre INMEDIATO (no espera al frame del worker)
      return;
    }
    const btn = e.target.closest('.spnav');
    if (!btn) return;
    send({ type: 'pickSpecies', dir: +btn.dataset.dir }); // el worker selecciona el ejemplar típico de la especie ±1
    app.followSel = true; app._selSeen = false;            // la cámara vuela al nuevo espécimen
    if (renderer.zoom < 7) { renderer.zoom = 7; syncZoom(); }
  });
}

// ---- LABORATORIO: genera la ventana modal de parámetros desde una especificación por categorías. ----
// Fuente única de verdad: lee los valores iniciales de la config (defaults de config.js) y, al mover un
// control, envía {type:'set', key, value} al worker. Reseed = el cambio solo cuaja al volver a Sembrar.
const LAB_SPEC = [
  // La pecera de materia cerrada es el ÚNICO escenario: la materia total es constante y circula
  // (N↔pasto↔organismos↔carroña). El modelo abierto y sus parámetros se han eliminado. Sin marca `mode` ni gating: todo lo de aquí aplica.
  { cat: '🌍 Mundo y población', items: [
    { k: 'world.size', label: 'Tamaño del mundo', reseed: true, min: 400, max: 3000, step: 100, dec: 0, d: 'Lado del mundo cuadrado (u). GRANDE = disperso → menos depredación, MÁS especies (aislamiento); pequeño = denso → más depredadores, menos especies. No cambia el alimento total (rejilla y materia fijos), solo la densidad. Requiere Reiniciar.' },
    { k: 'world.matterBudget', label: 'Materia total (presupuesto)', reseed: true, scales: true, min: 10000, max: 80000, step: 2500, dec: 0, d: 'Materia total del mundo (pecera): más alta = más biomasa. ESCALA con el área del mundo. Requiere Reiniciar.' },
    { k: 'pop.initial', label: 'Sembrado inicial', reseed: true, min: 20, max: 1000, step: 20, dec: 0, d: 'Nº de organismos fundadores. FIJO: NO escala con el tamaño del mundo. Se siembran en un círculo CENTRAL a densidad fija (colonizan hacia fuera). En la pecera la materia limita la población sostenida → sembrar de más solo provoca un reajuste inicial. Requiere Reiniciar.' },
    { k: 'pop.startDiversity', label: 'Diversidad inicial', reseed: true, min: 0, max: 1, step: 0.05, dec: 2, d: 'Variedad genética de los fundadores: 0 = casi clónicos (renacuajos simples idénticos) … 1 = variados (formas y colores dispares). La diversidad real emerge luego por mutación. Requiere Reiniciar.' },
    { k: 'pop.maxAgentsCeiling', label: 'Tope de población', reseed: true, min: 500, max: 8000, step: 250, dec: 0, d: 'Tope duro de población (memoria/rendimiento); NO escala con el tamaño del mundo. El punto real lo pone la comida/materia, por debajo. Requiere Reiniciar.' },
    { k: 'pop.carnivoreSeedFrac', label: 'Siembra de carnívoros', reseed: true, min: 0, max: 0.5, step: 0.02, dec: 2, d: 'Fracción de fundadores sembrados como proto-carnívoros (para arrancar el nicho). Requiere Reiniciar.' },
  ]},
  { cat: '🍃 Comida y vegetación', items: [
    // Fotosíntesis (pecera): regulador PRINCIPAL de la comida del mundo (pecera permanente → siempre activo). Antes vivía en la sección "Pecera sellada", ya retirada.
    { k: 'world.closedRegen', label: 'Fotosíntesis (pecera)', min: 0.0006, max: 0.006, step: 0.0001, dec: 4, d: 'Ritmo de fotosíntesis en la pecera: regulador principal de la comida del mundo (más alto = más organismos y depredadores).' },
    { k: 'resource.grazeRefuge', label: 'Reserva de rebrote', min: 0, max: 0.8, step: 0.01, dec: 2, d: 'Fracción de cada celda que no se puede pastar (queda como semilla): frena el sobrepastoreo.' },
    { k: 'resource.forageReach', label: 'Alcance de forrajeo (talla)', min: 0, max: 8, step: 1, dec: 0, d: 'Cuántas celdas alrededor pasta un cuerpo grande: da ventaja a la talla (hace emerger el grupo grande). 0 = solo su celda.' },
    { k: 'resource.absRate', label: 'Ritmo de absorción', min: 0, max: 0.4, step: 0.005, dec: 3, d: 'Velocidad a la que un organismo absorbe el recurso de su celda (alto = comen rápido, pero la arrasan).' },
    { k: 'resource.energyPerUnit', label: 'Energía por unidad', min: 5, max: 24, step: 1, dec: 0, d: 'Energía que da cada unidad de recurso comido (sube la rentabilidad de pastar).' },
    { k: 'resource.patchiness', label: 'Comida en parches', min: 0, max: 1, step: 0.05, dec: 2, d: '0 = pasto uniforme; subir = parches que se agotan y migran solos (premia buscar).' },
    // Ingreso de pasto por FORMA del cuerpo (efficiencia de pastoreo): vive aquí (con la comida), no en metabolismo.
    { k: 'energy.k_graze', label: 'Pasto extra por masa', min: 0, max: 2, step: 0.05, dec: 2, d: 'Cuánto más pasta un cuerpo con más masa (ata la complejidad al nicho herbívoro).' },
    { k: 'energy.k_grazeWide', label: 'Pasto extra por anchura', min: 0, max: 2, step: 0.05, dec: 2, d: 'Cuánto más pasta un cuerpo ANCHO: premia la forma de pastador (aletas/hojas anchas).' },
  ]},
  { cat: '💀 Carroña', items: [
    { k: 'resource.carrionDecay', label: 'Descomposición de cadáveres', min: 0, max: 0.02, step: 0.001, dec: 3, d: 'Ritmo al que se pudre la carroña: bajo = los cadáveres duran más para el carroñero.' },
    { k: 'resource.carrionAbsRate', label: 'Ritmo de carroñeo', min: 0, max: 0.5, step: 0.05, dec: 2, d: 'Velocidad a la que un carroñero vacía un cadáver.' },
    { k: 'energy.k_scavThin', label: 'Carroñeo por cuerpo fino', min: 0, max: 2, step: 0.05, dec: 2, d: 'Cuánto mejor carroñea un cuerpo FINO/elongado: empuja a los carroñeros a forma de gusano.' },
  ]},
  { cat: '⚡ Metabolismo y cuerpo', items: [
    { k: 'energy.c_base', label: 'Coste basal', min: 0, max: 0.06, step: 0.002, dec: 3, d: 'Gasto metabólico de existir, por tick. Más alto = la vida es más cara y la población baja.' },
    { k: 'energy.k_metab', label: 'Coste por metabolismo', min: 0, max: 2, step: 0.05, dec: 2, d: 'Cuánto encarece el gen de metabolismo el coste basal (metabolismo alto = come y gasta más).' },
    { k: 'energy.k_sense', label: 'Coste por visión', min: 0, max: 1, step: 0.02, dec: 2, d: 'Coste energético de ver lejos: presiona a invertir en vista solo si compensa.' },
    { k: 'energy.kleiber', label: 'Metabolismo de escala', min: 0.5, max: 1, step: 0.02, dec: 2, d: 'Cómo escala el coste con la masa (Kleiber): 0.75 = los grandes gastan menos por unidad de masa.' },
    { k: 'energy.massExp', label: 'Escala talla→masa', min: 1, max: 2.2, step: 0.05, dec: 2, d: 'Cuánto pesa ser grande (exponente alométrico): alto = la masa y sus costes se disparan con la talla.' },
    { k: 'expr.size.min', label: 'Talla mínima (px)', reseed: true, min: 1, max: 5, step: 0.1, dec: 1, d: 'Radio MÍNIMO al que puede encoger un organismo. SUBIRLA pone un SUELO a la talla → frena la deriva a cuerpos diminutos que a largo plazo saturan el pool y extinguen al cazador (clave para que el trío aguante). Afecta a la energía (talla→masa→eMax). Define el RANGO de talla posible (no redimensiona a los organismos vivos): requiere Reiniciar.' },
    { k: 'expr.size.max', label: 'Talla máxima (px)', reseed: true, min: 6, max: 14, step: 0.5, dec: 1, d: 'Radio MÁXIMO que puede alcanzar un organismo grande: amplía o limita el techo de tamaño. Define el RANGO de talla posible (no redimensiona a los organismos vivos): requiere Reiniciar.' },
    { k: 'energy.E_max_base', label: 'Energía máxima base', min: 40, max: 150, step: 5, dec: 0, d: 'Energía máxima que almacena un organismo (escala con su tamaño): más reserva ante hambrunas.' },
  ]},
  { cat: '🏊 Locomoción y visión', items: [
    { k: 'loco.kThrust', label: 'Empuje base', min: 0.5, max: 12, step: 0.1, dec: 1, d: 'Calibra la velocidad típica de la morfología: más alto = todos nadan más rápido.' },
    { k: 'loco.headThrust', label: 'Empuje de la cabeza', min: 0, max: 1, step: 0.02, dec: 2, d: 'Cuánto propulsa la cabeza sola: bajo = nadar bien exige cola/aletas (cuerpos más variados). El default es muy bajo a propósito (la cabeza es casi carga, no motor).' },
    { k: 'loco.vMax', label: 'Velocidad máxima', min: 1, max: 6, step: 0.1, dec: 1, d: 'Techo de seguridad de la velocidad de cualquier cuerpo.' },
    { k: 'loco.turnBase', label: 'Agilidad de giro', min: 0.02, max: 0.5, step: 0.01, dec: 2, d: 'Agilidad de giro base: más alto = giran más rápido hacia donde quieren ir.' },
    { k: 'loco.angInertia', label: 'Inercia de giro', min: 0, max: 2, step: 0.1, dec: 1, d: 'Momento angular del giro (∝ masa sobre el medio): alto = los cuerpos grandes tardan en empezar/parar de girar y sobregiran (giro físico, con momento); 0 = giro casi instantáneo (modelo previo). El techo de agilidad lo sigue dando «Agilidad de giro».' },
    { k: 'loco.phaseGain', label: 'Coordinación de marcha', min: 0, max: 1, step: 0.05, dec: 2, d: 'Cuánto penaliza nadar descoordinado: alto = presiona a una natación coordinada (onda limpia).' },
    { k: 'loco.dragLin', label: 'Arrastre del agua', min: 0.2, max: 3, step: 0.1, dec: 1, d: 'Densidad/viscosidad del agua: fija la INERCIA. Alto = el agua frena enseguida → arranques y paradas secos. Bajo = planean (tardan en acelerar y en frenar, se deslizan). Vía masa: los cuerpos grandes tienen más inercia.' },
    { k: 'loco.speedSizeExp', label: 'Velocidad por talla (zancada)', min: 0, max: 1.5, step: 0.05, dec: 2, d: 'Cuánto AVANZA más por el mundo el cuerpo grande (zancada mayor): el grande recorre más por golpe; el pequeño es rápido en su escala pero se desplaza poco. 0 = la velocidad-mundo no depende de la talla (modelo previo).' },
    // Costes de NADO (antes en "Energía"): viven con la locomoción que encarecen.
    { k: 'energy.k_effort', label: 'Coste por esfuerzo', min: 0, max: 3, step: 0.05, dec: 2, d: 'Coste extra de nadar a tope: limita la velocidad por presupuesto energético.' },
    { k: 'energy.moveCost', label: 'Coste de nado (v²)', min: 0, max: 0.05, step: 0.001, dec: 3, d: 'Coste de moverse ∝ velocidad²: frena la carrera de velocidad.' },
    { k: 'energy.k_muscle', label: 'Coste de musculatura', min: 0, max: 1.5, step: 0.05, dec: 2, d: 'Cuánto cuesta MANTENER músculo (el gen «Musculatura» escala la velocidad-capacidad): más coste = invertir en velocidad que no se usa pena más → trade-off r/K. 0 = el músculo es gratis de mantener.' },
    { k: 'energy.k_haul', label: 'Coste de transporte (masa)', min: 0, max: 1.5, step: 0.05, dec: 2, d: 'Cuánto encarece nadar arrastrar masa: alto = un cuerpo grande gasta más al desplazarse, no solo al mantenerse.' },
    { k: 'energy.k_drag', label: 'Coste de arrastre (forma)', min: 0, max: 1.5, step: 0.05, dec: 2, d: 'Cuánto encarece nadar el ARRASTRE de la forma (cuerpo/aletas anchos, apéndices): complementa el coste por masa — distingue la forma hidrodinámica del bulto. 0 = el arrastre solo frena, no cuesta.' },
    { k: 'vision.rangeExp', label: 'Reparto alcance/ángulo', min: 0, max: 1, step: 0.05, dec: 2, d: 'Reparte el presupuesto visual: bajo = cono frontal largo (cazador); alto = panorámica corta (presa).' },
  ]},
  { cat: '🥚 Reproducción', items: [
    { k: 'repro.cooldown', label: 'Enfriamiento de cría', min: 0, max: 200, step: 5, dec: 0, d: 'Ticks de espera entre crías: más alto = se reproducen más despacio.' },
    { k: 'repro.mateRadius', label: 'Radio de pareja', min: 20, max: 150, step: 5, dec: 0, d: 'Radio (px) en el que se busca pareja al criar: más alto = más fácil encontrarla.' },
    { k: 'repro.speciesGenThreshold', label: 'Umbral de especie', min: 0.05, max: 0.4, step: 0.01, dec: 2, d: 'Distancia genética máxima para cruzarse (= misma especie): más bajo = especies más finas.' },
    { k: 'repro.sexual', label: 'Reproducción sexual', toggle: true, d: 'La cría recombina los genomas de dos padres compatibles. Base de la especiación.' },
    { k: 'repro.asexual', label: 'Permitir reproducción asexual', toggle: true, d: 'Sin pareja cerca, el organismo se clona (con mutación). Off = sin pareja no hay cría.' },
  ]},
  { cat: '🧬 Mutación', items: [
    { k: 'mut.rate', label: 'Tasa de mutación', min: 0, max: 0.2, step: 0.005, dec: 3, d: 'Probabilidad de que cada gen mute en la cría: alta = más variación, evolución más rápida.' },
    { k: 'mut.sigma', label: 'Sigma de mutación', min: 0, max: 0.3, step: 0.005, dec: 3, d: 'Magnitud de cada mutación: más alto = saltos genéticos mayores.' },
    { k: 'mut.bigRate', label: 'Tasa de macromutación', min: 0, max: 0.01, step: 0.001, dec: 3, d: 'Probabilidad de una mutación grande y rara (salto), además de la deriva fina.' },
    { k: 'mut.recomb', label: 'Recombinación (ligamiento)', min: 0, max: 0.5, step: 0.01, dec: 2, d: 'Cruce sexual por gen: 0.5 = cada gen al azar; bajo = se heredan tramos contiguos (complejos co-adaptados intactos).' },
  ]},
  { cat: '⬡ Edad y longevidad', items: [
    // La edad de madurez es ahora un GEN evolucionable (#12), no un parámetro global. Aquí solo la escala base.
    { k: 'age.mortality', label: 'Mortalidad por edad', min: 0, max: 0.003, step: 0.0001, dec: 4, d: 'Probabilidad base de morir de viejo (el gen de ritmo de vida la escala): más alto = vidas más cortas.' },
    { k: 'energy.k_lifespan', label: 'Coste de longevidad', min: 0, max: 1, step: 0.05, dec: 2, d: 'Cuánto cuesta ser longevo: alto = la vida larga sale cara (evita que todos sean "inmortales").' },
  ]},
  { cat: '⚔ Combate y dieta', items: [
    { k: 'combat.enabled', label: 'Combate activo', toggle: true, d: 'Activa la depredación. Off = solo herbívoros pastando.' },
    { k: 'combat.sizeAdvantage', label: 'Ventaja de tamaño', min: 0, max: 3, step: 0.1, dec: 1, d: 'Cuánto pesa el tamaño en quién gana un combate: alto = el grande gana casi siempre.' },
    { k: 'combat.failDamage', label: 'Daño al fallar ataque', min: 0, max: 1, step: 0.05, dec: 2, d: 'Energía que pierde el atacante al fallar (× su máximo): bajo = carnívoros resilientes; ≥1 = muerte casi segura.' },
    { k: 'combat.fleeSpeed', label: 'Escape por velocidad', min: 0, max: 4, step: 0.2, dec: 1, d: 'La presa más rápida que su cazador se zafa → la persecución es un duelo de velocidad. Necesita la cobertura del refugio baja para notarse.' },
    { k: 'combat.preyBandLo', label: 'Suelo de banda de caza', min: 0, max: 1, step: 0.05, dec: 2, d: 'Ratio mínimo presa/depredador atacable: ignora presas demasiado pequeñas.' },
    { k: 'combat.preyBandHi', label: 'Techo de banda de caza', min: 0.5, max: 3, step: 0.05, dec: 2, d: 'Ratio máximo presa/depredador atacable: bajo = solo presa menor; >1 = puede atacar presa mayor (caro).' },
    { k: 'combat.morphReach', label: 'Alcance de caza (apéndices)', min: 0, max: 1.5, step: 0.05, dec: 2, d: 'Cuánto extienden el alcance de captura los apéndices frontales (garras/tentáculos): forma de cazador.' },
    { k: 'combat.lureAttract', label: 'Atracción del señuelo (emboscada)', min: 0, max: 1.5, step: 0.05, dec: 2, d: 'Cuánto ATRAE el señuelo a la presa que lo ve (emboscada anglerfish): la presa se acerca al portador. 0 = el señuelo solo extiende el alcance de captura, no atrae.' },
    { k: 'combat.handlingTime', label: 'Tiempo de manejo (digestión)', min: 0, max: 120, step: 4, dec: 0, d: 'Ticks de enfriamiento tras cazar: limita la tasa de caza y amortigua las oscilaciones.' },
    { k: 'combat.dietMargin', label: 'Margen de dieta (presa)', min: 0, max: 0.6, step: 0.02, dec: 2, d: 'Diferencia de dieta mínima para ver a otro como presa (evita que los parecidos se coman).' },
    // Energética de la DEPREDACIÓN (antes en "Energía"): viven con el combate que las produce.
    { k: 'energy.preyGain', label: 'Energía de la presa', min: 0, max: 1, step: 0.02, dec: 2, d: 'Fracción de la energía almacenada de la presa que aprovecha el cazador.' },
    { k: 'energy.carcassValue', label: 'Valor del cadáver (biomasa)', min: 0, max: 1, step: 0.05, dec: 2, d: 'Cuánto alimenta el CUERPO de la presa al cazarla, además de su energía. Alto = cazar es viable aunque la presa esté magra; muy alto puede disparar oscilaciones.' },
    { k: 'diet.omniPenalty', label: 'Penalización omnívora', min: 0, max: 1, step: 0.05, dec: 2, d: 'Penaliza la dieta intermedia: alta = especializarse (herbívoro o carnívoro puro) rinde más.' },
    { k: 'diet.scavPenalty', label: 'Penalización caza/carroña', min: 0, max: 1, step: 0.05, dec: 2, d: 'Penaliza cazar Y carroñear a la vez: alta = obliga a elegir cazador o carroñero (diverge el gusano).' },
  ]},
  { cat: '🌿 Refugio de presa', items: [
    { k: 'refuge.enabled', label: 'Refugio de presa', toggle: true, d: 'La vegetación densa esconde a la presa (refugio que se mueve con el pasto) → los carnívoros no se extinguen.' },
    { k: 'refuge.strength', label: 'Cobertura del refugio', min: 0, max: 1, step: 0.05, dec: 2, d: 'Cuánto protege la cobertura: alto = en zonas tupidas la presa casi siempre escapa. 0 = sin refugio.' },
  ]},
  { cat: '🎨 Estética (solo render)', items: [
    { k: 'render.worldBounds', label: 'Límite del mundo', toggle: true, d: 'Dibuja un borde TENUE en los límites del mundo (toro): ayuda a ver dónde acaba un mundo y empieza su repetición en el mosaico. Sutil, solo visual.' },
    { k: 'render.vegIntensity', label: 'Brillo de la vegetación', min: 0, max: 3, step: 0.1, dec: 1, d: 'Cuánto resalta la vegetación (teal del pasto) en el sustrato. 0 = invisible; alto = muy presente. Solo visual, en vivo.' },
    { k: 'render.vegBoost', label: 'Realce del pasto tenue', min: 0, max: 1, step: 0.05, dec: 2, d: 'Cuánto se nota el pasto escaso: derecha = hasta el pasto ralo brilla; izquierda = solo el pasto denso. Solo visual, en vivo.' },
    { k: 'render.vegBlur', label: 'Suavizado del sustrato', min: 0, max: 4, step: 0.2, dec: 1, d: 'Difumina el sustrato para disolver la rejilla de celdas del recurso. 0 = nítido (se ve la cuadrícula); alto = nebulosa difusa. Solo visual, en vivo.' },
    { k: 'render.nutrientEase', label: 'Reactividad del nutriente', min: 0.02, max: 0.5, step: 0.02, dec: 2, d: 'Cuánto siguen las manchas de nutriente al campo real. Izquierda = respiran despacio (calmado, no titilan); derecha = reaccionan al instante (titilan al ritmo de los ticks). Solo visual, en vivo.' },
  ]},
];

function setupLab(app, send) {
  const cfg = app.cfg;
  const $ = (id) => document.getElementById(id);
  const get = (path) => { const ks = path.split('.'); let t = cfg; for (const k of ks) t = t[k]; return t; };
  // Espeja el cambio en la config del HILO PRINCIPAL (no solo en el worker) → el readout (N) y el render leen el valor real.
  const setLocal = (path, v) => { const ks = path.split('.'); let t = cfg; for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]]; t[ks[ks.length - 1]] = v; };
  // Cambios de parámetros ↻ (reseed): NO se aplican EN CALIENTE — romperían la sim VIVA (p.ej. `world.size` cambia el
  // wrapping toroidal y la rejilla a mitad de corrida → desajuste posiciones↔grid). Se guardan como PENDIENTES y se
  // aplican (al worker + config del hilo principal) SOLO al Reiniciar (app.reseed los vacía con app._flushPending).
  const pending = {};
  app._flushPending = () => { for (const k of Object.keys(pending)) { send({ type: 'set', key: k, value: pending[k] }); setLocal(k, pending[k]); delete pending[k]; } };
  const commit = (k, v, needsReseed) => {
    if (needsReseed) { pending[k] = v; if (app.markReseedPending) app.markReseedPending(); }   // ↻ → pendiente hasta Reiniciar (no toca la sim viva)
    else { send({ type: 'set', key: k, value: v }); setLocal(k, v); }                            // resto → en vivo (al instante / crías nuevas)
    if (app.requestDraw) app.requestDraw();   // repintar YA (clave en PAUSA: los cambios de solo-render no pasan por el worker → no llega snapshot)
  };

  // Anotación "base → efectivo" para los parámetros que escalan con el tamaño del mundo: el slider muestra el valor a
  // mundo 1000 y el hint añade el efectivo en el mundo pendiente. Replica sim._aScale. Solo aparece si la escala ≠ 1.
  const scaledHints = [];                                                          // [{k, el}] de los sliders con `scales:true`
  const REF_SIZE = 1000;
  const pendVal = (k) => (pending[k] != null ? pending[k] : get(k));
  const worldAScale = () => { const kk = pendVal('world.size') / REF_SIZE; return kk * kk; };   // escala ÁREA (Modelo A); el pool ya NO la acota
  const effectiveOf = (k) => { const a = worldAScale();
    if (k === 'world.matterBudget') return pendVal(k) * a;
    return pendVal(k); };   // pop.initial ya NO escala con el mundo (se siembra fijo en un círculo central)
  const fmtK = (v) => v >= 1000 ? (+(v / 1000).toFixed(v >= 10000 ? 0 : 1)) + 'k' : String(Math.round(v));
  app.refreshScaledHints = () => {                                                 // recomputa los hints (al mover Tamaño del mundo / pool / el propio param)
    const scaled = Math.abs(worldAScale() - 1) > 1e-6;                             // a mundo 1000 la escala es 1 → sin anotación
    for (const h of scaledHints) h.el.textContent = scaled ? ('→ ' + fmtK(effectiveOf(h.k))) : '';
  };

  // ---- Tooltip informativo compartido: escritorio = hover con RETARDO; móvil = TAP en el icono ⓘ. ----
  // Un único elemento reposicionable (no 44 divs). El tap lo "fija" hasta tocar fuera; el hover lo muestra
  // tras un retardo y lo oculta al salir. Así no molesta al pasar el ratón de largo.
  let tip = document.getElementById('labTip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'labTip'; tip.className = 'lab-tip'; document.body.appendChild(tip); }
  let tipTimer = null, tipPinned = false, tipOwner = null;
  const TIP_DELAY = 480;
  const hideTip = () => { tip.classList.remove('show'); tipPinned = false; tipOwner = null; };
  const showTip = (icon, text) => {
    tip.textContent = text; tip.classList.add('show');
    const r = icon.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
    let y = r.bottom + 6;
    if (y + th > window.innerHeight - 8) y = r.top - th - 6;   // si no cabe abajo, ponlo arriba
    tip.style.left = x + 'px'; tip.style.top = Math.max(8, y) + 'px';
    tipOwner = icon;
  };
  const makeInfo = (desc) => {
    const b = document.createElement('button'); b.className = 'lab-info'; b.type = 'button'; b.textContent = 'ⓘ';
    b.setAttribute('aria-label', desc);
    b.addEventListener('mouseenter', () => { if (tipPinned) return; clearTimeout(tipTimer); tipTimer = setTimeout(() => showTip(b, desc), TIP_DELAY); });
    b.addEventListener('mouseleave', () => { clearTimeout(tipTimer); if (!tipPinned) hideTip(); });
    b.addEventListener('click', (e) => {           // tap (móvil) o clic: fija/oculta al instante
      e.preventDefault(); e.stopPropagation(); clearTimeout(tipTimer);
      if (tipPinned && tipOwner === b) hideTip(); else { showTip(b, desc); tipPinned = true; }
    });
    return b;
  };
  document.addEventListener('click', () => { if (tipPinned) hideTip(); }); // tocar fuera cierra el tooltip fijado

  // Recordar qué categorías quedaron abiertas (localStorage). Por defecto: TODAS abiertas.
  const LS_OPEN = 'zenote.labOpen';
  const allOpen = LAB_SPEC.map((_, i) => i);
  let openSet; try { openSet = new Set(JSON.parse(localStorage.getItem(LS_OPEN) || JSON.stringify(allOpen))); } catch (e) { openSet = new Set(allOpen); }
  const body = $('labBody');
  if (body) {
    LAB_SPEC.forEach((group, gi) => {
      const det = document.createElement('details'); det.className = 'lab-cat'; det.open = openSet.has(gi);
      det.addEventListener('toggle', () => {       // persistir apertura/cierre de cada categoría
        if (det.open) openSet.add(gi); else openSet.delete(gi);
        try { localStorage.setItem(LS_OPEN, JSON.stringify([...openSet])); } catch (e) {}
      });
      const sum = document.createElement('summary'); sum.textContent = group.cat;
      const catReset = document.createElement('button'); catReset.className = 'lab-reset'; catReset.type = 'button';
      catReset.textContent = '↺'; catReset.title = 'Restaurar toda la categoría a sus valores por defecto';
      sum.appendChild(catReset); det.appendChild(sum);
      const grid = document.createElement('div'); grid.className = 'lab-grid';
      const resets = [];                            // reset de cada parámetro (lo usa también el reset de categoría)
      group.items.forEach((it) => {
        const def = get(it.k);                      // valor POR DEFECTO (config.js al cargar) → muesca + reset
        const needsReseed = !!(it.reseed || it.reseedOnChange);  // ↻ requiere Reiniciar para aplicarse → al tocarlo, avisa (ya no resiembra solo)
        if (it.toggle) {
          const row = document.createElement('div'); row.className = 'lab-row toggle';
          const lab = document.createElement('label'); lab.className = 'lab-toggle';
          const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!def;
          // Señal de ALTERADO (toggle): VERDOSO si activado por encima del base, ROJIZO si desactivado por debajo.
          const paintT = () => { const c = (inp.checked === !!def) ? '' : (inp.checked ? '#79c47a' : '#e0795f'); inp.style.accentColor = c; lab.style.color = c; };
          inp.addEventListener('change', () => { commit(it.k, inp.checked, needsReseed); paintT(); });
          lab.appendChild(inp); lab.appendChild(document.createTextNode(' '));
          if (needsReseed) { const m = document.createElement('span'); m.className = 'reseed-mark'; m.textContent = '↻'; lab.appendChild(m); lab.appendChild(document.createTextNode(' ')); } // ↻ dorado (requiere Reiniciar)
          lab.appendChild(document.createTextNode(it.label));
          const rb = document.createElement('button'); rb.className = 'lab-reset'; rb.type = 'button'; rb.textContent = '↺'; rb.title = 'Restaurar valor por defecto';
          const reset = () => { if (inp.checked !== !!def) { inp.checked = !!def; commit(it.k, !!def, needsReseed); } paintT(); };
          rb.addEventListener('click', reset); resets.push(reset);
          row.appendChild(lab); if (it.d) row.appendChild(makeInfo(it.d)); row.appendChild(rb);
          grid.appendChild(row);
        } else {
          const row = document.createElement('div'); row.className = 'lab-row';
          const head = document.createElement('div'); head.className = 'lab-lab';
          const name = document.createElement('span'); name.className = 'lab-name';
          if (needsReseed) { const m = document.createElement('span'); m.className = 'reseed-mark'; m.textContent = '↻'; name.appendChild(m); name.appendChild(document.createTextNode(' ')); } // ↻ dorado (requiere Reiniciar)
          name.appendChild(document.createTextNode(it.label));
          const right = document.createElement('span'); right.className = 'lab-right';
          const out = document.createElement('output'); out.textContent = (+def).toFixed(it.dec);
          const rb = document.createElement('button'); rb.className = 'lab-reset'; rb.type = 'button'; rb.textContent = '↺'; rb.title = 'Restaurar valor por defecto';
          right.appendChild(out);
          if (it.scales) { const eff = document.createElement('span'); eff.className = 'lab-eff'; eff.style.cssText = 'font-size:10px;color:#6f7a8a;margin-left:5px;font-variant-numeric:tabular-nums;'; right.appendChild(eff); scaledHints.push({ k: it.k, el: eff }); }
          if (it.d) right.appendChild(makeInfo(it.d)); right.appendChild(rb);
          head.appendChild(name); head.appendChild(right);
          const slider = document.createElement('div'); slider.className = 'lab-slider';
          const inp = document.createElement('input'); inp.type = 'range';
          inp.min = it.min; inp.max = it.max; inp.step = it.step; inp.value = def;
          // Señal de ALTERADO: el pulsador y el rango relleno (accent-color) + el valor se tiñen ROJIZO si está por
          // DEBAJO del valor base, VERDOSO si por ENCIMA, neutro si coincide → de un vistazo se ve qué se ha tocado.
          const paint = () => { const c = Math.abs(+inp.value - def) < 1e-9 ? '' : (+inp.value < def ? '#e0795f' : '#79c47a'); inp.style.accentColor = c; out.style.color = c; };
          inp.addEventListener('input', () => { const v = +inp.value; out.textContent = v.toFixed(it.dec); commit(it.k, v, needsReseed); paint(); if (it.k.indexOf('render.') === 0 && app.renderer) { app.renderer._abyssTimer = 0; app.renderer._grassTimer = 0; } if (it.scales || it.k === 'world.size') app.refreshScaledHints(); });
          const notch = document.createElement('span'); notch.className = 'lab-notch'; // muesca = valor por defecto
          notch.style.left = (100 * (def - it.min) / (it.max - it.min)) + '%';
          slider.appendChild(inp); slider.appendChild(notch);
          const reset = () => {
            inp.value = def; out.textContent = (+def).toFixed(it.dec); commit(it.k, +def, needsReseed); paint();
            if (it.scales || it.k === 'world.size') app.refreshScaledHints();
          };
          rb.addEventListener('click', reset); resets.push(reset);
          row.appendChild(head); row.appendChild(slider);
          grid.appendChild(row);
        }
      });
      catReset.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); resets.forEach((fn) => fn()); }); // no togglear el <details>
      det.appendChild(grid); body.appendChild(det);
    });
  }
  app.refreshScaledHints();   // anotación inicial "base → efectivo" en los sliders que escalan con el tamaño del mundo
  // Alternar VISTA SIMPLE ↔ MODO LABORATORIO: añade/quita .advanced al panel (revela la sección del
  // laboratorio y compacta la vista simple). Recuerda el modo entre recargas (localStorage).
  const panel = $('panel'), modeBtn = $('modeBtn');
  const LS_MODE = 'zenote.advanced';
  const applyMode = (adv) => {
    panel.classList.toggle('advanced', adv);
    modeBtn.textContent = adv ? 'Simple' : 'Laboratorio'; // texto corto (el destino del toggle); el title lo explica
    // El botón Calidad vive en la sección "Rendimiento" en LAB y vuelve al btn-row (junto a "Laboratorio") en SIMPLE
    // → el modo simple queda igual que antes. Mover el nodo conserva su listener (un único botón, sin duplicar).
    const qBtn = $('qualityBtn'), perfRow = $('perfRow'), perfBody = perfRow && perfRow.querySelector('.perf-body');
    const btnRow = panel.querySelector('.btn-row');                     // modeBtn ya NO vive en el btn-row (se movió al readout); Calidad vuelve aquí en SIMPLE
    if (qBtn && perfBody) {
      if (adv) perfBody.insertBefore(qBtn, perfBody.firstChild);        // primer control del bloque Rendimiento
      else if (btnRow) btnRow.insertBefore(qBtn, btnRow.firstChild);    // de vuelta al btn-row (modo simple)
    }
    // En modo SIMPLE el color es siempre "visión real" (el selector "Colorear por" queda oculto) → fuérzalo.
    // (Disparamos 'change' en el <select> para reusar su handler, que vive en otro ámbito y actualiza la leyenda.)
    const cs = $('colorMode');
    if (!adv && cs && cs.value !== 'real') { cs.value = 'real'; cs.dispatchEvent(new Event('change')); }
    // El layout de las gráficas cambia (apiladas ↔ lado a lado) → re-ajustar su resolución para que no se vean borrosas.
    requestAnimationFrame(() => { try { app.charts.resize(); } catch (e) {} });
  };
  if (modeBtn && panel) {
    let adv = false; try { adv = localStorage.getItem(LS_MODE) === '1'; } catch (e) {}
    applyMode(adv);
    modeBtn.addEventListener('click', () => {
      const now = !panel.classList.contains('advanced');
      try { localStorage.setItem(LS_MODE, now ? '1' : '0'); } catch (e) {}
      applyMode(now);
      modeBtn.blur();   // sin foco retenido → no se queda con aspecto "pulsado"
    });
  }

  // ---- Menú principal (intro): dibuja un bicho "mascota" con el motor de retrato y revela la sim al Entrar ----
  const intro = $('intro'), enterBtn = $('enterBtn'), introCanvas = $('introCreature');
  if (intro && enterBtn && introCanvas) {
    // Mascota ALEATORIA en cada carga, pero con valores LIGEROS dentro de rangos bonitos: el color es libre
    // (todos los tonos), y forma/conducta quedan acotadas para que siempre salga un bicho mono (ni monstruoso ni soso).
    const mascot = new Float32Array(NUM_GENES).fill(0.5);
    const R = (a, b) => a + Math.random() * (b - a);          // aleatorio en [a,b]
    const g = (n, v) => { mascot[G[n]] = v < 0 ? 0 : v > 1 ? 1 : v; };
    // hue acotado a [0.62, 0.68]: con la rueda completa del render (hue·360) eso da ~223-245° → entorno al AZUL.
    g('size', R(0.58, 0.66)); g('hue', R(0.62, 0.68)); g('sense', 0.5); g('metab', 0.5);
    g('diet', R(0.38, 0.44)); // sin gen `aggro`: las ganas de atacar emergen del cerebro
    // FORMA del mascot vía NODOS: cabeza redonda + un par de aletas BARRIDAS HACIA ATRÁS (angle≈0.7 → emit>π/2 =
    // detrás del eje, como una cola/aletas que arrastran; lo común al evolucionar nadando). Random SUTIL → varía entre cargas.
    g('n0_present', 1); g('n0_size', R(0.5, 0.6)); g('n0_aspect', R(0.26, 0.4)); g('n0_osc_amp', R(0.45, 0.6));
    g('n1_present', R(0.9, 1)); g('n1_size', R(0.44, 0.56)); g('n1_aspect', R(0.5, 0.66)); g('n1_angle', R(0.64, 0.76)); g('n1_attach', R(0.62, 0.74)); g('n1_osc_amp', R(0.45, 0.58));
    g('n2_present', R(0.78, 0.95)); g('n2_size', R(0.34, 0.46)); g('n2_aspect', R(0.46, 0.6)); g('n2_angle', R(0.72, 0.84)); g('n2_attach', R(0.5, 0.64)); g('n2_osc_amp', R(0.45, 0.58));
    for (let k = 3; k < NODE_COUNT; k++) g('n' + k + '_present', 0.1);
    g('e_fov', R(0.32, 0.4));   // #13: c_eye/c_app/c_tip retirados
    g('orn', R(0.54, 0.66)); g('c_lum', R(0.66, 0.78));
    g('o_len', R(0.58, 0.7)); g('o_bulb', R(0.46, 0.58)); g('o_hue', R(0.42, 0.58)); g('o_num', R(0.13, 0.22)); // o_len > lureGate (0.5) → la mascota luce su señuelo (moderado, el retrato lo encuadra entero)
    const ictx = introCanvas.getContext('2d');
    // El lienzo del héroe se dimensiona a su CAJA CSS × DPR → nítido a tamaño grande (la criatura es el héroe del menú).
    const sizeHero = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = introCanvas.clientWidth || 360, h = introCanvas.clientHeight || 460;
      const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (introCanvas.width !== bw || introCanvas.height !== bh) { introCanvas.width = bw; introCanvas.height = bh; }
    };
    let raf = 0, on = true;
    window.addEventListener('resize', sizeHero);
    const loop = () => {
      if (!on) return;
      sizeHero();
      const tt = performance.now() * 0.001;
      // VIDA (no "clavado"): deriva + cabeceo lentos del lienzo, viraje suave del rumbo y glow que RESPIRA.
      const driftX = Math.sin(tt * 0.23) * 10 + Math.sin(tt * 0.07) * 6, bobY = Math.sin(tt * 0.55) * 9;
      introCanvas.style.transform = `translate(${driftX.toFixed(1)}px, ${bobY.toFixed(1)}px)`;
      const heading = -Math.PI / 2 + Math.sin(tt * 0.31) * 0.14;   // vira/cabecea suave (banqueo)
      const ef = 0.82 + Math.sin(tt * 0.9) * 0.13;                 // energía → el glow late despacio
      const spd = 0.5 + Math.sin(tt * 0.7) * 0.18;                 // ritmo de ondulación
      try { app.renderer.drawPortrait(ictx, mascot, tt, ef, heading, spd, 0.16, true); } catch (e) {} // transparentBg=true → flota en el mundo difuminado, sin caja
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); // arranca en el primer frame (tras el primer draw) + try/catch → nunca rompe la init
    enterBtn.addEventListener('click', () => { intro.classList.add('hidden'); on = false; cancelAnimationFrame(raf); window.removeEventListener('resize', sizeHero); });
  }
}

// Actualiza el panel inspector cada frame, leyendo el organismo seleccionado (`sel`)
// que envía el worker (genoma, energía, linaje…).
// Ficha legible (rasgos derivados del genoma) — un resumen rápido antes de los genes detallados.
function inspCard(g, sel) {
  const diet = sel.diet != null ? sel.diet : g[G.diet];
  const dietL = diet < 0.34 ? '🌿 herbívoro' : diet < 0.67 ? '🍴 omnívoro' : '🦷 carnívoro';
  // Morfología desde el GRAFO DE NODOS (B2): cuenta nodos presentes y los clasifica como segmento
  // (medial grueso, cadena) o apéndice (fino/lateral), con el mismo umbral lateral que la física.
  let segs = 0, nApp = 0;
  for (let k = 1; k < NODE_COUNT; k++) {
    if (g[G['n' + k + '_present']] < 0.5) continue;
    const asp = g[G['n' + k + '_aspect']], ang = g[G['n' + k + '_angle']] * Math.PI;
    if (asp > 0.5 || Math.min(ang, Math.PI - ang) > 0.35) nApp++; else segs++;
  }
  const nSeg = 1 + segs;                                   // la cabeza cuenta como primer "segmento"
  const fov = g[G.e_fov], fovL = fov < 0.4 ? '👁️ frontal' : fov > 0.6 ? '👁️ panorámica' : '👁️ media';
  // "Ganas de atacar" = impulso de ataque del cerebro (dinámico, emergente), no un gen.
  const ag = sel.atkDrive != null ? sel.atkDrive : 0, agL = ag > 0.5 ? '😠 agresivo' : ag < 0.2 ? '😌 pacífico' : '😐 templado';
  const orn = g[G.orn] > 0.5 ? ' · 🦚 ornamentado' : '';
  // Estrategia de vida (#12): madurez precoz↔tardía y ritmo rápido↔longevo (eje r/K).
  const mat = g[G.mature_age], life = g[G.senescence];
  const lifeL = (mat < 0.4 ? '⏳ precoz' : mat > 0.66 ? '⏳ tardío' : '⏳ medio') + ' · ' + (life > 0.6 ? '🐇 vida rápida' : life < 0.34 ? '🐢 longevo' : '🐇 ritmo medio');
  return `<div class="insp-card">${dietL} · 🐛 ${nSeg} seg · ${nApp} apénd.<br>${fovL} · ${agL}${orn}<br>${lifeL}</div>`;
}

let _inspKey = null; // identidad del organismo mostrado → solo reconstruir al CAMBIAR de bicho
export function updateInspector(app) {
  const box = document.getElementById('inspector');
  const sel = app.sim.sel;
  if (!sel) { box.classList.remove('visible'); _inspKey = null; return; }
  box.classList.add('visible');
  const ef = sel.eMax > 0 ? sel.E / sel.eMax : 0;
  const head = `E ${sel.E.toFixed(0)}/${sel.eMax.toFixed(0)} · edad ${sel.age | 0}`;
  // Identidad (aprox): linaje+generación+tamaño. Si cambia → reconstruir; si no, solo la cabecera en vivo
  // (los genes no cambian en vida → así los grupos <details> que abras NO se cierran cada frame).
  // Etiqueta de especie (con nº de INDIVIDUOS de esa especie) — se recalcula cada frame para que el conteo viva.
  const sIdx = sel.speciesIdx != null ? sel.speciesIdx : -1, sTot = sel.speciesTotal || 0;
  const members = sel.speciesMembers != null ? sel.speciesMembers : 0;
  const navLabel = `🧬 ${sIdx >= 0 ? `especie ${sIdx + 1}/${sTot}` : 'especie'} · #${sel.species | 0}`;
  const membersLabel = `👥 ${members} individuo${members === 1 ? '' : 's'} en esta especie`; // a ancho completo (no se trunca)
  const key = sel.lineage + ':' + sel.generation + ':' + sel.genes[0].toFixed(3);
  if (key !== _inspKey) {
    _inspKey = key;
    let html = `<button class="insp-close" title="Cerrar">✕</button>` +
      `<canvas class="insp-portrait" width="120" height="96"></canvas>` +
      `<div class="insp-nav"><button class="spnav" data-dir="-1" title="Especie anterior">◀</button>` +
      `<span class="insp-navlabel">${navLabel}</span>` +
      `<button class="spnav" data-dir="1" title="Especie siguiente">▶</button></div>` +
      `<div class="insp-members">${membersLabel}</div>` +
      `<div class="insp-head" style="color:hsl(${(175 + sel.hue * 260) % 360},85%,62%)">${head}</div>` +
      `<div class="insp-sub">linaje #${sel.lineage} · generación ${sel.generation}</div>` +
      inspCard(sel.genes, sel);
    GENE_GROUPS.forEach((grp) => {              // genoma agrupado en secciones plegables (no listado infinito)
      html += `<details class="ginfo"><summary>${grp.label}</summary>`;
      grp.genes.forEach((name) => {
        const v = sel.genes[G[name]];
        html += `<div class="gbar"><span>${GENE_LABELS[name] || name}</span>` +
          `<div class="track"><div class="fill" style="width:${(v * 100) | 0}%"></div></div>` +
          `<em>${v.toFixed(2)}</em></div>`;
      });
      html += `</details>`;
    });
    box.innerHTML = html;
  } else {
    const hd = box.querySelector('.insp-head'); if (hd) hd.textContent = head;
    const nl = box.querySelector('.insp-navlabel'); if (nl) nl.textContent = navLabel;
    const ml = box.querySelector('.insp-members'); if (ml) ml.textContent = membersLabel; // conteo de individuos EN VIVO
  }
  const pc = box.querySelector('.insp-portrait'); // retrato animado (cada frame)
  if (pc) app.renderer.drawPortrait(pc.getContext('2d'), sel.genes, app.renderer._animT * 0.006, ef, sel.heading, sel.spd, sel.atkDrive); // orienta/ondula como en el mundo
}

// hashStr: convierte el texto del campo "semilla" en una semilla numérica (cuando se usa).
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
