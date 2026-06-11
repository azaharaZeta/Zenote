// Gráficas a mano en Canvas 2D (sin dependencias): curva de población + histograma de un gen.
// Ver el histograma deslizarse es la prueba visual de la selección (criterio §7.1).

import { NUM_GENES, G, GENES, GENE_LABELS } from '../engine/genome.js';

export class Charts {
  constructor(popCanvas, histCanvas, sim, deathCanvas, birthCanvas) {
    this.sim = sim;
    this.popCanvas = popCanvas;
    this.histCanvas = histCanvas;
    this.deathCanvas = deathCanvas || null;   // gráfica de MUERTES por causa (solo modo laboratorio)
    this.birthCanvas = birthCanvas || null;   // gráfica de NACIMIENTOS por tipo (solo modo laboratorio)
    this.popCtx = popCanvas.getContext('2d');
    this.histCtx = histCanvas.getContext('2d');
    this.deathCtx = this.deathCanvas ? this.deathCanvas.getContext('2d') : null;
    this.birthCtx = this.birthCanvas ? this.birthCanvas.getContext('2d') : null;
    this.histGene = G.size; // gen a histogramar por defecto: TAMAÑO (cambiable desde UI)
    // Series temporales: las ACUMULA el worker (muestreo por ticks reales) y las asigna main.js cada frame.
    // Aquí solo se pintan. histT = tick de cada muestra → eje X en TICKS, constante a cualquier velocidad.
    this.history = []; this.histC = []; this.histH = []; this.histO = []; this.histV = []; this.histT = [];
    // Demografía del ecosistema por ventana (del worker): nacimientos (sexual/asexual) + muertes (cazado/atacando/hambre/vejez).
    this.bSex = []; this.bAsex = []; this.dEaten = []; this.dCombat = []; this.dStarv = []; this.dAge = [];
    // Suavizado: media móvil centrada de ±N muestras (cada muestra ≈ 40 ticks). Muestra la TENDENCIA, no picos. Subir = más liso.
    this.deathSmooth = 5;
    this.maxHistory = 600;
    this.windowTicks = 4800; // ventana visible del eje X en ticks (debe coincidir con HIST_WINDOW del worker)
    this.bins = new Float32Array(24);
    this._fitDPR(popCanvas, this.popCtx);
    this._fitDPR(histCanvas, this.histCtx);
    if (this.deathCtx) this._fitDPR(this.deathCanvas, this.deathCtx);
    if (this.birthCtx) this._fitDPR(this.birthCanvas, this.birthCtx);
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
    if (this.deathCtx) this._fitDPR(this.deathCanvas, this.deathCtx);
    if (this.birthCtx) this._fitDPR(this.birthCanvas, this.birthCtx);
  }

  // Limpieza visual inmediata al Sembrar (antes de que llegue el primer frame del mundo nuevo del worker).
  clear() {
    this.history = []; this.histC = []; this.histH = []; this.histO = []; this.histV = []; this.histT = [];
    this.bSex = []; this.bAsex = []; this.dEaten = []; this.dCombat = []; this.dStarv = []; this.dAge = [];
  }

  draw() {
    this._drawPop();
    this._drawHist();
    if (this.deathCtx) this._drawDeaths();
    if (this.birthCtx) this._drawBirths();
  }

  _drawPop() {
    const ctx = this.popCtx, c = this.popCanvas, w = c._w, h = c._h;
    ctx.clearRect(0, 0, w, h);
    const hist = this.history;
    if (hist.length < 2) return;
    const histC = this.histC, histH = this.histH, histO = this.histO, histT = this.histT;
    let max = 1;
    for (let i = 0; i < hist.length; i++) if (hist[i] > max) max = hist[i]; // normaliza por el TOTAL → las curvas muestran proporciones
    // Eje X en TICKS: ventana fija (windowTicks) anclada a la derecha (el último tick = "ahora").
    // Así cada píxel equivale al MISMO nº de ticks pase lo que pase con la velocidad de reloj.
    const tEnd = histT[histT.length - 1], span = this.windowTicks || 1;
    // Banda superior RESERVADA para la leyenda (3 filas, a media anchura) → la curva se dibuja SOLO debajo.
    const TOP = 34, ph = h - TOP - 2;
    const line = (arr, color, norm, lw) => {
      const m = norm || max;                  // escala propia opcional (la vegetación va en fracción 0-1, no en cuenta)
      ctx.strokeStyle = color; ctx.lineWidth = lw || 1.5; ctx.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const px = (1 - (tEnd - histT[i]) / span) * w;
        const py = h - (arr[i] / m) * ph - 2;   // pico (=norm) llega a y=TOP, justo bajo la banda
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };
    // 4 series: vegetación (fracción, escala propia) + dieta por banda (herbívoros / omnívoros / carnívoros).
    if (this.histV.length) line(this.histV, '#6fcf6a', 1); // VEGETACIÓN (fracción 0-1, escala propia) en verde, al fondo
    if (histH.length) line(histH, '#5ab3d1');               // herbívoros (cian-teal)
    if (histO.length) line(histO, '#f0b429');               // omnívoros (ámbar)
    if (histC.length) line(histC, '#ff6b5a');               // carnívoros (rojo)
    line(hist, '#5a7cd1', max, 2);                          // POBLACIÓN TOTAL en azul ('pob') al FINAL y más gruesa → envolvente visible (si no, en mundo herbívoro la tapa la línea herb)
    const last = (a) => a.length ? a[a.length - 1] | 0 : 0;
    const vegNow = this.histV.length ? (this.histV[this.histV.length - 1] * 100) | 0 : 0;
    ctx.font = '10px monospace';
    // Leyenda en 2 FILAS de 2 (no cabe en una a este ancho). Monospace + padStart ⇒ posiciones fijas.
    const rows = [
      [[`pob ${String(last(hist)).padStart(4)}`, '#5a7cd1'], [`carn ${String(last(histC)).padStart(4)}`, '#ff6b5a']],
      [[`omni ${String(last(histO)).padStart(4)}`, '#f0b429'], [`herb ${String(last(histH)).padStart(4)}`, '#5ab3d1']],
      [[`veg ${String(vegNow).padStart(3)}%`, '#6fcf6a']],
    ];
    for (let r = 0; r < rows.length; r++) {
      let tx = 4;
      for (const [text, col] of rows[r]) {
        ctx.fillStyle = col;
        ctx.fillText(text, tx, 10 + r * 11);
        tx += ctx.measureText(text).width + 8;   // hueco fijo entre segmentos
      }
    }
  }

  // Helper: una LÍNEA por serie a lo largo del tiempo (media móvil = tendencia, no picos), normalizadas JUNTAS
  // (la más alta llega arriba), + leyenda de 1 fila con el total de la ventana de cada serie, de su color.
  // `defs` = [{ arr, color, label }]. Lo usan _drawBirths y _drawDeaths (mismas escalas/estilo, datos distintos).
  _drawSeries(ctx, c, defs, title) {
    const w = c._w, h = c._h;
    ctx.clearRect(0, 0, w, h);
    const T = this.histT, n = T.length;
    const totals = defs.map(d => { let s = 0; for (let i = 0; i < n; i++) s += d.arr[i]; return s; });
    const TOP = 25, ph = h - TOP - 2;   // hasta 2 filas de leyenda (a media anchura salta de fila)
    if (n >= 2) {
      const half = this.deathSmooth | 0;
      const sm = (arr, i) => { const a = i - half < 0 ? 0 : i - half, b = i + half >= n ? n - 1 : i + half; let s = 0; for (let j = a; j <= b; j++) s += arr[j]; return s / (b - a + 1); };
      let maxV = 0.5;
      for (let i = 0; i < n; i++) for (const d of defs) { const v = sm(d.arr, i); if (v > maxV) maxV = v; }
      const tEnd = T[n - 1], span = this.windowTicks || 1;
      const xOf = (i) => (1 - (tEnd - T[i]) / span) * w, yOf = (v) => h - (v / maxV) * ph - 2;
      for (const d of defs) {
        ctx.strokeStyle = d.color; ctx.lineWidth = 1.3; ctx.beginPath();
        for (let i = 0; i < n; i++) { const x = xOf(i), y = yOf(sm(d.arr, i)); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    ctx.font = '10px system-ui, sans-serif';
    let x = 4, y = 11;
    const put = (txt, col) => { const tw = ctx.measureText(txt).width; if (x > 4 && x + tw > w - 2) { x = 4; y += 11; } ctx.fillStyle = col; ctx.fillText(txt, x, y); x += tw + 7; }; // salta de fila si no cabe
    if (title) put(title, '#7b8494');   // título (p.ej. 'nacimientos:') en gris
    for (let q = 0; q < defs.length; q++) put(`${defs[q].label} ${totals[q]}`, defs[q].color);
  }

  // NACIMIENTOS del ecosistema por tipo (sexual / asexual) a lo largo del tiempo.
  _drawBirths() {
    this._drawSeries(this.birthCtx, this.birthCanvas, [
      { arr: this.bSex, color: '#6fcf6a', label: 'sexual' },
      { arr: this.bAsex, color: '#46c7c7', label: 'asexual' },
    ], 'nacimientos y muertes:');
  }

  // MUERTES del ecosistema por causa (cazado / atacando / hambre / vejez) a lo largo del tiempo.
  _drawDeaths() {
    this._drawSeries(this.deathCtx, this.deathCanvas, [
      { arr: this.dEaten, color: '#b06bff', label: 'cazado' },
      { arr: this.dCombat, color: '#ff6b5a', label: 'atacando' },
      { arr: this.dStarv, color: '#f0b429', label: 'hambre' },
      { arr: this.dAge, color: '#7a8aa0', label: 'vejez' },
    ]);
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
