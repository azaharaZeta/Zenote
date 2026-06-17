// Orquestación. El MOTOR corre en un Web Worker; aquí solo se renderiza a partir de las
// "fotos" (snapshots) que envía. `simProxy` imita la interfaz del Sim (mismos campos) para
// que Renderer/Charts/UI funcionen sin cambios grandes, leyendo los datos recibidos.

import { config } from './config.js';
import { Renderer } from './render/canvas.js';
import { Charts } from './ui/charts.js';
import { setupControls, updateInspector } from './ui/controls.js';

// --- Proxy del Sim alimentado por el worker ---
// `identity` (lista activa = índice; la foto ya viene compactada 0..n-1). Parte del tope inicial y CRECE bajo demanda
// hasta el tope REAL del pool del worker (sim.cap), solo al reiniciar (el slider «Tope de población» es ↻, nunca cambia
// en caliente): así no indexa fuera de rango si se sube el tope. No se encoge al bajarlo (inocuo: solo índices i→i).
let identity = new Int32Array(config.pop.maxAgentsCeiling || 3000);
for (let i = 0; i < identity.length; i++) identity[i] = i;

const empty = new Float32Array(0);
const simProxy = {
  world: {
    cols: config.resource.gridCols, rows: config.resource.gridRows,
    cellW: config.world.size / config.resource.gridCols,
    cellH: config.world.size / config.resource.gridRows,
    capacity: new Float32Array(config.resource.gridCols * config.resource.gridRows),
    resource: new Float32Array(config.resource.gridCols * config.resource.gridRows),
    carrion: new Float32Array(config.resource.gridCols * config.resource.gridRows),
    nutrient: new Float32Array(config.resource.gridCols * config.resource.gridRows),
  },
  x: empty, y: empty, radius: empty, hue: empty, diet: empty, eFrac: empty,
  lineage: empty, geneSel: empty, heading: empty, spd: empty, nodes: empty, tint: empty, eye: empty, face: empty, deco: empty,
  species: empty, role: empty, speciesCount: 0,
  active: identity, activeCount: 0,
  popCount: 0, tick: 0, births: 0, deaths: 0, carn: 0, N: 0,
  histBins: new Float32Array(24),
  sel: null,
};

const worker = new Worker(new URL('./engine/worker.js', import.meta.url), { type: 'module' });

const renderer = new Renderer(document.getElementById('world'), simProxy, config);
const charts = new Charts(
  document.getElementById('popChart'),
  document.getElementById('histChart'),
  simProxy,
  document.getElementById('deathChart'),
  document.getElementById('birthChart'),
  document.getElementById('bioChart'),
);

const app = { sim: simProxy, worker, renderer, charts, cfg: config, running: true, maxSpeed: false, followSel: false };
setupControls(app);
window.app = app; // sonda de depuración

// Dibujado BAJO DEMANDA: `pendingDraw` se enciende cuando llega un snapshot del worker (AUNQUE el tick no cambie —en
// PAUSA, al recomputar fenotipos por un slider o tras un reset—) y cuando cambia algo de SOLO-RENDER que no pasa por el
// worker (estética/resolución/calidad/modo de color → app.requestDraw). Sin esto, en pausa esos cambios no se repintaban.
let pendingDraw = true;
app.requestDraw = () => { pendingDraw = true; }; // lo invocan los controles de solo-render (ver controls.js)

// Ping-pong del buffer `nodes` (el campo más grande de cada foto): tras consumir la foto, su buffer se DEVUELVE al worker
// para reutilizarlo → evita reasignar ~320 KB por frame. `prevNodesBuf` = buffer de la foto que ahora mismo tiene el render.
let prevNodesBuf = null;
// Auto-pausa en EXTINCIÓN: `lastPop` rastrea la población de la foto anterior para detectar la TRANSICIÓN a 0.
let lastPop = 0;

let tps = 0;
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'world') {
    const w = simProxy.world;
    w.cols = m.cols; w.rows = m.rows; w.cellW = m.cellW; w.cellH = m.cellH;
    w.capacity = m.capacity;
    // Reinicio: si el tope de población (slider ↻) creció, agranda la lista activa para no indexar fuera de rango
    // (la foto trae hasta `cap` agentes). Solo en el reinicio → nunca en caliente.
    if (m.cap > identity.length) {
      identity = new Int32Array(m.cap);
      for (let i = 0; i < m.cap; i++) identity[i] = i;
      simProxy.active = identity;   // el render lee sim.active cada frame → apuntar al array vigente
    }
    // Si cambió el tamaño del mundo: re-sembrar las capas decorativas (plancton/nieve) y recentrar la cámara.
    if (renderer._tuftSize !== config.world.size) {
      renderer._initTufts();                                   // re-posiciona + re-escala el plancton sobre el nuevo world.size
      renderer._snow = null;                                   // la nieve se re-siembra en el próximo draw sobre el nuevo tamaño
      renderer.camX = renderer.camY = config.world.size / 2;   // recentra la vista en el nuevo mundo
    }
    renderer._gz = NaN;           // forzar re-render del sustrato
    pendingDraw = true;           // el mundo cambió (reset/tamaño) → repintar aunque la sim esté en pausa
  } else if (m.type === 'frame') {
    simProxy.x = m.x; simProxy.y = m.y; simProxy.radius = m.radius;
    simProxy.hue = m.hue; simProxy.diet = m.diet; simProxy.eFrac = m.eFrac;
    simProxy.lineage = m.lineage; simProxy.geneSel = m.geneSel;
    simProxy.heading = m.heading; simProxy.spd = m.spd; simProxy.tint = m.tint; simProxy.eye = m.eye; simProxy.face = m.face; simProxy.deco = m.deco;
    // Devuelve al worker el buffer `nodes` de la foto ANTERIOR para reutilizarlo (ping-pong). Lo detacha, pero simProxy.nodes
    // se reasigna a la foto nueva acto seguido (mismo turno, sin lectura del render en medio → seguro).
    if (prevNodesBuf && prevNodesBuf.byteLength) worker.postMessage({ type: 'returnNodes', buf: prevNodesBuf }, [prevNodesBuf]);
    simProxy.nodes = m.nodes; prevNodesBuf = m.nodes.buffer;
    simProxy.activeCount = m.n; simProxy.popCount = m.pop;
    // Auto-pausa al EXTINGUIRSE: solo en la transición de pop>0 a 0 → no sigue corriendo un mundo vacío. Por ser
    // solo la transición, si el usuario reanuda un mundo ya extinto no se re-pausa (puede mirarlo vacío si quiere).
    if (m.pop === 0 && lastPop > 0 && app.running && app.pause) app.pause();
    lastPop = m.pop;
    simProxy.tick = m.tick; simProxy.births = m.births; simProxy.deaths = m.deaths;
    simProxy.carn = m.carn; simProxy.histBins = m.hist; simProxy.sel = m.sel; simProxy.N = m.N;
    simProxy.species = m.species; simProxy.role = m.role; simProxy.speciesCount = m.speciesCount; simProxy.serial = m.serial;
    // Histórico de las gráficas: lo acumula el worker (muestreo por ticks) y solo lo ADJUNTA cuando hay muestra nueva
    // (cada ~HIST_K ticks); entre medias `m.histPop` viene undefined y conservamos la referencia anterior (evita reclonar).
    if (m.histPop) {
      charts.history = m.histPop; charts.histC = m.histCarn; charts.histScav = m.histScav; charts.histH = m.histHerb; charts.histO = m.histOmni; charts.histVegFill = m.histVegFill; charts.histT = m.histTick;
      charts.dCombat = m.histDC; charts.dStarv = m.histDS; charts.dAge = m.histDA; charts.dEaten = m.histDE;
      charts.bSex = m.histBS; charts.bAsex = m.histBA;
      charts.histN = m.histN; charts.histVegMass = m.histVegMass; charts.histBio = m.histBio; charts.histCarrion = m.histCarrion;   // pools de materia → curva de biomasa
    }
    simProxy.world.resource = m.resource;
    simProxy.world.carrion = m.carrion;
    simProxy.world.nutrient = m.nutrient;
    pendingDraw = true;           // snapshot nuevo (incluso con el MISMO tick: pausa + slider) → repintar
  }
};

// Responsive
let resizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { renderer.resize(); charts.resize(); }, 120);
});

// --- Bucle de RENDER (solo dibuja; el worker simula) ---
let lastFpsT = performance.now(), frames = 0, fps = 0, lastTickCount = 0;
// Dibujado BAJO DEMANDA + cap de FPS: redibuja si hay un frame/cambio pendiente (pendingDraw), o se movió la cámara o la
// selección, y ≤ render.maxFPS veces/s. (Antes se comparaba el tick → en pausa los cambios de solo-render no repintaban.)
let lastCamX = NaN, lastCamY = NaN, lastZoom = NaN, lastSelKey = '', lastDrawT = 0;
const fpsEl = document.getElementById('fps');
const statEl = document.getElementById('stat');
const speedRealEl = document.getElementById('speedReal');

function frame(now) {
  renderer.paused = !app.running; // congela la animación visual de los organismos al pausar
  // (B) Cap de FPS: no redibujar más de maxFPS veces/s (0 = sin límite). −0.5 ms de holgura por el jitter de rAF.
  const maxFPS = config.render.maxFPS || 0;
  if (!(maxFPS > 0 && now - lastDrawT < 1000 / maxFPS - 0.5)) {
    // Cámara que SIGUE al organismo seleccionado. Soltar SOLO si el seguido ya se vio y luego desapareció (murió).
    if (app.followSel && simProxy.sel) { renderer.camX = simProxy.sel.x; renderer.camY = simProxy.sel.y; app._selSeen = true; }
    else if (app.followSel && app._selSeen && !simProxy.sel) { app.followSel = false; app._selSeen = false; }
    // (A) ¿cambió algo desde el último dibujo? tick nuevo, cámara movida o selección distinta. Si no, NO se redibuja.
    const selKey = simProxy.sel ? (simProxy.sel.lineage + '/' + simProxy.sel.generation) : '';
    if (pendingDraw || renderer.camX !== lastCamX || renderer.camY !== lastCamY || renderer.zoom !== lastZoom || selKey !== lastSelKey) {
      renderer.draw();
      if (simProxy.sel) renderer.highlight(simProxy.sel);
      charts.draw();   // el histórico ya lo acumula el worker (muestreo por ticks); aquí solo se pinta
      updateInspector(app);
      if (renderer.colorMode === 'role' && app.refreshLegend) app.refreshLegend(); // banda del rol ponderada por totales (viva)
      pendingDraw = false; lastCamX = renderer.camX; lastCamY = renderer.camY; lastZoom = renderer.zoom; lastSelKey = selKey;
      lastDrawT = now; frames++;
    }
  }
  if (now - lastFpsT > 500) {
    const dt = now - lastFpsT;
    fps = Math.round((frames * 1000) / dt);   // FPS = DIBUJOS reales/s (bajo demanda): a velocidad normal ≈ t/s; a máx, ~snapshots/s
    tps = Math.round(((simProxy.tick - lastTickCount) * 1000) / dt);
    frames = 0; lastTickCount = simProxy.tick; lastFpsT = now;
    // Readout COMÚN a ambos modos: fps · t/s · población · tick. Ancho FIJO (padStart + monospace) → no "bailan".
    const pad = (v, n) => String(v).padStart(n);
    fpsEl.textContent = `${pad(fps, 3)} FPS · ${pad(tps, 4)} t/s`;
    // Readout: pob (azul) · mundo = TAMAÑO del mundo en unidades (gris) · tick (en su span, oculto en simple). El nutriente libre se ve en la curva de biomasa.
    const wsz = `<span style="color:#8a93a0"> · mundo ${pad(app.cfg.world.size, 4)}</span>`;
    statEl.innerHTML = `<span style="color:#5a7cd1">pob ${pad(simProxy.popCount, 4)}</span>${wsz}<span class="r-tick"> · tick ${pad(simProxy.tick, 6)}</span>`;
    const realTpf = fps > 0 ? (tps / fps).toFixed(1) : '0';
    if (speedRealEl) speedRealEl.textContent = `velocidad real: ${tps} ticks/s · ${realTpf} ticks/frame · ${fps} fps`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
