// Motor de simulación: estado SoA, pool de agentes, bucle de ticks.
// Sin asignaciones en el bucle caliente. Independiente del render (movible a Worker).

import { World } from './world.js';
import { makeRng } from '../util/rng.js';
import { NUM_GENES, G, copyMutated, crossover, geneticDistance, BRAIN0, BRAIN, seedBrain, NODE_COUNT } from './genome.js';
import { computePhenotype } from './organism.js';

export class Sim {
  constructor(cfg) {
    this.cfg = cfg;
    this._serial = 0; // contador de id de organismo: NO se reinicia al re-sembrar → serials siempre únicos (el caché del render no colisiona viejo↔nuevo)
    this.reset(cfg.pop.seed);
  }

  reset(seed) {
    const cfg = this.cfg;
    this.seed = seed;
    this.rng = makeRng(seed);
    // Escala del ecosistema con el tamaño del mundo (Modelo A): lo extensivo (materia, pool, fundadores, rejilla)
    // escala con el ÁREA → mundo grande = ecosistema mayor, misma densidad. Acotado por el techo de pool (perf).
    const REF = 1000, kw = cfg.world.size / REF;
    this._aScale = kw * kw;                                                     // factor de escala (ÁREA): lo extensivo (materia, fundadores, rejilla) crece con el área del mundo
    this.world = new World(cfg, this.rng, this._aScale);

    const cap = cfg.pop.maxAgentsCeiling || 8000;                              // pool = tope duro de población (UI); NO escala con el mundo
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
    this.lineage = new Int32Array(cap);     // id del fundador ancestral (heredado sin mutación)
    this.generation = new Int32Array(cap);  // profundidad genealógica (gen del padre + 1)
    this.attackCD = new Float32Array(cap);  // enfriamiento tras atacar (digestión): limita la tasa de depredación

    // --- Genoma (SoA: cap * NUM_GENES) ---
    this.genes = new Float32Array(cap * NUM_GENES);

    // Buffers del cerebro neuronal (escratch reutilizable, sin GC en el bucle).
    this._brIn = new Float32Array(BRAIN.I);
    this._brHid = new Float32Array(BRAIN.H);
    this._brOut = new Float32Array(BRAIN.O);
    this.brainHid = new Float32Array(cap * BRAIN.H); // memoria del cerebro recurrente (persiste entre ticks; cero al nacer)

    // --- Fenotipo cacheado (expresión fija durante la vida) ---
    this.radius = new Float32Array(cap);
    this.vmax = new Float32Array(cap);     // velocidad-capacidad (emerge de la morfología · esfuerzo)
    this.turnRate = new Float32Array(cap); // agilidad de giro (emerge de asimetría/tamaño/elongación)
    this.heading = new Float32Array(cap);  // rumbo persistente (rad) para el render: se conserva cuando v≈0
    this.effort = new Float32Array(cap);   // esfuerzo de nado (gen speed) → modula el coste de moverse
    this.flapCost = new Float32Array(cap); // Capa 3: coste de NADO extra por aletear (golpe activo); ver organism.js
    this.haulMul = new Float32Array(cap);  // (A) coste de TRANSPORTE ∝ masa: multiplica el coste de NADO; ver organism.js
    this.drag = new Float32Array(cap);     // (B) ARRASTRE emergente de la forma (Dmul de bodyplan): antes solo frenaba; ahora ENCARECE el nado (sim.js); ver organism.js
    this.senseR = new Float32Array(cap);   // alcance visual efectivo (emerge de sense · e_fov)
    this.visCos = new Float32Array(cap);   // cos(semiángulo del cono de visión) → visión direccional
    this.gazeX = new Float32Array(cap);    // dirección de la mirada (a la presa/amenaza, si no al frente)
    this.gazeY = new Float32Array(cap);    // — solo para el render (pupila reactiva), no afecta a la sim
    this.eMax = new Float32Array(cap);
    this.bodyMatter = new Float32Array(cap); // pecera: materia estructural bloqueada en el cuerpo (= carcassValue·eMax); del pool N al nacer, a carroña al morir
    this.baseCost = new Float32Array(cap);
    this.lure = new Float32Array(cap);     // prominencia del señuelo (anglerfish): coste + alcance de caza
    this.morphReach = new Float32Array(cap); // Capa 2: alcance de captura por apéndices frontales (px); ver organism.js
    this.absEff = new Float32Array(cap);
    this.effHerb = new Float32Array(cap);
    this.effHunt = new Float32Array(cap); // eficiencia cazando presa VIVA (eje caza↔carroña, Fase 2)
    this.effScav = new Float32Array(cap); // eficiencia CARROÑEANDO cadáveres (sube con cuerpo fino → gusano)
    this.investE = new Float32Array(cap);
    this.reproNeedE = new Float32Array(cap);
    this.matureAge = new Float32Array(cap); // (#12) edad de madurez: gatea la cría + inicio de la senescencia
    this.senesMult = new Float32Array(cap); // (#12) multiplicador de senescencia (ritmo de vida: alto = muere joven)
    this.diet = new Float32Array(cap);
    this.atkOut = new Float32Array(cap);   // impulso de ataque (3ª salida del cerebro) ∈[0,1] del último tick
    this.atkDrive = new Float32Array(cap); // impulso de ataque SUAVIZADO (EMA) → "ceño" del render (emergente)
    this.hue = new Float32Array(cap);
    this.tempPref = new Float32Array(cap);

    // --- Pool (free stack) + lista activa ---
    this.free = new Int32Array(cap);
    for (let i = 0; i < cap; i++) this.free[i] = cap - 1 - i; // pila: pop da 0,1,2...
    this.freeTop = cap;
    this.active = new Int32Array(cap);
    this.activeCount = 0;
    this.popCount = 0;
    this.serialOf = new Int32Array(cap); // id único por organismo (≠ slot): clave estable del caché de sprites del render

    this.tick = 0;
    this.births = 0;
    this.deaths = 0;
    this.nextLineageId = 0;
    this.kills = 0; // presas abatidas por depredación (instrumentación)
    // Demografía acumulada (gráficas): muertes por causa y nacimientos por tipo.
    this.deathCause = { starv: 0, combat: 0, age: 0, eaten: 0 };
    this.birthCount = { sexual: 0, asexual: 0 };

    this._seedInitial();
    this._rebuildActive();

    // Pecera: el nutriente libre inicial = presupuesto − materia ya bloqueada (vegetación + E y cuerpo de los fundadores).
    const epu = cfg.resource.energyPerUnit;
    const budget = cfg.world.matterBudget * this._aScale;     // materia total ∝ área del mundo
    let res = 0; const R = this.world.resource; for (let k = 0; k < R.length; k++) res += R[k];
    let bio = 0; for (let a = 0; a < this.activeCount; a++) { const i = this.active[a]; bio += this.E[i] + this.bodyMatter[i]; }
    let n0 = budget - res * epu - bio; if (n0 < 0) n0 = 0; // sobrante → nutriente libre inicial
    this.world.N.fill(n0 / this.world.N.length); // repartido uniforme (la dinámica lo concentra en manchas)
  }

  _alloc() {
    if (this.freeTop === 0) return -1;
    const i = this.free[--this.freeTop];
    this.alive[i] = 1;
    this.serialOf[i] = ++this._serial; // organismo nuevo en este slot → serial nuevo (invalida el caché del anterior)
    this.popCount++;
    return i;
  }

  _kill(i, cause) {
    if (cause) this.deathCause[cause]++; // demografía: causa de muerte
    // Toda muerte deja carroña. Muerte natural = cuerpo entero; cazado = solo sobras (el depredador se llevó casi todo).
    // Pecera: deposita la materia real (E + bodyMatter). La presa cazada ya la repartió la depredación → aquí nada (sin doble conteo).
    const carcass = cause === 'eaten' ? 0 : (this.E[i] > 0 ? this.E[i] : 0) + this.bodyMatter[i];
    if (carcass > 0) this._depositCarrion(this.x[i], this.y[i], carcass);
    this.alive[i] = 0;
    this.free[this.freeTop++] = i;
    this.popCount--;
    this.deaths++;
  }

  // Nº de fundadores al sembrar: pop.initial (a tamaño 1000) escalado ×área → densidad inicial ~constante. Acotado al pool.
  _initialCount() {
    const n = Math.round(this.cfg.pop.initial * this._aScale);
    return Math.min(Math.max(1, n), this.cap);
  }

  _seedInitial() {
    if (this.cfg.pop.simpleStart) { this._seedSimple(); return; }
    const cfg = this.cfg, rng = this.rng, W = cfg.world;
    const dietLow = cfg.pop.seedDietLow;
    const nInit = this._initialCount();                          // fundadores escalados al ÁREA del mundo (ver _initialCount)
    const nCarn = cfg.combat.enabled ? (nInit * cfg.pop.carnivoreSeedFrac) | 0 : 0;
    for (let n = 0; n < nInit; n++) {
      const i = this._alloc();
      if (i < 0) break;
      // Genoma inicial: cada gen uniforme [0,1] e independiente.
      const b = i * NUM_GENES;
      for (let k = 0; k < NUM_GENES; k++) this.genes[b + k] = rng.next();
      // Condición inicial (no estrategia codificada): solo fija el reparto de partida; la conducta emerge por selección.
      if (dietLow) {
        this.genes[b + G.diet] = rng.next() * 0.15;          // arranque herbívoro suave
      } else if (n < nCarn) {
        // Cohorte proto-carnívora: siembra el nicho depredador para cruzar el valle de fitness. Luego decide la selección.
        this.genes[b + G.diet]   = 0.75 + rng.next() * 0.25;
        this.genes[b + G.speed]  = 0.5 + rng.next() * 0.4;   // esfuerzo alto: rema fuerte para cazar
        this.genes[b + G.size]   = 0.3 + rng.next() * 0.2;   // solo lo justo para superar a la presa
        this.genes[b + G.sense]  = 0.4 + rng.next() * 0.4;
        this.genes[b + G.repro_thr] = rng.next() * 0.25; // se reproduce a ~media energía
        this.genes[b + G.invest]    = 0.1 + rng.next() * 0.3;
        this.genes[b + G.e_fov]   = rng.next() * 0.35;       // ojos frontales de largo alcance (cazador)
      } else {
        // Gremio herbívoro: dieta y talla bajas (presa pequeña al inicio → el cazador coge ventaja).
        this.genes[b + G.diet] = rng.next() * 0.2;
        this.genes[b + G.size] = rng.next() * 0.3;
      }
      // Cerebro competente de partida; carnívoros fundadores con sesgo de ataque alto (cazan en contacto desde ya).
      seedBrain(this.genes, i, rng, (!dietLow && n < nCarn) ? 0.27 : 0);
      computePhenotype(this, i);
      this.bodyMatter[i] = (cfg.energy.carcassValue || 0) * this.eMax[i]; // materia del cuerpo (cerrado: bloqueada del pool)
      this.x[i] = rng.next() * W.size;
      this.y[i] = rng.next() * W.size;
      this.vx[i] = 0; this.vy[i] = 0;
      this.atkOut[i] = 0; this.atkDrive[i] = 0; // impulso de ataque inicial (slot del pool limpio)
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
    const nInit = this._initialCount();                          // fundadores escalados al ÁREA del mundo (ver _initialCount)
    const nCarn = cfg.combat.enabled ? (nInit * cfg.pop.carnivoreSeedFrac) | 0 : 0;
    // Diversidad de sembrado (UI): 0 = fundadores casi idénticos · 1 = variados. Escala el jitter y la dispersión decorativa.
    const div = cfg.pop.startDiversity != null ? cfg.pop.startDiversity : 1;
    const J = cfg.pop.startJitter * div;                  // jitter ∝ diversidad
    // Paleta por ejecución: bases aleatorias compartidas → cada run tiene un colorido coherente y distinto.
    // El tono base evita el verde (se reserva para la vegetación del render); el verde puede emerger luego por deriva.
    const baseHue = ((180 + rng.next() * 250) % 360) / 360;
    const baseOhue = rng.next();                          // tono base del bulbo del señuelo (acento por run)
    // blend() interpola entre la base per-run (div=0 → todos iguales) y la muestra individual (div=1 → variado).
    const baseTex2 = rng.next();
    const baseOsc = rng.next();                           // fase de oscilación base por run (div=0 → marcha COORDINADA y uniforme)
    const baseLum = 0.4 + rng.next() * rng.next() * 0.5, baseSat = 0.32 + rng.next() * rng.next() * 0.55;
    const blend = (base, sample) => base + (sample - base) * div;
    const jit = (v) => { const x = v + rng.gaussian() * J; return x < 0 ? 0 : x > 1 ? 1 : x; };
    for (let n = 0; n < nInit; n++) {
      const i = this._alloc();
      if (i < 0) break;
      const b = i * NUM_GENES;
      // Cerebro competente de partida; carnívoros fundadores con sesgo de ataque alto (cazan en contacto desde ya).
      seedBrain(this.genes, i, rng, (n < nCarn) ? 0.27 : 0);
      // Cuerpo y energía
      this.genes[b + G.size] = jit(0.28); this.genes[b + G.speed] = jit(0.5);
      this.genes[b + G.sense] = jit(0.4); this.genes[b + G.metab] = jit(0.45);
      this.genes[b + G.repro_thr] = jit(0.6); this.genes[b + G.invest] = jit(0.4);
      // Conducta: herbívoro tranquilo (la dieta emerge; las ganas de atacar emergen del cerebro)
      this.genes[b + G.diet] = jit(0.08);
      this.genes[b + G.scav] = jit(0.12); // eje caza↔carroña: sesgo cazador por defecto (neutro en herbívoros, meat≈0)
      this.genes[b + G.hue] = jit(baseHue); this.genes[b + G.temp_pref] = jit(0.5);
      // Historia de vida (#12): arranque a rango medio (≈madurez 308 ticks, ritmo medio) → r/K emerge por deriva
      this.genes[b + G.mature_age] = jit(0.4); this.genes[b + G.senescence] = jit(0.5);
      // Color/ojos/ornamento (la forma se siembra abajo en el bloque de NODOS).
      this.genes[b + G.c_eye] = jit(0.5);
      this.genes[b + G.e_fov] = jit(0.45); this.genes[b + G.orn] = jit(0.15); this.genes[b + G.pref] = jit(0.5);
      // c_lum/c_sat (glow/color) por individuo con sesgo bajo y cola alta (rng·rng) → la mayoría tenue, algunos brillan.
      this.genes[b + G.c_lum] = blend(baseLum, 0.4 + rng.next() * rng.next() * 0.5); this.genes[b + G.c_sat] = blend(baseSat, 0.32 + rng.next() * rng.next() * 0.55);
      this.genes[b + G.o_len] = jit(0.5); this.genes[b + G.o_bulb] = jit(0.3); this.genes[b + G.o_hue] = jit(baseOhue); this.genes[b + G.o_num] = jit(0.25); // señuelos largos y pocos de partida
      this.genes[b + G.tex2] = blend(baseTex2, rng.next()); // piel
      // Cohorte proto-carnívora: solo sesga la ecología (dieta/caza); la morfología cazadora emerge. Par = cazador
      // (grande, rápido, visión frontal); impar = carroñero proto-gusano (cuerpo barato → vive de la carroña escasa).
      if (n < nCarn) {
        this.genes[b + G.diet] = jit(0.8);
        if (n % 2) {
          this.genes[b + G.scav] = jit(0.85);
          this.genes[b + G.size] = jit(0.2);  this.genes[b + G.speed] = jit(0.3);
          this.genes[b + G.sense] = jit(0.4); this.genes[b + G.e_fov] = jit(0.55);
          this.genes[b + G.repro_thr] = jit(0.4);
        } else {
          this.genes[b + G.scav] = jit(0.12);
          this.genes[b + G.size] = jit(0.45); this.genes[b + G.speed] = jit(0.65);
          this.genes[b + G.sense] = jit(0.5); this.genes[b + G.e_fov] = jit(0.2);
          this.genes[b + G.repro_thr] = jit(0.35);
        }
      }
      // NODOS: cuerpo generativo. Raíz (cabeza) siempre; nodos 1..7 con presencia decreciente → la mayoría sencillos.
      this.genes[b + G.n0_present] = 1;                        // raíz siempre presente
      this.genes[b + G.n0_size] = jit(0.5); this.genes[b + G.n0_aspect] = jit(0.35);
      this.genes[b + G.n0_parent] = 0; this.genes[b + G.n0_angle] = 0; this.genes[b + G.n0_attach] = 0;
      this.genes[b + G.n0_osc_amp] = jit(0.5); this.genes[b + G.n0_osc_phase] = blend(baseOsc, rng.next());
      this.genes[b + G.n0_tipShape] = jit(0.5);                // forma: elipse neutra al sembrar (la silueta diversifica por deriva)
      this.genes[b + G.n0_gaitMode] = jit(0);                  // modo: ondular puro al sembrar (el aleteo emerge por deriva)
      // Nodo 1 = cola propulsora (renacuajo): la cabeza sola apenas avanza → cola trasera que ondula → nada desde el tick 1.
      { const nb = b + G.n1_present;
        this.genes[nb + 0] = 1;                                // present (cola siempre al sembrar)
        this.genes[nb + 1] = 0;                                // parent = cabeza
        this.genes[nb + 2] = jit(0.5);                         // size (uniforme a div=0)
        this.genes[nb + 3] = jit(0.35);                        // aspect: segmento (no tentáculo puro)
        this.genes[nb + 4] = jit(0.9);                         // angle ≈ ATRÁS (emit≈π → cola que propulsa)
        this.genes[nb + 5] = jit(0.7);                         // attach (cerca de punta → cadena)
        this.genes[nb + 6] = jit(0.6);                         // osc_amp (ondula con ganas)
        this.genes[nb + 7] = blend(baseOsc, rng.next());       // osc_phase (uniforme a div=0 → marcha coordinada)
        this.genes[nb + 8] = jit(0.5);                         // tipShape: elipse neutra
        this.genes[nb + 9] = jit(0);                           // gaitMode: ondular puro
      }
      // Nodos 2..7 (complejidad extra): su presencia escala con la diversidad → a div=0 ninguno (renacuajo puro).
      for (let k = 2; k < NODE_COUNT; k++) {
        const nb = b + G['n' + k + '_present'];
        const pPresent = k <= 3 ? 0.29 : 0.09;                 // prob. de presencia a diversidad máxima (≈ previo)
        const present = rng.next() < div * pPresent;           // ∝ diversidad → a div=0, ausente
        // present sembrado PLENO (≥0.6) o por debajo de la banda graduada (PRES_LO=0.4) → a div=0, renacuajo puro
        this.genes[nb + 0] = present ? (0.6 + rng.next() * 0.35) : (rng.next() * 0.38);
        this.genes[nb + 1] = rng.next();                       // parent
        this.genes[nb + 2] = 0.3 + rng.next() * 0.5;           // size (moderado)
        this.genes[nb + 3] = rng.next();                       // aspect: mezcla lóbulos (segmento) ↔ tentáculos
        this.genes[nb + 4] = rng.next();                       // angle: mezcla medial (cadena) ↔ lateral (par)
        this.genes[nb + 5] = jit(0.7);                         // attach (cerca de punta → cadenas)
        this.genes[nb + 6] = jit(0.5);                         // osc_amp
        this.genes[nb + 7] = rng.next();                       // osc_phase
        this.genes[nb + 8] = jit(0.5);                         // tipShape: elipse neutra (la forma diversifica por deriva)
        this.genes[nb + 9] = jit(0);                           // gaitMode: ondular puro (el aleteo emerge por deriva)
      }
      // Proto-gusano (carroñero, impar): cadena axial de segmentos → arranca elongado, cruzando el valle morfológico.
      if (n < nCarn && (n % 2) === 1) {
        this.genes[b + G.n0_aspect] = jit(0.55);               // cabeza algo estrecha (cuerpo de gusano)
        for (let k = 1; k < NODE_COUNT; k++) {
          const nb = b + G['n' + k + '_present'];
          const seg = k <= 5;                                  // 5 segmentos en cadena; el resto ausente
          this.genes[nb + 0] = seg ? 1 : jit(0);               // present
          this.genes[nb + 1] = 0.9;                            // parent → nodo anterior (cadena: floor(0.9·k)=k−1)
          this.genes[nb + 2] = jit(0.65);                      // size (segmento sustancial → área → elonga el eje)
          this.genes[nb + 3] = jit(0.45);                      // aspect medio (ni hilo ni lóbulo: segmento de anguila)
          this.genes[nb + 4] = jit(0.95);                      // angle ≈ π (axial atrás → estira el eje + propulsa)
          this.genes[nb + 5] = jit(0.9);                       // attach en la punta (la cadena se extiende)
          this.genes[nb + 6] = jit(0.55);                      // osc_amp (ondula → nado anguiliforme)
          this.genes[nb + 7] = blend(baseOsc, rng.next());     // osc_phase coordinada (a div=0)
          this.genes[nb + 8] = jit(0.5);                       // tipShape neutro
          this.genes[nb + 9] = jit(0);                         // gaitMode ondular
        }
      }
      // Proto-cazador-garra (cazador, par): cola propulsora (nodo 1) + par de apéndices frontales (garras → fwdReach →
      // alcance de captura). Cruza el valle de la garra (subir morphReach no la induce desde cero); la selección decide si persiste.
      if (n < nCarn && (n % 2) === 0) {
        for (let k = 2; k < NODE_COUNT; k++) {                 // nodo 2 = garra frontal bilateral; 3-7 ausentes
          const nb = b + G['n' + k + '_present'];
          const claw = k === 2;
          this.genes[nb + 0] = claw ? 1 : jit(0);              // present
          this.genes[nb + 1] = 0;                              // parent = cabeza (la garra sale del morro)
          this.genes[nb + 2] = jit(0.5);                       // size (garra sustancial → alcance, sin frenar de más)
          this.genes[nb + 3] = jit(0.7);                       // aspect alto → apéndice LARGO y fino (púa/tentáculo)
          this.genes[nb + 4] = jit(0.13);                      // angle bajo → emit≈0.41 rad (AL FRENTE; lateral → par bilateral) → fwdReach
          this.genes[nb + 5] = jit(0.3);                       // attach cerca de la base (sale del morro)
          this.genes[nb + 6] = jit(0.3);                       // osc_amp bajo (la garra agarra, no rema)
          this.genes[nb + 7] = blend(baseOsc, rng.next());     // osc_phase coordinada (a div=0)
          this.genes[nb + 8] = jit(0.28);                      // tipShape < 0.5 → AFILA (púa/garra: +alcance, −arrastre)
          this.genes[nb + 9] = jit(0);                         // gaitMode ondular
        }
      }
      computePhenotype(this, i);
      this.bodyMatter[i] = (cfg.energy.carcassValue || 0) * this.eMax[i]; // materia del cuerpo (cerrado: bloqueada del pool)
      this.x[i] = rng.next() * W.size; this.y[i] = rng.next() * W.size;
      this.vx[i] = 0; this.vy[i] = 0;
      this.atkOut[i] = 0; this.atkDrive[i] = 0; // impulso de ataque inicial (slot del pool limpio)
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

  // Re-expresa el fenotipo de todos los vivos con la config actual (lo llama el worker al mover un slider (UI) que se
  // expresa en el fenotipo → afecta en vivo, no solo a las crías). No toca E/edad/posición/memoria/bodyMatter (conserva).
  recomputePhenotypes() {
    const alive = this.alive, cap = this.cap;
    for (let i = 0; i < cap; i++) if (alive[i]) computePhenotype(this, i);
  }

  // ---- Un tick de simulación ----
  step() {
    const cfg = this.cfg, W = this.world, world = this.cfg.world, rng = this.rng;
    const wrap = world.wrap, ww = world.size, wh = world.size;
    const en = cfg.energy, moveCost = en.moveCost, kEffort = en.k_effort, epu = cfg.resource.energyPerUnit, Rmax = cfg.resource.R_max;
    const kDrag = en.k_drag || 0, dragRef = en.dragRef != null ? en.dragRef : 1; // (B) coste de nado ∝ arrastre de la forma (Dmul); leídos en vivo (0 = inerte)
    const grazeRefuge = cfg.resource.grazeRefuge; // fracción protegida de cada celda
    const forageReach = cfg.resource.forageReach || 0; // (prototipo, 0=INERTE) celdas de alcance de forrajeo a talla máx → el grande pasta de un ÁREA (∝ radio)
    const epuScent = epu * cfg.resource.carrionScent; // olfato de carroña: el ∇carroña pesa effScav/epuScent en el gradiente de búsqueda
    const kTemp = cfg.energy.k_temp; // coste por desviarse del óptimo térmico
    const NG = NUM_GENES, sizeAdv = cfg.combat.sizeAdvantage;
    const handlingTime = cfg.combat.handlingTime;
    const failDamage = cfg.combat.failDamage != null ? cfg.combat.failDamage : 1; // energía perdida al fallar (×eMax); ≥1 ≈ muerte segura
    const dietMargin = cfg.combat.dietMargin; // mínima diferencia de dieta para considerar presa
    // Banda de tamaño de presa (depredación selectiva → nichos de talla). inPreyBand(depredador, presa).
    const preyLo = cfg.combat.preyBandLo != null ? cfg.combat.preyBandLo : 0;
    const preyHi = cfg.combat.preyBandHi != null ? cfg.combat.preyBandHi : 1;
    const inPreyBand = (predR, preyR) => { const ratio = preyR / predR; return ratio >= preyLo && ratio <= preyHi; };
    // Banda de amenaza precalculada (vecino me come si rj/myR ∈ [1/preyHi, 1/preyLo]) → evita una división por vecino.
    const threatLo = 1 / preyHi, threatHi = 1 / preyLo, maxRadius = cfg.expr.size.max;
    const refuge = cfg.refuge, refugeOn = !!(refuge && refuge.enabled);     // refugio de presa (estabilizador L-V)
    const coverStrength = refugeOn ? (refuge.strength != null ? refuge.strength : 0) : 0; // #7: cobertura graduada por vegetación
    const fleeSpeed = cfg.combat.fleeSpeed || 0;                            // escape por VELOCIDAD relativa (0 = off, modelo previo)
    const fleeCap = cfg.combat.fleeCap;                                     // tope de la prob. de escape por velocidad (la presa nunca se zafa con certeza)
    const lureReach = cfg.combat.lureReach || 0;                            // alcance de caza extra por señuelo (anglerfish)
    const lureAttract = cfg.combat.lureAttract || 0;                        // (P1) ATRACCIÓN de presa por señuelo (emboscada): sesga el gradiente de comida de los vecinos hacia el portador (0 = off)
    const age = cfg.age, combat = cfg.combat.enabled, sexual = cfg.repro.sexual, allowAsexual = cfg.repro.asexual;
    const baseCD = cfg.repro.cooldown;
    const birthGatherR = world.birthGatherR;                               // (pecera) radio en celdas del vecindario del que la cría reúne materia al nacer

    W.regen();
    W.decayCarrion();   // los cadáveres se descomponen y mineralizan a nutriente local = ciclo de materia
    W.diffuseNutrient(); // el campo de nutriente libre se difunde despacio → manchas fértiles que migran

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
    const carrion = W.carrion, carrionAbsRate = cfg.resource.carrionAbsRate || 0;
    // Marca de agua: un slot con serial > maxSerial nació ESTE tick (reutilizó un slot liberado) → no re-procesarlo.
    const maxSerial = this._serial;

    for (let a = 0; a < count; a++) {
      const i = active[a];
      if (!this.alive[i] || this.serialOf[i] > maxSerial) continue; // muerto este tick, o slot reutilizado por una cría de este tick

      // ---------- PERCEPCIÓN + DESEO ----------
      const ci = W.cellIndexAt(x[i], y[i]);
      const cx = ci % cols, cy = (ci / cols) | 0;
      const xl = cx > 0 ? ci - 1 : ci, xr = cx < cols - 1 ? ci + 1 : ci;
      const yt = cy > 0 ? ci - cols : ci, yb = cy < rows - 1 ? ci + cols : ci;
      // Gradiente de comida dependiente de DIETA: asciende hacia lo que puede comer (effHerb·∇recurso + effScav·∇carroña).
      const effHi = this.effHerb[i], cS = this.effScav[i] / epuScent;
      let dfx = effHi * (res[xr] - res[xl]) + cS * (carrion[xr] - carrion[xl]);
      let dfy = effHi * (res[yb] - res[yt]) + cS * (carrion[yb] - carrion[yt]);
      // (crudo aún; los señuelos vecinos le suman atracción abajo y se normaliza antes del cerebro)

      let dx = 0, dy = 0;   // el deseo de movimiento lo decide el cerebro (abajo), no una regla fija

      let gzx = 0, gzy = 0, gazeSet = false;   // mirada (solo render): al frente, o a la presa/amenaza si la ve
      // Entradas del cerebro: direcciones a presa/amenaza (0 si ninguna) + talla/escapabilidad de la presa más cercana.
      let preyDX = 0, preyDY = 0, threatDX = 0, threatDY = 0, preySizeRel = 0, preyCover = 0;
      let lureAX = 0, lureAY = 0;   // atracción acumulada de señuelos vecinos (emboscada)

      // Presa/amenaza: solo si el combate está activo. Alimenta las entradas del cerebro y la detección de contacto.
      if (combat) {
        const sr = this.senseR[i], sr2 = sr * sr;
        let bestPrey = -1, bestPreyD = sr2, bestThreat = -1, bestThreatD = sr2;
        let bestContact = -1, bestContactD = Infinity; // vecino solapado más cercano (combate)
        const myR = this.radius[i];
        // Visión direccional: solo se percibe dentro del cono centrado en el rumbo (visCos = cos del semiángulo). Parado → omnidireccional.
        const vc = this.visCos[i];
        let headx = vx[i], heady = vy[i];
        const hmag = headx * headx + heady * heady;
        const omni = hmag < 1e-6;
        if (!omni) { const im = 1 / Math.sqrt(hmag); headx *= im; heady *= im; }
        const hc = W.hashCell, hCols = W.hCols, hRows = W.hRows;
        let hx = (x[i] / hc) | 0, hy = (y[i] / hc) | 0;
        // Radio de escaneo adaptativo al alcance visual (cap 3): visión larga → más celdas, sin truncar la percepción.
        const scanR = Math.min(3, Math.max(1, Math.ceil(sr / hc)));
        // scanMax2 = cota del radio que importa (visión o captura) → descarta la mayoría de vecinos con solo la distancia.
        const myDiet = this.diet[i], reachExt = lureReach * this.lure[i] * myR + this.morphReach[i]; // señuelo + apéndices frontales
        const reachMax = myR + maxRadius + reachExt;
        const scanMax2 = sr2 > reachMax * reachMax ? sr2 : reachMax * reachMax;
        for (let oy = -scanR; oy <= scanR; oy++) {
          const rowBase = (((hy + oy) % hRows + hRows) % hRows) * hCols; // fila envuelta (toro) precalculada por oy → no recomputar el wrap+base de fila por celda
          for (let ox = -scanR; ox <= scanR; ox++) {
            const gx = ((hx + ox) % hCols + hCols) % hCols;             // wrap toroidal de columna
            let j = W.cellHead[rowBase + gx];
            while (j !== -1) {
              if (j !== i && this.alive[j]) {
                let ddx = x[j] - x[i], ddy = y[j] - y[i];
                if (wrap) {
                  if (ddx > ww * 0.5) ddx -= ww; else if (ddx < -ww * 0.5) ddx += ww;
                  if (ddy > wh * 0.5) ddy -= wh; else if (ddy < -wh * 0.5) ddy += wh;
                }
                const d2 = ddx * ddx + ddy * ddy;
                if (d2 < scanMax2) {   // early-cull: fuera de visión y de captura → ni se evalúa (la mayoría)
                  // Presa = en la banda de talla y más abajo en dieta; amenaza = lo contrario.
                  const rj = this.radius[j], ratio = rj / myR, dDiff = myDiet - this.diet[j];
                  const canEat = ratio >= preyLo && ratio <= preyHi && dDiff > dietMargin;
                  if (canEat) {   // contacto (combate): presa válida dentro del alcance de captura
                    const reach = myR + rj + reachExt;
                    if (d2 < reach * reach && d2 < bestContactD) { bestContactD = d2; bestContact = j; }
                  }
                  if (d2 < sr2) {   // percepción: dentro de la visión y del cono
                    let seen = omni;
                    if (!seen) {
                      const dot = ddx * headx + ddy * heady; // = |d|·cos(θ)
                      seen = vc <= 0
                        ? (dot >= 0 || dot * dot < vc * vc * d2)  // cono >90°: solo ciego por detrás
                        : (dot > 0 && dot * dot > vc * vc * d2);  // cono <90°: solo hacia delante
                    }
                    if (seen) {
                      if (canEat) { if (d2 < bestPreyD) { bestPreyD = d2; bestPrey = j; } }
                      // Amenaza: j puede comerME (yo en su banda: rj/myR ∈ [threatLo,threatHi]; j más arriba en dieta).
                      else if (ratio >= threatLo && ratio <= threatHi && -dDiff > dietMargin && d2 < bestThreatD) { bestThreatD = d2; bestThreat = j; }
                      // El señuelo de j emite "comida aparente": atrae a i (∝ prominencia · 1/dist²) → emerge el cazador-emboscada.
                      if (lureAttract > 0) { const lj = this.lure[j]; if (lj > 0.12) { const lw = lj / (d2 + 1); lureAX += ddx * lw; lureAY += ddy * lw; } }
                    }
                  }
                }
              }
              j = W.cellNext[j];
            }
          }
        }
        // ---------- COMBATE ----------
        // En contacto, el atacante ataca con prob. = su impulso de ataque (3ª salida del cerebro). Cazar emerge del cerebro.
        const wantsAttack = bestContact !== -1 && this.alive[bestContact] && this.attackCD[i] <= 0 && rng.next() < this.atkOut[i];
        // La presa escapa (sin combate) por COBERTURA (vegetación densa de su celda) o por VELOCIDAD (más rápida que el cazador).
        let preyEscapes = false;
        if (wantsAttack) {
          if (coverStrength > 0 && rng.next() < coverStrength * res[W.cellIndexAt(x[bestContact], y[bestContact])]) preyEscapes = true;
          else if (fleeSpeed > 0) {
            const myV = this.vmax[i], adv = myV > 1e-4 ? this.vmax[bestContact] / myV - 1 : 0; // ventaja de velocidad de la presa
            if (adv > 0) { let pe = fleeSpeed * adv; if (pe > fleeCap) pe = fleeCap; if (rng.next() < pe) preyEscapes = true; }
          }
        }
        if (wantsAttack && !preyEscapes) {
          const j = bestContact;
          // Fuerza = (tamaño+0.1)^sizeAdvantage. Resolución estocástica: el ganador emerge del tamaño + azar.
          const fi = Math.pow(this.genes[i * NG + G.size] + 0.1, sizeAdv);
          const fj = Math.pow(this.genes[j * NG + G.size] + 0.1, sizeAdv);
          if (rng.next() < fi / (fi + fj)) {
            // Gana i: la presa muere. Pecera: la presa aporta su materia real (E + bodyMatter); lo no extraído → restos; lo que rebosa → pool. Conserva.
            const Mj = (E[j] > 0 ? E[j] : 0) + this.bodyMatter[j];
            const g = en.preyGain * Mj * this.effHunt[i];
            const remainder = Mj - g;                                   // ineficiencia trófica + lo no comido → restos
            let stored = g, room = this.eMax[i] - E[i]; if (room < 0) room = 0;
            if (stored > room) { W.N[ci] += (stored - room); stored = room; } // rebosa el tope → nutriente local (celda del depredador)
            E[i] += stored;
            if (remainder > 0) this._depositCarrion(x[j], y[j], remainder);
            this._kill(j, 'eaten'); this.kills++;
            this.attackCD[i] = handlingTime; // a digerir antes de volver a cazar
          } else {
            // Gana el defensor: el atacante i pierde failDamage·eMax y solo muere si llega a 0 (freno denso-dependiente graduado).
            const dmg = failDamage * this.eMax[i];
            // Pecera: i pierde como mucho lo que tiene; j aprovecha su bocado; el resto → nutriente. Conserva.
            let loss = dmg; const av = E[i] > 0 ? E[i] : 0; if (loss > av) loss = av;
            E[i] -= loss;
            const g = en.preyGain * loss * this.effHunt[j];
            let stored = g, room = this.eMax[j] - E[j]; if (room < 0) room = 0; if (stored > room) stored = room;
            E[j] += stored;
            W.N[ci] += (loss - stored); // herida disipada + lo que rebosa el tope de j → nutriente local
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
          const psr = this.radius[bestPrey] / myR - 1; preySizeRel = psr > 1 ? 1 : psr < -1 ? -1 : psr; // talla relativa (entrada 8): <0 presa menor · >0 mayor
          preyCover = res[W.cellIndexAt(x[bestPrey], y[bestPrey])] / Rmax * 2 - 1; // (P2) ESCAPABILIDAD de la presa (cobertura de su celda) ∈[−1,1] → entrada 9: no atacar a la que escapará
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
          if (!gazeSet) { gzx = ddx; gzy = ddy; gazeSet = true; } // vigila la amenaza
        }
      }

      // ---------- CEREBRO NEURONAL ----------
      // La RNN (pesos = genoma) decide el deseo de movimiento y el impulso de ataque a partir de las señales sensoriales.
      // Suma la atracción de los señuelos vecinos al gradiente de comida y normaliza (sin señuelos → idéntico al puro).
      dfx += lureAttract * lureAX; dfy += lureAttract * lureAY;
      { const _fm = Math.sqrt(dfx * dfx + dfy * dfy) || 1; dfx /= _fm; dfy /= _fm; }
      {
        const inp = this._brIn;
        inp[0] = dfx; inp[1] = dfy; inp[2] = preyDX; inp[3] = preyDY;
        inp[4] = threatDX; inp[5] = threatDY; inp[6] = E[i] / this.eMax[i] * 2 - 1;
        inp[7] = (res[ci] / Rmax) * 2 - 1;   // cobertura local (uso táctico del refugio)
        inp[8] = preySizeRel;                 // talla relativa de la presa (evitar presa grande)
        inp[9] = preyCover;                   // escapabilidad de la presa (no atacar a la que escapará)
        this._brain(i);
        dx = this._brOut[0]; dy = this._brOut[1];
      }

      // ---------- MOVIMIENTO ----------
      // vmax y turnRate emergen de la morfología. El cuerpo no gira instantáneamente: rota hacia el deseo ≤ turnRate/tick.
      const vmaxI = this.vmax[i];
      const turn = this.turnRate[i];
      const dmag = Math.sqrt(dx * dx + dy * dy);
      if (dmag > 1e-4) {
        const ddx = dx / dmag, ddy = dy / dmag;          // dirección deseada (unitaria)
        const cs0 = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
        let curx, cury;
        if (cs0 < 1e-4) { curx = ddx; cury = ddy; }      // parado: arranca hacia el deseo
        else { curx = vx[i] / cs0; cury = vy[i] / cs0; }
        // Girar la dirección actual hacia la deseada (interpolación limitada por la agilidad).
        let ndx = curx + (ddx - curx) * turn, ndy = cury + (ddy - cury) * turn;
        const nm = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
        vx[i] = ndx / nm * vmaxI; vy[i] = ndy / nm * vmaxI;
      } else {
        // Sin deseo: deriva con leve ruido térmico (no es estrategia, es física).
        const ang = (rng.next() - 0.5) * 0.6;
        const cs = Math.cos(ang), sn = Math.sin(ang);
        let nvx = vx[i] * cs - vy[i] * sn, nvy = vx[i] * sn + vy[i] * cs;
        const sp = Math.sqrt(nvx * nvx + nvy * nvy);
        if (sp < 1e-3) { nvx = (rng.next() - 0.5); nvy = (rng.next() - 0.5); }
        const target = 0.3 * vmaxI, m = Math.sqrt(nvx * nvx + nvy * nvy) || 1;
        vx[i] = nvx / m * target; vy[i] = nvy / m * target;
      }
      const dist = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      // Rumbo persistente (render): solo se reorienta si hay avance real; si v≈0 conserva el último.
      if (dist > 1e-3) this.heading[i] = Math.atan2(vy[i], vx[i]);
      // Guardar la mirada (render): al objetivo si lo hay, si no en la dirección de avance.
      if (!gazeSet) { gzx = vx[i]; gzy = vy[i]; }
      const gm = Math.sqrt(gzx * gzx + gzy * gzy) || 1;
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
      // Coste térmico: desviarse del óptimo (temp_pref) multiplica el coste basal (segundo eje de nicho).
      const tcell = W.cellIndexAt(x[i], y[i]);
      let tmis = this.tempPref[i] - W.temp[tcell]; if (tmis < 0) tmis = -tmis;
      // Coste de nado ∝ v²·esfuerzo·aleteo·transporte(masa)·arrastre(forma) → la velocidad la limita el presupuesto energético.
      const dragMul = kDrag > 0 ? 1 + kDrag * (this.drag[i] > dragRef ? this.drag[i] - dragRef : 0) : 1; // arrastre de la forma encarece el nado (0 = inerte)
      const metabCost = this.baseCost[i] * (1 + kTemp * tmis) + moveCost * dist * dist * (1 + kEffort * this.effort[i]) * (1 + this.flapCost[i]) * this.haulMul[i] * dragMul;
      // Pecera: el coste se topa a la energía disponible (E baja a 0, no a negativo); la materia respirada → nutriente local. Conserva.
      let metabRet = metabCost; const metabAv = E[i] > 0 ? E[i] : 0; if (metabRet > metabAv) metabRet = metabAv;
      W.N[tcell] += metabRet; E[i] -= metabRet;

      // Alimentación herbívora: absorbe del campo de recurso. forageReach>0 → un cuerpo grande pasta de un área (payoff de talla).
      const eMaxI = this.eMax[i], effH = this.effHerb[i];
      let eFalta = eMaxI - E[i];
      if (eFalta > 0 && effH > 1e-4) {
        const absE = this.absEff[i];
        const forageR = forageReach > 0 ? Math.round(forageReach * this.genes[i * NG + G.size]) : 0;
        if (forageR === 0) {
          // — una sola celda —
          const cell = tcell;                                          // celda tras moverse (ya calculada)
          const grazable = res[cell] - grazeRefuge * W.capacity[cell]; // solo por encima del refugio de rebrote
          if (grazable > 0) {
            let units = grazable * absE;
            const maxByNeed = eFalta / (epu * effH);
            if (units > maxByNeed) units = maxByNeed;
            E[i] += units * epu * effH;
            res[cell] -= units; // baja en unidades de recurso (nunca por debajo del refugio)
            W.N[cell] += units * epu * (1 - effH); // pasto removido NO asimilado → detrito/nutriente LOCAL (conserva)
          }
        } else {
          // — barrido de área (2·forageR+1)² celdas: el grande cubre más terreno y deplea más ancho —
          const cols = W.cols, rows = W.rows;
          let col = (x[i] / W.cellW) | 0; if (col < 0) col = 0; else if (col >= cols) col = cols - 1;
          let row = (y[i] / W.cellH) | 0; if (row < 0) row = 0; else if (row >= rows) row = rows - 1;
          const c0 = col - forageR < 0 ? 0 : col - forageR, c1 = col + forageR >= cols ? cols - 1 : col + forageR;
          const r0 = row - forageR < 0 ? 0 : row - forageR, r1 = row + forageR >= rows ? rows - 1 : row + forageR;
          for (let rr = r0; rr <= r1 && eFalta > 0; rr++) {
            for (let cc = c0; cc <= c1 && eFalta > 0; cc++) {
              const cell = rr * cols + cc;
              const grazable = res[cell] - grazeRefuge * W.capacity[cell];
              if (grazable <= 0) continue;
              let units = grazable * absE;
              const maxByNeed = eFalta / (epu * effH);
              if (units > maxByNeed) units = maxByNeed;
              const gain = units * epu * effH;
              E[i] += gain; eFalta -= gain;
              res[cell] -= units;
              W.N[cell] += units * epu * (1 - effH); // pasto removido no asimilado → nutriente local (conserva)
            }
          }
        }
      }

      // Carroñeo: se rige por effScav. El carroñero fino vacía rápido el cadáver; el cazador puro apenas lo aprovecha.
      const effC = this.effScav[i];
      if (effC > 1e-4 && E[i] < eMaxI) {
        const ccell = tcell;
        const avail = carrion[ccell];
        if (avail > 0) {
          let got = avail * carrionAbsRate * effC;
          const room = eMaxI - E[i];
          if (got > room) got = room;
          if (got > avail) got = avail;
          E[i] += got; carrion[ccell] -= got;
        }
      }

      // ---------- MUERTE ----------
      if (E[i] <= 0) {
        this._kill(i, 'starv'); continue;
      }
      this.age[i]++;
      // Muerte por vejez: la senescencia arranca en la edad de madurez y su pendiente la escala senesMult.
      const over = this.age[i] - this.matureAge[i];
      if (over > 0) {
        const t = over / age.scale;
        if (rng.next() < age.mortality * this.senesMult[i] * t * t) {
          this._kill(i, 'age'); // _kill deposita el cadáver entero como carroña
          continue;
        }
      }

      // ---------- REPRODUCCIÓN ----------
      if (this.attackCD[i] > 0) this.attackCD[i]--; // enfriamiento de ataque
      if (this.cooldown[i] > 0) this.cooldown[i]--; // en cooldown no se reproduce
      // Gate de madurez: no cría antes de la edad de madurez (madurar pronto = ventaja r; tarde = longevo, K).
      else if (this.age[i] >= this.matureAge[i] && E[i] >= this.reproNeedE[i]) {
        // Sexual: busca pareja compatible cercana; si no hay → fallback asexual (clon) si está permitido.
        const mate = sexual ? this._findMate(i) : -1;
        const child = (mate >= 0 || allowAsexual) ? this._alloc() : -1;
        if (child >= 0) {
          const sexualBirth = mate >= 0;
          if (sexualBirth) crossover(this.genes, i, mate, child, this.cfg.mut, rng);
          else copyMutated(this.genes, i, child, this.cfg.mut, rng); // clon mutado (solo si allowAsexual)
          computePhenotype(this, child);
          const bm = (cfg.energy.carcassValue || 0) * this.eMax[child]; // materia estructural del cuerpo de la cría
          if (W.nutrientAround(tcell, birthGatherR) < bm) {
            // Pecera sin nutriente para construir el cuerpo → NO nace (techo de población endógeno). Rollback del _alloc.
            this.alive[child] = 0; this.free[this.freeTop++] = child; this.popCount--;
          } else {
            this.bodyMatter[child] = bm;
            W.takeNutrientAround(tcell, birthGatherR, bm);              // el cuerpo se construye con nutriente de la zona (conserva)
            if (sexualBirth) this.birthCount.sexual++; else this.birthCount.asexual++;
            E[i] -= this.investE[i];
            const childE = Math.min(this.investE[i], this.eMax[child]);
            const excess = this.investE[i] - childE; if (excess > 0) W.N[tcell] += excess; // sobra de inversión (tope de la cría) → nutriente local
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
            this.atkOut[child] = 0; this.atkDrive[child] = 0; // impulso de ataque a cero (lo fija su cerebro al vivir)
            this.lineage[child] = this.lineage[i];          // hereda linaje sin mutar
            this.generation[child] = this.generation[i] + 1; // un escalón más en el árbol
            this.cooldown[i] = baseCD;
            this.births++;
          }
        }
        // Si no hay slot libre (tope de población): no nace, el progenitor conserva su E.
      }
    }

    this.tick++;
  }

  // Busca la pareja compatible más cercana: vecino vivo dentro de mateRadius con distancia genética < umbral. Devuelve índice o -1.
  _findMate(i) {
    const W = this.world, x = this.x, y = this.y, cfg = this.cfg, world = cfg.world;
    const wrap = world.wrap, ww = world.size, wh = world.size;
    const mr = cfg.repro.mateRadius, mr2 = mr * mr, thr = cfg.repro.speciesGenThreshold;
    const hc = W.hashCell, hCols = W.hCols, hRows = W.hRows;
    const hx = (x[i] / hc) | 0, hy = (y[i] / hc) | 0;
    // Selección sexual: elige la pareja que mejor encaja con la preferencia propia (atractivo = 1 − |orn − pref|) → runaway de Fisher.
    const prefI = this.genes[i * NUM_GENES + G.pref];
    let best = -1, bestScore = -1;
    const scanR = Math.min(3, Math.max(1, Math.ceil(mr / hc))); // adaptativo a mateRadius (cap 3, como la percepción)
    for (let oy = -scanR; oy <= scanR; oy++) {
      for (let ox = -scanR; ox <= scanR; ox++) {
        const gx = ((hx + ox) % hCols + hCols) % hCols, gy = ((hy + oy) % hRows + hRows) % hRows;
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

  // Forward del cerebro recurrente (pesos = genes BRAIN): lee _brIn + el estado oculto previo (brainHid[i]); escribe el nuevo
  // estado oculto y _brOut = deseo de movimiento (dx,dy) + impulso de ataque. Sin asignaciones.
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
    let ox = (g[bO] - 0.5) * sc, oy = (g[bO + 1] - 0.5) * sc, oa = (g[bO + 2] - 0.5) * sc; // 3ª salida = ataque
    for (let h = 0; h < H; h++) {
      const hv = hid[h];
      ox += hv * (g[wHo + h * O] - 0.5) * sc;
      oy += hv * (g[wHo + h * O + 1] - 0.5) * sc;
      oa += hv * (g[wHo + h * O + 2] - 0.5) * sc;
    }
    this._brOut[0] = Math.tanh(ox); this._brOut[1] = Math.tanh(oy);
    const a = (Math.tanh(oa) + 1) * 0.5;                // impulso de ataque ∈[0,1] (prob. de atacar en contacto)
    this.atkOut[i] = a;
    this.atkDrive[i] = this.atkDrive[i] * 0.92 + a * 0.08; // EMA suave → "ceño" estable del render (emergente)
  }

  _depositCarrion(px, py, amount) {
    if (amount <= 0) return;
    const W = this.world, cell = W.cellIndexAt(px, py);
    W.carrion[cell] += amount; // unidades de ENERGÍA (se come directamente; decae en world.decayCarrion)
  }
}
