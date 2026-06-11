// Orquestación. El MOTOR corre en un Web Worker; aquí solo se renderiza a partir de las
// "fotos" (snapshots) que envía. `simProxy` imita la interfaz del Sim (mismos campos) para
// que Renderer/Charts/UI funcionen sin cambios grandes, leyendo los datos recibidos.

import { config } from './config.js';
import { Renderer } from './render/canvas.js';
import { Charts } from './ui/charts.js';
import { setupControls, updateInspector } from './ui/controls.js';

// --- Proxy del Sim alimentado por el worker ---
const cap = config.pop.maxAgents;
const identity = new Int32Array(cap);
for (let i = 0; i < cap; i++) identity[i] = i; // lista activa = identidad (foto ya compactada)

const empty = new Float32Array(0);
const simProxy = {
  world: {
    cols: config.resource.gridCols, rows: config.resource.gridRows,
    cellW: config.world.width / config.resource.gridCols,
    cellH: config.world.height / config.resource.gridRows,
    capacity: new Float32Array(config.resource.gridCols * config.resource.gridRows),
    temp: new Float32Array(config.resource.gridCols * config.resource.gridRows),
    resource: new Float32Array(config.resource.gridCols * config.resource.gridRows),
  },
  x: empty, y: empty, radius: empty, hue: empty, diet: empty, eFrac: empty,
  lineage: empty, geneSel: empty, heading: empty, spd: empty, nodes: empty, tint: empty, eye: empty, face: empty, deco: empty,
  species: empty, speciesCount: 0,
  active: identity, activeCount: 0,
  popCount: 0, tick: 0, births: 0, deaths: 0, carn: 0,
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
    simProxy.carn = m.carn; simProxy.histBins = m.hist; simProxy.sel = m.sel;
    simProxy.species = m.species; simProxy.speciesCount = m.speciesCount;
    // Histórico de las gráficas: lo acumula el WORKER (muestreo por ticks reales → correcto a cualquier
    // velocidad). El hilo principal solo lo pinta; ya no reconstruye la serie a partir de fotos por frame.
    charts.history = m.histPop; charts.histC = m.histCarn; charts.histH = m.histHerb; charts.histO = m.histOmni; charts.histV = m.histVeg; charts.histT = m.histTick;
    charts.dCombat = m.histDC; charts.dStarv = m.histDS; charts.dAge = m.histDA; charts.dEaten = m.histDE;
    charts.bSex = m.histBS; charts.bAsex = m.histBA;
    simProxy.world.resource = m.resource;
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
const fpsEl = document.getElementById('fps');
const statEl = document.getElementById('stat');
const speedRealEl = document.getElementById('speedReal');
const panelEl = document.getElementById('panel');         // .advanced ⇒ laboratorio; simple ⇒ vista contemplativa

function frame(now) {
  renderer.paused = !app.running; // congela la animación visual de los organismos al pausar
  // Cámara que SIGUE al organismo seleccionado. Soltar SOLO si el seguido ya se vio y luego
  // desapareció (murió); NO durante la latencia del pick (sel tarda 1-2 frames en llegar del worker).
  if (app.followSel && simProxy.sel) { renderer.camX = simProxy.sel.x; renderer.camY = simProxy.sel.y; app._selSeen = true; }
  else if (app.followSel && app._selSeen && !simProxy.sel) { app.followSel = false; app._selSeen = false; }
  renderer.draw();
  if (simProxy.sel) renderer.highlight(simProxy.sel);
  charts.draw();   // el histórico ya lo acumula el worker (muestreo por ticks); aquí solo se pinta
  updateInspector(app);

  frames++;
  if (now - lastFpsT > 500) {
    const dt = now - lastFpsT;
    fps = Math.round((frames * 1000) / dt);
    tps = Math.round(((simProxy.tick - lastTickCount) * 1000) / dt);
    frames = 0; lastTickCount = simProxy.tick; lastFpsT = now;
    const adv = panelEl.classList.contains('advanced');
    // Vista simple (contemplativa): solo fps · tick · población. El laboratorio mantiene t/s, nacimientos y muertes.
    // La población total va en AZUL (mismo color que tenía la curva total en la gráfica, que ya no se dibuja).
    fpsEl.textContent = adv ? `${fps} FPS · ${tps} t/s` : `${fps} FPS`;
    const pobHtml = `<span style="color:#5a7cd1">pob ${simProxy.popCount}</span>`;
    statEl.innerHTML = adv
      ? `${pobHtml} · tick ${simProxy.tick} · nac ${simProxy.births} · muertes ${simProxy.deaths}`
      : `tick ${simProxy.tick} · ${pobHtml}`;
    const realTpf = fps > 0 ? (tps / fps).toFixed(1) : '0';
    if (speedRealEl) speedRealEl.textContent = `velocidad real: ${tps} ticks/s · ${realTpf} ticks/frame · ${fps} fps`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
