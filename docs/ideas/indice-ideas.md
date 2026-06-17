# Índice de ideas

Backlog de ideas **abiertas**. Una línea por idea (pitch breve); el análisis/decisiones de cada una vive en su **ficha**
`docs/ideas/<slug>.md` (enlazada). **Aquí NO van estados, ni análisis, ni histórico.**

- Idea **implementada** → se retira de aquí y queda como una línea en [`../CHANGELOG.md`](../CHANGELOG.md) (la mecánica vive en `../SPEC_EVOLUCION.md` + memoria del proyecto).
- Idea **descartada** (con lección) → memoria del proyecto. Fichas congeladas de ideas hechas/descartadas → [`archivo/`](archivo/).

Otros docs: mecánica → [`../SPEC_EVOLUCION.md`](../SPEC_EVOLUCION.md) · parámetros → [`../../src/config.js`](../../src/config.js) · render → [`../VISUAL.md`](../VISUAL.md) · estado → [`../ESTADO.md`](../ESTADO.md).

## Ideas abiertas

### Locomoción / modelo de fuerza
- **Giro físico** — que girar use los segmentos (par + inercia). → [giro-fisico.md](giro-fisico.md)
- **Afinar balance del modelo de fuerza** — recuperar carroñeros finos tras bajar `carcassValue`. → [afinar-balance-modelo-fuerza.md](afinar-balance-modelo-fuerza.md)
- **Repurposar el gen `speed` → capacidad muscular** — hoy quedó inactivo. → [gen-speed-musculo.md](gen-speed-musculo.md)

### Ecología / balance
- **Diversidad de talla bajo reproducción sexual** — la sexual aplana la talla. → [diversidad-talla-sexual.md](diversidad-talla-sexual.md)
- **Señuelo: coste por `o_num` + visibilidad** — flecos del rediseño del señuelo. → [senuelo-coste-onum-visibilidad.md](senuelo-coste-onum-visibilidad.md)

### Render (no tocan la simulación)
- **Por qué la resolución no cambia los FPS** — investigación. → [resolucion-no-mueve-fps.md](resolucion-no-mueve-fps.md)
- **Vegetación: organismos tras el dosel (Fase 2)** — velo translúcido sobre los agentes. → [vegetacion-dosel-fase2.md](vegetacion-dosel-fase2.md)
- **Vegetación poco visible / sin valor** — realzar el contraste del teal sin romper la penumbra.
- **Cadáveres con FORMA** — marcadores efímeros del cuerpo muerto. → [cadaveres-con-forma.md](cadaveres-con-forma.md)
- **Apiñamiento de hermanos** — reparto angular sutil entre nodos con igual `parent`/`emit`.
- **LOD declarativo** — tabla de elementos visuales (arquitectura/mantenibilidad). → [lod-declarativo.md](lod-declarativo.md)
- **Visor de especie en móvil** — añadir la dieta al panel; recordar qué `<details>` quedaron abiertos.

## Bandeja de entrada
*Ideas crudas sin procesar; convertir en idea (con su ficha) al abordarlas.*
- Revisar que la animación de nado esté ligada al esfuerzo real de movimiento del organismo.
- Bug: los sliders «talla mínima/máxima» cambian el tamaño de los organismos VIVOS; deberían limitar los tamaños posibles, no redimensionar a los existentes.
