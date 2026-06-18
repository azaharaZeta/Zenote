// M5.5 — PRIMER RENDER (R6). Canvas 2D: el mundo (campo de luz como sustrato) + los organismos dibujados desde su
// GRAFO DE PARTES (genoma→develop, cacheado en sim.body) coloreado por TEJIDO. Motor en el hilo principal de momento
// (el Web Worker es M5.6). Estética de cenote: fondo oscuro, organismos como pequeñas formas suaves.

import { World, WORLD_P } from './engine/world.js';
import { Sim } from './engine/sim.js';
import { TISSUE } from './engine/genome.js';

const SIZE = 1500;
const world = new World(SIZE, (Math.random() * 1e9) | 0, { ...WORLD_P, lightBase: 2.5 });
world.nutrient.fill(1.5);
const sim = new Sim(world, { seed: (Math.random() * 1e9) | 0, cap: 12000 });
sim.seed(800);

const canvas = document.getElementById('world'), ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
let cw = 0, ch = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
function resize() { cw = canvas.clientWidth; ch = canvas.clientHeight; canvas.width = cw * dpr; canvas.height = ch * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
window.addEventListener('resize', resize); resize();

// Cámara: ventana de ~620u centrada (suficiente para ver los CUERPOS, no solo puntos).
const VIEW = 620, camX = SIZE / 2, camY = SIZE / 2;
const scale = () => Math.min(cw, ch) / VIEW;

const TCOL = { [TISSUE.STRUCTURE]: '#5a6b7a', [TISSUE.PHOTO]: '#3fb98f', [TISSUE.MUSCLE]: '#e0664d', [TISSUE.MOUTH]: '#e0a84a' };

function draw() {
  const sc = scale(), ox = cw / 2 - camX * sc, oy = ch / 2 - camY * sc;
  // fondo
  ctx.fillStyle = '#05080d'; ctx.fillRect(0, 0, cw, ch);
  // sustrato: campo de LUZ (celdas visibles) — tenue, da textura espacial al cenote
  const W = world, cell = W.cellW, c0x = Math.max(0, ((camX - VIEW / 2) / cell) | 0), c1x = Math.min(W.cols - 1, ((camX + VIEW / 2) / cell) | 0);
  const c0y = Math.max(0, ((camY - VIEW / 2) / cell) | 0), c1y = Math.min(W.rows - 1, ((camY + VIEW / 2) / cell) | 0);
  for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
    const L = W.light0[cy * W.cols + cx] / W.P.lightBase;   // 0..1 (luz relativa)
    const b = (8 + L * 14) | 0; ctx.fillStyle = `rgb(${b - 2},${b + 4},${b + 10})`;
    ctx.fillRect(ox + cx * cell * sc, oy + cy * cell * sc, cell * sc + 1, cell * sc + 1);
  }
  // organismos: cada parte del cuerpo desarrollado, coloreada por tejido
  const s = sim, x = s.x, y = s.y, vx = s.vx, vy = s.vy; let drawn = 0;
  for (let i = 0; i < s.cap; i++) {
    if (!s.alive[i]) continue;
    const wx = x[i], wy = y[i];
    if (wx < camX - VIEW / 2 - 20 || wx > camX + VIEW / 2 + 20 || wy < camY - VIEW / 2 - 20 || wy > camY + VIEW / 2 + 20) continue;
    const body = s.body[i]; if (!body) continue;
    const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]); const h = sp > 1e-3 ? Math.atan2(vy[i], vx[i]) : 0;
    const ch_ = Math.cos(h), sh = Math.sin(h);
    for (let k = body.length - 1; k >= 0; k--) {   // de la cola a la cabeza (cabeza encima)
      const p = body[k];
      const rx = p.x * ch_ - p.y * sh, ry = p.x * sh + p.y * ch_;
      const px = ox + (wx + rx) * sc, py = oy + (wy + ry) * sc, pr = Math.max(1, p.r * sc);
      ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.283);
      ctx.fillStyle = TCOL[p.tissue] || '#5a6b7a'; ctx.fill();
    }
    drawn++;
  }
  hud.textContent = `Zenote 2 · M5.5 — tick ${s.tick} · pop ${s.pop()} · vista ${drawn}`;
}

let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  acc += dt * 30;                       // ~30 ticks/s de simulación
  let steps = 0; while (acc >= 1 && steps < 4) { sim.step(); acc -= 1; steps++; }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__sim = sim; window.__world = world;   // sonda de depuración
