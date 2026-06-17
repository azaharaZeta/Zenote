// Expresión génica: la FRONTERA entre lo que define el programador y lo que evoluciona.
// Aquí —y solo aquí— el genoma [0,1] se traduce a fenotipo físico, una vez al nacer y cacheado en SoA.
// Ninguna línea decide si un gen es "bueno": solo traduce; el bien/mal lo dicta la supervivencia (sim.js).

import { G, NUM_GENES, lerp } from './genome.js';
import { computeBodyPlan, reducePlan, plan } from './bodyplan.js';

export function computePhenotype(sim, i) {
  const g = sim.genes, b = i * NUM_GENES, cfg = sim.cfg, e = cfg.expr, en = cfg.energy;

  const size  = g[b + G.size];
  const speed = g[b + G.speed];   // gen MUSCULATURA: inversión en capacidad de empuje (modelo de fuerza); en el viejo era ESFUERZO
  const sense = g[b + G.sense];
  const metab = g[b + G.metab];
  const diet  = g[b + G.diet];

  const radius = lerp(e.size.min, e.size.max, size);
  sim.radius[i] = radius;

  // Visión: `sense` fija el alcance base; `e_fov` lo reparte entre alcance y ángulo conservando el área del cono.
  const vis = cfg.vision;
  const baseR = lerp(e.sense.min, e.sense.max, sense);
  const halfFov = lerp(vis.halfFovMin, vis.halfFovMax, g[b + G.e_fov]);
  sim.senseR[i] = baseR * Math.pow(vis.fovRef / (2 * halfFov), vis.rangeExp); // alcance efectivo
  sim.visCos[i] = Math.cos(halfFov);                              // umbral del cono (relativo al rumbo)

  // Locomoción: velocidad y giro EMERGEN de la morfología (empuje vs arrastre), no son genes directos.
  const lo = cfg.loco;
  // Modelo de FUERZA: el ESFUERZO lo decide el cerebro vivo (throttle, sim.js) → la capacidad de empuje se computa a tope
  // (effort=1) y la velocidad terminal sale de empuje/arrastre. Modelo viejo: effort = gen `speed` (fijo de por vida).
  const effort = lo.forceModel ? 1 : lo.effortFloor + (1 - lo.effortFloor) * speed;
  // MUSCULATURA (gen `speed`, reinterpretado): en el modelo de fuerza el esfuerzo lo decide el cerebro, así que `speed`
  // pasa a ser INVERSIÓN MUSCULAR → escala la capacidad de empuje (vmax, abajo) y cuesta basal mantenerla (∝ exceso sobre
  // el neutro). El cerebro decide cuánto de esa capacidad USA (throttle, sim.js) → músculo potente sin usar = caro (r/K).
  // FRONTERA: define física (capacidad + coste), no quién la usa. Modelo viejo: `speed`=esfuerzo → muscle=1 (sin cambio).
  const muscle = lo.forceModel ? (lo.muscleMin + (lo.muscleMax - lo.muscleMin) * speed) : 1;

  // Plan corporal por nodos → física (masa, arrastre, empuje direccional, giro, streamlining). Ver bodyplan.js.
  const nNodes = computeBodyPlan(g, b, lo, effort);
  const R = reducePlan(nNodes, lo);
  const massMul = R.massMul;                                   // masa de nodos → alimenta mass (eMax) y k_graze
  const PsumEff = R.Psum > 0 ? R.Psum : 0;                     // empuje útil hacia delante (cuerpo "ilógico" → 0)
  // `effort` ya está dentro de la amplitud de cada nodo (Psum) → no se vuelve a multiplicar aquí (sería effort²).
  // ZANCADA por talla: la física de nodos es en unidades de radio (r se cancela) → la velocidad-mundo NO escalaba con
  // el tamaño. Aquí la escalamos: vmax_mundo ∝ (radio/medio)^speedSizeExp → el grande avanza más por golpe (zancada
  // mayor), el pequeño es rápido en su escala pero se desplaza poco. La masa (inercia/coste/giro) ya penaliza aparte.
  const refR = (e.size.min + e.size.max) * 0.5;
  const sizeStride = lo.speedSizeExp ? Math.pow(radius / refR, lo.speedSizeExp) : 1;
  let v = lo.kThrust * PsumEff * plan.straight * (plan.stream / R.Dmul) * sizeStride * muscle; // ×músculo: el gen speed invierte en empuje
  if (v < lo.vMin) v = lo.vMin; else if (v > lo.vMax) v = lo.vMax;
  sim.vmax[i] = v;
  sim.effort[i] = effort;                                      // para el coste de movimiento
  // Giro: lo mejora la asimetría del cuerpo; lo empeoran tamaño, elongación y nº de segmentos.
  let turn = lo.turnBase + lo.turnAsym * plan.turnAsym - lo.turnSize * size - lo.turnElong * (plan.elongN - 1)
             - lo.segTurn * R.nSegNodes;
  sim.turnRate[i] = turn < lo.turnMin ? lo.turnMin : turn > 1 ? 1 : turn;

  // Alometría: sizeMass ∝ radio^massExp (normalizado al radio medio → medio≈1). mass = sizeMass·massMul.
  // eMax ∝ mass (almacén ∝ volumen); el metabolismo escala con mass^kleiber (Kleiber). La cría usa solo sizeMass.
  const sizeMass = Math.pow(radius / refR, en.massExp);      // masa de talla (refR = radio medio, computado arriba)
  const mass = sizeMass * massMul;                           // masa física total (talla × complejidad de nodos)
  // INERCIA (modelo de fuerza): la velocidad se acerca a su objetivo con un lag exponencial (integrador estable).
  // velResp = 1−e^(−arrastre·forma/masa) ∈ (0,1]: masa grande / poco arrastre → respuesta baja = PLANEA; pequeña → ágil.
  sim.velResp[i] = lo.forceModel ? Math.max(0.05, 1 - Math.exp(-(lo.dragLin * R.Dmul) / Math.max(0.05, mass))) : 1;
  // INERCIA ANGULAR (giro físico): el rumbo gira con momento → omega (vel. angular) tarda en cambiar (∝ masa) → los grandes/
  // complejos tardan en girar y sobregiran/contragiran. angResp ∈ (0,1]: 1 = gira al instante (cuerpo ligero/medio ≈ modelo
  // previo), →0 = mucho momento. Solo la masa POR ENCIMA del medio penaliza; angInertia=0 → angResp=1 (sin momento). El TECHO de agilidad lo sigue dando turnRate.
  sim.angResp[i] = lo.forceModel ? 1 / (1 + (lo.angInertia || 0) * (mass > 1 ? mass - 1 : 0)) : 1;
  const eMax = en.E_max_base * mass;
  sim.eMax[i] = eMax;

  // Señuelo bioluminiscente: ÓRGANO de emboscada con genética PROPIA (`o_len` = tamaño del órgano · `o_bulb` = bulbo),
  // desacoplado de la selección sexual (`orn`). Gate SUAVE sobre o_len → no viene de serie: la selección tiene que
  // CONSTRUIRLO. Cuesta energía siempre (baseCost) y solo lo rentabiliza quien caza (alcance + atrae presa, sim.js).
  // FRONTERA: define física/coste, no quién lo usa → el nicho de emboscada emerge.
  const lg = cfg.combat.lureGate, oLen = g[b + G.o_len];
  const lure = oLen > lg ? ((oLen - lg) / (1 - lg)) * (0.4 + g[b + G.o_bulb]) : 0; // 0 .. ~1.4
  sim.lure[i] = lure;

  // Alcance de captura morfológico: los apéndices frontales (plan.fwdReach) extienden el radio de caza; frenan el
  // nado (gait<0) → solo el depredador los rentabiliza. FRONTERA: define la física, no quién gana.
  sim.morphReach[i] = cfg.combat.morphReach * plan.fwdReach * radius;

  // Historia de vida: madurez (gatea cría + inicio de senescencia) y ritmo de vida. lifeFast 1=rápido/barato,
  // 0=longevo/caro (disposable soma, ver k_lifespan) → hace honesto el eje r/K.
  const lifeFast = g[b + G.senescence];
  sim.matureAge[i] = lerp(e.mature_age.min, e.mature_age.max, g[b + G.mature_age]);
  sim.senesMult[i] = lerp(cfg.age.senesSlow, cfg.age.senesFast, lifeFast);

  // Coste basal/tick: mantenimiento ∝ mass^kleiber × metabolismo × longevidad × órganos (visión, señuelo).
  // El coste de NADAR se cobra aparte en el movimiento (sim.js). Mismo coste sea cual sea la dieta.
  sim.baseCost[i] =
    en.c_base * Math.pow(mass, en.kleiber) * (1 + en.k_metab * metab) * (1 + en.k_lifespan * (1 - lifeFast)) *
    (1 + en.k_sense * sense + en.k_lure * lure) * (1 + en.k_muscle * (muscle - 1)); // ×músculo: mantener el empuje cuesta basal (∝ exceso sobre el neutro)

  // Pastoreo: escala con metabolismo, masa (k_graze) y ANCHURA del cuerpo (k_grazeWide). Un cuerpo ancho barre más
  // recurso → morfología de pastador; reverso del cazador aerodinámico. Solo rinde a quien pasta (effHerb).
  const breadth = 1 - Math.min(1, (plan.elongN - 1) / (lo.elongMax - 1)); // 1 = ancho/redondo · 0 = aerodinámico
  sim.absEff[i] = cfg.resource.absRate * (cfg.resource.absMetabBase + metab) *
    (1 + en.k_graze * (massMul - 1)) * (1 + en.k_grazeWide * breadth);

  // Coste del aleteo: aletear (plan.flapWork) multiplica el coste de nado (sim.js) → ondular = crucero barato, aletear = ráfaga cara.
  sim.flapCost[i] = en.k_flap * plan.flapWork;

  // Coste de transporte (masa): arrastrar masa cuesta al nadar (sim.js); masa ≤ 1 (medio) sin recargo.
  sim.haulMul[i] = 1 + en.k_haul * Math.max(0, mass - 1);

  // Arrastre de la forma (Dmul crudo): sim.js cobra (1 + k_drag·max(0, Dmul−dragRef)) al nado → una forma con
  // resistencia es lenta Y agotadora (cierra el incentivo del "arrastre gratis"). Distinto de la masa (k_haul).
  sim.drag[i] = R.Dmul;

  // Eficiencia de dieta: el especialista (diet 0 ó 1) no paga; el omnívoro (0.5) sí.
  const omni = 1 - cfg.diet.omniPenalty * 4 * diet * (1 - diet);
  sim.effHerb[i] = (1 - diet) * omni;
  // Eje caza↔carroña: `scav` reparte la capacidad carnívora (meat) entre cazar (effHunt) y carroñear (effScav),
  // con penalización al generalista (scavPenalty). El carroñeo rinde más con cuerpo fino (k_scavThin) → emerge el gusano.
  const scav = g[b + G.scav];
  const meat = diet * omni;
  const spec = 1 - cfg.diet.scavPenalty * 4 * scav * (1 - scav);
  const thin = 1 - breadth;                                  // 0 = ancho/redondo · 1 = fino/elongado
  sim.effHunt[i] = meat * (1 - scav) * spec;
  sim.effScav[i] = meat * scav * spec * (1 + en.k_scavThin * thin);

  // Reproducción: umbral de energía = max(repro_thr, invest); referencia ∝ sizeMass (no masa total → la complejidad
  // de nodos no frena la cría). El pequeño llena antes su depósito y cría más (r); el grande es K-estratega.
  const reproFrac = lerp(e.repro_thr.min, e.repro_thr.max, g[b + G.repro_thr]);
  const investFrac = lerp(e.invest.min, e.invest.max, g[b + G.invest]);
  const reproRef = en.E_max_base * sizeMass;
  sim.investE[i] = investFrac * reproRef;
  sim.reproNeedE[i] = Math.max(reproFrac, investFrac) * reproRef;

  // Conducta (moverse y atacar) = cerebro neuronal (sim.js). No hay genes-atajo de conducta.
  sim.diet[i]     = diet;
  sim.hue[i]      = g[b + G.hue];
}

// Clasificación trófica — fuente ÚNICA del "oficio" (la usan la curva de población y el color 'role'). Es una
// LECTURA del fenotipo, no afecta a la simulación. → 0 herbívoro · 1 carroñero · 2 cazador · 3 omnívoro.
export function trophicRole(diet, effHunt, effScav) {
  if (diet > 0.6) return effScav > effHunt ? 1 : 2;   // comecarne: carroñero (1) ↔ cazador (2)
  if (diet < 0.4) return 0;                            // herbívoro
  return 3;                                            // omnívoro (dieta intermedia)
}
