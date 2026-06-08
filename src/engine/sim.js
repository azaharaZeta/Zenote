// Motor de simulación: estado SoA, pool de agentes, bucle de ticks.
// Sin asignaciones en el bucle caliente. Independiente del render (movible a Worker).

import { World } from './world.js';
import { makeRng } from '../util/rng.js';
import { NUM_GENES, G, copyMutated, crossover, geneticDistance, BRAIN0, BRAIN, seedBrain } from './genome.js';
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

    // Acumuladores de empuje de separación (no-solape blando): scratch reutilizable, sin GC.
    this.sepX = new Float32Array(cap);
    this.sepY = new Float32Array(cap);

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

  _kill(i) {
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
        // Morfología nadadora (condición inicial: cuerpo capaz de perseguir; la selección
        // afinará la forma). Sin esto nacerían con apéndices aleatorios → muchos lentos.
        this.genes[b + G.m_app]   = 0.4 + rng.next() * 0.4;  // bastantes apéndices → empuje
        this.genes[b + G.m_len]   = 0.4 + rng.next() * 0.4;
        this.genes[b + G.m_width] = 0.3 + rng.next() * 0.4;
        this.genes[b + G.m_wave]  = 0.5 + rng.next() * 0.5;  // ondulan fuerte (nadan rápido)
        this.genes[b + G.m_sym]   = 0.2 + rng.next() * 0.4;  // algo asimétricos → giran para interceptar
        this.genes[b + G.m_elong] = 0.4 + rng.next() * 0.5;  // hidrodinámicos
        this.genes[b + G.e_fov]   = rng.next() * 0.35;       // ojos frontales de largo alcance (cazador)
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
    const baseHue = rng.next();
    const baseOhue = rng.next();                          // tono base del bulbo del señuelo (acento por run)
    const baseApp = rng.next(), baseTip = rng.next();     // matices base de apéndices/puntas (coherentes por run)
    // Bases per-run de los genes decorativos de DISPERSIÓN (segmentos, piel, glow, color). blend() interpola
    // entre la base compartida (div=0 → todos iguales) y la muestra individual (div=1 → variado actual).
    // c_lum (glow + luminosidad) y c_sat (color): sembrado MÁS ALTO (0.3/0.25 + cola) → organismos más
    // luminosos, con glow visible y menos grises. Antes (rng·rng ≈ 0.25) salían oscuros/apagados.
    const baseSeg = rng.next() * 0.7, baseCurve = rng.next();
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
      // Morfología SENCILLA: pocos apéndices, simétrico, redondeado, 1 segmento, sin módulos/ramas
      this.genes[b + G.m_app] = jit(0.12); this.genes[b + G.m_len] = jit(0.4); this.genes[b + G.m_width] = jit(0.4);
      this.genes[b + G.m_sym] = jit(0.82); this.genes[b + G.m_elong] = jit(0.3); this.genes[b + G.m_wave] = jit(0.5);
      this.genes[b + G.m_seg] = blend(baseSeg, rng.next() * 0.7); this.genes[b + G.m_segtaper] = jit(0.5); this.genes[b + G.m_segspace] = jit(0.5); // segmentos: variedad escalada por diversidad
      this.genes[b + G.mod0_on] = jit(0.12); this.genes[b + G.mod0_ang] = jit(0.5); this.genes[b + G.mod0_dist] = jit(0.5); this.genes[b + G.mod0_size] = jit(0.5);
      this.genes[b + G.mod1_on] = jit(0.1); this.genes[b + G.mod1_ang] = jit(0.5); this.genes[b + G.mod1_dist] = jit(0.5); this.genes[b + G.mod1_size] = jit(0.5);
      // Apariencia LISA (silueta de cabeza, estilo de ojo, colocación, ramificación, núcleo, colores, cresta)
      this.genes[b + G.s_asym] = jit(0.12); this.genes[b + G.s_curve] = blend(baseCurve, rng.next()); this.genes[b + G.s_place] = jit(0.15); // s_curve = PIEL: variedad de patrones escalada por diversidad
      this.genes[b + G.s_branch] = jit(0.35); this.genes[b + G.s_core] = jit(0.5); // más ramificación de partida (apéndices coral + bifurcación de segmentos)
      this.genes[b + G.c_app] = jit(baseApp); this.genes[b + G.c_tip] = jit(baseTip); this.genes[b + G.c_eye] = jit(0.5);
      this.genes[b + G.e_fov] = jit(0.45); this.genes[b + G.orn] = jit(0.15); this.genes[b + G.pref] = jit(0.5);
      this.genes[b + G.mut_rate] = jit(0.5); // mutabilidad neutra de partida (M≈1); evoluciona desde aquí
      // Apariencia decorativa: arranque MODESTO (jit) → la variedad de glow/color/esbeltez/señuelo EMERGE por deriva.
      // c_lum (LUMINOSIDAD/glow): sembrado POR INDIVIDUO con sesgo bajo pero COLA hasta arriba (rng·rng) → la
      // mayoría con glow tenue y ALGUNOS linajes que brillan fuerte (emergente, deriva libre). Antes era un único
      // valor per-run bajo (baseLum) → nadie brillaba y el glow del cuerpo no se veía.
      // c_sat (VIVACIDAD de color) sembrado POR INDIVIDUO (rng·rng: sesgo bajo, cola hasta arriba) en vez de un
      // único valor per-run → hay color desde el inicio y la deriva lo explora; antes toda la run se quedaba en el
      // mismo gris. (Igual que c_lum/glow.) Tono ya va en banda estrecha → más vivacidad ≠ circo, son matices.
      this.genes[b + G.b_aspect] = jit(0.32); this.genes[b + G.c_lum] = blend(baseLum, 0.4 + rng.next() * rng.next() * 0.5); this.genes[b + G.c_sat] = blend(baseSat, 0.32 + rng.next() * rng.next() * 0.55); // glow/color más altos (menos gris/oscuro), variedad escalada por diversidad
      this.genes[b + G.o_len] = jit(0.5); this.genes[b + G.o_bulb] = jit(0.3); this.genes[b + G.o_hue] = jit(baseOhue); this.genes[b + G.o_num] = jit(0.25); // señuelos largos y POCOS de partida
      // Cohorte proto-carnívora: SOLO sesga la ECOLOGÍA (dieta/agresión/caza), el cuerpo sigue sencillo →
      // la morfología cazadora EMERGE. Mantiene la coexistencia depredador-presa sin inyectar complejidad.
      if (n < nCarn) {
        this.genes[b + G.diet] = jit(0.8); this.genes[b + G.aggro] = jit(0.7); this.genes[b + G.w_prey] = jit(0.7);
        this.genes[b + G.w_food] = jit(0.15); this.genes[b + G.sense] = jit(0.5); this.genes[b + G.e_fov] = jit(0.2);
        this.genes[b + G.repro_thr] = jit(0.35);
        // Kit de CAZADOR VIABLE (ecología, no complejidad: sigue siendo 1 segmento sin módulos/ramas):
        //  · ventaja de TAMAÑO → el combate exige depredador > presa (si no, no captura → se extingue);
        //  · cuerpo HIDRODINÁMICO y ONDULANTE → nada lo bastante rápido para alcanzar a la presa.
        // Sin esto el cohorte cazador no puede comer y la depredación colapsa (→ sobrepastoreo). La
        // forma fina de cada cazador (nº de apéndices, segmentos…) EMERGE luego por selección.
        this.genes[b + G.size] = jit(0.45); this.genes[b + G.speed] = jit(0.65);
        this.genes[b + G.m_wave] = jit(0.75); this.genes[b + G.m_elong] = jit(0.62); this.genes[b + G.m_sym] = jit(0.7);
      }
      computePhenotype(this, i);
      this.x[i] = rng.next() * W.width; this.y[i] = rng.next() * W.height;
      this.vx[i] = 0; this.vy[i] = 0;
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
    const grainStrength = cfg.resource.grainMatch || 0;          // partición del recurso por talla (0 = off)
    const grainSigma = cfg.resource.grainSigma || 0.18;          // ancho del nicho talla-grano
    const matchPenalty = cfg.color.matchPenalty;
    const kTemp = cfg.energy.k_temp; // coste por desviarse del óptimo térmico
    const kSizeTemp = cfg.energy.k_sizeTemp; // nicho de tamaño por clima (Bergmann)
    const NG = NUM_GENES, sizeAdv = cfg.combat.sizeAdvantage;
    const handlingTime = cfg.combat.handlingTime;
    const dietMargin = cfg.combat.dietMargin; // mínima diferencia de dieta para considerar presa
    // Banda de tamaño de presa (depredación selectiva → nichos de talla). inPreyBand(depredador, presa).
    const preyLo = cfg.combat.preyBandLo != null ? cfg.combat.preyBandLo : 0;
    const preyHi = cfg.combat.preyBandHi != null ? cfg.combat.preyBandHi : 1;
    const inPreyBand = (predR, preyR) => { const ratio = preyR / predR; return ratio >= preyLo && ratio <= preyHi; };
    const carrion = cfg.carrion, scavenge = !!(carrion && carrion.enabled); // carroñeo (red de seguridad carnívora)
    const refuge = cfg.refuge, refugeOn = !!(refuge && refuge.enabled);     // refugio de presa (estabilizador L-V)
    const lureReach = cfg.combat.lureReach || 0;                            // alcance de caza extra por señuelo (anglerfish)
    const age = cfg.age, combat = cfg.combat.enabled, sexual = cfg.repro.sexual, allowAsexual = cfg.repro.asexual;
    const baseCD = cfg.repro.cooldown, carnSlow = cfg.repro.carnSlow || 0; // K-estrategia: carnívoros crían más lento
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
            this._kill(j); this.kills++;
            this.attackCD[i] = handlingTime; // a digerir antes de volver a cazar
          } else {
            // Gana el defensor j: i muere (sin cadáver) y j come. Un herbívoro (effCarn≈0)
            // puede matar en defensa pero no aprovechar la energía. NOTA: este riesgo de muerte al
            // FALLAR es el FRENO denso-dependiente que estabiliza al depredador (medido: bajarlo causa
            // sobre-disparo → colapso presa-depredador → extinción de todos). No tocar sin re-medir.
            const g = en.preyGain * E[i] * this.effCarn[j];
            E[j] += g; if (E[j] > this.eMax[j]) E[j] = this.eMax[j];
            this.attackCD[j] = handlingTime;
            if (scavenge) W.depositCarrion(x[i], y[i], carrion.yield * this.eMax[i]); // el cuerpo del atacante → carroña
            this._kill(i); this.kills++;
            continue; // i ha muerto: no sigue procesándose este tick
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
      // NICHO DE TAMAÑO POR CLIMA (Bergmann): grande barato en frío, caro en calor (y al revés). Crea
      // un óptimo de tamaño DISTINTO por región → emergen tamaños variados en la misma run (no todo al mínimo).
      const sizeTherm = kSizeTemp * (this.genes[i * NG + G.size] - 0.5) * (W.temp[tcell] - 0.5);
      // Coste de nado ∝ velocidad² · esfuerzo (arrastre hidrodinámico: ir rápido se dispara en
      // coste). Así la velocidad la limita el presupuesto energético: la presa (renta de pasto
      // escasa) no puede ir al máximo, pero el depredador (energía rica de la presa) sí → la
      // depredación es viable. La velocidad se paga; solo compensa donde hace falta (cazar/huir).
      E[i] -= this.baseCost[i] * (1 + kTemp * tmis + sizeTherm) + moveCost * dist * dist * (1 + kEffort * this.effort[i]);

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
          // PARTICIÓN POR TALLA (Prop. B): el pasto se aprovecha mejor cuanto más ENCAJA la talla del herbívoro
          // con el "grano" local. Gaussiana de (size - grain) → distintas tallas rinden en distintas zonas → nichos.
          let gm = 1;
          if (grainStrength > 0) {
            const dsg = this.genes[i * NG + G.size] - W.grain[cell];
            gm = (1 - grainStrength) + grainStrength * Math.exp(-(dsg * dsg) / (2 * grainSigma * grainSigma));
          }
          let units = grazable * this.absEff[i] * colorMatch * gm;
          const maxByNeed = eFalta / (epu * effH);
          if (units > maxByNeed) units = maxByNeed;
          E[i] += units * epu * effH;
          res[cell] -= units; // baja en unidades de recurso (nunca por debajo del refugio)
        }
      }

      // ---------- CARROÑEO (alimento de reserva del carnívoro) ----------
      // El carnívoro (effCarn alto) absorbe energía de la CARROÑA de su celda. En los valles de la
      // oscilación (presas vivas hundidas → muchas muertes → carroña abundante) esto lo mantiene vivo →
      // no se extingue y rebrota cuando vuelven las presas. No afecta a la caza de presas vivas.
      if (scavenge) {
        const effC = this.effCarn[i];
        if (effC > 1e-4 && E[i] < eMaxI) {
          const ccell = W.cellIndexAt(x[i], y[i]);
          const avail = W.carrion[ccell];
          if (avail > 0) {
            let got = avail * carrion.absRate * effC;
            const need = eMaxI - E[i];
            if (got > need) got = need;
            E[i] += got; W.carrion[ccell] -= got;
          }
        }
      }

      // ---------- MUERTE ----------
      if (E[i] <= 0) {
        if (scavenge) W.depositCarrion(x[i], y[i], carrion.yield * eMaxI); // el cuerpo queda como carroña
        this._kill(i); continue;
      }
      this.age[i]++;
      const over = this.age[i] - age.mature;
      if (over > 0) {
        const t = over / age.scale;
        if (rng.next() < age.mortality * t * t) {
          this._depositCorpse(x[i], y[i], en.corpseReturn * E[i]);
          if (scavenge) W.depositCarrion(x[i], y[i], carrion.yield * eMaxI); // cadáver de vejez → carroña
          this._kill(i);
          continue;
        }
      }

      // ---------- REPRODUCCIÓN (asexual) ----------
      if (this.attackCD[i] > 0) this.attackCD[i]--; // enfriamiento de ataque (independiente)
      if (this.cooldown[i] > 0) this.cooldown[i]--; // en cooldown no se reproduce (SPEC §4)
      else if (this.popCount < this.cap && E[i] >= this.reproNeedE[i]) {
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
          this.E[child] = childE;
          this.age[child] = 0;
          this.cooldown[child] = baseCD * (1 + carnSlow * this.diet[child]); // K-estrategia por dieta
          this.attackCD[child] = 0;
          const hb = child * BRAIN.H; for (let q = 0; q < BRAIN.H; q++) this.brainHid[hb + q] = 0; // memoria a cero
          this.lineage[child] = this.lineage[i];          // hereda linaje sin mutar
          this.generation[child] = this.generation[i] + 1; // un escalón más en el árbol
          this.cooldown[i] = baseCD * (1 + carnSlow * this.diet[i]); // K-estrategia por dieta
          this.births++;
        }
        // Si no hay slot libre (tope de población): no nace, el progenitor conserva su E.
      }
    }

    // ---------- SEPARACIÓN DE CUERPOS (no-solape blando, opcional) ----------
    // Física post-decisión: empuja suavemente los cuerpos que se solapan (no entra en la percepción
    // ni en el cerebro → no afecta a la emergencia de conducta). Ver _separate().
    if (this.cfg.physics.separation.enabled) this._separate();

    this.tick++;
  }

  // Empuje de separación suave: cada cuerpo que se solapa con un vecino corrige su MITAD del solape
  // (Jacobi: se acumula y se aplica al final → independiente del orden). EXCLUYE pares depredador-presa
  // (el cazador debe poder solapar a la presa para atacar; si se repeliera, la depredación colapsaría).
  // Usa el hash fino propio del mundo. O(n·vecinos) sin asignaciones. Es FÍSICA, no estrategia.
  _separate() {
    const sep = this.cfg.physics.separation, W = this.world;
    const x = this.x, y = this.y, sx = this.sepX, sy = this.sepY;
    const world = this.cfg.world, wrap = world.wrap, ww = world.width, wh = world.height;
    const active = this.active, count = this.activeCount;
    const dietMargin = this.cfg.combat.dietMargin;
    const preyLo = this.cfg.combat.preyBandLo != null ? this.cfg.combat.preyBandLo : 0;
    const preyHi = this.cfg.combat.preyBandHi != null ? this.cfg.combat.preyBandHi : 1;
    const inPreyBand = (predR, preyR) => { const r = preyR / predR; return r >= preyLo && r <= preyHi; };
    const strength = sep.strength, margin = sep.margin || 0, maxPush = sep.maxPush, maxPush2 = maxPush * maxPush;

    // Construir el hash fino con las posiciones YA movidas de este tick.
    W.sepClear();
    for (let a = 0; a < count; a++) { const i = active[a]; if (this.alive[i]) W.sepInsert(i, x[i], y[i]); }

    const scCols = W.scCols, scRows = W.scRows, sc = W.sepCell;
    const head = W.sepHead, next = W.sepNext;

    // 1) Acumular el empuje de cada agente (sin escribir aún las posiciones).
    for (let a = 0; a < count; a++) {
      const i = active[a]; if (!this.alive[i]) continue;
      let pushX = 0, pushY = 0;
      const myR = this.radius[i], myDiet = this.diet[i];
      let hx = (x[i] / sc) | 0, hy = (y[i] / sc) | 0;
      if (hx < 0) hx = 0; else if (hx >= scCols) hx = scCols - 1;
      if (hy < 0) hy = 0; else if (hy >= scRows) hy = scRows - 1;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          let gx = hx + ox, gy = hy + oy;
          if (gx < 0) gx = scCols - 1; else if (gx >= scCols) gx = 0;
          if (gy < 0) gy = scRows - 1; else if (gy >= scRows) gy = 0;
          let j = head[gy * scCols + gx];
          while (j !== -1) {
            if (j !== i && this.alive[j]) {
              let ddx = x[i] - x[j], ddy = y[i] - y[j]; // vector j→i (empuja a i lejos de j)
              if (wrap) {
                if (ddx > ww * 0.5) ddx -= ww; else if (ddx < -ww * 0.5) ddx += ww;
                if (ddy > wh * 0.5) ddy -= wh; else if (ddy < -wh * 0.5) ddy += wh;
              }
              const rj = this.radius[j];
              const range = myR + rj + margin;             // radio de repulsión = radios + espacio personal
              const d2 = ddx * ddx + ddy * ddy;
              if (d2 < range * range) {
                // ¿Es un par depredador-presa? (uno puede comerse al otro) → NO se repelen.
                const dDiff = myDiet - this.diet[j];
                const eats = (inPreyBand(myR, rj) && dDiff > dietMargin) || (inPreyBand(rj, myR) && -dDiff > dietMargin);
                if (!eats) {
                  if (d2 > 1e-6) {
                    const d = Math.sqrt(d2), inv = 1 / d;
                    const f = strength * (range - d) * 0.5;    // mi mitad del "solape efectivo", suavizada
                    pushX += ddx * inv * f; pushY += ddy * inv * f;
                  } else {
                    // Centros casi coincidentes (p.ej. recién nacido sobre el padre): empuje en una
                    // dirección estable por id (ángulo áureo) para descolapsar sin azar en el bucle caliente.
                    const ang = (i * 2.39996323) % 6.28318531;
                    pushX += Math.cos(ang) * strength * myR * 0.5;
                    pushY += Math.sin(ang) * strength * myR * 0.5;
                  }
                }
              }
            }
            j = next[j];
          }
        }
      }
      // Tope por tick (evita desplazamientos enormes en multitudes muy densas).
      const pm2 = pushX * pushX + pushY * pushY;
      if (pm2 > maxPush2) { const s = maxPush / Math.sqrt(pm2); pushX *= s; pushY *= s; }
      sx[i] = pushX; sy[i] = pushY;
    }

    // 2) Aplicar el empuje (con wrap toroidal), ahora que todos están calculados.
    for (let a = 0; a < count; a++) {
      const i = active[a]; if (!this.alive[i]) continue;
      let nx = x[i] + sx[i], ny = y[i] + sy[i];
      if (wrap) {
        if (nx < 0) nx += ww; else if (nx >= ww) nx -= ww;
        if (ny < 0) ny += wh; else if (ny >= wh) ny -= wh;
      } else {
        if (nx < 0) nx = 0; else if (nx >= ww) nx = ww - 0.01;
        if (ny < 0) ny = 0; else if (ny >= wh) ny = wh - 0.01;
      }
      x[i] = nx; y[i] = ny;
    }
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
