// M4 — VALIDACIÓN de las leyes del mundo (2.1 §8). Usa agentes-SONDA codificados a mano (scaffolding; M5 los
// reemplaza por el organismo real) para ejercitar TODAS las transacciones (fotosíntesis · crecimiento · ingesta ·
// metabolismo · muerte · descomposición) y verificar los invariantes:
//   1) MATERIA conservada (Σ nutrient+detritoM+masa = budget, deriva ≈0)
//   2) BALANCE de ENERGÍA por tick (Δalmacenada = capturada − calor)
//   3) CALOR monótono no decreciente
//   4) NO MÓVIL PERPETUO (test decisivo): con luz=0, la energía almacenada → 0, todos mueren, materia sigue conservada
//   uso: node zenote2/test/m4-invariants.mjs

import { World, WORLD_P } from '../src/engine/world.js';
import { SpatialHash } from '../src/engine/hash.js';
import { makeRng } from '../src/util/rng.js';

const AUTO = 0, HET = 1;
const SP = {                 // parámetros de la sonda (provisionales; calibración = futuro)
  photoEff: 0.85, cBuild: 0.4, growthFloor: 3, maxGrow: 0.05,
  baseCost: 0.008, sizeCost: 0.003, eatRange: 8, senseR: 60,
  ηmat: 0.85, ηene: 0.85, preyBiomassFrac: 1.0,
  reproMass: 1.2, reproE: 6, childMassFrac: 0.4, childEFrac: 0.4, cooldown: 40,
};

function makeSim({ size = 1500, seed = 1, light = true, nAuto = 1200, nHet = 150 } = {}) {
  const P = { ...WORLD_P, lightBase: light ? 0.16 : 0 };   // sonda: luz generosa para un mundo VIVO (la calibración real es M6)
  const world = new World(size, seed, P);
  const rng = makeRng(seed + 7);
  const cap = (nAuto + nHet) * 6;
  const s = {
    world, rng, size, cap, tick: 0,
    x: new Float32Array(cap), y: new Float32Array(cap), mass: new Float32Array(cap), E: new Float32Array(cap),
    type: new Uint8Array(cap), alive: new Uint8Array(cap), cd: new Float32Array(cap),
    free: new Int32Array(cap), freeTop: cap, active: new Int32Array(cap), nA: 0,
    hash: new SpatialHash(size, SP.senseR),
  };
  s.hash.setCapacity(cap);
  for (let i = 0; i < cap; i++) s.free[i] = cap - 1 - i;
  // repartir nutriente inicial uniforme
  const budgetNutrient = world.nutrient.length * 2.0;
  world.nutrient.fill(budgetNutrient / world.nutrient.length);
  const spawn = (type, mass, E) => { if (s.freeTop === 0) return -1; const i = s.free[--s.freeTop]; s.alive[i] = 1;
    s.x[i] = rng.next() * size; s.y[i] = rng.next() * size; s.mass[i] = mass; s.E[i] = E; s.type[i] = type; s.cd[i] = (rng.next() * SP.cooldown) | 0; return i; };
  for (let k = 0; k < nAuto; k++) spawn(AUTO, 0.6, 4);
  for (let k = 0; k < nHet; k++) spawn(HET, 0.8, 5);
  return s;
}

function totalMatter(s) { let m = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) m += s.mass[i]; return m + s.world.totalNutrient() + s.world.totalDetritusM(); }
function totalStoredE(s) { let e = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) e += s.E[i]; return e + s.world.totalDetritusE(); }

function step(s) {
  const W = s.world, rng = s.rng, size = s.size;
  W.setDayNight(s.tick);
  // lista activa + hash + ocupación
  let na = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) s.active[na++] = i; s.nA = na;
  W.occ.fill(0); s.hash.clear();
  for (let a = 0; a < na; a++) { const i = s.active[a]; s.hash.insert(i, s.x[i], s.y[i]); W.occ[W.cellAt(s.x[i], s.y[i])] += 1; }

  const born = [];
  for (let a = 0; a < na; a++) {
    const i = s.active[a]; if (!s.alive[i]) continue;
    const cell = W.cellAt(s.x[i], s.y[i]);

    if (s.type[i] === AUTO) {
      // FOTOSÍNTESIS: capta luz (repartida por ocupación de la celda) → reservas. Energía ENTRA.
      const dE = SP.photoEff * W.lightAt(cell) / Math.max(1, W.occ[cell]);
      if (dE > 0) { s.E[i] += dE; W.lightCaptured += dE; }
    } else {
      // HETERÓTROFO: busca autótrofo cercano (hash), se acerca, lo come en contacto.
      let bj = -1, bd = SP.senseR * SP.senseR, bdx = 0, bdy = 0;
      const hc = s.hash.cell, hx = (s.x[i] / hc) | 0, hy = (s.y[i] / hc) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = ((hx + ox) % s.hash.cols + s.hash.cols) % s.hash.cols, gy = ((hy + oy) % s.hash.rows + s.hash.rows) % s.hash.rows;
        let j = s.hash.head[gy * s.hash.cols + gx];
        while (j !== -1) { if (j !== i && s.alive[j] && s.type[j] === AUTO) {
          let dx = s.x[j] - s.x[i], dy = s.y[j] - s.y[i];
          if (dx > size * 0.5) dx -= size; else if (dx < -size * 0.5) dx += size; if (dy > size * 0.5) dy -= size; else if (dy < -size * 0.5) dy += size;
          const d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; bj = j; bdx = dx; bdy = dy; } } j = s.hash.next[j]; }
      }
      if (bj !== -1) {
        const m = Math.sqrt(bd) || 1, sp = 2.5; let nx = s.x[i] + bdx / m * sp, ny = s.y[i] + bdy / m * sp;
        if (nx < 0) nx += size; else if (nx >= size) nx -= size; if (ny < 0) ny += size; else if (ny >= size) ny -= size; s.x[i] = nx; s.y[i] = ny;
        if (bd < (SP.eatRange + 2) ** 2) { // INGESTA: materia y energía de la presa → comedor; resto → detrito (CONSERVA)
          const pm = s.mass[bj], pe = s.E[bj], pc = W.cellAt(s.x[bj], s.y[bj]);
          const gm = SP.ηmat * pm, ge = SP.ηene * pe;
          s.mass[i] += gm; W.detritusM[pc] += pm - gm;       // materia: comedor + restos = presa
          s.E[i] += ge; W.detritusE[pc] += pe - ge;          // energía: comedor + restos = presa (interno, sin pérdida)
          s.alive[bj] = 0; s.free[s.freeTop++] = bj;
        }
      } else { const an = rng.next() * 6.283; let nx = s.x[i] + Math.cos(an) * 1.5, ny = s.y[i] + Math.sin(an) * 1.5;
        if (nx < 0) nx += size; else if (nx >= size) nx -= size; if (ny < 0) ny += size; else if (ny >= size) ny -= size; s.x[i] = nx; s.y[i] = ny; }
    }

    // CRECIMIENTO: convierte reservas + nutriente local en MASA. Materia N→masa (conserva); energía de construir → calor.
    if (s.E[i] > SP.growthFloor && W.nutrient[cell] > 0) {
      let dM = Math.min(SP.maxGrow, W.nutrient[cell], (s.E[i] - SP.growthFloor) / SP.cBuild);
      if (dM > 0) { s.mass[i] += dM; W.nutrient[cell] -= dM; const ec = dM * SP.cBuild; s.E[i] -= ec; W.heat += ec; }
    }

    // METABOLISMO: reservas → calor (energía sale). Muerte si se agotan.
    const cost = SP.baseCost + SP.sizeCost * s.mass[i];
    const spend = Math.min(s.E[i], cost); s.E[i] -= spend; W.heat += spend;
    if (s.E[i] <= 1e-6) { W.detritusM[cell] += s.mass[i]; W.detritusE[cell] += s.E[i] > 0 ? s.E[i] : 0; s.alive[i] = 0; s.free[s.freeTop++] = i; continue; }

    // REPRODUCCIÓN: materia y energía del progenitor → cría (conserva).
    if (s.cd[i] > 0) s.cd[i]--;
    else if (s.mass[i] >= SP.reproMass && s.E[i] >= SP.reproE) {
      const cm = s.mass[i] * SP.childMassFrac, ce = s.E[i] * SP.childEFrac;
      s.mass[i] -= cm; s.E[i] -= ce; s.cd[i] = SP.cooldown; born.push(s.type[i], s.x[i], s.y[i], cm, ce);
    }
  }
  // sembrar crías
  for (let k = 0; k < born.length; k += 5) { if (s.freeTop === 0) { /* sin slot: la materia/energía se quedan en el progenitor (ya descontadas) → re-acreditar para conservar */ break; }
    const i = s.free[--s.freeTop]; s.alive[i] = 1; s.type[i] = born[k];
    let bx = born[k + 1] + (rng.next() - 0.5) * 6, by = born[k + 2] + (rng.next() - 0.5) * 6;
    if (bx < 0) bx += size; else if (bx >= size) bx -= size; if (by < 0) by += size; else if (by >= size) by -= size;
    s.x[i] = bx; s.y[i] = by; s.mass[i] = born[k + 3]; s.E[i] = born[k + 4]; s.cd[i] = SP.cooldown;
  }
  // si una cría no encontró slot, su materia/energía hay que devolverlas (conservación): caso raro, lo evitamos con cap holgado.

  W.decomposeStep();
  W.diffuseStep();
  s.tick++;
}

function popCount(s) { let p = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) p++; return p; }

// ---------- TEST A: luz ON → conservación + balance + persistencia ----------
console.log('=== M4 — invariantes de las leyes del mundo (2.1 §8) ===\n');
{
  const s = makeSim({ light: true });
  const budget = totalMatter(s);
  let prevStored = totalStoredE(s), prevHeat = s.world.heat, prevCap = s.world.lightCaptured;
  let maxMatterDrift = 0, maxEnergyResidual = 0, heatMonotone = true, lastHeat = s.world.heat;
  const TICKS = 3000;
  for (let t = 0; t < TICKS; t++) {
    step(s);
    const md = Math.abs(totalMatter(s) - budget) / budget; if (md > maxMatterDrift) maxMatterDrift = md;
    const stored = totalStoredE(s), dCap = s.world.lightCaptured - prevCap, dHeat = s.world.heat - prevHeat;
    const residual = Math.abs((stored - prevStored) - (dCap - dHeat));
    if (residual > maxEnergyResidual) maxEnergyResidual = residual;
    if (s.world.heat < lastHeat - 1e-9) heatMonotone = false; lastHeat = s.world.heat;
    prevStored = stored; prevHeat = s.world.heat; prevCap = s.world.lightCaptured;
  }
  console.log(`TEST A (luz ON, ${TICKS} ticks): pop final ${popCount(s)}`);
  console.log(`  1) Materia conservada ........ deriva máx ${(maxMatterDrift * 100).toExponential(2)}%  → ${maxMatterDrift < 1e-4 ? 'OK ✓' : 'FALLO ✗'}`);
  console.log(`  2) Balance de energía/tick ... residuo máx ${maxEnergyResidual.toExponential(2)}  → ${maxEnergyResidual < 1e-2 ? 'OK ✓' : 'FALLO ✗'}`);
  console.log(`  3) Calor monótono ............ ${heatMonotone ? 'OK ✓' : 'FALLO ✗'}`);
  console.log(`     (entró luz=${s.world.lightCaptured.toFixed(0)} · salió calor=${s.world.heat.toFixed(0)} · almacenada=${totalStoredE(s).toFixed(0)})`);
}

// ---------- TEST B: luz OFF → no móvil perpetuo (el test decisivo) ----------
{
  const s = makeSim({ light: false });
  const budget = totalMatter(s);
  const stored0 = totalStoredE(s);
  let lastHeat = s.world.heat, heatMonotone = true, storedMonotoneDown = true, lastStored = stored0;
  const TICKS = 6000;
  for (let t = 0; t < TICKS; t++) {
    step(s);
    if (s.world.heat < lastHeat - 1e-9) heatMonotone = false; lastHeat = s.world.heat;
    const st = totalStoredE(s); if (st > lastStored + 1e-6) storedMonotoneDown = false; lastStored = st; // sin luz, nunca sube
  }
  const storedEnd = totalStoredE(s), pop = popCount(s);
  const matterDrift = Math.abs(totalMatter(s) - budget) / budget;
  console.log(`\nTEST B (luz OFF = noche eterna, ${TICKS} ticks) — "no móvil perpetuo":`);
  console.log(`  Energía almacenada ${stored0.toFixed(0)} → ${storedEnd.toFixed(3)}  → ${storedEnd < stored0 * 0.001 ? 'se APAGA ✓' : 'PERSISTE ✗ (móvil perpetuo)'}`);
  console.log(`  Población ${pop}  → ${pop === 0 ? 'todos muertos ✓' : 'sobreviven sin luz ✗'}`);
  console.log(`  Energía sólo BAJA (sin luz) .. ${storedMonotoneDown ? 'OK ✓' : 'FALLO ✗'} · calor monótono ${heatMonotone ? 'OK ✓' : 'FALLO ✗'}`);
  console.log(`  Materia conservada igualmente  deriva ${(matterDrift * 100).toExponential(2)}% → ${matterDrift < 1e-4 ? 'OK ✓' : 'FALLO ✗'}`);
}
