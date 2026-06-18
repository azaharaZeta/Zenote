// SPIKE M3 — ¿CONVERGE el genoma generativo (2.2) o deriva al caos? (descartable, aislado)
// Test decisivo: evolucionar morfología hacia una FUNCIÓN (eficiencia locomotora) y comparar dos codificaciones:
//   A) DIRECTA  — slots fijos independientes, solo mutación PARAMÉTRICA (análogo del modelo actual).
//   B) GENERATIVA — módulos + operadores ESTRUCTURALES (recursión/duplicación/simetría/regulatoria) de 2.2.
// La fitness tiene un VALLE real: el empuje útil exige propulsores traseros COHERENTES EN FASE. Un cuerpo coordinado
// (cadena recursiva / par simétrico) gana; los intermedios incoherentes pierden (drag sin empuje neto). Cruzar ese
// valle con mutación puntual exige alinear muchas cosas a la vez (difícil); con operadores estructurales, 1 mutación
// copia/repite un módulo COHERENTE (cadena, par) → cruza el valle. Reproducir: node zenote2/spikes/m3-genome/evolve.mjs

import { makeRng } from '../../src/util/rng.js';

const rng = makeRng(+(process.argv[3] || 1));
const POP = 200, GENS = +(process.argv[2] || 200), PART_BUDGET = 24;
const TWO_PI = 6.283185307;
const clampedG = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;

// ---------- FÍSICA forma→función (común a ambas codificaciones; de 2.2 §4 / reducePlan) ----------
// parts: [{ size, angleAxis (0 frente..π atrás), oscAmp, phase }]. Empuje COHERENTE (fasores) − arrastre.
function fitness(parts) {
  let re = 0, im = 0, drag = 1, brake = 0;
  for (const p of parts) {
    const area = p.size * p.size;
    drag += area * 0.3 * (1 - 0.4 * p.aspect);          // elongado (aspect alto) = algo menos arrastre (streamlining)
    const gait = -Math.cos(p.angleAxis);                 // atrás (π)→+1 propulsa · frente (0)→−1 frena
    const contrib = p.oscAmp * area * gait;
    if (contrib > 0) { re += contrib * Math.cos(p.phase); im += contrib * Math.sin(p.phase); } // coherencia de fase
    else brake -= contrib;                               // partes frontales oscilantes: frenan
  }
  const coherent = Math.sqrt(re * re + im * im) - brake;
  return coherent > 0 ? coherent / drag : 0;             // velocidad emergente = empuje coherente / arrastre
}

// ---------- A) CODIFICACIÓN DIRECTA: K slots fijos independientes, solo mutación paramétrica ----------
const K = 12;
function dirFounder() { // arranca casi vacío (1 slot tenue) → la estructura debe descubrirse activando+afinando slots
  const slots = [];
  for (let k = 0; k < K; k++) slots.push({ present: k === 0 ? 0.5 : 0, size: 0.4, angleAxis: rng.next() * Math.PI, oscAmp: 0.3, aspect: 0.3, phase: rng.next() * TWO_PI });
  return { slots };
}
function dirDevelop(g) {
  const parts = [];
  for (const s of g.slots) if (s.present > 0.5 && parts.length < PART_BUDGET) parts.push(s);
  return parts;
}
function dirMutate(g) {
  const n = { slots: g.slots.map(s => ({ ...s })) };
  for (const s of n.slots) {
    if (rng.next() < 0.04) s.present = s.present > 0.5 ? 0 : 1;        // activar/desactivar slot
    if (rng.next() < 0.15) s.angleAxis = clampedG(s.angleAxis + rng.gaussian() * 0.4, 0, Math.PI);
    if (rng.next() < 0.15) s.oscAmp = clampedG(s.oscAmp + rng.gaussian() * 0.15, 0, 1);
    if (rng.next() < 0.15) s.size = clampedG(s.size + rng.gaussian() * 0.15, 0.1, 1);
    if (rng.next() < 0.15) s.aspect = clampedG(s.aspect + rng.gaussian() * 0.15, 0, 1);
    if (rng.next() < 0.15) s.phase = (s.phase + rng.gaussian() * 0.5 + TWO_PI) % TWO_PI;
  }
  return n;
}

// ---------- B) CODIFICACIÓN GENERATIVA: módulos + operadores estructurales (2.2) ----------
let HOM = 1;
function genFounder() { return { mods: [] }; } // arranca VACÍO (solo "cabeza" implícita) → la complejidad EMERGE
function mkMod() {
  return { angle: rng.next() * Math.PI, size: 0.4, aspect: 0.3, oscAmp: 0.3, phase: rng.next() * TWO_PI,
           recursive: false, recLimit: 1, symmetric: false, taper: 0.85, hom: HOM++ };
}
function genDevelop(g) {
  const parts = [];
  for (const m of g.mods) {
    const L = m.recursive ? m.recLimit : 1;
    const chains = m.symmetric ? [1, -1] : [1];          // simetría: par espejado (mismo phase → coherente)
    for (const sgn of chains) {
      let sz = m.size;
      for (let d = 0; d < L && parts.length < PART_BUDGET; d++) {
        // recursión: cadena de partes; phase IDÉNTICO en la cadena/par → COHERENTE por construcción (clave del cruce de valle)
        parts.push({ size: sz, angleAxis: clampedG(m.angle * sgn < 0 ? Math.PI - m.angle : m.angle, 0, Math.PI), oscAmp: m.oscAmp, aspect: m.aspect, phase: m.phase });
        sz *= m.taper;                                    // modulación por contexto (regulatoria): afilamiento
      }
    }
  }
  return parts;
}
function genMutate(g) {
  const n = { mods: g.mods.map(m => ({ ...m })) };
  // estructurales (raras, gran efecto — los cruza-valles):
  if (rng.next() < 0.10) n.mods.push(mkMod());                                          // AÑADIR módulo
  if (rng.next() < 0.08 && n.mods.length) { const s = n.mods[(rng.next() * n.mods.length) | 0]; n.mods.push({ ...s, hom: HOM++ }); } // DUPLICAR (copia coherente)
  if (rng.next() < 0.05 && n.mods.length) n.mods.splice((rng.next() * n.mods.length) | 0, 1); // borrar
  for (const m of n.mods) {
    if (rng.next() < 0.06) m.recursive = !m.recursive;                                  // toggle recursión
    if (rng.next() < 0.10) m.recLimit = clampedG(m.recLimit + (rng.next() < 0.5 ? 1 : -1), 1, 8) | 0; // límite de recursión
    if (rng.next() < 0.06) m.symmetric = !m.symmetric;                                  // toggle simetría (1 bit → par)
    // paramétricas (frecuentes, suaves):
    if (rng.next() < 0.15) m.angle = clampedG(m.angle + rng.gaussian() * 0.4, 0, Math.PI);
    if (rng.next() < 0.15) m.oscAmp = clampedG(m.oscAmp + rng.gaussian() * 0.15, 0, 1);
    if (rng.next() < 0.15) m.size = clampedG(m.size + rng.gaussian() * 0.15, 0.1, 1);
    if (rng.next() < 0.15) m.aspect = clampedG(m.aspect + rng.gaussian() * 0.15, 0, 1);
    if (rng.next() < 0.10) m.taper = clampedG(m.taper + rng.gaussian() * 0.1, 0.4, 1);  // regulatoria
    if (rng.next() < 0.15) m.phase = (m.phase + rng.gaussian() * 0.5 + TWO_PI) % TWO_PI;
  }
  return n;
}
// estadística estructural (¿emergen cadenas/pares sin sembrar?)
function genStats(g) {
  let maxChain = 1, pairs = 0;
  for (const m of g.mods) { if (m.recursive) maxChain = Math.max(maxChain, m.recLimit); if (m.symmetric) pairs++; }
  return { mods: g.mods.length, maxChain, pairs };
}

// ---------- GA (torneo + élite); valida que TODO cuerpo desarrollado es válido (sin NaN/crash) ----------
function evolve(founder, develop, mutate, label) {
  let pop = Array.from({ length: POP }, () => mutate(founder()));
  let bestEver = 0, invalid = 0;
  const traj = [];
  for (let gen = 0; gen < GENS; gen++) {
    const scored = pop.map(g => { let parts; try { parts = develop(g); } catch { invalid++; parts = []; }
      let f = fitness(parts); if (!Number.isFinite(f) || f < 0) { invalid++; f = 0; } return { g, f, parts }; });
    scored.sort((a, b) => b.f - a.f);
    bestEver = Math.max(bestEver, scored[0].f);
    if (gen % 40 === 0 || gen === GENS - 1) traj.push({ gen, best: scored[0].f, mean: scored.reduce((s, x) => s + x.f, 0) / POP });
    // siguiente generación: élite + torneo→mutación
    const next = [scored[0].g, scored[1].g];
    while (next.length < POP) {
      const a = scored[(rng.next() * 20) | 0], b = scored[(rng.next() * 20) | 0];
      next.push(mutate((a.f >= b.f ? a : b).g));
    }
    pop = next;
  }
  // analizar el mejor final
  const scored = pop.map(g => ({ g, f: fitness(develop(g)) })).sort((a, b) => b.f - a.f);
  return { label, bestEver, finalBest: scored[0].f, invalid, best: scored[0].g };
}

console.log(`=== SPIKE M3 — convergencia del genoma · POP ${POP} × ${GENS} gens ===\n`);
console.log('Fitness = eficiencia locomotora (empuje coherente / arrastre). Valle: exige propulsores traseros EN FASE.\n');

const A = evolve(dirFounder, dirDevelop, dirMutate, 'DIRECTA (paramétrica)');
const B = evolve(genFounder, genDevelop, genMutate, 'GENERATIVA (operadores)');

const pad = (s, w) => String(s).padStart(w);
console.log([pad('codificación', 24), pad('fitness final', 14), pad('cuerpos inválidos', 18)].join(' '));
console.log([pad(A.label, 24), pad(A.finalBest.toFixed(3), 14), pad(A.invalid, 18)].join(' '));
console.log([pad(B.label, 24), pad(B.finalBest.toFixed(3), 14), pad(B.invalid, 18)].join(' '));
console.log(`\nVentaja generativa: ${(B.finalBest / Math.max(1e-6, A.finalBest)).toFixed(2)}× la fitness de la directa.`);
const st = genStats(B.best);
console.log(`Mejor cuerpo generativo (EMERGENTE, sin sembrar): ${st.mods} módulos · cadena máx ${st.maxChain} · ${st.pairs} pares simétricos.`);
console.log(`Cuerpos inválidos: A=${A.invalid}, B=${B.invalid} (de ${POP * GENS} desarrollos cada uno) → ${B.invalid === 0 ? 'el generativo NUNCA produce cuerpos inválidos (validez por construcción ✓)' : 'revisar validez'}`);
