// SPIKE M1 — techo de COSTE (riesgo R2): ¿caben en tiempo real los mecanismos MÁS caros a escala? (descartable)
// Agentes "tontos" que ejecutan SOLO las operaciones caras del modelo nuevo, a escala realista:
//   (a) sensado de vecindad (spatial hash)  (b) campo de OCUPACIÓN  (c) forward del CEREBRO neuronal por tick
//   (d) PLASTICIDAD (Hebbiano por sinapsis, lo más caro, 2.3)  (e) productores-como-agentes = más agentes (pop alta)
// Mide ms/tick. Presupuesto a 20 t/s = 50 ms/tick. Go: cabe (con o sin fallbacks). No-go: ni con fallbacks cabe.
//   uso: node zenote2/spikes/m1-cost/run.mjs [ticks]

import { makeRng } from '../../src/util/rng.js';
import { SpatialHash } from '../../src/engine/hash.js';

const TICKS = +(process.argv[2] || 400);
const WORLD = 1500;          // mundo donde M2 coexiste; densidad realista
const I = 12, O = 6;         // entradas/salidas del controlador (generoso: > el actual 11/4)

// Cerebro recurrente (Elman): pesos = I*H + H*H + H + H*O + O. Variar H controla el tamaño de red.
const weightsFor = (H) => I * H + H * H + H + H * O + O;

function bench({ pop, H, net, plast, ticks }) {
  const rng = makeRng(1);
  const W = weightsFor(H);
  // SoA
  const x = new Float32Array(pop), y = new Float32Array(pop), vx = new Float32Array(pop), vy = new Float32Array(pop);
  const weights = new Float32Array(pop * W);          // pesos por agente (el caso pesado en memoria)
  const hid = new Float32Array(pop * H);              // estado oculto recurrente
  for (let i = 0; i < pop; i++) { x[i] = rng.next() * WORLD; y[i] = rng.next() * WORLD; }
  for (let k = 0; k < weights.length; k++) weights[k] = (rng.next() - 0.5) * 0.5;

  const hash = new SpatialHash(WORLD, 40); hash.setCapacity(pop);
  const cols = Math.max(8, Math.round(WORLD / 20)); const occ = new Float32Array(cols * cols); // campo de ocupación
  const cellW = WORLD / cols;
  const inp = new Float32Array(I), h2 = new Float32Array(H), out = new Float32Array(O);
  const scanR = 30, scan2 = scanR * scanR, hc = hash.cell, hCols = hash.cols, hRows = hash.rows;

  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    // hash + ocupación
    hash.clear(); occ.fill(0);
    for (let i = 0; i < pop; i++) { hash.insert(i, x[i], y[i]); let cx=(x[i]/cellW)|0, cy=(y[i]/cellW)|0; if(cx>=cols)cx=cols-1; if(cy>=cols)cy=cols-1; occ[cy*cols+cx] += 1; }

    for (let i = 0; i < pop; i++) {
      // (a) sensado de vecindad (toroidal, 3×3 del hash)
      let nn = 0, ndx = 0, ndy = 0;
      const hx = (x[i] / hc) | 0, hy = (y[i] / hc) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = ((hx+ox)%hCols+hCols)%hCols, gy = ((hy+oy)%hRows+hRows)%hRows;
        let j = hash.head[gy*hCols+gx];
        while (j !== -1) { if (j !== i) { let dx=x[j]-x[i], dy=y[j]-y[i];
          if(dx>WORLD*0.5)dx-=WORLD; else if(dx<-WORLD*0.5)dx+=WORLD; if(dy>WORLD*0.5)dy-=WORLD; else if(dy<-WORLD*0.5)dy+=WORLD;
          if(dx*dx+dy*dy<scan2){ nn++; ndx+=dx; ndy+=dy; } } j = hash.next[j]; }
      }
      if (!net) { // base: solo sensado + mover (sin cerebro)
        vx[i] += (rng.next()-0.5)*0.2; vy[i] += (rng.next()-0.5)*0.2;
        let nx=x[i]+vx[i], ny=y[i]+vy[i]; if(nx<0)nx+=WORLD; else if(nx>=WORLD)nx-=WORLD; if(ny<0)ny+=WORLD; else if(ny>=WORLD)ny-=WORLD; x[i]=nx; y[i]=ny;
        continue;
      }
      // entradas (sensado + ocupación + ruido)
      inp[0]=ndx*0.01; inp[1]=ndy*0.01; inp[2]=nn*0.05-1; inp[3]=occ[((y[i]/cellW)|0)*cols+((x[i]/cellW)|0)]*0.1-1;
      for (let k=4;k<I;k++) inp[k]=hid[i*H+(k%H)]; // resto: realimentación barata

      // (c) FORWARD (Elman): in→hid + hid(t-1)→hid + bias → tanh ; hid→out + bias → tanh
      const wb = i*W, hb = i*H;
      const wIh=0, wHh=I*H, bH=I*H+H*H, wHo=bH+H, bO=wHo+H*O;
      for (let hh=0; hh<H; hh++) { let s=weights[wb+bH+hh];
        for (let k=0;k<I;k++) s += inp[k]*weights[wb+wIh+k*H+hh];
        for (let p=0;p<H;p++) s += hid[hb+p]*weights[wb+wHh+p*H+hh];
        h2[hh]=Math.tanh(s);
      }
      for (let oo=0; oo<O; oo++) { let s=weights[wb+bO+oo];
        for (let hh=0;hh<H;hh++) s += h2[hh]*weights[wb+wHo+hh*O+oo];
        out[oo]=Math.tanh(s);
      }

      // (d) PLASTICIDAD (Hebbiano modulado por recompensa, O(pesos)/tick — lo más caro)
      if (plast) {
        const reward = out[0] * 0.1, lr = 0.001 * reward;
        for (let hh=0; hh<H; hh++) { const post=h2[hh];
          for (let k=0;k<I;k++) { const idx=wb+wIh+k*H+hh; weights[idx]+=lr*inp[k]*post; }
          for (let p=0;p<H;p++) { const idx=wb+wHh+p*H+hh; weights[idx]+=lr*hid[hb+p]*post; }
        }
        for (let oo=0; oo<O; oo++) { const post=out[oo];
          for (let hh=0;hh<H;hh++){ const idx=wb+wHo+hh*O+oo; weights[idx]+=lr*h2[hh]*post; } }
      }

      for (let hh=0; hh<H; hh++) hid[hb+hh]=h2[hh]; // guardar memoria

      // mover según salidas
      vx[i]+=out[1]*0.3; vy[i]+=out[2]*0.3;
      let nx=x[i]+vx[i], ny=y[i]+vy[i]; if(nx<0)nx+=WORLD; else if(nx>=WORLD)nx-=WORLD; if(ny<0)ny+=WORLD; else if(ny>=WORLD)ny-=WORLD; x[i]=nx; y[i]=ny;
      vx[i]*=0.9; vy[i]*=0.9;
    }
  }
  const ms = (performance.now() - t0) / ticks;
  return { W, ms, mem: (weights.byteLength/1e6) };
}

const pad=(s,w)=>String(s).padStart(w);
console.log(`=== SPIKE M1 — coste a escala (mundo ${WORLD}, ${TICKS} ticks/celda) ===`);
console.log(`Presupuesto: 20 t/s → 50 ms/tick. (El motor M0 base ya cabía con holgura; aquí + cerebro + plasticidad.)\n`);
console.log([pad('caso',16),pad('pop',6),pad('H',4),pad('pesos',7),pad('ms/tick',8),pad('t/s',7),pad('mem(MB)',8),'¿cabe?'].join(' '));

const cases = [
  { name:'base (sin red)', net:false, plast:false },
  { name:'fwd', net:true, plast:false },
  { name:'fwd+plasticidad', net:true, plast:true },
];
for (const pop of [3000, 5000]) {
  for (const H of [8, 16, 24]) {
    for (const c of cases) {
      const r = bench({ pop, H, net:c.net, plast:c.plast, ticks:TICKS });
      const tps = 1000/r.ms, fits = r.ms < 50 ? '✓' : (r.ms<50? '' : '✗ (>50ms)');
      console.log([pad(c.name,16),pad(pop,6),pad(c.net?H:'-',4),pad(c.net?r.W:'-',7),pad(r.ms.toFixed(2),8),pad(tps.toFixed(0),7),pad(r.mem.toFixed(1),8), r.ms<50?'✓ cabe':'✗ NO'].join(' '));
    }
  }
}
console.log('\nFallbacks si no cabe (2.3): aprendizaje cada N ticks · red más pequeña (desarrollo la acota) · campo de productores en vez de agentes.');
