// Motor de simulación: estado SoA, pool de agentes, bucle de ticks.
// Sin asignaciones en el bucle caliente. Independiente del render (movible a Worker).

import { World } from './world.js';
import { makeRng } from '../util/rng.js';
import { NUM_GENES, G, copyMutated, crossover, geneticDistance, BRAIN0, BRAIN, seedBrain, NODE_COUNT } from './genome.js';
import { computePhenotype } from './organism.js';

export class Sim {
  constructor(cfg) {
    this.cfg = cfg;
    this.reset(cfg.pop.seed);
  }

  reset(seed) {
    const cfg = this.cfg;
    this.seed = seed;
    this.rng = makeRng(seed);
    this.world = new World(cfg, this.rng);

    const cap = cfg.pop.maxAgents;
    this.cap = cap;
    this.world.setCapacity(cap);

    // --- Estado dinámico (SoA) ---
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.E = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.cooldown = new Float32Array(cap);
    this.alive = new Uint8Array(cap);
    // Linaje: id del fundador ancestral (heredado SIN mutación → ascendencia auditable).
    // generation: profundidad genealógica (gen del padre + 1).
    this.lineage = new Int32Array(cap);
    this.generation = new Int32Array(cap);
    // Tiempo de manejo: enfriamiento tras atacar (el depredador "digiere"; limita la
    // tasa de depredación → evita que un cazador limpie una zona y permite coexistencia).
    this.attackCD = new Float32Array(cap);

    // --- Genoma (SoA: cap * NUM_GENES) ---
    this.genes = new Float32Array(cap * NUM_GENES);

    // Buffers del cerebro neuronal (escratch reutilizable, sin GC en el bucle).
    this._brIn = new Float32Array(BRAIN.I);
    this._brHid = new Float32Array(BRAIN.H);
    this._brOut = new Float32Array(BRAIN.O);
    // MEMORIA del cerebro recurrente: estado oculto que PERSISTE entre ticks, por agente (id estable).
    // Se pone a cero al nacer (el recién nacido arranca "sin recuerdos"). Cero al reset.
    this.brainHid = new Float32Array(cap * BRAIN.H);

    // --- Fenotipo cacheado (expresión fija durante la vida) ---
    this.radius = new Float32Array(cap);
    this.vmax = new Float32Array(cap);     // velocidad-capacidad (emerge de la morfología · esfuerzo)
    this.turnRate = new Float32Array(cap); // agilidad de giro (emerge de asimetría/tamaño/elongación)
    this.heading = new Float32Array(cap);  // rumbo PERSISTENTE (rad) para el render: se conserva cuando v≈0
                                           //   (recién nacido/sembrado/tope) → evita el "salto al este" de atan2(0,0)
    this.effort = new Float32Array(cap);   // esfuerzo de nado (gen speed) → modula el coste de moverse
    this.senseR = new Float32Array(cap);   // alcance visual efectivo (emerge de sense · e_fov)
    this.visCos = new Float32Array(cap);   // cos(semiángulo del cono de visión) → visión direccional
    this.gazeX = new Float32Array(cap);    // dirección de la mirada (a la presa/amenaza, si no al frente)
    this.gazeY = new Float32Array(cap);    // — solo para el render (pupila reactiva), no afecta a la sim
    this.eMax = new Float32Array(cap);
    this.baseCost = new Float32Array(cap);
    this.lure = new Float32Array(cap);     // prominencia del señuelo (anglerfish): coste + alcance de caza
    this.absEff = new Float32Array(cap);
    this.effHerb = new Float32Array(cap);
    this.effCarn = new Float32Array(cap);
    this.investE = new Float32Array(cap);
    this.reproNeedE = new Float32Array(cap);
    this.wFood = new Float32Array(cap);
    this.wPrey = new Float32Array(cap);
    this.wFlee = new Float32Array(cap);
    this.diet = new Float32Array(cap);
    this.aggro = new Float32Array(cap);
    this.hue = new Float32Array(cap);
    this.tempPref = new Float32Array(cap);

    // --- Pool (free stack) + lista activa ---
    this.free = new Int32Array(cap);
    for (let i = 0; i < cap; i++) this.free[i] = cap - 1 - i; // pila: pop da 0,1,2...
    this.freeTop = cap;
    this.active = new Int32Array(cap);
    this.activeCount = 0;
    this.popCount = 0;

    this.tick = 0;
    this.births = 0;
    this.deaths = 0;
    this.nextLineageId = 0;
    this.kills = 0; // presas abatidas por depredación (instrumentación)
    // Causas de muerte ACUMULADAS de los carnívoros (diet > 0.5), para el diagnóstico del laboratorio:
    // 'combat' = murió atacando (ataque fallido), 'starv' = inanición, 'age' = vejez, 'eaten' = lo cazaron.
    this.carnDeath = { starv: 0, combat: 0, age: 0, eaten: 0 };

    this._seedInitial();
    this._rebuildActive();
  }

  _alloc() {
    if (this.freeTop === 0) return -1;
    const i = this.free[--this.freeTop];
    this.alive[i] = 1;
    this.popCount++;
    return i;
  }

  _kill(i, cause) {
    if (cause && this.diet[i] > 0.5) this.carnDeath[cause]++; // diagnóstico: causa de muerte carnívora
    this.alive[i] = 0;
    this.free[this.freeTop++] = i;
    this.popCount--;
    this.deaths++;
  }

  _seedInitial() {
    if (this.cfg.pop.simpleStart) { this._seedSimple(); return; }
    const cfg = this.cfg, rng = this.rng, W = cfg.world;
    const dietLow = cfg.pop.seedDietLow;
    const nCarn = cfg.combat.enabled ? (cfg.pop.initial * cfg.pop.carnivoreSeedFrac) | 0 : 0;
    for (let n = 0; n < cfg.pop.initial; n++) {
      const i = this._alloc();
      if (i < 0) break;
      // Genoma inicial: cada gen uniforme [0,1] e independiente.
      const b = i * NUM_GENES;
      for (let k = 0; k < NUM_GENES; k++) this.genes[b + k] = rng.next();
      // CONDICIÓN INICIAL (no estrategia codificada): solo fija el reparto de partida de
      // genes; la conducta sigue emergiendo por selección sobre esos genes.
      if (dietLow) {
        this.genes[b + G.diet] = rng.next() * 0.15;          // Fase 1: arranque herbívoro suave
      } else if (n < nCarn) {
        // Cohorte proto-carnívora coordinada: siembra el nicho depredador para cruzar el
        // "valle de fitness" entre herbívoro y cazador eficaz. Luego la selección decide.
        this.genes[b + G.diet]   = 0.75 + rng.next() * 0.25;
        this.genes[b + G.speed]  = 0.5 + rng.next() * 0.4;   // esfuerzo alto: rema fuerte para cazar
        this.genes[b + G.size]   = 0.3 + rng.next() * 0.2;   // solo lo justo para superar a la presa
        this.genes[b + G.aggro]  = 0.6 + rng.next() * 0.4;
        this.genes[b + G.w_prey] = 0.6 + rng.next() * 0.4;
        this.genes[b + G.sense]  = 0.4 + rng.next() * 0.4;
        this.genes[b + G.w_food] = rng.next() * 0.2;
        this.genes[b + G.repro_thr] = rng.next() * 0.25; // se reproduce a ~media energía
        this.genes[b + G.invest]    = 0.1 + rng.next() * 0.3;
        this.genes[b + G.e_fov]   = rng.next() * 0.35;       // ojos frontales de largo alcance (cazador)
        // La FORMA nadadora cazadora EMERGE de los nodos (genes de nodo aleatorios del init); aquí solo ecología.
      } else {
        // Guild herbívoro: dieta y agresión bajas (donde la selección los llevaría igualmente).
        // Sembrarlos pacíficos evita una masacre intraespecífica en el transitorio inicial.
        this.genes[b + G.diet] = rng.next() * 0.2;
        this.genes[b + G.aggro] = rng.next() * 0.15;
        this.genes[b + G.size] = rng.next() * 0.3; // presa pequeña al inicio: el cazador coge ventaja
      }
      seedBrain(this.genes, i, rng); // arranque competente del cerebro (solo importa en modo neural)
      computePhenotype(this, i);
      this.x[i] = rng.next() * W.width;
      this.y[i] = rng.next() * W.height;
      this.vx[i] = 0; this.vy[i] = 0;
      this.heading[i] = rng.next() * 6.283185307; // rumbo inicial aleatorio (sin él, mirarían todos al este el 1er frame)
      this.E[i] = 0.5 * this.eMax[i];
      this.age[i] = 0;
      this.cooldown[i] = (rng.next() * cfg.repro.cooldown) | 0; // desincronizar reproducción
      this.lineage[i] = this.nextLineageId++; // cada fundador inicia su propio linaje
      this.generation[i] = 0;
    }
  }

  // Sembrado SENCILLO (config.pop.simpleStart): todos los fundadores parten de una misma línea base de
  // organismo SIMPLE (pequeño, simétrico, 1 segmento, sin módulos/ramas, cabeza/ojos lisos, sin cresta,
  // herbívoro tranquilo) con un pequeño jitter aleatorio. Como NO se siembra el morfoespacio entero de
  // golpe, la complejidad y la apariencia EMERGEN por evolución, y cada ejecución (semilla aleatoria →
  // nube inicial distinta) diverge por un camino diferente. NO codifica conducta: solo la condición inicial.
  _seedSimple() {
    const cfg = this.cfg, rng = this.rng, W = cfg.world;
    const nCarn = cfg.combat.enabled ? (cfg.pop.initial * cfg.pop.carnivoreSeedFrac) | 0 : 0;
    // DIVERSIDAD DE SEMBRADO (UI, slider junto a "Sembrar"): 0 = monótono (fundadores casi idénticos a su línea
    // base) · 1 = variado (el sembrado actual). Escala el jitter de los genes base Y la dispersión de los genes
    // decorativos (vía blend), así un único knob va de super monótono a super variado.
    const div = cfg.pop.startDiversity != null ? cfg.pop.startDiversity : 1;
    const J = cfg.pop.startJitter * div;                  // jitter ∝ diversidad
    // PALETA POR EJECUCIÓN: bases aleatorias compartidas por los fundadores → cada run tiene un colorido
    // COHERENTE y distinto. Saturación y luminosidad sesgadas a BAJO (cuadrado) → la mayoría de runs son
    // apagados/neutros; los vivos/luminosos son raros. La diversidad cromática emerge ENTRE runs, no dentro.
    // El tono base del sembrado EVITA el verde (la franja 70-180° del render): se muestrea el arco no-verde
    // [180°..70° por el lado largo] y se pasa a gen (÷360). En el mundo el render permite TODO color, así que el
    // verde puede EMERGER por deriva; solo se evita al ARRANCAR (un mundo recién sembrado nunca nace verde).
    const baseHue = ((180 + rng.next() * 250) % 360) / 360;
    const baseOhue = rng.next();                          // tono base del bulbo del señuelo (acento por run)
    const baseApp = rng.next(), baseTip = rng.next();     // matices base de apéndices/puntas (coherentes por run)
    // Bases per-run de los genes decorativos de DISPERSIÓN (segmentos, piel, glow, color). blend() interpola
    // entre la base compartida (div=0 → todos iguales) y la muestra individual (div=1 → variado actual).
    // c_lum (glow + luminosidad) y c_sat (color): sembrado MÁS ALTO (0.3/0.25 + cola) → organismos más
    // luminosos, con glow visible y menos grises. Antes (rng·rng ≈ 0.25) salían oscuros/apagados.
    const baseTex2 = rng.next();
    const baseLum = 0.4 + rng.next() * rng.next() * 0.5, baseSat = 0.32 + rng.next() * rng.next() * 0.55;
    const blend = (base, sample) => base + (sample - base) * div;
    const jit = (v) => { const x = v + rng.gaussian() * J; return x < 0 ? 0 : x > 1 ? 1 : x; };
    for (let n = 0; n < cfg.pop.initial; n++) {
      const i = this._alloc();
      if (i < 0) break;
      const b = i * NUM_GENES;
      seedBrain(this.genes, i, rng);                     // cerebro competente de partida (solo importa en modo neural)
      // Cuerpo y energía
      this.genes[b + G.size] = jit(0.28); this.genes[b + G.speed] = jit(0.5);
      this.genes[b + G.sense] = jit(0.4); this.genes[b + G.metab] = jit(0.45);
      this.genes[b + G.repro_thr] = jit(0.6); this.genes[b + G.invest] = jit(0.4);
      // Conducta: herbívoro tranquilo (la dieta/agresión emergen)
      this.genes[b + G.diet] = jit(0.08); this.genes[b + G.aggro] = jit(0.08);
      this.genes[b + G.w_food] = jit(0.55); this.genes[b + G.w_prey] = jit(0.15); this.genes[b + G.w_flee] = jit(0.4);
      this.genes[b + G.hue] = jit(baseHue); this.genes[b + G.temp_pref] = jit(0.5);
      // La FORMA (cuerpo/apéndices) se siembra abajo vía el bloque de NODOS (B2/B3). Aquí solo color/ojos/ornamento.
      this.genes[b + G.c_app] = jit(baseApp); this.genes[b + G.c_tip] = jit(baseTip); this.genes[b + G.c_eye] = jit(0.5);
      this.genes[b + G.e_fov] = jit(0.45); this.genes[b + G.orn] = jit(0.15); this.genes[b + G.pref] = jit(0.5);
      // Apariencia decorativa: arranque MODESTO (jit) → la variedad de glow/color/esbeltez/señuelo EMERGE por deriva.
      // c_lum (LUMINOSIDAD/glow): sembrado POR INDIVIDUO con sesgo bajo pero COLA hasta arriba (rng·rng) → la
      // mayoría con glow tenue y ALGUNOS linajes que brillan fuerte (emergente, deriva libre). Antes era un único
      // valor per-run bajo (baseLum) → nadie brillaba y el glow del cuerpo no se veía.
      // c_sat (VIVACIDAD de color) sembrado POR INDIVIDUO (rng·rng: sesgo bajo, cola hasta arriba) en vez de un
      // único valor per-run → hay color desde el inicio y la deriva lo explora; antes toda la run se quedaba en el
      // mismo gris. (Igual que c_lum/glow.) Tono ya va en banda estrecha → más vivacidad ≠ circo, son matices.
      this.genes[b + G.c_lum] = blend(baseLum, 0.4 + rng.next() * rng.next() * 0.5); this.genes[b + G.c_sat] = blend(baseSat, 0.32 + rng.next() * rng.next() * 0.55); // glow/color (variedad escalada por diversidad)
      this.genes[b + G.o_len] = jit(0.5); this.genes[b + G.o_bulb] = jit(0.3); this.genes[b + G.o_hue] = jit(baseOhue); this.genes[b + G.o_num] = jit(0.25); // señuelos largos y POCOS de partida
      this.genes[b + G.tex2] = blend(baseTex2, rng.next()); // escala/densidad de piel: variedad escalada por diversidad
      // Cohorte proto-carnívora: SOLO sesga la ECOLOGÍA (dieta/agresión/caza), el cuerpo sigue sencillo →
      // la morfología cazadora EMERGE. Mantiene la coexistencia depredador-presa sin inyectar complejidad.
      if (n < nCarn) {
        this.genes[b + G.diet] = jit(0.8); this.genes[b + G.aggro] = jit(0.7); this.genes[b + G.w_prey] = jit(0.7);
        this.genes[b + G.w_food] = jit(0.15); this.genes[b + G.sense] = jit(0.5); this.genes[b + G.e_fov] = jit(0.2);
        this.genes[b + G.repro_thr] = jit(0.35);
        // Kit de CAZADOR VIABLE (solo ecología; la FORMA cazadora emerge de los nodos): ventaja de TAMAÑO
        // (el combate exige depredador > presa) y esfuerzo alto para nadar rápido tras la presa.
        this.genes[b + G.size] = jit(0.45); this.genes[b + G.speed] = jit(0.65);
      }
      // --- NODOS (B2): cuerpo generativo. La RAÍZ (cabeza) siempre; los nodos 1..7 con presencia DECRECIENTE
      //     (≈50% el 1º, ≈29% el 2º-3º, ≈9% el resto) → variedad inmediata (cabezas, cadenas y tentáculos)
      //     pero la mayoría sencillos. La complejidad sigue evolucionando; esto solo da materia prima al arranque. ---
      this.genes[b + G.n0_present] = 1;                        // raíz siempre presente
      this.genes[b + G.n0_size] = jit(0.5); this.genes[b + G.n0_aspect] = jit(0.35);
      this.genes[b + G.n0_parent] = 0; this.genes[b + G.n0_angle] = 0; this.genes[b + G.n0_attach] = 0;
      this.genes[b + G.n0_osc_amp] = jit(0.5); this.genes[b + G.n0_osc_phase] = rng.next();
      for (let k = 1; k < NODE_COUNT; k++) {
        const nb = b + G['n' + k + '_present'];                // 8 campos contiguos por nodo
        const pScale = k === 1 ? 1.0 : k <= 3 ? 0.7 : 0.55;    // presencia decreciente por profundidad de nodo
        this.genes[nb + 0] = rng.next() * pScale;              // present (umbral 0.5): ≈50% nodo1, ≈29% nodo2-3, ≈9% resto
        this.genes[nb + 1] = rng.next();                       // parent
        this.genes[nb + 2] = 0.3 + rng.next() * 0.5;           // size (moderado)
        this.genes[nb + 3] = rng.next();                       // aspect: mezcla lóbulos (segmento) ↔ tentáculos
        this.genes[nb + 4] = rng.next();                       // angle: mezcla medial (cadena) ↔ lateral (par)
        this.genes[nb + 5] = jit(0.7);                         // attach (cerca de punta → cadenas)
        this.genes[nb + 6] = jit(0.5);                         // osc_amp (reserva B3)
        this.genes[nb + 7] = rng.next();                       // osc_phase (reserva B3)
      }
      computePhenotype(this, i);
      this.x[i] = rng.next() * W.width; this.y[i] = rng.next() * W.height;
      this.vx[i] = 0; this.vy[i] = 0;
      this.heading[i] = rng.next() * 6.283185307; // rumbo inicial aleatorio (sin él, mirarían todos al este el 1er frame)
      this.E[i] = 0.5 * this.eMax[i];
      this.age[i] = 0;
      this.cooldown[i] = (rng.next() * cfg.repro.cooldown) | 0; // desincronizar reproducción
      this.lineage[i] = this.nextLineageId++;
      this.generation[i] = 0;
    }
  }

  _rebuildActive() {
    let c = 0;
    const alive = this.alive, active = this.active, cap = this.cap;
    for (let i = 0; i < cap; i++) if (alive[i]) active[c++] = i;
    this.activeCount = c;
  }

  // ---- Un tick de simulación ----
  step() {
    const cfg = this.cfg, W = this.world, world = this.cfg.world, rng = this.rng;
    const wrap = world.wrap, ww = world.width, wh = world.height;
    const en = cfg.energy, moveCost = en.moveCost, kEffort = en.k_effort, epu = cfg.resource.energyPerUnit;
    const grazeRefuge = cfg.resource.grazeRefuge; // fracción protegida de cada celda
    const matchPenalty = cfg.color.matchPenalty;
    const kTemp = cfg.energy.k_temp; // coste por desviarse del óptimo térmico
    const NG = NUM_GENES, sizeAdv = cfg.combat.sizeAdvantage;
    const handlingTime = cfg.combat.handlingTime;
    const failDamage = cfg.combat.failDamage != null ? cfg.combat.failDamage : 1; // energía perdida al fallar (×eMax); ≥1 ≈ muerte segura
    const dietMargin = cfg.combat.dietMargin; // mínima diferencia de dieta para considerar presa
    // Banda de tamaño de presa (depredación selectiva → nichos de talla). inPreyBand(depredador, presa).
    const preyLo = cfg.combat.preyBandLo != null ? cfg.combat.preyBandLo : 0;
    const preyHi = cfg.combat.preyBandHi != null ? cfg.combat.preyBandHi : 1;
    const inPreyBand = (predR, preyR) => { const ratio = preyR / predR; return ratio >= preyLo && ratio <= preyHi; };
    const refuge = cfg.refuge, refugeOn = !!(refuge && refuge.enabled);     // refugio de presa (estabilizador L-V)
    const lureReach = cfg.combat.lureReach || 0;                            // alcance de caza extra por señuelo (anglerfish)
    const age = cfg.age, combat = cfg.combat.enabled, sexual = cfg.repro.sexual, allowAsexual = cfg.repro.asexual;
    const baseCD = cfg.repro.cooldown;
    const neural = cfg.sim.brain === 'neural'; // cerebro neuronal en vez de la regla reactiva

    W.regen();

    // Reconstruir lista activa + spatial hash (O(n), sin asignaciones).
    this._rebuildActive();
    W.hashClear();
    const active = this.active, count = this.activeCount;
    for (let a = 0; a < count; a++) {
      const i = active[a];
      W.hashInsert(i, this.x[i], this.y[i]);
    }

    const x = this.x, y = this.y, vx = this.vx, vy = this.vy, E = this.E;
    const res = W.resource, cols = W.cols, rows = W.rows;

    for (let a = 0; a < count; a++) {
      const i = active[a];
      if (!this.alive[i]) continue; // pudo morir como presa este tick

      // ---------- PERCEPCIÓN + DESEO ----------
      // Término comida: ascenso por el gradiente del campo de recurso (físico, O(1)).
      const ci = W.cellIndexAt(x[i], y[i]);
      const cx = ci % cols, cy = (ci / cols) | 0;
      const xl = cx > 0 ? ci - 1 : ci, xr = cx < cols - 1 ? ci + 1 : ci;
      const yt = cy > 0 ? ci - cols : ci, yb = cy < rows - 1 ? ci + cols : ci;
      let dfx = res[xr] - res[xl];
      let dfy = res[yb] - res[yt];
      const fmag = Math.hypot(dfx, dfy) || 1;
      dfx /= fmag; dfy /= fmag;

      let dx = this.wFood[i] * dfx;
      let dy = this.wFood[i] * dfy;

      // Mirada (solo render): por defecto al frente; si ve presa/amenaza, la sigue (se fija abajo).
      let gzx = 0, gzy = 0, gazeSet = false;
      // Direcciones unitarias a presa/amenaza (0 si ninguna) → entradas del cerebro neuronal.
      let preyDX = 0, preyDY = 0, threatDX = 0, threatDY = 0;

      // Términos presa/amenaza: solo si el combate está activo (Fase 2) Y el agente tiene
      // algún motivo para mirar a otros (atacar, perseguir presa o huir). Un grazer pacífico
      // (aggro≈0, w_prey≈0, w_flee≈0) no usa nada de esto → se salta el escaneo de vecinos,
      // que es lo más caro del tick. Gran ahorro cuando dominan los herbívoros.
      if (combat && (neural || this.aggro[i] > 0.02 || this.wPrey[i] > 0.04 || this.wFlee[i] > 0.04)) {
        const sr = this.senseR[i], sr2 = sr * sr;
        let bestPrey = -1, bestPreyD = sr2, bestThreat = -1, bestThreatD = sr2;
        let bestContact = -1, bestContactD = Infinity; // vecino solapado más cercano (combate)
        const myR = this.radius[i];
        // Visión DIRECCIONAL: solo se percibe (a distancia) dentro del cono centrado en el rumbo.
        // `visCos` = cos(semiángulo). Parado (sin rumbo fiable) → visión omnidireccional.
        const vc = this.visCos[i];
        let headx = vx[i], heady = vy[i];
        const hmag = headx * headx + heady * heady;
        const omni = hmag < 1e-6;
        if (!omni) { const im = 1 / Math.sqrt(hmag); headx *= im; heady *= im; }
        const hc = W.hashCell, hCols = W.hCols, hRows = W.hRows;
        let hx = (x[i] / hc) | 0, hy = (y[i] / hc) | 0;
        // Radio de escaneo ADAPTATIVO al alcance visual: un ojo estrecho ve más lejos que una celda (~80px).
        // Cono ancho/corto → 3×3 (R=1, como antes); visión larga → 5×5 (R=2) → ya NO se trunca su percepción.
        const scanR = Math.min(3, Math.max(1, Math.ceil(sr / hc)));
        for (let oy = -scanR; oy <= scanR; oy++) {
          for (let ox = -scanR; ox <= scanR; ox++) {
            let gx = hx + ox, gy = hy + oy;
            if (gx < 0) gx = hCols - 1; else if (gx >= hCols) gx = 0;
            if (gy < 0) gy = hRows - 1; else if (gy >= hRows) gy = 0;
            let j = W.cellHead[gy * hCols + gx];
            while (j !== -1) {
              if (j !== i && this.alive[j]) {
                let ddx = x[j] - x[i], ddy = y[j] - y[i];
                if (wrap) {
                  if (ddx > ww * 0.5) ddx -= ww; else if (ddx < -ww * 0.5) ddx += ww;
                  if (ddy > wh * 0.5) ddy -= wh; else if (ddy < -wh * 0.5) ddy += wh;
                }
                const d2 = ddx * ddx + ddy * ddy;
                const rsum = myR + this.radius[j];
                // Presa = más pequeña Y claramente más abajo en la dieta (presa real, no un igual).
                // Amenaza = lo contrario (alguien que puede comerme a MÍ).
                const rj = this.radius[j], dDiff = this.diet[i] - this.diet[j];
                // Presa = en la BANDA DE TAMAÑO del depredador Y claramente más abajo en la dieta (presa real).
                let canEat = inPreyBand(myR, rj) && dDiff > dietMargin;
                // REFUGIO: una presa en celda-refugio (vegetación densa) NO es cazable (ni percibida como presa).
                if (canEat && refugeOn && W.refuge[W.cellIndexAt(x[j], y[j])]) canEat = false;
                const reach = rsum + lureReach * this.lure[i] * myR;   // SEÑUELO (anglerfish): radio de captura extendido
                if (canEat && d2 < reach * reach && d2 < bestContactD) { bestContactD = d2; bestContact = j; }
                if (d2 < sr2) {
                  // ¿Cae el vecino dentro del cono de visión (relativo al rumbo)?
                  let seen = omni;
                  if (!seen) {
                    const dot = ddx * headx + ddy * heady; // = |d|·cos(θ)
                    seen = vc <= 0
                      ? (dot >= 0 || dot * dot < vc * vc * d2)  // cono >90°: solo ciego por detrás
                      : (dot > 0 && dot * dot > vc * vc * d2);  // cono <90°: solo hacia delante
                  }
                  if (seen) {
                    if (canEat && d2 < bestPreyD) { bestPreyD = d2; bestPrey = j; }
                    // Amenaza = j puede comerme a MÍ (yo estoy en LA BANDA de j, y j está más arriba en dieta).
                    else if (inPreyBand(rj, myR) && -dDiff > dietMargin && d2 < bestThreatD) { bestThreatD = d2; bestThreat = j; }
                  }
                }
              }
              j = W.cellNext[j];
            }
          }
        }
        // ---------- COMBATE (resolución exacta §3.1) ----------
        // Al solaparse, el potencial atacante ataca con probabilidad = su `aggro`.
        if (bestContact !== -1 && this.alive[bestContact] && this.attackCD[i] <= 0 && rng.next() < this.aggro[i]) {
          const j = bestContact;
          // Fuerza = (tamaño+0.1)^sizeAdvantage · (0.5 + aggro). Resolución estocástica:
          // nadie gana "por regla", emerge del genoma.
          const fi = Math.pow(this.genes[i * NG + G.size] + 0.1, sizeAdv) * (0.5 + this.aggro[i]);
          const fj = Math.pow(this.genes[j * NG + G.size] + 0.1, sizeAdv) * (0.5 + this.aggro[j]);
          if (rng.next() < fi / (fi + fj)) {
            // Gana i: la presa muere SIN depositar cadáver; i come según su eficiencia carnívora.
            const g = en.preyGain * E[j] * this.effCarn[i];
            E[i] += g; if (E[i] > this.eMax[i]) E[i] = this.eMax[i];
            this._kill(j, 'eaten'); this.kills++;
            this.attackCD[i] = handlingTime; // a digerir antes de volver a cazar
          } else {
            // Gana el defensor j: el atacante i resulta HERIDO (pierde `failDamage`·eMax de energía) y solo MUERE
            // si se queda a cero. Riesgo denso-dependiente GRADUADO en vez de muerte súbita: suaviza la extinción
            // estocástica carnívora (una mala tirada ya no mata) SIN quitar el freno — en esperanza, atacar presa
            // arriesgada sigue costando energía. `failDamage` ≥ 1 ≈ comportamiento antiguo (muerte casi segura).
            // (Medido en su día: sin coste alguno al fallar → sobre-disparo → colapso presa-depredador. No anular.)
            const dmg = failDamage * this.eMax[i];
            const bite = dmg < E[i] ? dmg : (E[i] > 0 ? E[i] : 0); // j no puede arrancar más energía de la que i tiene → conservación
            E[i] -= dmg;
            const g = en.preyGain * bite * this.effCarn[j]; // j aprovecha SOLO el bocado real (herbívoro effCarn≈0 → nada)
            E[j] += g; if (E[j] > this.eMax[j]) E[j] = this.eMax[j];
            this.attackCD[j] = handlingTime;
            if (E[i] <= 0) {
              this._kill(i, 'combat'); // muerte de atacante: NO cuenta como presa abatida (this.kills es solo depredación)
              continue; // i ha muerto: no sigue procesándose este tick
            }
            this.attackCD[i] = handlingTime; // herido: queda en cooldown (no reataca al instante)
          }
        }

        if (bestPrey !== -1) {
          let ddx = x[bestPrey] - x[i], ddy = y[bestPrey] - y[i];
          if (wrap) {
            if (ddx > ww * 0.5) ddx -= ww; else if (ddx < -ww * 0.5) ddx += ww;
            if (ddy > wh * 0.5) ddy -= wh; else if (ddy < -wh * 0.5) ddy += wh;
          }
          const m = Math.sqrt(bestPreyD) || 1;
          preyDX = ddx / m; preyDY = ddy / m;
          if (!neural) { dx += this.wPrey[i] * preyDX; dy += this.wPrey[i] * preyDY; } // reactivo
          gzx = ddx; gzy = ddy; gazeSet = true; // mira a la presa
        }
        if (bestThreat !== -1) {
          let ddx = x[bestThreat] - x[i], ddy = y[bestThreat] - y[i];
          if (wrap) {
            if (ddx > ww * 0.5) ddx -= ww; else if (ddx < -ww * 0.5) ddx += ww;
            if (ddy > wh * 0.5) ddy -= wh; else if (ddy < -wh * 0.5) ddy += wh;
          }
          const m = Math.sqrt(bestThreatD) || 1;
          threatDX = ddx / m; threatDY = ddy / m;
          if (!neural) { dx -= this.wFlee[i] * threatDX; dy -= this.wFlee[i] * threatDY; } // repulsión (reactivo)
          if (!gazeSet) { gzx = ddx; gzy = ddy; gazeSet = true; } // vigila la amenaza
        }
      }

      // ---------- CEREBRO NEURONAL (opcional): la MLP decide el deseo de movimiento ----------
      // Sustituye la suma reactiva: el deseo (dx,dy) sale de la red (pesos = genoma) a partir de las
      // mismas señales sensoriales. Comportamiento 100% emergente, sin estrategias programadas.
      if (neural) {
        const inp = this._brIn;
        inp[0] = dfx; inp[1] = dfy; inp[2] = preyDX; inp[3] = preyDY;
        inp[4] = threatDX; inp[5] = threatDY; inp[6] = E[i] / this.eMax[i] * 2 - 1;
        this._brain(i);
        dx = this._brOut[0]; dy = this._brOut[1];
      }

      // ---------- MOVIMIENTO ----------
      // La velocidad-capacidad (vmax) y la agilidad de giro (turnRate) EMERGEN de la
      // morfología (ver organism.js). El cuerpo no gira instantáneamente: rota su dirección
      // hacia el deseo como mucho `turnRate` por tick → los cuerpos torpes sobrepasan a la presa.
      const vmaxI = this.vmax[i];
      const turn = this.turnRate[i];
      const dmag = Math.hypot(dx, dy);
      if (dmag > 1e-4) {
        const ddx = dx / dmag, ddy = dy / dmag;          // dirección deseada (unitaria)
        const cs0 = Math.hypot(vx[i], vy[i]);
        let curx, cury;
        if (cs0 < 1e-4) { curx = ddx; cury = ddy; }      // parado: arranca hacia el deseo
        else { curx = vx[i] / cs0; cury = vy[i] / cs0; }
        // Girar la dirección actual hacia la deseada (interpolación limitada por la agilidad).
        let ndx = curx + (ddx - curx) * turn, ndy = cury + (ddy - cury) * turn;
        const nm = Math.hypot(ndx, ndy) || 1;
        vx[i] = ndx / nm * vmaxI; vy[i] = ndy / nm * vmaxI;
      } else {
        // Sin deseo: deriva con leve ruido térmico (no es estrategia, es física).
        const ang = (rng.next() - 0.5) * 0.6;
        const cs = Math.cos(ang), sn = Math.sin(ang);
        let nvx = vx[i] * cs - vy[i] * sn, nvy = vx[i] * sn + vy[i] * cs;
        const sp = Math.hypot(nvx, nvy);
        if (sp < 1e-3) { nvx = (rng.next() - 0.5); nvy = (rng.next() - 0.5); }
        const target = 0.3 * vmaxI, m = Math.hypot(nvx, nvy) || 1;
        vx[i] = nvx / m * target; vy[i] = nvy / m * target;
      }
      const dist = Math.hypot(vx[i], vy[i]);
      // Rumbo PERSISTENTE para el render: solo se reorienta si hay avance real; si v≈0 conserva el último
      // (evita el parpadeo "al este" de atan2(0,0) en parados/recién nacidos/topes no-toroidales).
      if (dist > 1e-3) this.heading[i] = Math.atan2(vy[i], vx[i]);
      // Guardar la mirada (render): al objetivo si lo hay, si no en la dirección de avance.
      if (!gazeSet) { gzx = vx[i]; gzy = vy[i]; }
      const gm = Math.hypot(gzx, gzy) || 1;
      this.gazeX[i] = gzx / gm; this.gazeY[i] = gzy / gm;
      let nx = x[i] + vx[i], ny = y[i] + vy[i];
      if (wrap) {
        if (nx < 0) nx += ww; else if (nx >= ww) nx -= ww;
        if (ny < 0) ny += wh; else if (ny >= wh) ny -= wh;
      } else {
        if (nx < 0) { nx = 0; vx[i] = 0; } else if (nx >= ww) { nx = ww - 0.01; vx[i] = 0; }
        if (ny < 0) { ny = 0; vy[i] = 0; } else if (ny >= wh) { ny = wh - 0.01; vy[i] = 0; }
      }
      x[i] = nx; y[i] = ny;

      // ---------- ENERGÉTICA ----------
      // Coste térmico: desviarse del óptimo (temp_pref) frente a la temperatura local
      // multiplica el coste basal. Crea un segundo eje de nicho (regiones frías/cálidas).
      const tcell = W.cellIndexAt(x[i], y[i]);
      let tmis = this.tempPref[i] - W.temp[tcell]; if (tmis < 0) tmis = -tmis;
      // Coste de nado ∝ velocidad² · esfuerzo (arrastre hidrodinámico: ir rápido se dispara en
      // coste). Así la velocidad la limita el presupuesto energético: la presa (renta de pasto
      // escasa) no puede ir al máximo, pero el depredador (energía rica de la presa) sí → la
      // depredación es viable. La velocidad se paga; solo compensa donde hace falta (cazar/huir).
      E[i] -= this.baseCost[i] * (1 + kTemp * tmis) + moveCost * dist * dist * (1 + kEffort * this.effort[i]);

      // Alimentación herbívora: absorber del campo de recurso de la celda actual.
      const eMaxI = this.eMax[i], effH = this.effHerb[i];
      const eFalta = eMaxI - E[i];
      if (eFalta > 0 && effH > 1e-4) {
        const cell = W.cellIndexAt(x[i], y[i]);
        // Solo se puede pastar lo que está por encima del refugio (reserva de rebrote).
        const grazable = res[cell] - grazeRefuge * W.capacity[cell];
        if (grazable > 0) {
          // Color como pigmento: cuanto mejor sintoniza el tono del organismo con la luz
          // local, más recurso capta. Distancia circular de tono → [0, 0.5].
          let hd = Math.abs(this.hue[i] - W.lightHue[cell]);
          if (hd > 0.5) hd = 1 - hd;
          const colorMatch = 1 - matchPenalty * (hd * 2); // [1-penalty .. 1]
          let units = grazable * this.absEff[i] * colorMatch;
          const maxByNeed = eFalta / (epu * effH);
          if (units > maxByNeed) units = maxByNeed;
          E[i] += units * epu * effH;
          res[cell] -= units; // baja en unidades de recurso (nunca por debajo del refugio)
        }
      }

      // ---------- MUERTE ----------
      if (E[i] <= 0) {
        this._kill(i, 'starv'); continue;
      }
      this.age[i]++;
      const over = this.age[i] - age.mature;
      if (over > 0) {
        const t = over / age.scale;
        if (rng.next() < age.mortality * t * t) {
          this._depositCorpse(x[i], y[i], en.corpseReturn * E[i]);
          this._kill(i, 'age');
          continue;
        }
      }

      // ---------- REPRODUCCIÓN (asexual) ----------
      if (this.attackCD[i] > 0) this.attackCD[i]--; // enfriamiento de ataque (independiente)
      if (this.cooldown[i] > 0) this.cooldown[i]--; // en cooldown no se reproduce (SPEC §4)
      else if (E[i] >= this.reproNeedE[i]) {
        // Repro SEXUAL: buscar pareja compatible cercana (distancia genética < umbral). Si no hay
        // ninguna al alcance → fallback ASEXUAL (clon). El "padre" i pone la energía y queda en cooldown.
        const mate = sexual ? this._findMate(i) : -1;
        // Si NO hay pareja y la reproducción asexual está PROHIBIDA → no hay cría (el padre conserva
        // su energía y su cooldown). Así encontrar pareja se vuelve una presión selectiva real.
        const child = (mate >= 0 || allowAsexual) ? this._alloc() : -1;
        if (child >= 0) {
          if (mate >= 0) crossover(this.genes, i, mate, child, this.cfg.mut, rng);
          else copyMutated(this.genes, i, child, this.cfg.mut, rng); // clon mutado (solo si allowAsexual)
          computePhenotype(this, child);
          E[i] -= this.investE[i];
          const childE = Math.min(this.investE[i], this.eMax[child]);
          let ox = x[i] + (rng.next() - 0.5) * 6, oy = y[i] + (rng.next() - 0.5) * 6;
          if (wrap) {
            if (ox < 0) ox += ww; else if (ox >= ww) ox -= ww;
            if (oy < 0) oy += wh; else if (oy >= wh) oy -= wh;
          }
          this.x[child] = ox; this.y[child] = oy;
          this.vx[child] = 0; this.vy[child] = 0;
          this.heading[child] = this.heading[i]; // hereda el rumbo del progenitor (sin él, miraría al este al nacer)
          this.E[child] = childE;
          this.age[child] = 0;
          this.cooldown[child] = baseCD;
          this.attackCD[child] = 0;
          const hb = child * BRAIN.H; for (let q = 0; q < BRAIN.H; q++) this.brainHid[hb + q] = 0; // memoria a cero
          this.lineage[child] = this.lineage[i];          // hereda linaje sin mutar
          this.generation[child] = this.generation[i] + 1; // un escalón más en el árbol
          this.cooldown[i] = baseCD;
          this.births++;
        }
        // Si no hay slot libre (tope de población): no nace, el progenitor conserva su E.
      }
    }

    this.tick++;
  }

  // Busca la pareja compatible más cercana (repro sexual): vecino vivo dentro de `mateRadius` con
  // distancia genética < `speciesGenThreshold` (= misma especie). Devuelve su índice o -1.
  _findMate(i) {
    const W = this.world, x = this.x, y = this.y, cfg = this.cfg, world = cfg.world;
    const wrap = world.wrap, ww = world.width, wh = world.height;
    const mr = cfg.repro.mateRadius, mr2 = mr * mr, thr = cfg.repro.speciesGenThreshold;
    const hc = W.hashCell, hCols = W.hCols, hRows = W.hRows;
    const hx = (x[i] / hc) | 0, hy = (y[i] / hc) | 0;
    // SELECCIÓN SEXUAL: entre las parejas compatibles al alcance, elige la que mejor encaja con la
    // PREFERENCIA del que elige (atractivo = 1 - |orn_pareja - pref_propia|). orn y pref se heredan
    // juntos (crossover) → co-evolucionan → runaway de Fisher (ornamentos exagerados y divergentes).
    const prefI = this.genes[i * NUM_GENES + G.pref];
    let best = -1, bestScore = -1;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        let gx = hx + ox, gy = hy + oy;
        if (gx < 0) gx = hCols - 1; else if (gx >= hCols) gx = 0;
        if (gy < 0) gy = hRows - 1; else if (gy >= hRows) gy = 0;
        let j = W.cellHead[gy * hCols + gx];
        while (j !== -1) {
          if (j !== i && this.alive[j]) {
            let dx = x[j] - x[i], dy = y[j] - y[i];
            if (wrap) {
              if (dx > ww * 0.5) dx -= ww; else if (dx < -ww * 0.5) dx += ww;
              if (dy > wh * 0.5) dy -= wh; else if (dy < -wh * 0.5) dy += wh;
            }
            const d2 = dx * dx + dy * dy;
            if (d2 < mr2 && geneticDistance(this.genes, i, j) < thr) {
              const ornJ = this.genes[j * NUM_GENES + G.orn];
              const score = 1 - Math.abs(ornJ - prefI);   // mejor encaje con la preferencia = más atractivo
              if (score > bestScore) { bestScore = score; best = j; }
            }
          }
          j = W.cellNext[j];
        }
      }
    }
    return best;
  }

  // Paso forward del cerebro RECURRENTE del agente i (pesos = genes del bloque BRAIN). Lee `this._brIn`
  // (entradas sensoriales) y el estado oculto PREVIO (memoria, en brainHid[i]); escribe el nuevo estado
  // oculto y `this._brOut` = deseo de movimiento (dx,dy en [-1,1]). Sin asignaciones en el bucle.
  _brain(i) {
    const g = this.genes, b = i * NUM_GENES + BRAIN0, sc = BRAIN.scale;
    const I = BRAIN.I, H = BRAIN.H, O = BRAIN.O, inp = this._brIn, hid = this._brHid;
    const prev = this.brainHid, hb = i * H;
    const wIh = b, wHh = wIh + I * H, bH = wHh + H * H, wHo = bH + H, bO = wHo + H * O;
    for (let h = 0; h < H; h++) {                       // capa oculta (tanh): entrada + MEMORIA + sesgo
      let s = (g[bH + h] - 0.5) * sc;
      for (let k = 0; k < I; k++) s += inp[k] * (g[wIh + k * H + h] - 0.5) * sc;       // entrada→oculta
      for (let p = 0; p < H; p++) s += prev[hb + p] * (g[wHh + p * H + h] - 0.5) * sc; // oculta(t-1)→oculta (recurrencia)
      hid[h] = Math.tanh(s);
    }
    for (let h = 0; h < H; h++) prev[hb + h] = hid[h];  // guardar nuevo estado oculto (memoria para t+1)
    let ox = (g[bO] - 0.5) * sc, oy = (g[bO + 1] - 0.5) * sc;
    for (let h = 0; h < H; h++) {
      ox += hid[h] * (g[wHo + h * O] - 0.5) * sc;
      oy += hid[h] * (g[wHo + h * O + 1] - 0.5) * sc;
    }
    this._brOut[0] = Math.tanh(ox); this._brOut[1] = Math.tanh(oy);
  }

  _depositCorpse(px, py, amount) {
    if (amount <= 0) return;
    const W = this.world, cell = W.cellIndexAt(px, py);
    const cap = W.capacity[cell];
    // El recurso se mide en unidades; convertir energía→unidades y respetar capacidad.
    const v = W.resource[cell] + amount / this.cfg.resource.energyPerUnit;
    W.resource[cell] = v > cap ? cap : v;
  }
}
