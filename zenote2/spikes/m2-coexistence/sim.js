// SPIKE M2 — ¿EMERGE la coexistencia depredador-presa SIN estabilizadores cableados? (descartable, aislado)
// Rebanada ecológica MÍNIMA: recurso (productor) → presa → depredador, en un toro 2D. Conducta CODIFICADA A MANO
// (forrajear/huir/cazar) — la conducta evolucionada es de M6; aquí se aísla la FÍSICA ECOLÓGICA.
//
// La tesis a falsar (2.3 + 2.1): el límite a la depredación NO es handlingTime sino la TRIPA que se llena (saciedad
// = respuesta funcional tipo II EMERGENTE); el refugio NO es refuge.strength sino ESPACIAL (la cobertura de
// vegetación densa oculta a la presa + el mundo es grande y la depredación es local). NO hay failDamage/fleeCap.
//
// Toggles de ABLACIÓN: satiety (tripa) on/off · cover (refugio espacial) on/off · world size. Cada uno aísla un
// mecanismo → vemos cuál es necesario/suficiente. Los parámetros son FÍSICOS (metabolismo, tripa, digestión…),
// elegidos plausibles y FIJOS — el go-criterion es ROBUSTEZ (multi-seed/size), no un ajuste de precisión.

import { makeRng } from '../../src/util/rng.js';

// --- Parámetros físicos (NO diales de balance ecológico: son propiedades del cuerpo/medio; calibración fina = futuro) ---
const P = {
  cellRef: 20,              // tamaño de celda de recurso (u) CONSTANTE → rejilla ∝ tamaño de mundo (recurso total ∝ área)
  resMax: 1.0,              // recurso máx por celda
  regen: 0.012,             // fotosíntesis (logística hacia resMax) — entrada de energía. Bajada → menor K de presa → ACOPLAMIENTO fuerte (los depredadores SÍ muerden)
  energyPerRes: 8,          // recurso → energía al pastar
  digestEff: 0.8,           // eficiencia de digestión (1−eff se disipa como calor; 2.1)

  prey: {
    senseFood: 30, fleeR: 28, speed: 2.0, radius: 3,   // fleeR moderado: la presa NO se zafa siempre (si no, el depredador es inútil y el test es moot)
    Gmax: 5, digest: 0.6, eatRate: 0.35, metab: 0.05,
    reproE: 9, reproCost: 4.5, cooldown: 30,
  },
  pred: {
    sensePrey: 65, speed: 3.4, radius: 5, attackRange: 7,   // claramente más rápido → caza eficaz (depredador que SÍ amenaza)
    Gmax: 22, digest: 1.1, metab: 0.085,
    gainFrac: 1.0,          // fracción de la energía+biomasa de la presa que entra a la tripa
    preyBiomass: 9,         // "materia" estructural de la presa (energía equivalente al cazarla) — base anti presa-magra
    reproE: 18, reproCost: 9, cooldown: 30,   // depredador RESPONSIVO: bien alimentado cría rápido → puede booms → sin freno, boom-bust
  },
  coverCoef: 0.75,          // refugio: en celda de vegetación plena, el alcance de detección del depredador cae este %
  moveCost: 0.004,          // coste de nado ∝ v² (energía → calor)
};

const PREY = 0, PRED = 1;

export class M2Sim {
  constructor({ size = 1000, seed = 1, satiety = true, cover = true, cap = 6000 } = {}) {
    this.size = size; this.cap = cap; this.satiety = satiety; this.cover = cover;
    this.rng = makeRng(seed);
    // Rejilla ∝ tamaño → celda de tamaño CONSTANTE (~cellRef u) → recurso total ∝ área (densidad de comida constante).
    // (Antes la rejilla era fija 50×50 → el recurso total no escalaba con el mundo → mundos grandes pasaban hambre.)
    this.cols = Math.max(8, Math.round(size / P.cellRef)); this.rows = this.cols; this.cellW = size / this.cols;
    this.res = new Float32Array(this.cols * this.rows).fill(P.resMax);

    // SoA
    this.x = new Float32Array(cap); this.y = new Float32Array(cap);
    this.E = new Float32Array(cap); this.G = new Float32Array(cap);
    this.type = new Uint8Array(cap); this.cd = new Float32Array(cap);
    this.alive = new Uint8Array(cap);
    this.free = new Int32Array(cap); for (let i = 0; i < cap; i++) this.free[i] = cap - 1 - i;
    this.freeTop = cap; this.active = new Int32Array(cap); this.nActive = 0;

    // hash (celda = mayor alcance sensorial → 1-2 anillos cubren la percepción)
    this.hc = P.pred.sensePrey; this.hCols = Math.max(1, Math.ceil(size / this.hc)); this.hRows = this.hCols;
    this.head = new Int32Array(this.hCols * this.hRows).fill(-1); this.next = new Int32Array(cap);

    this.tick = 0; this.nPrey = 0; this.nPred = 0;
  }

  _alloc() { if (this.freeTop === 0) return -1; const i = this.free[--this.freeTop]; this.alive[i] = 1; return i; }
  _kill(i) { this.alive[i] = 0; this.free[this.freeTop++] = i; }

  spawn(type, x, y, E) {
    const i = this._alloc(); if (i < 0) return -1;
    this.x[i] = x; this.y[i] = y; this.E[i] = E; this.G[i] = 0; this.type[i] = type;
    this.cd[i] = (this.rng.next() * (type === PREY ? P.prey.cooldown : P.pred.cooldown)) | 0;
    return i;
  }

  seed(nPrey, nPred) {
    const W = this.size, rng = this.rng;
    for (let k = 0; k < nPrey; k++) this.spawn(PREY, rng.next() * W, rng.next() * W, P.prey.reproE * 0.6);
    for (let k = 0; k < nPred; k++) this.spawn(PRED, rng.next() * W, rng.next() * W, P.pred.reproE * 0.6);
  }

  cellAt(x, y) {
    let cx = (x / this.cellW) | 0, cy = (y / this.cellW) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  step() {
    const W = this.size, rng = this.rng, res = this.res, cols = this.cols, rows = this.rows;

    // 1) Fotosíntesis (logística): entrada de energía al sistema.
    for (let c = 0; c < res.length; c++) { const r = res[c]; if (r < P.resMax) { let nr = r + P.regen * (1 - r / P.resMax); res[c] = nr > P.resMax ? P.resMax : nr; } }

    // 2) Lista activa + hash.
    let na = 0; for (let i = 0; i < this.cap; i++) if (this.alive[i]) this.active[na++] = i; this.nActive = na;
    this.head.fill(-1);
    for (let a = 0; a < na; a++) { const i = this.active[a];
      let hx = (this.x[i] / this.hc) | 0, hy = (this.y[i] / this.hc) | 0;
      if (hx < 0) hx = 0; else if (hx >= this.hCols) hx = this.hCols - 1;
      if (hy < 0) hy = 0; else if (hy >= this.hRows) hy = this.hRows - 1;
      const c = hy * this.hCols + hx; this.next[i] = this.head[c]; this.head[c] = i;
    }

    const x = this.x, y = this.y, E = this.E, G = this.G, type = this.type;
    const maxSer = this.cap; // (sin reuse-in-tick problem aquí: las crías nacen pero se saltan con un guard de tipo abajo)
    const born = []; // crías a sembrar tras el barrido (evita procesarlas este tick)

    for (let a = 0; a < na; a++) {
      const i = this.active[a]; if (!this.alive[i]) continue;
      const isPrey = type[i] === PREY;
      const ph = isPrey ? P.prey : P.pred;

      // --- PERCEPCIÓN (vecindad por hash, toroidal) ---
      let nearPredDX = 0, nearPredDY = 0, nearPredD2 = Infinity;   // presa: depredador más cercano (huir)
      let preyJ = -1, preyD2 = Infinity, preyDX = 0, preyDY = 0;    // depredador: presa más cercana (cazar)
      const sense = isPrey ? P.prey.fleeR : P.pred.sensePrey, sense2 = sense * sense;
      const hx = (x[i] / this.hc) | 0, hy = (y[i] / this.hc) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = ((hx + ox) % this.hCols + this.hCols) % this.hCols, gy = ((hy + oy) % this.hRows + this.hRows) % this.hRows;
        let j = this.head[gy * this.hCols + gx];
        while (j !== -1) {
          if (j !== i && this.alive[j] && type[j] !== type[i]) {
            let dx = x[j] - x[i], dy = y[j] - y[i];
            if (dx > W * 0.5) dx -= W; else if (dx < -W * 0.5) dx += W;
            if (dy > W * 0.5) dy -= W; else if (dy < -W * 0.5) dy += W;
            const d2 = dx * dx + dy * dy;
            if (isPrey) { // j es depredador
              if (d2 < sense2 && d2 < nearPredD2) { nearPredD2 = d2; nearPredDX = dx; nearPredDY = dy; }
            } else {      // j es presa
              // REFUGIO ESPACIAL (cover): la vegetación densa donde está la presa reduce el alcance de detección.
              let effSense2 = sense2;
              if (this.cover) { const rc = res[this.cellAt(x[j], y[j])] / P.resMax; const f = 1 - P.coverCoef * rc; effSense2 = sense2 * f * f; }
              if (d2 < effSense2 && d2 < preyD2) { preyD2 = d2; preyJ = j; preyDX = dx; preyDY = dy; }
            }
          }
          j = this.next[j];
        }
      }

      // --- CONDUCTA (codificada a mano) → vector de deseo (dvx,dvy) ---
      let dvx = 0, dvy = 0;
      if (isPrey) {
        if (nearPredD2 < Infinity) { const m = Math.sqrt(nearPredD2) || 1; dvx = -nearPredDX / m; dvy = -nearPredDY / m; } // huir
        else { // forrajear: gradiente de recurso (4 vecinos de celda)
          const ci = this.cellAt(x[i], y[i]), cx = ci % cols, cy = (ci / cols) | 0;
          const xl = cx > 0 ? ci - 1 : ci, xr = cx < cols - 1 ? ci + 1 : ci, yt = cy > 0 ? ci - cols : ci, yb = cy < rows - 1 ? ci + cols : ci;
          dvx = res[xr] - res[xl]; dvy = res[yb] - res[yt];
          const m = Math.sqrt(dvx * dvx + dvy * dvy);
          if (m < 1e-4) { const an = rng.next() * 6.283; dvx = Math.cos(an); dvy = Math.sin(an); } else { dvx /= m; dvy /= m; }
        }
      } else {
        if (preyJ !== -1) { const m = Math.sqrt(preyD2) || 1; dvx = preyDX / m; dvy = preyDY / m; } // perseguir
        else { const an = rng.next() * 6.283; dvx = Math.cos(an); dvy = Math.sin(an); }            // deambular
      }
      // mover (+ jitter), envoltura toroidal
      const sp = ph.speed;
      let mvx = dvx * sp + (rng.next() - 0.5) * 0.4, mvy = dvy * sp + (rng.next() - 0.5) * 0.4;
      let nx = x[i] + mvx, ny = y[i] + mvy;
      if (nx < 0) nx += W; else if (nx >= W) nx -= W; if (ny < 0) ny += W; else if (ny >= W) ny -= W;
      x[i] = nx; y[i] = ny;
      const v2 = mvx * mvx + mvy * mvy;

      // --- ALIMENTACIÓN → TRIPA (la saciedad es el límite, no handlingTime) ---
      const Gmax = this.satiety ? ph.Gmax : 1e9;   // satiety off → tripa infinita (sin saciedad: el control nunca satura)
      const room = Gmax - G[i];
      if (isPrey) {
        if (room > 0) {
          const ci = this.cellAt(x[i], y[i]);
          let take = Math.min(P.prey.eatRate, res[ci], room / P.energyPerRes);
          if (take > 0) { res[ci] -= take; G[i] += take * P.energyPerRes; }
        }
      } else {
        // cazar: si hay presa a alcance Y la tripa tiene hueco → la come (SIN probabilidad, SIN handlingTime).
        if (preyJ !== -1 && this.alive[preyJ] && room > 0 && preyD2 < (P.pred.attackRange + P.prey.radius) ** 2) {
          const gain = (E[preyJ] + P.pred.preyBiomass) * P.pred.gainFrac;
          G[i] += Math.min(gain, room);
          this._kill(preyJ);
        }
      }

      // --- DIGESTIÓN (tripa → reservas, con disipación) ---
      if (G[i] > 0) { const d = Math.min(ph.digest, G[i]); G[i] -= d; E[i] += d * P.digestEff; }

      // --- METABOLISMO (reservas → calor) + MUERTE ---
      E[i] -= ph.metab + P.moveCost * v2;
      if (E[i] <= 0) { this._kill(i); continue; }

      // --- REPRODUCCIÓN (inversión de reservas; cría del mismo tipo — sin genoma aún) ---
      if (this.cd[i] > 0) this.cd[i]--;
      else if (E[i] >= ph.reproE) {
        E[i] -= ph.reproCost;
        born.push(type[i], x[i] + (rng.next() - 0.5) * 8, y[i] + (rng.next() - 0.5) * 8, ph.reproCost * 0.75);
        this.cd[i] = ph.cooldown;
      }
    }

    // sembrar crías (fuera del barrido)
    for (let k = 0; k < born.length; k += 4) {
      let bx = born[k + 1], by = born[k + 2];
      if (bx < 0) bx += W; else if (bx >= W) bx -= W; if (by < 0) by += W; else if (by >= W) by -= W;
      this.spawn(born[k], bx, by, born[k + 3]);
    }

    // censo
    let np = 0, nq = 0; for (let a = 0; a < this.nActive; a++) { const i = this.active[a]; if (!this.alive[i]) continue; if (type[i] === PREY) np++; else nq++; }
    // recontar incluyendo crías
    np = 0; nq = 0; for (let i = 0; i < this.cap; i++) if (this.alive[i]) { if (type[i] === PREY) np++; else nq++; }
    this.nPrey = np; this.nPred = nq;
    this.tick++;
  }
}
