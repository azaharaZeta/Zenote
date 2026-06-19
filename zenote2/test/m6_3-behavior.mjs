// M6.3 — ¿qué aporta la EVOLUCIÓN/PLASTICIDAD del cerebro sobre el arranque SEMBRADO (seedBrain)? TRES brazos:
//   · NEURONAL: cerebro evolucionado + plástico (el modelo real).
//   · seedBrain CONGELADO: el mismo seedBrain canónico para todos, SIN mutación/recombinación/plasticidad del cerebro
//     (la morfología SÍ evoluciona). Es la conducta SEMBRADA pura → el control honesto que faltaba (auditoría biológica).
//   · ALEATORIO: salidas al azar (ignora el cerebro).
// Honesto: «neuronal > aleatorio» mide sobre todo el seedBrain (un cerebro sembrado ya caza más que el azar). La pregunta
// real es «neuronal > congelado»: ¿la evolución/aprendizaje del cerebro AÑADE algo sobre el arranque sembrado?
//   uso: node zenote2/test/m6_3-behavior.mjs [ticks]

import { World, WORLD_P } from '../src/engine/world.js';
import { Sim, SIM_P } from '../src/engine/sim.js';
import { develop } from '../src/engine/genome.js';
import { computePhenotype, trophicRole } from '../src/engine/phenotype.js';

const eD = SIM_P.eDensity, TICKS = +(process.argv[2] || 15000);
const matter = (s) => s.world.totalNutrient() + s.world.totalDetritusM() + s.totalMass();
const stored = (s) => { let e = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) e += s.E[i] + s.gut[i] + s.mass[i] * eD; return e + s.world.totalDetritusE(); };
const hetFrac = (s) => { const idx = []; for (let i = 0; i < s.cap; i++) if (s.alive[i]) idx.push(i); if (!idx.length) return 0; const pick = idx.length <= 200 ? idx : Array.from({ length: 200 }, () => idx[(Math.random() * idx.length) | 0]); let h = 0; for (const i of pick) if (trophicRole(computePhenotype(develop(s.genome[i]))) !== 'autotrofo') h++; return h / pick.length; };

function runOne(opts = {}) {
  const w = new World(1500, 1, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed: 1, cap: 14000, ...opts }); s.seed(800);
  const budget = matter(s); let prevStored = stored(s), prevHeat = w.heat, prevCap = w.lightCaptured;
  let mDrift = 0, eRes = 0, heatMono = true, lastHeat = w.heat;
  for (let t = 0; t < TICKS; t++) {
    s.step();
    const md = Math.abs(matter(s) - budget) / budget; if (md > mDrift) mDrift = md;
    const st = stored(s), r = Math.abs((st - prevStored) - ((w.lightCaptured - prevCap) - (w.heat - prevHeat))); if (r > eRes) eRes = r;
    if (w.heat < lastHeat - 1e-9) heatMono = false; lastHeat = w.heat;
    prevStored = st; prevHeat = w.heat; prevCap = w.lightCaptured;
  }
  return { pop: s.pop(), kills: s.kills, het: hetFrac(s), mDrift, eRes, heatMono };
}

console.log('=== M6.3 — aportación de evolución/plasticidad sobre el seedBrain (3 brazos) ===\n');
console.error('corriendo neuronal (evolucionado + plástico)…'); const N = runOne({});
console.error('corriendo seedBrain CONGELADO…'); const F = runOne({ freezeBrain: true });
console.error('corriendo control aleatorio…'); const R = runOne({ randomBehavior: true });

console.log(`                       pop    depredaciones   heterótrofos`);
console.log(`  NEURONAL (evo+plast) ${String(N.pop).padStart(5)}   ${String(N.kills).padStart(11)}   ${(N.het * 100).toFixed(0).padStart(8)}%`);
console.log(`  seedBrain congelado  ${String(F.pop).padStart(5)}   ${String(F.kills).padStart(11)}   ${(F.het * 100).toFixed(0).padStart(8)}%`);
console.log(`  control aleatorio    ${String(R.pop).padStart(5)}   ${String(R.kills).padStart(11)}   ${(R.het * 100).toFixed(0).padStart(8)}%`);
const seedVsRnd = F.kills / Math.max(1, R.kills), evoVsSeed = N.kills / Math.max(1, F.kills);
console.log(`\n  seedBrain vs aleatorio ... ${seedVsRnd.toFixed(2)}× depredaciones → ${seedVsRnd > 1.5 ? 'el arranque sembrado YA es competente ✓' : 'el seed no destaca sobre el azar'}`);
console.log(`  evo+plast vs seedBrain ... ${evoVsSeed.toFixed(2)}× depredaciones → ${evoVsSeed > 1.2 ? 'la evolución/aprendizaje AÑADE caza' : evoVsSeed > 0.85 ? 'aporta poco sobre el seed (la conducta la sostiene el seedBrain — honesto)' : 'rinde MENOS que el seed congelado'}`);
console.log(`\nInvariantes (neuronal): materia ${(N.mDrift * 100).toExponential(1)}% ${N.mDrift < 1e-3 ? '✓' : '✗'} · energía/tick ${N.eRes.toExponential(1)} ${N.eRes < 1e-2 ? '✓' : '✗'} · calor ${N.heatMono ? '✓' : '✗'}`);
// HONESTO: el GO valida invariantes + vivo + que el seedBrain es competente (caza > aleatorio). El delta evo-vs-seed se
// REPORTA como observable (no se gatea): si es ~1, la conducta la sostiene el seedBrain, no la evolución — y eso es un
// resultado válido, no un fallo. Afirmación correcta del proyecto: "conducta neuronal que evoluciona/aprende desde un
// arranque sembrado", NO "conducta 100% emergente desde cero".
const invOK = N.mDrift < 1e-3 && N.eRes < 1e-2 && N.heatMono;
console.log(`\n${invOK && N.pop > 50 && seedVsRnd > 1.5 ? 'M6.3 GO ✓ — el seedBrain es competente (caza > aleatorio) + invariantes intactos; el aporte de la evolución/aprendizaje es el delta reportado arriba (observable, no criterio)' : 'revisar ✗'}`);
