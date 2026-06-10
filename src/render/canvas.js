// Render con Canvas 2D. El mundo es lógico y fijo; aquí solo se MUESTRA, con una cámara
// (zoom + paneo toroidal en mosaico). Nada de esto toca la simulación.

import { NUM_GENES, G, NODE_COUNT, NODE_STRIDE } from '../engine/genome.js';
import { EPS_AXIS, PRES_LO, presWeight } from '../engine/bodyplan.js';
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

    // Capa de SUSTRATO abisal (`grass`/`grassCtx`: nombre histórico). Búfer del tamaño de la PANTALLA:
    // se dibuja con la cámara aplicada (nítido a cualquier zoom) y solo se re-renderiza cuando la cámara
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

  // Posiciones + chispa asignada a cada mota de plancton (todo fijo; solo el brillo/tamaño
  // cambia con el recurso local). El catálogo de chispas se dibuja UNA vez al arrancar.
  _initTufts() {
    const rng = makeRng(20240607);
    const W = this.cfg.world;
    const n = this.cfg.render.grassDensity;
    this.nTufts = n;
    // CHISPAS de plancton (abisal): puntito con halo radial suave, en teal/cian/verde-teal desaturado.
    // Pre-renderizadas → drawImage barato por mota. La vegetación = textura TENUE, distinta del glow de los bichos.
    this.sparkSprites = [this._makeSparkSprite(150), this._makeSparkSprite(165), this._makeSparkSprite(180),
                         this._makeSparkSprite(196), this._makeSparkSprite(212)]; // verde-algas → cian → azul-cian (variedad)
    const nSpark = this.sparkSprites.length;
    // Posiciones fijas de cada mota de plancton (solo el brillo/tamaño cambia con el recurso local).
    this.tuftX = new Float32Array(n);
    this.tuftY = new Float32Array(n);
    this.tuftScale = new Float32Array(n);  // variedad de tamaño
    this.tuftSprite = new Uint8Array(n);   // qué chispa usa (fijo)
    this.tuftSeed = new Float32Array(n);   // umbral aleatorio por mota → plancton con densidad POR CANTIDAD
    for (let i = 0; i < n; i++) {
      this.tuftX[i] = rng.next() * W.width;
      this.tuftY[i] = rng.next() * W.height;
      this.tuftScale[i] = 0.75 + rng.next() * 0.85;
      this.tuftSprite[i] = (rng.next() * nSpark) | 0;
      this.tuftSeed[i] = rng.next();
    }
  }

  // Sprite de chispa: núcleo suave + halo radial que se desvanece (glow), de un tono dado (teal/cian/verde).
  _makeSparkSprite(hue) {
    const S = 24, c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d'), r = S / 2;
    const g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0,    `hsla(${hue},70%,78%,0.95)`);  // núcleo claro pero NO blanco (tono presente)
    g.addColorStop(0.3,  `hsla(${hue},75%,58%,0.45)`);  // halo
    g.addColorStop(1,    `hsla(${hue},75%,48%,0)`);      // se desvanece a transparente
    x.fillStyle = g; x.beginPath(); x.arc(r, r, r, 0, 6.2832); x.fill();
    return c;
  }

  // Re-renderiza el SUSTRATO abisal (nebulosa + comida fosforescente + plancton) en el búfer de
  // pantalla con la cámara aplicada (nítido a cualquier zoom) y teselando el toro. Solo dibuja las
  // motas visibles (culling). Se llama solo si cambia cámara o recurso.
  _refreshGrass() {
    const Wld = this.sim.world, ctx = this.grassCtx, c = this.canvas, cfg = this.cfg;
    const Rmax = cfg.resource.R_max;
    const res = Wld.resource, cols = Wld.cols, rows = Wld.rows, cellW = Wld.cellW, cellH = Wld.cellH;
    const temp = Wld.temp;
    const W = cfg.world.width, H = cfg.world.height, s = this._scale();
    const offX = c.width / 2 - this.camX * s, offY = c.height / 2 - this.camY * s;
    const vwHalf = c.width / (2 * s), vhHalf = c.height / (2 * s);
    const txMin = Math.floor((this.camX - vwHalf) / W), txMax = Math.floor((this.camX + vwHalf) / W);
    const tyMin = Math.floor((this.camY - vhHalf) / H), tyMax = Math.floor((this.camY + vhHalf) / H);
    const margin = 60 / s; // holgura en coords de mundo para no recortar las motas al borde
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    // --- ABISMO: sustrato orgánico. Nebulosa sobre-muestreada con (E) paleta de región rica por
    // temperatura, (A) moteado orgánico por ruido anclado al mundo, y (C) comida fosforescente +
    // micro-flora luminosa donde hay recurso. Se reconstruye en el refresco (la comida cambia). ---
    {  // sustrato abisal (Cenote): nebulosa + comida fosforescente + micro-flora luminosa
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
        // (E) PALETA ABISAL: fondo CASI NEGRO donde no hay vegetación (azul profundo) → así la vegetación se lee
        // por CONTRASTE contra la oscuridad, no por brillo. Frío = azul casi negro; cálido = azul-violeta apagado.
        let rr, gg, bb;
        if (tv < 0.5) { const u = tv / 0.5; rr = 1 + u * 1.5; gg = 2 + u * 4; bb = 12 + u * 4; }
        else { const u = (tv - 0.5) / 0.5; rr = 2.5 + u * 7; gg = 6 + u * -1; bb = 16 + u * 4; }
        const u = wx / W, v = wy / H;
        const n = 0.62 * pnoise(u, v, 26, 17, 0) + 0.38 * pnoise(u, v, 70, 47, 7); // (A) moteado 2 octavas PERIÓDICO (sin costura)
        const mott = 0.7 + n * 0.72;
        const o = (j * NW + i) * 4;
        // (C) VEGETACIÓN = fosforescencia TENUE teal/algas (verde-azul desaturado), DISTINTA del cian brillante de
        // los bichos. Dim a propósito (techo de brillo bajo): la legibilidad la da el contraste con el fondo negro.
        const fg = Math.pow(food, 0.72);  // realza algo los mids → la vegetación moderada también se nota
        d[o]     = rr * mott + fg * 6;     // muy poco rojo
        d[o + 1] = gg * mott + fg * 40;    // verde (teal/algas)
        d[o + 2] = bb * mott + fg * 52;    // azul moderado → teal apagado, no cian neón
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
      const sparkStep = cfg.render.quality === 'low' ? 2 : 1;    // calidad baja: la mitad de chispas
      for (let ty = tyMin; ty <= tyMax; ty++) for (let tx = txMin; tx <= txMax; tx++) {
        const wxMin = this.camX - vwHalf - tx * W - margin, wxMax = this.camX + vwHalf - tx * W + margin;
        const wyMin = this.camY - vhHalf - ty * H - margin, wyMax = this.camY + vhHalf - ty * H + margin;
        ctx.setTransform(s, 0, 0, s, offX + tx * W * s, offY + ty * H * s);
        for (let i = 0; i < this.nTufts; i += sparkStep) {
          const x = this.tuftX[i], y = this.tuftY[i];
          if (x < wxMin || x > wxMax || y < wyMin || y > wyMax) continue;
          let cx = (x / cellW) | 0, cy = (y / cellH) | 0; if (cx >= cols) cx = cols - 1; if (cy >= rows) cy = rows - 1;
          const food = res[cy * cols + cx] / Rmax;
          if (food < 0.03 + this.tuftSeed[i] * 0.8) continue;   // densidad por CANTIDAD + CONTRASTE: lush = casi todas, claro = casi ninguna
          const a = Math.min(0.6, 0.15 + food * 0.5) * this.tuftScale[i];  // brillo CAPADO (nunca más que un bicho)
          const spk = this.sparkSprites[this.tuftSprite[i] % this.sparkSprites.length];
          const sz = (2.0 + food * 2.2) * this.tuftScale[i];    // chispas PEQUEÑAS (crecen poco con la comida)
          ctx.globalAlpha = a;
          ctx.drawImage(spk, x - sz / 2, y - sz / 2, sz, sz);   // 'lighter' → en zonas densas se acumulan = floración
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;                                 // restaurar (las chispas usaron globalAlpha)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
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
    // El búfer de sustrato va a resolución de pantalla; forzar re-render tras redimensionar.
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

    // ESCENARIO: Cenote abisal (único). Sustrato de penumbra + comida fosforescente + criaturas
    // luminosas. El suelo lo pinta _refreshGrass en su búfer; aquí solo se compone.
    const lowQ = cfg.render.quality === 'low';           // calidad baja (móvil): sin blooms, menos partículas, sustrato simple
    const camMoved = this.camX !== this._gx || this.camY !== this._gy || this.zoom !== this._gz;
    if (this._grassTimer <= 0 || camMoved) {
      this._refreshGrass();
      this._grassTimer = cfg.render.grassRefreshFrames * (lowQ ? 2 : 1); // baja: refresca el fondo la mitad de veces
      this._gx = this.camX; this._gy = this.camY; this._gz = this.zoom;
    }
    this._grassTimer--;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.grass, 0, 0);
    ctx.globalAlpha = 1;
    // BLOOM de la VEGETACIÓN: copia desenfocada y aditiva → los charcos de comida fosforescente (abisal)
    // y la vegetación irradian luz. Solo donde brilla suma; el fondo oscuro apenas cambia.
    if (cfg.render.glow && !lowQ) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.filter = 'blur(4px)';
      ctx.drawImage(this.grass, 0, 0);
      ctx.filter = 'none';
      ctx.restore();
    }

    // ---- Capa de ORGANISMOS (FX): se borra y se redibuja entera cada frame. ----
    const fctx = this.fxCtx;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, c.width, c.height);

    const s = this._scale();
    const offX = c.width / 2 - this.camX * s, offY = c.height / 2 - this.camY * s;
    // Mosaicos del toro que tocan el viewport (≤ 2 por eje porque el viewport ≤ 1 mundo).
    const vwHalf = c.width / (2 * s), vhHalf = c.height / (2 * s);
    const txMin = Math.floor((this.camX - vwHalf) / W), txMax = Math.floor((this.camX + vwHalf) / W);
    const tyMin = Math.floor((this.camY - vhHalf) / H), tyMax = Math.floor((this.camY + vhHalf) / H);
    // (B) NIEVE MARINA: partículas tenues a la deriva (detrito/esporas) → agua profunda viva + profundidad.
    // Capa propia, BAJO los organismos. Solo abisal. Anclada al mundo (deriva lenta con descenso + parpadeo).
    if (cfg.render.glow && !lowQ) {           // NIEVE MARINA: solo calidad ALTA (en baja se omite del todo)
      if (!this._snow) { const n = 740, sn = this._snow = new Float32Array(n * 4), hu = this._snowHue = new Float32Array(n);
        const PAL = [190, 200, 285, 45, 330]; // cian, azul, violeta, oro, rosa (colorcillo raro)
        for (let k = 0; k < n; k++) { sn[k * 4] = Math.random() * W; sn[k * 4 + 1] = Math.random() * H; sn[k * 4 + 2] = Math.random() * 6.283; sn[k * 4 + 3] = 0.4 + Math.random() * Math.random() * 2.1;
          hu[k] = Math.random() < 0.05 ? PAL[(Math.random() * PAL.length) | 0] : -1; } } // ~5% con color, resto azul-blanco
      const sn = this._snow, hu = this._snowHue, tt = this._animT * 0.0009;
      const snEnd = sn.length;                                   // (solo alta: nieve completa; baja la omite)
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
        // Ventana de MUNDO visible en este mosaico → culling de organismos fuera de vista (ver _drawAgents).
        this._drawAgents(this.camX - vwHalf - tx * W, this.camX + vwHalf - tx * W, this.camY - vhHalf - ty * H, this.camY + vhHalf - ty * H);
      }
    }
    // Componer la capa de organismos sobre el suelo.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.fx, 0, 0);
    // BLOOM de ORGANISMOS + BULBOS: copia desenfocada y aditiva → todo lo luminoso (halos, bulbos
    // de los señuelos, puntas) "sangra" luz. Da el aspecto bioluminiscente potente.
    if (cfg.render.glow && !lowQ) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4;   // bloom algo menor → los apagados (c_lum bajo) se leen apagados
      ctx.filter = 'blur(4px)';
      ctx.drawImage(this.fx, 0, 0);
      ctx.filter = 'none';
      ctx.restore();
    }

    // Viñeta → profundidad y foco al centro (sella la penumbra abisal). Cacheada por tamaño.
    {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!this._vignette || this._vigW !== c.width || this._vigH !== c.height) {
        const vg = ctx.createRadialGradient(
          c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.24,
          c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.72);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.62)');
        this._vignette = vg; this._vigW = c.width; this._vigH = c.height;
      }
      ctx.fillStyle = this._vignette;
      ctx.fillRect(0, 0, c.width, c.height);
    }
  }

  _drawAgents(cullX0, cullX1, cullY0, cullY1) {
    const ctx = this.fxCtx, sim = this.sim, glow = this.cfg.render.glow;
    const active = sim.active, n = sim.activeCount;
    const mode = this.colorMode;
    const sc = this._scale();
    this._drawScale = sc;              // escala mundo→pantalla, para que el ojo sepa su tamaño REAL en píxeles (LOD)
    const t = this._animT * 0.006;     // reloj de animación (congelado en pausa)
    const nodes = sim.nodes, heading = sim.heading, spd = sim.spd, tint = sim.tint, eye = sim.eye, face = sim.face, deco = sim.deco;
    // LOD (rendimiento): umbrales de RADIO EN PANTALLA (px) por nivel. 3 tiers: punto < dThr ≤ cuerpo barato <
    // fullThr ≤ grafo completo. En calidad BAJA los umbrales se multiplican (más puntos/cuerpos baratos → barato).
    const R = this.cfg.render, lowQ = R.quality === 'low', lodMul = lowQ ? (R.lodLowMult || 2.6) : 1;
    const dThr = R.lodBody * lodMul;            // punto ↔ cuerpo
    const fullThr = R.lodFull * lodMul;         // cuerpo BARATO (elipse) ↔ grafo completo
    const eThr = R.lodEye * lodMul;             // ojos (dentro del grafo)
    const haloThr = R.lodHalo * lodMul;         // halo por agente (los puntos no lo necesitan)
    for (let a = 0; a < n; a++) {
      const i = active[a];
      const r = sim.radius[i];                 // radio físico real (sin compresión de dibujo)
      const x = sim.x[i], y = sim.y[i];
      // CULLING DE VIEWPORT: si toda la extensión del organismo (cuerpo + glow + apéndices ≈ r·11) queda FUERA
      // de la ventana visible de este mosaico, no se dibuja → gran ahorro con zoom (la mayoría queda fuera de vista).
      const cm = r * 11;
      if (x + cm < cullX0 || x - cm > cullX1 || y + cm < cullY0 || y - cm > cullY1) continue;
      const ef = sim.eFrac[i];                 // fracción de energía (precalculada en el worker)
      // El color es una LECTURA del estado, no afecta a la simulación. Cada modo reinterpreta.
      let h, s, l;
      switch (mode) {
        case 'diet':    h = (1 - sim.diet[i]) * 120; s = 85; l = 52; break;        // verde→rojo
        case 'lineage': h = lineageHue(sim.lineage[i]); s = 70; l = 55; break;      // 1 color por linaje
        case 'species': h = lineageHue(sim.species[i] | 0); s = 78; l = 55; break;  // 1 color por ESPECIE
        case 'gene':    h = (1 - sim.geneSel[i]) * 250; s = 80; l = 52; break;      // azul(bajo)→rojo(alto)
        case 'energy':  h = ef * 130; s = 85; l = 50; break;                         // rojo(hambre)→verde
        // Visión real: el gen `hue` da el tono (el verde se evita en el sembrado, para no fundirse con la fosforescencia teal del sustrato).
        // COLORES COMO EN LA NATURALEZA: saturación base BAJA (tonos terrosos/apagados → cripsis); la
        // VIBRANCIA la dispara el ornamento (`orn`, gen de selección sexual): la mayoría va apagada y solo
        // los muy ornamentados lucen colores vivos (exhibición). La absorción usa el gen crudo (sim.js).
        default: {
          const cSat = deco ? deco[i * 7 + 1] : 0.35;   // VIVACIDAD (deriva libre)
          const cLumC = deco ? deco[i * 7 + 0] : 0.35;   // LUMINOSIDAD (deriva libre)
          h = sim.hue[i] * 360;                // rueda COMPLETA: cualquier color (incl. verde) es alcanzable por deriva. El verde se EVITA solo en el sembrado.
          s = 18 + cSat * cSat * 82;           // suelo y techo subidos → menos gris, más color
          // brillo = energía + LUMINOSIDAD (cuadrática). Base subida → cuerpos más claros.
          l = 31 + ef * 24 + cLumC * cLumC * 14;
          // Los más CARNÍVOROS tienden a algo más oscuros (lectura visual del gen `diet`, SOLO render). Suavizado 7→5.
          l -= sim.diet[i] * 5;
        }
      }
      const rPx = r * sc;                              // radio EN PANTALLA (px) → decide el nivel de detalle (LOD)
      const hasNodes = nodes && nodes.length;
      const tier = !hasNodes || rPx < dThr ? 0 : rPx < fullThr ? 1 : 2; // 0 punto · 1 cuerpo barato · 2 grafo completo
      // HALO por agente: caro (un gradiente/bicho) → solo en calidad ALTA y para bichos no diminutos
      // (los puntos ya brillan con el bloom GLOBAL de la capa de organismos; no necesitan su propio halo).
      if (glow && !lowQ && rPx > haloThr) {
        // Halo con DEGRADADO de transparencia. El RADIO y la INTENSIDAD varían con el ornamento (orn):
        // bioluminiscencia como exhibición → unos brillan amplios e intensos, otros tenues y ceñidos.
        // El centro (orn bajo, lo común) queda moderado para no fundir halos vecinos ("hormiguero").
        const cLumG = deco ? deco[i * 7 + 0] : 0.35;   // LUMINOSIDAD: gen decorativo de deriva libre (sin runaway)
        const gr = r * (1.65 + cLumG * cLumG * 3.0); // halo algo mayor
        const gl = Math.min(82, l + 26);
        const a0 = 0.21 + cLumG * cLumG * 0.48; // suelo y empuje subidos → glow más visible
        const gg = ctx.createRadialGradient(x, y, r * 0.25, x, y, gr);
        gg.addColorStop(0, `hsla(${h},${s}%,${gl}%,${a0})`);
        gg.addColorStop(0.45, `hsla(${h},${s}%,${gl}%,${a0 * 0.32})`);
        gg.addColorStop(1, `hsla(${h},${s}%,${gl}%,0)`);
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(x, y, gr, 0, 6.2832);
        ctx.fill();
      }
      // LOD de 3 niveles según tamaño en pantalla.
      if (tier === 2) {
        // GRAFO completo: cabeza+nodos, ojos, señuelo, volumen, onda viajera (con sus propios gates internos por rPx).
        this._drawBodyGraph(ctx, x, y, r, h, s, l, nodes, i * (NODE_COUNT * NODE_STRIDE), heading[i], spd[i], t,
                            eye, i * 4, face, i * 3, rPx > eThr, tint, i, deco, i * 7);
      } else if (tier === 1) {
        // CUERPO BARATO: elipse orientada al rumbo con volumen (1 gradiente), sin nodos/ojos/señuelo/onda.
        this._drawBodyCheap(ctx, x, y, r, h, s, l, heading[i]);
      } else {
        ctx.fillStyle = `hsl(${h},${s}%,${l}%)`;       // PUNTO plano (lo barato para la mayoría)
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.2832);
        ctx.fill();
      }
    }
  }

  // LOD tier 1 — CUERPO BARATO: una elipse orientada al rumbo con un degradado de volumen (1 gradiente),
  // sin recorrer nodos ni dibujar ojos/señuelo/onda. Lee como "un cuerpo con orientación" a coste mínimo
  // (≈15× más barato que el grafo completo). Para bichos de tamaño medio en pantalla.
  _drawBodyCheap(ctx, x, y, r, h, s, l, heading) {
    const rx = r * 1.05, ry = r * 0.72;                          // elipse alargada al eje de nado
    ctx.save(); ctx.translate(x, y); ctx.rotate(heading);
    const g = ctx.createRadialGradient(-rx * 0.3, -ry * 0.35, r * 0.12, 0, 0, rx);
    g.addColorStop(0, `hsl(${h},${Math.max(20, s - 14)}%,${Math.min(84, l + 16)}%)`);
    g.addColorStop(1, `hsl(${h},${Math.min(100, s + 8)}%,${Math.max(6, l - 20)}%)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  // B2b (EN CONSTRUCCIÓN): dibuja el cuerpo desde el GRAFO DE NODOS (una sola primitiva). Reconstruye las
  // posiciones recorriendo padres (la física no las necesita; el render sí) y dibuja cada nodo como una
  // elipse orientada: aspecto bajo → lóbulo redondo; alto → tentáculo alargado. Nodo lateral → par espejado.
  // PRIMER INCREMENTO: sin ojos/textura/señuelo/contorno fino aún (llegan en incrementos siguientes). El
  // glow ya lo pinta _drawAgents fuera. nodes[no + k*ST + f]: 0 present,1 parent,2 size,3 aspect,4 angle,5 attach.
  _drawBodyGraph(ctx, x, y, r, h, s, l, nodes, no, heading, spd, t, eye, eo, face, fo, showEyes, tint, to, deco, dco) {
    const NS = NODE_COUNT, ST = NODE_STRIDE;
    // LOD INTERNO (rPx = radio en pantalla): detalles caros solo a tamaño suficiente. En el retrato (_drawScale=1
    // y r grande) rPx es enorme → todo activo. `lodWave`=onda viajera + 2ª pasada de contorno; `lodLure`=señuelo.
    const Rc = this.cfg.render, rPxG = r * (this._drawScale || 1);
    const doWave = rPxG > (Rc.lodWave || 0);    // si no: cuerpo en reposo + 1 sola pasada (sin contorno)
    const doLure = rPxG > (Rc.lodLure || 0);
    const px = this._ngx || (this._ngx = new Float32Array(NS));   // posiciones en REPOSO (sin onda)
    const py = this._ngy || (this._ngy = new Float32Array(NS));
    const pr = this._ngr || (this._ngr = new Float32Array(NS));   // radio transversal
    const pl = this._ngl || (this._ngl = new Float32Array(NS));   // longitud (eje)
    const pa = this._nga || (this._nga = new Float32Array(NS));   // ángulo de emisión en reposo
    const pts = this._ngts || (this._ngts = new Float32Array(NS)); // tipShape por nodo (silueta base↔punta)
    const pres = this._ngp || (this._ngp = new Uint8Array(NS));
    const par = this._ngpar || (this._ngpar = new Int8Array(NS));  // índice del padre (−1 = raíz)
    const dep = this._ngdep || (this._ngdep = new Uint8Array(NS)); // profundidad en el grafo (fase de la onda)
    // RAÍZ (cabeza): en el origen, mirando al frente (+x); el rumbo ya lo aplica el ctx.rotate de abajo.
    pres[0] = 1; pr[0] = r * (0.55 + nodes[no + 2] * 0.5); pl[0] = pr[0] * (1 + nodes[no + 3] * 0.8);
    px[0] = 0; py[0] = 0; pa[0] = 0; par[0] = -1; dep[0] = 0; pts[0] = 0.5; // cabeza: silueta neutra (elipse)
    for (let k = 1; k < NS; k++) {
      const nb = no + k * ST;
      const w = presWeight(nodes[nb]);                            // presencia GRADUADA (misma banda que la física)
      if (w <= 0) { pres[k] = 0; continue; }                      // por debajo de la banda → no se dibuja
      let p = (nodes[nb + 1] * k) | 0; if (p > k - 1) p = k - 1; if (!pres[p]) p = 0; // padre < k; reanclar huérfano
      pres[k] = 1; par[k] = p; dep[k] = dep[p] + 1;
      const sz = (0.15 + nodes[nb + 2] * 0.85) * w, asp = nodes[nb + 3]; // tamaño ESCALADO por presencia → el nodo CRECE al aparecer
      const cr = r * sz * (1 - 0.6 * asp);                        // sección transversal (fino → pequeña)
      const ln = r * sz * (1 + 1.8 * asp);                        // longitud (fino → larga = tentáculo)
      const emit = nodes[nb + 4] * Math.PI;                       // 0 (frente) .. π (atrás) desde el eje del cuerpo
      const dist = (pr[p] + cr) * (0.85 + nodes[nb + 5] * 0.5);   // anclaje al padre: suelo alto (0.85) → el hijo no queda ENTERRADO bajo el padre
      px[k] = px[p] + Math.cos(emit) * dist; py[k] = py[p] + Math.sin(emit) * dist;
      pr[k] = cr; pl[k] = ln; pa[k] = emit; pts[k] = nodes[nb + 8]; // tipShape (silueta)
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(heading);
    // VOLUMEN (B2b incremento 4): colores de relieve del render clásico + luz desde arriba-izq del MUNDO,
    // pasada a este frame local (rota −heading) para que el brillo sea coherente sea cual sea el rumbo.
    const coreLight = `hsl(${h},${Math.max(22, s - 16)}%,${Math.min(82, l + 18)}%)`;
    const coreMid = `hsl(${h},${s}%,${Math.max(12, l - 3)}%)`;
    const coreDark = `hsl(${h},${Math.min(100, s + 12)}%,${Math.max(4, l - 26)}%)`;
    const coreOut = `hsl(${h},${Math.min(100, s + 6)}%,${Math.max(6, l - 22)}%)`;
    const chh = Math.cos(heading), shh = Math.sin(heading);
    const llx = -0.7 * chh + -0.7 * shh, lly = 0.7 * chh + -0.7 * shh; // dir de luz (mundo -0.7,-0.7) → local
    const tex2 = deco ? deco[dco + 6] : 0.5;
    const ds = this._drawScale || 1, outW = Math.max(0.8, r * 0.07);
    const inkLine = `hsla(${h},${Math.min(100, s + 8)}%,${Math.max(4, l - 16)}%,0.28)`;
    // Silueta del nodo (Capa 1): forma base↔punta según tipShape. Curva cerrada simétrica al eje; wB = medio-ancho
    // cerca de la BASE (hacia el padre), wT = cerca de la PUNTA (hacia fuera). Afilar (<0.5) engorda base y afila
    // punta (púa/garra/tentáculo); abrir (>0.5) afila base y abre punta (aleta/paleta); 0.5 ≈ lente ≈ elipse previa.
    // Los puntos se transforman aquí a coords del cuerpo (rot+centro) → el gradiente/luz quedan coherentes (no rotamos el canvas).
    const silPath = (cx, cy, rot, L, wB, wT) => {
      const cR = Math.cos(rot), sR = Math.sin(rot);
      const X = (lx, ly) => cx + lx * cR - ly * sR, Y = (lx, ly) => cy + lx * sR + ly * cR;
      ctx.beginPath();
      ctx.moveTo(X(-L, 0), Y(-L, 0));
      ctx.bezierCurveTo(X(-L * 0.5, wB), Y(-L * 0.5, wB), X(L * 0.5, wT), Y(L * 0.5, wT), X(L, 0), Y(L, 0));
      ctx.bezierCurveTo(X(L * 0.5, -wT), Y(L * 0.5, -wT), X(-L * 0.5, -wB), Y(-L * 0.5, -wB), X(-L, 0), Y(-L, 0));
      ctx.closePath();
    };
    const drawNode = (cx, cy, rot, rxx, ryy, mode, tip) => {
      const sShape = (tip - 0.5) * 2;                          // −1 afila .. +1 abre
      let wB = ryy * (1.30 - sShape * 0.95);                   // medio-ancho base (afilar engorda)
      let wT = ryy * (1.30 + sShape * 1.15);                   // medio-ancho punta (abrir engorda)
      if (wB < 0.4) wB = 0.4; if (wT < 0.4) wT = 0.4;
      if (mode === 0) {                                        // PASADA contorno: misma silueta agrandada
        ctx.fillStyle = coreOut;
        silPath(cx, cy, rot, rxx + outW, wB + outW, wT + outW); ctx.fill();
      } else {                                                 // PASADA cuerpo: degradado de volumen + textura
        const rad = Math.max(rxx, wB, wT);
        const g = ctx.createRadialGradient(cx + llx * rxx * 0.5, cy + lly * ryy * 0.5, rad * 0.12, cx, cy, rad * 1.05);
        g.addColorStop(0, coreLight); g.addColorStop(0.55, coreMid); g.addColorStop(1, coreDark);
        ctx.fillStyle = g; silPath(cx, cy, rot, rxx, wB, wT); ctx.fill();
        if (rxx * ds > 10) {                                   // TEXTURA: bandas transversales sutiles (clip a la silueta)
          ctx.save(); silPath(cx, cy, rot, rxx, wB, wT); ctx.clip();
          const nb2 = 2 + ((tex2 * 4) | 0), cr2 = Math.cos(rot), sr2 = Math.sin(rot), wMax = wB > wT ? wB : wT;
          ctx.strokeStyle = inkLine; ctx.lineWidth = Math.max(0.6, ryy * 0.16);
          for (let bI = 1; bI < nb2; bI++) {
            const u = bI / nb2 - 0.5, ox = cr2 * u * 2 * rxx, oy = sr2 * u * 2 * rxx;
            ctx.beginPath(); ctx.ellipse(cx + ox, cy + oy, wMax * 0.95, wMax * 0.55, rot + 1.5708, 0, 6.2832); ctx.stroke();
          }
          ctx.restore();
        }
      }
    };
    // ---- ONDA VIAJERA (B2b): la flexión se ACUMULA del padre al hijo → cadena articulada (anguila). La
    // cabeza (raíz, prof. 0) queda estable; la cola ondula más (fase por profundidad). Nada más rápido = más onda.
    const wpx = this._ngwx || (this._ngwx = new Float32Array(NS));
    const wpy = this._ngwy || (this._ngwy = new Float32Array(NS));
    const acc = this._ngac || (this._ngac = new Float32Array(NS));  // flexión acumulada hasta el nodo
    const waveT = t * (1 + spd * 2.5), jointAmp = 0.18 * (0.4 + spd * 0.8);
    const oscFloor = this.cfg.loco.oscFloor;                      // mismo suelo de amplitud que la física
    wpx[0] = 0; wpy[0] = 0; acc[0] = 0;
    for (let k = 1; k < NS; k++) {
      if (!pres[k]) continue;
      const p = par[k], nb = no + k * ST;
      let bend = 0;
      if (doWave) {                                              // LOD: a tamaño pequeño, cuerpo en REPOSO (sin onda)
        const ampK = jointAmp * (oscFloor + (1 - oscFloor) * nodes[nb + 6]); // amplitud por nodo (osc_amp, físico)
        const phK = nodes[nb + 7] * 6.283185307;                 // fase por nodo (osc_phase): coordinada → onda limpia
        bend = Math.sin(waveT - dep[k] * 1.1 - phK) * ampK;      // onda viajera por profundidad + offset genético
      }
      acc[k] = acc[p] + bend;                                     // acumula la flexión del padre + la propia
      const rdx = px[k] - px[p], rdy = py[k] - py[p], ca = Math.cos(acc[k]), sa = Math.sin(acc[k]);
      wpx[k] = wpx[p] + rdx * ca - rdy * sa; wpy[k] = wpy[p] + rdx * sa + rdy * ca; // gira el segmento padre→hijo
    }
    for (let mode = doWave ? 0 : 1; mode <= 1; mode++) {          // LOD: a tamaño pequeño solo pasada de cuerpo (sin contorno)
      for (let k = NS - 1; k >= 0; k--) {                         // de atrás (hojas) hacia delante (raíz encima)
        if (!pres[k]) continue;
        const lateral = k > 0 && Math.min(pa[k], Math.PI - pa[k]) > EPS_AXIS; // mismo umbral que la física (bodyplan.js)
        const baseRot = pa[k] + acc[k];                           // orientación del nodo = reposo + onda acumulada
        for (let sgn = 1; sgn >= (lateral ? -1 : 1); sgn -= 2) {  // sgn=−1 = reflejo bilateral (y y rotación)
          drawNode(wpx[k], wpy[k] * sgn, baseRot * sgn, Math.max(0.6, pl[k]), Math.max(0.6, pr[k]), mode, pts[k]);
        }
      }
    }
    // ---- SEÑUELO / ORNAMENTO (B2b incremento 3): tallo curvo afilado + bulbo bioluminiscente, naciendo del
    // morro y proyectado al frente (illicium de rape). Gateado por `orn`; estilo por o_len/o_bulb/o_hue/o_num. ----
    const orn = tint ? tint[to] : 0;   // #13: tint = solo orn (stride 1)
    if (orn > 0.12 && deco && doLure) {   // LOD: señuelo (béziers+gradientes, caro) solo a tamaño suficiente
      const oLen = deco[dco + 2], oBulb = deco[dco + 3], oHue = deco[dco + 4], oNum = deco[dco + 5];
      const ds = this._drawScale || 1, fmin = (px) => px / ds;
      const hr = pr[0], elong = pl[0] / pr[0];
      const np = 1 + ((oNum * oNum * 6) | 0);
      const plen = r * (0.5 + oLen * 5.5);
      const ohue = h;   // #13: el tallo del señuelo usa el tono del cuerpo (antes desfase por c_app, retirado)
      ctx.lineCap = 'round';
      const bulbR = Math.max(fmin(0.6), r * (0.06 + oBulb * 0.34));
      const bulbHue = (((ohue + (oHue - 0.5) * 300) % 360) + 360) % 360;
      const ax0 = hr * elong * 0.85, ay0 = 0;
      for (let p = 0; p < np; p++) {
        const spread = np > 1 ? (p / (np - 1) - 0.5) : 0;
        const ang = spread * 1.1 + Math.sin(t * 1.4 + p) * 0.1 * orn;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const bx = ax0, by = ay0, tx = ax0 + dx * plen, ty = ay0 + dy * plen;
        const mx0 = (bx + tx) / 2, my0 = (by + ty) / 2;
        let nx = -(ty - by), ny = (tx - bx); const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const curve = plen * 0.16 * Math.sin(p * 1.7 + 0.6);
        const cx2 = mx0 + nx * curve, cy2 = my0 + ny * curve;
        const wB = Math.max(fmin(0.8), r * 0.11), wT = Math.max(fmin(0.25), r * 0.03);
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
        const pulse = 1 + 0.14 * Math.sin(t * 1.6 + p * 1.3) * orn;
        const br = bulbR * (0.9 + 0.4 * orn) * pulse, h2 = bulbHue;
        const hg = ctx.createRadialGradient(tx, ty, 0, tx, ty, br * 7);
        hg.addColorStop(0, `hsla(${h2},96%,76%,0.5)`); hg.addColorStop(0.18, `hsla(${h2},95%,68%,0.22)`);
        hg.addColorStop(0.45, `hsla(${h2},95%,64%,0.07)`); hg.addColorStop(1, `hsla(${h2},95%,64%,0)`);
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(tx, ty, br * 7, 0, 6.2832); ctx.fill();
        const bg2 = ctx.createRadialGradient(tx - br * 0.35, ty - br * 0.4, br * 0.1, tx, ty, br);
        bg2.addColorStop(0, `hsl(${h2},95%,84%)`); bg2.addColorStop(1, `hsl(${(h2 + 20) % 360},90%,50%)`);
        ctx.fillStyle = bg2; ctx.beginPath(); ctx.arc(tx, ty, br, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(tx - br * 0.3, ty - br * 0.34, br * 0.3, 0, 6.2832); ctx.fill();
      }
    }

    // ---- OJOS en la raíz (B2b incremento 2): perla vidriosa oscura + pupila que sigue la MIRADA. Conteo
    // (cíclope/par/racimo) desde `sense`; iris ligado a la paleta del cuerpo (c_eye); entornado por el
    // IMPULSO DE ATAQUE del cerebro (dinámico, emergente: los que cazan parecen feroces — ya no un gen). ----
    if (showEyes && eye) {
      const senseG = eye[eo], cEye = eye[eo + 2], atkDrive = eye[eo + 3];
      const hr = pr[0], elong = pl[0] / pr[0];
      const er0 = Math.max(0.8, hr * (0.16 + 0.34 * senseG));
      const nEye = senseG < 0.3 ? 1 : senseG < 0.72 ? 2 : 4 + ((senseG - 0.72) * 12 | 0);
      const iHue = (((h + (cEye - 0.5) * 70) % 360) + 360) % 360;
      const aspectY = 1 - atkDrive * 0.4;                        // impulso de ataque alto → ojo entornado (feroz)
      const ch = Math.cos(heading), sh = Math.sin(heading);
      let lgx = 1, lgy = 0;
      if (face) { const gx = face[fo], gy = face[fo + 1]; lgx = gx * ch + gy * sh; lgy = -gx * sh + gy * ch; }
      const drawEye = (cx, cy, er) => {
        const erx = er, ery = er * aspectY;
        const eg = ctx.createRadialGradient(cx - erx * 0.3, cy - ery * 0.3, er * 0.1, cx, cy, er * 1.05);
        eg.addColorStop(0, `hsl(${iHue},55%,30%)`); eg.addColorStop(1, `hsl(${iHue},62%,7%)`);
        ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(cx, cy, erx, ery, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.beginPath();
        ctx.arc(cx + lgx * er * 0.32, cy + lgy * ery * 0.32, er * 0.42, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath();
        ctx.arc(cx - erx * 0.3, cy - ery * 0.34, er * 0.22, 0, 6.2832); ctx.fill();
      };
      const fx = hr * elong * 0.45;                              // ojos en la mitad FRONTAL de la raíz (+x = rumbo)
      if (nEye === 1) drawEye(fx, 0, er0 * 1.2);                 // cíclope
      else if (nEye === 2) { for (let e = 0; e < 2; e++) { const sgn = e ? -1 : 1; drawEye(fx, sgn * hr * 0.55, er0); } }
      else {                                                     // racimo en pares espejados
        const er = er0 * 0.6, pairs = nEye >> 1;
        for (let p = 0; p < pairs; p++) {
          const tt = pairs > 1 ? p / (pairs - 1) : 0.5, aa = 0.5 + tt * 0.8, dd = hr * (0.4 + tt * 0.4);
          const cx = Math.cos(aa) * dd * elong, cy = Math.sin(aa) * dd;
          drawEye(cx, cy, er); drawEye(cx, -cy, er);
        }
        if (nEye & 1) drawEye(fx, 0, er);
      }
    }
    ctx.restore();
  }


  // Retrato del organismo seleccionado para el inspector: dibuja el bicho centrado en un canvas
  // pequeño a partir de su genoma completo. Reutiliza _drawBodyGraph (mismo aspecto que en el mundo).
  drawPortrait(pctx, genes, t, ef, headingArg, spdArg, atkArg) {   // heading/spd/atk opcionales → orienta, ondula y entorna el ojo IGUAL que en el mundo
    const cw = pctx.canvas.width, ch = pctx.canvas.height;
    pctx.clearRect(0, 0, cw, ch);
    if (!genes) return;
    this._drawScale = 1;   // el retrato dibuja en píxeles directos (sin transform) → el ojo es grande → detalle completo
    // Fondo abisal oscuro (degradado suave) → resaltan los contornos y el glow de la criatura.
    const bg = pctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, '#10182a'); bg.addColorStop(1, '#05070c');
    pctx.fillStyle = bg; pctx.fillRect(0, 0, cw, ch);
    const tint = this._pTint || (this._pTint = new Float32Array(1));
    tint[0] = genes[G.orn];   // #13: tint = solo ornamento (gatea el señuelo)
    const pdeco = this._pDeco || (this._pDeco = new Float32Array(7)); // [c_lum, c_sat, o_len, o_bulb, o_hue, o_num, tex2]
    pdeco[0] = genes[G.c_lum]; pdeco[1] = genes[G.c_sat];
    pdeco[2] = genes[G.o_len]; pdeco[3] = genes[G.o_bulb]; pdeco[4] = genes[G.o_hue]; pdeco[5] = genes[G.o_num];
    pdeco[6] = genes[G.tex2];
    const eye = this._pEye || (this._pEye = new Float32Array(4));
    eye[0] = genes[G.sense]; eye[1] = genes[G.e_fov]; eye[2] = genes[G.c_eye]; eye[3] = atkArg || 0; // ceño = impulso de ataque
    const heading = (headingArg != null) ? headingArg : -Math.PI / 2; // por defecto mira arriba; si se da, usa el del mundo
    const face = this._pFace || (this._pFace = new Float32Array(3));
    face[0] = Math.cos(heading); face[1] = Math.sin(heading); face[2] = 0; // pupila al frente, sin boca
    const cSat = genes[G.c_sat], cLumP = genes[G.c_lum]; // igual que en el mundo (rueda completa de tono + sat/luz)
    const h = genes[G.hue] * 360, s = 18 + cSat * cSat * 82;
    const l = 31 + (ef || 0.5) * 24 + cLumP * cLumP * 14;
    const r = Math.min(cw, ch) * 0.16, px = cw * 0.5, py = ch * 0.44;
    pctx.fillStyle = 'rgba(0,0,0,0.16)';               // sombra de contacto suave → volumen
    pctx.beginPath(); pctx.ellipse(px, py + r * 0.6, r * 1.5, r * 0.5, 0, 0, 6.2832); pctx.fill();
    // GLOW/halo: MISMA fórmula que en el mundo (_drawAgents) para que el retrato se vea igual de luminoso.
    // Gateado por la misma config de glow → coinciden con el efecto encendido/apagado.
    if (this.cfg.render.glow) {
      const cLumG = cLumP;
      const gr = r * (1.65 + cLumG * cLumG * 3.0);
      const gl = Math.min(82, l + 26);
      const a0 = 0.21 + cLumG * cLumG * 0.48;
      const gg = pctx.createRadialGradient(px, py, r * 0.25, px, py, gr);
      gg.addColorStop(0, `hsla(${h},${s}%,${gl}%,${a0})`);
      gg.addColorStop(0.45, `hsla(${h},${s}%,${gl}%,${a0 * 0.32})`);
      gg.addColorStop(1, `hsla(${h},${s}%,${gl}%,0)`);
      pctx.fillStyle = gg;
      pctx.beginPath(); pctx.arc(px, py, gr, 0, 6.2832); pctx.fill();
    }
    const pspd = (spdArg != null) ? spdArg : 0.5;        // velocidad de ondulación; si se da, la del mundo
    this._drawBodyGraph(pctx, px, py, r, h, s, l, genes, G.n0_present, heading, pspd, t, eye, 0, face, 0, true, tint, 0, pdeco, 0);
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
