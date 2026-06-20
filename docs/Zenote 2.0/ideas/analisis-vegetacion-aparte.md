# Análisis de viabilidad — vegetación aparte, organismos = solo animales

> **ESTADO: Escenario 1 IMPLEMENTADO (2026-06-20).** Vegetación parametrizada + todos los organismos animales. Conserva
> (gate 8/8, dorado 0xe6e247bd), emerge estructura trófica (herbívoros/carnívoros por dieta) y se resuelve el inmovilismo de
> raíz (94% móvil). Ver memoria [[zenote2-animals-only-vegetation]]. El Escenario 2 (vegetación genética) queda como Fase 2
> opcional. Pendiente: actualizar SPEC/CLAUDE.md (aún describen el eje autótrofo↔heterótrofo emergente, ya superado).


**Petición (2026-06-20):** que NO haya organismos autótrofos entre los que evolucionan; todos los organismos del abismo
serían ANIMALES (heterótrofos). La vegetación (la base productora) se lleva aparte. Estudiar dos escenarios:
1. Vegetación **parametrizada** (sin genética), conservando las leyes biológicas generales.
2. Vegetación con **genética completamente aparte** de los animales.

---

## 0. Por qué esto tiene mucho sentido (contexto)
Hoy la frontera autótrofo↔heterótrofo EMERGE del genoma (tejido PHOTO capta luz · MOUTH+MUSCLE caza; `phenotype.js`). Pero
en la práctica **degeneró**: la fotosíntesis es una vía de escape universal (todos llevan algo de PHOTO) y `photoMotionK`
premia la quietud → casi todo acaba sésil; hasta los "heterótrofos" viven ~98% de luz (ver el fix de inmovilismo y
[[zenote2-immobility-photohalf-fix]], [[zenote2-population-boom-bust]]). **Quitar la fotosíntesis del genoma animal elimina
esa red de escape de raíz** → los animales tendrían que comer (vegetación o entre sí) → forrajeo/caza/movimiento OBLIGADOS.
Es, de hecho, la solución estructural al inmovilismo que veníamos persiguiendo.

## 1. La tensión con la regla #1 (Emergencia) — honesto
La regla innegociable #1 dice que el eje trófico debe EMERGER, no codificarse. Fijar "todos los que evolucionan son animales"
**renuncia al eje autótrofo↔heterótrofo emergente** (un titular del diseño original, SPEC §M5.2). Argumentos a favor de hacerlo
igualmente:
- La emergencia de ese eje **fracasó** (colapsó a mixotrofía-sésil universal); no estamos perdiendo algo que funcione.
- La biología real TIENE reinos separados (una planta no evoluciona a animal dentro de un linaje). Separar reino productor de
  reino consumidor es **fiel**, no un atajo.
- Lo que de verdad protege la regla #1 — que la CONDUCTA y la MORFOLOGÍA emerjan de genes+selección — **se conserva intacto**
  en los animales (pastar/cazar/huir/forrajear y la forma siguen emergiendo). Solo se acota el ALCANCE trófico.
- Las leyes generales (herencia, mutación, selección, conservación materia/energía, flujo energético, muerte) se mantienen.

**Veredicto:** es un cambio de ALCANCE legítimo y probablemente más sano que el statu quo, pero **es una decisión de diseño que
abandona un titular original** — hay que asumirla a conciencia. No viola la emergencia de conducta; sí cambia "qué evoluciona".

## 2. Cirugía COMÚN a ambos escenarios (lado animal + mundo)
Independientemente del escenario, hay que:
- **Quitar PHOTO del genoma animal**: tejido ∈ {STRUCTURE, MUSCLE, MOUTH} (hoy incluye PHOTO=1). `genome.js`: `makeFounder`
  deja de sembrar plántula PHOTO y siembra un **grazer simple** (boca+algo de músculo). `tissueOf`/mutación ya no producen PHOTO.
- **Quitar la transacción de fotosíntesis** de `sim.js` (el bloque `if (photoCap>0) …`). `phenotype.js`: fuera `photoCap`.
- **Reconvertir el ingreso de energía animal a SOLO ingesta** (pastar vegetación + depredar/carroñear). El `mouth` ya come
  presa/carroña; se añade "comer vegetación".
- **Sensor del cerebro**: ∇luz deja de ser útil al animal → se sustituye por **∇vegetación** (olor a comida). (Como ya hice con
  ∇detrito; cambia `BRAIN.I`.) Mantener ∇amenaza, hambre, velocidad, ∇detrito.
- **Re-cablear el LIBRO MAYOR (sagrado):** hoy MATERIA = nutriente+detritusM+masa; ENERGÍA entra por fotosíntesis. Ahora la
  ENERGÍA entra por la **vegetación** (que capta la luz) y de ahí pasa a los animales al pastar. Matriz nueva:
  - MATERIA = nutriente + vegM + detritusM + Σmasa_animal = CONSTANTE.
  - ENERGÍA: entra = luz captada por la vegetación · almacenada = vegE + Σ(E+gut)_animal + detritusE · sale = calor.
  - Pastar: vegE → tripa del animal (energía, conserva) · vegM → detrito o nutriente (materia, conserva). Muerte vegetal →
    detrito (materia) + calor (energía residual). **Todo debe cuadrar** → re-escribir los tests de invariantes (m4/m5/m6).
- **Tests + dorado:** re-fijar el dorado (cambio mayor) y reescribir los invariantes para incluir vegM/vegE. m7 (especiación)
  pasa a medir el eje **pastador↔depredador** (sigue siendo un eje trófico, ahora entre animales).
- **Render:** dibujar la vegetación (campo, como la nebulosa de luz, o agentes-planta). El render animal no cambia.

Lo reutilizable es MUCHO: mundo cerrado, hash espacial, genoma-de-reglas/develop/cerebro/fenotipo (animal, sin PHOTO),
conservación, bucle del worker, render de organismos. **No es reescritura — es cirugía + capa de vegetación.**

## 3. Escenario 1 — vegetación PARAMETRIZADA (sin genética)
**Diseño:** un campo `veg` por celda (como nutriente/detrito) = biomasa vegetal con energía embebida. Reglas FIJAS (no evolucionan):
- **Crecimiento logístico** hacia una capacidad de carga ∝ luz local, consumiendo nutriente (materia) y captando luz (energía):
  `dVeg = growth·veg·(1 − veg/K(luz))` limitado por nutriente disponible. (Semilla/dispersión para recolonizar celdas vacías.)
- **Pastoreo:** la boca del animal sobre una celda con veg ingiere veg → energía a la tripa + materia re-enrutada (conserva).
- **Muerte/senescencia vegetal:** veg → detrito (materia) + calor (energía), como los organismos.

**Pros:**
- **Resuelve el inmovilismo de raíz** (sin foto, los animales DEBEN forrajear) y da una base trófica LEGIBLE: vegetación →
  pastadores → depredadores. Todos animales, todos se mueven.
- **Precedente fuerte:** es esencialmente el modelo de recurso/pasto de la 1ª app (zenote1), con todo su aprendizaje ya en
  memoria ([[vegetacion-conceptos-y-vocabulario]], [[herbivore-overgrazing]], [[sobrepastoreo]], grazeRefuge, forrajeo por área).
- **Más control de la POBLACIÓN:** una vegetación logística (recurso que se agota y regenera) es una base que se autolimita →
  potencialmente más estable que el campo de luz infinito de hoy (aunque pastador-vegetación puede oscilar — Rosenzweig-MacArthur;
  ver [[zenote2-population-boom-bust]]).
- **Esfuerzo MEDIO**, riesgo MEDIO. Una capa nueva acotada + cirugía animal + re-balance (con plantilla de zenote1).

**Contras:**
- La vegetación NO evoluciona (menos "todo evoluciona"). Pero los autótrofos actuales tampoco hacían evolución interesante
  (solo se sentaban) → la pérdida real es pequeña.
- Re-balance del economía energética entero (cuánta luz→veg, eficiencia de pastoreo, etc.) — bastante tuning.
- Riesgo clásico de **sobrepastoreo** (los pastadores barren la veg → colapso); mitigable (refugio de pasto, crecimiento, etc.,
  ya estudiado en zenote1).

## 4. Escenario 2 — vegetación con GENÉTICA aparte
**Diseño:** DOS sistemas genéticos separados (pools que no se cruzan):
- **Genoma PLANTA** (nuevo): morfología que capta luz ∝ forma (hojas/superficie), crecimiento, reproducción (semillas/clonal),
  **sésil, SIN cerebro**. Evoluciona forma de captación, defensas, estrategia de dispersión.
- **Genoma ANIMAL** (el de hoy, sin PHOTO): como en el Escenario 1.
- Interacción: los animales pastan plantas; las plantas evolucionan crecer/defenderse → **coevolución (carrera armamentística)**.

**Pros:**
- **Máxima emergencia y fidelidad:** ambos reinos evolucionan; coevolución productor-consumidor (defensas vegetales ↔ pastoreo)
  = la dinámica más "viva" posible. Respeta mejor la regla #1.
- Plantas con forma evolutiva = más belleza/variedad visual (encaja con el objetivo contemplativo).

**Contras:**
- **Esfuerzo GRANDE** (~2-3× el Escenario 1): un pipeline genético entero nuevo (develop/fenotipo/mutación/recombinación/
  reproducción de plantas), un 2º bucle evolutivo, y **balancear DOS sistemas coevolucionando** (mucho más difícil de afinar y
  medir; doble bimodalidad). Riesgo ALTO.
- Valor incierto: ¿evolucionarían las plantas algo interesante, o convergerían a "captar luz y crecer" (como los autótrofos de
  hoy, que solo se sientan)? La coevolución de defensas es atractiva pero especulativa a escala pecera.
- Más superficie de conservación y tests (dos reinos en el libro mayor).

## 5. Transversal (aplica a ambos)
- **Conservación:** ambos escenarios la mantienen si la vegetación entra en el libro mayor (vegM/vegE) y cada transacción
  re-enruta materia y contabiliza energía. Es el punto MÁS delicado → reescribir m4/m5/m6 con cuidado antes que nada.
- **Boom-bust:** una base vegetal logística da más palancas de estabilidad que el campo de luz actual, pero introduce dinámica
  pastador-recurso (puede oscilar). No es garantía de estabilidad, pero sí más control.
- **Render:** vegetación como campo teñido (reusar la maquinaria de la nebulosa de luz) en el Esc.1; como agentes-planta en el Esc.2.
- **Cabos:** el sensor ∇luz→∇veg, el carroñeo (#4) encaja natural (la carroña sigue siendo de animales muertos), los cadáveres (#3) siguen.

## 6. Recomendación
**Empezar por el Escenario 1** (vegetación parametrizada):
- Logra el objetivo central (abismo de solo-animales, inmovilismo resuelto de raíz) con esfuerzo/riesgo manejables y plantilla
  de zenote1.
- **Diseñar la capa de vegetación desacoplada** (interfaz "productor": crece, almacena energía, se pasta, muere) de modo que el
  Escenario 2 sea una EVOLUCIÓN posterior: sustituir el campo paramétrico por plantas genéticas sin tocar el lado animal.
- El Escenario 2 queda como **Fase 2 opcional** si, una vez con animales reales, se quiere coevolución vegetal.

**Plan por fases (Esc.1):** (a) reescribir el libro mayor + invariantes con vegM/vegE [primero, lo sagrado]; (b) cirugía animal
(quitar PHOTO, sembrar grazers, ∇luz→∇veg); (c) capa de vegetación logística + pastoreo; (d) re-balance medido (sobrepastoreo,
trío vegetación-pastador-depredador) con spikes multi-seed a 25-40k; (e) render de vegetación; (f) re-fijar dorado, gate.

**Riesgo principal a vigilar:** el re-balance trófico (sobrepastoreo / extinción de pastadores / colapso) — pero es justo el
terreno donde más aprendizaje acumulado hay (memorias de zenote1).
