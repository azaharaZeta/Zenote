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
    lightHue: new Float32Array(config.resource.gridCols * config.resource.gridRows),
    resource: new Float32Array(config.resource.gridCols * config.resource.gridRows),
  },
  x: empty, y: empty, radius: empty, hue: empty, diet: empty, eFrac: empty,
  lineage: empty, geneSel: empty, heading: empty, spd: empty, morph: empty, tint: empty, eye: empty, face: empty, deco: empty,
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
    w.capacity = m.capacity; w.temp = m.temp; w.lightHue = m.lightHue;
    renderer._tempWorld = null;   // forzar recolor del mapa térmico
    renderer._gz = NaN;           // forzar re-render de hierba
  } else if (m.type === 'frame') {
    simProxy.x = m.x; simProxy.y = m.y; simProxy.radius = m.radius;
    simProxy.hue = m.hue; simProxy.diet = m.diet; simProxy.eFrac = m.eFrac;
    simProxy.lineage = m.lineage; simProxy.geneSel = m.geneSel;
    simProxy.heading = m.heading; simProxy.spd = m.spd; simProxy.morph = m.morph; simProxy.tint = m.tint; simProxy.eye = m.eye; simProxy.face = m.face; simProxy.deco = m.deco;
    simProxy.activeCount = m.n; simProxy.popCount = m.pop;
    simProxy.tick = m.tick; simProxy.births = m.births; simProxy.deaths = m.deaths;
    simProxy.carn = m.carn; simProxy.histBins = m.hist; simProxy.sel = m.sel;
    simProxy.species = m.species; simProxy.speciesCount = m.speciesCount;
    simProxy.huntable = m.huntable; simProxy.huntCarn = m.huntCarn; simProxy.huntHerb = m.huntHerb; simProxy.autopsy = m.autopsy;
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
let lastRecordTick = 0;                 // último tick muestreado para la gráfica
const TICKS_PER_SAMPLE = 8;             // una muestra cada N ticks de SIMULACIÓN → eje X acoplado a la velocidad
const fpsEl = document.getElementById('fps');
const statEl = document.getElementById('stat');
const speedRealEl = document.getElementById('speedReal');
const predDiagEl = document.getElementById('predDiag');   // medidor de cazabilidad de presa
const autopsyEl = document.getElementById('autopsy');     // aviso de autopsia al extinguirse los carnívoros

function frame(now) {
  renderer.paused = !app.running; // congela la animación visual de los organismos al pausar
  // Cámara que SIGUE al organismo seleccionado. Soltar SOLO si el seguido ya se vio y luego
  // desapareció (murió); NO durante la latencia del pick (sel tarda 1-2 frames en llegar del worker).
  if (app.followSel && simProxy.sel) { renderer.camX = simProxy.sel.x; renderer.camY = simProxy.sel.y; app._selSeen = true; }
  else if (app.followSel && app._selSeen && !simProxy.sel) { app.followSel = false; app._selSeen = false; }
  renderer.draw();
  if (simProxy.sel) renderer.highlight(simProxy.sel);
  // Muestreo de la gráfica por TICKS de simulación (no por frames de reloj) → la curva avanza al ritmo de la
  // simulación, igual a cualquier velocidad. Si el tick retrocede (Sembrar reinicia a 0), rearranca el contador.
  if (simProxy.tick < lastRecordTick) { lastRecordTick = simProxy.tick; charts.clear(); }
  if (simProxy.tick - lastRecordTick >= TICKS_PER_SAMPLE) { charts.record(simProxy.tick); lastRecordTick = simProxy.tick; }
  charts.draw();
  updateInspector(app);

  frames++;
  if (now - lastFpsT > 500) {
    const dt = now - lastFpsT;
    fps = Math.round((frames * 1000) / dt);
    tps = Math.round(((simProxy.tick - lastTickCount) * 1000) / dt);
    frames = 0; lastTickCount = simProxy.tick; lastFpsT = now;
    fpsEl.textContent = `${fps} FPS · ${tps} t/s`;
    statEl.textContent =
      `pob ${simProxy.popCount} · tick ${simProxy.tick} · nac ${simProxy.births} · muertes ${simProxy.deaths}`;
    const realTpf = fps > 0 ? (tps / fps).toFixed(1) : '0';
    if (speedRealEl) speedRealEl.textContent = `velocidad real: ${tps} ticks/s · ${realTpf} ticks/frame · ${fps} fps`;
    // Diagnóstico de depredación: cazabilidad de presa (causa raíz) + autopsia de extinción carnívora.
    if (predDiagEl) {
      const h = simProxy.huntable;
      if (h == null || h < 0) { predDiagEl.className = 'pred-diag'; predDiagEl.innerHTML = ''; }
      else {
        const pct = Math.round(h * 100), col = `hsl(${(h * 120) | 0},70%,55%)`;
        predDiagEl.className = 'pred-diag on';
        predDiagEl.innerHTML = `cazabilidad de presa <span class="pd-bar"><i style="width:${pct}%;background:${col}"></i></span> <b style="color:${col}">${pct}%</b>`;
      }
    }
    if (autopsyEl) {
      const a = simProxy.autopsy;
      if (a) { autopsyEl.className = 'autopsy on'; autopsyEl.innerHTML = `⚠ Carnívoros extintos (tick ${a.tick}) · ${a.herbN} herbívoros, ${a.huntable >= 0 ? Math.round(a.huntable * 100) + '% cazable' : '—'} → <b>${a.cause}</b>`; }
      else { autopsyEl.className = 'autopsy'; autopsyEl.innerHTML = ''; }
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
