// Smoke test headless del MOTOR (sin DOM): valida invariantes baratos para cazar regresiones.
// El motor (Sim y sus deps) es ESM puro y corre en Node; worker.js (postMessage/render) NO se ejercita aquí.
// Uso:  node test/smoke.mjs   ·   npm test     → sale 0 si todo OK, 1 si algo falla.

import { config } from '../src/config.js';
import { Sim } from '../src/engine/sim.js';
import { NUM_GENES } from '../src/engine/genome.js';
import { trophicRole } from '../src/engine/organism.js';

let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  ok  ' : 'FAIL  ') + msg); if (!cond) failures++; };

// 1) Genoma: el conteo debe casar con la SPEC (23 base + 8×10 nodos + 83 cerebro = 186).
check(NUM_GENES === 201, `NUM_GENES === 201 (real: ${NUM_GENES})`);

// Materia total (pecera cerrada) = N libre + pasto·epu + Σ(E+cuerpo) de los vivos + carroña. Debe conservarse.
const matter = (sim) => {
  const W = sim.world, epu = config.resource.energyPerUnit;
  let res = 0; for (let k = 0; k < W.resource.length; k++) res += W.resource[k];
  let car = 0; for (let k = 0; k < W.carrion.length; k++) car += W.carrion[k];
  let bio = 0; for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) bio += sim.E[i] + sim.bodyMatter[i];
  return W.totalN() + res * epu + bio + car;
};

config.pop.seed = 123;                       // semilla fija → corrida reproducible
const sim = new Sim(config);
const M0 = matter(sim), pop0 = sim.popCount;

const N = 1500;
let threw = null;
try { for (let t = 0; t < N; t++) sim.step(); } catch (e) { threw = e; }
check(!threw, `${N} ticks sin excepción` + (threw ? ` → ${threw.message}` : ''));

const M1 = matter(sim), pop1 = sim.popCount;
// 2) El motor avanzó y la población no colapsó a 0.
check(sim.tick === N, `tick avanzó a ${N} (real: ${sim.tick})`);
check(pop1 > 0, `población viva tras ${N} ticks (inicio ${pop0} → fin ${pop1})`);
check(Number.isFinite(M1), 'materia finita (no NaN/Inf)');

// 3) Conservación de materia (pecera cerrada; ±0.05% es ruido de acumulación Float32, ver SPEC §3ter).
const drift = (M1 - M0) / M0 * 100;
check(Math.abs(drift) < 0.1, `materia conservada: deriva ${drift.toFixed(4)}% (< 0.1%)`);

// 4) Red trófica activa (combate ON por defecto): hubo depredación.
if (config.combat.enabled) check(sim.kills > 0, `depredación activa (${sim.kills} presas abatidas)`);

// 5) Clasificación trófica UNIFICADA: curva de población y color 'role' comparten trophicRole (casos canónicos).
check(trophicRole(0.10, 0.0, 0.0) === 0, "trophicRole: herbívoro puro → 0");
check(trophicRole(0.50, 0.2, 0.1) === 3, "trophicRole: omnívoro (dieta media) → 3");
check(trophicRole(0.90, 0.5, 0.1) === 2, "trophicRole: comecarne cazador → 2");
check(trophicRole(0.90, 0.1, 0.5) === 1, "trophicRole: comecarne carroñero → 1");

console.log(failures === 0 ? '\nSMOKE OK ✅' : `\nSMOKE FAIL ❌ (${failures} fallo${failures === 1 ? '' : 's'})`);
process.exit(failures === 0 ? 0 : 1);
