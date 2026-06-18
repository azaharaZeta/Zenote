// Config del ANDAMIO (M0). Solo plataforma — NADA de biología todavía (eso entra en M4+).
// Mantiene el patrón "fuente única de parámetros" de la app actual. Unidades de mundo (u).

export const config = {
  world: {
    size: 1000,        // lado del toro (u). Los bordes envuelven.
  },
  pop: {
    seed: 12345,       // semilla del RNG (determinismo).
    cap: 5000,         // tope del pool (nº máx. de agentes). Estructural.
  },
  // Spatial hash: tamaño de celda = radio de escaneo de vecindad. En el andamio es un valor fijo;
  // cuando entre la biología (visión, M4+) pasará a derivarse del alcance sensorial máximo.
  hash: {
    cell: 40,          // lado de celda del hash (u).
  },
  scan: {
    radius: 30,        // radio de consulta de vecindad por agente (u) — ejercita el hash (la operación que dominará el coste real).
  },
};
