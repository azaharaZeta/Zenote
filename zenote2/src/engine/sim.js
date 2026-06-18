// M5.3 — SIM INTEGRADO. Código KEEPER: el organismo REAL (genoma→develop→fenotipo) viviendo sobre las leyes del
// mundo M4, vía las transacciones de 2.1 (fotosíntesis · ingesta · metabolismo · muerte · descomposición) +
// reproducción ASEXUAL con mutación del genoma de reglas (la morfología EVOLUCIONA). Conducta = placeholder genérico
// (M6 la reemplaza por el controlador neuronal). Materia/energía contabilizadas en cada transacción → los invariantes
// de 2.1 §8 deben SEGUIR pasando con organismos reales (el check crítico de M5.3).
//
// Separación limpia de monedas (como M4): masa estructural = MATERIA pura (sin energía) · reservas E = ENERGÍA pura
// (sin materia). Sin crecimiento/tripa (eso es M6): el cuerpo nace a su tamaño desarrollado. Eje estructura-vs-reservas
// y energía-en-biomasa (presa magra) son de M6 → en M5.3 el heterótrofo vive de las RESERVAS de la presa (puede ser
// flojo; lo arregla M6). El foco de M5.3 es: organismo real + invariantes + morfología evoluciona.

import { develop, mutate, makeFounder } from './genome.js';
import { computePhenotype } from './phenotype.js';
import { SpatialHash } from './hash.js';
import { makeRng } from '../util/rng.js';

export const SIM_P = {
  photoEff: 0.05, photoHalf: 40,     // captación: share de la luz de la celda ∝ photoCap/(photoCap+half)
  baseCost: 0.015, massCost: 0.004,  // metabolismo: basal + ∝ masa
  moveCost: 0.004,                   // coste de nado ∝ drag·v² (energía → calor)
  reproE: 16, investE: 7, cooldown: 50,   // reproducción: umbral, energía a la cría, enfriamiento
  birthR: 1,                         // radio (celdas) del vecindario del que la cría reúne MATERIA al nacer
  eatReach: 4,                       // alcance extra de captura (u)
  preyMassMax: 1.6,                  // factor: presa manejable si su masa ≤ maxMouthR·este (boca→tamaño de presa)
  ηene: 0.85,                        // eficiencia energética de la ingesta
  initE: 10,                         // reservas iniciales de los fundadores
};

export class Sim {
  constructor(world, { seed = 1, cap = 8000 } = {}) {
    this.world = world; this.cap = cap; this.rng = makeRng(seed); this.tick = 0;
    this.x = new Float32Array(cap); this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap);
    this.E = new Float32Array(cap); this.age = new Float32Array(cap); this.cd = new Float32Array(cap);
    this.alive = new Uint8Array(cap); this.serial = new Int32Array(cap); this._serial = 0;
    this.genome = new Array(cap).fill(null);
    this.body = new Array(cap).fill(null);   // cuerpo desarrollado (partes) cacheado al nacer → lo lee el render (M5.5)
    // fenotipo cacheado (de develop+computePhenotype al nacer)
    this.mass = new Float32Array(cap); this.photoCap = new Float32Array(cap); this.vmax = new Float32Array(cap);
    this.drag = new Float32Array(cap); this.mouthCap = new Float32Array(cap); this.maxMouthR = new Float32Array(cap);
    this.free = new Int32Array(cap); for (let i = 0; i < cap; i++) this.free[i] = cap - 1 - i; this.freeTop = cap;
    this.active = new Int32Array(cap); this.nA = 0;
    this.hash = new SpatialHash(world.size, 60); this.hash.setCapacity(cap);
  }

  _expr(i) { const parts = develop(this.genome[i]); this.body[i] = parts; const ph = computePhenotype(parts);
    this.mass[i] = ph.mass; this.photoCap[i] = ph.photoCap; this.vmax[i] = ph.vmax; this.drag[i] = ph.drag;
    this.mouthCap[i] = ph.mouthCap; this.maxMouthR[i] = ph.maxMouthR; }

  spawn(genome, x, y, E) {
    if (this.freeTop === 0) return -1; const i = this.free[--this.freeTop];
    this.alive[i] = 1; this.serial[i] = ++this._serial; this.genome[i] = genome;
    this.x[i] = x; this.y[i] = y; this.vx[i] = 0; this.vy[i] = 0; this.E[i] = E; this.age[i] = 0;
    this.cd[i] = (this.rng.next() * SIM_P.cooldown) | 0; this._expr(i); return i;
  }

  seed(n) { const W = this.world, rng = this.rng;
    for (let k = 0; k < n; k++) this.spawn(makeFounder(rng), rng.next() * W.size, rng.next() * W.size, SIM_P.initE); }

  // materia del vecindario (para que la cría construya su cuerpo) — gate de natalidad endógeno (2.1)
  _nutrientAround(cell, R) { const W = this.world, cols = W.cols, rows = W.rows, cx = cell % cols, cy = (cell / cols) | 0; let s = 0;
    for (let dy = -R; dy <= R; dy++) { const yy = ((cy + dy) % rows + rows) % rows; for (let dx = -R; dx <= R; dx++) { const xx = ((cx + dx) % cols + cols) % cols; s += W.nutrient[yy * cols + xx]; } } return s; }
  _takeNutrientAround(cell, R, amount) { const W = this.world, total = this._nutrientAround(cell, R); if (total <= 0) return; const f = amount / total, cols = W.cols, rows = W.rows, cx = cell % cols, cy = (cell / cols) | 0;
    for (let dy = -R; dy <= R; dy++) { const yy = ((cy + dy) % rows + rows) % rows; for (let dx = -R; dx <= R; dx++) { const idx = yy * cols + ((cx + dx) % cols + cols) % cols; W.nutrient[idx] -= W.nutrient[idx] * f; } } }

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

      // FOTOSÍNTESIS: capta una porción de la luz de la celda ∝ photoCap (compite por sombra/ocupación). Energía ENTRA.
      if (this.photoCap[i] > 0) { const dE = P.photoEff * W.lightAt(cell) * (this.photoCap[i] / (this.photoCap[i] + P.photoHalf)) / Math.max(1, W.occ[cell]);
        if (dE > 0) { E[i] += dE; W.lightCaptured += dE; } }

      // CONDUCTA placeholder GENÉRICA: si tiene boca (heterótrofo) persigue presa; si no, deriva lento (autótrofo).
      let tvx = 0, tvy = 0;
      if (this.mouthCap[i] > 0) {
        let bj = -1, bd = 60 * 60, bdx = 0, bdy = 0; const hc = this.hash.cell, hx = (x[i] / hc) | 0, hy = (y[i] / hc) | 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const gx = ((hx + ox) % this.hash.cols + this.hash.cols) % this.hash.cols, gy = ((hy + oy) % this.hash.rows + this.hash.rows) % this.hash.rows;
          let j = this.hash.head[gy * this.hash.cols + gx];
          while (j !== -1) { if (j !== i && this.alive[j] && this.mass[j] <= this.maxMouthR[i] * P.preyMassMax && this.mass[j] < this.mass[i]) {
            let dx = x[j] - x[i], dy = y[j] - y[i]; if (dx > size * 0.5) dx -= size; else if (dx < -size * 0.5) dx += size; if (dy > size * 0.5) dy -= size; else if (dy < -size * 0.5) dy += size;
            const d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; bj = j; bdx = dx; bdy = dy; } } j = this.hash.next[j]; }
        }
        if (bj !== -1) { const m = Math.sqrt(bd) || 1; tvx = bdx / m; tvy = bdy / m;
          // INGESTA: en contacto, gana las RESERVAS de la presa (η); resto → detrito; la MASA de la presa → detrito (CONSERVA).
          const reach = (this.maxMouthR[i] + P.eatReach); if (bd < reach * reach) { const pc = W.cellAt(x[bj], y[bj]);
            const ge = P.ηene * E[bj]; E[i] += ge; W.detritusE[pc] += E[bj] - ge; W.detritusM[pc] += this.mass[bj];
            this.alive[bj] = 0; this.free[this.freeTop++] = bj; this.genome[bj] = null; }
        } else { tvx = (rng.next() - 0.5); tvy = (rng.next() - 0.5); }
      } else { tvx = (rng.next() - 0.5) * 0.3; tvy = (rng.next() - 0.5) * 0.3; } // autótrofo: casi sésil

      // MOVIMIENTO (velocidad emergente vmax) + coste ∝ drag·v² (energía → calor)
      const sp = this.vmax[i], tm = Math.sqrt(tvx * tvx + tvy * tvy) || 1;
      vx[i] = tvx / tm * sp; vy[i] = tvy / tm * sp;
      let nx = x[i] + vx[i], ny = y[i] + vy[i]; if (nx < 0) nx += size; else if (nx >= size) nx -= size; if (ny < 0) ny += size; else if (ny >= size) ny -= size; x[i] = nx; y[i] = ny;
      const v2 = vx[i] * vx[i] + vy[i] * vy[i];

      // METABOLISMO: reservas → calor (basal + ∝masa + nado). Muerte si se agotan → cuerpo a detrito.
      const cost = P.baseCost + P.massCost * this.mass[i] + P.moveCost * v2 * this.drag[i];
      const spend = Math.min(E[i], cost); E[i] -= spend; W.heat += spend;
      if (E[i] <= 1e-6) { W.detritusM[cell] += this.mass[i]; W.detritusE[cell] += E[i] > 0 ? E[i] : 0; this.alive[i] = 0; this.free[this.freeTop++] = i; this.genome[i] = null; continue; }

      // REPRODUCCIÓN asexual + MUTACIÓN: la cría desarrolla su (posiblemente mutado) cuerpo; su MATERIA sale del
      // nutriente local (gate endógeno: no nace sin materia), su ENERGÍA del progenitor. Conserva ambas.
      this.age[i]++; if (this.cd[i] > 0) this.cd[i]--;
      else if (E[i] >= P.reproE) {
        const childG = mutate(this.genome[i], rng); const childPh = computePhenotype(develop(childG));
        if (this._nutrientAround(cell, P.birthR) >= childPh.mass) {
          this._takeNutrientAround(cell, P.birthR, childPh.mass);   // MATERIA: nutriente → cuerpo de la cría
          E[i] -= P.investE; this.cd[i] = P.cooldown;               // ENERGÍA: progenitor → cría
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
