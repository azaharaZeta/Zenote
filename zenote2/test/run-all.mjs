// M5 — RUNNER + GATE de los tests de corrección de Zenote 2. La auditoría técnica (M5) marcó que `npm test` apuntaba a
// la app VIEJA y que los tests de zenote2 se corrían a mano → un test obsoleto (M1) pasaba inadvertido. Este runner
// ejecuta cada test de CORRECCIÓN como subproceso y FALLA (exit 1) si alguno: (a) sale con código ≠ 0, o (b) imprime un
// marcador de fallo (`FALLO` / `✗`). Pensado como gate de pre-commit/CI.  uso: node zenote2/test/run-all.mjs
//   Sólo agrega los tests de INVARIANTES/correctitud (deterministas, rápidos). Los de MEDICIÓN/exploración
//   (baseline, m5-evolution, m6_3-behavior, m6_5-scorecard) imprimen números y ✗ no-críticos → NO gatean; córrelos a mano.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const GATE = [
  'm4-invariants.mjs',    // leyes del mundo (2.1 §8) con sondas
  'm5-develop.mjs',       // validez del desarrollo (sin NaN, partes ∈ [1,budget])
  'm5-formfunction.mjs',  // forma = función (ya usa exit code)
  'm5-invariants.mjs',    // M5.3: invariantes con el organismo real
  'm5-saturation.mjs',    // A1: conservación bajo saturación del pool
  'm6-invariants.mjs',    // M6.1: energía-en-biomasa + heterotrofía viable
  'm7-speciation.mjs',    // M7: recombinación válida + sexual + invariantes (D14)
  'm8-determinism.mjs',   // checksum dorado: determinismo + detección de deriva
];

const FAIL_RE = /FALLO|✗/;
let failed = 0;
console.log(`=== Zenote 2 — gate de correctitud (${GATE.length} tests) ===\n`);
for (const f of GATE) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(here, f)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = r.status === 0 && !FAIL_RE.test(out);
  const ms = Date.now() - t0;
  console.log(`  ${ok ? 'PASS ✓' : 'FAIL ✗'}  ${f.padEnd(22)} (${(ms / 1000).toFixed(1)}s, exit ${r.status})`);
  if (!ok) { failed++; console.log(out.split('\n').filter(l => FAIL_RE.test(l)).map(l => `         ↳ ${l.trim()}`).join('\n')); }
}
console.log(`\n${failed === 0 ? '✅ TODO VERDE' : `❌ ${failed}/${GATE.length} con FALLOS`}`);
process.exit(failed === 0 ? 0 : 1);
