// CONFIG — FUENTE ÚNICA de parámetros de Zenote 2. Agrupados y ordenados como en la UI; cada campo marcado
// "UI: <nombre en la UI>" o "NO UI". Los módulos del motor (world/genome/phenotype/sim) IMPORTAN y RE-EXPORTAN su
// objeto desde aquí (así los tests/worker que importan `SIM_P` etc. siguen funcionando). main.js/worker.js leen
// START/RENDER_P. CAMBIAR un valor aquí cambia el comportamiento; los defaults reproducen el motor actual (byte-idéntico).

// ===================== ARRANQUE — panel "Mundo nuevo" (necesita reiniciar) =====================
// (La "Semilla" es un campo de texto aparte; vacío = aleatoria. No tiene default numérico aquí.)
export const START = {
  worldSize: 1500,     // UI: Tamaño del mundo — lado del toro (u)
  seedCount: 100,      // UI: Sembrado inicial — nº de fundadores
  spawnSpread: 0.30,      // UI: Extensión del sembrado — 1 = todo el mundo (uniforme) · <1 = disco central de radio spread·mundo/2
  diversity: 0,        // UI: Diversidad inicial — 1 = fundadores variados (tono/fase/cerebro) · 0 = todos idénticos (clones)
  cap: 12000,          // NO UI — tope del pool (nº máx. de agentes)
  lightBase: 2.5,      // NO UI — irradiancia OPERATIVA del mundo (la UI "Luz solar" ajusta el MULTIPLICADOR, no esto). Sustituye a WORLD_P.lightBase al crear el mundo.
  nutrientInit: 1.5,   // NO UI — nutriente inicial por celda
  vegInit: 1.0,        // NO UI — biomasa vegetal inicial por celda (la base productora arranca sembrada)
};

// ===================== RENDER / VISUAL (cliente; NO afecta a la simulación) =====================
export const RENDER_P = {
  tps: 60,             // UI: Velocidad — ticks de simulación por segundo
  maxFps: 20,          // UI: FPS — límite de dibujos por segundo (no afecta a la sim)
  bloom: 0.75,         // UI: Bioluminiscencia — intensidad del aura+bloom (0 = apagado; recomendado en móvil/Baja)
  zoom: 1,             // UI: Zoom — zoom inicial
  colorMode: 'natural',// UI: Colorear por — modo inicial (natural · natmix · tissue · role · lineage)
  zoomMin: 1, zoomMax: 16,   // NO UI — límites del zoom (mín. 1 = el mundo entero cabe)
  dprCap: 2,           // NO UI — tope de devicePixelRatio (rendimiento)
  bloomDiv: 5,         // NO UI — el bloom reduce la capa de organismos a 1/bloomDiv y la reescala (downsampled)
  maxSnapMs: 250,      // NO UI — en MÁX: un fotograma cada N ms (≈4 fps; el lote ≤N garantiza ≥1 fps)
  undulation: 2.2,     // NO UI — amplitud de la onda viajera (carácter "vivo" del cuerpo)
  auraMul: 2.2,        // NO UI — radio del halo/aura (× tamaño del nodo)
  auraAlpha: 0.10,     // NO UI — opacidad base del aura (× bloom × energía)
  border: 'rgba(4,7,12,0.55)',  // NO UI — color del borde (nodos y ojos), trazo oscuro abisal
  borderW: 1.2,        // NO UI — grosor del borde de los nodos (px)
  speckleMax: 3,       // NO UI — máx. de motas de textura por nodo (1..speckleMax, según linaje)
};

// ===================== MUNDO (leyes físicas) =====================
export const WORLD_P = {
  cellRef: 20,          // NO UI — tamaño de celda (u) → rejilla ∝ tamaño de mundo (recurso/luz total ∝ área)
  lightBase: 0.06,      // NO UI — irradiancia base por defecto (el punto de operación lo fija START.lightBase=2.5). La UI "Luz solar" multiplica vía world.lightMul.
  lightContrast: 0.7,   // NO UI — heterogeneidad espacial de la luz (0 uniforme · 1 muy en parches)
  lightFlow: 0.0004,    // UI: Corriente del abismo — VELOCIDAD del "tiempo de flujo" del campo de luz: el fondo FLUYE formando
                        // ZONAS que se reorganizan (vagabundeo de fases, no traslación lineal) → no hay asentamiento permanente;
                        // los organismos persiguen el bloom (vía su sensor de ∇luz). 0 = estático (byte-idéntico). Lento/contemplativo.
  lightFlowEvery: 5,    // NO UI — cada cuántos ticks se re-hornea el campo de luz al derivar (la luz cambia despacio → throttle barato)
  dayNightAmp: 0.0,     // NO UI — amplitud del ciclo día/noche (0 = sin ciclo)
  dayNightPeriod: 2000, // NO UI — periodo del ciclo (ticks)
  diffuseN: 0.12,       // NO UI — difusión del nutriente (conservativa)
  diffuseDet: 0.05,     // NO UI — difusión del detrito (conservativa)
  decompose: 0.02,      // NO UI — descomposición del detrito/tick: materia → nutriente, energía → calor
  // --- VEGETACIÓN (productor PARAMETRIZADO, no genético): la base trófica. Capta LUZ (energía) creciendo logísticamente y
  // consumiendo NUTRIENTE (materia). Los ANIMALES la pastan. Conserva: nutriente↔veg↔detrito (materia); luz→veg→animal/calor (energía). ---
  vegGrowth: 0.12,      // NO UI — ritmo de crecimiento logístico de la vegetación/tick
  patchiness: 0.7,      // NO UI — dinámica de rebrote (adaptado de zenote1): 0 = logístico simple · 1 = logístico + DIFUSIÓN de
                        // semilla al vecindario → la vegetación forma y MIGRA parches orgánicos con el pastoreo↔rebrote (más vivo).
  vegKcoef: 6.0,        // NO UI — capacidad de carga por celda = vegKcoef · luz local (biomasa máx donde hay luz)
  vegEcoef: 1.0,        // NO UI — energía embebida por unidad de biomasa vegetal (lo que el pastador obtiene al comerla)
  vegDecay: 0.02,       // NO UI — senescencia vegetal/tick: biomasa → detrito (materia), energía → calor
  vegSeed: 0.05,        // NO UI — colonización: brote mínimo para que las celdas vacías con luz recolonicen (semilla logística)
  vegDiffuse: 0.04,     // NO UI — difusión espacial de la vegetación (conservativa) → se extiende a celdas vecinas
};

// ===================== GENOMA / DESARROLLO / MUTACIÓN =====================
export const GENOME_P = {
  partBudget: 32,      // NO UI — tope de partes del cuerpo (acota recursión)
  recCap: 8,           // NO UI — tope del límite de recursión por módulo
  modCap: 12,          // NO UI — tope de módulos del genoma
  radMin: 1.0, radMax: 6.0,   // NO UI — gen size → radio de parte (u)
  mutRate: 1,          // UI: Ritmo de mutación — multiplicador global de las PROBABILIDADES de mutación (1 = base · 0 = clones)
  // --- ESTRATEGIA r/K (genes de historia de vida, heredables/mutables; 2.4 §1.1). `reproK` = multiplicador GENÉTICO del umbral
  // de cría (sobre SIM_P.reproE, baseline-palanca del lab); `investFrac` = fracción del umbral que el progenitor PONE en cada cría.
  // Sustituyen a las CONSTANTES reproE/investE (dial→gen). Fundador: reproK=1.0 · investFrac=0.4375 (=7/16) → arranque equivalente.
  // MEDIDO (spikes + auditoría 2026-06-20): el eje r↔K queda NEAR-NEUTRAL (no diverge) en la pecera cerrada y saturada — la
  // r-selección exige condiciones NO saturadas/de expansión que un equilibrio cerrado no da (se probó disturbio: tampoco). El
  // sustrato es correcto y conserva; la divergencia esperaría a dinámica abierta/perturbada. (Se probó NIDADA y se revirtió: nulo.)
  reproKMin: 0.5, reproKMax: 2.0,        // NO UI — rango del gen reproK (umbral_i = SIM_P.reproE · reproK)
  investFracMin: 0.2, investFracMax: 0.8, // NO UI — rango del gen investFrac (investE_i = investFrac · umbral_i; siempre ≤ umbral → cría asequible)
};

// ===================== FENOTIPO (forma → función) =====================
export const PHENO_P = {
  massCoef: 0.04,      // NO UI — masa estructural ∝ área de las partes
  dragBase: 1.0, dragCoef: 0.3, streamline: 0.4,   // NO UI — arrastre (forma); elongado arrastra menos
  thrustGain: 1.2,     // NO UI — ganancia de empuje (MUSCLE)
  mouthGain: 1.0,      // NO UI — ganancia de ingesta (MOUTH)
  vGain: 3.0, vMax: 4.0,   // NO UI — velocidad emergente = vGain·empuje/arrastre, acotada
};

// ===================== SIMULACIÓN (energética · reproducción · ingesta) =====================
export const SIM_P = {
  // --- expuestos en el LABORATORIO (en vivo) ---
  baseCost: 0.015,     // UI: Metabolismo basal — coste metabólico basal/tick
  reproE: 16,          // UI: Umbral de cría — energía mínima para reproducirse. BASELINE del lab (palanca viva, slider hasta 40): el
                       // umbral REAL de cada organismo es reproE · su gen `reproK` (r/K evolvable, ver GENOME_P). El slider escala a toda la población.
  grazeRate: 0.5,      // UI: Pastoreo — biomasa vegetal que una boca puede pastar por tick ∝ mouthCap. La MISMA boca pasta veg,
                       // caza presa y rebaña carroña → el eje herbívoro↔carnívoro EMERGE de a qué dedica su esfuerzo el animal.
  grazeRefuge: 0.06,   // NO UI — RESERVA DE REBROTE (adaptado de zenote1): fracción de la capacidad de cada celda INTOCABLE por el
                       // pastoreo (no se puede pastar veg por debajo de grazeRefuge·K) → evita el sobrepastoreo letal, estabiliza la
                       // base. Medido: con forrajeo por área, 0.06 = punto dulce (pop sana + MÁXIMA diversidad de talla + veg sostenible).
  forageReach: 3,      // NO UI — FORRAJEO POR ÁREA: radio (celdas) del que pasta un animal a talla máx → el grande accede a más
                       // terreno (payoff de talla del herbívoro). 0 = solo su celda. El radio efectivo ∝ talla (mass/forageMassRef).
  forageMassRef: 4,    // NO UI — masa a la que el radio de forrajeo llega al máximo (forageReach); por debajo, proporcional.
  reproMode: 'both',   // UI: Reproducción — 'both' (sexual si hay pareja + respaldo asexual) · 'asexual' · 'sexual' (obligada, sin respaldo)
  // --- resto (NO UI) ---
  scavRate: 0.5,       // UI: Carroñeo — energía de detrito (detritusE de animales muertos) ingerible por tick ∝ mouthCap. 0 = apagado.
                       // La MISMA boca que pasta y caza también rebaña carroña → carroñeo facultativo emergente.
  massCost: 0.004,     // NO UI — coste metabólico ∝ masa^massCostExp
  massCostExp: 1.2,    // NO UI — exponente del coste de masa (super-lineal). Frena el BLOAT: sin él los cuerpos se inflaban
                       // (masa ×4, generalistas "lo tienen todo" 1%→~40% a 30k, pop a la mitad). Medido (spikes/trophic-balance):
                       // 1.2 → pop ×2, masa a la mitad, generalistas ~6%, mantiene diversidad de talla. (1 = lineal/antiguo.)
  moveCost: 0.004,     // NO UI — coste de nado ∝ drag·v² (energía → calor)
  mouthCost: 0.001,    // NO UI — COSTE DE MANTENIMIENTO de la boca/tracto digestivo ∝ mouthCap (energía → calor). A 0 la boca solo
                       // paga vía masa (igual que cualquier tejido) y como la economía está limitada por DIGESTIÓN (no ingestión) una boca
                       // > ~1.2 es redundante → INFLABA casi-neutra ~50× (medido: mouthCap 55±48, 95% > 5). Con coste, el aparato de ingesta
                       // paga su precio → la boca pasa a SELECCIÓN (no deriva). Medido (spikes/mouth-cost, 30k): 0.001 → mouthCap 55→~9 (6×
                       // menos, distribución abierta no saturada) SIN romper coexistencia (cazador 26-37 sano, herbívoros y pop ↑, menos bloat,
                       // conserva). 0.004 ya exprime al cazador (→7). 1.2 = boca funcional mínima (grazeRate·1.2 ≈ digestRate, mantiene la tripa).
  cooldown: 50,        // NO UI — enfriamiento reproductivo (ticks)
  eDensity: 0,         // NO UI — energía-en-biomasa (M6.1). 0 = separación limpia materia/energía. Se probó eD=4 para el nicho
                       // carroñero (#4) pero AGRAVABA el inmovilismo: a eD>0 la masa es cara al nacer (eCost+=masa·eD) → el músculo
                       // se poda a cero → todo sésil. Revertido a 0 (movilidad > nicho carroñero, que era marginal). Carroñeo dormido a eD=0.
  birthR: 1,           // NO UI — radio (celdas) del vecindario del que la cría reúne MATERIA
  gutBase: 4, gutPerMass: 4, digestRate: 0.6,   // NO UI — TRIPA: tope ∝ masa (saciedad EMERGENTE) + ritmo de digestión
  eatReach: 4,         // NO UI — alcance extra de captura (u)
  preyMassMax: 1.6,    // NO UI — presa manejable si su masa ≤ maxMouthR·este
  fleeSpeed: 1.0,      // UI: Escape por velocidad — la presa escapa de la captura si corre más rápido que el depredador (× este factor).
                       // 0 = captura garantizada dentro de alcance (antiguo: nada premia la velocidad → el músculo se poda y la locomoción
                       // DECAE monótonamente con el tiempo evolutivo — medido: spMean 1.66→0.18, vmax→0.27 a 50k, "todo a paso de tortuga").
                       // >0 = la velocidad relativa decide la captura → ser rápido es defensa (huir) y ataque (alcanzar) → carrera armamentística
                       // que mantiene el MÚSCULO y el movimiento bajo selección. Medido (spikes/flee-speed, 50k): 1.0 hace que la locomoción se
                       // ESTABILICE en una meseta (spMean ~0.30, vmax ~0.41, +52% vs 0.27) en vez de seguir cayendo — sin extinguir al cazador ni
                       // romper la coexistencia (C sano, pop estable, menos bloat). 1.5+ sube más la velocidad pero exprime al cazador (la presa
                       // escapa demasiado). Barrido completo en spikes/flee-speed/run.mjs.
  ηene: 0.85,          // NO UI — eficiencia energética de la ingesta
  initE: 10,           // NO UI — reservas iniciales de los fundadores
  mateRadius: 50,      // NO UI — radio de búsqueda de pareja (u)
  mateCompat: 0.5,     // NO UI — aislamiento PRE-cigótico: umbral de compatibilidad = distancia FENOTÍPICA (masa/boca/presa-manejable) normalizada.
                       // Solo esto → estructura CLINAL (ver m7). Se probó una BARRERA POST-CIGÓTICA (híbrido débil ∝ distancia parental, #3) para
                       // discretizar especies: NULA + contraproducente (no vacía el morfo intermedio; erosiona al cazador, el extremo raro; sin
                       // preferencia evolvable no hay refuerzo) → revertida. Ver auditoría 2026-06-20 §7 / spikes/postzygotic.
};
