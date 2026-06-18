// SPIKE M2 — runner de ABLACIÓN. ¿Qué mecanismo EMERGENTE hace falta para coexistir sin diales cableados?
//   naive (sin tripa, sin cover) · gut (saciedad) · cover (refugio espacial) · gut+cover (ambos)
// Multi-seed × tamaños. Mide: coexistencia (ambos vivos al final), estabilidad (CV de pob. en la 2ª mitad), mínimos.
//   uso: node zenote2/spikes/m2-coexistence/run.mjs [ticks] [seedsCSV] [sizesCSV]

import { M2Sim } from './sim.js';

const TICKS = +(process.argv[2] || 20000);
const SEEDS = (process.argv[3] || '1,2,3').split(',').map(Number);
const SIZES = (process.argv[4] || '1000,2000').split(',').map(Number);
const ALL_CASES = [
  { name: 'naive',     satiety: false, cover: false },
  { name: 'gut',       satiety: true,  cover: false },
  { name: 'cover',     satiety: false, cover: true  },
  { name: 'gut+cover', satiety: true,  cover: true  },
];
const ONLY = process.argv[5] ? new Set(process.argv[5].split(',')) : null;   // 5º arg: filtro de casos
const CASES = ONLY ? ALL_CASES.filter(c => ONLY.has(c.name)) : ALL_CASES;

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const std  = (a) => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };

function runOne(cs, size, seed) {
  // Sembrado a DENSIDAD CONSTANTE (∝ área, Modelo A) → variar `size` aísla el REFUGIO ESPACIAL (Huffaker), no la densidad.
  const areaScale = (size / 1000) ** 2;
  const cap = Math.max(6000, Math.round(9000 * areaScale));
  const sim = new M2Sim({ size, seed, satiety: cs.satiety, cover: cs.cover, cap });
  sim.seed(Math.round(500 * areaScale), Math.round(100 * areaScale));
  const hp = [], hq = []; // historia de pob. (presa, depredador)
  let preyExt = -1, predExt = -1;
  for (let t = 0; t < TICKS; t++) {
    sim.step();
    if (t % 50 === 0) { hp.push(sim.nPrey); hq.push(sim.nPred); }
    if (preyExt < 0 && sim.nPrey === 0) preyExt = t;
    if (predExt < 0 && sim.nPred === 0) predExt = t;
  }
  const half = (a) => a.slice((a.length / 2) | 0);
  const hp2 = half(hp), hq2 = half(hq);
  const coexist = sim.nPrey > 0 && sim.nPred > 0;
  return {
    coexist, prey: sim.nPrey, pred: sim.nPred,
    preyMean: mean(hp2), predMean: mean(hq2),
    preyCV: mean(hp2) > 0 ? std(hp2) / mean(hp2) : 0,
    predCV: mean(hq2) > 0 ? std(hq2) / mean(hq2) : 0,
    preyMin: Math.min(...hp), predMin: Math.min(...hq),
    preyExt, predExt,
  };
}

const pad = (s, w) => String(s).padStart(w);
console.error(`Ablación M2: ${CASES.length} casos × ${SIZES.length} sizes × ${SEEDS.length} seeds × ${TICKS} ticks...\n`);

const rows = [];
for (const cs of CASES) for (const size of SIZES) {
  const res = SEEDS.map(seed => {
    const r = runOne(cs, size, seed);
    const tag = r.coexist ? 'COEXISTE' : (r.predExt >= 0 ? `pred✝@${r.predExt}` : r.preyExt >= 0 ? `prey✝@${r.preyExt}` : 'colapso');
    console.error(`  ${pad(cs.name,9)} size=${size} seed=${seed} → presa ${pad(r.prey,5)} (CV ${r.preyCV.toFixed(2)}) · depred ${pad(r.pred,4)} (CV ${r.predCV.toFixed(2)}) · min(${r.preyMin},${r.predMin}) · ${tag}`);
    return r;
  });
  const coex = res.filter(r => r.coexist).length;
  rows.push({ name: cs.name, size, coex, n: res.length,
    preyMean: mean(res.map(r => r.preyMean)), predMean: mean(res.map(r => r.predMean)),
    preyCV: mean(res.map(r => r.preyCV)), predCV: mean(res.map(r => r.predCV)) });
}

console.log(`\n=== SPIKE M2 — coexistencia EMERGENTE (sin diales cableados) · ${SEEDS.length} seeds × ${TICKS} ticks ===\n`);
console.log([pad('caso',9), pad('size',5), pad('coex',6), pad('presa~',7), pad('depr~',6), pad('preyCV',7), pad('predCV',7)].join(' '));
for (const r of rows) console.log([pad(r.name,9), pad(r.size,5), pad(r.coex + '/' + r.n,6), pad(r.preyMean.toFixed(0),7), pad(r.predMean.toFixed(0),6), pad(r.preyCV.toFixed(2),7), pad(r.predCV.toFixed(2),7)].join(' '));
console.log('\nLeyenda: coex=seeds con ambos vivos al final · ~=media 2ª mitad · CV=coef. variación (alto=boom-bust, bajo=estable)');
console.log('Baseline a batir (app actual, cadena plena): ~3/8 seeds, cazador extinción-propenso.');
