// SPIKE #1 — CORRIENTE DEL ABISMO: el campo de luz deriva en el tiempo (el fondo fluye). ¿Crea estructura espacial NO
// estacionaria sin colapsar la población? Barre lightFlow a 25k ticks midiendo: pop, het%, MOVIMIENTO medio (proxy de
// "perseguir el bloom" — si el recurso se mueve, la sesilidad pura deja de rendir → más movimiento), CONSERVACIÓN
// (la luz es fuente → debe seguir cuadrando) y RENDIMIENTO (coste del re-horneado del campo).
//   uso: node zenote2/spikes/abyss-flow/probe.mjs
import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim } from '../../src/engine/sim.js';
import { develop } from '../../src/engine/genome.js';
import { computePhenotype, trophicRole } from '../../src/engine/phenotype.js';

const TICKS = 25000;
function totalMatter(s) { return s.world.totalNutrient() + s.world.totalDetritusM() + s.totalMass(); }
function totalStored(s) { let e = 0; const eD = s.eD; for (let i = 0; i < s.cap; i++) if (s.alive[i]) e += s.E[i] + s.gut[i] + s.mass[i] * eD; return e + s.world.totalDetritusE(); }
function hetFrac(s) { const idx = []; for (let i = 0; i < s.cap; i++) if (s.alive[i]) idx.push(i); if (!idx.length) return 0;
  const pick = idx.length <= 400 ? idx : Array.from({ length: 400 }, () => idx[(Math.random() * idx.length) | 0]);
  let h = 0; for (const i of pick) if (trophicRole(computePhenotype(develop(s.genome[i]))) !== 'autotrofo') h++; return h / pick.length; }
function meanSpeed(s) { let v = 0, n = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) { v += Math.hypot(s.vx[i], s.vy[i]); n++; } return n ? v / n : 0; }

function run(lightFlow) {
  const w = new World(1500, 1, { ...WORLD_P, lightBase: 2.5, lightFlow }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed: 1, cap: 14000 }); s.seed(800);
  const budget = totalMatter(s);
  let prevStored = totalStored(s), prevHeat = w.heat, prevCap = w.lightCaptured;
  let maxMatterDrift = 0, maxEnergyResidual = 0;
  let accPop = 0, accSpd = 0, nSamp = 0;
  const t0 = performance.now();
  for (let t = 0; t < TICKS; t++) {
    s.step();
    const md = Math.abs(totalMatter(s) - budget) / budget; if (md > maxMatterDrift) maxMatterDrift = md;
    const stored = totalStored(s), dCap = w.lightCaptured - prevCap, dHeat = w.heat - prevHeat;
    const residual = Math.abs((stored - prevStored) - (dCap - dHeat)); if (residual > maxEnergyResidual) maxEnergyResidual = residual;
    prevStored = stored; prevHeat = w.heat; prevCap = w.lightCaptured;
    if (t >= TICKS / 2 && t % 200 === 0) { accPop += s.pop(); accSpd += meanSpeed(s); nSamp++; }
  }
  const tps = TICKS / ((performance.now() - t0) / 1000);
  return { lightFlow, pop: accPop / nSamp | 0, het: (hetFrac(s) * 100) | 0, spd: accSpd / nSamp, tps: tps | 0,
    matterOK: maxMatterDrift < 1e-3, energyOK: maxEnergyResidual < 1e-2, mD: maxMatterDrift, eR: maxEnergyResidual };
}

console.log(`=== SPIKE corriente del abismo — barrido de lightFlow (${TICKS} ticks, seed 1, 800 founders) ===\n`);
console.log('lightFlow |  pop | het% | vel.media | t/s | conserva');
console.log('----------|------|------|-----------|-----|---------');
for (const lf of [0, 0.0002, 0.0004, 0.0008, 0.0016]) {
  const r = run(lf);
  console.log(`${lf.toFixed(4).padStart(9)} | ${String(r.pop).padStart(4)} | ${String(r.het).padStart(3)}% | ${r.spd.toFixed(3).padStart(9)} | ${String(r.tps).padStart(3)} | ${(r.matterOK && r.energyOK) ? 'OK ✓' : `✗ m=${r.mD.toExponential(1)} e=${r.eR.toExponential(1)}`}`);
}
