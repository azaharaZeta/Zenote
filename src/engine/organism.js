// Expresión génica: la FRONTERA entre "lo que define el programador" y "lo que evoluciona".
// Aquí —y solo aquí— el genoma [0,1] se traduce a fenotipo físico. Como el genoma es
// fijo durante la vida, calculamos el fenotipo UNA vez al nacer y lo cacheamos en SoA
// (gran ahorro: el bucle caliente no vuelve a expresar genes).
//
// Ninguna línea decide si un gen es "bueno": solo traduce. El bien/mal lo dicta la
// supervivencia (energética en sim.js), no este archivo.

import { G, NUM_GENES, lerp } from './genome.js';

export function computePhenotype(sim, i) {
  const g = sim.genes, b = i * NUM_GENES, cfg = sim.cfg, e = cfg.expr, en = cfg.energy;

  const size  = g[b + G.size];
  const speed = g[b + G.speed];   // F-B: ya NO es velocidad, es ESFUERZO (acelerador 0..1)
  const sense = g[b + G.sense];
  const metab = g[b + G.metab];
  const diet  = g[b + G.diet];

  const radius = lerp(e.size.min, e.size.max, size);
  sim.radius[i] = radius;

  // ---- VISIÓN EMERGENTE Y DIRECCIONAL (F-D) ---------------------------------------
  // `sense` = inversión visual → alcance base (y coste, abajo). `e_fov` reparte ese
  // presupuesto entre alcance y ángulo CONSERVANDO el área del cono (r²·fov = cte): un cono
  // estrecho ve más lejos; uno ancho, más cerca. La selección decide la forma del ojo.
  const vis = cfg.vision;
  const baseR = lerp(e.sense.min, e.sense.max, sense);
  const halfFov = lerp(vis.halfFovMin, vis.halfFovMax, g[b + G.e_fov]);
  sim.senseR[i] = baseR * Math.pow(vis.fovRef / (2 * halfFov), vis.rangeExp); // alcance efectivo
  sim.visCos[i] = Math.cos(halfFov);                              // umbral del cono (relativo al rumbo)

  // ---- LOCOMOCIÓN EMERGENTE -------------------------------------------------------
  // La velocidad y el giro NO son genes directos: emergen de la morfología (empuje vs
  // arrastre). El programador define la física; la selección esculpe la forma. Aquí está
  // la frontera. Mismos parámetros de forma que usa el render (cuerpos coherentes con su física).
  const lo = cfg.loco;
  const symG  = g[b + G.m_sym];
  const elong = 1 + g[b + G.m_elong] * 1.3;
  const waveG = g[b + G.m_wave];

  // A1 (Pilar v2.0): los apéndices YA NO son decorativos. Su nº/largo/grosor aportan arrastre y algo de
  // empuje (más abajo, vía limbArea) → la forma queda bajo selección. El empuje base del cuerpo sigue
  // emergiendo de la ONDULACIÓN (wave) y la simetría (straight); A1 lo MANTIENE y SUMA los limbs encima.
  const wave = lo.waveFloor + (1 - lo.waveFloor) * waveG;
  const straight = lo.symBase + (1 - lo.symBase) * symG;
  const thrust = wave * straight;                              // empuje = ondulación · simetría
  // Hidrodinámica: la elongación reduce el arrastre (cuerpo afilado). La VELOCIDAD es
  // independiente del tamaño (empuje y arrastre escalan igual con el radio → se cancela):
  // encoger ya no regala velocidad; la velocidad emerge solo de la FORMA y el esfuerzo.
  const stream = lo.streamBase + lo.streamGain * (elong - 1);
  const effort = lo.effortFloor + (1 - lo.effortFloor) * speed;

  // ---- COMPLEJIDAD CORPORAL (segmentos + módulos) → FÍSICA (F-C funcional) -----------
  // Agregados normalizados que valen 1× / 0 para un cuerpo SIMPLE (1 segmento, sin módulos),
  // de modo que ese caso reproduce EXACTAMENTE el modelo anterior (coexistencia base intacta).
  // La selección decide si la complejidad compensa: + energía y + empuje, pero + coste, arrastre
  // y peor giro. Coherente con lo que se DIBUJA (cadena de segmentos con patas + módulos).
  const nSeg = 1 + Math.round(g[b + G.m_seg] * 4);             // 1..5 segmentos
  const tf = 0.55 + g[b + G.m_segtaper] * 0.5;                  // cónica (tamaño relativo por segmento)
  let segAreaSum = 0, rr = 1;
  for (let sgi = 1; sgi < nSeg; sgi++) { rr *= tf; segAreaSum += rr * rr; } // Σ(radio_segmento/radio_cabeza)²
  let modAreaSum = 0;
  for (let mk = 0; mk < 2; mk++) {                              // módulos presentes (gen on ≥ 0.5)
    const mb = b + G.mod0_on + mk * 4;
    if (g[mb] >= 0.5) { const ms = 0.3 + g[mb + 3] * 0.6; modAreaSum += ms * ms; }
  }
  // ---- LIMBS: apéndices de cabeza + patas de cuerpo (A1) → empuje/arrastre, NO masa metabólica ----
  // Su superficie ondula (algo de empuje) pero arrastra más (limbDrag > limbThrust) → la selección
  // recorta apéndices excesivos pero conserva niveles útiles: coexisten "ondulantes" y "remeros".
  const nApp = 1 + ((g[b + G.m_app] * 7 + 0.5) | 0);           // 1..8, idéntico al render
  const branchMul = g[b + G.s_branch] >= 0.5 ? lo.branchArea : 1;
  let limbArea = nApp * g[b + G.m_len] * (lo.appWidFloor + g[b + G.m_width]) * branchMul;
  if (nSeg > 1) limbArea += (nSeg - 1) * g[b + G.leg_len] * 0.5; // patas (solo con segmentos, como el render)
  // ---- ANCHO DE CUERPO (b_aspect) atenuado por el afilado del núcleo (s_core) → arrastre + masa real ----
  const headW = 0.55 + g[b + G.b_aspect] * 0.95;               // 0.55 (aguja) .. 1.5 (globo); 1.0 = neutro
  let bodyArea = headW * headW - 1;                            // área extra cuadrática; un cuerpo más fino (<1) → 0
  if (bodyArea < 0) bodyArea = 0;
  bodyArea *= (1 - lo.coreStream * g[b + G.s_core]);           // núcleo afilado recorta el arrastre frontal

  const massMul = 1 + segAreaSum + modAreaSum + lo.bodyMass * bodyArea; // limbArea NO entra (masa hidrodinámica, no metabólica)
  const Pmul = 1 + lo.segThrust * segAreaSum + lo.modThrust * modAreaSum + lo.limbThrust * limbArea; // empuje extra (patas/módulos/limbs)
  const Dmul = 1 + lo.segDrag * (segAreaSum + (nSeg - 1) * 0.08) + lo.modDrag * modAreaSum            // arrastre extra (penaliz. de LONGITUD bajada 0.3→0.08 → gusanos largos viables)
             + lo.limbDrag * limbArea + lo.bodyDrag * bodyArea;

  let v = lo.kThrust * thrust * (Pmul / Dmul) * stream * effort;
  if (v < lo.vMin) v = lo.vMin; else if (v > lo.vMax) v = lo.vMax;
  sim.vmax[i] = v;
  sim.effort[i] = effort;                                      // para el coste de movimiento
  // Agilidad de giro: pequeños y asimétricos giran mejor; grandes/elongados/segmentados peor.
  let turn = lo.turnBase + lo.turnAsym * (1 - symG) - lo.turnSize * size - lo.turnElong * (elong - 1)
             - lo.segTurn * (nSeg - 1);
  sim.turnRate[i] = turn < lo.turnMin ? lo.turnMin : turn > 1 ? 1 : turn;

  // Capacidad de energía: por TAMAÑO (base) × MASA corporal (depósito extra). La masa añade
  // RESERVA (buffer para sobrevivir hambrunas/valles de presa), pero —clave— la reproducción NO
  // depende de la masa (ver abajo): así la complejidad no frena la cría (no colapsa a simple) ni
  // da velocidad (no alimenta la carrera presa-depredador); es un nicho "superviviente".
  const eMaxBase = en.E_max_base * (0.5 + size);
  const eMax = eMaxBase * massMul;
  sim.eMax[i] = eMax;

  // SEÑUELO BIOLUMINISCENTE (anglerfish): órgano FUNCIONAL. Su prominencia = orn (gen de exhibición, gateado)
  // × largo del tallo (o_len). CUESTA energía mantenerlo (luminoso) y, al cazar, EXTIENDE el alcance de captura
  // (ver sim.js). El carnívoro lo recupera cazando → evoluciona señuelos largos; el herbívoro solo paga → los
  // pierde. La correlación señuelo↔dieta EMERGE por selección (no está codificada). Render usa orn/o_len → coherente.
  // Prominencia = largo (o_len) × tamaño del bulbo (o_bulb), gateada por orn (que haya señuelo). Clave: depende
  // de o_len/o_bulb (DECORATIVOS, deriva LIBRE) y NO de orn (fijado por selección sexual) → la presión de caza
  // los mueve limpiamente: carnívoros evolucionan señuelos largos y grandes; herbívoros, cortos y pequeños.
  const lure = g[b + G.orn] > 0.12 ? (0.2 + g[b + G.o_len]) * (0.4 + g[b + G.o_bulb]) : 0; // 0 .. ~1.7
  sim.lure[i] = lure;

  // Coste basal/tick: metabolismo · (tamaño, visión, MASA corporal extra, SEÑUELO luminoso). Los apéndices son
  // decorativos → no cuestan. El coste de NADAR se cobra en el movimiento (sim.js). El coste es el MISMO sea cual
  // sea la dieta: sin descuentos por categoría (las muletas carnUpkeep/k_sizeHerb se retiraron, auditoría #6).
  sim.baseCost[i] =
    en.c_base * (1 + en.k_metab * metab) *
    (1 + en.k_size * size + en.k_sense * sense + en.k_body * (massMul - 1) + en.k_lure * lure);

  // Alimentación: ritmo escala con metabolismo y con la MASA corporal (segmentos/módulos = más superficie para pastar).
  sim.absEff[i] = cfg.resource.absRate * (0.5 + metab) *
    (1 + en.k_graze * (massMul - 1));

  // Eficiencia de dieta: el especialista (diet 0 ó 1) no paga; el omnívoro (0.5) sí.
  const omni = 1 - cfg.diet.omniPenalty * 4 * diet * (1 - diet);
  sim.effHerb[i] = (1 - diet) * omni;
  sim.effCarn[i] = diet * omni;

  // Reproducción: umbral de energía = max(repro_thr, invest) para no morir al parir.
  const reproFrac = lerp(e.repro_thr.min, e.repro_thr.max, g[b + G.repro_thr]);
  const investFrac = lerp(e.invest.min, e.invest.max, g[b + G.invest]);
  // Referencia de reproducción ACOPLADA al tamaño igual que la energía: reproRef = eMaxBase = E_max_base·(0.5+size).
  // Criar cuesta una FRACCIÓN constante de tu energía máxima-por-talla → el pequeño (eMax bajo) llena su depósito
  // antes y se reproduce más rápido (ventaja r natural); el grande es K-estratega. El compromiso r/K EMERGE de la
  // talla, sin un knob aparte que lo aplane (antes reproBase/reproSizeCost desacoplaban este coste del tamaño para
  // frenar al pequeño; retirado en auditoría #4). No usa la masa: la complejidad da reserva pero no frena la cría.
  const reproRef = eMaxBase;
  sim.investE[i] = investFrac * reproRef;
  sim.reproNeedE[i] = Math.max(reproFrac, investFrac) * reproRef;

  // Pesos de comportamiento → factores lerp(0, wMax). La estrategia emerge de estos.
  sim.wFood[i] = g[b + G.w_food] * e.wMax;
  sim.wPrey[i] = g[b + G.w_prey] * e.wMax;
  sim.wFlee[i] = g[b + G.w_flee] * e.wMax;

  // Crudos usados directos
  sim.diet[i]     = diet;
  sim.aggro[i]    = g[b + G.aggro];
  sim.hue[i]      = g[b + G.hue];
  sim.tempPref[i] = g[b + G.temp_pref]; // óptimo térmico (coste por desviarse, ver sim.js)
}
