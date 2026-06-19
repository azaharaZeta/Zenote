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

import { develop, mutate, makeFounder, recombine, seedBrain, BRAIN, BRAIN_W } from './genome.js';
import { computePhenotype, phenoDistance } from './phenotype.js';
import { SpatialHash } from './hash.js';
import { makeRng } from '../util/rng.js';

export const SIM_P = {
  photoEff: 0.05, photoHalf: 40,     // captación: share de la luz de la celda ∝ photoCap/(photoCap+half)
  baseCost: 0.015, massCost: 0.004,  // metabolismo: basal + ∝ masa
  moveCost: 0.004,                   // coste de nado ∝ drag·v² (energía → calor)
  reproE: 16, investE: 7, cooldown: 50,   // reproducción: umbral, energía a la cría, enfriamiento
  eDensity: 0,                       // M6.1 (2.3 energía-en-biomasa): MEDIDO y dejado OFF. Probado eD=4 (el cuerpo guarda energía,
                                     // pagada al nacer y liberada al ser comido): conserva (invariantes ✓) PERO net-negativo aquí —
                                     // su coste embebido al nacer penaliza los cuerpos grandes (depredadores) y NO compensa porque la
                                     // presa NO es magra (los autótrofos llevan reservas). El "problema de la presa magra" no se
                                     // manifiesta en este modelo. Código parametrizado (eDensity>0) por si hace falta en cadenas
                                     // profundas; por defecto 0 = separación limpia materia/energía de M5. El limitante real de la
                                     // heterotrofía es la CONDUCTA (M6.3), no la energía.
  birthR: 1,                         // radio (celdas) del vecindario del que la cría reúne MATERIA al nacer
  gutBase: 4, gutPerMass: 4, digestRate: 0.6,   // M6.2: TRIPA (energía orgánica en tránsito). Comer la llena (tope ∝ masa)
                                     // → SACIEDAD: lleno no caza más (respuesta funcional tipo II EMERGENTE, sin handlingTime).
                                     // Digiere a reservas a ritmo limitado. La tripa cuenta en la energía total (conserva).
  eatReach: 4,                       // alcance extra de captura (u)
  preyMassMax: 1.6,                  // factor: presa manejable si su masa ≤ maxMouthR·este (boca→tamaño de presa)
  ηene: 0.85,                        // eficiencia energética de la ingesta
  initE: 10,                         // reservas iniciales de los fundadores
  mateRadius: 50,                    // M7: radio de búsqueda de pareja (u)
  mateCompat: 0.5,                   // M7: umbral de compatibilidad reproductiva = distancia FENOTÍPICA (masa/luz/boca)
                                     // normalizada. Apareamiento asortativo por similitud de forma (sin métrica génica con
                                     // loci excluidos a mano). NO da especies discretas: la distancia con umbral es CLINAL y
                                     // no transitiva → estructura de componentes (ver m7), no especiación limpia. Es una
                                     // métrica FENOTÍPICA elegida a mano (3 ejes), no la señal↔preferencia evolvable de D14/D16.
                                     // Sin pareja compatible → asexual.
};

export class Sim {
  constructor(world, { seed = 1, cap = 8000, eDensity = SIM_P.eDensity, randomBehavior = false, freezeBrain = false } = {}) {
    this.world = world; this.cap = cap; this.rng = makeRng(seed); this.tick = 0; this.eD = eDensity;
    this.randomBehavior = randomBehavior;   // control: salidas aleatorias (ignora el cerebro) → mide si la conducta neuronal es ADAPTATIVA
    // control M6.3: cerebro CONGELADO a un seedBrain canónico (sin mutación, recombinación ni plasticidad del cerebro;
    // la morfología SÍ evoluciona). Aísla la conducta SEMBRADA de la aportación de la evolución/aprendizaje del cerebro.
    this.freezeBrain = freezeBrain; this._seedBrain = freezeBrain ? seedBrain(this.rng) : null;
    this.x = new Float32Array(cap); this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap);
    this.E = new Float32Array(cap); this.gut = new Float32Array(cap); this.age = new Float32Array(cap); this.cd = new Float32Array(cap);
    this.alive = new Uint8Array(cap); this.serial = new Int32Array(cap); this._serial = 0;
    this.genome = new Array(cap).fill(null);
    this.body = new Array(cap).fill(null);   // cuerpo desarrollado (partes) cacheado al nacer → lo lee el render (M5.5)
    // fenotipo cacheado (de develop+computePhenotype al nacer)
    this.mass = new Float32Array(cap); this.photoCap = new Float32Array(cap); this.vmax = new Float32Array(cap);
    this.drag = new Float32Array(cap); this.mouthCap = new Float32Array(cap); this.maxMouthR = new Float32Array(cap);
    this.thrust = new Float32Array(cap);   // empuje cacheado (solo para el oficio trófico del render; no entra en la sim)
    this.free = new Int32Array(cap); for (let i = 0; i < cap; i++) this.free[i] = cap - 1 - i; this.freeTop = cap;
    this.active = new Int32Array(cap); this.nA = 0;
    // M4: la celda del hash = mayor alcance que el barrido 3×3 debe cubrir. Derivada (no hardcodeada): el piso 60 es
    // el alcance de sensado de presa/amenaza; mateRadius (búsqueda de pareja) la eleva si lo supera → así el barrido
    // nunca falla en silencio. Hoy mateRadius=50 < 60 → celda 60 (igual que antes).
    this.hash = new SpatialHash(world.size, Math.max(60, SIM_P.mateRadius)); this.hash.setCapacity(cap);
    this.kills = 0; this.sexBirths = 0; this.asexBirths = 0; this.starved = 0;   // instrumentación: depredación · vía reproductiva · muertes por inanición (causas de muerte = kills + starved)
    // M6.3 — cerebro: COPIA DE TRABAJO de pesos por agente (aprendida en vida; NO heredable) + estado oculto recurrente.
    this.wbrain = new Float32Array(cap * BRAIN_W); this.hidden = new Float32Array(cap * BRAIN.H);
    this._in = new Float32Array(BRAIN.I); this._hid = new Float32Array(BRAIN.H); this._out = new Float32Array(BRAIN.O);
  }

  // cachea el cuerpo desarrollado + su fenotipo en la SoA del slot i (lo leen el render y las transacciones)
  _setBody(i, parts, ph) { this.body[i] = parts;
    this.mass[i] = ph.mass; this.photoCap[i] = ph.photoCap; this.vmax[i] = ph.vmax; this.drag[i] = ph.drag;
    this.mouthCap[i] = ph.mouthCap; this.maxMouthR[i] = ph.maxMouthR; this.thrust[i] = ph.thrust; }
  _expr(i) { const parts = develop(this.genome[i]); this._setBody(i, parts, computePhenotype(parts)); }

  spawn(genome, x, y, E, parts = null, ph = null) {
    if (this.freeTop === 0) return -1; const i = this.free[--this.freeTop];
    this.alive[i] = 1; this.serial[i] = ++this._serial; this.genome[i] = genome;
    if (this.freezeBrain && genome.brain) genome.brain.set(this._seedBrain);   // control: anula la herencia/mutación del cerebro → todos usan el seedBrain canónico
    this.x[i] = x; this.y[i] = y; this.vx[i] = 0; this.vy[i] = 0; this.E[i] = E; this.gut[i] = 0; this.age[i] = 0;
    this.cd[i] = (this.rng.next() * SIM_P.cooldown) | 0;
    if (parts) this._setBody(i, parts, ph); else this._expr(i);   // M2: reusa el cuerpo ya desarrollado en el gate (evita doble develop)
    // cerebro de trabajo = cerebro de NACIMIENTO (genoma); memoria a cero (la plasticidad parte de aquí; Baldwin)
    const b = genome.brain, wb = i * BRAIN_W; for (let k = 0; k < BRAIN_W; k++) this.wbrain[wb + k] = b ? b[k] : 0;
    const hb = i * BRAIN.H; for (let k = 0; k < BRAIN.H; k++) this.hidden[hb + k] = 0;
    return i;
  }

  seed(n) { const W = this.world, rng = this.rng;
    for (let k = 0; k < n; k++) this.spawn(makeFounder(rng), rng.next() * W.size, rng.next() * W.size, SIM_P.initE); }

  // materia del vecindario (para que la cría construya su cuerpo) — gate de natalidad endógeno (2.1)
  _nutrientAround(cell, R) { const W = this.world, cols = W.cols, rows = W.rows, cx = cell % cols, cy = (cell / cols) | 0; let s = 0;
    for (let dy = -R; dy <= R; dy++) { const yy = ((cy + dy) % rows + rows) % rows; for (let dx = -R; dx <= R; dx++) { const xx = ((cx + dx) % cols + cols) % cols; s += W.nutrient[yy * cols + xx]; } } return s; }
  _takeNutrientAround(cell, R, amount) { const W = this.world, total = this._nutrientAround(cell, R); if (total <= 0) return; const f = amount / total, cols = W.cols, rows = W.rows, cx = cell % cols, cy = (cell / cols) | 0;
    for (let dy = -R; dy <= R; dy++) { const yy = ((cy + dy) % rows + rows) % rows; for (let dx = -R; dx <= R; dx++) { const idx = yy * cols + ((cx + dx) % cols + cols) % cols; W.nutrient[idx] -= W.nutrient[idx] * f; } } }

  // M7 — pareja compatible más cercana (hash): vivo, dentro de mateRadius, distancia FENOTÍPICA < mateCompat. El
  // apareamiento asortativo por divergencia morfológica (métrica fenotípica fija de 3 ejes, no señal↔preferencia
  // evolvable; aislamiento clinal, no especies discretas — ver mateCompat y m7). -1 si no hay.
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
        if (d2 < bestD &&   // compatibilidad fenotípica (masa/luz/boca normalizadas) < umbral
            phenoDistance(this.mass[i], this.photoCap[i], this.mouthCap[i], this.mass[j], this.photoCap[j], this.mouthCap[j]) < P.mateCompat) { bestD = d2; best = j; }
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
    const born = [];   // nacimientos diferidos (6 entradas/cría: genoma, x, y, E, cuerpo, fenotipo) → spawn al final del tick
    for (let a = 0; a < na; a++) {
      const i = this.active[a]; if (!this.alive[i]) continue;   // pudo morir antes en ESTE tick (depredación)
      const cell = W.cellAt(x[i], y[i]);
      const E0 = E[i];   // M6.3: reservas al inicio del tick → recompensa de plasticidad = ΔE

      // FOTOSÍNTESIS: capta una porción de la luz de la celda ∝ photoCap (compite por sombra/ocupación). Energía ENTRA.
      if (this.photoCap[i] > 0) { const dE = P.photoEff * W.lightAt(cell) * (this.photoCap[i] / (this.photoCap[i] + P.photoHalf)) / Math.max(1, W.occ[cell]);
        if (dE > 0) { E[i] += dE; W.lightCaptured += dE; } }

      // ---- SENSADO: ∇luz + presa/amenaza más cercanas (un barrido del hash) ----
      const cols = W.cols, rows = W.rows, cx = cell % cols, cy = (cell / cols) | 0;
      // B2: vecinos TOROIDALES (el mundo envuelve) → ∇luz coherente también en las celdas de borde (antes clampaba a
      // `cell` allí → banda de artefacto). Índices envueltos: izq/der en x, arriba/abajo en y.
      const xl = cx > 0 ? cell - 1 : cell + (cols - 1), xr = cx < cols - 1 ? cell + 1 : cell - (cols - 1);
      const yt = cy > 0 ? cell - cols : cell + (rows - 1) * cols, yb = cy < rows - 1 ? cell + cols : cell - (rows - 1) * cols;
      const lgx = (W.light0[xr] - W.light0[xl]) * 8, lgy = (W.light0[yb] - W.light0[yt]) * 8;
      let preyJ = -1, preyD = 1e9, preyDX = 0, preyDY = 0, thD = 1e9, thDX = 0, thDY = 0;
      const myMass = this.mass[i], myMouth = this.mouthCap[i], myReach = this.maxMouthR[i] * P.preyMassMax;
      { const hc = this.hash.cell, hx = (x[i] / hc) | 0, hy = (y[i] / hc) | 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const gx = ((hx + ox) % this.hash.cols + this.hash.cols) % this.hash.cols, gy = ((hy + oy) % this.hash.rows + this.hash.rows) % this.hash.rows;
          let j = this.hash.head[gy * this.hash.cols + gx];
          while (j !== -1) { if (j !== i && this.alive[j]) {
            let dx = x[j] - x[i], dy = y[j] - y[i]; if (dx > size * 0.5) dx -= size; else if (dx < -size * 0.5) dx += size; if (dy > size * 0.5) dy -= size; else if (dy < -size * 0.5) dy += size;
            const d2 = dx * dx + dy * dy;
            if (myMouth > 0 && this.mass[j] < myMass && this.mass[j] <= myReach && d2 < preyD) { preyD = d2; preyJ = j; preyDX = dx; preyDY = dy; }       // presa (puedo comerla)
            if (this.mouthCap[j] > 0 && myMass < this.mass[j] && myMass <= this.maxMouthR[j] * P.preyMassMax && d2 < thD) { thD = d2; thDX = dx; thDY = dy; } // amenaza (puede comerme)
          } j = this.hash.next[j]; } }
      }
      if (preyJ >= 0) { const m = Math.sqrt(preyD) || 1; preyDX /= m; preyDY /= m; }
      if (thD < 1e9) { const m = Math.sqrt(thD) || 1; thDX /= m; thDY /= m; }

      // ---- CEREBRO (forward Elman; pesos = copia de trabajo aprendida). Motor de la conducta; arranca SEMBRADO (seedBrain) y evoluciona/aprende. ----
      const I = BRAIN.I, H = BRAIN.H, O = BRAIN.O, inp = this._in, hid = this._hid, out = this._out, wb = i * BRAIN_W, hb = i * H, Wt = this.wbrain, PH = this.hidden;
      const wHh = I * H, bH = I * H + H * H, wHo = bH + H, bO = wHo + H * O;
      inp[0] = lgx < -1 ? -1 : lgx > 1 ? 1 : lgx; inp[1] = lgy < -1 ? -1 : lgy > 1 ? 1 : lgy; inp[2] = preyDX; inp[3] = preyDY; inp[4] = thDX; inp[5] = thDY;
      const h6 = (E[i] / P.reproE) * 2 - 1; inp[6] = h6 > 1 ? 1 : h6 < -1 ? -1 : h6;   // B3: hambre acotada a [-1,1] (consistencia con el resto de entradas)
      const spd0 = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]); inp[7] = this.vmax[i] > 1e-4 ? (spd0 / this.vmax[i]) * 2 - 1 : -1;
      for (let h = 0; h < H; h++) { let s = Wt[wb + bH + h]; for (let k = 0; k < I; k++) s += inp[k] * Wt[wb + k * H + h]; for (let p = 0; p < H; p++) s += PH[hb + p] * Wt[wb + wHh + p * H + h]; hid[h] = Math.tanh(s); }
      for (let o = 0; o < O; o++) { let s = Wt[wb + bO + o]; for (let h = 0; h < H; h++) s += hid[h] * Wt[wb + wHo + h * O + o]; out[o] = Math.tanh(s); }
      if (this.randomBehavior) { out[0] = rng.next() * 2 - 1; out[1] = rng.next() * 2 - 1; out[2] = rng.next() * 2 - 1; out[3] = rng.next() * 2 - 1; }   // control: ignora el cerebro

      // ---- MOVIMIENTO desde las salidas (0,1 dirección · 2 throttle); coste ∝ drag·v² ----
      const dxo = out[0], dyo = out[1], dm = Math.sqrt(dxo * dxo + dyo * dyo), throttle = (out[2] + 1) * 0.5;
      if (dm > 1e-3) { const sp = this.vmax[i] * throttle; vx[i] = dxo / dm * sp; vy[i] = dyo / dm * sp; } else { vx[i] *= 0.5; vy[i] *= 0.5; }
      let nx = x[i] + vx[i], ny = y[i] + vy[i]; if (nx < 0) nx += size; else if (nx >= size) nx -= size; if (ny < 0) ny += size; else if (ny >= size) ny -= size; x[i] = nx; y[i] = ny;
      const v2 = vx[i] * vx[i] + vy[i] * vy[i];

      // ---- INGESTA: el cerebro DECIDE atacar (out[3]); en contacto con la presa, la come (CONSERVA) ----
      const attack = (out[3] + 1) * 0.5;
      const Gmax = P.gutBase + P.gutPerMass * this.mass[i];   // capacidad de tripa ∝ masa
      if (preyJ >= 0 && myMouth > 0 && attack > 0.5 && this.gut[i] < Gmax && this.alive[preyJ]) { const reach = this.maxMouthR[i] + P.eatReach;   // SACIEDAD: tripa llena no caza
        if (preyD < reach * reach) { const pc = W.cellAt(x[preyJ], y[preyJ]);
          const preyEnergy = E[preyJ] + this.gut[preyJ] + this.mass[preyJ] * this.eD;   // reservas + tripa + cuerpo de la presa
          const ge = P.ηene * preyEnergy, room = Gmax - this.gut[i], intoGut = ge < room ? ge : room;
          this.gut[i] += intoGut; W.detritusE[pc] += preyEnergy - intoGut;              // lo asimilable → TRIPA; el resto → detrito (CONSERVA)
          W.detritusM[pc] += this.mass[preyJ];
          this.alive[preyJ] = 0; this.free[this.freeTop++] = preyJ; this.genome[preyJ] = null; this.kills++; } }
      // DIGESTIÓN: la tripa pasa a reservas a ritmo limitado (energía en tránsito → utilizable)
      if (this.gut[i] > 0) { const d = this.gut[i] < P.digestRate ? this.gut[i] : P.digestRate; this.gut[i] -= d; E[i] += d; }

      // METABOLISMO: reservas → calor (basal + ∝masa + nado). Muerte si se agotan → cuerpo a detrito.
      const cost = P.baseCost + P.massCost * this.mass[i] + P.moveCost * v2 * this.drag[i];
      const spend = Math.min(E[i], cost); E[i] -= spend; W.heat += spend;
      if (E[i] <= 1e-6) { W.detritusM[cell] += this.mass[i]; W.detritusE[cell] += (E[i] > 0 ? E[i] : 0) + this.gut[i] + this.mass[i] * this.eD; this.alive[i] = 0; this.free[this.freeTop++] = i; this.genome[i] = null; this.starved++; continue; }

      // ---- PLASTICIDAD (Hebbiano modulado por RECOMPENSA fisiológica = ΔE del tick; NO es objetivo de conducta) ----
      // El cerebro aprende EN VIDA lo que recupera energía (venga de donde venga) → suaviza los valles conductuales
      // (Baldwin). Modifica la copia de TRABAJO (Wt), nunca el cerebro de nacimiento (genoma) → no se hereda lo aprendido.
      if (!this.freezeBrain) { let reward = E[i] - E0; reward = reward > 0.5 ? 0.5 : reward < -0.5 ? -0.5 : reward; const lr = 0.02 * reward;
        if (lr !== 0) {
          for (let h = 0; h < H; h++) { const po = hid[h];
            for (let k = 0; k < I; k++) { const idx = wb + k * H + h; let w = Wt[idx] + lr * inp[k] * po; Wt[idx] = w < -3 ? -3 : w > 3 ? 3 : w; }
            for (let p = 0; p < H; p++) { const idx = wb + wHh + p * H + h; let w = Wt[idx] + lr * PH[hb + p] * po; Wt[idx] = w < -3 ? -3 : w > 3 ? 3 : w; } }
          for (let o = 0; o < O; o++) { const po = out[o]; for (let h = 0; h < H; h++) { const idx = wb + wHo + h * O + o; let w = Wt[idx] + lr * hid[h] * po; Wt[idx] = w < -3 ? -3 : w > 3 ? 3 : w; } }
        }
      }
      for (let h = 0; h < H; h++) PH[hb + h] = hid[h];   // memoria recurrente para el próximo tick

      // REPRODUCCIÓN asexual + MUTACIÓN: la cría desarrolla su (posiblemente mutado) cuerpo; su MATERIA sale del
      // nutriente local (gate endógeno: no nace sin materia), su ENERGÍA del progenitor. Conserva ambas.
      this.age[i]++; if (this.cd[i] > 0) this.cd[i]--;
      else if (E[i] >= P.reproE) {
        const mate = this._findMate(i);   // M7: pareja compatible cercana → SEXUAL (recombinación homóloga); si no → asexual
        const childG = mate >= 0 ? mutate(recombine(this.genome[i], this.genome[mate], rng), rng) : mutate(this.genome[i], rng);
        const childBody = develop(childG), childPh = computePhenotype(childBody);   // M2: desarrolla UNA vez; spawn lo reusa
        const eCost = P.investE + childPh.mass * this.eD;        // ENERGÍA: reservas de la cría + energía EMBEBIDA en su cuerpo (M6.1)
        // A1 — RESERVAR el slot ANTES de cobrar. El nacimiento se difiere a `born` y se materializa con spawn() al
        // final del tick; si el pool estuviera lleno spawn devolvería -1 y la materia/energía YA cobradas aquí se
        // perderían (fuga de conservación). `freeTop - cunas ya comprometidas este tick` es el hueco disponible;
        // freeTop sólo CRECE con las muertes posteriores del bucle → exigirlo aquí es conservador y garantiza que
        // todo cobro nazca. (`born.length / 6` = nacimientos ya en cola, 6 entradas c/u.)
        if (E[i] >= eCost && this.freeTop - (born.length / 6 | 0) > 0 && this._nutrientAround(cell, P.birthR) >= childPh.mass) {
          this._takeNutrientAround(cell, P.birthR, childPh.mass);   // MATERIA: nutriente → cuerpo de la cría
          E[i] -= eCost; this.cd[i] = P.cooldown;                   // el progenitor paga reservas + cuerpo de la cría
          if (mate >= 0) this.sexBirths++; else this.asexBirths++;
          born.push(childG, x[i] + (rng.next() - 0.5) * 6, y[i] + (rng.next() - 0.5) * 6, P.investE, childBody, childPh);
        }
      }
    }
    for (let k = 0; k < born.length; k += 6) { let bx = born[k + 1], by = born[k + 2];
      if (bx < 0) bx += size; else if (bx >= size) bx -= size; if (by < 0) by += size; else if (by >= size) by -= size;
      this.spawn(born[k], bx, by, born[k + 3], born[k + 4], born[k + 5]); }

    W.decomposeStep(); W.diffuseStep(); this.tick++;
  }

  pop() { let p = 0; for (let i = 0; i < this.cap; i++) if (this.alive[i]) p++; return p; }
  totalMass() { let m = 0; for (let i = 0; i < this.cap; i++) if (this.alive[i]) m += this.mass[i]; return m; }
  totalE() { let e = 0; for (let i = 0; i < this.cap; i++) if (this.alive[i]) e += this.E[i]; return e; }
}
