// El mundo: campo de recurso escalar de baja resolución + spatial hash de vecindad.
// Coordenadas siempre lógicas (config.world). El render no entra aquí.

export class World {
  constructor(cfg, rng, aScale = 1) {
    this.cfg = cfg;
    this.rng = rng;
    // REJILLA ∝ size (√área): el CONTEO de celdas escala con el área del mundo, pero el TAMAÑO de celda se mantiene
    // ~constante (granularidad del campo de comida fija a cualquier world.size). `aScale` lo pasa Sim (área, acotada
    // al techo de pool) → la rejilla deja de crecer cuando lo hace el ecosistema. A aScale=1 (tamaño 1000) → gridCols base.
    const r = cfg.resource, lScale = Math.sqrt(aScale);
    this.cols = Math.max(4, Math.round(r.gridCols * lScale));
    this.rows = Math.max(4, Math.round(r.gridRows * lScale));
    this.cellW = cfg.world.size / this.cols;
    this.cellH = cfg.world.size / this.rows;

    // Campo de recurso (unidades normalizadas [0, R_max]).
    this.resource = new Float32Array(this.cols * this.rows);
    // Snapshot del recurso del tick anterior: lo usa regen() para leer vecinos sin orden-dependencia
    // (rebrote emergente con difusión de semilla). Reutilizable, sin GC en el bucle.
    this._resPrev = new Float32Array(this.cols * this.rows);
    // Campo de CARROÑA (energía de cadáveres por celda, en unidades de ENERGÍA directa). Se deposita al MORIR
    // (cantidad según la causa, ver sim._kill), DECAE cada tick (decayCarrion → devuelve una fracción al pasto =
    // ciclo de nutrientes cadáver→descomposición→vegetación) y la CONSUMEN los carroñeros (effCarn, ver sim.js).
    this.carrion = new Float32Array(this.cols * this.rows);
    // CERRADO EN MATERIA (world.closedMatter): CAMPO ESPACIAL de nutriente libre disuelto POR CELDA (antes era un escalar
    // global). Las plantas lo captan LOCALMENTE en regen → manchas fértiles donde muere/respira algo. Lo alimentan el
    // metabolismo/nado/pérdidas (sim.js) y la mineralización de la carroña (decayCarrion), en la CELDA donde ocurre; se
    // DIFUNDE despacio (diffuseNutrient); lo vacía el rebrote. Σ del campo = pool global (conservación). En ABIERTO queda
    // a 0 e inerte. `sim.reset()` lo reparte del presupuesto. El nacimiento reúne nutriente de un VECINDARIO (nutrientAround).
    this.N = new Float32Array(this.cols * this.rows);
    this._nPrev = new Float32Array(this.cols * this.rows); // scratch de la difusión del nutriente (snapshot, sin GC)
    this._grow = new Float32Array(this.cols * this.rows); // scratch del rebrote cerrado (incrementos por celda; sin GC)
    // Capacidad por celda: gradiente espacial FIJO que crea nichos (más rico = más R_max local).
    this.capacity = new Float32Array(this.cols * this.rows);
    this._buildGradient();
    // Arranca lleno a su capacidad local.
    this.resource.set(this.capacity);

    // REFUGIO (#7): NO hay máscara binaria. La cobertura es GRADUADA y sale de la vegetación VIVA local
    // (ver sim.js combate): zona densa = más escondite, zona pastada = presa expuesta → refugios dinámicos.

    // Campo de "color de la luz" del ambiente: pocas regiones grandes de tono fijo.
    // Campo de "temperatura" [0,1] por celda (frío→cálido), segundo eje ambiental
    // independiente de la luz. El gen temp_pref se adapta a él (coste por desviarse).
    this.temp = new Float32Array(this.cols * this.rows);
    this._buildField(this.temp, cfg.resource.tempFreq); // zonas grandes → especializarse rinde

    // ---- Spatial hash uniforme: celda = mayor radio de visión posible ----
    this.hashCell = cfg.expr.sense.max; // 80px
    this.hCols = Math.ceil(cfg.world.size / this.hashCell);
    this.hRows = Math.ceil(cfg.world.size / this.hashCell);
    this.cellHead = new Int32Array(this.hCols * this.hRows).fill(-1);
    this.cellNext = null; // se dimensiona con el pool (setCapacity)
  }

  setCapacity(maxAgents) {
    this.cellNext = new Int32Array(maxAgents);
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
    const N = cols * rows, capFloor = this.cfg.resource.capFloor; // suelo de capacidad (fracción de R_max): ninguna celda es baldío permanente
    for (let i = 0; i < N; i++) this.capacity[i] = Rmax * (capFloor + (1 - capFloor) * noise[i]);
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
    if (this.cfg.world.closedMatter) { this._regenClosed(); return; } // pecera: el pasto crece consumiendo N (abajo)
    const dr = this.cfg.resource.R_regen, seedFloor = this.cfg.resource.seedFloor; // seedFloor = banco de semillas (rebrote espontáneo mínimo)
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
          // SUELO de semilla espontánea (resource.seedFloor) que da a una calva total aislada un rebrote lentísimo →
          // evita el estado absorbente (vegetación global a cero del que nunca se sale). Banco de semillas.
          let logGrow = dr * (seedFloor + r / c + meanNb / c); if (logGrow > head) logGrow = head;
          let linGrow = dr < head ? dr : head;                // el clásico (para mezclar según p)
          res[i] = r + (1 - p) * linGrow + p * logGrow;
        }
      }
    }
  }

  // Rebrote CERRADO EN MATERIA (closedMatter): las plantas solo crecen CONSUMIENDO nutriente libre (`this.N`) → el sol
  // ya no crea biomasa, solo permite convertir N→pasto. Dos pasadas O(celdas), sin GC: (A) calcula el incremento DESEADO
  // por celda con la MISMA dinámica que regen() (lineal o logística+difusión) y suma la materia que pediría; (B) si N no
  // llega para todo, ESCALA el crecimiento por igual (factor f, sin sesgo de orden de barrido) y resta de N lo captado.
  _regenClosed() {
    const wc = this.cfg.world;                              // tasa de fotosíntesis PROPIA del modo cerrado (no pisa resource.R_regen del abierto)
    const dr = wc.closedRegen != null ? wc.closedRegen : this.cfg.resource.R_regen, epu = this.cfg.resource.energyPerUnit, seedFloor = this.cfg.resource.seedFloor;
    const cap = this.capacity, res = this.resource, grow = this._grow;
    let p = this.cfg.resource.patchiness || 0; if (p > 1) p = 1;
    const cols = this.cols, rows = this.rows;
    let need = 0;
    if (p <= 0) {                                            // incremento lineal por celda
      for (let i = 0; i < res.length; i++) { let inc = cap[i] - res[i]; if (inc > dr) inc = dr; if (inc < 0) inc = 0; grow[i] = inc; need += inc; }
    } else {                                                 // logístico + difusión de semilla (lee snapshot → orden-independiente)
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
    // Cada celda capta de su PROPIO nutriente local N[i] (campo espacial) → el pasto crece donde hay nutriente (manchas
    // fértiles junto a la descomposición). Si el N local no llega, se escala SOLO esa celda. Conserva: N[i] → res[i]·epu.
    const N = this.N;
    for (let i = 0; i < res.length; i++) {
      let g = grow[i]; if (g <= 0) continue;
      let want = g * epu;
      if (want > N[i]) { want = N[i] > 0 ? N[i] : 0; g = want / epu; } // N local insuficiente → escala esta celda
      if (g <= 0) continue;
      res[i] += g; N[i] -= want;
    }
  }

  // Decaimiento de la carroña (por tick). Lo que se descompone vuelve EN PARTE al pasto (`energy.corpseReturn`) =
  // ciclo de nutrientes (cadáver→descomposición→vegetación); el resto se pierde. Independiente por celda (O(celdas)).
  // CERRADO EN MATERIA (closedMatter): se MINERALIZA TODO lo decaído al pool de nutriente libre `N` (sin pérdida ni
  // paso directo al pasto: las plantas lo recaptan vía regen) → cierra el ciclo carroña→detrito→nutriente→pasto.
  decayCarrion() {
    const cd = this.cfg.resource.carrionDecay || 0; if (cd <= 0) return;
    const carrion = this.carrion, res = this.resource, cap = this.capacity;
    const closed = this.cfg.world.closedMatter;
    const ret = this.cfg.energy.corpseReturn || 0, epu = this.cfg.resource.energyPerUnit;
    for (let i = 0; i < carrion.length; i++) {
      const cv = carrion[i]; if (cv <= 0) continue;
      const d = cv * cd; carrion[i] = cv - d;                        // energía que se descompone este tick
      if (closed) { this.N[i] += d; }                                // mineralización íntegra → nutriente libre LOCAL de la celda (el cadáver fertiliza SU zona; conserva)
      else if (ret > 0) { const nv = res[i] + (ret * d) / epu, c = cap[i]; res[i] = nv > c ? c : nv; } // fracción→pasto (en unidades de recurso)
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

  // ── NUTRIENTE ESPACIAL (campo this.N) ──
  // Difusión lenta del nutriente libre: cada tick reparte una fracción `nutrientDiffuse` hacia los 4 vecinos (toro) →
  // las manchas fértiles se difuminan despacio en vez de teletransportarse global. CONSERVATIVA (Σ N constante en el
  // toro: Σ media4 = Σ N); lee un snapshot (_nPrev) para ser independiente del orden de barrido.
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

  // Nutriente del VECINDARIO (2R+1)² centrado en `cell` (toro). El nacimiento construye el cuerpo (bodyMatter) reuniendo
  // nutriente de la ZONA del progenitor, no de una sola celda (que no tendría suficiente de golpe → bloquearía la cría).
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
