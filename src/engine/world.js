// El mundo: campos escalares en rejilla de baja resolución (recurso, carroña, nutriente, temperatura) + spatial
// hash de vecindad. Coordenadas siempre lógicas (config.world). El render no entra aquí.

export class World {
  constructor(cfg, rng, aScale = 1) {
    this.cfg = cfg;
    this.rng = rng;
    // Rejilla ∝ √área: el nº de celdas escala con el área, pero el tamaño de celda se mantiene constante.
    const r = cfg.resource, lScale = Math.sqrt(aScale);
    this.cols = Math.max(4, Math.round(r.gridCols * lScale));
    this.rows = Math.max(4, Math.round(r.gridRows * lScale));
    this.cellW = cfg.world.size / this.cols;
    this.cellH = cfg.world.size / this.rows;

    this.resource = new Float32Array(this.cols * this.rows);   // campo de recurso/pasto [0, R_max]
    this._resPrev = new Float32Array(this.cols * this.rows);   // snapshot del tick previo (regen orden-independiente)
    this.carrion = new Float32Array(this.cols * this.rows);    // carroña por celda (energía); se deposita al morir, decae cada tick
    // Pecera: campo espacial de nutriente libre. Las plantas lo captan localmente (regen); lo alimentan
    // metabolismo/muerte; difunde despacio; Σ del campo = pool global (conserva).
    this.N = new Float32Array(this.cols * this.rows);
    this._nPrev = new Float32Array(this.cols * this.rows);     // scratch de difusión del nutriente
    this._grow = new Float32Array(this.cols * this.rows);      // scratch del rebrote cerrado
    this.capacity = new Float32Array(this.cols * this.rows);   // capacidad de carga por celda (gradiente fijo)
    this._buildGradient();
    this.resource.set(this.capacity);                          // arranca lleno

    // Spatial hash uniforme (lista enlazada): celda = mayor radio de visión posible.
    this.hashCell = cfg.expr.sense.max; // 80px
    this.hCols = Math.ceil(cfg.world.size / this.hashCell);
    this.hRows = Math.ceil(cfg.world.size / this.hashCell);
    this.cellHead = new Int32Array(this.hCols * this.hRows).fill(-1);
    this.cellNext = null; // se dimensiona con el pool (setCapacity)
  }

  setCapacity(cap) {
    this.cellNext = new Int32Array(cap);
  }

  // Gradiente de capacidad de carga: 'perlin' (ruido fractal) | 'center' | 'uniform'.
  _buildGradient() {
    const { cols, rows } = this;
    const mode = this.cfg.resource.gradient;
    const Rmax = this.cfg.resource.R_max;
    if (mode === 'uniform') {
      this.capacity.fill(Rmax);
      return;
    }
    if (mode === 'center') {
      const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
      const maxd = Math.hypot(cx, cy);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const d = Math.hypot(x - cx, y - cy) / maxd;
          this.capacity[y * cols + x] = Rmax * (0.15 + 0.85 * (1 - d));
        }
      return;
    }
    // 'perlin': manchas ricas/pobres con suelo capFloor (ningún baldío permanente). Los parches dinámicos emergen del rebrote.
    const noise = this._valueNoiseField();
    const N = cols * rows, capFloor = this.cfg.resource.capFloor;
    for (let i = 0; i < N; i++) this.capacity[i] = Rmax * (capFloor + (1 - capFloor) * noise[i]);
  }

  // Ruido fractal (4 octavas) PERIÓDICO → tesela sin costura en el toro.
  _valueNoiseField() {
    const { cols, rows, rng } = this;
    const out = new Float32Array(cols * rows);
    let amp = 1, totalAmp = 0;
    for (let oct = 0; oct < 4; oct++) {
      const freq = 2 + oct * 3;           // celdas de control crecientes
      const grid = new Float32Array(freq * freq);
      for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
      for (let y = 0; y < rows; y++) {
        const fy = (y / rows) * freq, y0 = Math.floor(fy), ty = smooth(fy - y0);
        const y0m = y0 % freq, y1m = (y0 + 1) % freq;
        for (let x = 0; x < cols; x++) {
          const fx = (x / cols) * freq, x0 = Math.floor(fx), tx = smooth(fx - x0);
          const x0m = x0 % freq, x1m = (x0 + 1) % freq;
          const a = grid[y0m * freq + x0m], b = grid[y0m * freq + x1m];
          const c = grid[y1m * freq + x0m], d = grid[y1m * freq + x1m];
          const top = a + (b - a) * tx, bot = c + (d - c) * tx;
          out[y * cols + x] += (top + (bot - top) * ty) * amp;
        }
      }
      totalAmp += amp;
      amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= totalAmp;
    return out;
  }

  // Regeneración del pasto por tick (pecera). Las plantas crecen CONSUMIENDO nutriente libre N (el sol solo
  // convierte N→pasto). `patchiness` (p): 0 = rebrote lineal (sin parches); p>0 = logístico + difusión de semilla →
  // los parches emergen y migran del pastoreo↔rebrote. Dos pasadas: (A) incremento deseado por celda; (B) si N no
  // llega, escala esa celda. Conserva. Lee snapshot (orden-independiente).
  regen() {
    const dr = this.cfg.world.closedRegen, epu = this.cfg.resource.energyPerUnit, seedFloor = this.cfg.resource.seedFloor;
    const cap = this.capacity, res = this.resource, grow = this._grow;
    let p = this.cfg.resource.patchiness || 0; if (p > 1) p = 1;
    const cols = this.cols, rows = this.rows;
    let need = 0;
    if (p <= 0) {                                            // incremento lineal por celda
      for (let i = 0; i < res.length; i++) { let inc = cap[i] - res[i]; if (inc > dr) inc = dr; if (inc < 0) inc = 0; grow[i] = inc; need += inc; }
    } else {                                                 // logístico + difusión de semilla
      const prev = this._resPrev; prev.set(res);
      for (let y = 0; y < rows; y++) {
        const up = ((y - 1 + rows) % rows) * cols, dn = ((y + 1) % rows) * cols, row = y * cols;
        for (let x = 0; x < cols; x++) {
          const i = row + x, c = cap[i], r = prev[i], head = c - r;
          if (head <= 0) { grow[i] = 0; continue; }
          const xl = (x - 1 + cols) % cols, xr = (x + 1) % cols;
          const meanNb = (prev[row + xl] + prev[row + xr] + prev[up + x] + prev[dn + x]) * 0.25;
          let logGrow = dr * (seedFloor + r / c + meanNb / c); if (logGrow > head) logGrow = head;
          const linGrow = dr < head ? dr : head;
          let inc = (1 - p) * linGrow + p * logGrow; if (inc < 0) inc = 0;
          grow[i] = inc; need += inc;
        }
      }
    }
    if (need <= 0) return;
    // Cada celda capta de su nutriente local N[i] → el pasto crece donde hay nutriente. Conserva: N[i] → res[i]·epu.
    const N = this.N;
    for (let i = 0; i < res.length; i++) {
      let g = grow[i]; if (g <= 0) continue;
      let want = g * epu;
      if (want > N[i]) { want = N[i] > 0 ? N[i] : 0; g = want / epu; } // N local insuficiente → escala esta celda
      if (g <= 0) continue;
      res[i] += g; N[i] -= want;
    }
  }

  // Decaimiento de la carroña por tick (pecera): mineraliza íntegra a N local (cierra el ciclo).
  decayCarrion() {
    const cd = this.cfg.resource.carrionDecay || 0; if (cd <= 0) return;
    const carrion = this.carrion;
    for (let i = 0; i < carrion.length; i++) {
      const cv = carrion[i]; if (cv <= 0) continue;
      const d = cv * cd; carrion[i] = cv - d;                        // energía que se descompone este tick
      this.N[i] += d;                                                // mineraliza a nutriente local (conserva)
    }
  }

  cellIndexAt(x, y) {
    let cx = (x / this.cellW) | 0;
    let cy = (y / this.cellH) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  // ---- Spatial hash: reconstruir cada tick (O(n), sin asignaciones) ----
  hashClear() { this.cellHead.fill(-1); }

  hashInsert(i, x, y) {
    let cx = (x / this.hashCell) | 0;
    let cy = (y / this.hashCell) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.hCols) cx = this.hCols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.hRows) cy = this.hRows - 1;
    const c = cy * this.hCols + cx;
    this.cellNext[i] = this.cellHead[c];
    this.cellHead[c] = i;
  }

  // Difusión lenta del nutriente libre hacia los 4 vecinos (toro). Conservativa (Σ N constante); lee snapshot.
  diffuseNutrient() {
    const rate = this.cfg.world.nutrientDiffuse; if (!rate || rate <= 0) return;
    const N = this.N, prev = this._nPrev, cols = this.cols, rows = this.rows;
    prev.set(N);
    for (let y = 0; y < rows; y++) {
      const up = ((y - 1 + rows) % rows) * cols, dn = ((y + 1) % rows) * cols, row = y * cols;
      for (let x = 0; x < cols; x++) {
        const i = row + x, xl = (x - 1 + cols) % cols, xr = (x + 1) % cols;
        const mean4 = (prev[row + xl] + prev[row + xr] + prev[up + x] + prev[dn + x]) * 0.25;
        N[i] = prev[i] + rate * (mean4 - prev[i]);
      }
    }
  }

  totalN() { let s = 0; const N = this.N; for (let i = 0; i < N.length; i++) s += N[i]; return s; } // pool global = Σ campo

  // Σ del nutriente del vecindario (2R+1)² centrado en `cell` (toro). El nacimiento reúne materia de la zona del progenitor.
  nutrientAround(cell, R) {
    const cols = this.cols, rows = this.rows, cx = cell % cols, cy = (cell / cols) | 0; let s = 0;
    for (let dy = -R; dy <= R; dy++) { const yy = ((cy + dy) % rows + rows) % rows;
      for (let dx = -R; dx <= R; dx++) { const xx = ((cx + dx) % cols + cols) % cols; s += this.N[yy * cols + xx]; } }
    return s;
  }
  // Retira `amount` del vecindario (2R+1)², proporcional al N de cada celda (conserva). Asume amount ≤ nutrientAround.
  takeNutrientAround(cell, R, amount) {
    const total = this.nutrientAround(cell, R); if (total <= 0) return;
    const f = amount / total, cols = this.cols, rows = this.rows, cx = cell % cols, cy = (cell / cols) | 0;
    for (let dy = -R; dy <= R; dy++) { const yy = ((cy + dy) % rows + rows) % rows;
      for (let dx = -R; dx <= R; dx++) { const idx = yy * cols + ((cx + dx) % cols + cols) % cols; this.N[idx] -= this.N[idx] * f; } }
  }
}

function smooth(t) { return t * t * (3 - 2 * t); }
