// SPIKE visión-órgano — SIM (variante). Copia del motor KEEPER (sim.js) con SOLO 3 cambios, marcados [VISIÓN]:
//   1) cachea senseRange/senseArea por agente (del fenotipo);  2) seed() siembra ojo si visionMode='organ-seeded';
//   3) el SENSADO de presa/amenaza se GATEA por senseRange² (en 'free' el gate es ∞ → reproduce el baseline actual).
// Todo lo demás (fotosíntesis, metabolismo, tripa, plasticidad, reproducción, conservación) es idéntico al keeper.
import { develop, mutate, makeFounder, recombine, BRAIN, BRAIN_W } from './genome.mjs';
import { computePhenotype, PHENO_P } from './phenotype.mjs';
import { SpatialHash } from '../../src/engine/hash.js';
import { makeRng } from '../../src/util/rng.js';

export const SIM_P = {
  photoEff: 0.05, photoHalf: 40,
  baseCost: 0.015, massCost: 0.004,
  moveCost: 0.004,
  reproE: 16, investE: 7, cooldown: 50,
  eDensity: 0,
  birthR: 1,
  gutBase: 4, gutPerMass: 4, digestRate: 0.6,
  eatReach: 4,
  preyMassMax: 1.6,
  ηene: 0.85,
  initE: 10,
  mateRadius: 50,
  mateCompat: 0.5,
};

export class Sim {
  constructor(world, { seed = 1, cap = 8000, eDensity = SIM_P.eDensity, randomBehavior = false, visionMode = 'free', senseCost = 0 } = {}) {
    this.world = world; this.cap = cap; this.rng = makeRng(seed); this.tick = 0; this.eD = eDensity;
    this.randomBehavior = randomBehavior;
    this.visionMode = visionMode;   // [VISIÓN] 'free' = baseline (sensado gratis) · 'organ-seeded' · 'organ-blind'
    this.senseCost = senseCost;     // [VISIÓN-COSTE] energía/tick por unidad de ALCANCE sobre el mínimo innato (M6.4). 0 = sin coste.
    this.x = new Float32Array(cap); this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap);
    this.E = new Float32Array(cap); this.gut = new Float32Array(cap); this.age = new Float32Array(cap); this.cd = new Float32Array(cap);
    this.alive = new Uint8Array(cap); this.serial = new Int32Array(cap); this._serial = 0;
    this.genome = new Array(cap).fill(null);
    this.body = new Array(cap).fill(null);
    this.mass = new Float32Array(cap); this.photoCap = new Float32Array(cap); this.vmax = new Float32Array(cap);
    this.drag = new Float32Array(cap); this.mouthCap = new Float32Array(cap); this.maxMouthR = new Float32Array(cap);
    this.senseRange = new Float32Array(cap); this.senseArea = new Float32Array(cap);   // [VISIÓN]
    this.free = new Int32Array(cap); for (let i = 0; i < cap; i++) this.free[i] = cap - 1 - i; this.freeTop = cap;
    this.active = new Int32Array(cap); this.nA = 0;
    this.hash = new SpatialHash(world.size, 60); this.hash.setCapacity(cap);
    this.kills = 0; this.sexBirths = 0; this.asexBirths = 0;
    this.wbrain = new Float32Array(cap * BRAIN_W); this.hidden = new Float32Array(cap * BRAIN.H);
    this._in = new Float32Array(BRAIN.I); this._hid = new Float32Array(BRAIN.H); this._out = new Float32Array(BRAIN.O);
  }

  _expr(i) { const parts = develop(this.genome[i]); this.body[i] = parts; const ph = computePhenotype(parts);
    this.mass[i] = ph.mass; this.photoCap[i] = ph.photoCap; this.vmax[i] = ph.vmax; this.drag[i] = ph.drag;
    this.mouthCap[i] = ph.mouthCap; this.maxMouthR[i] = ph.maxMouthR;
    this.senseRange[i] = ph.senseRange; this.senseArea[i] = ph.senseArea; }   // [VISIÓN]

  spawn(genome, x, y, E) {
    if (this.freeTop === 0) return -1; const i = this.free[--this.freeTop];
    this.alive[i] = 1; this.serial[i] = ++this._serial; this.genome[i] = genome;
    this.x[i] = x; this.y[i] = y; this.vx[i] = 0; this.vy[i] = 0; this.E[i] = E; this.gut[i] = 0; this.age[i] = 0;
    this.cd[i] = (this.rng.next() * SIM_P.cooldown) | 0; this._expr(i);
    const b = genome.brain, wb = i * BRAIN_W; for (let k = 0; k < BRAIN_W; k++) this.wbrain[wb + k] = b ? b[k] : 0;
    const hb = i * BRAIN.H; for (let k = 0; k < BRAIN.H; k++) this.hidden[hb + k] = 0;
    return i;
  }

  seed(n) { const W = this.world, rng = this.rng, eye = this.visionMode === 'organ-seeded';   // [VISIÓN] ojo sembrado
    for (let k = 0; k < n; k++) this.spawn(makeFounder(rng, eye), rng.next() * W.size, rng.next() * W.size, SIM_P.initE); }

  _nutrientAround(cell, R) { const W = this.world, cols = W.cols, rows = W.rows, cx = cell % cols, cy = (cell / cols) | 0; let s = 0;
    for (let dy = -R; dy <= R; dy++) { const yy = ((cy + dy) % rows + rows) % rows; for (let dx = -R; dx <= R; dx++) { const xx = ((cx + dx) % cols + cols) % cols; s += W.nutrient[yy * cols + xx]; } } return s; }
  _takeNutrientAround(cell, R, amount) { const W = this.world, total = this._nutrientAround(cell, R); if (total <= 0) return; const f = amount / total, cols = W.cols, rows = W.rows, cx = cell % cols, cy = (cell / cols) | 0;
    for (let dy = -R; dy <= R; dy++) { const yy = ((cy + dy) % rows + rows) % rows; for (let dx = -R; dx <= R; dx++) { const idx = yy * cols + ((cx + dx) % cols + cols) % cols; W.nutrient[idx] -= W.nutrient[idx] * f; } } }

  _findMate(i) {
    const P = SIM_P, size = this.world.size, mr2 = P.mateRadius * P.mateRadius;
    const hc = this.hash.cell, hx = (this.x[i] / hc) | 0, hy = (this.y[i] / hc) | 0;
    let best = -1, bestD = mr2;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = ((hx + ox) % this.hash.cols + this.hash.cols) % this.hash.cols, gy = ((hy + oy) % this.hash.rows + this.hash.rows) % this.hash.rows;
      let j = this.hash.head[gy * this.hash.cols + gx];
      while (j !== -1) { if (j !== i && this.alive[j]) {
        let dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i]; if (dx > size * 0.5) dx -= size; else if (dx < -size * 0.5) dx += size; if (dy > size * 0.5) dy -= size; else if (dy < -size * 0.5) dy += size;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) {
          const dm = (this.mass[i] - this.mass[j]) / 2, dp = (this.photoCap[i] - this.photoCap[j]) / 40, dmo = (this.mouthCap[i] - this.mouthCap[j]) / 10;
          if (Math.sqrt(dm * dm + dp * dp + dmo * dmo) < P.mateCompat) { bestD = d2; best = j; }
        }
      } j = this.hash.next[j]; }
    }
    return best;
  }

  step() {
    const W = this.world, rng = this.rng, size = W.size, P = SIM_P;
    W.setDayNight(this.tick);
    let na = 0; for (let i = 0; i < this.cap; i++) if (this.alive[i]) this.active[na++] = i; this.nA = na;
    W.occ.fill(0); this.hash.clear();
    for (let a = 0; a < na; a++) { const i = this.active[a]; this.hash.insert(i, this.x[i], this.y[i]); W.occ[W.cellAt(this.x[i], this.y[i])] += 1; }

    const x = this.x, y = this.y, vx = this.vx, vy = this.vy, E = this.E;
    const born = []; const maxSer = this._serial;
    for (let a = 0; a < na; a++) {
      const i = this.active[a]; if (!this.alive[i] || this.serial[i] > maxSer) continue;
      const cell = W.cellAt(x[i], y[i]);
      const E0 = E[i];

      if (this.photoCap[i] > 0) { const dE = P.photoEff * W.lightAt(cell) * (this.photoCap[i] / (this.photoCap[i] + P.photoHalf)) / Math.max(1, W.occ[cell]);
        if (dE > 0) { E[i] += dE; W.lightCaptured += dE; } }

      // ---- SENSADO: ∇luz + presa/amenaza más cercanas (un barrido del hash) ----
      const cols = W.cols, rows = W.rows, cx = cell % cols, cy = (cell / cols) | 0;
      const xl = cx > 0 ? cell - 1 : cell, xr = cx < cols - 1 ? cell + 1 : cell, yt = cy > 0 ? cell - cols : cell, yb = cy < rows - 1 ? cell + cols : cell;
      const lgx = (W.light0[xr] - W.light0[xl]) * 8, lgy = (W.light0[yb] - W.light0[yt]) * 8;
      let preyJ = -1, preyD = 1e9, preyDX = 0, preyDY = 0, thD = 1e9, thDX = 0, thDY = 0;
      const myMass = this.mass[i], myMouth = this.mouthCap[i], myReach = this.maxMouthR[i] * P.preyMassMax;
      const sr2 = this.visionMode === 'free' ? Infinity : this.senseRange[i] * this.senseRange[i];   // [VISIÓN] alcance de detección
      { const hc = this.hash.cell, hx = (x[i] / hc) | 0, hy = (y[i] / hc) | 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const gx = ((hx + ox) % this.hash.cols + this.hash.cols) % this.hash.cols, gy = ((hy + oy) % this.hash.rows + this.hash.rows) % this.hash.rows;
          let j = this.hash.head[gy * this.hash.cols + gx];
          while (j !== -1) { if (j !== i && this.alive[j]) {
            let dx = x[j] - x[i], dy = y[j] - y[i]; if (dx > size * 0.5) dx -= size; else if (dx < -size * 0.5) dx += size; if (dy > size * 0.5) dy -= size; else if (dy < -size * 0.5) dy += size;
            const d2 = dx * dx + dy * dy;
            if (d2 < sr2 && myMouth > 0 && this.mass[j] < myMass && this.mass[j] <= myReach && d2 < preyD) { preyD = d2; preyJ = j; preyDX = dx; preyDY = dy; }       // [VISIÓN] presa (si está dentro del alcance)
            if (d2 < sr2 && this.mouthCap[j] > 0 && myMass < this.mass[j] && myMass <= this.maxMouthR[j] * P.preyMassMax && d2 < thD) { thD = d2; thDX = dx; thDY = dy; } // [VISIÓN] amenaza
          } j = this.hash.next[j]; } }
      }
      if (preyJ >= 0) { const m = Math.sqrt(preyD) || 1; preyDX /= m; preyDY /= m; }
      if (thD < 1e9) { const m = Math.sqrt(thD) || 1; thDX /= m; thDY /= m; }

      // ---- CEREBRO (forward Elman) ----
      const I = BRAIN.I, H = BRAIN.H, O = BRAIN.O, inp = this._in, hid = this._hid, out = this._out, wb = i * BRAIN_W, hb = i * H, Wt = this.wbrain, PH = this.hidden;
      const wHh = I * H, bH = I * H + H * H, wHo = bH + H, bO = wHo + H * O;
      inp[0] = lgx < -1 ? -1 : lgx > 1 ? 1 : lgx; inp[1] = lgy < -1 ? -1 : lgy > 1 ? 1 : lgy; inp[2] = preyDX; inp[3] = preyDY; inp[4] = thDX; inp[5] = thDY;
      inp[6] = (E[i] / P.reproE) * 2 - 1; const spd0 = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]); inp[7] = this.vmax[i] > 1e-4 ? (spd0 / this.vmax[i]) * 2 - 1 : -1;
      for (let h = 0; h < H; h++) { let s = Wt[wb + bH + h]; for (let k = 0; k < I; k++) s += inp[k] * Wt[wb + k * H + h]; for (let p = 0; p < H; p++) s += PH[hb + p] * Wt[wb + wHh + p * H + h]; hid[h] = Math.tanh(s); }
      for (let o = 0; o < O; o++) { let s = Wt[wb + bO + o]; for (let h = 0; h < H; h++) s += hid[h] * Wt[wb + wHo + h * O + o]; out[o] = Math.tanh(s); }
      if (this.randomBehavior) { out[0] = rng.next() * 2 - 1; out[1] = rng.next() * 2 - 1; out[2] = rng.next() * 2 - 1; out[3] = rng.next() * 2 - 1; }

      // ---- MOVIMIENTO ----
      const dxo = out[0], dyo = out[1], dm = Math.sqrt(dxo * dxo + dyo * dyo), throttle = (out[2] + 1) * 0.5;
      if (dm > 1e-3) { const sp = this.vmax[i] * throttle; vx[i] = dxo / dm * sp; vy[i] = dyo / dm * sp; } else { vx[i] *= 0.5; vy[i] *= 0.5; }
      let nx = x[i] + vx[i], ny = y[i] + vy[i]; if (nx < 0) nx += size; else if (nx >= size) nx -= size; if (ny < 0) ny += size; else if (ny >= size) ny -= size; x[i] = nx; y[i] = ny;
      const v2 = vx[i] * vx[i] + vy[i] * vy[i];

      // ---- INGESTA ----
      const attack = (out[3] + 1) * 0.5;
      const Gmax = P.gutBase + P.gutPerMass * this.mass[i];
      if (preyJ >= 0 && myMouth > 0 && attack > 0.5 && this.gut[i] < Gmax && this.alive[preyJ]) { const reach = this.maxMouthR[i] + P.eatReach;
        if (preyD < reach * reach) { const pc = W.cellAt(x[preyJ], y[preyJ]);
          const preyEnergy = E[preyJ] + this.gut[preyJ] + this.mass[preyJ] * this.eD;
          const ge = P.ηene * preyEnergy, room = Gmax - this.gut[i], intoGut = ge < room ? ge : room;
          this.gut[i] += intoGut; W.detritusE[pc] += preyEnergy - intoGut;
          W.detritusM[pc] += this.mass[preyJ];
          this.alive[preyJ] = 0; this.free[this.freeTop++] = preyJ; this.genome[preyJ] = null; this.kills++; } }
      if (this.gut[i] > 0) { const d = this.gut[i] < P.digestRate ? this.gut[i] : P.digestRate; this.gut[i] -= d; E[i] += d; }

      // METABOLISMO (+ [VISIÓN-COSTE] M6.4: ver lejos cuesta energía/tick ∝ alcance sobre el mínimo innato → un órgano
      // que no rinde —p.ej. en un autótrofo sésil— es net-negativo → presión a quedarse ciego. Va a calor → conserva).
      const cost = P.baseCost + P.massCost * this.mass[i] + P.moveCost * v2 * this.drag[i]
                 + this.senseCost * (this.senseRange[i] - PHENO_P.senseBase);
      const spend = Math.min(E[i], cost); E[i] -= spend; W.heat += spend;
      if (E[i] <= 1e-6) { W.detritusM[cell] += this.mass[i]; W.detritusE[cell] += (E[i] > 0 ? E[i] : 0) + this.gut[i] + this.mass[i] * this.eD; this.alive[i] = 0; this.free[this.freeTop++] = i; this.genome[i] = null; continue; }

      // ---- PLASTICIDAD ----
      { let reward = E[i] - E0; reward = reward > 0.5 ? 0.5 : reward < -0.5 ? -0.5 : reward; const lr = 0.02 * reward;
        if (lr !== 0) {
          for (let h = 0; h < H; h++) { const po = hid[h];
            for (let k = 0; k < I; k++) { const idx = wb + k * H + h; let w = Wt[idx] + lr * inp[k] * po; Wt[idx] = w < -3 ? -3 : w > 3 ? 3 : w; }
            for (let p = 0; p < H; p++) { const idx = wb + wHh + p * H + h; let w = Wt[idx] + lr * PH[hb + p] * po; Wt[idx] = w < -3 ? -3 : w > 3 ? 3 : w; } }
          for (let o = 0; o < O; o++) { const po = out[o]; for (let h = 0; h < H; h++) { const idx = wb + wHo + h * O + o; let w = Wt[idx] + lr * hid[h] * po; Wt[idx] = w < -3 ? -3 : w > 3 ? 3 : w; } }
        }
      }
      for (let h = 0; h < H; h++) PH[hb + h] = hid[h];

      // REPRODUCCIÓN asexual + MUTACIÓN (+ sexual si hay pareja)
      this.age[i]++; if (this.cd[i] > 0) this.cd[i]--;
      else if (E[i] >= P.reproE) {
        const mate = this._findMate(i);
        const childG = mate >= 0 ? mutate(recombine(this.genome[i], this.genome[mate], rng), rng) : mutate(this.genome[i], rng);
        const childPh = computePhenotype(develop(childG));
        const eCost = P.investE + childPh.mass * this.eD;
        if (E[i] >= eCost && this._nutrientAround(cell, P.birthR) >= childPh.mass) {
          this._takeNutrientAround(cell, P.birthR, childPh.mass);
          E[i] -= eCost; this.cd[i] = P.cooldown;
          if (mate >= 0) this.sexBirths++; else this.asexBirths++;
          born.push(childG, x[i] + (rng.next() - 0.5) * 6, y[i] + (rng.next() - 0.5) * 6, P.investE);
        }
      }
    }
    for (let k = 0; k < born.length; k += 4) { let bx = born[k + 1], by = born[k + 2];
      if (bx < 0) bx += size; else if (bx >= size) bx -= size; if (by < 0) by += size; else if (by >= size) by -= size;
      this.spawn(born[k], bx, by, born[k + 3]); }

    W.decomposeStep(); W.diffuseStep(); this.tick++;
  }

  pop() { let p = 0; for (let i = 0; i < this.cap; i++) if (this.alive[i]) p++; return p; }
  totalMass() { let m = 0; for (let i = 0; i < this.cap; i++) if (this.alive[i]) m += this.mass[i]; return m; }
  totalE() { let e = 0; for (let i = 0; i < this.cap; i++) if (this.alive[i]) e += this.E[i]; return e; }
}
