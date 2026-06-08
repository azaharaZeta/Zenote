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
    // Campo de CARROÑA (energía de cadáveres por celda; alimento de los carnívoros, ver sim.js). Se rellena
    // al morir los organismos y se pudre cada tick. Siempre asignado; la lógica se activa con cfg.carrion.enabled.
    this.carrion = new Float32Array(this.cols * this.rows);
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

    // Campo de "grano" del pasto [0,1] por celda (fino→grueso): TERCER eje ambiental. La eficiencia de pasto
    // depende del ENCAJE entre la talla del herbívoro y el grano local (ver sim.js) → distintas tallas prosperan
    // en distintas zonas (partición del recurso por talla) → nichos de talla herbívora ESTABLES (Propuesta B).
    this.grain = new Float32Array(this.cols * this.rows);
    this._buildField(this.grain, cfg.resource.grainFreq || 3);

    // ---- Spatial hash uniforme: celda = mayor radio de visión posible ----
    this.hashCell = cfg.expr.sense.max; // 80px
    this.hCols = Math.ceil(cfg.world.width / this.hashCell);
    this.hRows = Math.ceil(cfg.world.height / this.hashCell);
    this.cellHead = new Int32Array(this.hCols * this.hRows).fill(-1);
    this.cellNext = null; // se dimensiona con el pool (setCapacity)

    // ---- Spatial hash FINO para colisión/separación (celda ≈ 2·radio_max) ----
    // Separado del de visión (80px): para empujar cuerpos que se TOCAN basta una vecindad pequeña,
    // y celdas finas reducen drásticamente las comprobaciones en multitudes densas (parches de comida),
    // donde el hash grueso amontonaría cientos de agentes por celda. Solo se construye/usa si la
    // separación está activa (ver sim._separate). Mismo patrón toroidal que el hash de visión.
    this.sepCell = cfg.physics.separation.cell;
    this.scCols = Math.ceil(cfg.world.width / this.sepCell);
    this.scRows = Math.ceil(cfg.world.height / this.sepCell);
    this.sepHead = new Int32Array(this.scCols * this.scRows).fill(-1);
    this.sepNext = null; // se dimensiona con el pool (setCapacity)
  }

  setCapacity(maxAgents) {
    this.cellNext = new Int32Array(maxAgents);
    this.sepNext = new Int32Array(maxAgents);
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
    // 'perlin': suma de octavas de ruido de valor interpolado → manchas ricas/pobres.
    // `patchiness` (p) endurece el contraste: umbral (lo) que manda a CERO casi todo + gamma que
    // realza los picos + baja el suelo base → de campo suave (p=0, idéntico a siempre) a PARCHES
    // ricos separados por baldíos sin comida (p alto). Los baldíos no dan gradiente → forzar búsqueda.
    const noise = this._valueNoiseField();
    const N = cols * rows, p = this.cfg.resource.patchiness || 0;
    if (p <= 0) {                                     // suave: idéntico a siempre
      for (let i = 0; i < N; i++) this.capacity[i] = Rmax * (0.1 + 0.9 * noise[i]);
      return;
    }
    // Parcheado: umbrales por PERCENTIL del propio ruido (robusto a cualquier seed). Una fracción
    // `bf` de celdas (la más baja) → BALDÍO sin comida; las altas → PARCHES RICOS; rampa entre medias.
    // Se mezcla con el campo suave según `p` (p alto = baldíos reales sin gradiente que seguir).
    const sorted = Float32Array.from(noise).sort();
    const bf = 0.55 * p;                              // fracción de baldío (crece con p)
    const lo = sorted[Math.min(N - 1, (bf * N) | 0)];
    const hi = sorted[Math.min(N - 1, ((bf + 0.22) * N) | 0)] + 1e-6;
    const base = 0.1 * (1 - p), span = 1 - base;
    for (let i = 0; i < N; i++) {
      let r = (noise[i] - lo) / (hi - lo); r = r < 0 ? 0 : r > 1 ? 1 : r;
      const v = noise[i] * (1 - p) + r * p;           // mezcla suave ↔ parcheado
      this.capacity[i] = Rmax * (base + span * v);
    }
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

  // Regeneración por tick: cada celda sube R_regen hasta su capacidad local.
  regen() {
    const dr = this.cfg.resource.R_regen;
    const cap = this.capacity, res = this.resource;
    for (let i = 0; i < res.length; i++) {
      const v = res[i] + dr;
      res[i] = v > cap[i] ? cap[i] : v;
    }
    // Pudrición de la carroña (la carne se descompone → no se acumula indefinidamente).
    const cc = this.cfg.carrion;
    if (cc && cc.enabled && cc.decay > 0) {
      const keep = 1 - cc.decay, ca = this.carrion;
      for (let i = 0; i < ca.length; i++) if (ca[i] > 0) ca[i] *= keep;
    }
  }

  // Deposita energía de carroña en la celda de (px,py), con tope por celda.
  depositCarrion(px, py, energy) {
    if (energy <= 0) return;
    const cell = this.cellIndexAt(px, py), max = this.cfg.carrion.maxPerCell;
    const v = this.carrion[cell] + energy;
    this.carrion[cell] = v > max ? max : v;
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

  // ---- Hash fino de colisión (mismas reglas que el de visión, otra rejilla) ----
  sepClear() { this.sepHead.fill(-1); }

  sepInsert(i, x, y) {
    let cx = (x / this.sepCell) | 0;
    let cy = (y / this.sepCell) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.scCols) cx = this.scCols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.scRows) cy = this.scRows - 1;
    const c = cy * this.scCols + cx;
    this.sepNext[i] = this.sepHead[c];
    this.sepHead[c] = i;
  }
}

function smooth(t) { return t * t * (3 - 2 * t); }
