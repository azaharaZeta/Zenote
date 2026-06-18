// Motor del ANDAMIO (M0): estado SoA + spatial hash + bucle de tick. SIN biología — los agentes hacen una
// marcha aleatoria y un escaneo de vecindad (que ejercita el hash, la operación que dominará el coste real).
// Su único fin es PROBAR LA PLATAFORMA: ¿tickea a miles de agentes en tiempo real? (criterio go/no-go de M0,
// retira parte de R2). La física del mundo, el desarrollo, la fisiología y la evolución entran en M4+.

import { State } from './state.js';
import { SpatialHash } from './hash.js';
import { makeRng } from '../util/rng.js';

export class Sim {
  constructor(config) {
    this.config = config;
    this.cap = config.pop.cap;
    this.size = config.world.size;
    this.rng = makeRng(config.pop.seed);
    this.state = new State(this.cap);
    this.hash = new SpatialHash(this.size, config.hash.cell);
    this.hash.setCapacity(this.cap);
    this.tick = 0;
    this.neighborChecks = 0; // instrumentación (coste del escaneo)
  }

  // Siembra `n` agentes en posiciones aleatorias (andamio: sin genoma ni fenotipo).
  seed(n) {
    const s = this.state, rng = this.rng, W = this.size;
    n = Math.min(n, this.cap);
    for (let k = 0; k < n; k++) {
      const i = s.alloc();
      if (i < 0) break;
      s.x[i] = rng.next() * W;
      s.y[i] = rng.next() * W;
      const a = rng.next() * 6.283185307, v = 0.5 + rng.next() * 0.5;
      s.vx[i] = Math.cos(a) * v;
      s.vy[i] = Math.sin(a) * v;
    }
  }

  step() {
    const s = this.state, H = this.hash, rng = this.rng, W = this.size;
    const cell = H.cell, cols = H.cols, rows = H.rows;
    const scanR = this.config.scan.radius, scan2 = scanR * scanR;
    const sr = Math.max(1, Math.ceil(scanR / cell)); // celdas a barrer a cada lado

    // 1) Reconstruir lista activa + hash (O(n), sin asignaciones).
    s.rebuildActive();
    H.clear();
    const act = s.active, n = s.activeCount;
    for (let a = 0; a < n; a++) { const i = act[a]; H.insert(i, s.x[i], s.y[i]); }

    const x = s.x, y = s.y, vx = s.vx, vy = s.vy;
    let checks = 0;

    for (let a = 0; a < n; a++) {
      const i = act[a];

      // 2) Escaneo de vecindad TOROIDAL (ejercita el hash; es el patrón del coste real). Solo cuenta, no actúa.
      let hx = (x[i] / cell) | 0, hy = (y[i] / cell) | 0;
      let neighbors = 0;
      for (let oy = -sr; oy <= sr; oy++) {
        const gy = ((hy + oy) % rows + rows) % rows, rowBase = gy * cols;
        for (let ox = -sr; ox <= sr; ox++) {
          const gx = ((hx + ox) % cols + cols) % cols;
          let j = H.head[rowBase + gx];
          while (j !== -1) {
            if (j !== i) {
              let ddx = x[j] - x[i], ddy = y[j] - y[i];
              if (ddx > W * 0.5) ddx -= W; else if (ddx < -W * 0.5) ddx += W; // imagen mínima (toro)
              if (ddy > W * 0.5) ddy -= W; else if (ddy < -W * 0.5) ddy += W;
              if (ddx * ddx + ddy * ddy < scan2) neighbors++;
              checks++;
            }
            j = H.next[j];
          }
        }
      }

      // 3) Movimiento: marcha aleatoria (jitter de velocidad + integración + envoltura toroidal).
      vx[i] += (rng.next() - 0.5) * 0.2;
      vy[i] += (rng.next() - 0.5) * 0.2;
      let nx = x[i] + vx[i], ny = y[i] + vy[i];
      if (nx < 0) nx += W; else if (nx >= W) nx -= W;
      if (ny < 0) ny += W; else if (ny >= W) ny -= W;
      x[i] = nx; y[i] = ny;
    }

    this.neighborChecks = checks;
    this.tick++;
  }
}
