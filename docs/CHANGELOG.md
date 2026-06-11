# Changelog

Una línea por cambio, lo más reciente arriba. (Foto del presente → `ESTADO.md` · parámetros → `src/config.js` · ideas → `ideas/`.)

- 2026-06-11: forrajeo por talla (`resource.forageReach`, def. 3) + `omniPenalty` 0.05→0.15 — el grande pasta de un área → payoff a la talla → DOS grupos de talla (peque+grande) robustos. Fine-tuning headless (5 semillas, head-to-head). (UI)
- 2026-06-11: (A) coste de transporte ∝ masa (`energy.k_haul`) — nadar un cuerpo grande/con más apéndices gasta más, no solo mantenerlo. (UI)
- 2026-06-11: `combat.preyBandLo` (suelo de banda de caza) expuesto en la UI — talla mín. y máx. de presa cazable ya se controlan por separado.
- 2026-06-11: `headThrust` 0.15→0.06 — nadar exige propulsores (los nodos frontales frenan, no propulsan).
- 2026-06-11: docs reestructuradas — retirado `CONFIG.md` (config.js fuente única); ideas → `ideas/` (índice+fichas+archivo); CHANGELOG; AUDIT a `archivo/`.
- 2026-06-11: morfología Capas 1-3 — `tipShape` (forma), `morphReach`/`k_grazeWide` (función), `gaitMode`+`flapCost` (movimiento); genoma 169→185.
- 2026-06-11: 3ª calidad "Máxima" (doble bloom, supersampling, +nieve); botón Reiniciar a la cabecera (ámbar).
- 2026-06-11: `diet.omniPenalty` 0→0.05 (dial de especialización).
- 2026-06-10: eliminado el escenario pradera → Cenote abisal único; quitadas las estelas.
- 2026-06-10: modo simple simplificado; gráfica de población por dieta.
- 2026-06-10: SPEC/VISUAL reescritos al modelo de nodos (deuda v2.0 saldada).
- 2026-06-09: auditoría evolutiva CERRADA (14/14) → `archivo/AUDIT_EVOLUCION.md`.
