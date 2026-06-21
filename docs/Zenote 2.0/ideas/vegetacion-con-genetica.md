# Vegetación con genética propia (Escenario 2)

**Estado: ANOTADA (no implementada).** Fase 2 posible sobre el modelo actual. Contexto completo en
[analisis-vegetacion-aparte.md](archivo/analisis-vegetacion-aparte.md) (§4). Hoy la vegetación es parametrizada (Escenario 1, implementado).

## Idea
Dar a la **vegetación su propio sistema genético**, separado del de los animales (dos pools que no se cruzan) → **coevolución
productor-consumidor**. Hoy la vegetación es física fija (crece logística ∝ luz, se pasta, senesce); con genética EVOLUCIONARÍA:
- **Genoma PLANTA** (nuevo, aparte del animal): morfología que capta luz ∝ forma (hojas/superficie), crecimiento, reproducción
  (semillas/clonal), **sésil, SIN cerebro**. Podría evolucionar forma de captación, **defensas** (contra el pastoreo), estrategia
  de dispersión.
- Interacción: los animales pastan plantas; las plantas evolucionan crecer/defenderse → **carrera armamentística** (defensas ↔ pastoreo).

## Por qué se dejó para después (no se hizo en el refactor de junio 2026)
- **Esfuerzo grande (~2-3× el Escenario 1)** y **riesgo alto**: un pipeline genético entero nuevo (develop/fenotipo/mutación/
  recombinación/reproducción de plantas) + un 2º bucle evolutivo + **balancear DOS sistemas coevolucionando** (doble
  bimodalidad, mucho más difícil de afinar/medir). Más superficie de conservación y tests (dos reinos en el libro mayor).
- **Valor incierto:** ¿evolucionarían las plantas algo interesante (defensas, formas) o convergerían a "captar luz y crecer"
  (como los autótrofos del modelo viejo, que solo se sentaban)? La coevolución de defensas es atractiva pero especulativa a
  escala pecera.

## Cómo encajaría (migración limpia)
La capa de vegetación del Escenario 1 está **desacoplada** (interfaz "productor": crece / almacena energía / se pasta / muere
/ entra en el libro mayor). El Escenario 2 = **sustituir el campo paramétrico (`world.veg`/`vegStep`) por plantas genéticas
sésiles** sin tocar el lado animal (que ya las come). El libro mayor (materia: nutriente+plantas+detrito+animales · energía:
luz→planta→animal→calor) se mantiene; cambia QUIÉN es el productor (campo → agentes-planta evolutivos).

## Pros / contras resumidos
- **Pros:** máxima emergencia y fidelidad (ambos reinos evolucionan); plantas con forma evolutiva = más belleza/variedad visual
  (encaja con el objetivo contemplativo).
- **Contras:** coste/riesgo alto, valor incierto, doble balance.

## Decisión
Implementado el Escenario 1 (vegetación parametrizada). Este (Escenario 2) queda **anotado** como evolución opcional si, con
animales reales ya funcionando, se quiere coevolución vegetal.
