// UI: controles en vivo (sliders que afectan la simulación), inspector de genoma,
// reseed, modo contemplación. Pensado para ratón y táctil (pointer events).

import { GENES, GENE_LABELS, G, NUM_GENES, GENE_GROUPS, DECOR, NODE_COUNT } from '../engine/genome.js';

export function setupControls(app) {
  const { sim, renderer, charts, cfg, worker } = app;
  const $ = (id) => document.getElementById(id);
  const send = (msg) => worker.postMessage(msg); // comandos al motor (worker)

  // ---- Play / pausa ----
  const playBtn = $('play');
  playBtn.addEventListener('click', () => {
    app.running = !app.running;
    playBtn.textContent = app.running ? '❚❚' : '▶';
    playBtn.title = app.running ? 'Pausar (Espacio)' : 'Reanudar (Espacio)';
    send({ type: 'running', value: app.running });
    refreshSpeedState();
  });

  // ---- Botón "Máx velocidad" (ignora el slider; simula tanto como quepa por frame) ----
  const maxBtn = $('maxBtn');
  if (maxBtn) maxBtn.addEventListener('click', () => {
    app.maxSpeed = !app.maxSpeed;
    maxBtn.classList.toggle('active', app.maxSpeed); // el caption se queda en "max"
    send({ type: 'maxSpeed', value: app.maxSpeed });
    refreshSpeedState();
  });

  // ---- Estado "desactivado" del slider de velocidad ----
  // El slider de t/s NO aplica si está en PAUSA (no avanza nada) o en MÁX (va a tope ignorando el slider).
  // En esos casos lo atenuamos + bloqueamos y lo explicamos en el caption, para que quede claro al usuario.
  function refreshSpeedState() {
    const tEl = $('ticks'), valEl = $('ticksVal'), row = tEl && tEl.closest('.speed-row');
    if (!tEl) return;
    const off = !app.running || app.maxSpeed;
    // NO se deshabilita el slider: aunque esté en pausa/máx, pincharlo debe "despertarlo" (salir de
    // esos estados y adoptar la velocidad pulsada, ver applyTPS). Solo se atenúa visualmente.
    if (row) row.classList.toggle('speed-off', off);
    if (!app.running)      valEl.textContent = 'en pausa';
    else if (app.maxSpeed) valEl.textContent = 'al máximo';
    else                   valEl.textContent = `${posToTps(+tEl.value)} t/s`;
  }

  // ---- Velocidad en ticks/segundo (desacoplada de los fps). Mapeo LOGARÍTMICO sobre la
  // posición del slider (1..1000) → 1..480 t/s, con MUCHA resolución en velocidades bajas
  // (ajuste fino) y menos arriba. La PAUSA la cubre el botón; el slider mínimo es 1 t/s. ----
  const TPS_MIN = 1, TPS_MAX = 480, POSN = 1000, LR = Math.log(TPS_MAX / TPS_MIN);
  const posToTps = (pos) => pos <= 0 ? 0 : Math.round(TPS_MIN * Math.exp(LR * (pos - 1) / (POSN - 1)));
  const tpsToPos = (tps) => tps <= 0 ? 0 : Math.round(1 + (POSN - 1) * Math.log(tps / TPS_MIN) / LR);
  const ticksEl = $('ticks'), ticksValEl = $('ticksVal');
  const applyTPS = () => {
    // Pinchar/arrastrar el slider DESPIERTA la velocidad: si estaba en MÁX o en PAUSA, sale de esos
    // estados y adopta la posición pulsada (el slider vuelve a estar activo vía refreshSpeedState).
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

  // ---- LABORATORIO: ventana con TODOS los parámetros ajustables, por categorías (data-driven). ----
  // Cada control envía {type:'set', key, value} al worker (setPath en worker.js). Los parámetros de
  // coste/morfología se cachean al NACER → se aplican a las crías nuevas (se propagan al renovarse la
  // población); los que se leen cada tick, al instante. Los marcados ↻ requieren volver a Sembrar.
  setupLab(app, send);

  // ---- Render: glow vive en config.js (sin control en vivo); la calidad alta/baja, en su botón. ----

  // ---- Selector de gen para el histograma ----
  const sel = $('geneSel');
  // Genes SOLO de apariencia (su histograma solo refleja deriva, no evolución útil): los DECOR (colores,
  // piel, ojos, señuelo) más el color de linaje (`hue`). La forma ahora vive en los genes de NODO.
  const COSMETIC = new Set([...DECOR, G.hue]);
  const HIDE_GROUPS = new Set(['Color y ornamento', 'Nodos (cuerpo)']); // grupos enteros fuera del histograma (los nodos del cuerpo no se histograman)
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
    else if (m === 'gene') legendEl.innerHTML = bar(ramp(u => (1 - u) * 250, 80, 52)) + `<span>${GENE_LABELS[GENES[renderer.geneIndex]]}: bajo</span><span>alto</span>`; // h=(1-gen)*250
    else if (m === 'energy') legendEl.innerHTML = bar(ramp(u => u * 130, 85, 50)) + '<span>hambriento</span><span>lleno</span>';                 // h=ef*130
    else if (m === 'lineage') legendEl.innerHTML = '<em>un color por linaje fundador (familias / proto-especies)</em>';
    else if (m === 'species') legendEl.innerHTML = '<em>un color por ESPECIE (clúster genético; se cruzan entre sí)</em>';
    else legendEl.innerHTML = '<em>tono = pigmento adaptado a la luz local · brillo = energía</em>';
  };
  if (colorSel) colorSel.addEventListener('change', () => { renderer.colorMode = colorSel.value; updateLegend(); });
  updateLegend();

  // ---- Reseed ----
  $('reseed').addEventListener('click', () => {
    const si = $('seedInput');                       // campo semilla oculto de momento → si no existe/vacío, semilla aleatoria
    const raw = si ? si.value.trim() : '';
    const seed = raw === '' ? null : (Number.isFinite(+raw) ? +raw : hashStr(raw));
    send({ type: 'reset', seed });   // el motor (worker) re-siembra y reenvía el mundo
    charts.clear();
    renderer.resize();
  });

  // ---- Slider de DIVERSIDAD del sembrado (junto a Sembrar): monótono ↔ variado. Aplica al próximo Sembrar. ----
  const divSlider = $('divSlider'), divVal = $('divVal');
  if (divSlider) {
    const syncDiv = () => { const v = +divSlider.value; if (divVal) divVal.textContent = v.toFixed(2); };
    divSlider.addEventListener('input', () => {
      const v = +divSlider.value; syncDiv();
      cfg.pop.startDiversity = v;                                  // config del hilo principal
      send({ type: 'set', key: 'pop.startDiversity', value: v });  // y del worker → se usa en el próximo reset (Sembrar)
    });
    syncDiv();
  }

  // ---- Calidad gráfica (Alta/Baja): BAJA = DPR 1, sin bloom, menos nieve, sustrato simple, LOD agresivo →
  // mucho mejor rendimiento en móvil. Autodetecta táctil/pantalla pequeña; el botón permite forzarla. ----
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
      renderer.resize();                      // recalcula DPR (baja/alta/máxima) y fuerza refresco del fondo
      try { charts.resize(); } catch (e) {}
    };
    applyQuality(q);
    qualityBtn.addEventListener('click', () => {
      const val = QNEXT[cfg.render.quality] || 'high';
      try { localStorage.setItem(LS_Q, val); } catch (e) {}
      applyQuality(val); qualityBtn.blur();
    });
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
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return; // no robar teclas a los campos
    if (e.key === 'h' || e.key === 'H') setHidden(!panel.classList.contains('hidden'));
    if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
  });

  // ---- Barra de zoom clásica (sincronizada con rueda/pinza/doble-clic) ----
  const zoomEl = $('zoomSlider'), zoomValEl = $('zoomVal');
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
  const endPointer = (e) => {
    if (pointers.size === 1 && !dragMoved) { // tap limpio → inspeccionar (lo resuelve el worker)
      const p = renderer.screenToWorld(e.clientX, e.clientY);
      send({ type: 'pick', wx: p.x, wy: p.y });
      app.followSel = true; app._selSeen = false;             // la cámara seguirá al seleccionado (espera al pick)
      if (renderer.zoom < 7) { renderer.zoomAt(7 / renderer.zoom, e.clientX, e.clientY); syncZoom(); } // acercar
    }
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); });
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
  { cat: '🍃 Comida y recurso', items: [
    { k: 'resource.R_regen', label: 'Comida disponible (rebrote)', min: 0, max: 0.012, step: 0.0001, dec: 4, d: 'Ritmo al que rebrota la comida por tick. Es el regulador principal de cuántos organismos sostiene el mundo: más alto = más comida = más población.' },
    { k: 'resource.grazeRefuge', label: 'Reserva de rebrote', min: 0, max: 0.8, step: 0.01, dec: 2, d: 'Fracción de cada celda que NO se puede pastar (queda como semilla). Más alto = la vegetación nunca se agota del todo y frena el sobrepastoreo.' },
    { k: 'resource.forageReach', label: 'Alcance de forrajeo (talla)', min: 0, max: 4, step: 1, dec: 0, d: 'Cuántas celdas alrededor pasta un cuerpo GRANDE (el pequeño solo la suya): forageR=round(este·talla). Da una ventaja a la talla que la escasez no borra (el grande cubre más terreno → cosecha más aunque las celdas estén peladas). 0 = todos pastan solo su celda → los herbívoros derivan al tamaño mínimo. 3 (def., con omniPenalty 0.15) = dos grupos de talla (pequeños y grandes) y revive el nicho carnívoro. Se aplica en vivo.' },
    { k: 'resource.absRate', label: 'Ritmo de absorción', min: 0, max: 0.4, step: 0.005, dec: 3, d: 'Velocidad a la que un organismo absorbe el recurso de su celda. Más alto = comen más rápido (pero arrasan antes la celda).' },
    { k: 'resource.energyPerUnit', label: 'Energía por unidad', min: 5, max: 40, step: 1, dec: 0, d: 'Cuánta energía da cada unidad de recurso consumida. Sube la rentabilidad de pastar (parámetro de equilibrio crítico).' },
    { k: 'resource.patchiness', label: 'Comida en parches', min: 0, max: 1, step: 0.05, dec: 2, d: '0 = el pasto rebrota lineal y uniforme (sin parches). Subir = rebrote logístico + colonización desde los bordes → las calvas pastadas tardan en recuperarse y los parches se agotan, se reconquistan y migran SOLOS. Premia buscar y recordar (cerebro). Efecto en vivo.' },
    { k: 'resource.carrionDecay', label: 'Descomposición de cadáveres', min: 0, max: 0.05, step: 0.001, dec: 3, d: 'Ritmo al que se pudre la CARROÑA (cadáveres) por tick. Lo que se descompone vuelve en parte al pasto (ciclo de nutrientes). Bajo = los cuerpos duran (más tiempo para que un carroñero los aproveche); alto = se deshacen rápido. 0 = no se pudren (solo desaparecen si los comen). Se aplica en vivo.' },
    { k: 'resource.carrionAbsRate', label: 'Ritmo de carroñeo', min: 0, max: 1, step: 0.05, dec: 2, d: 'A qué velocidad vacía un carroñero el cadáver de su celda (× su eficiencia carroñera, gen caza↔carroña). Alto = lo consumen de golpe; bajo = picotean poco a poco. Se aplica en vivo.' },
  ]},
  { cat: '⚡ Energía y costes', items: [
    { k: 'energy.c_base', label: 'Coste basal', min: 0, max: 0.06, step: 0.002, dec: 3, d: 'Gasto metabólico de existir, por tick. Más alto = la vida es más cara y la población baja.' },
    { k: 'energy.massExp', label: 'Escala talla→masa', min: 1, max: 2.2, step: 0.05, dec: 2, d: 'Cuánto pesa ser grande (exponente alométrico). 1 = lineal (la talla casi no cambia la masa); 2 = área 2D (la masa, y con ella la reserva y el coste, se disparan con el tamaño).' },
    { k: 'energy.k_metab', label: 'Coste por metabolismo', min: 0, max: 2, step: 0.05, dec: 2, d: 'Cuánto encarece el gen de metabolismo el coste basal. Metabolismo alto come y procesa más rápido, pero gasta más.' },
    { k: 'energy.k_sense', label: 'Coste por visión', min: 0, max: 1, step: 0.02, dec: 2, d: 'Coste energético de tener buena visión (alcance). Ver lejos cuesta: presiona a invertir en vista solo si compensa.' },
    { k: 'energy.kleiber', label: 'Metabolismo de escala', min: 0.5, max: 1, step: 0.02, dec: 2, d: 'Cómo escala el coste de mantenerse con la masa (ley de Kleiber). 0.75 = los grandes gastan menos por unidad de masa (economía de escala); 1 = el coste crece proporcional a la masa (sin ventaja de ser grande).' },
    { k: 'energy.k_graze', label: 'Pasto extra por masa', min: 0, max: 2, step: 0.05, dec: 2, d: 'Cuánto más pasta un cuerpo con más masa. Ata la complejidad al nicho herbívoro (al carnívoro no le aporta).' },
    { k: 'energy.k_scavThin', label: 'Carroñeo por cuerpo fino', min: 0, max: 2, step: 0.05, dec: 2, d: 'Cuánto mejor carroñea un cuerpo FINO/elongado: rastrear cadáveres dispersos premia el crucero barato → empuja a los carroñeros hacia la forma de GUSANO (reverso del pastador ancho). 0 = ser fino no ayuda a carroñear (no emerge el gusano). Se aplica en vivo.' },
    { k: 'energy.k_effort', label: 'Coste por esfuerzo', min: 0, max: 3, step: 0.05, dec: 2, d: 'Coste extra de nadar con mucho esfuerzo. Ir a tope sale caro → la velocidad la limita el presupuesto energético.' },
    { k: 'energy.moveCost', label: 'Coste de nado (v²)', min: 0, max: 0.05, step: 0.001, dec: 3, d: 'Coeficiente del coste de moverse, proporcional a la velocidad al cuadrado. Frena la carrera de velocidad.' },
    { k: 'energy.k_haul', label: 'Coste de transporte (masa)', min: 0, max: 1.5, step: 0.05, dec: 2, d: 'Cuánto encarece NADAR el arrastrar masa: el coste de nado se multiplica por (1 + este·max(0, masa−1)). 0 = nadar cuesta igual sea cual sea el cuerpo (el arrastre solo lo frena); alto = un cuerpo grande o con muchos/grandes apéndices gasta más al desplazarse, no solo al mantenerse. Penaliza solo por encima del organismo medio (el aerodinámico ahorra). Se aplica en vivo.' },
    { k: 'energy.E_max_base', label: 'Energía máxima base', min: 40, max: 200, step: 5, dec: 0, d: 'Energía máxima que puede almacenar un organismo (escala con su tamaño). Mayor = más reserva para sobrevivir hambrunas.' },
    { k: 'energy.preyGain', label: 'Energía de la presa', min: 0, max: 1, step: 0.02, dec: 2, d: 'Fracción de la energía ALMACENADA de la presa que aprovecha el depredador al cazarla. Sube la rentabilidad de cazar.' },
    { k: 'energy.carcassValue', label: 'Valor del cadáver (biomasa)', min: 0, max: 1, step: 0.05, dec: 2, d: 'Cuánto alimenta el CUERPO de la presa al cazarla, ADEMÁS de la energía que tuviera almacenada (× su energía máxima). 0 = solo cuenta lo que la presa tenía "cenado" → en un mundo con poca comida las presas crían hasta el tope pero medio vacías de energía, y cazarlas da calorías vacías → los carnívoros se extinguen rodeados de presa abundante (es la razón de que cazar sea durísimo cuando bajas la comida). Subirlo = comerse un animal alimenta por su tejido aunque viniera hambriento → revive el nicho carnívoro en la escasez (0.25 ≈ minoría estable). OJO: muy alto ablanda el freno natural (presa magra mata de hambre al cazador) → en mundos con MUCHA comida puede disparar oscilaciones depredador-presa. Se aplica en vivo.' },
    { k: 'energy.scrapReturn', label: 'Sobras de la caza (carroña)', min: 0, max: 1, step: 0.05, dec: 2, d: 'Cuánta carroña deja una presa CAZADA, como fracción de su biomasa (el depredador ya se llevó casi todo → "restos"). Las muertes NATURALES (vejez, hambre) dejan el cuerpo entero. Bajo = cazar casi no deja nada para los carroñeros; alto = los cadáveres de caza alimentan bien. Se aplica en vivo.' },
  ]},
  { cat: '🥚 Reproducción', items: [
    { k: 'repro.cooldown', label: 'Enfriamiento de cría', min: 0, max: 200, step: 5, dec: 0, d: 'Ticks de espera obligatoria entre crías. Más alto = se reproducen más despacio.' },
    { k: 'repro.mateRadius', label: 'Radio de pareja', min: 20, max: 150, step: 5, dec: 0, d: 'Radio (px) en el que se busca pareja compatible al reproducirse. Más alto = más fácil encontrar pareja (compensa baja densidad).' },
    { k: 'repro.speciesGenThreshold', label: 'Umbral de especie', min: 0.05, max: 0.4, step: 0.01, dec: 2, d: 'Distancia genética máxima para poder cruzarse (= misma especie). Más bajo = especies más finas y cohesivas; al divergir más, quedan aislados.' },
    { k: 'repro.sexual', label: 'Reproducción sexual', toggle: true, d: 'La cría recombina los genomas de dos padres compatibles y cercanos. Es la base de la especiación.' },
    { k: 'repro.asexual', label: 'Permitir reproducción asexual', toggle: true, d: 'Si se activa, un organismo sin pareja cerca se clona a sí mismo (con mutación). Si se desactiva, sin pareja no hay cría → encontrar pareja es una presión real.' },
  ]},
  { cat: '🧬 Mutación', items: [
    { k: 'mut.rate', label: 'Tasa de mutación', min: 0, max: 0.2, step: 0.005, dec: 3, d: 'Probabilidad de que CADA gen mute en la cría (todos por igual: ecología, forma y color). Más alta = más variación y evolución más rápida, pero más crías peores.' },
    { k: 'mut.sigma', label: 'Sigma de mutación', min: 0, max: 0.3, step: 0.005, dec: 3, d: 'Magnitud de cada mutación: cuánto cambia el valor del gen. Más alto = saltos genéticos mayores.' },
    { k: 'mut.bigRate', label: 'Tasa de macromutación', min: 0, max: 0.02, step: 0.001, dec: 3, d: 'Probabilidad de una mutación grande y rara (salto). Permite cambios bruscos ocasionales además de la deriva fina.' },
    { k: 'mut.recomb', label: 'Recombinación (ligamiento)', min: 0, max: 0.5, step: 0.01, dec: 2, d: 'Recombinación sexual: probabilidad de "cruce" por gen. 0.5 = sin ligamiento (cada gen al azar de un padre); valores bajos = se heredan TRAMOS contiguos de cada padre → los complejos co-adaptados (cerebro, plan corporal) pasan casi intactos.' },
  ]},
  { cat: '⚔ Combate y dieta', items: [
    { k: 'combat.enabled', label: 'Combate activo', toggle: true, d: 'Activa la depredación/combate (Fase 2). Desactivado: solo herbívoros pastando.' },
    { k: 'combat.sizeAdvantage', label: 'Ventaja de tamaño', min: 0, max: 3, step: 0.1, dec: 1, d: 'Cuánto pesa el tamaño en quién gana un combate. Más alto = el grande gana casi siempre.' },
    { k: 'combat.failDamage', label: 'Daño al fallar ataque', min: 0, max: 1.5, step: 0.05, dec: 2, d: 'Energía que pierde el atacante cuando FALLA un ataque (× su energía máxima); muere solo si llega a 0. Bajo = los carnívoros sobreviven a fallos → más resilientes (pero ojo al sobre-disparo de la presa). ≥1 ≈ muerte casi segura al fallar (comportamiento clásico). Riesgo graduado en vez de binario.' },
    { k: 'combat.fleeSpeed', label: 'Escape por velocidad', min: 0, max: 4, step: 0.5, dec: 1, d: 'La presa que nada MÁS RÁPIDO que su cazador se zafa (probabilidad ∝ cuánto más rápida es). Convierte la persecución en un duelo de velocidad → la velocidad y los propulsores (colas, aletas) pasan a importar y suben con el tiempo (carrera presa-cazador). 0 = solo se escapa por cobertura (modelo previo). OJO: necesita la "Cobertura del refugio" baja para notarse (si no, esconderse lo enmascara); demasiado alto (≥4) o sin cobertura → la presa escapa siempre y los carnívoros se quedan sin comer. Se aplica en vivo.' },
    { k: 'combat.preyBandLo', label: 'Suelo de banda de caza', min: 0, max: 1, step: 0.05, dec: 2, d: 'Mínimo ratio tamaño_presa/tamaño_depredador ATACABLE. Por debajo, la presa es demasiado pequeña para compensar (no la persigue). 0 = puede cazar cualquier cosa menor que el techo; 0.20 (def.) = ignora presas <20% de su talla; alto (≈1) = solo presas casi de su talla o mayores → fuerza especialización en presa grande. Por simetría también fija qué depredadores percibe una presa como amenaza. Se aplica en vivo.' },
    { k: 'combat.preyBandHi', label: 'Techo de banda de caza', min: 0.5, max: 3, step: 0.05, dec: 2, d: 'Máximo ratio tamaño_presa/tamaño_depredador ATACABLE. Bajo (0.9) = la presa debe ser claramente menor → depredador grande y la presa escapa CRECIENDO (refugio por tamaño → carnívoros extintos). 1.0 = caza hasta su tamaño. >1.0 = puede intentar presa MAYOR que él; la dificultad la pone el combate (gana menos, muere más al fallar) → posible pero caro. Se aplica en vivo.' },
    { k: 'combat.handlingTime', label: 'Tiempo de manejo (digestión)', min: 0, max: 120, step: 4, dec: 0, d: 'Ticks de enfriamiento tras una captura (digestión). Limita la tasa de caza y amortigua las oscilaciones depredador-presa.' },
    { k: 'combat.dietMargin', label: 'Margen de dieta (presa)', min: 0, max: 0.6, step: 0.02, dec: 2, d: 'Diferencia de dieta mínima para considerar a otro "presa" y no un igual. Evita que organismos parecidos se coman entre sí.' },
    { k: 'diet.omniPenalty', label: 'Penalización omnívora', min: 0, max: 1, step: 0.05, dec: 2, d: 'Penalización al omnívoro (dieta intermedia). Alta = especializarse (herbívoro o carnívoro puro) rinde más.' },
    { k: 'diet.scavPenalty', label: 'Penalización caza/carroña', min: 0, max: 1, step: 0.05, dec: 2, d: 'Penalización al que intenta cazar Y carroñear a la vez (gen caza↔carroña intermedio). Alta = obliga a elegir entre CAZADOR de presa viva o CARROÑERO de cadáveres → diverge el gusano carroñero. 0 = un comecarne hace ambas igual de bien y no aparece un nicho carroñero propio.' },
  ]},
  { cat: '🌿 Refugio de presa', items: [
    { k: 'refuge.enabled', label: 'Refugio de presa', toggle: true, d: 'Cobertura: la vegetación densa esconde a la presa, que se escabulle del ataque tanto más cuanto más tupida sea la zona (no es un "no cazable" binario). Como el pasto se come y rebrota, los refugios se MUEVEN solos. Garantiza un suelo de presas → los carnívoros no se extinguen (estabilizador Lotka-Volterra).' },
    { k: 'refuge.strength', label: 'Cobertura del refugio', min: 0, max: 1, step: 0.05, dec: 2, d: 'Cuánto protege la cobertura: probabilidad de que la presa escape = esto × vegetación de su celda. 0 = sin refugio (la presa puede ser barrida); alto = en zonas tupidas casi siempre escapa (los carnívoros dependen de los claros pastados). Efecto en vivo.' },
  ]},
  { cat: '🏊 Locomoción y visión', items: [
    { k: 'loco.kThrust', label: 'Empuje base', min: 0.5, max: 12, step: 0.1, dec: 1, d: 'Calibra la velocidad-capacidad típica que produce la morfología. Más alto = en general todos nadan más rápido.' },
    { k: 'loco.headThrust', label: 'Empuje de la cabeza', min: 0, max: 1, step: 0.05, dec: 2, d: 'Cuánto propulsa la CABEZA por sí sola. 1 = una cabeza pelada ya nada bien (poca presión para tener cola). Bajo = la cabeza es casi solo carga → nadar bien EXIGE cola/aletas, que evolucionan por selección (cuerpos más variados).' },
    { k: 'loco.vMax', label: 'Velocidad máxima', min: 1, max: 6, step: 0.1, dec: 1, d: 'Techo de seguridad de la velocidad. Limita lo rápido que puede llegar a moverse cualquier cuerpo.' },
    { k: 'loco.turnBase', label: 'Agilidad de giro', min: 0.02, max: 0.5, step: 0.01, dec: 2, d: 'Agilidad de giro base. Más alto = giran más rápido hacia donde quieren ir (menos cuerpos "torpes").' },
    { k: 'loco.phaseGain', label: 'Coordinación de marcha', min: 0, max: 1, step: 0.05, dec: 2, d: 'Cuánto penaliza nadar con las partes del cuerpo DESCOORDINADAS (fases dispersas = aleteo ineficiente). 0 = no importa la coordinación; más alto = presiona a evolucionar una natación coordinada (onda limpia).' },
    { k: 'vision.rangeExp', label: 'Reparto alcance/ángulo', min: 0, max: 1, step: 0.05, dec: 2, d: 'Cómo se reparte el presupuesto visual entre alcance y ángulo. Bajo = conos frontales que ven lejos (cazador); alto = panorámicas cortas (presa).' },
  ]},
  { cat: '⬡ Edad', items: [
    // La edad de madurez es ahora un GEN evolucionable (#12), no un parámetro global. Aquí solo la escala base.
    { k: 'age.mortality', label: 'Mortalidad por edad', min: 0, max: 0.003, step: 0.0001, dec: 4, d: 'Probabilidad BASE de morir de viejo (el gen de ritmo de vida la escala por individuo; crece con la edad pasada la madurez). Más alto = vidas más cortas.' },
    { k: 'energy.k_lifespan', label: 'Coste de longevidad', min: 0, max: 1, step: 0.05, dec: 2, d: 'Cuánto cuesta de mantener ser longevo (vivir despacio). Más alto = la vida larga sale cara → favorece estrategias rápidas. Es el contrapeso que evita que todos se vuelvan "inmortales".' },
  ]},
];

function setupLab(app, send) {
  const cfg = app.cfg;
  const $ = (id) => document.getElementById(id);
  const get = (path) => { const ks = path.split('.'); let t = cfg; for (const k of ks) t = t[k]; return t; };

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
        if (it.toggle) {
          const row = document.createElement('div'); row.className = 'lab-row toggle';
          const lab = document.createElement('label'); lab.className = 'lab-toggle';
          const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!def;
          // Señal de ALTERADO (toggle): VERDOSO si activado por encima del base, ROJIZO si desactivado por debajo.
          const paintT = () => { const c = (inp.checked === !!def) ? '' : (inp.checked ? '#79c47a' : '#e0795f'); inp.style.accentColor = c; lab.style.color = c; };
          inp.addEventListener('change', () => { send({ type: 'set', key: it.k, value: inp.checked }); paintT(); });
          lab.appendChild(inp); lab.appendChild(document.createTextNode(' ' + it.label));
          const rb = document.createElement('button'); rb.className = 'lab-reset'; rb.type = 'button'; rb.textContent = '↺'; rb.title = 'Restaurar valor por defecto';
          const reset = () => { if (inp.checked !== !!def) { inp.checked = !!def; send({ type: 'set', key: it.k, value: !!def }); } paintT(); };
          rb.addEventListener('click', reset); resets.push(reset);
          row.appendChild(lab); if (it.d) row.appendChild(makeInfo(it.d)); row.appendChild(rb);
          grid.appendChild(row);
        } else {
          const row = document.createElement('div'); row.className = 'lab-row';
          const head = document.createElement('div'); head.className = 'lab-lab';
          const name = document.createElement('span'); name.className = 'lab-name'; name.textContent = (it.reseed ? '↻ ' : '') + it.label;
          const right = document.createElement('span'); right.className = 'lab-right';
          const out = document.createElement('output'); out.textContent = (+def).toFixed(it.dec);
          const rb = document.createElement('button'); rb.className = 'lab-reset'; rb.type = 'button'; rb.textContent = '↺'; rb.title = 'Restaurar valor por defecto';
          right.appendChild(out); if (it.d) right.appendChild(makeInfo(it.d)); right.appendChild(rb);
          head.appendChild(name); head.appendChild(right);
          const slider = document.createElement('div'); slider.className = 'lab-slider';
          const inp = document.createElement('input'); inp.type = 'range';
          inp.min = it.min; inp.max = it.max; inp.step = it.step; inp.value = def;
          // Señal de ALTERADO: el pulsador y el rango relleno (accent-color) + el valor se tiñen ROJIZO si está por
          // DEBAJO del valor base, VERDOSO si por ENCIMA, neutro si coincide → de un vistazo se ve qué se ha tocado.
          const paint = () => { const c = Math.abs(+inp.value - def) < 1e-9 ? '' : (+inp.value < def ? '#e0795f' : '#79c47a'); inp.style.accentColor = c; out.style.color = c; };
          inp.addEventListener('input', () => { const v = +inp.value; out.textContent = v.toFixed(it.dec); send({ type: 'set', key: it.k, value: v }); paint(); });
          const notch = document.createElement('span'); notch.className = 'lab-notch'; // muesca = valor por defecto
          notch.style.left = (100 * (def - it.min) / (it.max - it.min)) + '%';
          slider.appendChild(inp); slider.appendChild(notch);
          const reset = () => {
            inp.value = def; out.textContent = (+def).toFixed(it.dec); send({ type: 'set', key: it.k, value: +def }); paint();
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
  // Alternar VISTA SIMPLE ↔ MODO LABORATORIO: añade/quita .advanced al panel (revela la sección del
  // laboratorio y compacta la vista simple). Recuerda el modo entre recargas (localStorage).
  const panel = $('panel'), modeBtn = $('modeBtn');
  const LS_MODE = 'zenote.advanced';
  const applyMode = (adv) => {
    panel.classList.toggle('advanced', adv);
    modeBtn.textContent = adv ? 'Simple' : 'Laboratorio'; // texto corto (el destino del toggle); el title lo explica
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
    // FORMA del mascot vía NODOS: cabeza redonda + un par de "orejas" laterales; resto de nodos ausentes.
    g('n0_present', 1); g('n0_size', 0.55); g('n0_aspect', 0.3); g('n0_osc_amp', 0.55);
    g('n1_present', 0.95); g('n1_size', 0.5); g('n1_aspect', 0.68); g('n1_angle', 0.32); g('n1_attach', 0.7); g('n1_osc_amp', 0.5);
    g('n2_present', 0.9); g('n2_size', 0.42); g('n2_aspect', 0.55); g('n2_angle', 0.6); g('n2_attach', 0.6); g('n2_osc_amp', 0.5);
    for (let k = 3; k < NODE_COUNT; k++) g('n' + k + '_present', 0.1);
    g('e_fov', R(0.32, 0.4)); g('c_eye', R(0.45, 0.55));   // #13: c_app/c_tip retirados
    g('orn', R(0.54, 0.66)); g('c_lum', R(0.66, 0.78)); g('c_sat', R(0.68, 0.8));
    g('o_len', R(0.48, 0.58)); g('o_bulb', R(0.48, 0.58)); g('o_hue', R(0.45, 0.55)); g('o_num', R(0.13, 0.22));
    const ictx = introCanvas.getContext('2d');
    let raf = 0, on = true;
    const loop = () => { if (!on) return; try { app.renderer.drawPortrait(ictx, mascot, performance.now() * 0.001, 0.85, -Math.PI / 2, 0.5, 0.2); } catch (e) {} raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop); // arranca en el primer frame (tras el primer draw) + try/catch → nunca rompe la init
    enterBtn.addEventListener('click', () => { intro.classList.add('hidden'); on = false; cancelAnimationFrame(raf); });
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
