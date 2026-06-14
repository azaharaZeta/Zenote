// Orquestación. El MOTOR corre en un Web Worker; aquí solo se renderiza a partir de las
// "fotos" (snapshots) que envía. `simProxy` imita la interfaz del Sim (mismos campos) para
// que Renderer/Charts/UI funcionen sin cambios grandes, leyendo los datos recibidos.

import { config } from './config.js';
import { Renderer } from './render/canvas.js';
import { Charts } from './ui/charts.js';
import { setupControls, updateInspector } from './ui/controls.js';

// --- Proxy del Sim alimentado por el worker ---
// `identity` (lista activa = índice; la foto ya viene compactada 0..n-1) debe cubrir el MÁXIMO de población que el
// slider del lab permita: `pop.maxAgents` es ajustable en vivo (+ Reiniciar). Se SOBREDIMENSIONA a un tope generoso
// (independiente de maxAgents) para no re-asignarlo al cambiar el tope → siempre activeCount ≤ identity.length.
const IDENT_CAP = Math.max(3000, config.pop.maxAgents);
const identity = new Int32Array(IDENT_CAP);
for (let i = 0; i < IDENT_CAP; i++) identity[i] = i;

const empty = new Float32Array(0);
const simProxy = {
  world: {
    cols: config.resource.gridCols, rows: config.resource.gridRows,
    cellW: config.world.size / config.resource.gridCols,
    cellH: config.world.size / config.resource.gridRows,
    capacity: new Float32Array(config.resource.gridCols * config.resource.gridRows),
    temp: new Float32Array(config.resource.gridCols * config.resource.gridRows),
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

let tps = 0;
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'world') {
    const w = simProxy.world;
    w.cols = m.cols; w.rows = m.rows; w.cellW = m.cellW; w.cellH = m.cellH;
    w.capacity = m.capacity; w.temp = m.temp;
    renderer._gz = NaN;           // forzar re-render del sustrato
  } else if (m.type === 'frame') {
    simProxy.x = m.x; simProxy.y = m.y; simProxy.radius = m.radius;
    simProxy.hue = m.hue; simProxy.diet = m.diet; simProxy.eFrac = m.eFrac;
    simProxy.lineage = m.lineage; simProxy.geneSel = m.geneSel;
    simProxy.heading = m.heading; simProxy.spd = m.spd; simProxy.tint = m.tint; simProxy.eye = m.eye; simProxy.face = m.face; simProxy.deco = m.deco; simProxy.nodes = m.nodes;
    simProxy.activeCount = m.n; simProxy.popCount = m.pop;
    simProxy.tick = m.tick; simProxy.births = m.births; simProxy.deaths = m.deaths;
    simProxy.carn = m.carn; simProxy.histBins = m.hist; simProxy.sel = m.sel; simProxy.N = m.N;
    simProxy.species = m.species; simProxy.role = m.role; simProxy.speciesCount = m.speciesCount; simProxy.serial = m.serial;
    // Histórico de las gráficas: lo acumula el WORKER (muestreo por ticks reales → correcto a cualquier
    // velocidad). El hilo principal solo lo pinta; ya no reconstruye la serie a partir de fotos por frame.
    charts.history = m.histPop; charts.histC = m.histCarn; charts.histScav = m.histScav; charts.histH = m.histHerb; charts.histO = m.histOmni; charts.histVegFill = m.histVegFill; charts.histT = m.histTick;
    charts.dCombat = m.histDC; charts.dStarv = m.histDS; charts.dAge = m.histDA; charts.dEaten = m.histDE;
    charts.bSex = m.histBS; charts.bAsex = m.histBA;
    charts.histN = m.histN; charts.histVegMass = m.histVegMass; charts.histBio = m.histBio; charts.histCarrion = m.histCarrion;   // pools de materia → curva de biomasa
    simProxy.world.resource = m.resource;
    simProxy.world.carrion = m.carrion;
    simProxy.world.nutrient = m.nutrient;
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
// DIBUJADO BAJO DEMANDA (A) + CAP DE FPS (B). Entre ticks, posiciones y animación NO avanzan (la animación usa
// _animT, que solo crece con el delta de ticks) → un frame redibujado sin tick nuevo es IDÉNTICO: redibujarlo es
// desperdicio (pantallas a 120 Hz, o velocidad máxima donde los datos cambian ~4/s). Redibujamos solo si cambió el
// tick, la cámara (pan/zoom/seguir) o la selección, y nunca más de `render.maxFPS` veces/s. El motor (t/s) es ajeno.
let lastDrawTick = -1, lastCamX = NaN, lastCamY = NaN, lastZoom = NaN, lastSelKey = '', lastDrawT = 0;
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
    if (simProxy.tick !== lastDrawTick || renderer.camX !== lastCamX || renderer.camY !== lastCamY || renderer.zoom !== lastZoom || selKey !== lastSelKey) {
      renderer.draw();
      if (simProxy.sel) renderer.highlight(simProxy.sel);
      charts.draw();   // el histórico ya lo acumula el worker (muestreo por ticks); aquí solo se pinta
      updateInspector(app);
      if (renderer.colorMode === 'role' && app.refreshLegend) app.refreshLegend(); // banda del rol ponderada por totales (viva)
      lastDrawTick = simProxy.tick; lastCamX = renderer.camX; lastCamY = renderer.camY; lastZoom = renderer.zoom; lastSelKey = selKey;
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
    // En PECERA CERRADA se muestra también el nutriente libre (gris, igual que en la gráfica de biomasa). pob en azul; tick en su span (oculto en simple).
    const nutr = app.cfg.world.closedMatter ? `<span style="color:#a0a4ac"> · nutriente ${pad(Math.round(simProxy.N), 5)}</span>` : '';
    statEl.innerHTML = `<span style="color:#5a7cd1">pob ${pad(simProxy.popCount, 4)}</span>${nutr}<span class="r-tick"> · tick ${pad(simProxy.tick, 6)}</span>`;
    const realTpf = fps > 0 ? (tps / fps).toFixed(1) : '0';
    if (speedRealEl) speedRealEl.textContent = `velocidad real: ${tps} ticks/s · ${realTpf} ticks/frame · ${fps} fps`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
