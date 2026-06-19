// M5.6 — CLIENTE DE RENDER. El MOTOR corre en un Web Worker (engine/worker.js); aquí solo se dibuja a partir de las
// "fotos" (snapshots) que envía. Canvas 2D, estética de cenote: organismos dibujados desde su grafo de partes
// (aplanado en la foto) coloreado por tejido. El render va a su propio ritmo (rAF), independiente del motor.

import { TISSUE } from './engine/genome.js';

const worker = new Worker(new URL('./engine/worker.js', import.meta.url), { type: 'module' });
let WORLD = null, frame = null;
worker.onmessage = (e) => { const m = e.data; if (m.type === 'world') WORLD = m; else if (m.type === 'frame') frame = m; };

const canvas = document.getElementById('world'), ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
let cw = 0, ch = 0; const dpr = Math.min(2, window.devicePixelRatio || 1);
function resize() { cw = canvas.clientWidth; ch = canvas.clientHeight; canvas.width = cw * dpr; canvas.height = ch * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
window.addEventListener('resize', resize); resize();

const VIEW = 620;   // ventana ~620u centrada (se ven los CUERPOS, no solo puntos)
const TCOL = { [TISSUE.STRUCTURE]: '#5a6b7a', [TISSUE.PHOTO]: '#3fb98f', [TISSUE.MUSCLE]: '#e0664d', [TISSUE.MOUTH]: '#e0a84a' };

function draw() {
  ctx.fillStyle = '#05080d'; ctx.fillRect(0, 0, cw, ch);
  if (!WORLD || !frame) return;
  const camX = WORLD.size / 2, camY = WORLD.size / 2, sc = Math.min(cw, ch) / VIEW;
  const ox = cw / 2 - camX * sc, oy = ch / 2 - camY * sc;
  // sustrato: campo de LUZ (celdas visibles), tenue
  const cell = WORLD.cellW, L0 = WORLD.light0, cols = WORLD.cols, rows = WORLD.rows;
  const c0x = Math.max(0, ((camX - VIEW / 2) / cell) | 0), c1x = Math.min(cols - 1, ((camX + VIEW / 2) / cell) | 0);
  const c0y = Math.max(0, ((camY - VIEW / 2) / cell) | 0), c1y = Math.min(rows - 1, ((camY + VIEW / 2) / cell) | 0);
  for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
    const L = L0[cy * cols + cx] / WORLD.lightBase, b = (8 + L * 14) | 0;
    ctx.fillStyle = `rgb(${b - 2},${b + 4},${b + 10})`;
    ctx.fillRect(ox + cx * cell * sc, oy + cy * cell * sc, cell * sc + 1, cell * sc + 1);
  }
  // organismos: desde la foto (posición + heading + partes aplanadas)
  const { n, ax, ay, ah, partOff, partData } = frame; let drawn = 0;
  for (let a = 0; a < n; a++) {
    const wx = ax[a], wy = ay[a];
    if (wx < camX - VIEW / 2 - 20 || wx > camX + VIEW / 2 + 20 || wy < camY - VIEW / 2 - 20 || wy > camY + VIEW / 2 + 20) continue;
    const h = ah[a], chh = Math.cos(h), shh = Math.sin(h), p0 = partOff[a], p1 = partOff[a + 1];
    for (let k = p1 - 1; k >= p0; k--) {   // de la cola a la cabeza
      const lx = partData[k * 4], ly = partData[k * 4 + 1], r = partData[k * 4 + 2], tissue = partData[k * 4 + 3];
      const rx = lx * chh - ly * shh, ry = lx * shh + ly * chh;
      const px = ox + (wx + rx) * sc, py = oy + (wy + ry) * sc, pr = Math.max(1, r * sc);
      ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.283); ctx.fillStyle = TCOL[tissue] || '#5a6b7a'; ctx.fill();
    }
    drawn++;
  }
  hud.textContent = `Zenote 2 · M5.6 (motor en worker) — tick ${frame.tick} · pop ${frame.pop} · vista ${drawn}`;
}

function loop() { draw(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);

// depuración / preview (el rAF se throttlea en preview): forzar avance del motor + dibujar
window.__worker = worker;
window.__burst = (n) => worker.postMessage({ type: 'burst', n: n || 2000 });
window.__draw = draw;
