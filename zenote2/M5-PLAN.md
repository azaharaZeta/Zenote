# M5 — Cuerpo, desarrollo, forma=función y render · plan por pasos verificables

Poner el **organismo generativo real** (2.2) sobre las leyes de M4, con **forma=función**, reemplazando los
agentes-sonda, y estrenar el **render**. Headless-first; cada paso se verifica antes del siguiente.

**Fuera de M5:** M6 (cerebro/conducta, fisiología fina, plasticidad) · M7 (recombinación sexual + especiación). En
M5 la conducta es un **placeholder genérico** ("muévete hacia el gradiente de lo que tu cuerpo puede comer"), que M6
reemplaza por el controlador evolucionado.

| Paso | Qué | Verificación | Tipo |
|---|---|---|---|
| **M5.1** | Genoma de reglas + `develop()` + operadores de mutación (2.2 §7) | `test/m5-develop.mjs`: 0 cuerpos inválidos en ≥100k desarrollos + diversidad estructural | KEEPER |
| **M5.2** | Forma=función: cuerpo → capacidades (luz, locomoción, masa, ingesta) | `test/m5-formfunction.mjs`: asserts en genomas hechos a mano (hoja→fotosíntesis, cola→empuje…); eje autótrofo↔heterótrofo expresable | KEEPER |
| **M5.3** | Sim integrado: organismo real sobre M4 + repro asexual con mutación | `test/m5-invariants.mjs`: los 4 invariantes de 2.1 §8 SIGUEN pasando + perf a escala | KEEPER |
| **M5.4** | Emerge la evolución morfológica | `test/m5-evolution.mjs`: multi-seed, divergencia/adaptación morfológica medible sin sembrar | verificación |
| **M5.5** | Render (Canvas 2D): mundo + organismos desde el grafo de partes | preview/screenshot; checkpoint R6 (¿vivo/contemplativo?) | KEEPER |
| **M5.6** | Motor en Web Worker (desacople render/motor) | corre fluido en navegador, sin errores | KEEPER (aplazable) |

Dependencias: 5.1→5.2→5.3→{5.4 (medir) · 5.5 render→5.6 worker}.

Riesgos/checks: forma→función sin sentido (M5.2 asserts) · el organismo real rompe la conservación (M5.3 invariantes,
el check más importante) · la morfología no evoluciona (M5.4; fallback: necesita M6, no bloquea) · no se ve bello
(M5.5 screenshot + decisión de control estético).
