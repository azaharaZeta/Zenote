// Render con Canvas 2D. El mundo es lógico y fijo; aquí solo se MUESTRA, con una cámara
// (zoom + paneo toroidal en mosaico). Nada de esto toca la simulación.

import { NUM_GENES, G } from '../engine/genome.js';
import { makeRng } from '../util/rng.js';

// Hue pseudoaleatorio estable a partir de un id de linaje (buena dispersión en [0,360)).
function lineageHue(id) { return (Math.imul(id + 1, 2654435761) >>> 0) % 360; }

export class Renderer {
  constructor(canvas, sim, cfg) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.sim = sim;
    this.cfg = cfg;
    this.dpr = 1;
    this.colorMode = 'real';        // real | diet | lineage | gene | energy (solo render)
    this.geneIndex = 0;             // gen activo para el modo 'gene' (sincronizado con el histograma)
    // Cámara: zoom (1 = el mundo cubre la pantalla) y centro en coords del mundo.
    // El paneo recorre el toro sin costuras (render en mosaico), así no se ven los bordes.
    this.zoom = 1; this.maxZoom = 20;
    this.camX = cfg.world.width / 2;
    this.camY = cfg.world.height / 2;

    // Capa de hierba (mechones). Búfer del tamaño de la PANTALLA: la hierba se dibuja con
    // la cámara aplicada (nítida a cualquier zoom) y solo se re-renderiza cuando la cámara
    // se mueve o cambia el recurso. La disposición de mechones es fija (semilla).
    this.grass = document.createElement('canvas');
    this.grassCtx = this.grass.getContext('2d');
    // Capa de ORGANISMOS (transparente): se compone sobre el suelo. Permite "estelas": en vez de
    // borrarla cada frame, se desvanece un poco → rastros de movimiento (antes no funcionaba porque
    // el suelo opaco se redibujaba encima y borraba el rastro).
    this.fx = document.createElement('canvas');
    this.fxCtx = this.fx.getContext('2d');
    this._grassTimer = 0;
    this._gx = NaN; this._gy = NaN; this._gz = NaN; // estado de cámara del último render de hierba
    this._initTufts();

    this.resize();
  }

  // Posiciones + sprite asignado a cada matojo (todo fijo; solo el tamaño cambia con el
  // recurso). El catálogo de sprites se dibuja UNA vez al arrancar.
  _initTufts() {
    const rng = makeRng(20240607);
    const W = this.cfg.world;
    const n = this.cfg.render.grassDensity;
    this.nTufts = n;
    // 3 juegos de matojos tintados por clima (se eligen según la temperatura de la celda):
    // frío = verde-azul grisáceo oscuro; templado = verde vivo; desierto = marrón seco.
    const ns = this.cfg.render.grassSpriteCount;
    const PAL = {
      cold:      { h0: 188, hr: 42, satS: 32, satT: 28, lS0: 16, lSr: 6, lT0: 38, lTr: 14 }, // más azul
      temperate: { h0: 78,  hr: 55, satS: 64, satT: 62, lS0: 18, lSr: 10, lT0: 52, lTr: 22 }, // más brillante
      desert:    { h0: 28,  hr: 24, satS: 42, satT: 34, lS0: 18, lSr: 8, lT0: 38, lTr: 14 },
    };
    const buildSet = (pal) => { const a = []; for (let s = 0; s < ns; s++) a.push(this._makeGrassSprite(rng, pal)); return a; };
    this.grassByClimate = [buildSet(PAL.cold), buildSet(PAL.temperate), buildSet(PAL.desert)];
    // Flores tintadas/conformadas POR CLIMA (se eligen según la temperatura de la celda, como
    // la hierba): frío = pálidas y redondeadas; templado = vivas y llenas; desierto = cálidas y
    // puntiagudas (estrella). Así cada zona tiende a sus colores/formas.
    const FPAL = {
      cold:      { hues: [-1, 270, 210, 322], sat: 42, light: 84, petalMin: 5, petalMax: 6, len: 0.55, wid: 0.52 },
      temperate: { hues: [52, 332, 300, 18, -1], sat: 60, light: 70, petalMin: 5, petalMax: 8, len: 0.72, wid: 0.55 }, // desaturado (82→60): flores como acento sereno, no alfombra chillona
      desert:    { hues: [18, 8, 40, 338], sat: 66, light: 62, petalMin: 5, petalMax: 7, len: 0.98, wid: 0.32 },
    };
    const nf = this.cfg.render.flowerSpriteCount;
    const buildFlowers = (pal) => { const a = []; for (let s = 0; s < nf; s++) a.push(this._makeFlowerSprite(rng, pal)); return a; };
    this.flowersByClimate = [buildFlowers(FPAL.cold), buildFlowers(FPAL.temperate), buildFlowers(FPAL.desert)];
    this.tuftX = new Float32Array(n);
    this.tuftY = new Float32Array(n);
    this.tuftScale = new Float32Array(n);  // variedad de tamaño
    this.tuftSprite = new Uint8Array(n);   // qué sprite de matojo usa (fijo)
    this.tuftFlower = new Int8Array(n);    // índice de flor, o -1 si esta mata no florece
    const fFrac = this.cfg.render.flowerFrac;
    for (let i = 0; i < n; i++) {
      this.tuftX[i] = rng.next() * W.width;
      this.tuftY[i] = rng.next() * W.height;
      this.tuftScale[i] = 0.75 + rng.next() * 0.85;
      this.tuftSprite[i] = (rng.next() * ns) | 0;
      this.tuftFlower[i] = rng.next() < fFrac ? (rng.next() * nf) | 0 : -1;
    }
  }

  // Genera un sprite de matojo frondoso: muchas briznas curvas y extendidas, cada una con
  // degradado tallo-oscuro→hoja-clara (volumen, aspecto de ramita/hoja). A veces, florecilla.
  _makeGrassSprite(rng, pal) {
    const w = 58, h = 58;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const baseY = h - 1, baseX = w / 2;
    // "Personalidad" del matojo → diversidad entre plantas. Tono base según el clima (pal).
    const hueBase = pal.h0 + rng.next() * pal.hr;
    const spread = 0.55 + rng.next() * 1.05;        // estrecho y vertical ↔ ancho y extendido
    const heightF = 0.6 + rng.next() * 0.45;        // altura general
    const nB = 10 + ((rng.next() * 9) | 0);         // 10..18 briznas (muy frondoso)
    for (let b = 0; b < nB; b++) {
      const len = h * heightF * (0.42 + rng.next() * 0.6);
      const lean = (rng.next() - 0.5) * w * spread;
      const curve = (rng.next() - 0.5) * w * 0.6;   // curvatura de la hoja
      const width = 0.9 + rng.next() * 3.2;         // grosor: tallo grueso vs ramita fina
      const bx = baseX + (rng.next() - 0.5) * w * 0.48; // base abierta → mata ancha
      const tipx = bx + lean, tipy = baseY - len;
      const cx = bx + lean * 0.4 + curve, cy = baseY - len * 0.55;
      // Degradado a lo largo de la brizna: base oscura (tallo) → punta clara (hoja).
      const grad = g.createLinearGradient(bx, baseY, tipx, tipy);
      const hl = hueBase + (rng.next() - 0.5) * 20;
      grad.addColorStop(0, `hsl(${hl - 14},${pal.satS}%,${pal.lS0 + rng.next() * pal.lSr}%)`);
      grad.addColorStop(1, `hsl(${hl + 8},${pal.satT}%,${pal.lT0 + rng.next() * pal.lTr}%)`);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(bx - width / 2, baseY);
      g.quadraticCurveTo(cx - width * 0.25, cy, tipx, tipy);   // borde izq. hasta la punta
      g.quadraticCurveTo(cx + width * 0.25, cy, bx + width / 2, baseY); // borde der. de vuelta
      g.closePath();
      g.fill();
    }
    return cv;
  }

  // Sprite de flor suelto (se dibuja aparte, solo en matas altas/sanas). La paleta/forma (pal)
  // viene del clima de la zona → colores y siluetas características por bioma.
  _makeFlowerSprite(rng, pal) {
    const s = 22, c = s / 2;
    const cv = document.createElement('canvas');
    cv.width = s; cv.height = s;
    const g = cv.getContext('2d');
    const ph = pal.hues[(rng.next() * pal.hues.length) | 0];
    const pr = 2.8 + rng.next() * 2.4;             // radio de la corola
    const petals = pal.petalMin + ((rng.next() * (pal.petalMax - pal.petalMin + 1)) | 0);
    const rot = rng.next() * 6.2832;
    g.fillStyle = ph < 0 ? `hsl(0,0%,${pal.light + 8}%)` : `hsl(${ph},${pal.sat}%,${pal.light}%)`;
    for (let p = 0; p < petals; p++) {
      const a = rot + (p / petals) * 6.2832;
      // Pétalo = elipse orientada al radio: `len` da el largo (radial), `wid` el ancho → de
      // redondeado (templado/frío) a puntiagudo tipo estrella (desierto).
      g.beginPath();
      g.ellipse(c + Math.cos(a) * pr, c + Math.sin(a) * pr, pr * pal.len, pr * pal.wid, a, 0, 6.2832);
      g.fill();
    }
    g.fillStyle = 'hsl(48,90%,56%)';               // centro
    g.beginPath();
    g.arc(c, c, pr * 0.5, 0, 6.2832);
    g.fill();
    return cv;
  }

  // Re-renderiza el SUELO (mapa térmico de fondo + hierba) en el búfer de pantalla con la
  // cámara aplicada (nítido a cualquier zoom) y teselando el toro. Solo dibuja los matojos
  // visibles (culling). Se llama solo si cambia cámara o recurso.
  _refreshGrass() {
    const Wld = this.sim.world, ctx = this.grassCtx, c = this.canvas, cfg = this.cfg;
    const Rmax = cfg.resource.R_max, fThresh = cfg.render.flowerThreshold;
    const res = Wld.resource, cols = Wld.cols, rows = Wld.rows, cellW = Wld.cellW, cellH = Wld.cellH;
    const sets = this.grassByClimate, fsets = this.flowersByClimate, temp = Wld.temp;
    const showGrass = cfg.render.showResourceField;
    this._ensureTempCanvas();
    const W = cfg.world.width, H = cfg.world.height, s = this._scale();
    const offX = c.width / 2 - this.camX * s, offY = c.height / 2 - this.camY * s;
    const vwHalf = c.width / (2 * s), vhHalf = c.height / (2 * s);
    const txMin = Math.floor((this.camX - vwHalf) / W), txMax = Math.floor((this.camX + vwHalf) / W);
    const tyMin = Math.floor((this.camY - vhHalf) / H), tyMax = Math.floor((this.camY + vhHalf) / H);
    const margin = 60 / s; // holgura en coords de mundo para no recortar matojos al borde
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    // --- ABISMO: sustrato orgánico. Nebulosa sobre-muestreada con (E) paleta de región rica por
    // temperatura, (A) moteado orgánico por ruido anclado al mundo, y (C) comida fosforescente +
    // micro-flora luminosa donde hay recurso. Se reconstruye en el refresco (la comida cambia). ---
    if (cfg.render.ambiance === 'abyssal') {             // sustrato abisal: independiente del modo de color
      const SS = cfg.render.quality === 'low' ? 2 : 3, NW = cols * SS, NH = rows * SS; // baja: 2× (menos píxeles que recalcular)
      let cv = this._abyssLow;
      if (!cv || cv.width !== NW) {
        cv = this._abyssLow = document.createElement('canvas'); cv.width = NW; cv.height = NH;
        this._abyssLowCtx = cv.getContext('2d'); this._abyssImg = this._abyssLowCtx.createImageData(NW, NH);
      }
      const d = this._abyssImg.data;
      const hash = (ix, iy, sd) => { let h = (ix * 374761393 + iy * 668265263 + sd * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
      // value-noise PERIÓDICO: rejilla px×py que ENVUELVE (módulo) → tesela sin costura en el toro. u,v ∈ [0,1).
      const pnoise = (u, v, px, py, sd) => {
        const fx = u * px, fy = v * py, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const x0 = ((ix % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((iy % py) + py) % py, y1 = (y0 + 1) % py;
        const a = hash(x0, y0, sd), b = hash(x1, y0, sd), c = hash(x0, y1, sd), e = hash(x1, y1, sd);
        const su = tx * tx * (3 - 2 * tx), sv = ty * ty * (3 - 2 * ty);
        return a + (b - a) * su + (c - a) * sv + (a - b - c + e) * su * sv; };
      for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) {
        const wx = (i + 0.5) / NW * W, wy = (j + 0.5) / NH * H;
        // BILINEAL sobre los centros de celda (toro) → comida y temperatura SUAVES, sin cuadrados de rejilla.
        const gxc = wx / cellW - 0.5, gyc = wy / cellH - 0.5;
        const x0 = Math.floor(gxc), y0 = Math.floor(gyc), fxc = gxc - x0, fyc = gyc - y0;
        const xa = ((x0 % cols) + cols) % cols, xb = (xa + 1) % cols;
        const ya = ((y0 % rows) + rows) % rows, yb = (ya + 1) % rows;
        const i00 = ya * cols + xa, i10 = ya * cols + xb, i01 = yb * cols + xa, i11 = yb * cols + xb;
        const tT = temp[i00] + (temp[i10] - temp[i00]) * fxc, tB = temp[i01] + (temp[i11] - temp[i01]) * fxc;
        const tv = tT + (tB - tT) * fyc;
        const rT = res[i00] + (res[i10] - res[i00]) * fxc, rB = res[i01] + (res[i11] - res[i01]) * fxc;
        let food = (rT + (rB - rT) * fyc) / Rmax; food = food > 1 ? 1 : food < 0 ? 0 : food;
        // (E) PALETA ABISAL AZUL: frío = azul profundo → cálido = azul-violeta (sin verdes; canal verde contenido).
        let rr, gg, bb;
        if (tv < 0.5) { const u = tv / 0.5; rr = 2 + u * 3; gg = 5 + u * 6; bb = 29 - u * 3; }   // azul aún más profundo
        else { const u = (tv - 0.5) / 0.5; rr = 5 + u * 13; gg = 11 + u * -5; bb = 31 + u * 6; }
        const u = wx / W, v = wy / H;
        const n = 0.62 * pnoise(u, v, 26, 17, 0) + 0.38 * pnoise(u, v, 70, 47, 7); // (A) moteado 2 octavas PERIÓDICO (sin costura)
        const mott = 0.7 + n * 0.72;
        const o = (j * NW + i) * 4;
        d[o]     = rr * mott + food * 7;   // (C) comida = fosforescencia AZUL-CIAN (poco rojo)
        d[o + 1] = gg * mott + food * 31;  // verde contenido
        d[o + 2] = bb * mott + food * 72;  // azul dominante
        d[o + 3] = 255;
      }
      this._abyssLowCtx.putImageData(this._abyssImg, 0, 0);
      ctx.imageSmoothingEnabled = true;
      for (let ty = tyMin; ty <= tyMax; ty++) for (let tx = txMin; tx <= txMax; tx++) {
        ctx.setTransform(s, 0, 0, s, offX + tx * W * s, offY + ty * H * s);
        ctx.drawImage(cv, 0, 0, W, H);
      }
      // (C) MICRO-FLORA luminosa: motas tenues que brillan donde hay comida (plancton/floración). Reusa tufts.
      ctx.globalCompositeOperation = 'lighter';
      for (let ty = tyMin; ty <= tyMax; ty++) for (let tx = txMin; tx <= txMax; tx++) {
        const wxMin = this.camX - vwHalf - tx * W - margin, wxMax = this.camX + vwHalf - tx * W + margin;
        const wyMin = this.camY - vhHalf - ty * H - margin, wyMax = this.camY + vhHalf - ty * H + margin;
        ctx.setTransform(s, 0, 0, s, offX + tx * W * s, offY + ty * H * s);
        for (let i = 0; i < this.nTufts; i++) {
          const x = this.tuftX[i], y = this.tuftY[i];
          if (x < wxMin || x > wxMax || y < wyMin || y > wyMax) continue;
          let cx = (x / cellW) | 0, cy = (y / cellH) | 0; if (cx >= cols) cx = cols - 1; if (cy >= rows) cy = rows - 1;
          const food = res[cy * cols + cx] / Rmax; if (food < 0.28) continue;
          const a = (food - 0.28) * 0.45 * this.tuftScale[i];
          ctx.fillStyle = `hsla(${196 + (this.tuftSprite[i] % 6) * 7},92%,70%,${a})`;
          ctx.beginPath(); ctx.arc(x, y, (0.5 + food * 1.5) * this.tuftScale[i], 0, 6.2832); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }
    for (let ty = tyMin; ty <= tyMax; ty++) {
      for (let tx = txMin; tx <= txMax; tx++) {
        // Rango de mundo visible en este mosaico (para descartar matojos fuera de vista).
        const wxMin = this.camX - vwHalf - tx * W - margin, wxMax = this.camX + vwHalf - tx * W + margin;
        const wyMin = this.camY - vhHalf - ty * H - margin, wyMax = this.camY + vhHalf - ty * H + margin;
        ctx.setTransform(s, 0, 0, s, offX + tx * W * s, offY + ty * H * s);
        // Base: mapa térmico (nieve fría → tierra cálida). Es el suelo del ecosistema.
        ctx.globalAlpha = 1;
        ctx.drawImage(this._tempCanvas, 0, 0, W, H);
        if (!showGrass) continue;              // sin hierba: solo el mapa térmico
        for (let i = 0; i < this.nTufts; i++) {
          const x = this.tuftX[i], y = this.tuftY[i];
          if (x < wxMin || x > wxMax || y < wyMin || y > wyMax) continue; // culling
          let cx = (x / cellW) | 0, cy = (y / cellH) | 0;
          if (cx >= cols) cx = cols - 1; if (cy >= rows) cy = rows - 1;
          const cell = cy * cols + cx;
          const level = res[cell] / Rmax;        // vegetación actual de la zona
          const base = Wld.capacity[cell] / Rmax; // fertilidad local (potencial del suelo)
          // El suelo fértil conserva "rastrojo" aunque lo pasten → la hierba late con el
          // pastoreo (frondosa si no la comen, corta si sí) pero no se queda enana.
          const eff = Math.sqrt(Math.max(level, 0.32 * base));
          if (eff < 0.06) continue;              // suelo pobre y pastado → desnudo
          // Coloración por clima: frío / templado / desierto según la temperatura local.
          const tv = temp[cell];
          const climate = tv < 0.38 ? 0 : tv > 0.62 ? 2 : 1;
          const sp = sets[climate][this.tuftSprite[i]];
          const hh = (8 + eff * 20) * this.tuftScale[i];   // alto del matojo (px de mundo)
          const ww = hh * (sp.width / sp.height);
          // Sombra de contacto en la base del matojo → profundidad (el suelo deja de verse plano).
          ctx.globalAlpha = 0.22 * eff;
          ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.ellipse(x, y, ww * 0.34, hh * 0.11, 0, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = 0.5 + eff * 0.5;
          ctx.drawImage(sp, x - ww / 2, y - hh, ww, hh);
          const fi = this.tuftFlower[i];
          if (fi >= 0 && eff > fThresh) {                  // flor solo en matas altas/sanas
            const fs = (7 + eff * 11) * this.tuftScale[i]; // algo más grandes
            ctx.globalAlpha = 0.6 + 0.4 * ((eff - fThresh) / (1 - fThresh)); // mucho más visibles (antes casi transparentes)
            ctx.drawImage(fsets[climate][fi], x - fs / 2, y - hh * 0.82 - fs / 2, fs, fs);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  resize() {
    const cfg = this.cfg, c = this.canvas;
    const cssW = c.clientWidth || window.innerWidth;
    const cssH = c.clientHeight || window.innerHeight;
    // Calidad BAJA (móvil): DPR=1 (4× menos píxeles en retina) → gran ahorro en fills/blur. ALTA: hasta dprCap.
    this.dpr = cfg.render.quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, cfg.render.dprCap);
    c.width = Math.round(cssW * this.dpr);
    c.height = Math.round(cssH * this.dpr);
    // Escala "cover": el mundo cubre el viewport (sin letterbox) → con el paneo en mosaico
    // nunca se ve el borde del ecosistema. El zoom multiplica sobre esta base.
    this.coverScale = Math.max(c.width / cfg.world.width, c.height / cfg.world.height);
    // El búfer de "suelo" (mapa térmico + hierba) va a resolución de pantalla; forzar
    // re-render tras redimensionar.
    this.grass.width = c.width; this.grass.height = c.height;
    this.fx.width = c.width; this.fx.height = c.height;
    this._gz = NaN;
  }

  _scale() { return this.coverScale * this.zoom; }

  // Píxel de pantalla (CSS) → coordenada del mundo (envuelta al toro). Para click/tap.
  screenToWorld(clientX, clientY) {
    const c = this.canvas, rect = c.getBoundingClientRect();
    const px = (clientX - rect.left) * (c.width / rect.width);
    const py = (clientY - rect.top) * (c.height / rect.height);
    const s = this._scale(), W = this.cfg.world.width, H = this.cfg.world.height;
    let x = this.camX + (px - c.width / 2) / s;
    let y = this.camY + (py - c.height / 2) / s;
    return { x: ((x % W) + W) % W, y: ((y % H) + H) % H };
  }

  // Paneo: desplaza la cámara (en píxeles CSS arrastrados), envolviendo el toro.
  panByScreen(dxCss, dyCss) {
    const s = this._scale(), W = this.cfg.world.width, H = this.cfg.world.height;
    this.camX = (((this.camX - dxCss * this.dpr / s) % W) + W) % W;
    this.camY = (((this.camY - dyCss * this.dpr / s) % H) + H) % H;
  }

  // Zoom centrado en el cursor (mantiene fijo el punto del mundo bajo el puntero).
  zoomAt(factor, clientX, clientY) {
    const c = this.canvas, rect = c.getBoundingClientRect();
    const px = (clientX - rect.left) * (c.width / rect.width);
    const py = (clientY - rect.top) * (c.height / rect.height);
    const W = this.cfg.world.width, H = this.cfg.world.height;
    const s0 = this._scale();
    const wx = this.camX + (px - c.width / 2) / s0;
    const wy = this.camY + (py - c.height / 2) / s0;
    this.zoom = Math.max(1, Math.min(this.maxZoom, this.zoom * factor));
    const s1 = this._scale();
    this.camX = ((((wx - (px - c.width / 2) / s1)) % W) + W) % W;
    this.camY = ((((wy - (py - c.height / 2) / s1)) % H) + H) % H;
  }

  draw() {
    const ctx = this.ctx, cfg = this.cfg, c = this.canvas;
    const W = cfg.world.width, H = cfg.world.height;

    // Reloj de animación ATADO al avance de la SIMULACIÓN (nº de ticks), no al tiempo real: a baja
    // velocidad los organismos se animan en CÁMARA LENTA (coherente con el control fino de velocidad);
    // a alta velocidad se CAPA para no emborronar. Congelado en pausa (dTick=0 y guard de this.paused).
    const ANIM_K = 50;        // ms de animación por tick → a 20 t/s coincide con el ritmo anterior (real-time)
    const ANIM_MAX = 0.8;     // tope de ticks/frame que cuentan para animar → ~2.4× máx a alta velocidad
    const tick = this.sim.tick;
    if (this._lastTick === undefined) { this._lastTick = tick; this._animT = 0; }
    let dTick = tick - this._lastTick; this._lastTick = tick;
    if (dTick < 0) dTick = 0; else if (dTick > ANIM_MAX) dTick = ANIM_MAX; // reseed/reset o cap
    if (!this.paused) this._animT += dTick * ANIM_K;

    // Limpiar a oscuro (se ve solo en modos analíticos, donde el suelo se atenúa).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, c.width, c.height);

    // ESCENARIO: abisal (penumbra atmosférica: regiones tenues + comida fosforescente, criaturas
    // luminosas) o pradera (mapa térmico + hierba/flores). El suelo de cada modo lo pinta _refreshGrass
    // en su búfer; aquí solo se compone. Solo en modo "real"; los analíticos mantienen su suelo atenuado.
    const abyssal = cfg.render.ambiance === 'abyssal';   // el FONDO depende solo del ambiente, NO del modo de color
    this._abyssal = abyssal;
    const lowQ = cfg.render.quality === 'low';           // calidad baja (móvil): sin blooms, menos partículas, sustrato simple
    const camMoved = this.camX !== this._gx || this.camY !== this._gy || this.zoom !== this._gz;
    if (this._grassTimer <= 0 || camMoved) {
      this._refreshGrass();
      this._grassTimer = cfg.render.grassRefreshFrames * (lowQ ? 2 : 1); // baja: refresca el fondo la mitad de veces
      this._gx = this.camX; this._gy = this.camY; this._gz = this.zoom;
    }
    this._grassTimer--;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = (abyssal || this.colorMode === 'real') ? 1 : 0.4; // solo la PRADERA analítica se atenúa; el abisal nunca
    ctx.drawImage(this.grass, 0, 0);
    ctx.globalAlpha = 1;
    // BLOOM de la VEGETACIÓN: copia desenfocada y aditiva → los charcos de comida fosforescente (abisal)
    // y la vegetación irradian luz. Solo donde brilla suma; el fondo oscuro apenas cambia.
    if (cfg.render.glow && !lowQ && (abyssal || this.colorMode === 'real')) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = abyssal ? 0.5 : 0.25;
      ctx.filter = 'blur(4px)';
      ctx.drawImage(this.grass, 0, 0);
      ctx.filter = 'none';
      ctx.restore();
    }

    // ---- Capa de ORGANISMOS (FX) ----
    // Con "estelas": se desvanece un poco cada frame (no se borra) → rastros de movimiento.
    // Sin estelas: se borra y se redibuja (idéntico a antes). En pausa NO se desvanece (congelado).
    const fctx = this.fxCtx;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    if (cfg.render.trails) {
      if (!this.paused) {
        fctx.globalCompositeOperation = 'destination-out';
        fctx.fillStyle = 'rgba(0,0,0,0.12)';   // borra ~12%/frame → la estela se desvanece
        fctx.fillRect(0, 0, c.width, c.height);
        fctx.globalCompositeOperation = 'source-over';
      }
    } else {
      fctx.clearRect(0, 0, c.width, c.height);
    }

    const s = this._scale();
    const offX = c.width / 2 - this.camX * s, offY = c.height / 2 - this.camY * s;
    // Mosaicos del toro que tocan el viewport (≤ 2 por eje porque el viewport ≤ 1 mundo).
    const vwHalf = c.width / (2 * s), vhHalf = c.height / (2 * s);
    const txMin = Math.floor((this.camX - vwHalf) / W), txMax = Math.floor((this.camX + vwHalf) / W);
    const tyMin = Math.floor((this.camY - vhHalf) / H), tyMax = Math.floor((this.camY + vhHalf) / H);
    // (B) NIEVE MARINA: partículas tenues a la deriva (detrito/esporas) → agua profunda viva + profundidad.
    // Capa propia, BAJO los organismos. Solo abisal. Anclada al mundo (deriva lenta con descenso + parpadeo).
    if (abyssal && cfg.render.glow) {
      if (!this._snow) { const n = 740, sn = this._snow = new Float32Array(n * 4), hu = this._snowHue = new Float32Array(n);
        const PAL = [190, 200, 285, 45, 330]; // cian, azul, violeta, oro, rosa (colorcillo raro)
        for (let k = 0; k < n; k++) { sn[k * 4] = Math.random() * W; sn[k * 4 + 1] = Math.random() * H; sn[k * 4 + 2] = Math.random() * 6.283; sn[k * 4 + 3] = 0.4 + Math.random() * Math.random() * 2.1;
          hu[k] = Math.random() < 0.05 ? PAL[(Math.random() * PAL.length) | 0] : -1; } } // ~5% con color, resto azul-blanco
      const sn = this._snow, hu = this._snowHue, tt = this._animT * 0.0009;
      const snEnd = lowQ ? ((sn.length >> 4) << 2) : sn.length; // calidad baja: ~1/4 de las motas
      ctx.globalCompositeOperation = 'lighter';
      for (let ty = tyMin; ty <= tyMax; ty++) for (let tx = txMin; tx <= txMax; tx++) {
        ctx.setTransform(s, 0, 0, s, offX + tx * W * s, offY + ty * H * s);
        for (let k = 0; k < snEnd; k += 4) {
          const ph = sn[k + 2], sz = sn[k + 3];
          const px2 = sn[k] + Math.sin(tt * 0.8 + ph) * 8 + Math.sin(tt * 0.26 + ph * 2.1) * 5; // deriva en 2 frecuencias → más orgánica
          const py2 = (sn[k + 1] + tt * 6 + Math.cos(tt * 0.6 + ph) * 5) % H;                   // descenso algo más vivo + wrap
          let tw = Math.sin(tt * 3.3 + ph * 3.1); tw = tw > 0 ? tw * tw : 0;        // parpadeo CON DESTELLOS puntuales (brillitos)
          const a = (0.05 + tw * 0.52).toFixed(3), hue = hu[k >> 2];
          ctx.fillStyle = hue < 0 ? `rgba(196,221,255,${a})` : `hsla(${hue},82%,62%,${a})`; // mayoría azul-frío; alguna con colorcillo (más oscuro)
          ctx.beginPath(); ctx.arc(px2, py2, sz * (0.55 + tw * 1.3), 0, 6.2832); ctx.fill(); // la mota crece al destellar → chispa
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    for (let ty = tyMin; ty <= tyMax; ty++) {
      for (let tx = txMin; tx <= txMax; tx++) {
        fctx.setTransform(s, 0, 0, s, offX + tx * W * s, offY + ty * H * s);
        this._drawAgents();
      }
    }
    // Componer la capa de organismos sobre el suelo.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.fx, 0, 0);
    // BLOOM de ORGANISMOS + BULBOS: copia desenfocada y aditiva → todo lo luminoso (halos, bulbos
    // de los señuelos, puntas) "sangra" luz. Da el aspecto bioluminiscente potente.
    if (cfg.render.glow && !lowQ && (abyssal || this.colorMode === 'real')) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = abyssal ? 0.4 : 0.28;   // bloom algo menor → los apagados (c_lum bajo) se leen apagados
      ctx.filter = 'blur(4px)';
      ctx.drawImage(this.fx, 0, 0);
      ctx.filter = 'none';
      ctx.restore();
    }

    // Viñeta → profundidad y foco al centro. Más marcada en abisal (sella la penumbra). Cacheada por modo.
    if (abyssal || this.colorMode === 'real') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!this._vignette || this._vigW !== c.width || this._vigH !== c.height || this._vigAb !== abyssal) {
        const vg = ctx.createRadialGradient(
          c.width / 2, c.height / 2, Math.min(c.width, c.height) * (abyssal ? 0.24 : 0.32),
          c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.72);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, abyssal ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.3)');
        this._vignette = vg; this._vigW = c.width; this._vigH = c.height; this._vigAb = abyssal;
      }
      ctx.fillStyle = this._vignette;
      ctx.fillRect(0, 0, c.width, c.height);
    }
  }

  // (Re)construye el lienzo de baja resolución del mapa térmico (frío azul → cálido rojo).
  // Se rehace solo si cambió el mundo (reseed).
  _ensureTempCanvas() {
    const W = this.sim.world;
    if (this._tempWorld === W && this._tempCanvas) return;
    this._tempWorld = W;
    const cv = this._tempCanvas || (this._tempCanvas = document.createElement('canvas'));
    cv.width = W.cols; cv.height = W.rows;
    const g = cv.getContext('2d');
    const img = g.createImageData(W.cols, W.rows), d = img.data, t = W.temp;
    // Gradiente de 3 paradas: nieve blanca (frío) → oliva (templado) → arena de desierto (cálido).
    const cold = [232, 238, 243], mid = [104, 122, 66], hot = [236, 200, 58];
    for (let i = 0; i < t.length; i++) {
      const v = t[i], k = i * 4;
      let a, b, u;
      if (v < 0.5) { a = cold; b = mid; u = v * 2; }      // frío → templado
      else { a = mid; b = hot; u = (v - 0.5) * 2; }       // templado → desierto
      d[k]     = (a[0] + (b[0] - a[0]) * u) | 0;
      d[k + 1] = (a[1] + (b[1] - a[1]) * u) | 0;
      d[k + 2] = (a[2] + (b[2] - a[2]) * u) | 0;
      d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  _drawAgents() {
    const ctx = this.fxCtx, sim = this.sim, glow = this.cfg.render.glow;
    const abyssal = this._abyssal;     // escenario abisal → cuerpos más luminosos + glow reforzado
    const trails = this.cfg.render.trails;
    const active = sim.active, n = sim.activeCount;
    const mode = this.colorMode;
    const sc = this._scale();
    this._drawScale = sc;              // escala mundo→pantalla, para que el ojo sepa su tamaño REAL en píxeles (LOD)
    const detail = 5;                  // si el radio en pantalla supera esto (px) → cuerpo detallado
                                       // (bajo: los detalles aparecen con poco zoom; hay margen de FPS)
    const t = this._animT * 0.006;     // reloj de animación (congelado en pausa)
    const morph = sim.morph, heading = sim.heading, spd = sim.spd, tint = sim.tint, eye = sim.eye, face = sim.face, deco = sim.deco;
    const eyeDetail = 9;               // los ojos necesitan algo más de tamaño en pantalla para leerse
    const partDetail = 11;             // segmentos/módulos solo cuando el cuerpo es bien grande (coste)
    const NB = 22;                     // longitud del bloque de forma corporal/agente
    // Color por partes (ornamental) solo en modos donde el color NO codifica un dato:
    // "visión real" (default) y "linaje". En dieta/energía/gen se mantiene sólido para leer el dato.
    const ornament = (mode === 'real' || mode === 'default' || mode === 'lineage');
    // LOD (rendimiento): a partir de qué radio EN PANTALLA se dibuja cada nivel de detalle. En calidad BAJA
    // (móvil) los umbrales suben → muchos más bichos se dibujan como punto/simple → gran ahorro. No penaliza
    // escritorio (a tan poco tamaño en pantalla no se aprecia el detalle de todas formas).
    const lowQ = this.cfg.render.quality === 'low';
    const dThr = detail;                        // CUERPO: mismo umbral en alta y baja → siempre se ven bichillos (no solo puntos)
    const eThr = eyeDetail * (lowQ ? 2.2 : 1);  // OJOS (gradientes+clips, caros) → muy gateados en baja
    const pThr = partDetail * (lowQ ? 2.4 : 1); // SEGMENTOS/MÓDULOS (AO+textura, lo más caro) → aún más gateados
    for (let a = 0; a < n; a++) {
      const i = active[a];
      const r = sim.radius[i];                 // radio físico real (sin compresión de dibujo)
      const ef = sim.eFrac[i];                 // fracción de energía (precalculada en el worker)
      // El color es una LECTURA del estado, no afecta a la simulación. Cada modo reinterpreta.
      let h, s, l;
      switch (mode) {
        case 'diet':    h = (1 - sim.diet[i]) * 120; s = 85; l = 52; break;        // verde→rojo
        case 'lineage': h = lineageHue(sim.lineage[i]); s = 70; l = 55; break;      // 1 color por linaje
        case 'species': h = lineageHue(sim.species[i] | 0); s = 78; l = 55; break;  // 1 color por ESPECIE
        case 'gene':    h = (1 - sim.geneSel[i]) * 250; s = 80; l = 52; break;      // azul(bajo)→rojo(alto)
        case 'energy':  h = ef * 130; s = 85; l = 50; break;                         // rojo(hambre)→verde
        // Visión real: el gen `hue` da el tono (paleta SIN verdes, para no confundirse con la hierba).
        // COLORES COMO EN LA NATURALEZA: saturación base BAJA (tonos terrosos/apagados → cripsis); la
        // VIBRANCIA la dispara el ornamento (`orn`, gen de selección sexual): la mayoría va apagada y solo
        // los muy ornamentados lucen colores vivos (exhibición). La absorción usa el gen crudo (sim.js).
        default: {
          const cSat = deco ? deco[i * 8 + 2] : 0.35;   // VIVACIDAD (deriva libre)
          const cLumC = deco ? deco[i * 8 + 1] : 0.35;   // LUMINOSIDAD (deriva libre)
          h = (165 + sim.hue[i] * 150) % 360;  // banda ESTRECHA (turquesa→azul→violeta→magenta) → ecosistema armónico, no circo
          s = 18 + cSat * cSat * 82;           // suelo y techo subidos → menos gris, más color
          // brillo = energía + LUMINOSIDAD (cuadrática). Base subida → cuerpos más claros.
          l = abyssal ? (31 + ef * 24 + cLumC * cLumC * 14) : (31 + ef * 26 + cLumC * cLumC * 10);
          // Los más CARNÍVOROS tienden a algo más oscuros (lectura visual del gen `diet`, SOLO render). Suavizado 7→5.
          l -= sim.diet[i] * 5;
        }
      }
      const x = sim.x[i], y = sim.y[i];
      const rPx = r * sc;                              // radio EN PANTALLA (px) → decide el nivel de detalle (LOD)
      const detailed = morph && morph.length && rPx > dThr; // pequeño en pantalla → punto simple (barato)
      // Sombra de contacto (solo cuerpos detallados): despega al organismo del fondo (luz arriba-izq).
      // Se omite con estelas activas (dejaría manchas oscuras al desvanecerse).
      if (detailed && !trails && !abyssal) {     // sombra de contacto inútil sobre fondo oscuro
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(x + r * 0.32, y + r * 0.42, r * 1.08, r * 0.96, 0, 0, 6.2832);
        ctx.fill();
      }
      if (glow) {
        // Halo con DEGRADADO de transparencia. El RADIO y la INTENSIDAD varían con el ornamento (orn):
        // bioluminiscencia como exhibición → unos brillan amplios e intensos, otros tenues y ceñidos.
        // El centro (orn bajo, lo común) queda moderado para no fundir halos vecinos ("hormiguero").
        const cLumG = deco ? deco[i * 8 + 1] : 0.35;   // LUMINOSIDAD: gen decorativo de deriva libre (sin runaway)
        const gr = r * (abyssal ? (1.65 + cLumG * cLumG * 3.0) : (1.45 + cLumG * cLumG * 2.4)); // halo algo mayor
        const gl = abyssal ? Math.min(82, l + 26) : Math.min(74, l + 12);
        const a0 = (abyssal ? 0.21 : 0.13) + cLumG * cLumG * (abyssal ? 0.48 : 0.32); // suelo y empuje subidos → glow más visible
        const gg = ctx.createRadialGradient(x, y, r * 0.25, x, y, gr);
        gg.addColorStop(0, `hsla(${h},${s}%,${gl}%,${a0})`);
        gg.addColorStop(0.45, `hsla(${h},${s}%,${gl}%,${a0 * 0.32})`);
        gg.addColorStop(1, `hsla(${h},${s}%,${gl}%,0)`);
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(x, y, gr, 0, 6.2832);
        ctx.fill();
      }
      // LOD: cuerpo detallado solo si es grande en pantalla (zoom/agente grande); si no, punto.
      if (detailed) {
        this._drawBody(ctx, x, y, r, h, s, l, morph, i * NB, heading[i], spd[i], t, tint, i * 3, ornament,
                       eye, i * 4, rPx > eThr, ef, face, i * 3, rPx > pThr, deco, i * 8); // ojos/segmentos solo si grandes en pantalla
      } else {
        ctx.fillStyle = `hsl(${h},${s}%,${l}%)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.2832);
        ctx.fill();
      }
    }
  }

  // Dibuja el cuerpo de un organismo: núcleo (elipse orientada al rumbo) + apéndices que
  // ondean (cilios/paletas/flagelos). Forma a partir de los genes de morfología (cosmético, F-A).
  _drawBody(ctx, x, y, r, h, s, l, morph, mo, heading, spd, t, tint, to, ornament, eye, eo, showEyes, ef, face, fo, showParts, deco, dco) {
    const hasD = deco && dco != null;
    const bAspect = hasD ? deco[dco] : 0.45;
    // Estilo de señuelo (genes decorativos): largo, tamaño de bulbo, color (acento) y número.
    const oLen = hasD ? deco[dco + 3] : 0.4, oBulb = hasD ? deco[dco + 4] : 0.3, oHue = hasD ? deco[dco + 5] : 0.5, oNum = hasD ? deco[dco + 6] : 0.3;
    const tex2 = hasD ? deco[dco + 7] : 0.5;   // 2º eje de piel: escala/densidad del patrón (deriva libre)
    // Escala mundo→pantalla: los mínimos de grosor/tamaño se expresan POR PÍXEL (÷ds) para no engordar
    // las proporciones a radio pequeño. Así el bicho se ve IGUAL a cualquier tamaño (mundo == retrato).
    const ds = this._drawScale || 1, fmin = (px) => px / ds;   // fmin(px) = mínimo de px en pantalla, en unidades de dibujo
    // ---- APÉNDICES: montaje ORIGINAL — 3 genes LIBRES lineales (nº, largo, grosor) + ramificación libre. ----
    const app = 1 + ((morph[mo] * 7 + 0.5) | 0);     // nº: 1..8 (libre)
    const len = r * (0.35 + morph[mo + 1] * 7.5);     // largo: rango amplio (cortos ↔ flagelos largos)
    // El TECHO de grosor (coef. de m_width) CRECE con el LARGO y BAJA con la RAMIFICACIÓN; el SUELO (m_width=0) no cambia.
    const lwRange = 1.9 * (0.5 + morph[mo + 1]) * (1 - morph[mo + 20] * 0.85) * (1 - morph[mo] * 0.4); // largo→+ · rama→-- · nº→- (un poco)
    const lw = Math.max(fmin(0.5), (0.06 + morph[mo + 2] * lwRange) * r * 0.62); // suelo fijo (~0.037r); techo variable
   
    
    const sym = morph[mo + 3];                         // repartido ↔ agrupado atrás
    const elong = 1 + morph[mo + 4] * 1.3;             // elongación de la cabeza: rango MODERADO (de redonda a alargada, sin eels degenerados)
    const wave = morph[mo + 5];                        // amplitud de ondulación
    const segsN = 9;                                   // resolución de la curva del apéndice (más puntos → contorno suave/orgánico)
    // Segmentación (complejidad corporal). Solo si el cuerpo es bien grande en pantalla → coste acotado.
    const nSeg = showParts ? 1 + ((morph[mo + 6] * 4 + 0.5) | 0) : 1; // 1..5 segmentos
    const tf = 0.55 + morph[mo + 7] * 0.5;             // factor de tamaño por segmento (cónica)
    const spaceF = 0.58 + morph[mo + 8] * 0.72;        // separación REDUCIDA → segmentos SOLAPAN → cuerpo continuo (no cuentas sueltas)
    // SIMETRÍA BILATERAL POR CONSTRUCCIÓN: el cuerpo se dibuja espejado (izq = der) por diseño, como el
    // Bauplan de casi todos los animales. morph[17] (s_asym) SÍ se usa → silueta de cabeza (mejillas/cuello/
    // mandíbula); morph[18] (s_curve) SÍ se usa → patrón de piel. La columna además FLEXIONA articulada al
    // nadar (ver disposición de segmentos). Forma estética NEUTRAL y simétrica: deriva libre → variedad sin colapso.
    const branch = showParts ? morph[mo + 20] : 0;     // ramificación LIBRE (s_branch): >0.5 → Y · >0.8 → coral
    const coreSh = morph[mo + 21];                     // 0.5 = elipse; ≠ gota/teardrop (afilado frente/detrás)
    const frontF = 1 + (coreSh - 0.5) * 1.7, backF = 1 - (coreSh - 0.5) * 1.7; // (B) gota/dardo más marcado → más variedad de silueta
    // ---- FORMA DE CABEZA (apariencia, todo simétrico). Reaprovecha genes decorativos para dar variedad
    // sin reindexar el genoma: proporción (m_len), ancho ⟂ largo (m_width), silueta (s_asym=morph[17]). ----
    const headScale = 0.6 + (1 - morph[mo + 1]) * 0.55;   // proporción cabeza/cuerpo: apéndices largos → cabeza menor (anti-cabezón)
    const headW = 0.55 + bAspect * 0.95;                  // (E) esbeltez corporal MODERADA: ni aguja (0.55) ni globo (1.5), DESACOPLADO
                                                          // del grosor de antenas → del estilizado/hidrodinámico al regordete (sin extremos)
    const hr = r * headScale;                             // radio de cabeza efectivo (ojos y abanico se anclan a él)
    const silMode = Math.min(3, (morph[mo + 17] * 4) | 0); // 0 elipse · 1 mejillas/lóbulos · 2 cuello · 3 mandíbula
    const silAmt = silMode === 0 ? 0 : 0.45 + (morph[mo + 17] * 4 - silMode) * 0.6; // (B) intensidad de silueta algo mayor → más carácter
    // ---- Colores (apéndice, punta, contornos, volumen). En modos de datos: tono único. ----
    const cApp = tint ? tint[to] : 0.5, cTip = tint ? tint[to + 1] : 0.5, orn = tint ? tint[to + 2] : 0;
    const appL = Math.max(14, l - 16);
    const appHue = ornament ? (((h + (cApp - 0.5) * 70) % 360) + 360) % 360 : h; // deriva de tono SUTIL (±35°), no chillón
    const appColor = `hsl(${appHue},${s}%,${appL}%)`;
    // Volumen del apéndice (Fase A): oscuro donde se ancla al cuerpo → claro hacia la punta (membrana
    // translúcida/aleta) + un brillo de cresta. Sustituye al relleno PLANO que se veía de cartón en grande.
    const appDark = `hsl(${appHue},${Math.min(100, s + 8)}%,${Math.max(7, appL - 11)}%)`;
    const appLight = `hsl(${appHue},${Math.max(18, s - 8)}%,${Math.min(74, appL + 16)}%)`;
    const appSheen = `hsla(${appHue},${Math.max(15, s - 12)}%,${Math.min(86, appL + 30)}%,0.3)`; // cresta MÁS tenue (no raya marcada)
    const tipHue = (((appHue + (cTip - 0.5) * 60) % 360) + 360) % 360; // acento de punta SUTIL (±30°)
    const tipColor = `hsl(${tipHue},${s}%,${Math.min(80, appL + 26)}%)`;
    const tipStart = (segsN * 0.6) | 0;
    const outApp = `hsl(${appHue},${s}%,${Math.max(14, appL - 7)}%)`;
    const coreOut = `hsl(${h},${Math.min(100, s + 6)}%,${Math.max(6, l - 22)}%)`;     // borde más oscuro → silueta asentada
    // VOLUMEN ESFÉRICO (no cartulina plana): highlight contenido arriba-izq → sombra de borde MUCHO más
    // oscura y MÁS saturada (las sombras orgánicas ganan color, no gris) → la luz rueda sobre un cuerpo 3D.
    const coreLight = `hsl(${h},${Math.max(22, s - 16)}%,${Math.min(82, l + 18)}%)`;
    const coreMid = `hsl(${h},${s}%,${Math.max(12, l - 3)}%)`;
    const coreDark = `hsl(${h},${Math.min(100, s + 12)}%,${Math.max(4, l - 26)}%)`;
    // RIM-LIGHT (Fase A): contraluz en el borde sup-izq de la silueta. Se pinta en la pasada de CONTORNO con un
    // degradado direccional → solo la banda del borde exterior lo muestra (claro al lado iluminado, oscuro al
    // otro) → la criatura "recorta" contra el fondo con volumen, sin costuras internas. Escala con el contorno.
    const coreRim = `hsl(${h},${Math.max(14, s - 22)}%,${Math.min(90, l + 34)}%)`;
    // PIEL EMERGENTE (Fase C): el patrón de superficie sale de `s_curve` (morph[18], gen DECORATIVO de deriva
    // libre → cada linaje su propia piel; NO está codificado qué patrón es "bueno"). lisa / bandas / moteado,
    // con intensidad continua. El color de la piel se deriva de la PALETA DEL CUERPO (tinta oscura + reflejo
    // claro) → nunca un circo. Se dibuja recortado por parte y SOLO en partes grandes en pantalla (ver drawPart).
    const texG = morph[mo + 18];
    // 5 patrones de piel (s_curve, deriva libre): 0 lisa · 1 bandas transversales · 2 rayas longitudinales ·
    // 3 moteado · 4 ocelos (manchas-ojo). Bandas de 0.20 en [0,1]; texAmt = intensidad dentro de la banda.
    const texMode = texG < 0.20 ? 0 : texG < 0.40 ? 1 : texG < 0.60 ? 2 : texG < 0.80 ? 3 : 4;
    const texAmt = texMode === 0 ? 0 : (texG - texMode * 0.20) / 0.20; // 0..1 (bandLo de la banda m = m·0.20)
    const texInk = `hsla(${h},${Math.min(100, s + 8)}%,${Math.max(4, l - 18)}%,`;   // tinta oscura (falta alpha+')')
    const texLit = `hsla(${h},${Math.max(18, s - 10)}%,${Math.min(86, l + 22)}%,`;  // reflejo claro (idem)
    const outW = Math.max(fmin(0.3), r * 0.03);  // contorno fino (antes 0.05·r): menos "sticker", más integrado
    const pulse = 1 + (0.03 + 0.05 * (ef || 0)) * Math.sin(t * 1.6 + mo); // latido
    const sx = this._sx || (this._sx = new Float32Array(16)); // buffers reutilizables (sin GC)
    const sy = this._sy || (this._sy = new Float32Array(16));

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);                               // +x = hacia delante (rumbo)
    ctx.scale(pulse, pulse);                           // LATIDO: respira todo el cuerpo de forma uniforme
    ctx.lineJoin = 'round';

    // Un apéndice ondulante y afilado desde (bx,by) en dirección `ang`. `br`>0.5 → se bifurca una vez.
    const drawApp = (bx, by, ang, lenA, lwA, k, br) => {
      const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
      const ampl = wave * lenA * 0.3 * (0.35 + spd);
      const ph = t * (1 + spd * 2.5) + k * 0.7, hw0 = lwA * 0.62;
      const restC = lenA * 0.16 * Math.sin(k * 1.7 + 0.6);   // CURVATURA en reposo (varía por apéndice; simétrica en pares) → no son palos rectos
      for (let q = 0; q <= segsN; q++) {
        const f = q / segsN, w = restC * f * f + Math.sin(ph + f * 3.2) * ampl * f;  // arco suave + ondulación
        sx[q] = bx + dx * lenA * f + px * w; sy[q] = by + dy * lenA * f + py * w;
      }
      const fk = (segsN * 0.55) | 0, fx = sx[fk], fy = sy[fk];   // punto de bifurcación (~55% del largo)
      // perfil de grosor: afilado orgánico (potencia) hasta la punta.
      const hwAt = (q) => hw0 * Math.pow(1 - q / segsN, 0.55);
      // (Color) DEGRADADO SUAVE a lo largo: raíz oscura → cuerpo claro → punta (acento ya muy sutil), todo como
      // paradas del MISMO degradado → sin borde duro ni "bandera bicolor"; el color rueda de forma continua.
      const gApp = ctx.createLinearGradient(sx[0], sy[0], sx[segsN], sy[segsN]);
      gApp.addColorStop(0, appDark); gApp.addColorStop(0.55, appLight);
      gApp.addColorStop(1, ornament ? tipColor : appLight);
      ctx.fillStyle = gApp; ctx.beginPath();
      ctx.moveTo(sx[0] + px * hw0, sy[0] + py * hw0);
      for (let q = 1; q <= segsN; q++) { const hw = hwAt(q); ctx.lineTo(sx[q] + px * hw, sy[q] + py * hw); }
      for (let q = segsN; q >= 0; q--) { const hw = hwAt(q); ctx.lineTo(sx[q] - px * hw, sy[q] - py * hw); }
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = outW; ctx.strokeStyle = outApp; ctx.stroke();
      // Brillo de cresta: línea fina y MUY tenue por el centro → apéndice húmedo, con relieve (no una raya marcada).
      ctx.lineWidth = Math.max(fmin(0.3), hw0 * 0.3); ctx.strokeStyle = appSheen; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx[0], sy[0]);
      for (let q = 1; q <= tipStart; q++) ctx.lineTo(sx[q], sy[q]);
      ctx.stroke();
      // (C) Textura sutil en apéndices GRANDES: 1-3 nervios longitudinales tenues (aspecto de aleta/membrana, no
      // cartón plano). Nº según la piel (s_curve/tex2); escalan con el ancho local → no invaden la punta.
      if (texMode && lenA * ds > 26) {
        const nr = 1 + (texMode >= 2 ? 1 : 0) + (tex2 > 0.6 ? 1 : 0);
        ctx.lineWidth = Math.max(fmin(0.25), hw0 * 0.14);
        for (let rI = 1; rI <= nr; rI++) {
          const base = (rI / (nr + 1) - 0.5) * 1.3;                // posición lateral del nervio (−0.65..0.65)
          ctx.beginPath();
          for (let q = 0; q <= tipStart; q++) {
            const o = base * hwAt(q), xx = sx[q] + px * o, yy = sy[q] + py * o;
            if (q === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
      if (br > 0.5) {                                  // ramificación: dos sub-apéndices (aspecto coral/asta)
        const sub = br > 0.75 ? br - 0.3 : 0;          // 2º nivel de ramificación si MUY ramificado (coral denso)
        drawApp(fx, fy, ang - 0.65, lenA * 0.5, lwA * 0.72, k + 11, sub);
        drawApp(fx, fy, ang + 0.65, lenA * 0.5, lwA * 0.72, k + 17, sub);
      }
    };
    // Una parte (cuerpo): degradado de volumen + contorno; forma de GOTA por `frF/bkF`; `wF` = ancho.
    // `sil` (>0) deforma la silueta de la cabeza (mejillas/cuello/mandíbula) de forma SIMÉTRICA sobre
    // el eje x. Segmentos/módulos llaman sin esos args → elipse-gota de siempre. save/restore propio.
    // Traza el CONTORNO de una parte (elipse-gota o silueta paramétrica) en el path actual. No rellena.
    const tracePart = (rx, ry, frF, bkF, sil, silA) => {
      ctx.beginPath();
      if (!sil) {
        ctx.ellipse(0, 0, rx * frF, ry, 0, -Math.PI / 2, Math.PI / 2);   // mitad delantera (+x)
        ctx.ellipse(0, 0, rx * bkF, ry, 0, Math.PI / 2, Math.PI * 1.5);  // mitad trasera (-x)
      } else {
        const N = 30;
        for (let k = 0; k <= N; k++) {
          const e = (k / N) * 6.2832, ce = Math.cos(e), se = Math.sin(e), u = ce;
          let wm = 1;
          if (sil === 1) { const d = (u - 0.15) / 0.42; wm = 1 + silA * 0.95 * Math.exp(-d * d); }      // mejillas/lóbulos
          else if (sil === 2) { const d = (u + 0.5) / 0.3; wm = 1 - silA * 0.72 * Math.exp(-d * d); }   // cuello pinzado atrás
          else { wm = u > 0 ? 1 + silA * 0.85 * u : 1 - silA * 0.22 * (-u); }                            // mandíbula (frente ancho)
          const x = (ce >= 0 ? rx * frF : rx * bkF) * ce, y = ry * se * wm;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
    };
    // Dibuja una parte SIN trazo propio. mode='outline' → silueta AGRANDADA en color de contorno; mode='body' →
    // relleno con luz CONSISTENTE (highlight siempre arriba-izquierda del CUERPO, no de la parte → volumen único).
    // Dos pasadas (todas 'outline', luego todas 'body') → UN contorno sin costuras internas → organismo continuo.
    const drawPart = (pcx, pcy, pr, pElong, pAng, wF, frF, bkF, sil, silA, mode) => {
      if (wF === undefined) wF = 1;
      if (frF === undefined) frF = frontF;
      if (bkF === undefined) bkF = backF;
      sil = sil || 0;
      const rx = pr * pElong, ry = pr * wF, R = Math.max(rx, ry);
      ctx.save(); ctx.translate(pcx, pcy); ctx.rotate(pAng);
      if (mode === 'outline') {
        const grow = 1 + (outW * 1.8) / pr;                 // silueta agrandada → borde único de todo el cuerpo
        const ct = Math.cos(pAng), st = Math.sin(pAng);     // dir. de luz (arriba-izq del CUERPO) en marco local
        const lx = ct * 0.6 + st * -0.8, ly = -st * 0.6 + ct * -0.8;
        const Ro = Math.max(rx, ry) * grow;
        const g = ctx.createLinearGradient(lx * Ro, ly * Ro, -lx * Ro, -ly * Ro);
        g.addColorStop(0, coreRim); g.addColorStop(0.5, coreOut); g.addColorStop(1, coreDark); // borde claro→oscuro
        ctx.fillStyle = g; tracePart(rx * grow, ry * grow, frF, bkF, sil, silA); ctx.fill();
      } else {
        const ct = Math.cos(pAng), st = Math.sin(pAng);     // highlight en dirección fija del CUERPO → luz unificada
        const hlx = (ct * 0.22 + st * -0.30) * R, hly = (-st * 0.22 + ct * -0.30) * R;
        const g = ctx.createRadialGradient(hlx, hly, ry * 0.1, 0, 0, R * 1.15);
        g.addColorStop(0, coreLight); g.addColorStop(0.55, coreMid); g.addColorStop(1, coreDark);
        ctx.fillStyle = g; tracePart(rx, ry, frF, bkF, sil, silA); ctx.fill();
        // PIEL EMERGENTE: textura recortada a la parte, SOLO si la parte es grande en pantalla (pr·ds) → los
        // pequeños conservan su silueta limpia y el coste queda acotado a los pocos grandes visibles.
        if (texMode && pr * ds > 13) {
          tracePart(rx, ry, frF, bkF, sil, silA); ctx.clip();      // recorta el patrón a la silueta de la parte
          // tex2 (gen decorativo): ESCALA/DENSIDAD del patrón → más elementos y más finos cuando sube.
          const dens = 0.6 + tex2 * 1.7, invS = 1 / Math.sqrt(dens);
          // hash estable por elemento (h constante por organismo → sin parpadeo entre frames)
          const hf1 = (k) => Math.abs(Math.sin((k + 1) * 12.9898 + h * 0.13)) % 1;
          const hf2 = (k) => Math.abs(Math.sin((k + 1) * 78.233 + h * 0.07)) % 1;
          if (texMode === 1) {                                     // BANDAS transversales (oruga/pez): a lo ANCHO
            const nb = Math.max(2, ((2 + texAmt * 4) * dens) | 0), inkA = (0.10 + texAmt * 0.20).toFixed(3);
            ctx.fillStyle = texInk + inkA + ')';
            for (let bI = 0; bI < nb; bI++) {
              const bx = -rx + ((bI + 0.5) / nb) * 2 * rx;
              ctx.beginPath(); ctx.ellipse(bx, 0, rx * 0.10 * invS, ry * 1.05, 0, 0, 6.2832); ctx.fill();
            }
          } else if (texMode === 2) {                              // RAYAS longitudinales (a lo LARGO del eje)
            const nb = Math.max(2, ((2 + texAmt * 3) * dens) | 0), inkA = (0.10 + texAmt * 0.20).toFixed(3);
            ctx.fillStyle = texInk + inkA + ')';
            for (let bI = 0; bI < nb; bI++) {
              const by = -ry + ((bI + 0.5) / nb) * 2 * ry;
              ctx.beginPath(); ctx.ellipse(0, by, rx * 1.05, ry * 0.09 * invS, 0, 0, 6.2832); ctx.fill();
            }
          } else if (texMode === 3) {                              // MOTEADO (manchas claras/oscuras, lattice estable)
            const ns = Math.max(3, ((3 + texAmt * 5) * dens) | 0), inkA = (0.12 + texAmt * 0.18).toFixed(3), litA = (0.08 + texAmt * 0.12).toFixed(3);
            for (let sI = 0; sI < ns; sI++) {
              const f1 = hf1(sI), f2 = hf2(sI);
              const sx2 = (f1 * 2 - 1) * rx * 0.78, sy2 = (f2 * 2 - 1) * ry * 0.78;
              const sr2 = (0.12 + f1 * 0.13) * Math.min(rx, ry) * invS;
              ctx.fillStyle = (sI & 1) ? texLit + litA + ')' : texInk + inkA + ')';
              ctx.beginPath(); ctx.arc(sx2, sy2, sr2, 0, 6.2832); ctx.fill();
            }
          } else {                                                 // OCELOS (manchas-ojo: anillo de tinta + centro claro)
            const ns = Math.max(2, ((2 + texAmt * 3) * dens) | 0), ringA = (0.16 + texAmt * 0.20).toFixed(3), litA = (0.14 + texAmt * 0.16).toFixed(3);
            for (let sI = 0; sI < ns; sI++) {
              const f1 = hf1(sI), f2 = hf2(sI);
              const ox = (f1 * 2 - 1) * rx * 0.66, oy = (f2 * 2 - 1) * ry * 0.66;
              const orR = (0.16 + f1 * 0.12) * Math.min(rx, ry) * invS;
              ctx.fillStyle = texInk + ringA + ')';
              ctx.beginPath(); ctx.arc(ox, oy, orR, 0, 6.2832); ctx.fill();
              ctx.fillStyle = texLit + litA + ')';
              ctx.beginPath(); ctx.arc(ox, oy, orR * 0.5, 0, 6.2832); ctx.fill();
            }
          }
        }
      }
      ctx.restore();
    };

    // Disposición de segmentos: columna FLEXIBLE (cadena ÚNICA) que ONDULA al nadar (onda viajera, no anclajes
    // rígidos). La ramificación vive SOLO en los apéndices (un único eje `s_branch`); la columna no se bifurca.
    const bodyElong = 1 + (elong - 1) * 0.7;           // segmentos más oblongos → aspecto de gusano
    const segXs = [0], segYs = [0], segAngs = [0], segRs = [r];
    const segParent = [-1];                            // índice del segmento del que "cuelga" cada uno (junturas)
    // FLEXIÓN ARTICULADA: la dirección de la columna se ACUMULA juntura a juntura — cada segmento gira un poco
    // respecto a SU anclaje (la cabeza o el segmento previo), no respecto a un "recto hacia atrás" fijo. El desfase
    // por índice (−i) propaga una ONDA VIAJERA por la columna → la cola oscila más que el cuello (no un bloque rígido
    // que pivota solo en la cabeza). Amplitud por juntura ∝ gen de ondulación; algo de vida en reposo y más al nadar.
    const jointAmp = (0.05 + wave * 0.14) * (0.55 + spd * 0.7);  // flexión POR JUNTURA (rad)
    const waveT = t * (1 + spd * 2.5);                          // fase temporal (oscila/viaja más rápido al nadar)
    let cxp = 0, cyp = 0, prevR = r, dir = Math.PI;    // dir = dirección ACUMULADA de la columna (arranca recta hacia atrás)
    for (let i = 1; i < nSeg; i++) {                   // CADENA ÚNICA: cada juntura flexiona sobre la anterior (onda viajera)
      const sr = prevR * tf, gap = (prevR + sr) * 0.5 * spaceF;
      dir += Math.sin(waveT - i * 1.1) * jointAmp;     // giro EN LA JUNTURA i (relativo al segmento previo)
      cxp += Math.cos(dir) * gap; cyp += Math.sin(dir) * gap;
      segXs.push(cxp); segYs.push(cyp); segAngs.push(dir); segRs.push(sr); segParent.push(i - 1); prevR = sr;
    }
    // Módulos opcionales (on/off): partes extra. Se anclan en el arco SUPERIOR [0,π] y se DUPLICAN
    // con su espejo en el inferior → pares simétricos (garras/lóbulos a ambos lados), nunca un bulto suelto.
    const modX = [], modY = [], modR = [], modA = [];
    if (showParts) {
      for (let mk = 0; mk < 2; mk++) {
        const b = mo + 9 + mk * 4;
        if (morph[b] < 0.5) continue;                  // gen de presencia bajo umbral → ausente
        const a = morph[b + 1] * Math.PI;              // [0,π]: arco superior (su espejo cubre el inferior)
        const dist = (0.55 + morph[b + 2] * 0.9) * r, mr = (0.3 + morph[b + 3] * 0.6) * r;
        const onAxis = a < 0.08 || a > Math.PI - 0.08; // sobre el eje (frente/cola) → módulo único, sin duplicar
        for (let sgn = 1; sgn >= -1; sgn -= 2) {       // módulo + ESPEJO sobre el eje x
          const aa = a * sgn;
          modX.push(Math.cos(aa) * dist); modY.push(Math.sin(aa) * dist);
          modR.push(mr); modA.push(aa);
          if (onAxis) break;
        }
      }
    }

    // ---- Paso 1: apéndices de TODAS las partes (quedan detrás de los cuerpos) ----
    // Cabeza: PARES ESPEJADOS sobre el eje del cuerpo (simetría bilateral por construcción). Cada par
    // se abre desde el eje TRASERO (π) una desviación creciente; con apertura grande envuelve hasta el
    // frente (corona). s_place + sym controlan la apertura → variedad de siluetas, siempre simétrica.
    const fanSpan = 0.4 + sym * 0.5 + morph[mo + 19] * 2.3; // apertura del abanico (penacho ↔ corona)
    const nPairs = Math.ceil(app / 2);
    for (let k = 0; k < app; k++) {
      const pairIdx = k >> 1, side = (k & 1) ? -1 : 1;
      const frac = nPairs > 1 ? pairIdx / (nPairs - 1) : 0;  // 0 (junto al eje) .. 1 (borde)
      const dev = 0.25 + frac * fanSpan;                     // desviación desde el eje trasero
      const onAxis = (app & 1) && k === app - 1;             // nº impar: el sobrante va centrado atrás
      const ang = onAxis ? Math.PI : Math.PI - side * dev;   // espejado: +side / -side sobre el eje x
      const dx = Math.cos(ang), dy = Math.sin(ang);
      // largos DESIGUALES pero SIMÉTRICOS: cada par (pairIdx) tiene su propio largo (unos largos, otros cortos);
      // los dos lados comparten pairIdx → espejo perfecto. Patrón estable por organismo (fase = ondulación).
      const wob = 0.55 + 0.55 * Math.sin(pairIdx * 2.3 + morph[mo + 5] * 8);
      const lk = len * Math.max(0.15, (1 - 0.22 * frac) * wob);
      // phase = pairIdx → los dos miembros del par ondulan en fase → bending simétrico también en movimiento
      drawApp(dx * hr * 0.72, dy * hr * elong * 0.62, ang, Math.max(lk, len * 0.15), lw, pairIdx, branch);
    }
    const legN = Math.max(1, (app * 0.3 + 0.3) | 0), lwSeg = Math.max(fmin(0.8), lw * 0.85); // patas casi tan gruesas como los apéndices
    for (let i = 1; i < segXs.length; i++) {            // segmentos: patas perpendiculares a la columna (toda la cadena → ramas simétricas)
      const scx = segXs[i], scy = segYs[i], sr = segRs[i], legLen = len * (0.35 + 0.35 * sr / r);
      for (let side = -1; side <= 1; side += 2) {
        const baseAng = segAngs[i] + side * Math.PI / 2;
        const ll = Math.max(legLen, len * 0.1);        // patas iguales a ambos lados (espejado)
        for (let k = 0; k < legN; k++) {
          const even = legN > 1 ? (k / (legN - 1) - 0.5) : 0;
          const ang = baseAng + even * 0.7, dx = Math.cos(ang), dy = Math.sin(ang);
          // phase sin `side` → patas izq/der del mismo segmento en fase → ondulación simétrica
          drawApp(scx + dx * sr * 0.6, scy + dy * sr * 0.6, ang, ll, lwSeg, i * 3 + k, branch);
        }
      }
    }
    for (let m = 0; m < modX.length; m++) {            // módulos: abanico hacia fuera
      const cnt = Math.max(1, (app * 0.4 + 0.5) | 0);
      for (let k = 0; k < cnt; k++) {
        const even = cnt > 1 ? (k / (cnt - 1) - 0.5) : 0;
        const ang = modA[m] + even * 0.9, dx = Math.cos(ang), dy = Math.sin(ang);
        drawApp(modX[m] + dx * modR[m] * 0.6, modY[m] + dy * modR[m] * 0.6, ang, len * 0.5, lwSeg, m * 5 + k, branch);
      }
    }

    // ---- Paso 2: cuerpos (de atrás hacia delante; módulos y luego la cabeza encima) ----
    const segWF = 0.55 + bAspect * 0.85;               // los segmentos heredan la esbeltez del cuerpo (gusanos finos ↔ rechonchos)
    // CUERPO CONTINUO: pasada 1 = silueta-contorno única (partes agrandadas, color oscuro); pasada 2 = relleno
    // (cubre el interior y deja solo el borde exterior como contorno) → sin costuras internas, un organismo.
    for (let pass = 0; pass < 2; pass++) {
      const mode = pass === 0 ? 'outline' : 'body';
      // iterar TODA la cadena (segXs.length, no nSeg): con bifurcación hay más entradas que nSeg y usar nSeg
      // dejaba una rama de la Y a medio dibujar (asimétrica). Así ambas ramas se dibujan completas y espejadas.
      for (let i = segXs.length - 1; i >= 1; i--) drawPart(segXs[i], segYs[i], segRs[i], bodyElong, segAngs[i], segWF, undefined, undefined, 0, 0, mode);
      for (let m = 0; m < modX.length; m++) drawPart(modX[m], modY[m], modR[m], 1.1, 0, undefined, undefined, undefined, 0, 0, mode);
      drawPart(0, 0, hr, elong, 0, headW, frontF, backF, silMode, silAmt, mode); // cabeza al final (encima)
    }

    // ---- Fase B: OCLUSIÓN INTER-SEGMENTO (sombra suave en las junturas) → el cuerpo segmentado se lee como una
    // columna con relieve de anillos, no un bulto liso. Se pinta sobre el relleno y bajo ojos/ornamento. Solo
    // hay segmentos cuando showParts (cuerpos grandes en pantalla) → naturalmente gateado a los grandes.
    if (segXs.length > 1) {
      for (let i = 1; i < segXs.length; i++) {
        const p = segParent[i]; if (p < 0) continue;
        const jx = (segXs[i] + segXs[p]) * 0.5, jy = (segYs[i] + segYs[p]) * 0.5;  // punto de juntura
        const ax = segXs[i] - segXs[p], ay = segYs[i] - segYs[p];
        const along = (Math.hypot(ax, ay) || 1) * 0.55;                            // extensión a lo largo del eje
        const wHalf = Math.min(segRs[i], segRs[p]) * segWF * bodyElong * 1.02;      // semiancho del cuerpo aquí
        ctx.save();
        ctx.translate(jx, jy); ctx.rotate(Math.atan2(ay, ax)); ctx.scale(along, wHalf); // marco elíptico transversal
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');  // oscuro en la juntura → se desvanece
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 6.2832); ctx.fill();
        ctx.restore();
      }
    }

    // ---- ORNAMENTO de selección sexual (cresta/penacho): plumas vivas que CRECEN con `orn`.
    // Su tamaño/nº exhiben el gen elegido por las parejas → exageración visible (runaway de Fisher).
    if (orn > 0.12) {
      const np = 1 + ((oNum * oNum * 6) | 0);          // 1..7 señuelos, CUADRÁTICO → casi siempre pocos (1-2); muchos es raro
      const plen = r * (0.5 + oLen * 5.5);             // largo del tallo (o_len): de corto ↔ MUY largo colgante (hasta ~6×radio)
      const ohue = ornament ? appHue : h;
      ctx.lineCap = 'round';
      const bulbR = Math.max(fmin(0.6), r * (0.06 + oBulb * 0.34)); // tamaño del bulbo (gen propio o_bulb): puntito ↔ orbe grande
      const bulbHue = (((ohue + (oHue - 0.5) * 300) % 360) + 360) % 360; // color del bulbo (gen propio o_hue): a juego ↔ acento contrastado
      // ANCLAJE tipo "illicium" de rape: TODOS los tallos nacen de un punto en el MORRO (línea media, frente
      // de la cabeza) y proyectan hacia DELANTE en abanico simétrico → emergen del frente y se alejan del
      // cuerpo, sin cruzarlo ni tapar los ojos (que están más atrás). Escala con la cabeza (hr·elong).
      const ax0 = hr * elong * 0.85, ay0 = 0;
      for (let p = 0; p < np; p++) {
        const spread = np > 1 ? (p / (np - 1) - 0.5) : 0;          // -0.5..0.5 → abanico simétrico (1 señuelo = recto al frente)
        const ang = spread * 1.1 + Math.sin(t * 1.4 + p) * 0.1 * orn; // centrado en el morro (0 = al frente) + leve oscilación
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const bx = ax0, by = ay0;                                  // base común (illicium) en el morro
        const tx = ax0 + dx * plen, ty = ay0 + dy * plen;          // punta proyectada hacia delante
        // --- Tallo CURVADO + AFILADO + DEGRADADO ---
        const mx0 = (bx + tx) / 2, my0 = (by + ty) / 2;
        let nx = -(ty - by), ny = (tx - bx); const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const curve = plen * 0.16 * Math.sin(p * 1.7 + 0.6);     // arco leve, variable por pluma
        const cx2 = mx0 + nx * curve, cy2 = my0 + ny * curve;
        const wB = Math.max(fmin(0.8), r * 0.11), wT = Math.max(fmin(0.25), r * 0.03); // grueso base → fino punta
        const N = 6, sgL = [], sgR = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N, iu = 1 - u;
          const xx = iu * iu * bx + 2 * iu * u * cx2 + u * u * tx, yy = iu * iu * by + 2 * iu * u * cy2 + u * u * ty;
          const tgx = 2 * iu * (cx2 - bx) + 2 * u * (tx - cx2), tgy = 2 * iu * (cy2 - by) + 2 * u * (ty - cy2);
          const tl = Math.hypot(tgx, tgy) || 1, lx = -tgy / tl, ly = tgx / tl, w = (wB * iu + wT * u) / 2;
          sgL.push([xx + lx * w, yy + ly * w]); sgR.push([xx - lx * w, yy - ly * w]);
        }
        const sg = ctx.createLinearGradient(bx, by, tx, ty);
        sg.addColorStop(0, `hsl(${ohue},55%,26%)`); sg.addColorStop(1, `hsl(${ohue},92%,64%)`);
        ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(sgL[0][0], sgL[0][1]);
        for (let i = 1; i <= N; i++) ctx.lineTo(sgL[i][0], sgL[i][1]);
        for (let i = N; i >= 0; i--) ctx.lineTo(sgR[i][0], sgR[i][1]);
        ctx.closePath(); ctx.fill();
        const pulse = 1 + 0.14 * Math.sin(t * 1.6 + p * 1.3) * orn;   // latido de exhibición
        const br = bulbR * (0.9 + 0.4 * orn) * pulse;
        // SEÑUELO BIOLUMINISCENTE: halo translúcido + esfera + brillo.
        const h2 = bulbHue;                            // color del bulbo (acento, gen o_hue)
        // HALO: amplio pero TRANSLÚCIDO con caída GRADUAL → resplandor, no disco opaco. El núcleo brillante de
        // verdad es la esfera del bulbo (abajo); esto es el aura. Se rellena hasta alpha→0 (sin borde duro).
        const hg = ctx.createRadialGradient(tx, ty, 0, tx, ty, br * 7);
        hg.addColorStop(0, `hsla(${h2},96%,76%,0.5)`);    // centro luminoso pero translúcido
        hg.addColorStop(0.18, `hsla(${h2},95%,68%,0.22)`);
        hg.addColorStop(0.45, `hsla(${h2},95%,64%,0.07)`);
        hg.addColorStop(1, `hsla(${h2},95%,64%,0)`);      // desvanecido total → alcance gradual
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(tx, ty, br * 7, 0, 6.2832); ctx.fill();
        const bg = ctx.createRadialGradient(tx - br * 0.35, ty - br * 0.4, br * 0.1, tx, ty, br);
        bg.addColorStop(0, `hsl(${h2},95%,84%)`); bg.addColorStop(1, `hsl(${(h2 + 20) % 360},90%,50%)`);
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(tx, ty, br, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(tx - br * 0.3, ty - br * 0.34, br * 0.3, 0, 6.2832); ctx.fill();
      }
    }

    // ---- OJOS (lectura honesta de genes; la "ferocidad" EMERGE, no se pinta por categoría) ----
    // Posición = campo de visión (`e_fov`): frontales si estrecho ↔ laterales si panorámico.
    // Tamaño = inversión visual (`sense`). Color = `c_eye`. Ceño = `aggro` (emergente).
    if (showEyes && eye) {
      const senseG = eye[eo], fovG = eye[eo + 1], cEye = eye[eo + 2], aggroG = eye[eo + 3];
      // Ojos INTEGRADOS (perla húmeda oscura, engastada). La MIRADA DE ATAQUE EMERGE de `aggro`: el ojo del
      // depredador es rasgado y afilado (comisuras en punta, inclinado); el de la presa, redondo y dócil.
      // No es una categoría pintada: es una lectura continua del gen `aggro` (igual que antes lo era la ceja).
      const sharp = aggroG;                                       // 0 presa (redondo) .. 1 depredador (afilado)
      const eyePoint = 1 + sharp * 1.9;                           // exponente vertical: 1 = elipse redonda; alto = comisuras en punta
      const eyeAspect = 1 - sharp * 0.42;                         // depredador: ojo más rasgado (entornado); presa: redondo
      const eyeTiltMax = sharp * 0.5;                             // inclinación rasgada (rad), espejada por lado
      const pupilShape = Math.min(3, (morph[mo + 10] * 4) | 0);     // 0 redonda · 1 vert · 2 horiz · 3 estrella
      const cntG = morph[mo + 14];
      const nEye = cntG < 0.32 ? 1 : (cntG < 0.8 ? 2 : 4 + ((cntG - 0.8) * 14 | 0)); // 1 cíclope · 2 · racimo 4..6
      const er0 = Math.max(fmin(0.8), hr * (0.10 + 0.40 * senseG));   // tamaño base REDUCIDO (ojos discretos); escala con la cabeza
      const fovA = 0.22 + fovG * 1.13;                              // separación angular frontal↔lateral
      // Mirada reactiva: la pupila se desplaza hacia el objetivo (mundo → marco del cuerpo).
      const ch = Math.cos(heading), sh = Math.sin(heading);
      let lgx = 1, lgy = 0;
      if (face && face.length) { const gx = face[fo], gy = face[fo + 1]; lgx = gx * ch + gy * sh; lgy = -gx * sh + gy * ch; }
      const atk = (face && face.length) ? face[fo + 2] : 0;

      // Iris ligado a la PALETA DEL CUERPO (±35°, no arcoíris) → el ojo pertenece al organismo.
      const iHue = (((h + (cEye - 0.5) * 70) % 360) + 360) % 360;
      const pupilPath = (ix, iy, erx, ery, pr) => {
        ctx.beginPath();
        if (pupilShape === 1) ctx.ellipse(ix, iy, pr * 0.5, ery * 0.66, 0, 0, 6.2832);        // rendija vertical
        else if (pupilShape === 2) ctx.ellipse(ix, iy, erx * 0.66, pr * 0.5, 0, 0, 6.2832);   // rendija horizontal
        else if (pupilShape === 3) { for (let p = 0; p < 8; p++) { const aa = p / 8 * 6.2832 - 1.5708, rr = (p % 2) ? pr * 0.42 : pr * 1.15, xx = ix + Math.cos(aa) * rr, yy = iy + Math.sin(aa) * rr; if (p) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.closePath(); }
        else ctx.arc(ix, iy, pr, 0, 6.2832);
      };
      // SILUETA del ojo: almendra cuyas comisuras (eje x) se afilan con `eyePoint` (1 = elipse redonda) e
      // inclinada `tilt` rad → de ojo dócil redondo a ojo rasgado de depredador. Espejada por lado (tilt).
      const eyePath = (cx, cy, rx, ry, tilt) => {
        const ct = Math.cos(tilt), st = Math.sin(tilt), N = 30;
        ctx.beginPath();
        for (let k = 0; k <= N; k++) {
          const th = k / N * 6.2832, c = Math.cos(th), sn = Math.sin(th);
          const lx = rx * c, ly = ry * Math.sign(sn) * Math.pow(Math.abs(sn), eyePoint);
          const xx = cx + lx * ct - ly * st, yy = cy + lx * st + ly * ct;
          if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.closePath();
      };
      // Ojo INTEGRADO: cuenca (engaste) + globo SOMBREADO + iris del cuerpo + pupila + brillo especular SUAVE.
      // sideSign (+1/-1) espeja la inclinación rasgada entre ojo izquierdo y derecho.
      const drawEye = (cx, cy, er, sideSign) => {
        const tilt = eyeTiltMax * (sideSign || 0);
        const erx = er, ery = er * eyeAspect;
        const ix = cx + lgx * er * 0.3, iy = cy + lgy * ery * 0.3;
        // OJO = PERLA HÚMEDA OSCURA engastada en la carne. No esclerótica clara (parecía pegote blanco);
        // una cuenta vidriosa oscura, teñida con la paleta del cuerpo, hundida en una cuenca → pertenece al organismo.
        // 1) CUENCA: la carne se hunde alrededor → anillo de sombra (AO) + labio CLARO arriba (la piel atrapa luz
        //    sobre el ojo) → sensación de relieve, no de calcomanía. El globo se dibuja un poco MÁS PEQUEÑO que la cuenca.
        const sock = ctx.createRadialGradient(cx, cy - ery * 0.15, er * 0.55, cx, cy + ery * 0.2, er * 1.5);
        sock.addColorStop(0, 'rgba(0,0,0,0.30)'); sock.addColorStop(0.7, 'rgba(0,0,0,0.12)'); sock.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sock; eyePath(cx, cy, erx * 1.5, ery * 1.55, tilt); ctx.fill();
        const lip = ctx.createRadialGradient(cx, cy - ery * 0.95, er * 0.08, cx, cy - ery * 0.85, er * 1.05);
        lip.addColorStop(0, `hsla(${h},${Math.max(18, s - 8)}%,${Math.min(92, l + 26)}%,0.55)`); lip.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lip; ctx.beginPath(); ctx.ellipse(cx, cy - ery * 0.9, erx * 1.05, ery * 0.6, 0, 0, 6.2832); ctx.fill();
        // 2) GLOBO: esfera vidriosa OSCURA con silueta AFILADA (eyePath). Degradado de un tono medio teñido
        //    (arriba-izq, donde da la luz) a casi negro en el borde → bola mojada con volumen. Sin contorno duro.
        const gx = cx - erx * 0.28, gy = cy - ery * 0.34;
        const eg = ctx.createRadialGradient(gx, gy, er * 0.05, cx, cy, er * 1.04);
        eg.addColorStop(0, `hsl(${iHue},52%,32%)`); eg.addColorStop(0.55, `hsl(${iHue},60%,15%)`); eg.addColorStop(1, `hsl(${iHue},64%,5%)`);
        ctx.fillStyle = eg; eyePath(cx, cy, erx, ery, tilt); ctx.fill();
        // Recorta el resto del ojo (iris, pupila, brillos) a la silueta afilada → no sobresalen de la almendra.
        ctx.save(); eyePath(cx, cy, erx, ery, tilt); ctx.clip();
        // 3) IRIS: aro sutil de color vivo a media distancia → vida, sin volverse "ojo de muñeca". Sigue la mirada.
        const ig = ctx.createRadialGradient(ix, iy, er * 0.16, ix, iy, er * 0.6);
        ig.addColorStop(0, `hsla(${iHue},70%,30%,0)`); ig.addColorStop(0.6, `hsla(${iHue},75%,42%,0.55)`); ig.addColorStop(1, `hsla(${iHue},70%,20%,0)`);
        ctx.fillStyle = ig; ctx.beginPath(); ctx.ellipse(ix, iy, erx * 0.62, ery * 0.62, 0, 0, 6.2832); ctx.fill();
        // 4) PUPILA: negra, pequeña, sigue la mirada (núcleo de la perla).
        ctx.fillStyle = 'rgba(0,0,0,0.92)'; pupilPath(ix, iy, erx, ery, er * 0.3); ctx.fill();
        // 5) BRILLO especular: destello pequeño y nítido arriba-izq (humedad) + chispa secundaria minúscula.
        const hlx = gx, hly = gy, hrr = er * 0.3;
        const hg = ctx.createRadialGradient(hlx, hly, 0, hlx, hly, hrr);
        hg.addColorStop(0, 'rgba(255,255,255,0.95)'); hg.addColorStop(0.55, 'rgba(255,255,255,0.3)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hlx, hly, hrr, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(cx + erx * 0.22, cy + ery * 0.28, er * 0.09, 0, 6.2832); ctx.fill();
        ctx.restore();   // cierra el clip a la silueta del ojo
      };
      // Colocación SIMÉTRICA según el nº de ojos. (Sin cejas: la mirada de ataque la da la forma del ojo.)
      if (nEye === 1) {                                  // cíclope: un ojo central frontal
        const cx = hr * elong * 0.5, er = er0 * 1.25;
        drawEye(cx, 0, er, 0);
      } else if (nEye === 2) {                           // par frontal/lateral (separación = e_fov)
        const ca = Math.cos(fovA), sa = Math.sin(fovA);
        for (let e = 0; e < 2; e++) { const sign = e ? -1 : 1, cx = ca * hr * elong * 0.62, cy = sign * sa * hr * 0.72; drawEye(cx, cy, er0, sign); }
      } else {                                           // RACIMO de ojos pequeños en pares espejados
        const er = Math.max(fmin(0.8), er0 * 0.62), pairs = nEye >> 1;
        for (let p = 0; p < pairs; p++) {
          const t2 = pairs > 1 ? p / (pairs - 1) : 0.5;
          const aa = 0.4 + t2 * 0.95, dd = hr * (0.45 + t2 * 0.4);
          const cx = Math.cos(aa) * dd * elong, cy = Math.sin(aa) * dd;
          drawEye(cx, cy, er, 1); drawEye(cx, -cy, er, -1);
        }
        if (nEye & 1) drawEye(hr * elong * 0.5, 0, er, 0);  // impar: uno central
      }
      // Boca/fogonazo al cazar (recencia de ataque): fauce frontal + destello cálido.
      if (atk > 0.05) {
        const mxp = hr * elong * 0.92, er = er0;
        if (atk > 0.5) { ctx.fillStyle = `rgba(255,238,180,${(atk - 0.5) * 0.7})`; ctx.beginPath(); ctx.arc(mxp, 0, er * 1.7 * atk, 0, 6.2832); ctx.fill(); }
        ctx.fillStyle = 'hsl(8,60%,10%)';
        ctx.beginPath(); ctx.ellipse(mxp, 0, er * 0.5, er * (0.22 + 0.7 * atk), 0, 0, 6.2832); ctx.fill();
      }
    }
    ctx.restore();
  }

  // Retrato del organismo seleccionado para el inspector: dibuja el bicho centrado en un canvas
  // pequeño a partir de su genoma completo. Reutiliza _drawBody (mismo aspecto que en el mundo).
  drawPortrait(pctx, genes, t, ef, headingArg, spdArg) {   // heading/spd opcionales → orienta y ondula IGUAL que en el mundo
    const cw = pctx.canvas.width, ch = pctx.canvas.height;
    pctx.clearRect(0, 0, cw, ch);
    if (!genes) return;
    this._drawScale = 1;   // el retrato dibuja en píxeles directos (sin transform) → el ojo es grande → detalle completo
    // Fondo claro tipo "ficha de espécimen" (degradado suave) → resaltan los contornos oscuros y los
    // cuerpos terrosos (que sobre fondo negro se camuflaban). El border-radius del canvas lo redondea.
    // El fondo del retrato SIGUE al ambiente: abisal oscuro / pradera arena (claro).
    const dark = this.cfg.render.ambiance === 'abyssal';
    const bg = pctx.createLinearGradient(0, 0, 0, ch);
    if (dark) { bg.addColorStop(0, '#10182a'); bg.addColorStop(1, '#05070c'); }              // fondo abisal
    else { bg.addColorStop(0, 'hsl(85,18%,82%)'); bg.addColorStop(1, 'hsl(60,20%,62%)'); }   // ficha clara
    pctx.fillStyle = bg; pctx.fillRect(0, 0, cw, ch);
    const tint = this._pTint || (this._pTint = new Float32Array(3));
    tint[0] = genes[G.c_app]; tint[1] = genes[G.c_tip]; tint[2] = genes[G.orn];
    const pdeco = this._pDeco || (this._pDeco = new Float32Array(8)); // [b_aspect, c_lum, c_sat, o_len, o_bulb, o_hue, o_num, tex2]
    pdeco[0] = genes[G.b_aspect]; pdeco[1] = genes[G.c_lum]; pdeco[2] = genes[G.c_sat];
    pdeco[3] = genes[G.o_len]; pdeco[4] = genes[G.o_bulb]; pdeco[5] = genes[G.o_hue]; pdeco[6] = genes[G.o_num];
    pdeco[7] = genes[G.tex2];
    const eye = this._pEye || (this._pEye = new Float32Array(4));
    eye[0] = genes[G.sense]; eye[1] = genes[G.e_fov]; eye[2] = genes[G.c_eye]; eye[3] = genes[G.aggro];
    const heading = (headingArg != null) ? headingArg : -Math.PI / 2; // por defecto mira arriba; si se da, usa el del mundo
    const face = this._pFace || (this._pFace = new Float32Array(3));
    face[0] = Math.cos(heading); face[1] = Math.sin(heading); face[2] = 0; // pupila al frente, sin boca
    const cSat = genes[G.c_sat], cLumP = genes[G.c_lum]; // igual que en el mundo (banda estrecha + sat/luz bajadas)
    const h = (165 + genes[G.hue] * 150) % 360, s = 18 + cSat * cSat * 82;
    const l = 31 + (ef || 0.5) * (dark ? 24 : 26) + cLumP * cLumP * (dark ? 14 : 10);
    const r = Math.min(cw, ch) * 0.16, px = cw * 0.5, py = ch * 0.44;
    pctx.fillStyle = 'rgba(0,0,0,0.16)';               // sombra de contacto suave → volumen
    pctx.beginPath(); pctx.ellipse(px, py + r * 0.6, r * 1.5, r * 0.5, 0, 0, 6.2832); pctx.fill();
    const pspd = (spdArg != null) ? spdArg : 0.5;        // velocidad de ondulación; si se da, la del mundo
    this._drawBody(pctx, px, py, r, h, s, l, genes, G.m_app, heading, pspd, t,
                   tint, 0, true, eye, 0, true, ef || 0.5, face, 0, true, pdeco, 0);
  }

  // Resalta el organismo seleccionado (anillo). Recibe el objeto `sel` del worker
  // ({x,y,radius}); dibuja la copia envuelta (toro) más cercana a la cámara.
  highlight(sel) {
    if (!sel) return;
    const c = this.canvas, s = this._scale(), W = this.cfg.world.width, H = this.cfg.world.height;
    let dx = ((sel.x - this.camX + W * 1.5) % W) - W / 2; // diferencia envuelta [-W/2, W/2)
    let dy = ((sel.y - this.camY + H * 1.5) % H) - H / 2;
    const sx = c.width / 2 + dx * s, sy = c.height / 2 + dy * s;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, (sel.radius + 4) * s, 0, 6.2832);
    ctx.stroke();
  }
}
