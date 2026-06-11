// Expresión génica: la FRONTERA entre "lo que define el programador" y "lo que evoluciona".
// Aquí —y solo aquí— el genoma [0,1] se traduce a fenotipo físico. Como el genoma es
// fijo durante la vida, calculamos el fenotipo UNA vez al nacer y lo cacheamos en SoA
// (gran ahorro: el bucle caliente no vuelve a expresar genes).
//
// Ninguna línea decide si un gen es "bueno": solo traduce. El bien/mal lo dicta la
// supervivencia (energética en sim.js), no este archivo.

import { G, NUM_GENES, lerp } from './genome.js';
import { computeBodyPlan, reducePlan, plan } from './bodyplan.js';

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
  const effort = lo.effortFloor + (1 - lo.effortFloor) * speed; // throttle global (gen speed)

  // ---- PLAN CORPORAL POR NODOS (Pilar v2.0, B3) → FÍSICA ------------------------------
  // La forma se expresa como un GRAFO DE NODOS. La física —masa, arrastre, EMPUJE DIRECCIONAL, giro,
  // streamlining— EMERGE de sumar sobre esos nodos (ver bodyplan.js): cada nodo propulsa según su
  // ORIENTACIÓN (cola atrás empuja adelante; nodo frontal frena) y su amplitud de oscilación propia
  // (osc_amp). `plan.stream` (elongación) y `plan.elongN` (giro) también emergen de la geometría. El plan
  // es transitorio (scratch reutilizable); se reduce aquí a los escalares cacheados. La amplitud de
  // oscilación y el streamlining viven ahora en los genes de nodo (osc_amp + geometría axial/lateral).
  const nNodes = computeBodyPlan(g, b, lo, effort);
  const R = reducePlan(nNodes, lo);
  const massMul = R.massMul;                                   // masa de nodos → alimenta mass (eMax) y k_graze (abajo)
  const PsumEff = R.Psum > 0 ? R.Psum : 0;                     // empuje útil hacia delante (un cuerpo "ilógico" → 0)
  // `effort` (throttle) NO se multiplica aquí: ya está dentro de la amplitud de cada nodo (Psum). Si no, sería effort².
  let v = lo.kThrust * PsumEff * plan.straight * (plan.stream / R.Dmul);
  if (v < lo.vMin) v = lo.vMin; else if (v > lo.vMax) v = lo.vMax;
  sim.vmax[i] = v;
  sim.effort[i] = effort;                                      // para el coste de movimiento
  // Agilidad de giro: la asimetría del cuerpo (plan.turnAsym, emergente) mejora el giro; grandes/elongados/
  // con más nodos-segmento giran peor.
  let turn = lo.turnBase + lo.turnAsym * plan.turnAsym - lo.turnSize * size - lo.turnElong * (plan.elongN - 1)
             - lo.segTurn * R.nSegNodes;
  sim.turnRate[i] = turn < lo.turnMin ? lo.turnMin : turn > 1 ? 1 : turn;

  // ---- ALOMETRÍA (#3): la talla es una MASA física -------------------------------
  // `sizeMass` ∝ radio^massExp, normalizado al radio MEDIO (size 0.5) → un organismo medio tiene sizeMass≈1.
  // `mass` = sizeMass · massMul (los nodos suman masa real). La CAPACIDAD escala con la masa (almacén ∝ volumen):
  // la masa añade RESERVA (buffer para hambrunas), y la complejidad de nodos sigue sumando depósito. El
  // METABOLISMO escala con masa^kleiber (Kleiber: los grandes gastan menos por unidad de masa → economía de
  // escala). La REPRODUCCIÓN usa SOLO sizeMass (sin massMul, ver abajo) → la complejidad no frena la cría (#4).
  const refRadius = (e.size.min + e.size.max) * 0.5;         // radio del organismo medio (size 0.5)
  const sizeMass = Math.pow(radius / refRadius, en.massExp); // masa de talla (límite blando: radio acotado por expr.size)
  const mass = sizeMass * massMul;                           // masa física total (talla × complejidad de nodos)
  const eMax = en.E_max_base * mass;
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

  // ALCANCE DE CAPTURA MORFOLÓGICO (Capa 2): los apéndices que apuntan AL FRENTE (plan.fwdReach, en radios de
  // cabeza) extienden el radio de caza (ver sim.js). FRONTERA: el programador define que "alcanzar al frente
  // ayuda a capturar" y que esos nodos FRENAN el nado (gait<0, bodyplan); QUÉ cuerpo gana lo decide la selección.
  // Solo el depredador rentabiliza el alcance → la morfología de agarre (garras/tentáculos frontales) emerge en
  // los carnívoros y no en los herbívoros (que solo pagarían el coste de nado). No está cableado por dieta.
  sim.morphReach[i] = cfg.combat.morphReach * plan.fwdReach * radius;

  // HISTORIA DE VIDA (#12): madurez (gatea cría + inicio de senescencia) y ritmo de vida (senescencia).
  // `lifeFast` ∈[0,1]: 1 = vivir rápido (envejece deprisa, barato de mantener); 0 = longevo (envejece despacio,
  // CARO de mantener — disposable soma). El acople longevidad↔coste es lo que hace honesto el eje r/K.
  const lifeFast = g[b + G.senescence];
  sim.matureAge[i] = lerp(e.mature_age.min, e.mature_age.max, g[b + G.mature_age]);
  sim.senesMult[i] = lerp(cfg.age.senesSlow, cfg.age.senesFast, lifeFast);

  // Coste basal/tick (ALOMÉTRICO, #3): mantenimiento del cuerpo ∝ masa^kleiber (Kleiber: economía de escala —
  // subsume el viejo coste lineal por tamaño y por masa de nodos), × metabolismo × longevidad × órganos
  // (visión, señuelo). El coste de NADAR se cobra en el movimiento (sim.js). MISMO coste sea cual sea la dieta.
  sim.baseCost[i] =
    en.c_base * Math.pow(mass, en.kleiber) * (1 + en.k_metab * metab) * (1 + en.k_lifespan * (1 - lifeFast)) *
    (1 + en.k_sense * sense + en.k_lure * lure);

  // Alimentación: ritmo escala con metabolismo, con la MASA corporal (más superficie para pastar) y con la
  // ANCHURA del cuerpo (Capa 2): un cuerpo ANCHO/aplanado (baja elongación) BARRE más campo de recurso que uno
  // fino/aerodinámico → premia la morfología de pastador (aletas/hojas anchas). FRONTERA: defino que "ancho =
  // más pasto"; la selección decide. Es el reverso del nicho cazador (afila+alarga para nadar/alcanzar): la MISMA
  // elongación empuja a herbívoros (anchos) y carnívoros (aerodinámicos) a formas OPUESTAS → divergencia por dieta.
  // Solo rinde al que de verdad pasta (effHerb); el carnívoro ancho gana ~nada (come carne) → no se ensancha por esto.
  const breadth = 1 - Math.min(1, (plan.elongN - 1) / (lo.elongMax - 1)); // 1 = ancho/redondo · 0 = aerodinámico
  sim.absEff[i] = cfg.resource.absRate * (0.5 + metab) *
    (1 + en.k_graze * (massMul - 1)) * (1 + en.k_grazeWide * breadth);

  // COSTE del ALETEO (Capa 3): el golpe activo gasta energía → aletear MULTIPLICA el coste de NADO (sim.js).
  // Ligado a la propulsión de aleteo (`plan.flapWork`, lateral) → coste↔beneficio: aletear da ráfaga pero CUESTA.
  // Hace honesto el eje ONDULAR (crucero barato) ↔ ALETEAR (ráfaga cara): solo lo paga quien aletea, y solo
  // compensa a quien necesita la ráfaga (cazador que lancea); el pastador tranquilo preferirá ondular. Emergente.
  sim.flapCost[i] = en.k_flap * plan.flapWork;

  // COSTE DE TRANSPORTE (A): arrastrar masa cuesta al NADAR (sim.js lo multiplica al coste de movimiento). Mantener
  // el cuerpo ya se paga en baseCost (mass^kleiber); esto es el sobrecoste ACTIVO de DESPLAZAR un cuerpo grande o con
  // muchos/grandes apéndices. Referencia en masa = 1 (organismo medio): masa ≤ 1 sin recargo (max(0,·) → no regala
  // descuento a los diminutos); cada unidad de masa por encima del medio encarece el desplazamiento. FRONTERA: defino
  // que "más masa = más caro moverla"; QUÉ cuerpo gana lo decide la selección (el aerodinámico ahorra, el complejo paga).
  sim.haulMul[i] = 1 + en.k_haul * Math.max(0, mass - 1);

  // Eficiencia de dieta: el especialista (diet 0 ó 1) no paga; el omnívoro (0.5) sí.
  const omni = 1 - cfg.diet.omniPenalty * 4 * diet * (1 - diet);
  sim.effHerb[i] = (1 - diet) * omni;
  sim.effCarn[i] = diet * omni;

  // Reproducción: umbral de energía = max(repro_thr, invest) para no morir al parir.
  const reproFrac = lerp(e.repro_thr.min, e.repro_thr.max, g[b + G.repro_thr]);
  const investFrac = lerp(e.invest.min, e.invest.max, g[b + G.invest]);
  // Referencia de reproducción ACOPLADA a la MASA DE TALLA (no a la masa total): reproRef = E_max_base·sizeMass.
  // Criar cuesta una fracción de tu energía-por-talla → el pequeño (sizeMass bajo) llena su depósito antes y cría
  // más rápido (ventaja r); el grande es K-estratega. El compromiso r/K EMERGE de la talla (auditoría #4). Usa
  // sizeMass y NO la masa total: la complejidad de nodos da reserva (eMax) pero NO frena la cría.
  const reproRef = en.E_max_base * sizeMass;
  sim.investE[i] = investFrac * reproRef;
  sim.reproNeedE[i] = Math.max(reproFrac, investFrac) * reproRef;

  // Conducta (moverse Y atacar) = cerebro neuronal (sim.js). No hay genes-atajo de conducta.
  sim.diet[i]     = diet;
  sim.hue[i]      = g[b + G.hue];
  sim.tempPref[i] = g[b + G.temp_pref]; // óptimo térmico (coste por desviarse, ver sim.js)
}
