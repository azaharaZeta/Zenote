// ¿Aguanta la pecera cambios de parámetros EN VIVO? (desechable) Asienta una pecera cerrada, cambia un parámetro
// a mitad de run (como el slider de la UI = setPath(config,...)) y mide si la MATERIA total se conserva o salta.
// node _seal_test.mjs ; luego borrar.
import { Sim } from './src/engine/sim.js';
import { config } from './src/config.js';

const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
const matter = (sim) => { const W = sim.world, epu = sim.cfg.resource.energyPerUnit; let b = 0; for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) b += sim.E[i] + sim.bodyMatter[i]; return W.N + sum(W.resource) * epu + sum(W.carrion) + b; };
const setPath = (o, path, v) => { const ks = path.split('.'); let t = o; for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]]; t[ks[ks.length - 1]] = v; };

function test(label, changeKey, changeVal, settle, post) {
  const cfg = structuredClone(config);
  cfg.world.closedMatter = true; cfg.world.matterBudget = 60000; cfg.world.closedRegen = 0.0016; cfg.pop.seed = 7;
  const sim = new Sim(cfg);
  for (let t = 0; t < settle; t++) sim.step();
  const Mbefore = matter(sim), popBefore = sim.popCount;
  if (changeKey) setPath(cfg, changeKey, changeVal);   // ← igual que mover el slider en la UI (worker: setPath(config,...))
  const Mafter = matter(sim);                          // mismo ESTADO; si el parámetro entra en la fórmula de M (epu), salta
  const jump = Mafter - Mbefore;
  let maxDrift = 0;                                    // ¿se conserva HACIA ADELANTE tras el cambio?
  for (let t = 0; t < post; t++) { sim.step(); const d = Math.abs(matter(sim) - Mafter); if (d > maxDrift) maxDrift = d; }
  const popAfter = sim.popCount;
  const ok = Math.abs(jump) / Mbefore < 1e-3 && maxDrift / Mafter < 1e-3;
  console.log(`${label.padEnd(34)} │ salto al cambiar ${(jump >= 0 ? '+' : '') + jump.toFixed(1).padStart(8)} (${(jump / Mbefore * 100).toFixed(2).padStart(6)}%) │ deriva post ${(maxDrift / Mafter * 100).toExponential(1)} │ pop ${popBefore}→${popAfter} │ ${ok ? '✓ CONSERVA' : '⚠ ROMPE'}`);
}

console.log('PECERA CERRADA — cambio de parámetro EN VIVO a tick 5000 (seed 7), 3000 ticks después:\n');
test('(referencia: sin cambios)', null, null, 5000, 3000);
test('Coste basal  c_base ×3', 'energy.c_base', config.energy.c_base * 3, 5000, 3000);
test('Energía de presa  preyGain 0.5', 'energy.preyGain', 0.5, 5000, 3000);
test('Valor del cadáver  carcassValue 0.5', 'energy.carcassValue', 0.5, 5000, 3000);
test('Energía máxima  E_max_base 120', 'energy.E_max_base', 120, 5000, 3000);
test('Coste de nado  moveCost ×3', 'energy.moveCost', config.energy.moveCost * 3, 5000, 3000);
test('>>> Energía por unidad  epu 10→20', 'resource.energyPerUnit', 20, 5000, 3000);
test('>>> Energía por unidad  epu 10→5', 'resource.energyPerUnit', 5, 5000, 3000);
