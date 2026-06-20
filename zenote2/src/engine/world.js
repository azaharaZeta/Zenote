// CAPA A — LEYES DEL MUNDO (2.1). Código KEEPER: la base física del motor real (M5+ construye encima).
// Dos monedas INDEPENDIENTES (2.1 §0): MATERIA cerrada (cicla: nutriente↔organismo↔detrito↔nutriente) y ENERGÍA
// abierta (entra como LUZ, se almacena, sale como CALOR). Su independencia dimensional hace imposible la trampa
// "energía = materia relabelada" del modelo viejo. Campos en rejilla (∝ tamaño → densidad constante), toro.
//
// Compartimentos (el PRODUCTOR es la VEGETACIÓN parametrizada, no los organismos — todos los organismos son ANIMALES):
//   MATERIA  = Σ nutrient (inorgánica) + Σ veg (vegetación) + Σ detritusM (orgánica muerta) + Σ animales.mass   = CONSTANTE
//   ENERGÍA  = Σ animales.E + Σ veg·vegEcoef (embebida en vegetación) + Σ detritusE  ;  entra: lightCaptured (vía vegetación) ;  sale: heat
// La LUZ ya no la captan los organismos: la capta la VEGETACIÓN al crecer (vegStep). Los animales obtienen energía PASTÁNDOLA
// (o cazando/carroñeando, en sim). Toda transacción re-enruta materia (conserva) y contabiliza energía (disipa).

import { makeRng } from '../util/rng.js';
import { WORLD_P } from '../config.js';   // parámetros del mundo: fuente única en config.js
export { WORLD_P };

export class World {
  constructor(size, seed = 1, P = WORLD_P) {
    this.P = P; this.size = size;
    this.cols = Math.max(8, Math.round(size / P.cellRef)); this.rows = this.cols;
    this.cellW = size / this.cols;
    const N = this.cols * this.rows;
    this.light0 = new Float32Array(N);     // luz base espacial (heterogénea, periódica en el toro)
    this.nutrient = new Float32Array(N);   // N: materia inorgánica
    this.veg = new Float32Array(N);        // VEGETACIÓN: biomasa del productor (materia; energía embebida = veg·vegEcoef)
    this.detritusM = new Float32Array(N);  // materia orgánica muerta
    this.detritusE = new Float32Array(N);  // energía residual del detrito
    this._scratch = new Float32Array(N);
    this._buildLight(seed);
    // Libro mayor (acumuladores de energía abierta): monótonos.
    this.heat = 0;            // energía disipada que abandonó el sistema (sumidero; monótono ↑)
    this.lightCaptured = 0;   // energía que entró por la VEGETACIÓN al captar luz (fuente; monótono ↑)
    this.daylight = 1;        // multiplicador día/noche del tick actual
    this.lightMul = 1;        // multiplicador GLOBAL de luz (lab, en vivo): escala la productividad sin re-hornear light0
  }

  // Luz base: SUMA DE LÓBULOS = ondas planas con frecuencia/dirección/fase ALEATORIAS (por semilla) → parches ricos/pobres
  // sin costura en el toro (freqs enteras → periódicas), distintos en cada mundo "desde el inicio". Cada lóbulo lleva además
  // freqs/offsets de VAGABUNDEO (para la deriva temporal de stepLight). El "abismo" puede así formar ZONAS que se
  // reorganizan sin dirección neta (no una traslación lineal).
  _buildLight(seed) {
    const rng = makeRng(seed), L = 6; this._lobes = []; let sumAmp = 0;
    for (let k = 0; k < L; k++) {
      const kx = 1 + (rng.next() * 3 | 0);                  // 1..3 ciclos en x (ENTERO → periódico en el toro)
      const ky = (rng.next() * 5 | 0) - 2;                  // -2..2 en y (orientación variada, entero)
      const ph = rng.next() * 6.283, amp = 0.5 + rng.next() * 0.7;
      const wf = [0.5 + rng.next() * 1.5, 0.5 + rng.next() * 1.5, 0.5 + rng.next() * 1.5];   // freqs de vagabundeo (incommensurables → cuasi-aperiódico)
      const wo = [rng.next() * 6.283, rng.next() * 6.283, rng.next() * 6.283];
      this._lobes.push({ kx, ky, ph, amp, wf, wo }); sumAmp += amp;
    }
    this._lobeNorm = sumAmp > 0 ? 1 / (0.62 * sumAmp) : 1;   // normaliza a ~[-1,1] (factor <1 = más contraste; se clampa)
    this._ep = new Float64Array(L);                          // fase efectiva por lóbulo (preasignada; sin asignar en re-horneado)
    this._fillLight(0);
  }

  // Rellena light0 en el "tiempo de flujo" s. Cada lóbulo VAGABUNDEA su fase = base + WA·(osciladores lentos) → al avanzar s
  // las zonas se forman/disuelven y se mueven en direcciones variables (NO traslación lineal). s=0 = patrón base.
  _fillLight(s) {
    const { cols, rows } = this, P = this.P, lobes = this._lobes, norm = this._lobeNorm, ep = this._ep, WA = 3.0;
    for (let k = 0; k < lobes.length; k++) { const l = lobes[k];
      ep[k] = l.ph + WA * (Math.sin(s * l.wf[0] + l.wo[0]) + 0.6 * Math.sin(s * l.wf[1] + l.wo[1]) + 0.4 * Math.sin(s * l.wf[2] + l.wo[2])); }
    for (let y = 0; y < rows; y++) { const v = y / rows * 6.283;
      for (let x = 0; x < cols; x++) { const u = x / cols * 6.283;
        let n = 0; for (let k = 0; k < lobes.length; k++) { const l = lobes[k]; n += l.amp * Math.sin(l.kx * u + l.ky * v + ep[k]); }
        n *= norm; n = n < -1 ? -1 : n > 1 ? 1 : n;                         // clamp [-1,1]
        this.light0[y * cols + x] = P.lightBase * (1 - P.lightContrast + P.lightContrast * (0.5 + 0.5 * n));
      }
    }
  }

  // CORRIENTE DEL ABISMO: re-hornea el campo de luz avanzando el "tiempo de flujo" s = lightFlow·tick → el fondo (paisaje de
  // recurso) FLUYE formando zonas que se reorganizan; los organismos lo persiguen vía su sensor de ∇luz (no hay asentamiento
  // permanente). Throttle por lightFlowEvery (la luz cambia despacio). lightFlow=0 → light0 NO cambia tras el horneado inicial
  // (byte-idéntico). Determinista (función de tick). La luz es ENERGÍA (fuente abierta) → variar el campo no afecta a la conservación.
  stepLight(tick) {
    const P = this.P; if (!(P.lightFlow > 0) || tick % P.lightFlowEvery !== 0) return;
    this._fillLight(P.lightFlow * tick);
  }

  cellAt(x, y) {
    let cx = (x / this.cellW) | 0, cy = (y / this.cellW) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  // Ciclo día/noche (multiplicador global ∈ [1-amp, 1+amp], ≥0).
  setDayNight(tick) {
    const P = this.P;
    this.daylight = P.dayNightAmp > 0 ? Math.max(0, 1 + P.dayNightAmp * Math.sin(tick / P.dayNightPeriod * 6.283)) : 1;
  }

  // VEGETACIÓN (productor parametrizado): crece logísticamente captando LUZ (energía ENTRA) y consumiendo NUTRIENTE (materia),
  // y senesce a detrito. K(celda) = vegKcoef·luz local → los parches vegetales SIGUEN al campo de luz (que puede fluir). El
  // brote `vegSeed` permite recolonizar celdas vacías. CONSERVA: materia nutriente→veg→detrito · energía luz→veg (captada) y
  // veg→calor (senescencia). Lo PASTAN los animales (transacción en sim). Frontera genotipo→física: la vegetación es física del
  // mundo (no evoluciona); qué animal la explota lo dicta la selección.
  vegStep() {
    const P = this.P, veg = this.veg, N = this.nutrient, Dm = this.detritusM, prev = this._scratch;
    const g = P.vegGrowth, kc = P.vegKcoef, ec = P.vegEcoef, dec = P.vegDecay, seed = P.vegSeed, lm = this.lightMul * this.daylight;
    const cols = this.cols, rows = this.rows, lbase = P.lightBase || 1; let p = P.patchiness || 0; if (p > 1) p = 1;
    prev.set(veg);   // snapshot del tick previo → rebrote orden-independiente (como zenote1)
    for (let y = 0; y < rows; y++) {
      const up = ((y - 1 + rows) % rows) * cols, dn = ((y + 1) % rows) * cols, rw = y * cols;
      for (let x = 0; x < cols; x++) {
        const i = rw + x, K = kc * this.light0[i] * lm;
        if (K > 1e-6) { const r = prev[i], head = K - r;
          if (head > 0) {
            let inc;
            if (p <= 0) inc = g * (r + seed) * (1 - r / K);                          // logístico simple
            else {                                                                    // logístico + DIFUSIÓN de semilla → parches migrantes
              const xl = (x - 1 + cols) % cols, xr = (x + 1) % cols;
              const meanNb = (prev[rw + xl] + prev[rw + xr] + prev[up + x] + prev[dn + x]) * 0.25;
              const seeded = g * (seed + r / K + meanNb / K);                         // crece donde ya hay pasto o lo hay al lado (siembra al vecindario)
              inc = (1 - p) * (g * (r + seed) * (1 - r / K)) + p * seeded;
            }
            // PRODUCTIVIDAD ∝ LUZ: la veg crece más rápido donde hay más luz (factor light/lightBase ∈ ~[0.3,1]) → las zonas
            // frondosas SIGUEN al campo de luz → la "Corriente del abismo" (deriva de la luz) MUEVE la vegetación visiblemente.
            inc *= (this.light0[i] * lm) / lbase;
            if (inc > head) inc = head; if (inc < 0) inc = 0;
            if (inc > 0) { let take = inc; if (take > N[i]) take = N[i]; if (take > 0) { veg[i] += take; N[i] -= take; this.lightCaptured += take * ec; } }   // materia nutriente→veg; energía luz captada
          }
        }
        if (veg[i] > 0) { const die = dec * veg[i]; veg[i] -= die; Dm[i] += die; this.heat += die * ec; }   // senescencia: materia→detrito, energía→calor
      }
    }
  }

  // Descomposición del detrito (por tick): materia → nutriente (CONSERVA), energía residual → calor (DISIPA).
  decomposeStep() {
    const r = this.P.decompose; if (r <= 0) return;
    const Dm = this.detritusM, De = this.detritusE, N = this.nutrient;
    for (let i = 0; i < Dm.length; i++) {
      if (Dm[i] > 0) { const d = Dm[i] * r; Dm[i] -= d; N[i] += d; }          // materia: detrito → nutriente
      if (De[i] > 0) { const d = De[i] * r; De[i] -= d; this.heat += d; }      // energía: residual → calor (se va)
    }
  }

  // Difusión conservativa (4 vecinos, toro) de un campo. Σ constante.
  _diffuse(field, rate) {
    if (rate <= 0) return;
    const cols = this.cols, rows = this.rows, prev = this._scratch; prev.set(field);
    for (let y = 0; y < rows; y++) {
      const up = ((y - 1 + rows) % rows) * cols, dn = ((y + 1) % rows) * cols, row = y * cols;
      for (let x = 0; x < cols; x++) {
        const i = row + x, xl = (x - 1 + cols) % cols, xr = (x + 1) % cols;
        const mean4 = (prev[row + xl] + prev[row + xr] + prev[up + x] + prev[dn + x]) * 0.25;
        field[i] = prev[i] + rate * (mean4 - prev[i]);
      }
    }
  }
  diffuseStep() { this._diffuse(this.nutrient, this.P.diffuseN); this._diffuse(this.veg, this.P.vegDiffuse); this._diffuse(this.detritusM, this.P.diffuseDet); this._diffuse(this.detritusE, this.P.diffuseDet); }

  // --- Totales del libro mayor (para invariantes) ---
  totalNutrient() { let s = 0; for (let i = 0; i < this.nutrient.length; i++) s += this.nutrient[i]; return s; }
  totalVeg() { let s = 0; for (let i = 0; i < this.veg.length; i++) s += this.veg[i]; return s; }   // biomasa vegetal (materia); su energía = ·vegEcoef
  totalDetritusM() { let s = 0; for (let i = 0; i < this.detritusM.length; i++) s += this.detritusM[i]; return s; }
  totalDetritusE() { let s = 0; for (let i = 0; i < this.detritusE.length; i++) s += this.detritusE[i]; return s; }
}
