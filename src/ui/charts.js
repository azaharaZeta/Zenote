// Gráficas a mano en Canvas 2D (sin dependencias): curva de población + histograma de un gen.
// Ver el histograma deslizarse es la prueba visual de la selección (criterio §7.1).

import { G, GENES, GENE_LABELS } from '../engine/genome.js';
import { turboCss } from '../util/color.js';

export class Charts {
  constructor(popCanvas, histCanvas, sim, deathCanvas, birthCanvas, bioCanvas) {
    this.sim = sim;
    this.popCanvas = popCanvas;
    this.histCanvas = histCanvas;
    this.deathCanvas = deathCanvas || null;   // gráfica de MUERTES por causa (solo modo laboratorio)
    this.birthCanvas = birthCanvas || null;   // gráfica de NACIMIENTOS por tipo (solo modo laboratorio)
    this.bioCanvas = bioCanvas || null;       // gráfica de BIOMASA: reparto de la materia (solo pecera cerrada)
    this.popCtx = popCanvas.getContext('2d');
    this.histCtx = histCanvas.getContext('2d');
    this.deathCtx = this.deathCanvas ? this.deathCanvas.getContext('2d') : null;
    this.birthCtx = this.birthCanvas ? this.birthCanvas.getContext('2d') : null;
    this.bioCtx = this.bioCanvas ? this.bioCanvas.getContext('2d') : null;
    this.histGene = G.size; // gen a histogramar por defecto (cambiable desde UI)
    // Series temporales: las acumula el worker (muestreo por ticks) y las asigna main.js; aquí solo se pintan.
    this.history = []; this.histC = []; this.histScav = []; this.histH = []; this.histO = []; this.histVegFill = []; this.histT = [];
    this.histN = []; this.histVegMass = []; this.histBio = []; this.histCarrion = [];   // pools de materia: N · pasto · organismos · carroña
    // histC = cazadores, histScav = carroñeros (los dos tipos de comecarne).
    this.bSex = []; this.bAsex = []; this.dEaten = []; this.dCombat = []; this.dStarv = []; this.dAge = [];  // demografía (nacimientos/muertes)
    // Suavizado: media móvil centrada de ±N muestras (cada muestra ≈ 40 ticks). Muestra la TENDENCIA, no picos. Subir = más liso.
    this.deathSmooth = 5;
    this.maxHistory = 600;
    this.windowTicks = 4800; // ventana visible del eje X en ticks (= HIST_WINDOW del worker)
    this.bins = new Float32Array(24);
    this._fitDPR(popCanvas, this.popCtx);
    this._fitDPR(histCanvas, this.histCtx);
    if (this.deathCtx) this._fitDPR(this.deathCanvas, this.deathCtx);
    if (this.birthCtx) this._fitDPR(this.birthCanvas, this.birthCtx);
    if (this.bioCtx) this._fitDPR(this.bioCanvas, this.bioCtx);
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
    if (this.bioCtx) this._fitDPR(this.bioCanvas, this.bioCtx);
  }

  // Limpieza visual inmediata al Sembrar (antes de que llegue el primer frame del mundo nuevo del worker).
  clear() {
    this.history = []; this.histC = []; this.histScav = []; this.histH = []; this.histO = []; this.histVegFill = []; this.histT = [];
    this.histN = []; this.histVegMass = []; this.histBio = []; this.histCarrion = [];
    this.bSex = []; this.bAsex = []; this.dEaten = []; this.dCombat = []; this.dStarv = []; this.dAge = [];
  }

  draw() {
    this._drawPop();
    if (this.bioCtx) this._drawBiomass();   // biomasa total de la pecera (se conserva)
    this._drawHist();
    if (this.deathCtx) this._drawDeaths();
    if (this.birthCtx) this._drawBirths();
  }

  _drawPop() {
    const ctx = this.popCtx, c = this.popCanvas, w = c._w, h = c._h;
    ctx.clearRect(0, 0, w, h);
    const hist = this.history;
    if (hist.length < 2) return;
    const histC = this.histC, histScav = this.histScav || [], histH = this.histH, histO = this.histO, histT = this.histT;
    let max = 1;
    for (let i = 0; i < hist.length; i++) if (hist[i] > max) max = hist[i]; // normaliza por el TOTAL → las curvas muestran proporciones
    // Eje X en ticks: ventana fija (windowTicks) anclada a la derecha (último tick = "ahora").
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
    // Series: vegetación (fracción, escala propia) + dieta por banda (herbívoros / omnívoros) + los dos tipos de
    // comecarne (CAZADORES rojo / CARROÑEROS violeta) + población total.
    if (this.histVegFill.length) line(this.histVegFill, '#6fcf6a', 1); // vegetación (llenado, fracción 0-1, escala propia)
    if (histH.length) line(histH, '#5ab3d1');               // herbívoros
    if (histO.length) line(histO, '#f0b429');               // omnívoros
    if (histC.length) line(histC, '#ff6b5a');               // cazadores
    if (histScav.length) line(histScav, '#b07be0');         // carroñeros
    line(hist, '#5a7cd1', max, 2);                          // población total (azul, gruesa, al final → envolvente visible)
    const last = (a) => a.length ? a[a.length - 1] | 0 : 0;
    const vegNow = this.histVegFill.length ? (this.histVegFill[this.histVegFill.length - 1] * 100) | 0 : 0;
    ctx.font = '10px monospace';
    // Leyenda en 2 FILAS de 2 (no cabe en una a este ancho). Monospace + padStart ⇒ posiciones fijas.
    const rows = [
      [[`pob ${String(last(hist)).padStart(4)}`, '#5a7cd1'], [`carn ${String(last(histC)).padStart(4)}`, '#ff6b5a']],
      [[`carroñ ${String(last(histScav)).padStart(3)}`, '#b07be0'], [`omni ${String(last(histO)).padStart(4)}`, '#f0b429']],
      [[`herb ${String(last(histH)).padStart(4)}`, '#5ab3d1'], [`pasto ${String(vegNow).padStart(3)}%`, '#6fcf6a']],
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

  // Curva de BIOMASA: reparto de la materia entre sus 4 compartimentos (organismos, vegetación, carroña, nutriente)
  // como fracción del total (gráfica apilada al 100%). En la pecera el total se conserva.
  _drawBiomass() {
    const ctx = this.bioCtx, c = this.bioCanvas, w = c._w, h = c._h;
    ctx.clearRect(0, 0, w, h);
    const N = this.histN, Gr = this.histVegMass, Bio = this.histBio, Car = this.histCarrion, T = this.histT, n = T.length;
    if (n < 2 || N.length !== n || Gr.length !== n || Bio.length !== n || Car.length !== n) return;
    const tEnd = T[n - 1], span = this.windowTicks || 1;
    const TOP = 25, ph = h - TOP - 2;                       // banda superior reservada a la leyenda (hasta 2 filas)
    const xOf = (i) => (1 - (tEnd - T[i]) / span) * w;
    const yOf = (frac) => h - 2 - frac * ph;                // fracción 0 → base abajo · 1 → cima (justo bajo la leyenda)
    // Apilado al 100%: de abajo a arriba organismos · vegetación · carroña · nutriente. Se pinta de la banda más alta
    // (área completa) a la más baja, superponiendo áreas opacas desde su techo hasta la base → cada banda queda visible.
    const stack = [
      [Bio, '#5a7cd1'],   // organismos (azul) — en la base
      [Gr,  '#6fcf6a'],   // vegetación / pasto en pie (verde)
      [Car, '#a8835c'],   // carroña / detrito (marrón)
      [N,   '#a0a4ac'],   // nutriente libre (GRIS: la materia que NO es viva ni carroña) — en la cima
    ];
    // Techos acumulados por muestra, precalculados en scratch reutilizable → O(bandas·n).
    const SB = stack.length;
    let tops = this._bioTops;
    if (!tops || tops.length !== n * SB) tops = this._bioTops = new Float32Array(n * SB);
    for (let i = 0; i < n; i++) {
      const inv = 1 / (N[i] + Gr[i] + Bio[i] + Car[i] || 1);
      let cum = 0, o = i * SB;
      for (let k = 0; k < SB; k++) { cum += stack[k][0][i]; tops[o + k] = cum * inv; } // techo de las k+1 bandas inferiores
    }
    for (let k = SB; k >= 1; k--) {                         // de la banda más ALTA (área completa) a la más baja
      ctx.fillStyle = stack[k - 1][1];                      // color de la banda cuyo techo es este borde superior
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = xOf(i), yv = yOf(tops[i * SB + (k - 1)]);
        if (i === 0) ctx.moveTo(x, yv); else ctx.lineTo(x, yv);
      }
      ctx.lineTo(xOf(n - 1), yOf(0)); ctx.lineTo(xOf(0), yOf(0));   // baja y cierra contra la base
      ctx.closePath(); ctx.fill();
    }
    // Leyenda: total de materia + % actual de cada compartimento en su color.
    const total = N[n - 1] + Gr[n - 1] + Bio[n - 1] + Car[n - 1], tot = total || 1, pct = (v) => Math.round((v / tot) * 100);
    const fmtTot = total >= 1000 ? (total / 1000).toFixed(1) + 'k' : Math.round(total).toString();
    ctx.font = '10px system-ui, sans-serif';
    let x = 4, y = 11;
    const put = (txt, col) => { const tw = ctx.measureText(txt).width; if (x > 4 && x + tw > w - 2) { x = 4; y += 11; } ctx.fillStyle = col; ctx.fillText(txt, x, y); x += tw + 7; };
    put(`biomasa: ${fmtTot}`, '#7b8494');
    put(`organismos ${pct(Bio[n - 1])}%`, '#5a7cd1');
    put(`vegetación ${pct(Gr[n - 1])}%`, '#6fcf6a');
    put(`carroña ${pct(Car[n - 1])}%`, '#a8835c');
    put(`nutriente ${pct(N[n - 1])}%`, '#a0a4ac');
  }

  // Helper: una línea por serie (media móvil = tendencia), normalizadas juntas, + leyenda con el total de cada serie.
  // `defs` = [{ arr, color, label }]. Lo usan _drawBirths y _drawDeaths.
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
      // Color del bin = valor (posición X), rampa TURBO (mismo mapeo que el modo color 'gene' y la leyenda): bajo→alto muy discriminable.
      const gv = (i + 0.5) / nb;
      ctx.fillStyle = turboCss(gv);
      ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
    }
    ctx.font = '10px system-ui, sans-serif';
    const lbl = gi < 0 ? 'Velocidad' : (GENE_LABELS[GENES[gi]] || GENES[gi]);
    const lw = ctx.measureText(lbl).width;
    ctx.fillStyle = 'rgba(8,10,14,0.7)';
    ctx.fillRect(1, 1, lw + 8, 14);
    ctx.fillStyle = '#cdd5e0';
    ctx.fillText(lbl, 5, 12);
  }
}
