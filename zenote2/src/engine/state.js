// Estado del organismo en Structure-of-Arrays (SoA) + pool (free stack). ANDAMIO M0: solo CINEMÁTICA
// e IDENTIDAD (posición, velocidad, vivo, serial). NADA de biología (energía, genoma, fenotipo) — eso se
// añade sobre esta base en M4+. Cero asignaciones en el bucle caliente; el pool recicla slots sin GC.

export class State {
  constructor(cap) {
    this.cap = cap;
    // --- Cinemática (typed arrays, indexados por slot) ---
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.alive = new Uint8Array(cap);

    // --- Identidad estable (≠ slot): clave para cachés del render y seguimiento; serial único por organismo ---
    this.serial = new Int32Array(cap);
    this._serial = 0;

    // --- Pool (free stack) + lista activa (reconstruida cada tick, O(n)) ---
    this.free = new Int32Array(cap);
    for (let i = 0; i < cap; i++) this.free[i] = cap - 1 - i; // pila: pop da 0,1,2…
    this.freeTop = cap;
    this.active = new Int32Array(cap);
    this.activeCount = 0;
    this.popCount = 0;
  }

  // Reserva un slot del pool. Devuelve índice o -1 si está lleno.
  alloc() {
    if (this.freeTop === 0) return -1;
    const i = this.free[--this.freeTop];
    this.alive[i] = 1;
    this.serial[i] = ++this._serial; // organismo nuevo → serial nuevo (invalida cachés del slot anterior)
    this.popCount++;
    return i;
  }

  // Libera un slot al pool.
  kill(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.free[this.freeTop++] = i;
    this.popCount--;
  }

  // Reconstruye la lista activa (compacta los vivos). O(n), sin asignaciones.
  rebuildActive() {
    let c = 0;
    const alive = this.alive, active = this.active, cap = this.cap;
    for (let i = 0; i < cap; i++) if (alive[i]) active[c++] = i;
    this.activeCount = c;
  }
}
