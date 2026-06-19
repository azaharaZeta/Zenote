// CAPA A — LEYES DEL MUNDO (2.1). Código KEEPER: la base física del motor real (M5+ construye encima).
// Dos monedas INDEPENDIENTES (2.1 §0): MATERIA cerrada (cicla: nutriente↔organismo↔detrito↔nutriente) y ENERGÍA
// abierta (entra como LUZ, se almacena, sale como CALOR). Su independencia dimensional hace imposible la trampa
// "energía = materia relabelada" del modelo viejo. Campos en rejilla (∝ tamaño → densidad constante), toro.
//
// Compartimentos:
//   MATERIA  = Σ nutrient (inorgánica) + Σ detritusM (orgánica muerta) + Σ organismos.mass   = CONSTANTE
//   ENERGÍA  = Σ organismos.E (reservas) + Σ detritusE (residual)  ;  entra: lightCaptured  ;  sale: heat
// El motor de transacciones (fotosíntesis/crecimiento/ingesta/metabolismo/muerte/descomposición) vive en quien
// usa el mundo (la sonda M4, luego el organismo M5); aquí están los CAMPOS, la difusión/descomposición, la luz y
// los acumuladores del libro mayor. Toda transacción re-enruta materia (conserva) y contabiliza energía (disipa).

import { makeRng } from '../util/rng.js';

export const WORLD_P = {
  cellRef: 20,          // tamaño de celda (u) constante → rejilla ∝ tamaño de mundo (recurso/luz total ∝ área)
  lightBase: 0.06,      // irradiancia base por celda y tick (energía/celda/tick) — la FUENTE; 0 = noche eterna (test)
  lightContrast: 0.7,   // heterogeneidad espacial de la luz (0 uniforme · 1 muy en parches)
  dayNightAmp: 0.0,     // amplitud del ciclo día/noche (0 = sin ciclo; el test lo activa)
  dayNightPeriod: 2000, // periodo del ciclo (ticks)
  shadeCoef: 0.6,       // sombra: la ocupación reduce la luz que llega al suelo (competencia por luz)
  occRef: 4,            // ocupación de referencia para normalizar la sombra
  diffuseN: 0.12,       // difusión del nutriente (conservativa)
  diffuseDet: 0.05,     // difusión del detrito (conservativa)
  decompose: 0.02,      // descomposición del detrito por tick: materia → nutriente, energía → calor
};

export class World {
  constructor(size, seed = 1, P = WORLD_P) {
    this.P = P; this.size = size;
    this.cols = Math.max(8, Math.round(size / P.cellRef)); this.rows = this.cols;
    this.cellW = size / this.cols;
    const N = this.cols * this.rows;
    this.light0 = new Float32Array(N);     // luz base espacial (heterogénea, periódica en el toro)
    this.nutrient = new Float32Array(N);   // N: materia inorgánica
    this.detritusM = new Float32Array(N);  // materia orgánica muerta
    this.detritusE = new Float32Array(N);  // energía residual del detrito
    this.occ = new Float32Array(N);        // ocupación (recomputada por tick desde los agentes)
    this._scratch = new Float32Array(N);
    this._buildLight(seed);
    // Libro mayor (acumuladores de energía abierta): monótonos.
    this.heat = 0;            // energía disipada que abandonó el sistema (sumidero; monótono ↑)
    this.lightCaptured = 0;   // energía que entró por fotosíntesis (fuente; monótono ↑)
    this.daylight = 1;        // multiplicador día/noche del tick actual
    this.lightMul = 1;        // multiplicador GLOBAL de luz (lab, en vivo): escala la productividad sin re-hornear light0
  }

  // Luz base: campo suave y periódico (suma de sinusoides) → parches ricos/pobres sin costura en el toro.
  _buildLight(seed) {
    const rng = makeRng(seed), { cols, rows } = this, P = this.P;
    const ph1 = rng.next() * 6.283, ph2 = rng.next() * 6.283, ph3 = rng.next() * 6.283;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const u = x / cols * 6.283, v = y / rows * 6.283;
      let n = (Math.sin(u + ph1) * Math.cos(v + ph2) + Math.sin(2 * u + v + ph3)) * 0.5; // [-1,1] aprox
      n = 0.5 + 0.5 * n;                                                    // → [0,1]
      this.light0[y * cols + x] = P.lightBase * (1 - P.lightContrast + P.lightContrast * n);
    }
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

  // Luz incidente en una celda: base × día/noche × sombra(ocupación). La sombra acopla luz↔espacio (competencia).
  lightAt(cell) {
    const P = this.P, sh = 1 - P.shadeCoef * Math.min(1, this.occ[cell] / P.occRef);
    return this.light0[cell] * this.lightMul * this.daylight * (sh > 0 ? sh : 0);
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
  diffuseStep() { this._diffuse(this.nutrient, this.P.diffuseN); this._diffuse(this.detritusM, this.P.diffuseDet); this._diffuse(this.detritusE, this.P.diffuseDet); }

  // --- Totales del libro mayor (para invariantes) ---
  totalNutrient() { let s = 0; for (let i = 0; i < this.nutrient.length; i++) s += this.nutrient[i]; return s; }
  totalDetritusM() { let s = 0; for (let i = 0; i < this.detritusM.length; i++) s += this.detritusM[i]; return s; }
  totalDetritusE() { let s = 0; for (let i = 0; i < this.detritusE.length; i++) s += this.detritusE[i]; return s; }
}
