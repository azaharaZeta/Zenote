// M6.3 — ¿EMERGE la conducta del cerebro neuronal (sin estrategia cableada)? Test: comparar el cerebro NEURONAL
// (evolucionado + plástico) contra un CONTROL de salidas ALEATORIAS (ignora el cerebro). Si el neuronal CAZA mucho
// más (depredación adaptativa) → la conducta emergió, no es suerte. + invariantes intactos.  uso: node zenote2/test/m6_3-behavior.mjs [ticks]

import { World, WORLD_P } from '../src/engine/world.js';
import { Sim, SIM_P } from '../src/engine/sim.js';
import { develop } from '../src/engine/genome.js';
import { computePhenotype, trophicRole } from '../src/engine/phenotype.js';

const eD = SIM_P.eDensity, TICKS = +(process.argv[2] || 15000);
const matter = (s) => s.world.totalNutrient() + s.world.totalDetritusM() + s.totalMass();
const stored = (s) => { let e = 0; for (let i = 0; i < s.cap; i++) if (s.alive[i]) e += s.E[i] + s.gut[i] + s.mass[i] * eD; return e + s.world.totalDetritusE(); };
const hetFrac = (s) => { const idx = []; for (let i = 0; i < s.cap; i++) if (s.alive[i]) idx.push(i); if (!idx.length) return 0; const pick = idx.length <= 200 ? idx : Array.from({ length: 200 }, () => idx[(Math.random() * idx.length) | 0]); let h = 0; for (const i of pick) if (trophicRole(computePhenotype(develop(s.genome[i]))) !== 'autotrofo') h++; return h / pick.length; };

function runOne(randomBehavior) {
  const w = new World(1500, 1, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed: 1, cap: 14000, randomBehavior }); s.seed(800);
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

console.log('=== M6.3 — conducta neuronal emergente (vs control aleatorio) ===\n');
console.error('corriendo neuronal…'); const N = runOne(false);
console.error('corriendo control aleatorio…'); const R = runOne(true);

console.log(`                 pop    depredaciones   heterótrofos`);
console.log(`  NEURONAL     ${String(N.pop).padStart(5)}   ${String(N.kills).padStart(11)}   ${(N.het * 100).toFixed(0).padStart(8)}%`);
console.log(`  control rnd  ${String(R.pop).padStart(5)}   ${String(R.kills).padStart(11)}   ${(R.het * 100).toFixed(0).padStart(8)}%`);
console.log(`\nInvariantes (neuronal): materia ${(N.mDrift * 100).toExponential(1)}% ${N.mDrift < 1e-3 ? '✓' : '✗'} · energía/tick ${N.eRes.toExponential(1)} ${N.eRes < 1e-2 ? '✓' : '✗'} · calor ${N.heatMono ? '✓' : '✗'}`);
const invOK = N.mDrift < 1e-3 && N.eRes < 1e-2 && N.heatMono, adaptive = N.kills > R.kills * 1.5;
console.log(`\n${invOK && N.pop > 50 && adaptive ? `M6.3 GO ✓ — conducta ADAPTATIVA emerge: el cerebro neuronal caza ${(N.kills / Math.max(1, R.kills)).toFixed(1)}× más que el control aleatorio (no es suerte); invariantes intactos` : invOK && N.pop > 50 ? 'invariantes+vivo OK; ventaja sobre el aleatorio débil — revisar pesos/plasticidad' : 'revisar ✗'}`);
