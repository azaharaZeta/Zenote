// SONDA — ¿el modelo penaliza al GENERALISTA (foto alto Y boca alta a la vez)? El usuario vio 200/90. Trade-off esperado:
// presupuesto de partes (32) + coste de masa + RENDIMIENTOS DECRECIENTES del foto (satura en photoHalf=40) → invertir en
// ambos = cuerpo enorme y caro con foto desperdiciado → debería perder ante especialistas. Mide a varios tiempos si los
// generalistas "lo tienen todo" son comunes/persistentes y si son EFICIENTES (energía) o bloated (grandes y a duras penas).
//   uso: node zenote2/spikes/trophic-balance/probe.mjs

import { World, WORLD_P } from '../../src/engine/world.js';
import { Sim, SIM_P } from '../../src/engine/sim.js';

const SEEDS = [1, 2, 3], CHECKS = [5000, 15000, 30000];
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, (p * s.length) | 0)] || 0; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

function snap(s) {
  const photo = [], mouth = [], mass = [], E = []; let bothHi = 0;
  const gE = [], gN = [], sE = [], sN = [];   // energía de generalistas (foto>60 & boca>20) vs resto
  for (let i = 0; i < s.cap; i++) if (s.alive[i]) {
    const p = s.photoCap[i], m = s.mouthCap[i];
    photo.push(p); mouth.push(m); mass.push(s.mass[i]); E.push(s.E[i]);
    const gen = p > 60 && m > 20;
    if (gen) { bothHi++; gE.push(s.E[i]); } else sE.push(s.E[i]);
  }
  const n = photo.length;
  // correlación foto↔boca normalizada por masa (trade-off real: negativa = compromiso)
  const pf = photo.map((p, i) => p / Math.max(0.1, mass[i])), mf = mouth.map((m, i) => m / Math.max(0.1, mass[i]));
  const mp = mean(pf), mm = mean(mf); let cov = 0, vp = 0, vm = 0;
  for (let i = 0; i < n; i++) { cov += (pf[i] - mp) * (mf[i] - mm); vp += (pf[i] - mp) ** 2; vm += (mf[i] - mm) ** 2; }
  const corr = cov / Math.max(1e-9, Math.sqrt(vp * vm));
  return { n, photoMean: mean(photo) | 0, photoMax: Math.max(...photo) | 0, mouthMean: mean(mouth) | 0, mouthMax: Math.max(...mouth) | 0,
    massMean: +mean(mass).toFixed(1), genPct: (bothHi / n * 100) | 0, genE: +mean(gE).toFixed(1), restE: +mean(sE).toFixed(1), corrNorm: +corr.toFixed(2) };
}

console.log('=== balance trófico: ¿se penaliza al generalista (foto alto Y boca alta)? ===');
console.log('genPct = % con foto>60 Y boca>20 · genE/restE = energía media · corrNorm = corr(foto/masa, boca/masa) (neg=trade-off)\n');
for (const seed of SEEDS) {
  const w = new World(1500, seed, { ...WORLD_P, lightBase: 2.5 }); w.nutrient.fill(1.5);
  const s = new Sim(w, { seed, cap: 12000 }); s.seed(800);
  let t = 0; console.log(`-- seed ${seed} --`);
  for (const T of CHECKS) { while (t < T) { s.step(); t++; } const r = snap(s);
    console.log(`  t=${String(T).padStart(5)} pop ${String(r.n).padStart(4)} · foto med/máx ${r.photoMean}/${r.photoMax} · boca med/máx ${r.mouthMean}/${r.mouthMax} · masa ${r.massMean} · GENERALISTAS ${r.genPct}% (E ${r.genE} vs resto ${r.restE}) · corr ${r.corrNorm}`); }
}
