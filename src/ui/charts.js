// Gráficas a mano en Canvas 2D (sin dependencias): curva de población + histograma de un gen.
// Ver el histograma deslizarse es la prueba visual de la selección (criterio §7.1).

import { NUM_GENES, G, GENES, GENE_LABELS } from '../engine/genome.js';

export class Charts {
  constructor(popCanvas, histCanvas, sim) {
    this.sim = sim;
    this.popCanvas = popCanvas;
    this.histCanvas = histCanvas;
    this.popCtx = popCanvas.getContext('2d');
    this.histCtx = histCanvas.getContext('2d');
    this.histGene = G.size; // gen a histogramar por defecto: TAMAÑO (cambiable desde UI)
    this.history = [];      // población total a lo largo del tiempo (de SIMULACIÓN, no de reloj)
    this.histC = [];        // carnívoros (diet > 0.5) a lo largo del tiempo
    this.histV = [];         // vegetación disponible: fracción del recurso sobre su capacidad total [0,1]
    this.histT = [];         // tick de simulación de cada muestra → eje X en TICKS (acoplado a la velocidad)
    this.maxHistory = 600;
    this.windowTicks = 4800; // ventana visible del eje X en ticks (≈ maxHistory · cadencia de muestreo)
    this.bins = new Float32Array(24);
    this._fitDPR(popCanvas, this.popCtx);
    this._fitDPR(histCanvas, this.histCtx);
  }

  _fitDPR(canvas, ctx) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._w = w; canvas._h = h;
  }

  setGene(geneIndex) { this.histGene = geneIndex; }

  // Re-ajustar resolución al cambiar el tamaño de la ventana/panel (evita borrosidad).
  resize() {
    this._fitDPR(this.popCanvas, this.popCtx);
    this._fitDPR(this.histCanvas, this.histCtx);
  }

  record(tick) {
    const s = this.sim;
    this.history.push(s.popCount);
    this.histC.push(s.carn || 0); // nº de carnívoros (lo calcula el worker)
    this.histV.push(this._vegFrac()); // vegetación disponible (fracción de capacidad)
    this.histT.push(tick != null ? tick : (this.histT.length ? this.histT[this.histT.length - 1] + 1 : 0));
    // recortar por VENTANA DE TICKS (no de frames) → la escala temporal del eje X es constante con la velocidad
    const t0 = this.histT[this.histT.length - 1] - this.windowTicks;
    while (this.histT.length > 1 && this.histT[0] < t0) { this.history.shift(); this.histC.shift(); this.histV.shift(); this.histT.shift(); }
    if (this.history.length > this.maxHistory) { this.history.shift(); this.histC.shift(); this.histV.shift(); this.histT.shift(); }
  }

  // Fracción de vegetación disponible = Σ recurso / Σ capacidad ∈ [0,1] (1 = todo el pasto a tope, 0 = arrasado).
  _vegFrac() {
    const r = this.sim.world && this.sim.world.resource, c = this.sim.world && this.sim.world.capacity;
    if (!r || !c || !r.length) return 0;
    let sr = 0, sc = 0;
    for (let i = 0; i < r.length; i++) { sr += r[i]; sc += c[i]; }
    return sc > 0 ? sr / sc : 0;
  }

  clear() { this.history.length = 0; this.histC.length = 0; this.histV.length = 0; this.histT.length = 0; }

  draw() {
    this._drawPop();
    this._drawHist();
  }

  _drawPop() {
    const ctx = this.popCtx, c = this.popCanvas, w = c._w, h = c._h;
    ctx.clearRect(0, 0, w, h);
    const hist = this.history;
    if (hist.length < 2) return;
    const histC = this.histC, histT = this.histT;
    let max = 1;
    for (let i = 0; i < hist.length; i++) if (hist[i] > max) max = hist[i];
    // Eje X en TICKS: ventana fija (windowTicks) anclada a la derecha (el último tick = "ahora").
    // Así cada píxel equivale al MISMO nº de ticks pase lo que pase con la velocidad de reloj.
    const tEnd = histT[histT.length - 1], span = this.windowTicks || 1;
    // Banda superior RESERVADA para la etiqueta → la curva se dibuja SOLO debajo (nunca la tapa el texto).
    const TOP = 15, ph = h - TOP - 2;
    const line = (arr, color, norm) => {
      const m = norm || max;                  // escala propia opcional (la vegetación va en fracción 0-1, no en cuenta)
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const px = (1 - (tEnd - histT[i]) / span) * w;
        const py = h - (arr[i] / m) * ph - 2;   // pico (=norm) llega a y=TOP, justo bajo la banda
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };
    if (this.histV.length) line(this.histV, '#6fcf6a', 1); // VEGETACIÓN disponible (fracción 0-1, escala propia) en verde, al fondo
    line(hist, '#5ad1c4');                 // población total (teal)
    if (histC.length) line(histC, '#ff6b5a'); // carnívoros (rojo)
    const carnNow = histC.length ? histC[histC.length - 1] : 0;
    const vegNow = this.histV.length ? this.histV[this.histV.length - 1] : 0;
    ctx.font = '10px system-ui, sans-serif';
    const label = `total ${this.sim.popCount} · carn ${carnNow} · veg ${(vegNow * 100) | 0}% · esp ${this.sim.speciesCount || 0}`;
    ctx.fillStyle = '#cdd5e0';
    ctx.fillText(label, 4, 11);            // en la banda reservada → ya no se solapa con la curva
  }

  _drawHist() {
    const ctx = this.histCtx, c = this.histCanvas, w = c._w, h = c._h;
    const gi = this.histGene;
    const bins = this.sim.histBins || this.bins, nb = bins.length; // bins los calcula el worker
    let max = 1;
    for (let i = 0; i < nb; i++) if (bins[i] > max) max = bins[i];
    ctx.clearRect(0, 0, w, h);
    const bw = w / nb;
    for (let i = 0; i < nb; i++) {
      const bh = (bins[i] / max) * (h - 14);
      // color del bin = el propio valor del gen (continuo), guiño visual.
      ctx.fillStyle = `hsl(${(i / nb) * 200 + 160},55%,55%)`;
      ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
    }
    ctx.font = '10px system-ui, sans-serif';
    const lbl = GENE_LABELS[GENES[gi]] || GENES[gi];
    const lw = ctx.measureText(lbl).width;
    ctx.fillStyle = 'rgba(8,10,14,0.7)';
    ctx.fillRect(1, 1, lw + 8, 14);
    ctx.fillStyle = '#cdd5e0';
    ctx.fillText(lbl, 5, 12);
  }
}
