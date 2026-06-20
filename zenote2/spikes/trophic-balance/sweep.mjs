// BARRIDO de las dos palancas anti-bloat: A = luz finita (lightCompete) · B = coste de masa super-lineal (massCostExp).
// Busca la combinación que mantiene población alta + diversidad de talla + especialistas, SIN bloat (masa/foto-máx/%generalistas bajos).
//   uso: node zenote2/spikes/trophic-balance/sweep.mjs [ticks]

import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';

const TICKS = +(process.argv[2] || 25000), SEEDS = [1, 2];
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

function run(seed, lc, exp) {
  SIM_P.lightCompete = lc; SIM_P.massCostExp = exp;
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed, cap: 12000 }); s.seed(800);
  for (let t = 0; t < TICKS; t++) s.step();
  const photo = [], mouth = [], mass = []; let gen = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) { photo.push(s.photoCap[i]); mouth.push(s.mouthCap[i]); mass.push(s.mass[i]); if (s.photoCap[i] > 60 && s.mouthCap[i] > 20) gen++; }
  const n = photo.length;
  return { pop: n, mass: mean(mass), massStd: std(mass), fotoMax: Math.max(...photo) | 0, gen: gen / n * 100 };
}

const CFG = [
  ['base (actual)', false, 1],
  ['A luz finita', true, 1],
  ['B masa^1.2', false, 1.2],
  ['B masa^1.3', false, 1.3],
  ['A+B^1.2', true, 1.2],
  ['A+B^1.3', true, 1.3],
];
console.log(`=== barrido anti-bloat · ${SEEDS.length} seeds × ${TICKS} ticks ===`);
console.log('  (queremos: pop alta · masa baja · fotoMax bajo · generalistas% bajo · massStd>0 = mantiene diversidad de talla)\n');
console.log('  config            pop    masa(±std)    fotoMax   generalistas%');
for (const [name, lc, exp] of CFG) {
  let pop = 0, ms = 0, mstd = 0, fmax = 0, g = 0;
  for (const seed of SEEDS) { const r = run(seed, lc, exp); pop += r.pop; ms += r.mass; mstd += r.massStd; fmax += r.fotoMax; g += r.gen; }
  const m = SEEDS.length;
  console.log(`  ${name.padEnd(16)} ${String(Math.round(pop / m)).padStart(4)}   ${(ms / m).toFixed(1)}±${(mstd / m).toFixed(1)}      ${String(Math.round(fmax / m)).padStart(4)}      ${(g / m).toFixed(0)}%`);
}
SIM_P.lightCompete = false; SIM_P.massCostExp = 1;
