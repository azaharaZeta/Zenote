// Spatial hash uniforme (rejilla + lista enlazada), TOROIDAL. Vecindad en O(n) — nada de O(n²) (regla §2 de perf).
// Reconstruido cada tick. Reutiliza el patrón probado de la app actual (world.js). Sin asignaciones en caliente.

export class SpatialHash {
  constructor(worldSize, cell) {
    this.worldSize = worldSize;
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(worldSize / cell));
    this.rows = this.cols;                              // mundo cuadrado
    this.head = new Int32Array(this.cols * this.rows).fill(-1);
    this.next = null;                                   // dimensionado al pool (setCapacity)
  }

  setCapacity(cap) { this.next = new Int32Array(cap); }

  clear() { this.head.fill(-1); }

  insert(i, x, y) {
    let cx = (x / this.cell) | 0, cy = (y / this.cell) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    const c = cy * this.cols + cx;
    this.next[i] = this.head[c];
    this.head[c] = i;
  }
}
