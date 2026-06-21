// M5.6 — WEB WORKER (motor). Aquí corre el motor (World+Sim) en un hilo APARTE del render. Por frame envía al hilo
// principal una "foto" compacta (posiciones + heading + cuerpos APLANADos en typed arrays transferibles) y recibe
// comandos (reset/pausa). Así la simulación no compite con el render (arquitectura objetivo del rediseño).

import { World, WORLD_P } from './world.js';
import { Sim, SIM_P } from './sim.js';
import { GENOME_P } from './genome.js';   // para el ritmo de mutación (parámetro de UI en vivo)
import { START, RENDER_P } from '../config.js';   // defaults de arranque y velocidad inicial (fuente única)

// OFICIO REALIZADO desde la DIETA (veg/caza/carroña acumuladas): el rol EMERGE de lo que el animal COME, no de su morfología
// (un herbívoro y un carnívoro tienen ambos boca → solo la dieta los distingue). 0 herbívoro · 1 carnívoro · 2 omnívoro.
function roleFromDiet(veg, prey, scav) { const tot = veg + prey + scav; if (tot < 0.5) return 0;   // recién nacido sin dieta → herbívoro por defecto
  const carn = (prey + scav) / tot; return carn > 0.6 ? 1 : carn < 0.25 ? 0 : 2; }

let worldSize = START.worldSize, seedCount = START.seedCount, spawnSpread = START.spawnSpread, diversity = START.diversity;   // parámetros de ARRANQUE (necesitan reinicio); se actualizan en init()
let world, sim, running = true, tps = RENDER_P.tps, maxSpeed = false;
let selectedId = -1;   // serial del agente inspeccionado (-1 = ninguno); su detalle EN VIVO viaja en cada foto
const CORPSE_LIFE = 240;   // #3 — vida visual del cadáver (ticks): ≈ lo que tarda su carroña en mineralizarse (decompose 0.02 → ~99% en ~230 ticks)
// historiales para las gráficas (muestreados por ticks; ventana acotada). Población = valor absoluto. Nacimientos y
// muertes = DELTA por ventana (un ritmo), de contadores ACUMULADOS del motor → guardamos su último valor para restar.
const HIST_W = 160, HIST_EVERY = 60; const histPop = [], histHerb = [], histCarn = []; let lastHist = -1e9;
const histSexB = [], histAsexB = [], histPred = [], histStarv = [];   // nacimientos sexual/asexual · muertes predación/inanición (por ventana)
let lastSexB = 0, lastAsexB = 0, lastKills = 0, lastStarved = 0;
const histMassH = [], histMassC = [];   // MASA media por oficio (herbívoro/carnívoro) en el tiempo → ver la TALLA evolucionar (#12): complementa el histograma (distribución ahora) con la trayectoria.
// HISTOGRAMA de un rasgo seleccionable: se computa AQUÍ (donde están los datos SoA) y al cliente solo viajan los bins.
// Por bin se separa por oficio (herbívoro vs resto, como la gráfica de población) → se VE la diferenciación de nicho (p.ej. boca:
// herbívoros bajos, carnívoros altos) y la (no) deriva de un gen (p.ej. reproK/investFrac agrupados = r/K near-neutral). Rango FIJO
// por rasgo → la distribución deriva sobre un eje estable = prueba VISUAL de la selección. (Sin coste relevante: bins de ~500 agentes.)
const HBINS = 28;
const HIST_TRAITS = { mass: [0, 16], mouthCap: [0, 40], vmax: [0, 2], nParts: [1, 32], reproK: [0.5, 2], investFrac: [0.2, 0.8], hue: [0, 1] };
let histTrait = 'mass';   // rasgo mostrado (lo fija la UI vía mensaje 'histTrait')

function init({ seed, worldSize: ws, seedCount: sc, spawnSpread: sp, diversity: dv } = {}) {
  // Parámetros de ARRANQUE (necesitan reinicio). Se conservan entre resets.
  if (Number.isFinite(+ws) && +ws > 0) worldSize = +ws | 0;
  if (Number.isFinite(+sc) && +sc > 0) seedCount = +sc | 0;
  if (Number.isFinite(+sp)) spawnSpread = Math.min(1, Math.max(0.05, +sp));   // 1 = todo el mundo · <1 = disco central
  if (Number.isFinite(+dv)) diversity = Math.min(1, Math.max(0, +dv));        // 1 = normal · 0 = founders idénticos
  // B5: semilla opcional (reproducibilidad). null/no-finito → aleatoria. La MISMA semilla alimenta mundo y población
  // → el motor es determinista (mismo seed → mismo mundo). Se devuelve abajo para que la UI la muestre.
  const sd = (seed == null || !Number.isFinite(+seed)) ? (Math.random() * 1e9) | 0 : (+seed | 0);
  world = new World(worldSize, sd, { ...WORLD_P, lightBase: START.lightBase });
  world.nutrient.fill(START.nutrientInit);
  world.veg.fill(START.vegInit);   // la base productora arranca sembrada
  sim = new Sim(world, { seed: sd, cap: START.cap });
  sim.seed(seedCount, spawnSpread, diversity);
  selectedId = -1;   // el mundo nuevo no tiene al agente inspeccionado
  histPop.length = 0; histHerb.length = 0; histCarn.length = 0; lastHist = -1e9;   // historiales limpios al (re)iniciar
  histSexB.length = 0; histAsexB.length = 0; histPred.length = 0; histStarv.length = 0; lastSexB = lastAsexB = lastKills = lastStarved = 0;
  histMassH.length = 0; histMassC.length = 0;
  // dims del mundo (cambian solo al reset). vegRef = veg máx aprox (para normalizar el color del fondo de vegetación). seed: la usada.
  postMessage({ type: 'world', cols: world.cols, rows: world.rows, cellW: world.cellW, size: worldSize, vegRef: world.P.vegKcoef * world.P.lightBase, seed: sd });
}

// Foto por frame: solo vivos, cuerpos aplanados (offset + [lx,ly,r,tissue] por parte). Transferible (cero copia).
function snapshot() {
  const s = sim, idx = []; let totalParts = 0;
  for (let i = 0; i < s.cap; i++) if (s.alive[i] && s.body[i]) { idx.push(i); totalParts += s.body[i].length; }
  const n = idx.length;
  // partData = [lx, ly, r, tissue, phase, aspect, dir] por nodo (stride 7): aspect+dir → siluetas orientadas en el render.
  // aE = energía normalizada [0,1] por agente (E/reproE) → el render atenúa a los hambrientos ("la muerte se ve venir").
  // aGazeX/Y = dirección al estímulo más saliente (mundo) · aAlert = intensidad [0,1] → el render ORIENTA y aviva los OJOS (todos sensan → todos tienen ojos).
  const ax = new Float32Array(n), ay = new Float32Array(n), ah = new Float32Array(n), aspd = new Float32Array(n), ahue = new Float32Array(n), aE = new Float32Array(n), aGazeX = new Float32Array(n), aGazeY = new Float32Array(n), aAlert = new Float32Array(n), arole = new Uint8Array(n), aid = new Int32Array(n), partOff = new Int32Array(n + 1), partData = new Float32Array(totalParts * 7);
  let po = 0, nHerb = 0, nCarn = 0, detail = null, massSumH = 0, massSumC = 0;   // massSum* → masa media por oficio (serie temporal #12)
  // histograma del rasgo seleccionado (por bin, separado herbívoro/resto). Rango fijo + array SoA del rasgo (o caso especial nParts/hue).
  const gh = new Float32Array(HBINS), gc = new Float32Array(HBINS);
  const trng = HIST_TRAITS[histTrait] || HIST_TRAITS.mass, tlo = trng[0], tspan = (trng[1] - trng[0]) || 1;
  const tArr = histTrait === 'mass' ? s.mass : histTrait === 'mouthCap' ? s.mouthCap : histTrait === 'vmax' ? s.vmax : histTrait === 'reproK' ? s.reproK : histTrait === 'investFrac' ? s.investFrac : null;
  for (let a = 0; a < n; a++) {
    const i = idx[a]; ax[a] = s.x[i]; ay[a] = s.y[i]; ahue[a] = s.genome[i].hue; aid[a] = s.serial[i];
    aE[a] = Math.min(1, Math.max(0, s.E[i] / (SIM_P.reproE * s.reproK[i])));   // vitalidad para el render (atenúa hambrientos); umbral PROPIO (r/K)
    const vx = s.vx[i], vy = s.vy[i], sp = Math.sqrt(vx * vx + vy * vy); ah[a] = sp > 1e-3 ? Math.atan2(vy, vx) : 0;
    aspd[a] = sp / 3 > 1 ? 1 : sp / 3;   // velocidad normalizada → amplitud de ondulación del render
    // oficio REALIZADO desde la dieta (herbívoro/carnívoro/omnívoro) para color/gráfica + PERCEPCIÓN para los ojos
    const dv = s.vegIn[i], dp = s.preyIn[i], ds = s.scavIn[i], dt = dv + dp + ds;
    arole[a] = roleFromDiet(dv, dp, ds);
    aGazeX[a] = s.senseX[i]; aGazeY[a] = s.senseY[i]; aAlert[a] = s.senseMag[i];   // estímulo saliente (dir mundo) + intensidad → ojos que miran/se avivan
    if (arole[a] === 0) { nHerb++; massSumH += s.mass[i]; } else { nCarn++; massSumC += s.mass[i]; }   // masa por oficio → talla media en el tiempo
    partOff[a] = po; const body = s.body[i];
    { const tv = tArr ? tArr[i] : (histTrait === 'nParts' ? body.length : s.genome[i].hue);   // bin del rasgo (caso especial: nParts/hue)
      let hb = ((tv - tlo) / tspan * HBINS) | 0; if (hb < 0) hb = 0; else if (hb >= HBINS) hb = HBINS - 1;
      if (arole[a] === 0) gh[hb]++; else gc[hb]++; }
    let rad = 0;
    for (let k = 0; k < body.length; k++) { const p = body[k]; const o = po * 7; partData[o] = p.x; partData[o + 1] = p.y; partData[o + 2] = p.r; partData[o + 3] = p.tissue; partData[o + 4] = p.phase; partData[o + 5] = p.aspect; partData[o + 6] = p.dir; po++;
      const d = Math.hypot(p.x, p.y) + p.r; if (d > rad) rad = d; }
    // detalle EN VIVO del agente inspeccionado (si sigue vivo): stats fisiológicos + morfológicos para el inspector
    if (s.serial[i] === selectedId) { const reproEi = SIM_P.reproE * s.reproK[i]; detail = { id: selectedId, role: arole[a], E: s.E[i], reproE: reproEi, gut: s.gut[i],
      mass: s.mass[i], mouthCap: s.mouthCap[i], maxMouthR: s.maxMouthR[i], vmax: s.vmax[i], age: s.age[i], nParts: body.length, hue: s.genome[i].hue, x: s.x[i], y: s.y[i], rad,
      investE: s.investFrac[i] * reproEi, reproK: s.reproK[i],   // r/K: umbral e inversión PROPIOS (genes de historia de vida; near-neutral en la pecera cerrada)
      dietV: s.vegIn[i], dietP: s.preyIn[i], dietS: s.scavIn[i] }; }   // dieta acumulada en vida (pasto/caza/carroña) → oficio EMERGENTE real en el inspector
  }
  partOff[n] = po;
  if (s.tick - lastHist >= HIST_EVERY) { lastHist = s.tick; histPop.push(n); histHerb.push(nHerb); histCarn.push(nCarn);
    // ritmos por ventana: delta de los contadores acumulados desde el último muestreo
    histSexB.push(s.sexBirths - lastSexB); histAsexB.push(s.asexBirths - lastAsexB); histPred.push(s.kills - lastKills); histStarv.push(s.starved - lastStarved);
    lastSexB = s.sexBirths; lastAsexB = s.asexBirths; lastKills = s.kills; lastStarved = s.starved;
    histMassH.push(nHerb ? massSumH / nHerb : 0); histMassC.push(nCarn ? massSumC / nCarn : 0);   // talla media por oficio (#12)
    if (histPop.length > HIST_W) { histPop.shift(); histHerb.shift(); histCarn.shift(); histSexB.shift(); histAsexB.shift(); histPred.shift(); histStarv.shift(); histMassH.shift(); histMassC.shift(); } }
  // CADÁVERES (#3): los recientes (edad < CORPSE_LIFE) con su forma → el render los desvanece con su carroña. Acotado por
  // el ring del motor; aplanado como los organismos (offset + [lx,ly,r,aspect,dir] por parte, stride 5). dcfade = edad/vida.
  const cidx = []; let ctp = 0;
  for (let k = 0; k < s.CORPSE_CAP; k++) { const nn = s.ccn[k]; if (nn <= 0) continue; const age = s.tick - s.cct0[k]; if (age < 0 || age >= CORPSE_LIFE) continue; cidx.push(k); ctp += nn; }
  const dcm = cidx.length;
  const dcx = new Float32Array(dcm), dcy = new Float32Array(dcm), dch = new Float32Array(dcm), dchue = new Float32Array(dcm), dcfade = new Float32Array(dcm), dcOff = new Int32Array(dcm + 1), dcData = new Float32Array(ctp * 5);
  let cpo = 0;
  for (let a = 0; a < dcm; a++) { const k = cidx[a]; dcx[a] = s.ccx[k]; dcy[a] = s.ccy[k]; dch[a] = s.cch[k]; dchue[a] = s.cchue[k]; dcfade[a] = (s.tick - s.cct0[k]) / CORPSE_LIFE;
    dcOff[a] = cpo; const nn = s.ccn[k]; let o = k * s.CORPSE_MAXP * 5;
    for (let j = 0; j < nn; j++) { const d = cpo * 5; dcData[d] = s.ccData[o]; dcData[d + 1] = s.ccData[o + 1]; dcData[d + 2] = s.ccData[o + 2]; dcData[d + 3] = s.ccData[o + 3]; dcData[d + 4] = s.ccData[o + 4]; o += 5; cpo++; } }
  dcOff[dcm] = cpo;
  // VEGETACIÓN: el campo veg actual → el render lo pinta como fondo verde (la base de comida). Cambia cada tick (pastoreo/
  // crecimiento) y FLUYE si lightFlow>0 (su K sigue a la luz). Transferible (cero copia).
  const veg = world.veg.slice();
  // detail = null si no hay selección O si el agente seleccionado ya murió (el cliente lo detecta: selectedId set pero detail null)
  postMessage({ type: 'frame', tick: s.tick, pop: n, n, ax, ay, ah, aspd, ahue, aE, aGazeX, aGazeY, aAlert, arole, aid, partOff, partData,
      dcm, dcx, dcy, dch, dchue, dcfade, dcOff, dcData, veg, histPop, histHerb, histCarn, histSexB, histAsexB, histPred, histStarv, histMassH, histMassC,
      geneTrait: histTrait, geneLo: trng[0], geneHi: trng[1], geneH: gh, geneC: gc, sel: selectedId, detail },
    [ax.buffer, ay.buffer, ah.buffer, aspd.buffer, ahue.buffer, aE.buffer, aGazeX.buffer, aGazeY.buffer, aAlert.buffer, arole.buffer, aid.buffer, partOff.buffer, partData.buffer,
     dcx.buffer, dcy.buffer, dch.buffer, dchue.buffer, dcfade.buffer, dcOff.buffer, dcData.buffer, veg.buffer, gh.buffer, gc.buffer]);
}

// Ritmo de simulación por ACUMULADOR temporal: cada loop ejecuta `tps × tiempo transcurrido` pasos (con la fracción
// arrastrada) → el t/s real sigue al slider con fidelidad. Antes se hacía `round(tps/30)` pasos/loop, que (a) cuantizaba
// a múltiplos de 30 → se pasaba (50→60) y (b) con `max(1,…)` nunca bajaba de ~30 → tps=0 NO paraba. Ahora tps=0 = parado.
let acc = 0, lastLoopT = performance.now();
const MAX_SNAP_MS = RENDER_P.maxSnapMs;   // en MÁX: un fotograma cada ~N ms (≈4 fps). Se SACRIFICAN fps para dar casi todo
                           // el tiempo a la simulación; el lote (≤N ms) garantiza ≥1 fps (el mínimo pedido) aun con la pop al tope.
function loop() {
  const now = performance.now();
  if (running && maxSpeed) {
    // MÁX: simula EN LOTE hasta que toque el próximo fotograma → t/s máximo y el render no roba tiempo (un solo snapshot
    // por lote, no uno por iteración). fps sacrificado a ~4, con suelo ≥1 fps; re-lanza ya (el lote marca el ritmo).
    const stepUntil = now + MAX_SNAP_MS;
    do { sim.step(); } while (performance.now() < stepUntil);
    acc = 0; lastLoopT = now;
    snapshot();
    setTimeout(loop, 0);
    return;
  }
  if (running && tps > 0) {
    acc += tps * (now - lastLoopT) / 1000;                            // ticks adeudados desde el último loop
    const budgetEnd = now + 28;                                       // tope de cómputo por frame (deja ~5 ms para snapshot)
    while (acc >= 1) { if (performance.now() >= budgetEnd) { acc = 0; break; } sim.step(); acc -= 1; }   // si no se alcanza el ritmo → se descartan (sin spiral de deuda)
  } else {
    acc = 0;                                                          // PAUSADO o tps=0: el mundo NO avanza
  }
  lastLoopT = now;
  snapshot();
  setTimeout(loop, 33);
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'reset') init(m);   // reset con seed + parámetros de arranque (worldSize, seedCount) opcionales
  else if (m.type === 'running') running = m.value;
  else if (m.type === 'tps') tps = m.value;
  else if (m.type === 'maxSpeed') maxSpeed = m.value;
  // LABORATORIO (en vivo): ajusta una ley del mundo o del metabolismo sin reiniciar. lightMul vive en el mundo; mutRate
  // en GENOME_P; el resto son campos de SIM_P (step()/mutate() los leen por referencia → el cambio surte efecto al instante).
  else if (m.type === 'set') { if (m.key === 'lightMul') world.lightMul = m.value; else if (m.key === 'mutRate') GENOME_P.mutRate = m.value; else if (m.key in SIM_P) SIM_P[m.key] = m.value; else if (m.key in world.P) world.P[m.key] = m.value; }   // world.P: lightFlow, vegGrowth, patchiness… (vegStep los lee por ref)
  else if (m.type === 'histTrait') { if (m.key in HIST_TRAITS) histTrait = m.key; }   // histograma: rasgo a mostrar (la UI lo elige)
  else if (m.type === 'inspect') selectedId = m.id;     // inspector: fijar agente a seguir en vivo
  else if (m.type === 'deselect') selectedId = -1;
  else if (m.type === 'burst') { for (let k = 0; k < (m.n || 0); k++) sim.step(); snapshot(); }   // avance forzado (depuración/preview)
};

init();
loop();
