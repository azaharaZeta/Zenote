// Render con Canvas 2D. El mundo es lógico y fijo; aquí solo se MUESTRA, con una cámara
// (zoom + paneo toroidal en mosaico). Nada de esto toca la simulación.

import { NUM_GENES, G, NODE_COUNT, NODE_STRIDE } from '../engine/genome.js';
import { EPS_AXIS, PRES_LO, presWeight } from '../engine/bodyplan.js';
import { makeRng } from '../util/rng.js';

// Hue pseudoaleatorio estable a partir de un id de linaje (buena dispersión en [0,360)).
function lineageHue(id) { return (Math.imul(id + 1, 2654435761) >>> 0) % 360; }

// Escala de REFERENCIA del LOD (nivel de detalle). El LOD depende SOLO de la CALIDAD (lodMul) y el ZOOM — NUNCA de la
// resolución (ni la nativa del dispositivo ni `maxInternalPx`). El "tamaño aparente" con el que se decide el detalle es
// `LOD_REF · zoom · radio_mundo`; la resolución solo cambia la NITIDEZ del pegote final, no QUÉ se dibuja. 1 = el mundo
// (px lógicos) en unidades de referencia a zoom 1. Los umbrales `config.render.lod*` se calibran contra esto.
const LOD_REF = 1;

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
    // Búfer de BLOOM a baja resolución (¼ del backing store, dimensionado en resize): desenfocar una miniatura y
    // reescalarla aditivamente cuesta ~16× menos que blurear a pantalla completa, con el mismo halo (el glow es de
    // baja frecuencia). Ver _bloomPass.
    this._bloom = document.createElement('canvas');
    this._bloomCtx = this._bloom.getContext('2d');
    this._grassTimer = 0;
    this._abyssTimer = 0;          // #4: el ruido del sustrato es del MUNDO (no de la cámara) → se recomputa por TIMER, no al panear/seguir
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
    this.sparkSprites = (this.cfg.render.planktonHues || [150, 165, 180, 196, 212]).map((h) => this._makeSparkSprite(h)); // verde-algas → cian → azul-cian (variedad)
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

  // Sprite de HALO (glow radial) cacheado por CUBO DE TONO (#3): evita crear un createRadialGradient + fill por
  // agente y frame (drawImage es mucho más barato). La forma de la alpha es fija; la INTENSIDAD por agente la pone
  // globalAlpha; el tono se cubica en 12 (±15°, imperceptible en un glow difuso). Lazy por cubo.
  _haloSprite(h) {
    if (!this._halos) this._halos = new Array(12);
    let b = (h / 30) | 0; if (b < 0) b = 0; else if (b > 11) b = 11;
    let sp = this._halos[b];
    if (!sp) {
      const S = 64, hue = b * 30 + 15;
      sp = document.createElement('canvas'); sp.width = sp.height = S;
      const x = sp.getContext('2d'), r = S / 2;
      const g = x.createRadialGradient(r, r, r * 0.12, r, r, r);
      g.addColorStop(0, `hsla(${hue},70%,68%,1)`);
      g.addColorStop(0.45, `hsla(${hue},70%,68%,0.32)`);
      g.addColorStop(1, `hsla(${hue},70%,68%,0)`);
      x.fillStyle = g; x.beginPath(); x.arc(r, r, r, 0, 6.2832); x.fill();
      this._halos[b] = sp;
    }
    return sp;
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
      const SS = cfg.render.quality === 'low' ? 3 : cfg.render.quality === 'ultra' ? 6 : 4, NW = cols * SS, NH = rows * SS; // sobre-muestreo del sustrato (baja 3× · alta 4× · máxima 6×) → suaviza la rejilla del recurso
      const PAD = 16, WW = NW + 2 * PAD, WH = NH + 2 * PAD; // margen para el BLUR TOROIDAL (≥ radio del blur ~3·vegBlur; tope del slider 4 → 12px)
      let cv = this._abyssLow;
      const NP = NW * NH;
      if (!cv || cv.width !== NW) {
        cv = this._abyssLow = document.createElement('canvas'); cv.width = NW; cv.height = NH;
        this._abyssLowCtx = cv.getContext('2d'); this._abyssImg = this._abyssLowCtx.createImageData(NW, NH);
        // Buffers AMPLIADOS con padding TOROIDAL (WW×WH): _abyssWrap = sustrato + sus bordes ENVUELTOS (mosaico 3×3);
        // _abyssSmooth = ese mosaico blureado. El blur promedia los bordes con el lado OPUESTO real (no con el vacío)
        // → al teselar el toro NO quedan costuras. Se tesela la región CENTRAL (PAD,PAD,NW,NH). Ver el bloque del blur.
        this._abyssWrap = document.createElement('canvas'); this._abyssWrap.width = WW; this._abyssWrap.height = WH;
        this._abyssWrapCtx = this._abyssWrap.getContext('2d');
        this._abyssSmooth = document.createElement('canvas'); this._abyssSmooth.width = WW; this._abyssSmooth.height = WH;
        this._abyssSmoothCtx = this._abyssSmooth.getContext('2d'); // buffer DIFUMINADO (mosaico blureado; la región central = sustrato sin costura)
        // CACHÉS del sustrato (ESTÁTICOS: no cambian con el tiempo, solo con resolución/temperatura):
        this._subBase = new Float32Array(NP * 3);  // color de fondo YA moteado (rr·mott, gg·mott, bb·mott)
        this._subIdx  = new Int32Array(NP * 4);     // índices del bilineal del food (i00,i10,i01,i11)
        this._subWx   = new Float32Array(NP);       // peso fxc (smoothstep)
        this._subWy   = new Float32Array(NP);       // peso fyc
        this._subStaticTimer = 0;                   // realloc → fuerza recomputar la capa estática
      }
      // ---- (1) CAPA ESTÁTICA (CARA: ruido pnoise + temperatura): NO cambia con el mundo → se cachea y recomputa
      // muy de vez en cuando. Aquí guardamos el color de fondo y los índices/pesos del bilineal del food. #4 ----
      if (this._subStaticTimer <= 0) {
        const base = this._subBase, sIdx = this._subIdx, sWx = this._subWx, sWy = this._subWy;
        const hash = (ix, iy, sd) => { let h = (ix * 374761393 + iy * 668265263 + sd * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
        // value-noise PERIÓDICO: rejilla px×py que ENVUELVE (módulo) → tesela sin costura en el toro. u,v ∈ [0,1).
        const pnoise = (u, v, px, py, sd) => {
          const fx = u * px, fy = v * py, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
          const x0 = ((ix % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((iy % py) + py) % py, y1 = (y0 + 1) % py;
          const a = hash(x0, y0, sd), b = hash(x1, y0, sd), c = hash(x0, y1, sd), e = hash(x1, y1, sd);
          const su = tx * tx * (3 - 2 * tx), sv = ty * ty * (3 - 2 * ty);
          return a + (b - a) * su + (c - a) * sv + (a - b - c + e) * su * sv; };
        for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) {
          const idx = j * NW + i;
          const wx = (i + 0.5) / NW * W, wy = (j + 0.5) / NH * H;
          // BILINEAL sobre los centros de celda (toro) → comida y temperatura SUAVES, sin cuadrados de rejilla.
          const gxc = wx / cellW - 0.5, gyc = wy / cellH - 0.5;
          const x0 = Math.floor(gxc), y0 = Math.floor(gyc), fxr = gxc - x0, fyr = gyc - y0;
          const fxc = fxr * fxr * (3 - 2 * fxr), fyc = fyr * fyr * (3 - 2 * fyr); // smoothstep (C1): mata las facetas del bilineal
          const xa = ((x0 % cols) + cols) % cols, xb = (xa + 1) % cols;
          const ya = ((y0 % rows) + rows) % rows, yb = (ya + 1) % rows;
          const i00 = ya * cols + xa, i10 = ya * cols + xb, i01 = yb * cols + xa, i11 = yb * cols + xb;
          const q = idx * 4; sIdx[q] = i00; sIdx[q + 1] = i10; sIdx[q + 2] = i01; sIdx[q + 3] = i11; sWx[idx] = fxc; sWy[idx] = fyc; // cachea el bilineal del food (estático)
          const tT = temp[i00] + (temp[i10] - temp[i00]) * fxc, tB = temp[i01] + (temp[i11] - temp[i01]) * fxc;
          const tv = tT + (tB - tT) * fyc;
          // (E) PALETA ABISAL: fondo CASI NEGRO donde no hay vegetación (azul profundo) → así la vegetación se lee
          // por CONTRASTE contra la oscuridad, no por brillo. Frío = azul casi negro; cálido = azul-violeta apagado.
          let rr, gg, bb;
          if (tv < 0.5) { const u = tv / 0.5; rr = 1 + u * 1.5; gg = 2 + u * 4; bb = 12 + u * 4; }
          else { const u = (tv - 0.5) / 0.5; rr = 2.5 + u * 7; gg = 6 + u * -1; bb = 16 + u * 4; }
          const u = wx / W, v = wy / H;
          const n = 0.62 * pnoise(u, v, 26, 17, 0) + 0.38 * pnoise(u, v, 70, 47, 7); // (A) moteado 2 octavas PERIÓDICO (sin costura)
          const mott = 0.7 + n * 0.72;
          const b3 = idx * 3; base[b3] = rr * mott; base[b3 + 1] = gg * mott; base[b3 + 2] = bb * mott; // color de fondo cacheado (sin food)
        }
        this._subStaticTimer = 90; // temperatura/moteado no cambian (o muy lento) → recachear rara vez (capta deriva ambiental)
      }
      this._subStaticTimer--;
      // ---- (2) CAPA DINÁMICA (BARATA: solo el FOOD): se recompone EN CADA refresco → la vegetación FLUYE con el
      // mundo (sin el gate de 18 frames que la hacía ir "a golpes"). Sin pnoise ni pow por píxel: base e índices ya
      // cacheados, y el pow va por LUT. (C) VEGETACIÓN = fosforescencia teal/algas, dim a propósito. ----
      {
        const vegI = cfg.render.vegIntensity != null ? cfg.render.vegIntensity : 1;   // brillo de la vegetación (slider lab, en vivo)
        const vegBoost = cfg.render.vegBoost != null ? cfg.render.vegBoost : 0.77;     // realce del pasto tenue (UI 0→1, slider lab)
        const vegExp = 1.5 - vegBoost * 1.3; // 0→1 (realce) → exponente 1.5→0.2: como food∈[0,1], exponente BAJO sube los mids → el pasto tenue brilla. Alto vegBoost = más realce.
        if (this._fgExp !== vegExp || !this._fgLUT) { // LUT food→brillo (food^vegExp): se recomputa SOLO si cambia el exponente, no por píxel
          if (!this._fgLUT) this._fgLUT = new Float32Array(1024);
          for (let k = 0; k < 1024; k++) this._fgLUT[k] = Math.pow(k / 1023, vegExp);
          this._fgExp = vegExp;
        }
        const d = this._abyssImg.data, base = this._subBase, sIdx = this._subIdx, sWx = this._subWx, sWy = this._subWy, lut = this._fgLUT;
        const vc = cfg.render.vegColor || [10, 64, 70];
        const invR = 1 / Rmax, cR = vc[0] * vegI, cG = vc[1] * vegI, cB = vc[2] * vegI;
        for (let idx = 0; idx < NP; idx++) {
          const q = idx * 4, a0 = res[sIdx[q]], fxc = sWx[idx];               // bilineal del food con índices/pesos cacheados
          const rT = a0 + (res[sIdx[q + 1]] - a0) * fxc, c0 = res[sIdx[q + 2]];
          const rB = c0 + (res[sIdx[q + 3]] - c0) * fxc;
          let food = (rT + (rB - rT) * sWy[idx]) * invR; food = food > 1 ? 1 : food < 0 ? 0 : food;
          const fg = lut[(food * 1023) | 0], b3 = idx * 3;
          d[q] = base[b3] + fg * cR; d[q + 1] = base[b3 + 1] + fg * cG; d[q + 2] = base[b3 + 2] + fg * cB; d[q + 3] = 255; // fondo cacheado + vegetación viva
        }
        this._abyssLowCtx.putImageData(this._abyssImg, 0, 0);
        // DIFUMINADO TOROIDAL: el blur disuelve la rejilla de celda del recurso (cellW≈19px) que el realce de la
        // vegetación revelaría. Para NO dejar costuras en los bordes del mundo (toro), se blurea sobre un MOSAICO 3×3
        // del sustrato (su contenido ya es periódico) → el blur de los bordes promedia con el lado OPUESTO real, no con
        // el vacío transparente (que hundía el alpha del borde y creaba la costura al teselar). Radio (UI vegBlur).
        const vegBlur = cfg.render.vegBlur != null ? cfg.render.vegBlur : 1.8;
        const wrap = this._abyssWrapCtx;
        wrap.setTransform(1, 0, 0, 1, 0, 0); wrap.clearRect(0, 0, WW, WH);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) wrap.drawImage(cv, PAD + ox * NW, PAD + oy * NH); // sustrato centrado (PAD,PAD) + 8 réplicas envueltas
        const sc = this._abyssSmoothCtx;
        sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, WW, WH);
        sc.filter = vegBlur > 0 ? `blur(${vegBlur}px)` : 'none';
        sc.drawImage(this._abyssWrap, 0, 0);
        sc.filter = 'none';
      }
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; // suaviza el upscaling del sustrato → menos rejilla del recurso
      for (let ty = tyMin; ty <= tyMax; ty++) for (let tx = txMin; tx <= txMax; tx++) {
        ctx.setTransform(s, 0, 0, s, offX + tx * W * s, offY + ty * H * s);
        ctx.drawImage(this._abyssSmooth, PAD, PAD, NW, NH, 0, 0, W, H); // región CENTRAL del buffer ampliado (sin el padding toroidal) → W×H
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
      // NUTRIENTE libre (pecera cerrada): neblina ÍNDIGO/violeta tenue donde se CONCENTRA la materia mineralizada
      // (manchas fértiles donde murió/respiró algo). Distinta del teal de la vegetación y el gris de la carroña.
      // Opacidad ∝ N normalizado por su MÁXIMO → solo destacan las concentraciones; el fondo difuso casi no se ve.
      const nutrient = Wld.nutrient;
      if (nutrient && nutrient.length) {
        // SUAVIZADO TEMPORAL (EMA) del campo SOLO para el DIBUJO: las manchas RESPIRAN despacio en vez de titilar al
        // ritmo de los ticks (el nutriente fluctúa rápido: difusión + consumo del rebrote + depósitos por muerte). NO
        // toca la simulación. `render.nutrientEase` = acercamiento por refresco (bajo = más calmado). En pausa no avanza.
        let nut = this._nutSmooth;
        if (!nut || nut.length !== nutrient.length) { nut = this._nutSmooth = new Float32Array(nutrient.length); nut.set(nutrient); }
        const nutEase = cfg.render.nutrientEase != null ? cfg.render.nutrientEase : 0.1;
        for (let k = 0; k < nut.length; k++) nut[k] += (nutrient[k] - nut[k]) * nutEase;
        // La viz resalta el CONTRASTE (concentración SOBRE la media), no el valor absoluto: un campo UNIFORME
        // (p.ej. el nutriente recién repartido al reiniciar) NO debe pintar una rejilla de celdas — solo las MANCHAS
        // reales de concentración. (Antes se normalizaba al máximo → uniforme ⇒ todas las celdas a tope ⇒ rejilla brillante.)
        let maxN = 0, sumN = 0; for (let k = 0; k < nut.length; k++) { const v = nut[k]; sumN += v; if (v > maxN) maxN = v; }
        const meanN = sumN / nutrient.length, span = maxN - meanN;
        if (span > meanN * 0.15 + 0.001) {   // solo si hay RELIEVE real (manchas); campo casi uniforme → no se pinta nada
          if (!this._nutrientSprite) {
            const S = 48, sp = document.createElement('canvas'); sp.width = sp.height = S;
            const sx = sp.getContext('2d'), g = sx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
            const nc = cfg.render.nutrientColor || [124, 108, 214];
            g.addColorStop(0, `rgba(${nc[0]},${nc[1]},${nc[2]},1)`); g.addColorStop(1, `rgba(${nc[0]},${nc[1]},${nc[2]},0)`); // índigo-violeta (nutriente mineral)
            sx.fillStyle = g; sx.fillRect(0, 0, S, S); this._nutrientSprite = sp;
          }
          const sprite = this._nutrientSprite, inv = 1 / span, sz = cellW * 2.0;
          ctx.globalCompositeOperation = 'lighter';
          for (let ty = tyMin; ty <= tyMax; ty++) for (let tx = txMin; tx <= txMax; tx++) {
            ctx.setTransform(s, 0, 0, s, offX + tx * W * s, offY + ty * H * s);
            let cx0 = ((this.camX - vwHalf - tx * W) / cellW | 0) - 1; if (cx0 < 0) cx0 = 0;
            let cx1 = ((this.camX + vwHalf - tx * W) / cellW | 0) + 1; if (cx1 > cols - 1) cx1 = cols - 1;
            let cy0 = ((this.camY - vhHalf - ty * H) / cellH | 0) - 1; if (cy0 < 0) cy0 = 0;
            let cy1 = ((this.camY + vhHalf - ty * H) / cellH | 0) + 1; if (cy1 > rows - 1) cy1 = rows - 1;
            for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
              const nv = (nut[cy * cols + cx] - meanN) * inv;  // 0..1: EXCESO sobre la media (suavizada), normalizado al pico → uniforme = 0
              if (nv < 0.25) continue;                               // solo las concentraciones POR ENCIMA de la media
              ctx.globalAlpha = (nv - 0.25) * 0.32;                  // sutil (máx ≈ 0.24)
              ctx.drawImage(sprite, (cx + 0.5) * cellW - sz / 2, (cy + 0.5) * cellH - sz / 2, sz, sz);
            }
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      }
      // (Fase 1) CARROÑA: cadáveres como manchas GRISES desaturadas (frío-azuladas, distintas de la fosforescencia
      // teal de la vegetación) en su celda; opacidad ∝ carroña restante → se desvanecen al decaer o ser consumidas.
      const carrion = Wld.carrion;
      if (carrion) {
        if (!this._carrionSprite) {                        // sprite gris suave pre-renderizado (lazy, drawImage barato por celda)
          const S = 48, sp = document.createElement('canvas'); sp.width = sp.height = S;
          const sx = sp.getContext('2d'), g = sx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
          g.addColorStop(0, 'rgba(150,153,165,1)'); g.addColorStop(1, 'rgba(150,153,165,0)');
          sx.fillStyle = g; sx.fillRect(0, 0, S, S); this._carrionSprite = sp;
        }
        const sprite = this._carrionSprite, ref = 35, sz = cellW * 1.7; // energía de referencia para la opacidad (cadáver natural ≈ E + carcassValue·eMax)
        for (let ty = tyMin; ty <= tyMax; ty++) for (let tx = txMin; tx <= txMax; tx++) {
          ctx.setTransform(s, 0, 0, s, offX + tx * W * s, offY + ty * H * s);
          // CULLING a las celdas VISIBLES de este mosaico (igual que el plancton, arriba): a zoom alto el barrido pasa
          // de las 3072 celdas a unas pocas (+1 de margen por el tamaño del sprite). A zoom 1 (mundo entero) recorre ~todas.
          let cx0 = ((this.camX - vwHalf - tx * W) / cellW | 0) - 1; if (cx0 < 0) cx0 = 0;
          let cx1 = ((this.camX + vwHalf - tx * W) / cellW | 0) + 1; if (cx1 > cols - 1) cx1 = cols - 1;
          let cy0 = ((this.camY - vhHalf - ty * H) / cellH | 0) - 1; if (cy0 < 0) cy0 = 0;
          let cy1 = ((this.camY + vhHalf - ty * H) / cellH | 0) + 1; if (cy1 > rows - 1) cy1 = rows - 1;
          for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
            const cval = carrion[cy * cols + cx];
            if (cval < 0.5) continue;                        // celda sin carroña apreciable → salta (la mayoría)
            let a = cval / ref; if (a > 0.5) a = 0.5;
            ctx.globalAlpha = a;
            ctx.drawImage(sprite, (cx + 0.5) * cellW - sz / 2, (cy + 0.5) * cellH - sz / 2, sz, sz);
          }
        }
        ctx.globalAlpha = 1;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  resize() {
    const cfg = this.cfg, c = this.canvas;
    const cssW = c.clientWidth || window.innerWidth;
    const cssH = c.clientHeight || window.innerHeight;
    // Calidad BAJA (móvil): DPR=1. ALTA: hasta dprCap. MÁXIMA: supersampling (DPR+1, hasta ultraDprCap).
    const q = cfg.render.quality;
    const dpr = q === 'low' ? 1
      : q === 'ultra' ? Math.min(cfg.render.ultraDprCap || 3, (window.devicePixelRatio || 1) + 1)
      : Math.min(window.devicePixelRatio || 1, cfg.render.dprCap);
    // Backing store DESEADO (CSS × dpr) y CAP de resolución interna (borde largo): renderizamos por DEBAJO de la
    // pantalla y el CSS reescala (el blur abisal disimula el upscaling) → coste por píxel ACOTADO e independiente del
    // tamaño/DPR de pantalla (clave para 4K). Ver render.maxInternalPx. 0/ausente = sin cap (comportamiento previo).
    let bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
    // TECHO de resolución interna (escalar, px del borde largo) — se aplica a TODAS las calidades, incl. Máxima
    // (ultra supersamplea hasta el DPR objetivo pero NUNCA por encima de este tope; sube el slider a 3840 = sin tope).
    const cap = cfg.render.maxInternalPx;
    if (cap && Math.max(bw, bh) > cap) { const k = cap / Math.max(bw, bh); bw = Math.round(bw * k); bh = Math.round(bh * k); }
    c.width = bw; c.height = bh;
    this.dpr = dpr;
    // Ratio REAL backing-store↔CSS (≤ dpr cuando el cap actúa) → el paneo/pick deben usar ESTE, no dpr.
    this.pxRatio = cssW > 0 ? c.width / cssW : dpr;
    // TODO el render trabaja en el ESPACIO DEL BUFFER (resolución interna); al final el CSS reescala a la pantalla
    // (un "pegote" escalado) → la pantalla real (4K, 8K…) no entra en ningún cálculo. El LOD (nivel de detalle) depende
    // SOLO de la CALIDAD y el ZOOM, NUNCA de la resolución (ver _drawAgents / LOD_REF): bajar `maxInternalPx` abarata la
    // RASTERIZACIÓN (menos píxeles), NO el detalle. El paneo/pick cruzan a coords de CSS vía pxRatio.
    // Escala "fit/contain": a zoom 1 el MUNDO ENTERO cabe en el viewport. El eje que no llena lo rellena el TORO en
    // mosaico (continuación sin costura), no barras vacías. El zoom multiplica sobre esta base. (Antes "cover"=Math.max → recortaba un eje.)
    this.fitScale = Math.min(c.width / cfg.world.width, c.height / cfg.world.height);
    // Búfer de sustrato y FX a resolución de backing; bloom a ¼ (barato). Forzar re-render tras redimensionar.
    this.grass.width = c.width; this.grass.height = c.height;
    this.fx.width = c.width; this.fx.height = c.height;
    this._bloom.width = Math.max(1, c.width >> 2); this._bloom.height = Math.max(1, c.height >> 2);
    this._gz = NaN; this._abyssTimer = 0;   // recomputa el ruido del sustrato tras resize/reseed/cambio de calidad
  }

  _scale() { return this.fitScale * this.zoom; }

  // BLOOM downsampled (#2): desenfoca una MINIATURA (¼) de `src` y la reescala aditivamente al canvas → mismo
  // halo de baja frecuencia que un blur a pantalla completa, a ~1/16 del coste. `blurPx` se aplica sobre la
  // miniatura (la reducción + el reescalado ya difuminan, así que basta poco). 'lighter' = aditivo.
  _bloomPass(src, alpha, blurPx) {
    const ctx = this.ctx, c = this.canvas, bw = this._bloom.width, bh = this._bloom.height, bctx = this._bloomCtx;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, bw, bh);
    bctx.imageSmoothingEnabled = true;
    bctx.filter = blurPx ? `blur(${blurPx}px)` : 'none';   // blur sobre la miniatura (barato)
    bctx.drawImage(src, 0, 0, bw, bh);                      // downscale (ya difumina por sí mismo)
    bctx.filter = 'none';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._bloom, 0, 0, bw, bh, 0, 0, c.width, c.height); // upscale aditivo
    ctx.restore();
    ctx.globalAlpha = 1;
  }

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
    this.camX = (((this.camX - dxCss * this.pxRatio / s) % W) + W) % W;
    this.camY = (((this.camY - dyCss * this.pxRatio / s) % H) + H) % H;
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
    const ultraQ = cfg.render.quality === 'ultra';       // MÁXIMA: extras de esplendor SOBRE alta (doble bloom, más nieve, …)
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
      this._bloomPass(this.grass, 0.5, 1.2);                       // bloom downsampled (#2): ¼ res + reescalado aditivo
      if (ultraQ) this._bloomPass(this.grass, 0.3, 3);             // MÁXIMA: 2º bloom AMPLIO → halo luminoso difuso
    }

    // ---- Capa de ORGANISMOS (FX): se borra y se redibuja entera cada frame. ----
    const fctx = this.fxCtx;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, c.width, c.height);
    // Caché de sprites (opt-in): contador de frame por DIBUJADO (no por mosaico → marca "visto" una vez) + presupuesto
    // de horneados por frame, reseteado aquí. La evicción va tras el bucle de mosaicos (abajo).
    this._sprFrame = (this._sprFrame | 0) + 1; this._sprBakes = 0;

    const s = this._scale();
    const offX = c.width / 2 - this.camX * s, offY = c.height / 2 - this.camY * s;
    // Mosaicos del toro que tocan el viewport (≤ 2 por eje porque el viewport ≤ 1 mundo).
    const vwHalf = c.width / (2 * s), vhHalf = c.height / (2 * s);
    const txMin = Math.floor((this.camX - vwHalf) / W), txMax = Math.floor((this.camX + vwHalf) / W);
    const tyMin = Math.floor((this.camY - vhHalf) / H), tyMax = Math.floor((this.camY + vhHalf) / H);
    // PISTA DEL LÍMITE DEL MUNDO (render.worldBounds): hairline TENUE en los bordes [0,0]–[W,H] de CADA tile del toro →
    // el observador ve dónde acaba un mundo y empieza su repetición (sin barras vacías ni romper la inmersión). En
    // espacio-MUNDO (panea/zoomea con la cámara), BAJO los organismos. Sutil a propósito. No afecta a la simulación.
    if (cfg.render.worldBounds) {
      ctx.strokeStyle = 'rgba(10, 67, 88, 0.16)';   // cian-frío muy tenue (coherente con la paleta abisal)
      ctx.lineWidth = 1.2 / s;                        // ≈1.5 px de backing en pantalla (el ctx va escalado por s)
      for (let ty = tyMin; ty <= tyMax; ty++) for (let tx = txMin; tx <= txMax; tx++) {
        ctx.setTransform(s, 0, 0, s, offX + tx * W * s, offY + ty * H * s);
        ctx.strokeRect(0, 0, W, H);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // (B) NIEVE MARINA: partículas tenues a la deriva (detrito/esporas) → agua profunda viva + profundidad.
    // Capa propia, BAJO los organismos. Solo abisal. Anclada al mundo (deriva lenta con descenso + parpadeo).
    if (cfg.render.glow && !lowQ) {           // NIEVE MARINA: solo calidad ALTA (en baja se omite del todo)
      if (!this._snow) { const n = 1280, sn = this._snow = new Float32Array(n * 4), hu = this._snowHue = new Float32Array(n);
        const PAL = [190, 200, 285, 45, 330]; // cian, azul, violeta, oro, rosa (colorcillo raro)
        for (let k = 0; k < n; k++) { sn[k * 4] = Math.random() * W; sn[k * 4 + 1] = Math.random() * H; sn[k * 4 + 2] = Math.random() * 6.283; sn[k * 4 + 3] = 0.4 + Math.random() * Math.random() * 2.1;
          hu[k] = Math.random() < 0.05 ? PAL[(Math.random() * PAL.length) | 0] : -1; } } // ~5% con color, resto azul-blanco
      const sn = this._snow, hu = this._snowHue, tt = this._animT * 0.0009;
      const snEnd = (ultraQ ? 1280 : 740) * 4;                   // MÁXIMA: nieve completa (1280); alta: subconjunto (740); baja: nada
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
    if (this._sprCache && this._sprCache.size) this._evictSprites(); // soltar sprites de organismos muertos/fuera de vista
    // Componer la capa de organismos sobre el suelo.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.fx, 0, 0);
    // BLOOM de ORGANISMOS + BULBOS: copia desenfocada y aditiva → todo lo luminoso (halos, bulbos
    // de los señuelos, puntas) "sangra" luz. Da el aspecto bioluminiscente potente.
    if (cfg.render.glow && !lowQ) {
      this._bloomPass(this.fx, 0.4, 1.2);                          // bloom downsampled (#2)
      if (ultraQ) this._bloomPass(this.fx, 0.26, 3.5);             // MÁXIMA: 2º halo bioluminiscente AMPLIO
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
    // El LOD depende SOLO de calidad (lodMul) × ZOOM, no de la resolución. `lodSc` = tamaño aparente (referencia fija ×
    // zoom) → mover la Resolución cambia la nitidez, no el detalle. El dibujo real lo escala el ctx del buffer.
    const lodSc = LOD_REF * this.zoom;
    this._drawScale = lodSc;                       // escala del LOD (SIN resolución): TODAS las decisiones de detalle
    this._bufScale = this._scale();                // escala REAL del buffer (CON resolución) → SOLO suelos sub-píxel, no LOD
    const t = this._animT * 0.006;     // reloj de animación (congelado en pausa)
    const nodes = sim.nodes, heading = sim.heading, spd = sim.spd, tint = sim.tint, eye = sim.eye, face = sim.face, deco = sim.deco;
    // Umbrales de tamaño aparente por nivel: punto < dThr ≤ elipse barata < fullThr ≤ grafo completo (×lodMul en BAJA).
    const R = this.cfg.render, lowQ = R.quality === 'low', ultraFull = R.quality === 'ultra'; // MÁXIMA (ultraFull) = sin LOD: todo a grafo completo
    const lodMul = lowQ ? (R.lodLowMult || 2.6) : 1; // baja: umbrales más altos (más puntos/baratos); alta = 1. (Máxima ignora el LOD, ver ultraFull.)
    this._lodMul = lodMul;                           // los gates internos de _drawBodyGraph (onda/señuelo/textura/plano/contorno) aplican el MISMO multiplicador
    const dThr = R.lodBody * lodMul;            // punto ↔ cuerpo
    const fullThr = R.lodFull * lodMul;         // cuerpo BARATO (elipse) ↔ grafo completo
    const eThr = R.lodEye * lodMul;             // ojos (dentro del grafo)
    const haloThr = R.lodHalo * lodMul;         // halo por agente (los puntos no lo necesitan)
    // Caché de esqueleto (opt-in): se usa en todos los tier-2 y todas las calidades; conserva la ondulación (ver _skelEntry).
    const useSpr = R.spriteCache;
    const serial = sim.serial;
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
        case 'gene':    h = (1 - sim.geneSel[i]) * 120; s = 80; l = 52; break;      // VERDE(bajo)→amarillo→ROJO(alto) · mismo mapeo que histograma (charts.js) y leyenda (controls.js)
        case 'energy':  h = ef * 130; s = 85; l = 50; break;                         // rojo(hambre)→verde
        case 'role': {  // OFICIO trófico (worker: trophicRole, MISMO criterio que la curva): herbívoro/omnívoro/carroñero/cazador
          const ro = sim.role ? sim.role[i] : 0;
          if (ro === 2) { h = 5; s = 82; l = 56; }          // CAZADOR → rojo
          else if (ro === 1) { h = 30; s = 55; l = 50; }    // CARROÑERO → marrón
          else if (ro === 3) { h = 42; s = 87; l = 55; }    // OMNÍVORO → ámbar (igual que la curva de población)
          else { h = 128; s = 62; l = 50; }                 // HERBÍVORO → verde
          break;
        }
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
      const rPx = r * lodSc;                           // tamaño APARENTE (radio mundo × zoom × ref fija) → nivel de detalle (LOD). NO depende de la resolución.
      const hasNodes = nodes && nodes.length;
      const tier = !hasNodes ? 0 : ultraFull ? 2 : rPx < dThr ? 0 : rPx < fullThr ? 1 : 2; // 0 punto · 1 cuerpo barato · 2 grafo completo · MÁXIMA → siempre 2 (sin LOD)
      // HALO por agente: caro (un gradiente/bicho) → solo en calidad ALTA y para bichos no diminutos
      // (los puntos ya brillan con el bloom GLOBAL de la capa de organismos; no necesitan su propio halo).
      if (glow && !lowQ && (ultraFull || rPx > haloThr)) {
        // HALO pre-renderizado por CUBO DE TONO (#3) en vez de un createRadialGradient + fill por agente: drawImage
        // es mucho más barato. El radio y la INTENSIDAD siguen variando por agente (luminosidad → gr y globalAlpha);
        // el tono se cubica (±15°, imperceptible en un glow difuso). El bloom global sigue sumando sobre estos halos.
        const cLumG = deco ? deco[i * 7 + 0] : 0.35;   // LUMINOSIDAD: gen decorativo de deriva libre (sin runaway)
        const gr = r * (1.65 + cLumG * cLumG * 3.0); // halo algo mayor
        let a0 = 0.21 + cLumG * cLumG * 0.48; if (a0 > 1) a0 = 1; // intensidad por agente (vía globalAlpha)
        const spr = this._haloSprite(h);
        ctx.globalAlpha = a0;
        ctx.drawImage(spr, x - gr, y - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
      }
      // LOD de 3 niveles según tamaño en pantalla.
      if (tier === 2) {
        // GRAFO completo (cabeza+nodos, ojos, señuelo, onda). Con caché, `skel` = atlas del organismo → _drawBodyGraph pega
        // las celdas en vez de reconstruirlas (la onda sigue viva). skel=null → reconstrucción vectorial.
        const skel = useSpr ? this._skelEntry(serial ? serial[i] : i, rPx, r, h, s, l, nodes, i * (NODE_COUNT * NODE_STRIDE), deco, i * 7, eye, i * 4, tint, i) : null;
        this._drawBodyGraph(ctx, x, y, r, h, s, l, nodes, i * (NODE_COUNT * NODE_STRIDE), heading[i], spd[i], t,
                            eye, i * 4, face, i * 3, ultraFull || rPx > eThr, tint, i, deco, i * 7, skel);
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

  // Caché de esqueleto (opt-in): obtiene o hornea el atlas de un organismo (clave = serial). Rehornea al cambiar el cubo
  // de color o de tamaño; usa el atlas previo si se agota el presupuesto de horneado del frame.
  _skelEntry(key, rPx, r, h, s, l, nodes, no, deco, dco, eye, eo, tint, to) {
    const cache = this._sprCache || (this._sprCache = new Map());
    const pxOn = r * (this._bufScale || 1);                       // radio en píxeles REALES del buffer (nitidez)
    const sk = Math.max(6, Math.ceil(pxOn / 4) * 4);              // cubo de TAMAÑO (bandas de 4 px de buffer → no rehornea cada píxel)
    const ck = ((h / 15) | 0) * 4096 + ((s / 12) | 0) * 64 + ((l / 12) | 0); // cubo de COLOR (tono 15° · sat ~12 · luz ~12)
    let e = cache.get(key);
    if (!e || e.sk !== sk || e.ck !== ck) {
      // presupuesto de horneado agotado + hay atlas previo → úsalo este frame (se rehornea en los siguientes) → sin hitch
      if (!(this._sprBakes >= (this.cfg.render.spriteBakeBudget || 120) && e)) {
        e = this._bakeSkeleton(e, sk, rPx, r, h, s, l, nodes, no, deco, dco, eye, eo, tint, to);
        e.sk = sk; e.ck = ck; cache.set(key, e); this._sprBakes++;
      }
    }
    e.seen = this._sprFrame;
    return e;
  }

  // Hornea el atlas del organismo: por nodo, 2 celdas (contorno|cuerpo) vía _drawNode canónico (rot=0), + 1 celda DECO
  // (ojos+señuelo). La luz del gradiente se pre-rota −pa[k] para que el brillo quede consistente al rotar la celda.
  // Layout: 2 columnas (contorno | cuerpo) × filas de nodo, y la celda deco debajo.
  _bakeSkeleton(prev, sk, rPx, r, h, s, l, nodes, no, deco, dco, eye, eo, tint, to) {
    const Rc = this.cfg.render, lm = this._lodMul || 1, dens = sk / r, NS = NODE_COUNT;
    this._nodePositions(nodes, no, r);
    const pr = this._ngr, pl = this._ngl, pa = this._nga, pts = this._ngts, pres = this._ngp;
    const outW = Math.max(0.8, r * 0.07), full = Rc.quality === 'ultra'; // full=máxima (sin gates); ds=escala del LOD vivo
    const llx0 = -0.7, lly0 = 0.7;                                // luz CANÓNICA body-local (heading=0)
    const st = {
      coreLight: `hsl(${h},${Math.max(22, s - 16)}%,${Math.min(82, l + 18)}%)`,
      coreMid: `hsl(${h},${s}%,${Math.max(12, l - 3)}%)`,
      coreDark: `hsl(${h},${Math.min(100, s + 12)}%,${Math.max(4, l - 26)}%)`,
      coreOut: `hsl(${h},${Math.min(100, s + 6)}%,${Math.max(6, l - 22)}%)`,
      tex2: deco ? deco[dco + 6] : 0.5, inkLine: `hsla(${h},${Math.min(100, s + 8)}%,${Math.max(4, l - 16)}%,0.28)`,
      outW, full, lm, ds: rPx / r, lodOutline: Rc.lodOutline || 4, lodFlat: Rc.lodFlat || 5, lodTexture: Rc.lodTexture || 10, llx: llx0, lly: lly0,
    };
    // 1) medir cada celda de NODO (silueta + contorno): una fila por nodo, columnas contorno|cuerpo
    const cells = new Array(NS); let maxCW = 1, totH = 0;
    for (let k = 0; k < NS; k++) {
      if (!pres[k]) { cells[k] = null; continue; }
      const rxx = Math.max(0.6, pl[k]), ryy = Math.max(0.6, pr[k]), sh = (pts[k] - 0.5) * 2;
      let wB = ryy * (1.30 - sh * 0.95), wT = ryy * (1.30 + sh * 1.15); if (wB < 0.4) wB = 0.4; if (wT < 0.4) wT = 0.4;
      const halfX = rxx + outW, halfY = (wB > wT ? wB : wT) + outW;     // contorno = silueta + outW
      const cw = Math.ceil(2 * halfX * dens) + 2, ch = Math.ceil(2 * halfY * dens) + 2;
      cells[k] = { cw, ch, conY: totH, conX: 0, bodyX: 0 };
      if (cw > maxCW) maxCW = cw; totH += ch;
    }
    // 1b) medir la celda DECO (ojos + señuelo), con el MISMO gate que el render vivo. Frame head-local (origen=cabeza).
    const showEyes = full || rPx > (Rc.lodEye || 0) * lm, doLure = full || rPx > (Rc.lodLure || 0) * lm;
    const orn = tint ? tint[to] : 0, hr = pr[0], elong = pl[0] / pr[0];
    let dminX = 0, dmaxX = 0, dminY = 0, dmaxY = 0, hasDeco = false;
    if (showEyes && eye) {                                              // región de ojos (cíclope/par/racimo), generosa
      hasDeco = true; const er0 = Math.max(0.8, hr * (0.16 + 0.34 * eye[eo]));
      const ex = hr * elong * 0.9 + er0 * 1.5, ey = hr + er0 * 1.2;
      if (ex > dmaxX) dmaxX = ex; if (-er0 * 1.5 < dminX) dminX = -er0 * 1.5; if (ey > dmaxY) dmaxY = ey; if (-ey < dminY) dminY = -ey;
    }
    if (orn > 0.12 && deco && doLure) {                                // señuelo: tallo + bulbo + halo, al frente (+x)
      hasDeco = true; const plen = r * (0.5 + deco[dco + 2] * 5.5), bulbR = Math.max(0.6, r * (0.06 + deco[dco + 3] * 0.34)), br = bulbR * 1.5, ax0 = hr * elong * 0.85; // 1.5 cubre el br máx (0.9+0.4·orn)·pulso ≈ 1.48 → no recorta el halo
      const fwd = ax0 + plen + br * 4, side = plen * 0.55 + br * 4;
      if (fwd > dmaxX) dmaxX = fwd; if (side > dmaxY) dmaxY = side; if (-side < dminY) dminY = -side;
    }
    let decoW = 0, decoH = 0, decoAX = 0, decoAY = 0;
    if (hasDeco) { decoW = Math.ceil((dmaxX - dminX) * dens) + 2; decoH = Math.ceil((dmaxY - dminY) * dens) + 2; decoAX = -dminX * dens + 1; decoAY = -dminY * dens + 1; }
    // atlas: nodos arriba (2 cols × filas), celda DECO debajo (fila propia, puede ser más ancha por el señuelo)
    const aw = Math.max(maxCW * 2, decoW), ah = Math.max(1, totH + decoH), decoY = totH;
    let cv = prev && prev.cv;
    if (!cv || cv.width !== aw || cv.height !== ah) { cv = document.createElement('canvas'); cv.width = aw; cv.height = ah; }
    const actx = cv.getContext('2d'); actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, aw, ah);
    // 2) hornear cada nodo: contorno (col 0) + cuerpo (col maxCW), centrado en su celda; luz pre-rotada −pa[k]
    for (let k = 0; k < NS; k++) {
      const cel = cells[k]; if (!cel) continue;
      cel.bodyX = maxCW;
      const ca = Math.cos(pa[k]), sa = Math.sin(pa[k]);
      st.llx = llx0 * ca + lly0 * sa; st.lly = -llx0 * sa + lly0 * ca;  // rotar la luz por −pa[k]
      const rxx = Math.max(0.6, pl[k]), ryy = Math.max(0.6, pr[k]);
      for (let mode = 0; mode <= 1; mode++) {
        const ax = mode === 0 ? 0 : maxCW;
        actx.save();
        actx.beginPath(); actx.rect(ax, cel.conY, cel.cw, cel.ch); actx.clip();   // clip a la celda → sin bleed a vecinas
        actx.setTransform(dens, 0, 0, dens, ax + cel.cw / 2, cel.conY + cel.ch / 2); // centro de celda = centro del nodo
        this._drawNode(actx, st, 0, 0, 0, rxx, ryy, mode, pts[k]);                 // rot=0 CANÓNICO (se rota al pegar)
        actx.restore();
      }
    }
    // 2b) hornear la celda DECO (ojos+señuelo) ESTÁTICA: t=0 (sin pulso), face=null (mirada al frente), heading=0
    if (hasDeco) {
      actx.save();
      actx.setTransform(1, 0, 0, 1, 0, 0); actx.beginPath(); actx.rect(0, decoY, decoW, decoH); actx.clip();
      actx.setTransform(dens, 0, 0, dens, decoAX, decoY + decoAY);     // cabeza (0,0) → (decoAX, decoY+decoAY)
      this._drawDeco(actx, r, pr[0], pl[0], h, deco, dco, tint, to, 0, 0, null, 0, eye, eo, showEyes, doLure, dens);
      actx.restore();
    }
    return { cv, dens, cells, maxCW, deco: hasDeco ? { x: 0, y: decoY, w: decoW, h: decoH, ax: decoAX, ay: decoAY } : null, sk: 0, ck: 0, seen: this._sprFrame };
  }

  // Pega la celda DECO (ojos+señuelo horneados, estáticos) en el frame head-local (origen=cabeza, ya rotado por rumbo en
  // el ctx). Anclada en la cabeza (ax,ay) → cae donde el render vivo dibujaría ojos/señuelo. No-op si el organismo no tiene.
  _blitDeco(ctx, skel) {
    const d = skel.deco; if (!d) return;
    const inv = 1 / skel.dens;
    ctx.drawImage(skel.cv, d.x, d.y, d.w, d.h, -d.ax * inv, -d.ay * inv, d.w * inv, d.h * inv);
  }

  // Pega la celda cacheada del nodo k (contorno si mode 0, cuerpo si mode 1) centrada en (cx,cy) y rotada por `rot`, a
  // tamaño MUNDO (celda/dens) → sale a su tamaño real (downscale = nítido). Lo llama _drawBodyGraph en vez de _drawNode.
  _blitNode(ctx, skel, k, mode, cx, cy, rot) {
    const cel = skel.cells[k]; if (!cel) return;
    const inv = 1 / skel.dens, ax = mode === 0 ? 0 : skel.maxCW, cw = cel.cw, ch = cel.ch;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.drawImage(skel.cv, ax, cel.conY, cw, ch, -cw * 0.5 * inv, -ch * 0.5 * inv, cw * inv, ch * inv);
    ctx.restore();
  }

  // Reconstruye las posiciones en REPOSO de los nodos (cabeza en el origen, mirando +x) recorriendo padres → rellena los
  // scratch this._ng* (compartidos). La onda/flexión se aplica DESPUÉS al dibujar. ÚNICA fuente de la geometría: la usan
  // _drawBodyGraph (para dibujar) y _bakeSkeleton (para medir/hornear las celdas de nodo) → no pueden divergir.
  _nodePositions(nodes, no, r) {
    const NS = NODE_COUNT, ST = NODE_STRIDE;
    const px = this._ngx || (this._ngx = new Float32Array(NS));   // posiciones en REPOSO (sin onda)
    const py = this._ngy || (this._ngy = new Float32Array(NS));
    const pr = this._ngr || (this._ngr = new Float32Array(NS));   // radio transversal
    const pl = this._ngl || (this._ngl = new Float32Array(NS));   // longitud (eje)
    const pa = this._nga || (this._nga = new Float32Array(NS));   // ángulo de emisión en reposo
    const pts = this._ngts || (this._ngts = new Float32Array(NS)); // tipShape por nodo (silueta base↔punta)
    const pres = this._ngp || (this._ngp = new Uint8Array(NS));
    const par = this._ngpar || (this._ngpar = new Int8Array(NS));  // índice del padre (−1 = raíz)
    const dep = this._ngdep || (this._ngdep = new Uint8Array(NS)); // profundidad en el grafo (fase de la onda)
    // RAÍZ (cabeza): en el origen, mirando al frente (+x); el rumbo ya lo aplica el ctx.rotate al dibujar.
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
      const dist = (pr[p] + cr) * (0.85 + nodes[nb + 5] * 0.5);   // anclaje al padre: suelo alto (0.85) → no queda ENTERRADO bajo el padre
      px[k] = px[p] + Math.cos(emit) * dist; py[k] = py[p] + Math.sin(emit) * dist;
      pr[k] = cr; pl[k] = ln; pa[k] = emit; pts[k] = nodes[nb + 8]; // tipShape (silueta)
    }
  }

  // Evicción por MUERTE (no por visibilidad): cada ~60 frames suelta los serials que ya no están vivos → los vivos siguen
  // cacheados aunque salgan de vista (sin rehornear al panear). + techo duro de entradas (memoria acotada).
  _evictSprites() {
    const cache = this._sprCache, cap = this.cfg.render.spriteCacheCap || 2400;
    if ((this._sprFrame % 60) === 0 && this.sim.serial) {
      const set = this._aliveSet || (this._aliveSet = new Set()); set.clear();
      const ser = this.sim.serial, n = this.sim.activeCount; for (let a = 0; a < n; a++) set.add(ser[a]);
      for (const k of cache.keys()) if (!set.has(k)) cache.delete(k);
    }
    if (cache.size > cap) { const arr = [...cache].sort((a, b) => a[1].seen - b[1].seen), drop = cache.size - cap; for (let q = 0; q < drop; q++) cache.delete(arr[q][0]); } // backstop de memoria
  }

  // Silueta del nodo (Capa 1): forma base↔punta según tipShape. Curva cerrada simétrica al eje; wB/wT = medio-ancho
  // base/punta. Afilar (<0.5) engorda base y afila punta; abrir (>0.5) al revés; 0.5 ≈ elipse. Pinta en coords del
  // cuerpo (rot+centro) → el gradiente/luz quedan coherentes sin rotar el canvas.
  _silPath(ctx, cx, cy, rot, L, wB, wT) {
    const cR = Math.cos(rot), sR = Math.sin(rot);
    const X = (lx, ly) => cx + lx * cR - ly * sR, Y = (lx, ly) => cy + lx * sR + ly * cR;
    ctx.beginPath();
    ctx.moveTo(X(-L, 0), Y(-L, 0));
    ctx.bezierCurveTo(X(-L * 0.5, wB), Y(-L * 0.5, wB), X(L * 0.5, wT), Y(L * 0.5, wT), X(L, 0), Y(L, 0));
    ctx.bezierCurveTo(X(L * 0.5, -wT), Y(L * 0.5, -wT), X(-L * 0.5, -wB), Y(-L * 0.5, -wB), X(-L, 0), Y(-L, 0));
    ctx.closePath();
  }

  // Dibuja UN nodo. `st` = estilo del organismo (colores de relieve, dir de luz, textura, gates LOD; ver _drawBodyGraph).
  // mode 0 = contorno oscuro (va detrás), 1 = cuerpo (gradiente + bandas). Lo usan el render vivo y el horneado del caché.
  _drawNode(ctx, st, cx, cy, rot, rxx, ryy, mode, tip) {
    const sShape = (tip - 0.5) * 2;                          // −1 afila .. +1 abre
    let wB = ryy * (1.30 - sShape * 0.95);                   // medio-ancho base (afilar engorda)
    let wT = ryy * (1.30 + sShape * 1.15);                   // medio-ancho punta (abrir engorda)
    if (wB < 0.4) wB = 0.4; if (wT < 0.4) wT = 0.4;
    const nodePx = rxx * st.ds;                              // tamaño del nodo (px aparentes = lodScale) → gatea detalles invisibles
    if (mode === 0) {                                        // PASADA contorno (outline oscuro): misma silueta agrandada
      if (!st.full && nodePx < st.lodOutline * st.lm) return; // invisible en nodos diminutos → se omite
      ctx.fillStyle = st.coreOut;
      this._silPath(ctx, cx, cy, rot, rxx + st.outW, wB + st.outW, wT + st.outW); ctx.fill();
    } else {                                                 // PASADA cuerpo: volumen (gradiente) + textura
      if (!st.full && nodePx < st.lodFlat * st.lm) { ctx.fillStyle = st.coreMid; } // relleno PLANO en nodos pequeños (imperceptible, ahorra el gradiente)
      else {
        const rad = Math.max(rxx, wB, wT);
        const g = ctx.createRadialGradient(cx + st.llx * rxx * 0.5, cy + st.lly * ryy * 0.5, rad * 0.12, cx, cy, rad * 1.05);
        g.addColorStop(0, st.coreLight); g.addColorStop(0.55, st.coreMid); g.addColorStop(1, st.coreDark);
        ctx.fillStyle = g;
      }
      this._silPath(ctx, cx, cy, rot, rxx, wB, wT); ctx.fill();
      if (st.full || rxx * st.ds > st.lodTexture * st.lm) {   // TEXTURA: bandas transversales sutiles (clip a la silueta)
        ctx.save(); this._silPath(ctx, cx, cy, rot, rxx, wB, wT); ctx.clip();
        const nb2 = 2 + ((st.tex2 * 4) | 0), cr2 = Math.cos(rot), sr2 = Math.sin(rot), wMax = wB > wT ? wB : wT;
        ctx.strokeStyle = st.inkLine; ctx.lineWidth = Math.max(0.6, ryy * 0.16);
        for (let bI = 1; bI < nb2; bI++) {
          const u = bI / nb2 - 0.5, ox = cr2 * u * 2 * rxx, oy = sr2 * u * 2 * rxx;
          ctx.beginPath(); ctx.ellipse(cx + ox, cy + oy, wMax * 0.95, wMax * 0.55, rot + 1.5708, 0, 6.2832); ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // Señuelo + ojos del morro, en el frame head-local (origen = cabeza, +x = rumbo). Lo usan el render vivo y el horneado
  // del caché. `t` anima el sway/pulso del señuelo y `face` la pupila; el horneado los pasa neutros (t=0, face=null) → estático.
  _drawDeco(ctx, r, pr0, pl0, h, deco, dco, tint, to, t, heading, face, fo, eye, eo, showEyes, doLure, ds) {
    const orn = tint ? tint[to] : 0;
    if (orn > 0.12 && deco && doLure) {
      const oLen = deco[dco + 2], oBulb = deco[dco + 3], oHue = deco[dco + 4], oNum = deco[dco + 5];
      const fmin = (px) => px / ds;
      const hr = pr0, elong = pl0 / pr0;
      const np = 1 + ((oNum * oNum * 6) | 0);
      const plen = r * (0.5 + oLen * 5.5);
      const ohue = h;
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
        const N = 6;   // buffers REUTILIZABLES (sin asignar 2 arrays + 14 pares [x,y] por señuelo y frame en el camino sin caché)
        const sgLx = this._sgLx || (this._sgLx = new Float32Array(N + 1)), sgLy = this._sgLy || (this._sgLy = new Float32Array(N + 1));
        const sgRx = this._sgRx || (this._sgRx = new Float32Array(N + 1)), sgRy = this._sgRy || (this._sgRy = new Float32Array(N + 1));
        for (let i = 0; i <= N; i++) {
          const u = i / N, iu = 1 - u;
          const xx = iu * iu * bx + 2 * iu * u * cx2 + u * u * tx, yy = iu * iu * by + 2 * iu * u * cy2 + u * u * ty;
          const tgx = 2 * iu * (cx2 - bx) + 2 * u * (tx - cx2), tgy = 2 * iu * (cy2 - by) + 2 * u * (ty - cy2);
          const tl = Math.hypot(tgx, tgy) || 1, lx = -tgy / tl, ly = tgx / tl, w = (wB * iu + wT * u) / 2;
          sgLx[i] = xx + lx * w; sgLy[i] = yy + ly * w; sgRx[i] = xx - lx * w; sgRy[i] = yy - ly * w;
        }
        const sg = ctx.createLinearGradient(bx, by, tx, ty);
        sg.addColorStop(0, `hsl(${ohue},55%,26%)`); sg.addColorStop(1, `hsl(${ohue},92%,64%)`);
        ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(sgLx[0], sgLy[0]);
        for (let i = 1; i <= N; i++) ctx.lineTo(sgLx[i], sgLy[i]);
        for (let i = N; i >= 0; i--) ctx.lineTo(sgRx[i], sgRy[i]);
        ctx.closePath(); ctx.fill();
        const pulse = 1 + 0.14 * Math.sin(t * 1.6 + p * 1.3) * orn;
        const br = bulbR * (0.9 + 0.4 * orn) * pulse, h2 = bulbHue;
        const hg = ctx.createRadialGradient(tx, ty, 0, tx, ty, br * 4);
        hg.addColorStop(0, `hsla(${h2},96%,76%,0.5)`); hg.addColorStop(0.3, `hsla(${h2},95%,68%,0.22)`);
        hg.addColorStop(0.78, `hsla(${h2},95%,64%,0.07)`); hg.addColorStop(1, `hsla(${h2},95%,64%,0)`);
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(tx, ty, br * 4, 0, 6.2832); ctx.fill();
        const bg2 = ctx.createRadialGradient(tx - br * 0.35, ty - br * 0.4, br * 0.1, tx, ty, br);
        bg2.addColorStop(0, `hsl(${h2},95%,84%)`); bg2.addColorStop(1, `hsl(${(h2 + 20) % 360},90%,50%)`);
        ctx.fillStyle = bg2; ctx.beginPath(); ctx.arc(tx, ty, br, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(tx - br * 0.3, ty - br * 0.34, br * 0.3, 0, 6.2832); ctx.fill();
      }
    }
    if (showEyes && eye) {
      const senseG = eye[eo], cEye = eye[eo + 2], atkDrive = eye[eo + 3];
      const hr = pr0, elong = pl0 / pr0;
      const er0 = Math.max(0.8, hr * (0.16 + 0.34 * senseG));
      const nEye = senseG < 0.3 ? 1 : senseG < 0.72 ? 2 : 4 + ((senseG - 0.72) * 12 | 0);
      const iHue = (((h + (cEye - 0.5) * 70) % 360) + 360) % 360;
      const aspectY = 1 - atkDrive * 0.4;
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
      const fx = hr * elong * 0.45;
      if (nEye === 1) drawEye(fx, 0, er0 * 1.2);
      else if (nEye === 2) { for (let e = 0; e < 2; e++) { const sgn = e ? -1 : 1; drawEye(fx, sgn * hr * 0.55, er0); } }
      else {
        const er = er0 * 0.6, pairs = nEye >> 1;
        for (let p = 0; p < pairs; p++) {
          const tt = pairs > 1 ? p / (pairs - 1) : 0.5, aa = 0.5 + tt * 0.8, dd = hr * (0.4 + tt * 0.4);
          const cx = Math.cos(aa) * dd * elong, cy = Math.sin(aa) * dd;
          drawEye(cx, cy, er); drawEye(cx, -cy, er);
        }
        if (nEye & 1) drawEye(fx, 0, er);
      }
    }
  }

  // B2b (EN CONSTRUCCIÓN): dibuja el cuerpo desde el GRAFO DE NODOS (una sola primitiva). Reconstruye las
  // posiciones recorriendo padres (la física no las necesita; el render sí) y dibuja cada nodo como una
  // elipse orientada: aspecto bajo → lóbulo redondo; alto → tentáculo alargado. Nodo lateral → par espejado.
  // PRIMER INCREMENTO: sin ojos/textura/señuelo/contorno fino aún (llegan en incrementos siguientes). El
  // glow ya lo pinta _drawAgents fuera. nodes[no + k*ST + f]: 0 present,1 parent,2 size,3 aspect,4 angle,5 attach.
  _drawBodyGraph(ctx, x, y, r, h, s, l, nodes, no, heading, spd, t, eye, eo, face, fo, showEyes, tint, to, deco, dco, skel) {
    const NS = NODE_COUNT, ST = NODE_STRIDE;
    // LOD INTERNO (rPx = radio en pantalla): detalles caros solo a tamaño suficiente. En el retrato (_drawScale=1
    // y r grande) rPx es enorme → todo activo. `lodWave`=onda viajera + 2ª pasada de contorno; `lodLure`=señuelo.
    const Rc = this.cfg.render, rPxG = r * (this._drawScale || 1), lm = this._lodMul || 1; // lm = multiplicador de calidad (los gates lo aplican igual que el tier)
    const full = this._forceFull === true || Rc.quality === 'ultra'; // RETRATO (drawPortrait) o calidad MÁXIMA → sin recortes LOD internos (onda/señuelo/textura/gradiente/contorno): todo a pelo.
    const doWave = full || rPxG > (Rc.lodWave || 0) * lm;    // ONDA = solo el MOVIMIENTO (flexión); el contorno se dibuja SIEMPRE (ya no atado a esto). Si no: cuerpo en reposo.
    const doLure = full || rPxG > (Rc.lodLure || 0) * lm;
    this._nodePositions(nodes, no, r);                            // posiciones en REPOSO (cabeza en origen); la onda se aplica luego al dibujar
    const px = this._ngx, py = this._ngy, pr = this._ngr, pl = this._ngl, pa = this._nga, pts = this._ngts, pres = this._ngp, par = this._ngpar, dep = this._ngdep;
    ctx.save(); ctx.translate(x, y); ctx.rotate(heading);
    // VOLUMEN (B2b incremento 4): colores de relieve del render clásico + luz desde arriba-izq del MUNDO,
    // pasada a este frame local (rota −heading) para que el brillo sea coherente sea cual sea el rumbo.
    // Estilo de nodo (constante por organismo) para _drawNode. Solo se construye SIN caché: con caché (skel) las celdas
    // ya están horneadas y `st` no se usa → así NO creamos 5 strings HSL por organismo y frame en el camino por DEFECTO.
    let st = null;
    if (!skel) {
      const coreLight = `hsl(${h},${Math.max(22, s - 16)}%,${Math.min(82, l + 18)}%)`;
      const coreMid = `hsl(${h},${s}%,${Math.max(12, l - 3)}%)`;
      const coreDark = `hsl(${h},${Math.min(100, s + 12)}%,${Math.max(4, l - 26)}%)`;
      const coreOut = `hsl(${h},${Math.min(100, s + 6)}%,${Math.max(6, l - 22)}%)`;
      const chh = Math.cos(heading), shh = Math.sin(heading);
      const llx = -0.7 * chh + -0.7 * shh, lly = 0.7 * chh + -0.7 * shh; // dir de luz (mundo -0.7,-0.7) → local
      const tex2 = deco ? deco[dco + 6] : 0.5;
      const ds = this._drawScale || 1, outW = Math.max(0.8, r * 0.07);
      const inkLine = `hsla(${h},${Math.min(100, s + 8)}%,${Math.max(4, l - 16)}%,0.28)`;
      st = { coreLight, coreMid, coreDark, coreOut, llx, lly, tex2, inkLine, outW, full, lm, ds,
             lodOutline: Rc.lodOutline || 4, lodFlat: Rc.lodFlat || 5, lodTexture: Rc.lodTexture || 10 };
    }
    // ---- ONDA VIAJERA (B2b): la flexión se ACUMULA del padre al hijo → cadena articulada (anguila). La
    // cabeza (raíz, prof. 0) queda estable; la cola ondula más (fase por profundidad). Nada más rápido = más onda.
    const wpx = this._ngwx || (this._ngwx = new Float32Array(NS));
    const wpy = this._ngwy || (this._ngwy = new Float32Array(NS));
    const acc = this._ngac || (this._ngac = new Float32Array(NS));  // flexión acumulada hasta el nodo
    const waveT = t * (1 + spd * 6), jointAmp = 0.18 * (0.45 + spd * 1.6);   // freq/amp ∝ velocidad ABSOLUTA (spd ya va ÷ vMax) → lento = ondear suave, rápido = batir vigoroso. Recalibrado (antes 2.5 / 0.4+0.8 con spd relativo a la capacidad propia).
    const oscFloor = this.cfg.loco.oscFloor;                      // mismo suelo de amplitud que la física
    wpx[0] = 0; wpy[0] = 0; acc[0] = 0;
    for (let k = 1; k < NS; k++) {
      if (!pres[k]) continue;
      const p = par[k], nb = no + k * ST;
      let bend = 0;
      if (doWave) {                                              // LOD: a tamaño pequeño, cuerpo en REPOSO (sin onda)
        // ONDULAR vs ALETEAR (Capa 3, SOLO render): el modo se MEZCLA por intensidad de aleteo (gaitMode ponderado
        // a lo lateral, sin²(emit) — las aletas baten, las colas ondulan). ONDULAR = onda viajera suave del cuerpo
        // (desfase por profundidad → ripple de anguila). ALETEAR = batido RÁPIDO, AMPLIO, ASIMÉTRICO (golpe de
        // potencia + recuperación lenta) y DESACOPLADO de la onda del cuerpo (sin desfase por profundidad → la
        // aleta bate "a su ritmo" mientras el cuerpo planea). La onda ya pivota cada nodo sobre su padre (=eje de la aleta).
        const phK = nodes[nb + 7] * 6.283185307;                 // fase por nodo (osc_phase)
        const ampK = jointAmp * (oscFloor + (1 - oscFloor) * nodes[nb + 6]);
        const se = Math.sin(pa[k]), flap = nodes[nb + 9] * se * se; // intensidad de aleteo (0 = ondular puro)
        const bU = Math.sin(waveT - dep[k] * 1.1 - phK) * ampK;  // ONDULAR
        if (flap > 0.001) {
          const flapFreq = 2.4, flapBeat = 2.6;                  // más rápido y más amplio
          const xf = waveT * flapFreq - phK;
          const bF = Math.sin(xf - 0.6 * Math.sin(xf)) * ampK * (1 + flapBeat); // ALETEAR: seco/asimétrico (potencia+recuperación)
          bend = bU * (1 - flap) + bF * flap;                    // mezcla ondular↔aletear
        } else bend = bU;
      }
      acc[k] = acc[p] + bend;                                     // acumula la flexión del padre + la propia
      const rdx = px[k] - px[p], rdy = py[k] - py[p], ca = Math.cos(acc[k]), sa = Math.sin(acc[k]);
      wpx[k] = wpx[p] + rdx * ca - rdy * sa; wpy[k] = wpy[p] + rdx * sa + rdy * ca; // gira el segmento padre→hijo
    }
    // GIRO visible (solo render, pista del "remado"): al girar (la MIRADA difiere del RUMBO) las aletas LATERALES
    // se inclinan asimétricamente (una rema más que la otra) hacia el giro pretendido → se VE que el cuerpo gira con
    // sus segmentos. NO toca la física (el giro real sigue siendo el de sim.js). gaze−heading = cuánto quiere girar.
    let turnLean = 0;
    if (face) {
      const gx = face[fo], gy = face[fo + 1];
      if (gx || gy) {
        let d = Math.atan2(gy, gx) - heading;
        while (d > 3.14159) d -= 6.28318; while (d < -3.14159) d += 6.28318;
        if (d > 1) d = 1; else if (d < -1) d = -1;                // acota a ±1 rad
        turnLean = d * 0.5;                                       // ganancia del remado (solo visual)
      }
    }
    for (let mode = 0; mode <= 1; mode++) {                        // 2 pasadas SIEMPRE: 0 = CONTORNO (outline, va con el grafo; gateado por nodo vía lodOutline), 1 = CUERPO. El contorno ya NO depende de la onda.
      for (let k = NS - 1; k >= 0; k--) {                         // de atrás (hojas) hacia delante (raíz encima)
        if (!pres[k]) continue;
        const lateral = k > 0 && Math.min(pa[k], Math.PI - pa[k]) > EPS_AXIS; // mismo umbral que la física (bodyplan.js)
        const baseRot = pa[k] + acc[k];                           // orientación del nodo = reposo + onda acumulada
        for (let sgn = 1; sgn >= (lateral ? -1 : 1); sgn -= 2) {  // sgn=−1 = reflejo bilateral (y y rotación)
          const rot = baseRot * sgn + (lateral ? turnLean * sgn : 0); // remado: aletas laterales se inclinan hacia el giro
          if (skel) this._blitNode(ctx, skel, k, mode, wpx[k], wpy[k] * sgn, rot);   // CACHÉ: pega la celda del nodo (la onda/rumbo van en cx,cy,rot → conserva ondulación)
          else this._drawNode(ctx, st, wpx[k], wpy[k] * sgn, rot, Math.max(0.6, pl[k]), Math.max(0.6, pr[k]), mode, pts[k]);
        }
      }
    }
    // SEÑUELO + OJOS del morro: con caché → celda DECO horneada (estática: gaze/pulso fijos); sin caché → _drawDeco vivo.
    if (skel) this._blitDeco(ctx, skel);
    else this._drawDeco(ctx, r, pr[0], pl[0], h, deco, dco, tint, to, t, heading, face, fo, eye, eo, showEyes, doLure, this._bufScale || this._drawScale || 1);
    ctx.restore();
  }


  // Retrato del organismo seleccionado para el inspector: dibuja el bicho centrado en un canvas
  // pequeño a partir de su genoma completo. Reutiliza _drawBodyGraph (mismo aspecto que en el mundo).
  drawPortrait(pctx, genes, t, ef, headingArg, spdArg, atkArg) {   // heading/spd/atk opcionales → orienta, ondula y entorna el ojo IGUAL que en el mundo
    const cw = pctx.canvas.width, ch = pctx.canvas.height;
    pctx.clearRect(0, 0, cw, ch);
    if (!genes) return;
    this._drawScale = 1; this._bufScale = 1; this._lodMul = 1; // el retrato dibuja en píxeles directos (sin transform) → ojo grande → detalle completo (y _forceFull salta gates igualmente)
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
    this._forceFull = true;                              // retrato = vista de DETALLE: sin recortes LOD (señuelo/"antenas", 2ª pasada de contorno, textura), pase el canvas el tamaño que pase
    this._drawBodyGraph(pctx, px, py, r, h, s, l, genes, G.n0_present, heading, pspd, t, eye, 0, face, 0, true, tint, 0, pdeco, 0);
    this._forceFull = false;
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
