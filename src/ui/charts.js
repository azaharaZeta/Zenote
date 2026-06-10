// Gráficas a mano en Canvas 2D (sin dependencias): curva de población + histograma de un gen.
// Ver el histograma deslizarse es la prueba visual de la selección (criterio §7.1).

import { NUM_GENES, G, GENES, GENE_LABELS } from '../engine/genome.js';

export class Charts {
  constructor(popCanvas, histCanvas, sim, deathCanvas) {
    this.sim = sim;
    this.popCanvas = popCanvas;
    this.histCanvas = histCanvas;
    this.deathCanvas = deathCanvas || null;   // gráfica de causas de muerte carnívora (solo modo laboratorio)
    this.popCtx = popCanvas.getContext('2d');
    this.histCtx = histCanvas.getContext('2d');
    this.deathCtx = this.deathCanvas ? this.deathCanvas.getContext('2d') : null;
    this.histGene = G.size; // gen a histogramar por defecto: TAMAÑO (cambiable desde UI)
    // Series temporales: las ACUMULA el worker (muestreo por ticks reales) y las asigna main.js cada frame.
    // Aquí solo se pintan. histT = tick de cada muestra → eje X en TICKS, constante a cualquier velocidad.
    this.history = []; this.histC = []; this.histV = []; this.histT = [];
    // Muertes carnívoras por ventana, por causa (combate/hambre/vejez/cazado): también del worker.
    this.dCombat = []; this.dStarv = []; this.dAge = []; this.dEaten = [];
    this.frozenDeath = null; // foto congelada de la gráfica de muertes en la extinción (la fija el worker)
    // Suavizado de la gráfica de muertes: media móvil centrada de ±N muestras (cada muestra ≈ 40 ticks del worker).
    // Muestra la TENDENCIA del último ratito en vez de picos puntuales. 5 ≈ ventana de ~440 ticks. Subir = más liso.
    this.deathSmooth = 5;
    this.maxHistory = 600;
    this.windowTicks = 4800; // ventana visible del eje X en ticks (debe coincidir con HIST_WINDOW del worker)
    this.bins = new Float32Array(24);
    this._fitDPR(popCanvas, this.popCtx);
    this._fitDPR(histCanvas, this.histCtx);
    if (this.deathCtx) this._fitDPR(this.deathCanvas, this.deathCtx);
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
  }

  // Limpieza visual inmediata al Sembrar (antes de que llegue el primer frame del mundo nuevo del worker).
  clear() {
    this.history = []; this.histC = []; this.histV = []; this.histT = [];
    this.dCombat = []; this.dStarv = []; this.dAge = []; this.dEaten = [];
  }

  draw() {
    this._drawPop();
    this._drawHist();
    if (this.deathCtx) this._drawDeaths();
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
    line(hist, '#5a7cd1');                 // población total (teal)
    if (histC.length) line(histC, '#ff6b5a'); // carnívoros (rojo)
    const carnNow = histC.length ? histC[histC.length - 1] : 0;
    const vegNow = this.histV.length ? this.histV[this.histV.length - 1] : 0;
    ctx.font = '10px monospace';
    // 3 segmentos coloreados (pob/carn/veg). Monospace + padStart ⇒ ancho fijo: las posiciones no bailan
    // con las cifras. La x avanza por el ancho medido de cada segmento + un hueco fijo.
    const segs = [
      [`pob ${String(this.sim.popCount).padStart(5)}`, '#5a7cd1'],         // teal (población)
      [`carn ${String(carnNow | 0).padStart(5)}`, '#ff6b5a'],             // rojo (carnívoros)
      [`veg ${String((vegNow * 100) | 0).padStart(3)}%`, '#6fcf6a'],      // verde (vegetación)
    ];
    let tx = 4;
    for (const [text, col] of segs) {
      ctx.fillStyle = col;
      ctx.fillText(text, tx, 11);
      tx += ctx.measureText(text).width + 8;   // hueco fijo entre segmentos
    }            // en la banda reservada → ya no se solapa con la curva
  }

  // Causas de muerte de los CARNÍVOROS a lo largo del tiempo, una LÍNEA por causa (combate / hambre / vejez /
  // cazado) → se ven las cuatro a la vez. Cada línea = nº de muertes de esa causa por ventana de muestreo. El
  // texto de cada causa va de SU color (leyenda). Revela por qué se extinguen (suele dominar el combate).
  _drawDeaths() {
    const ctx = this.deathCtx, c = this.deathCanvas, w = c._w, h = c._h;
    ctx.clearRect(0, 0, w, h);
    // Si hubo extinción, dibuja la FOTO CONGELADA (la fija el worker en el instante de la extinción) en vez de
    // la serie en vivo → el usuario la analiza con calma aunque la simulación siga corriendo.
    const fz = this.frozenDeath;
    const T = fz ? fz.tick : this.histT, n = T.length;
    const combat = fz ? fz.combat : this.dCombat, starv = fz ? fz.starv : this.dStarv;
    const age = fz ? fz.age : this.dAge, eaten = fz ? fz.eaten : this.dEaten;
    const COL = { combat: '#ff6b5a', starv: '#f0b429', age: '#7a8aa0', eaten: '#b06bff' }; // combate/hambre/vejez/cazado
    let sc = 0, ss = 0, sa = 0, se = 0;
    for (let i = 0; i < n; i++) { sc += combat[i]; ss += starv[i]; sa += age[i]; se += eaten[i]; }
    const TOP = 14, ph = h - TOP - 2;
    if (n >= 2) {
      // Media móvil CENTRADA de ±half muestras → suaviza el ruido y muestra la TENDENCIA (no picos puntuales).
      const half = this.deathSmooth | 0;
      const sm = (arr, i) => { const a = i - half < 0 ? 0 : i - half, b = i + half >= n ? n - 1 : i + half; let s = 0; for (let j = a; j <= b; j++) s += arr[j]; return s / (b - a + 1); };
      // Líneas INDEPENDIENTES (no apiladas): normaliza por el valor (suavizado) máximo → la línea más alta llega arriba.
      let maxV = 0.5;
      for (let i = 0; i < n; i++) { const a = sm(combat, i), b = sm(starv, i), d = sm(age, i), e = sm(eaten, i); if (a > maxV) maxV = a; if (b > maxV) maxV = b; if (d > maxV) maxV = d; if (e > maxV) maxV = e; }
      const tEnd = T[n - 1], span = this.windowTicks || 1;
      const xOf = (i) => (1 - (tEnd - T[i]) / span) * w;
      const yOf = (v) => h - (v / maxV) * ph - 2;
      const lineOf = (arr, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.beginPath();
        for (let i = 0; i < n; i++) { const x = xOf(i), y = yOf(sm(arr, i)); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      };
      lineOf(age, COL.age); lineOf(eaten, COL.eaten); lineOf(starv, COL.starv); lineOf(combat, COL.combat); // combate al final → encima
    }
    // Etiqueta: cada causa de SU color (leyenda). Se dibuja por segmentos avanzando x.
    ctx.font = '10px system-ui, sans-serif';
    let x = 4;
    const seg = (txt, color) => { ctx.fillStyle = color; ctx.fillText(txt, x, 11); x += ctx.measureText(txt).width; };
    if (fz) {
      ctx.strokeStyle = 'rgba(255,120,90,0.7)'; ctx.lineWidth = 1.5; ctx.strokeRect(0.75, 0.75, w - 1.5, h - 1.5); // marco: congelada
      seg(`🔒 ext ${fz.extTick}  `, '#ffb38a');
    }
    seg(`combate ${sc}`, COL.combat); seg(' · ', '#7b8494');
    seg(`hambre ${ss}`, COL.starv); seg(' · ', '#7b8494');
    seg(`vejez ${sa}`, COL.age); seg(' · ', '#7b8494');
    seg(`cazado ${se}`, COL.eaten);
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
