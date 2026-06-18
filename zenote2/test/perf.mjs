// M0 — arnés de PERFIL headless. Mide t/s del andamio a varias poblaciones (criterio go/no-go de M0:
// ¿tickea a miles de agentes en tiempo real? → retira parte de R2). + chequeo de DETERMINISMO (mismo seed
// → checksum idéntico), que será un invariante de validación en todos los hitos.
//   uso: node test/perf.mjs

import { Sim } from '../src/engine/sim.js';
import { config } from '../src/engine/config.js';

function makeConfig(pop) {
  return { ...config, pop: { ...config.pop, cap: pop }, world: { ...config.world } };
}

function checksum(sim) { // suma de posiciones (huella del estado)
  const s = sim.state, act = s.active, n = s.activeCount; let h = 0;
  for (let a = 0; a < n; a++) { const i = act[a]; h += s.x[i] * 0.0007 + s.y[i] * 0.0013; }
  return h;
}

function run(pop, ticks) {
  const sim = new Sim(makeConfig(pop));
  sim.seed(pop);
  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) sim.step();
  const ms = performance.now() - t0;
  const tps = (ticks / ms) * 1000;
  const agentTicksPerSec = (pop * ticks / ms) * 1000;
  return { ms, tps, agentTicksPerSec, checks: sim.neighborChecks, csum: checksum(sim) };
}

console.log('=== M0 andamio — perfil headless ===');
console.log(`mundo ${config.world.size}u · celda hash ${config.hash.cell}u · radio escaneo ${config.scan.radius}u\n`);

const TICKS = 2000;
console.log(`pob     t/s        ag·tick/s     vecinos/tick   ${TICKS} ticks (ms)`);
for (const pop of [1000, 3000, 5000, 10000]) {
  const r = run(pop, TICKS);
  console.log(
    `${String(pop).padStart(5)}  ${r.tps.toFixed(0).padStart(7)}   ${(r.agentTicksPerSec / 1e6).toFixed(1).padStart(8)}M   ${String(r.checks).padStart(10)}   ${r.ms.toFixed(0).padStart(8)}`
  );
}

// Determinismo: dos corridas idénticas → checksum idéntico (byte-determinismo).
console.log('\n=== determinismo (mismo seed → mismo estado) ===');
const a = run(3000, 500), b = run(3000, 500);
const ok = a.csum === b.csum;
console.log(`checksum A = ${a.csum.toFixed(6)}\nchecksum B = ${b.csum.toFixed(6)}\n→ ${ok ? 'OK (determinista)' : 'FALLO (no determinista)'}`);

// Referencia de tiempo real: a 20 t/s (objetivo de la app actual) hay 50 ms por tick de presupuesto.
console.log('\nReferencia: 20 t/s objetivo → 50 ms/tick de presupuesto. (El render es aparte; esto es solo el motor.)');
process.exit(ok ? 0 : 1);
