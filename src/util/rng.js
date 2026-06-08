// RNG reproducible (mulberry32) + gaussiano (Box-Muller).
// Si seed es null → usa Math.random (no reproducible).

export function makeRng(seed) {
  if (seed === null || seed === undefined) {
    return { next: Math.random, gaussian: gaussianFrom(Math.random) };
  }
  let a = seed >>> 0;
  const next = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, gaussian: gaussianFrom(next) };
}

// N(0,1) por Box-Muller, con caché del segundo valor.
function gaussianFrom(rand) {
  let spare = null;
  return function gaussian() {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0, s = 0;
    do {
      u = rand() * 2 - 1;
      v = rand() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * mul;
    return u * mul;
  };
}
