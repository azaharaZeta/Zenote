// El mundo: campo de recurso escalar de baja resolución + spatial hash de vecindad.
// Coordenadas siempre lógicas (config.world). El render no entra aquí.

export class World {
  constructor(cfg, rng) {
    this.cfg = cfg;
    this.rng = rng;
    const r = cfg.resource;
    this.cols = r.gridCols;
    this.rows = r.gridRows;
    this.cellW = cfg.world.width / this.cols;
    this.cellH = cfg.world.height / this.rows;

    // Campo de recurso (unidades normalizadas [0, R_max]).
    this.resource = new Float32Array(this.cols * this.rows);
    // Snapshot del recurso del tick anterior: lo usa regen() para leer vecinos sin orden-dependencia
    // (rebrote emergente con difusión de semilla). Reutilizable, sin GC en el bucle.
    this._resPrev = new Float32Array(this.cols * this.rows);
    // Capacidad por celda: gradiente espacial FIJO que crea nichos (más rico = más R_max local).
    this.capacity = new Float32Array(this.cols * this.rows);
    this._buildGradient();
    // Arranca lleno a su capacidad local.
    this.resource.set(this.capacity);

    // Máscara de REFUGIO (1 = celda-refugio, presa no cazable ahí). Las celdas de MAYOR vegetación
    // (cobertura densa) → reutiliza el campo de capacidad. Reconstruido en cada reset (mundo nuevo).
    this.refuge = new Uint8Array(this.cols * this.rows);
    this._buildRefuge();

    // Campo de "color de la luz" del ambiente: pocas regiones grandes de tono fijo.
    // FÍSICA del mundo: define qué color de pigmento rinde en cada zona. La evolución
    // decide el tono de los organismos; el programador solo pone el paisaje lumínico.
    this.lightHue = new Float32Array(this.cols * this.rows);
    this._buildField(this.lightHue, 3);

    // Campo de "temperatura" [0,1] por celda (frío→cálido), segundo eje ambiental
    // independiente de la luz. El gen temp_pref se adapta a él (coste por desviarse).
    this.temp = new Float32Array(this.cols * this.rows);
    this._buildField(this.temp, cfg.resource.tempFreq); // zonas grandes → especializarse rinde

    // ---- Spatial hash uniforme: celda = mayor radio de visión posible ----
    this.hashCell = cfg.expr.sense.max; // 80px
    this.hCols = Math.ceil(cfg.world.width / this.hashCell);
    this.hRows = Math.ceil(cfg.world.height / this.hashCell);
    this.cellHead = new Int32Array(this.hCols * this.hRows).fill(-1);
    this.cellNext = null; // se dimensiona con el pool (setCapacity)
  }

  setCapacity(maxAgents) {
    this.cellNext = new Int32Array(maxAgents);
  }

  // Refugio = las celdas con MÁS capacidad (vegetación densa = cobertura). Umbral por percentil → exactamente
  // `frac` del mundo es refugio. Si la capacidad es casi uniforme (gradiente 'uniform'), usa un campo de ruido
  // de baja frecuencia para repartir parches-refugio. Patchy → la presa tiene cobertura distribuida (Huffaker).
  _buildRefuge() {
    const rf = this.cfg.refuge;
    this.refuge.fill(0);
    if (!rf || !rf.enabled || rf.frac <= 0) return;
    const n = this.capacity.length, frac = Math.min(0.9, rf.frac);
    const sorted = Float32Array.from(this.capacity).sort();
    if (sorted[n - 1] - sorted[0] < 1e-4) {                 // capacidad uniforme → refugio por ruido
      const noise = new Float32Array(n); this._buildField(noise, 5);
      const s2 = Float32Array.from(noise).sort();
      const t2 = s2[Math.floor((1 - frac) * n)];
      for (let i = 0; i < n; i++) this.refuge[i] = noise[i] >= t2 ? 1 : 0;
      return;
    }
    const thr = sorted[Math.floor((1 - frac) * n)];
    for (let i = 0; i < n; i++) this.refuge[i] = this.capacity[i] >= thr ? 1 : 0;
  }

  // Gradiente de capacidad: 'perlin' (ruido fractal barato), 'center' o 'uniform'.
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
    // 'perlin': suma de octavas de ruido de valor interpolado → manchas ricas/pobres (capacidad de
    // carga FIJA, suelo 0.1·Rmax para que ninguna celda sea baldío permanente). La estructura de PARCHES
    // ya no se esculpe aquí: EMERGE de la dinámica de rebrote (ver regen() y resource.patchiness).
    const noise = this._valueNoiseField();
    const N = cols * rows;
    for (let i = 0; i < N; i++) this.capacity[i] = Rmax * (0.1 + 0.9 * noise[i]);
  }

  // Ruido fractal (varias octavas) PERIÓDICO → la capacidad tesela sin costura en el toro.
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

  // Rellena `out` [0,1] por celda con ruido de valor de baja frecuencia → bandas amplias.
  // PERIÓDICO (los puntos de control envuelven con módulo `freq`) → sin costura en el toro.
  _buildField(out, freq) {
    const { cols, rows, rng } = this;
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
        out[y * cols + x] = top + (bot - top) * ty;
      }
    }
  }

  // Regeneración por tick. `patchiness` (p) controla CÓMO rebrota el pasto, y de ahí EMERGEN los parches:
  //  · p=0  → rebrote LINEAL: cada celda sube R_regen hasta su capacidad (comportamiento clásico, sin parches).
  //  · p>0  → rebrote LOGÍSTICO + DIFUSIÓN DE SEMILLA: una celda crece según la vegetación que YA tiene
  //           (res/cap) MÁS lo que le siembran los vecinos (media de los 4 vecinos / cap). Una calva total
  //           rodeada de calva no rebrota; solo coloniza desde los BORDES de los parches. → las zonas
  //           pastadas tardan en recuperarse y los parches se agotan, se reconquistan y MIGRAN solos
  //           de la interacción pastoreo↔rebrote. Nadie pinta los parches: son un patrón emergente.
  // O(celdas·4); lee del snapshot del tick anterior (_resPrev) para ser independiente del orden de barrido.
  regen() {
    const dr = this.cfg.resource.R_regen;
    const cap = this.capacity, res = this.resource;
    let p = this.cfg.resource.patchiness || 0; if (p > 1) p = 1;
    if (p <= 0) {
      for (let i = 0; i < res.length; i++) {                 // camino rápido: rebrote lineal clásico
        const v = res[i] + dr;
        res[i] = v > cap[i] ? cap[i] : v;
      }
    } else {
      const cols = this.cols, rows = this.rows, prev = this._resPrev;
      prev.set(res);                                          // congela el estado del tick anterior
      for (let y = 0; y < rows; y++) {
        const up = ((y - 1 + rows) % rows) * cols, dn = ((y + 1) % rows) * cols, row = y * cols;
        for (let x = 0; x < cols; x++) {
          const i = row + x, c = cap[i], r = prev[i];
          const head = c - r;                                 // sitio que queda hasta la capacidad
          if (head <= 0) { res[i] = r > c ? c : r; continue; }
          const xl = (x - 1 + cols) % cols, xr = (x + 1) % cols;
          const meanNb = (prev[row + xl] + prev[row + xr] + prev[up + x] + prev[dn + x]) * 0.25;
          // Rebrote logístico (necesita biomasa local) + colonización desde vecinos (ambos ∝ cap) + un
          // SUELO de semilla espontánea (0.04) que da a una calva total aislada un rebrote lentísimo →
          // evita el estado absorbente (vegetación global a cero del que nunca se sale). Banco de semillas.
          let logGrow = dr * (0.04 + r / c + meanNb / c); if (logGrow > head) logGrow = head;
          let linGrow = dr < head ? dr : head;                // el clásico (para mezclar según p)
          res[i] = r + (1 - p) * linGrow + p * logGrow;
        }
      }
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
}

function smooth(t) { return t * t * (3 - 2 * t); }
