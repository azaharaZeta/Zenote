# Changelog

Una línea por cambio, lo más reciente arriba. (Foto del presente → `ESTADO.md` · parámetros → `src/config.js` · ideas → `ideas/`.)

- 2026-06-11: lab — retirada la monitorización de carnívoros (índice de cazabilidad + autopsia); demografía de TODO el ecosistema en DOS gráficas: nacimientos (sexual/asexual) y muertes (cazado/atacando/hambre/vejez). La gráfica de tipos añade la población TOTAL en azul (el del readout 'pob').
- 2026-06-11: retirado el match color↔luz (`color.matchPenalty` + campo `lightHue`) — era selección INVISIBLE (el campo de luz nunca se dibujó); el color (`hue`) pasa a gen neutro/linaje. Fuera del bucle de pasto, config y UI.
- 2026-06-11: la velocidad por fin importa — `combat.fleeSpeed=2` (escape por velocidad relativa) + `refuge.strength` 0.9→0.3 → huir/cazar es un duelo de velocidad → la vmax sube por morfología propulsora. (UI). Antes era ~neutra (forrajear no es carrera; medido: ni comida ni cobertura la movían).
- 2026-06-11: `repro.asexual` se mantiene ON — comprobado headless que SOLO-sexual aplana la diversidad de talla (la mezcla regresa los extremos a la media); el payoff de talla luce con asexual.
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
