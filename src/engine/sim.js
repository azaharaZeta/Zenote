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
    this.flapCost = new Float32Array(cap); // Capa 3: coste de NADO extra por aletear (golpe activo); ver organism.js
    this.haulMul = new Float32Array(cap);  // (A) coste de TRANSPORTE ∝ masa: multiplica el coste de NADO; ver organism.js
    this.drag = new Float32Array(cap);     // (B) ARRASTRE emergente de la forma (Dmul de bodyplan): antes solo frenaba; ahora ENCARECE el nado (sim.js); ver organism.js
    this.senseR = new Float32Array(cap);   // alcance visual efectivo (emerge de sense · e_fov)
    this.visCos = new Float32Array(cap);   // cos(semiángulo del cono de visión) → visión direccional
    this.gazeX = new Float32Array(cap);    // dirección de la mirada (a la presa/amenaza, si no al frente)
    this.gazeY = new Float32Array(cap);    // — solo para el render (pupila reactiva), no afecta a la sim
    this.eMax = new Float32Array(cap);
    this.bodyMatter = new Float32Array(cap); // CERRADO EN MATERIA: materia estructural BLOQUEADA en el cuerpo (= carcassValue·eMax);
                                             //   se retira del pool N al nacer y se devuelve (a carroña) al morir. Inerte en modelo abierto.
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
    // Id ÚNICO por organismo a lo largo de toda la vida de la sim (≠ slot, que se reutiliza del pool). El render lo usa
    // como clave estable de su caché de sprites: un slot reutilizado por un organismo nuevo recibe un serial distinto.
    // (this._serial vive en el constructor → persiste entre re-siembras para no colisionar serials viejos↔nuevos.)
    this.serialOf = new Int32Array(cap);

    this.tick = 0;
    this.births = 0;
    this.deaths = 0;
    this.nextLineageId = 0;
    this.kills = 0; // presas abatidas por depredación (instrumentación)
    // Demografía ACUMULADA de TODO el ecosistema (gráfica del laboratorio). Muertes por causa:
    // 'eaten' = cazado, 'combat' = murió atacando (ataque fallido), 'starv' = hambre, 'age' = vejez.
    this.deathCause = { starv: 0, combat: 0, age: 0, eaten: 0 };
    // Nacimientos por tipo: 'sexual' = recombinación de dos padres · 'asexual' = clon mutado (sin pareja).
    this.birthCount = { sexual: 0, asexual: 0 };

    this._seedInitial();
    this._rebuildActive();

    // CERRADO EN MATERIA: el nutriente libre inicial = presupuesto de materia − la ya BLOQUEADA (vegetación llena +
    // E y cuerpo de los fundadores). A partir de aquí N + vegetación + (E+cuerpo)·vivos + carroña se CONSERVA.
    if (cfg.world.closedMatter) {
      const epu = cfg.resource.energyPerUnit;
      let res = 0; const R = this.world.resource; for (let k = 0; k < R.length; k++) res += R[k];
      let bio = 0; for (let a = 0; a < this.activeCount; a++) { const i = this.active[a]; bio += this.E[i] + this.bodyMatter[i]; }
      let n0 = cfg.world.matterBudget - res * epu - bio; if (n0 < 0) n0 = 0; // sobrante de materia → nutriente libre inicial
      this.world.N.fill(n0 / this.world.N.length); // repartido UNIFORME por el campo (la dinámica lo concentra luego en manchas)
    }
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
    if (cause) this.deathCause[cause]++; // demografía: causa de muerte (todo el ecosistema)
    // CARROÑA: toda muerte deja cuerpo en su celda. Muerte NATURAL (vejez/hambre/combate) = cuerpo entero =
    // energía que quede + BIOMASA (carcassValue·eMax = tejido). CAZADO = solo SOBRAS (scrapReturn·biomasa): el
    // depredador ya se llevó casi todo → "restos". (Fase 2: el carroñeo será un eje de dieta propio → gusano.)
    const cfg = this.cfg;
    let carcass;
    if (cfg.world.closedMatter) {
      // CERRADO: el cuerpo deposita su materia REAL (E que quede + cuerpo estructural `bodyMatter`), no una biomasa
      // conjurada. La presa CAZADA ('eaten') ya la repartió el bloque de depredación (predador + restos + pool) →
      // aquí NO se deposita nada (evita doble conteo). Conserva: nada de materia se crea ni se pierde al morir.
      carcass = cause === 'eaten' ? 0 : (this.E[i] > 0 ? this.E[i] : 0) + this.bodyMatter[i];
    } else {
      const biomass = (cfg.energy.carcassValue || 0) * this.eMax[i];
      carcass = cause === 'eaten'
        ? (cfg.energy.scrapReturn != null ? cfg.energy.scrapReturn : 0.15) * biomass
        : (this.E[i] > 0 ? this.E[i] : 0) + biomass;
    }
    if (carcass > 0) this._depositCarrion(this.x[i], this.y[i], carcass);
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
        this.genes[b + G.sense]  = 0.4 + rng.next() * 0.4;
        this.genes[b + G.repro_thr] = rng.next() * 0.25; // se reproduce a ~media energía
        this.genes[b + G.invest]    = 0.1 + rng.next() * 0.3;
        this.genes[b + G.e_fov]   = rng.next() * 0.35;       // ojos frontales de largo alcance (cazador)
        // La FORMA nadadora cazadora y las GANAS de atacar EMERGEN (nodos + cerebro sembrado, abajo); aquí solo ecología.
      } else {
        // Guild herbívoro: dieta baja (donde la selección los llevaría igualmente). El impulso de ataque
        // emerge del cerebro (sembrado a ~0.5 → la selección lo baja en herbívoros, que no ganan cazando).
        this.genes[b + G.diet] = rng.next() * 0.2;
        this.genes[b + G.size] = rng.next() * 0.3; // presa pequeña al inicio: el cazador coge ventaja
      }
      // Cerebro competente de partida; carnívoros fundadores con sesgo de ataque alto (cazan en contacto desde ya).
      seedBrain(this.genes, i, rng, (!dietLow && n < nCarn) ? 0.27 : 0);
      computePhenotype(this, i);
      this.bodyMatter[i] = (cfg.energy.carcassValue || 0) * this.eMax[i]; // materia del cuerpo (cerrado: bloqueada del pool)
      this.x[i] = rng.next() * W.width;
      this.y[i] = rng.next() * W.height;
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
    // Bases per-run de los genes decorativos de DISPERSIÓN (segmentos, piel, glow, color). blend() interpola
    // entre la base compartida (div=0 → todos iguales) y la muestra individual (div=1 → variado actual).
    // c_lum (glow + luminosidad) y c_sat (color): sembrado MÁS ALTO (0.3/0.25 + cola) → organismos más
    // luminosos, con glow visible y menos grises. Antes (rng·rng ≈ 0.25) salían oscuros/apagados.
    const baseTex2 = rng.next();
    const baseOsc = rng.next();                           // fase de oscilación base por run (div=0 → marcha COORDINADA y uniforme)
    const baseLum = 0.4 + rng.next() * rng.next() * 0.5, baseSat = 0.32 + rng.next() * rng.next() * 0.55;
    const blend = (base, sample) => base + (sample - base) * div;
    const jit = (v) => { const x = v + rng.gaussian() * J; return x < 0 ? 0 : x > 1 ? 1 : x; };
    for (let n = 0; n < cfg.pop.initial; n++) {
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
      // La FORMA (cuerpo/apéndices) se siembra abajo vía el bloque de NODOS (B2/B3). Aquí solo color/ojos/ornamento.
      this.genes[b + G.c_eye] = jit(0.5);   // #13: c_app/c_tip retirados
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
      // Cohorte proto-carnívora: SOLO sesga la ECOLOGÍA (dieta/caza), el cuerpo sigue sencillo → la morfología
      // cazadora EMERGE. El impulso de ataque se siembra en el cerebro (seedBrain atkBias, arriba). Mantiene
      // la coexistencia depredador-presa sin inyectar complejidad.
      if (n < nCarn) {
        this.genes[b + G.diet] = jit(0.8);
        // Cohorte comecarne dividida en las DOS proto-estrategias del eje caza↔carroña (cruza el valle de arranque,
        // igual que la dieta; la morfología fina del gusano sigue EMERGIENDO por selección). CAZADOR (par): grande,
        // rápido, visión frontal estrecha. CARROÑERO proto-gusano (impar): cuerpo BARATO (pequeño, lento, visión
        // ancha, cría pronto) → puede vivir de la carroña ESCASA, donde un cuerpo caro de cazador moriría de hambre.
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
      // --- NODOS (B2): cuerpo generativo. La RAÍZ (cabeza) siempre; los nodos 1..7 con presencia DECRECIENTE
      //     (≈50% el 1º, ≈29% el 2º-3º, ≈9% el resto) → variedad inmediata (cabezas, cadenas y tentáculos)
      //     pero la mayoría sencillos. La complejidad sigue evolucionando; esto solo da materia prima al arranque. ---
      this.genes[b + G.n0_present] = 1;                        // raíz siempre presente
      this.genes[b + G.n0_size] = jit(0.5); this.genes[b + G.n0_aspect] = jit(0.35);
      this.genes[b + G.n0_parent] = 0; this.genes[b + G.n0_angle] = 0; this.genes[b + G.n0_attach] = 0;
      this.genes[b + G.n0_osc_amp] = jit(0.5); this.genes[b + G.n0_osc_phase] = blend(baseOsc, rng.next());
      this.genes[b + G.n0_tipShape] = jit(0.5);                // forma: elipse neutra al sembrar (la silueta diversifica por deriva)
      this.genes[b + G.n0_gaitMode] = jit(0);                  // modo: ondular puro al sembrar (el aleteo emerge por deriva)
      // NODO 1 = COLA propulsora (renacuajo): con headThrust bajo la cabeza sola apenas avanza, así que se siembra
      // una cola TRASERA que ondula (emit≈π → gait≈+1) → el fundador NADA bien desde el tick 1 (evita el colapso).
      // A diversidad 0 todos los fundadores son renacuajos casi IDÉNTICOS (lo más básico); la morfología
      // DIVERSIFICA por selección/mutación y, a más diversidad, por los nodos extra (abajo).
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
      // NODOS 2..7 (complejidad extra): su PRESENCIA escala con la diversidad → a div=0 NINGUNO (renacuajo puro),
      // a div=1 ≈ el reparto previo (~29% nodo2-3, ~9% resto). Así "diversidad inicial 0" = lo más básico posible.
      for (let k = 2; k < NODE_COUNT; k++) {
        const nb = b + G['n' + k + '_present'];                // 8 campos contiguos por nodo
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
      // PROTO-GUSANO (cohorte carroñera, impar): sustituye el cuerpo por una CADENA AXIAL de segmentos → arranca
      // ELONGADO, cruzando el valle morfológico (como el kit cazador cruza el de la dieta; la forma sigue evolucionando
      // y `k_scavThin` la mantiene). elongN pondera por ÁREA → segmentos AXIALES SUSTANCIALES (aspect medio, no hilos)
      // y angle≈π (atrás, axial → estira el eje y PROPULSA). parentGene 0.9 → cada nodo cuelga del anterior (cadena).
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
      computePhenotype(this, i);
      this.bodyMatter[i] = (cfg.energy.carcassValue || 0) * this.eMax[i]; // materia del cuerpo (cerrado: bloqueada del pool)
      this.x[i] = rng.next() * W.width; this.y[i] = rng.next() * W.height;
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

  // ---- Un tick de simulación ----
  step() {
    const cfg = this.cfg, W = this.world, world = this.cfg.world, rng = this.rng;
    const wrap = world.wrap, ww = world.width, wh = world.height;
    const en = cfg.energy, moveCost = en.moveCost, kEffort = en.k_effort, epu = cfg.resource.energyPerUnit, Rmax = cfg.resource.R_max;
    const kDrag = en.k_drag || 0, dragRef = en.dragRef != null ? en.dragRef : 1; // (B) coste de nado ∝ arrastre de la forma (Dmul); leídos en vivo (0 = inerte)
    const carcassValue = en.carcassValue || 0; // biomasa del cadáver (∝ eMax) que SUMA a la energía almacenada de la presa al cazarla
    const grazeRefuge = cfg.resource.grazeRefuge; // fracción protegida de cada celda
    const forageReach = cfg.resource.forageReach || 0; // (prototipo, 0=INERTE) celdas de alcance de forrajeo a talla máx → el grande pasta de un ÁREA (∝ radio)
    const kTemp = cfg.energy.k_temp; // coste por desviarse del óptimo térmico
    const NG = NUM_GENES, sizeAdv = cfg.combat.sizeAdvantage;
    const handlingTime = cfg.combat.handlingTime;
    const failDamage = cfg.combat.failDamage != null ? cfg.combat.failDamage : 1; // energía perdida al fallar (×eMax); ≥1 ≈ muerte segura
    const dietMargin = cfg.combat.dietMargin; // mínima diferencia de dieta para considerar presa
    // Banda de tamaño de presa (depredación selectiva → nichos de talla). inPreyBand(depredador, presa).
    const preyLo = cfg.combat.preyBandLo != null ? cfg.combat.preyBandLo : 0;
    const preyHi = cfg.combat.preyBandHi != null ? cfg.combat.preyBandHi : 1;
    const inPreyBand = (predR, preyR) => { const ratio = preyR / predR; return ratio >= preyLo && ratio <= preyHi; };
    // Bandas precalculadas para el bucle caliente (evitan la closure y una división por vecino): presa = rj/myR
    // ∈ [preyLo,preyHi]; amenaza = myR/rj ∈ [preyLo,preyHi] ⟺ rj/myR ∈ [1/preyHi, 1/preyLo].
    const threatLo = 1 / preyHi, threatHi = 1 / preyLo, maxRadius = cfg.expr.size.max;
    const refuge = cfg.refuge, refugeOn = !!(refuge && refuge.enabled);     // refugio de presa (estabilizador L-V)
    const coverStrength = refugeOn ? (refuge.strength != null ? refuge.strength : 0) : 0; // #7: cobertura graduada por vegetación
    const fleeSpeed = cfg.combat.fleeSpeed || 0;                            // escape por VELOCIDAD relativa (0 = off, modelo previo)
    const lureReach = cfg.combat.lureReach || 0;                            // alcance de caza extra por señuelo (anglerfish)
    const lureAttract = cfg.combat.lureAttract || 0;                        // (P1) ATRACCIÓN de presa por señuelo (emboscada): sesga el gradiente de comida de los vecinos hacia el portador (0 = off)
    const age = cfg.age, combat = cfg.combat.enabled, sexual = cfg.repro.sexual, allowAsexual = cfg.repro.asexual;
    const baseCD = cfg.repro.cooldown;
    const closed = world.closedMatter; // CERRADO EN MATERIA: re-enruta toda pérdida al pool de nutriente (W.N) en vez de evaporarla

    W.regen();
    W.decayCarrion();   // los cadáveres se descomponen (y devuelven parte al pasto = ciclo de nutrientes)
    if (closed) W.diffuseNutrient(); // CERRADO: el campo de nutriente libre se difunde despacio → manchas fértiles que migran

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
    const carrion = W.carrion, carrionAbsRate = cfg.resource.carrionAbsRate || 0; // carroña + ritmo de carroñeo (Fase 1: vía effCarn)

    for (let a = 0; a < count; a++) {
      const i = active[a];
      if (!this.alive[i]) continue; // pudo morir como presa este tick

      // ---------- PERCEPCIÓN + DESEO ----------
      // Término comida: ascenso por el gradiente del campo de recurso (físico, O(1)).
      const ci = W.cellIndexAt(x[i], y[i]);
      const cx = ci % cols, cy = (ci / cols) | 0;
      const xl = cx > 0 ? ci - 1 : ci, xr = cx < cols - 1 ? ci + 1 : ci;
      const yt = cy > 0 ? ci - cols : ci, yb = cy < rows - 1 ? ci + cols : ci;
      // Gradiente DEPENDIENTE DE DIETA: cada organismo asciende hacia lo que PUEDE comer — vegetación
      // (effHerb·∇recurso) y/o carroña (effScav·∇carroña, escalada a unidades de recurso) → el carroñero navega
      // hacia los cadáveres con la MISMA conducta de búsqueda ya evolucionada (sin añadir entrada al cerebro).
      const effHi = this.effHerb[i], cS = this.effScav[i] / (epu * 3);
      let dfx = effHi * (res[xr] - res[xl]) + cS * (carrion[xr] - carrion[xl]);
      let dfy = effHi * (res[yb] - res[yt]) + cS * (carrion[yb] - carrion[yt]);
      // (P1) gradiente CRUDO (sin normalizar aún): el señuelo de vecinos le sumará una atracción (escaneo abajo) y se
      // normaliza justo antes del cerebro. Sin señuelos cerca → idéntico al modelo previo (normalizado igual).

      let dx = 0, dy = 0;   // el deseo de movimiento lo decide el cerebro (abajo), no una regla fija

      // Mirada (solo render): por defecto al frente; si ve presa/amenaza, la sigue (se fija abajo).
      let gzx = 0, gzy = 0, gazeSet = false;
      // Direcciones unitarias a presa/amenaza (0 si ninguna) → entradas del cerebro neuronal.
      let preyDX = 0, preyDY = 0, threatDX = 0, threatDY = 0, preySizeRel = 0, preyCover = 0; // preySizeRel/preyCover = talla y escapabilidad de la presa más cercana (entradas 8 y 9; 0 si no ve presa)
      let lureAX = 0, lureAY = 0;   // (P1) atracción acumulada de SEÑUELOS vecinos → sesga el gradiente de comida (emboscada)

      // Términos presa/amenaza: solo si el combate está activo (Fase 2). Alimentan las entradas del cerebro
      // (dirección a presa/amenaza) y la detección de solape para el combate.
      if (combat) {
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
        // Precálculo por agente (fuera del bucle de vecinos): la mayoría de vecinos del bloque de celdas caen
        // MÁS LEJOS que la visión Y que el alcance de captura → se descartan con solo la distancia (sin calcular
        // dieta/banda/contacto). `scanMax2` = cota superior (rj ≤ maxRadius) del radio que de verdad importa.
        const myDiet = this.diet[i], reachExt = lureReach * this.lure[i] * myR + this.morphReach[i]; // señuelo + apéndices frontales (Capa 2)
        const reachMax = myR + maxRadius + reachExt;
        const scanMax2 = sr2 > reachMax * reachMax ? sr2 : reachMax * reachMax;
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
                if (d2 < scanMax2) {   // EARLY-CULL: fuera de visión Y de captura → ni se evalúa (la mayoría)
                  // Presa = en la BANDA DE TAMAÑO del depredador Y más abajo en dieta. Amenaza = lo contrario.
                  const rj = this.radius[j], ratio = rj / myR, dDiff = myDiet - this.diet[j];
                  const canEat = ratio >= preyLo && ratio <= preyHi && dDiff > dietMargin; // inline de inPreyBand(myR,rj)
                  if (canEat) {   // CONTACTO (combate): solo presas válidas dentro del alcance (#7: cobertura se aplica en la resolución)
                    const reach = myR + rj + reachExt;              // alcance de captura: señuelo + apéndices frontales
                    if (d2 < reach * reach && d2 < bestContactD) { bestContactD = d2; bestContact = j; }
                  }
                  if (d2 < sr2) {   // PERCEPCIÓN: dentro de la visión Y del cono (relativo al rumbo)
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
                      // (P1, EMBOSCADA) el SEÑUELO de j (anglerfish) emite "comida aparente": suma atracción al gradiente de
                      // comida de i, ∝ prominencia y ~1/dist² → la presa que VE un señuelo se acerca a él (la trampa). Es FÍSICA
                      // (la luz parece comida); QUIÉN invierte en señuelo y QUIÉN se deja atraer lo decide la selección → emerge el
                      // cazador-emboscada (barato, baja varianza) y la presa puede evolucionar a ignorarlo (carrera armamentística).
                      if (lureAttract > 0) { const lj = this.lure[j]; if (lj > 0.12) { const lw = lj / (d2 + 1); lureAX += ddx * lw; lureAY += ddy * lw; } }
                    }
                  }
                }
              }
              j = W.cellNext[j];
            }
          }
        }
        // ---------- COMBATE (resolución exacta §3.1) ----------
        // Al solaparse, el atacante ataca con probabilidad = su IMPULSO DE ATAQUE (3ª salida del cerebro,
        // del tick previo). Cazar/agredir EMERGE del cerebro seleccionado, no de un gen-atajo `aggro`.
        const wantsAttack = bestContact !== -1 && this.alive[bestContact] && this.attackCD[i] <= 0 && rng.next() < this.atkOut[i];
        // REFUGIO/COBERTURA (#7): la presa en vegetación densa se escabulle (Huffaker, GRADUADO). Cobertura =
        // vegetación VIVA en su celda (res∈[0,R_max]) → zona lush ≈ casi siempre escapa, claro pastado = expuesta.
        // Escape = NO hay combate (ni captura ni failDamage): no la alcanzó entre la maleza. Refugios DINÁMICOS;
        // el predador SÍ sigue su tick (mueve/come/cría): solo se salta esta resolución de combate.
        // ESCAPE: por COBERTURA (esconderse en vegetación, #7) O por VELOCIDAD (la presa que nada más rápido que el
        // cazador se zafa — la persecución es un duelo de velocidad). fleeSpeed=0 → solo cobertura (modelo previo, inerte).
        let preyEscapes = false;
        if (wantsAttack) {
          if (coverStrength > 0 && rng.next() < coverStrength * res[W.cellIndexAt(x[bestContact], y[bestContact])]) preyEscapes = true;
          else if (fleeSpeed > 0) {
            const myV = this.vmax[i], adv = myV > 1e-4 ? this.vmax[bestContact] / myV - 1 : 0; // ventaja de velocidad relativa de la presa (myV: renombrado para no ensombrecer el `vc`=visCos de arriba)
            if (adv > 0) { let pe = fleeSpeed * adv; if (pe > 0.95) pe = 0.95; if (rng.next() < pe) preyEscapes = true; }
          }
        }
        if (wantsAttack && !preyEscapes) {
          const j = bestContact;
          // Fuerza = (tamaño+0.1)^sizeAdvantage. Resolución estocástica: nadie gana "por regla", emerge del
          // genoma (tamaño) + azar. Las "ganas" de atacar ya están en la tasa de decisión (impulso del cerebro).
          const fi = Math.pow(this.genes[i * NG + G.size] + 0.1, sizeAdv);
          const fj = Math.pow(this.genes[j * NG + G.size] + 0.1, sizeAdv);
          if (rng.next() < fi / (fi + fj)) {
            // Gana i: la presa muere SIN depositar cadáver; i come según su eficiencia carnívora.
            // Ganancia = preyGain·(E_presa + carcassValue·eMax_presa): el cuerpo vale su BIOMASA (∝ eMax, tejido)
            // ADEMÁS de su energía almacenada → comer un animal alimenta aunque viniera hambriento, sin depender de
            // lo "gorda" que esté. Aditivo (no suelo): conserva el gradiente (presa gorda vale más → retiene el freno
            // L-V parcial). El tope eMax del depredador (abajo) evita el descontrol. Ver config.energy.carcassValue.
            if (closed) {
              // CERRADO: la presa aporta su materia REAL (E almacenada + cuerpo `bodyMatter`), no biomasa conjurada.
              // El depredador extrae preyGain·effHunt; lo NO extraído queda como RESTOS (carroña local) y lo que rebosa
              // su tope va al pool → la materia de la presa se conserva exactamente (predador + restos + nutriente).
              const Mj = (E[j] > 0 ? E[j] : 0) + this.bodyMatter[j];
              const g = en.preyGain * Mj * this.effHunt[i];
              const remainder = Mj - g;                                   // ineficiencia trófica + lo no comido → restos
              let stored = g, room = this.eMax[i] - E[i]; if (room < 0) room = 0;
              if (stored > room) { W.N[ci] += (stored - room); stored = room; } // rebosa el tope → nutriente local (celda del depredador)
              E[i] += stored;
              if (remainder > 0) this._depositCarrion(x[j], y[j], remainder);
            } else {
              // ABIERTO (modelo previo): ganancia = preyGain·(E_presa + carcassValue·eMax_presa). El término eMax es
              // biomasa CONJURADA (no sale de ningún almacén) → ver auditoría de energía. El tope eMax evita descontrol.
              const g = en.preyGain * (E[j] + carcassValue * this.eMax[j]) * this.effHunt[i];
              E[i] += g; if (E[i] > this.eMax[i]) E[i] = this.eMax[i];
            }
            this._kill(j, 'eaten'); this.kills++;
            this.attackCD[i] = handlingTime; // a digerir antes de volver a cazar
          } else {
            // Gana el defensor j: el atacante i resulta HERIDO (pierde `failDamage`·eMax de energía) y solo MUERE
            // si se queda a cero. Riesgo denso-dependiente GRADUADO en vez de muerte súbita: suaviza la extinción
            // estocástica carnívora (una mala tirada ya no mata) SIN quitar el freno — en esperanza, atacar presa
            // arriesgada sigue costando energía. `failDamage` ≥ 1 ≈ comportamiento antiguo (muerte casi segura).
            // (Medido en su día: sin coste alguno al fallar → sobre-disparo → colapso presa-depredador. No anular.)
            const dmg = failDamage * this.eMax[i];
            if (closed) {
              // CERRADO: i pierde como mucho lo que tiene (sin deuda negativa); j aprovecha su bocado; el resto de la
              // herida (lo perdido por i que j no almacena) → nutriente. Materia conservada (i → j + pool).
              let loss = dmg; const av = E[i] > 0 ? E[i] : 0; if (loss > av) loss = av;
              E[i] -= loss;
              const g = en.preyGain * loss * this.effHunt[j];
              let stored = g, room = this.eMax[j] - E[j]; if (room < 0) room = 0; if (stored > room) stored = room;
              E[j] += stored;
              W.N[ci] += (loss - stored); // herida disipada + lo que rebosa el tope de j → nutriente local
            } else {
              const bite = dmg < E[i] ? dmg : (E[i] > 0 ? E[i] : 0); // j no puede arrancar más energía de la que i tiene → conservación
              E[i] -= dmg;
              const g = en.preyGain * bite * this.effHunt[j]; // j aprovecha SOLO el bocado real (no-cazador effHunt≈0 → nada)
              E[j] += g; if (E[j] > this.eMax[j]) E[j] = this.eMax[j];
            }
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

      // ---------- CEREBRO NEURONAL: la RNN decide el deseo de movimiento (y el impulso de ataque) ----------
      // El deseo (dx,dy) sale de la red (pesos = genoma) a partir de las señales sensoriales; `_brain` también
      // escribe el impulso de ataque (atkOut/atkDrive). Comportamiento 100% emergente, sin estrategias programadas.
      // (P1) sumar la atracción de los señuelos vecinos al gradiente de comida y NORMALIZAR (la dirección que ve el
      // cerebro ya incluye el señuelo). Sin señuelos cerca / combate off → lureAX,lureAY=0 → idéntico al gradiente puro.
      dfx += lureAttract * lureAX; dfy += lureAttract * lureAY;
      { const _fm = Math.sqrt(dfx * dfx + dfy * dfy) || 1; dfx /= _fm; dfy /= _fm; }
      {
        const inp = this._brIn;
        inp[0] = dfx; inp[1] = dfy; inp[2] = preyDX; inp[3] = preyDY;
        inp[4] = threatDX; inp[5] = threatDY; inp[6] = E[i] / this.eMax[i] * 2 - 1;
        inp[7] = (res[ci] / Rmax) * 2 - 1;   // (#3) COBERTURA local: vegetación viva de su celda ∈[−1,1] → uso TÁCTICO del refugio (huir a la maleza) EMERGE
        inp[8] = preySizeRel;                 // (#3) TALLA relativa de la presa más cercana (0 si no ve presa) → evitar presa grande EMERGE
        inp[9] = preyCover;                   // (P2) ESCAPABILIDAD de la presa (cobertura de su celda) → no atacar a la que escapará EMERGE
        this._brain(i);
        dx = this._brOut[0]; dy = this._brOut[1];
      }

      // ---------- MOVIMIENTO ----------
      // La velocidad-capacidad (vmax) y la agilidad de giro (turnRate) EMERGEN de la
      // morfología (ver organism.js). El cuerpo no gira instantáneamente: rota su dirección
      // hacia el deseo como mucho `turnRate` por tick → los cuerpos torpes sobrepasan a la presa.
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
      // Rumbo PERSISTENTE para el render: solo se reorienta si hay avance real; si v≈0 conserva el último
      // (evita el parpadeo "al este" de atan2(0,0) en parados/recién nacidos/topes no-toroidales).
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
      // Coste térmico: desviarse del óptimo (temp_pref) frente a la temperatura local
      // multiplica el coste basal. Crea un segundo eje de nicho (regiones frías/cálidas).
      const tcell = W.cellIndexAt(x[i], y[i]);
      let tmis = this.tempPref[i] - W.temp[tcell]; if (tmis < 0) tmis = -tmis;
      // Coste de nado ∝ velocidad² · esfuerzo (arrastre hidrodinámico: ir rápido se dispara en
      // coste). Así la velocidad la limita el presupuesto energético: la presa (renta de pasto
      // escasa) no puede ir al máximo, pero el depredador (energía rica de la presa) sí → la
      // depredación es viable. La velocidad se paga; solo compensa donde hace falta (cazar/huir).
      const dragMul = kDrag > 0 ? 1 + kDrag * (this.drag[i] > dragRef ? this.drag[i] - dragRef : 0) : 1; // (B) el arrastre de la forma encarece el nado (0 = inerte)
      const metabCost = this.baseCost[i] * (1 + kTemp * tmis) + moveCost * dist * dist * (1 + kEffort * this.effort[i]) * (1 + this.flapCost[i]) * this.haulMul[i] * dragMul; // nado: aletear (Capa 3) + transporte∝masa (A) + arrastre∝forma (B)
      if (closed) {
        // CERRADO: no se puede gastar más MATERIA de la que se tiene (sin sobregiro fantasma que destruiría materia al
        // recuperarse comiendo). El coste efectivo se topa a la energía disponible → E baja a 0, nunca a negativo; esa
        // materia respirada vuelve al pool de nutriente. (Si el coste supera a E, muere de hambre igual en el chequeo de abajo.)
        let ret = metabCost; const av = E[i] > 0 ? E[i] : 0; if (ret > av) ret = av;
        W.N[tcell] += ret; E[i] -= ret; // materia respirada/nadada → nutriente de su celda actual
      } else {
        E[i] -= metabCost;
      }

      // Alimentación herbívora: absorber del campo de recurso. forageReach>0 → un cuerpo GRANDE pasta de un
      // ÁREA (forageR = forageReach·size celdas alrededor) → ventaja de forrajeo que la escasez local NO borra
      // (cubre más terreno). FRONTERA: defino que "más grande barre más área"; la selección decide. 0 = inerte.
      const eMaxI = this.eMax[i], effH = this.effHerb[i];
      let eFalta = eMaxI - E[i];
      if (eFalta > 0 && effH > 1e-4) {
        const absE = this.absEff[i];
        const forageR = forageReach > 0 ? Math.round(forageReach * this.genes[i * NG + G.size]) : 0;
        if (forageR === 0) {
          // — una sola celda (ruta base, idéntica al modelo previo) —
          const cell = W.cellIndexAt(x[i], y[i]);
          const grazable = res[cell] - grazeRefuge * W.capacity[cell]; // solo por encima del refugio de rebrote
          if (grazable > 0) {
            let units = grazable * absE;
            const maxByNeed = eFalta / (epu * effH);
            if (units > maxByNeed) units = maxByNeed;
            E[i] += units * epu * effH;
            res[cell] -= units; // baja en unidades de recurso (nunca por debajo del refugio)
            if (closed) W.N[cell] += units * epu * (1 - effH); // pasto removido NO asimilado → detrito/nutriente LOCAL (conserva)
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
              if (closed) W.N[cell] += units * epu * (1 - effH); // pasto removido NO asimilado → detrito/nutriente LOCAL (conserva)
            }
          }
        }
      }

      // Carroñeo (Fase 2): se rige por effScav (eje caza↔carroña). El carroñero especializado (scav alto) y de
      // cuerpo fino lo vacía rápido; el cazador puro (scav bajo) apenas aprovecha la carroña → nichos divergentes.
      const effC = this.effScav[i];
      if (effC > 1e-4 && E[i] < eMaxI) {
        const ccell = W.cellIndexAt(x[i], y[i]);
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
      // Muerte por vejez (#12): la senescencia arranca en la EDAD DE MADUREZ del gen (`matureAge`) y su pendiente
      // la escala el gen de ritmo de vida (`senesMult`). Antes de madurar no hay riesgo de vejez.
      const over = this.age[i] - this.matureAge[i];
      if (over > 0) {
        const t = over / age.scale;
        if (rng.next() < age.mortality * this.senesMult[i] * t * t) {
          this._kill(i, 'age'); // _kill deposita el cadáver entero como carroña
          continue;
        }
      }

      // ---------- REPRODUCCIÓN (asexual) ----------
      if (this.attackCD[i] > 0) this.attackCD[i]--; // enfriamiento de ataque (independiente)
      if (this.cooldown[i] > 0) this.cooldown[i]--; // en cooldown no se reproduce (SPEC §4)
      // Gate de MADUREZ (#12): no se cría antes de la edad de madurez (gen `mature_age`). Madurar pronto =
      // criar antes (ventaja r); tarde = retrasa la cría pero pospone la senescencia (longevo, K).
      else if (this.age[i] >= this.matureAge[i] && E[i] >= this.reproNeedE[i]) {
        // Repro SEXUAL: buscar pareja compatible cercana (distancia genética < umbral). Si no hay
        // ninguna al alcance → fallback ASEXUAL (clon). El "padre" i pone la energía y queda en cooldown.
        const mate = sexual ? this._findMate(i) : -1;
        // Si NO hay pareja y la reproducción asexual está PROHIBIDA → no hay cría (el padre conserva
        // su energía y su cooldown). Así encontrar pareja se vuelve una presión selectiva real.
        const child = (mate >= 0 || allowAsexual) ? this._alloc() : -1;
        if (child >= 0) {
          const sexualBirth = mate >= 0;
          if (sexualBirth) crossover(this.genes, i, mate, child, this.cfg.mut, rng);
          else copyMutated(this.genes, i, child, this.cfg.mut, rng); // clon mutado (solo si allowAsexual)
          computePhenotype(this, child);
          const bm = (cfg.energy.carcassValue || 0) * this.eMax[child]; // materia estructural del cuerpo de la cría
          if (closed && W.nutrientAround(tcell, 2) < bm) { // ¿hay bm de nutriente en la ZONA (5×5) del progenitor? (1 celda no basta de golpe)
            // CERRADO: sin nutriente libre para construir el cuerpo → NO nace (TECHO de población ENDÓGENO por materia).
            // Rollback del _alloc; el progenitor conserva E y cooldown (reintenta cuando haya nutriente). No cuenta nacimiento.
            this.alive[child] = 0; this.free[this.freeTop++] = child; this.popCount--;
          } else {
            this.bodyMatter[child] = bm;
            if (closed) W.takeNutrientAround(tcell, 2, bm);              // el cuerpo se CONSTRUYE con nutriente de la ZONA del progenitor (sale del campo N, conserva)
            if (sexualBirth) this.birthCount.sexual++; else this.birthCount.asexual++;
            E[i] -= this.investE[i];
            const childE = Math.min(this.investE[i], this.eMax[child]);
            if (closed) { const excess = this.investE[i] - childE; if (excess > 0) W.N[tcell] += excess; } // sobra de inversión (tope de la cría) → nutriente local
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
