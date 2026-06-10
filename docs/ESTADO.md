# Estado del proyecto — dashboard

> **Documento ÍNDICE.** Resumen ejecutivo de una ojeada + mapa de la documentación. NO almacena detalle:
> la mecánica vive en `SPEC_EVOLUCION.md`, los parámetros en `CONFIG.md`, el backlog en `AUDIT_EVOLUCION.md`,
> las ideas en `IDEAS.md`. Aquí solo se sintetiza y se enlaza. Actualizar en cada hito.

**Estado (2026-06-10):** simulador de evolución **genuinamente emergente** (conducta y morfología bajo
selección, sin reglas de estrategia ni fitness explícito). El **Pilar v2.0 — Forma y movimiento emergentes
está COMPLETO**: el cuerpo es un genoma generativo por nodos, la física de locomoción es direccional y emerge
de la geometría, el render dibuja desde los nodos.

## Modelo actual (resumen — detalle en [SPEC_EVOLUCION.md](SPEC_EVOLUCION.md))

Genoma de **167 genes/agente** (SoA, typed arrays):

| Bloque | Genes | Codifica |
|---|---|---|
| Ecología | 13 | size, speed(esfuerzo), sense, metab, diet, aggro, w_food/prey/flee, repro_thr, invest, hue, temp_pref |
| Identidad / display | 13 | colores por parte, e_fov (visión), c_eye, orn/pref (sex.), c_lum/c_sat, señuelo (o_*), tex2 |
| Cuerpo por NODOS | 64 | 8 nodos × {present, parent, size, aspect, angle, attach, osc_amp, osc_phase} → grafo generativo |
| Cerebro | 77 | MLP recurrente (Elman); pesos = genes → deseo de movimiento |

- **Frontera gen→fenotipo única**: `organism.js` + `bodyplan.js`. El cuerpo es un grafo de una sola primitiva;
  masa, arrastre, **empuje direccional**, giro y elongación EMERGEN de la geometría.
- **Herencia**: sexual (crossover con ligamiento) + asexual fallback; mutación única por locus; especies por
  distancia genética (ecología + forma de nodos).
- **Fitness 100% emergente** (sobrevivir + criar). Motor en Web Worker; render Canvas 2D desde los nodos.

## Qué EMERGE (no cableado)
Especiación · conducta (cerebro neuronal: cazar/huir/pastar/atacar) · **morfología generativa** y **gait
direccional** (colas atrás propulsan, frentes penalizan; ondulantes vs remeros) · **coordinación de marcha**
(la natación coordinada se premia vía coherencia de fase → `osc_phase` funcional) · nichos de dieta/talla(r-K)/
térmico (camuflaje color↔luz) · depredación estructurada por talla · selección sexual (orn/pref) · identidad
visual por linaje.

## Huecos principales (detalle y prioridad → [AUDIT_EVOLUCION.md](AUDIT_EVOLUCION.md) §Backlog · ideas → [IDEAS.md](IDEAS.md))
- **"Cabeza nadadora"**: poca presión para evolucionar colas (idea en IDEAS).
- **Ataque/dirección no 100% del cerebro** (`aggro`/`w_*` siguen siendo genes-atajo → backlog #9/#10).
- **Sin alometría** (#3), **sin genes de historia de vida** (#12), **refugio** aún flag binario (#7).

## Backlog auditoría (resumen — fuente: [AUDIT_EVOLUCION.md](AUDIT_EVOLUCION.md))
**7/14 hechos:** ✅ #0 Pilar completo, #1 mutación, #2 crossover ligamiento, #4 r/K honesto, #5 maxAlive,
#6 muletas energéticas, #11 carroña. **Pendientes:** #3 alometría · #7 refugio · #8 constantes loco ·
#9 reactivo+`w_*` · #10 `aggro`→cerebro · #12 historia de vida · #13 consolidar color.

---

## Mapa de la documentación (qué doc lleva qué)

| Documento | Rol | Contiene | Se actualiza cuando… |
|---|---|---|---|
| `CLAUDE.md` | Instrucciones de trabajo | reglas innegociables, pila técnica, cómo contribuir | cambia el proceso/reglas |
| `docs/SPEC_EVOLUCION.md` | **Fuente de verdad del MODELO** | mecánica: genoma, herencia, mutación, selección, energética, física por nodos, rendimiento | cambian las REGLAS del modelo |
| `docs/CONFIG.md` | Referencia de PARÁMETROS | cada parámetro: nombre, rango, default, si es (UI) | se añade/quita/renombra un parámetro |
| `docs/VISUAL.md` | Estética y RENDER | look, render por nodos, UI, responsive | cambia el render/estética |
| `docs/AUDIT_EVOLUCION.md` | Auditoría + hoja de ruta | análisis (física/diseño/muleta), catálogo de genes, **backlog con checks**, plan del Pilar | se avanza el backlog / se decide un cambio |
| `docs/IDEAS.md` | Ideas futuras NO planificadas | ideas estudiadas, con contexto para retomar en frío | surge o se descarta una idea |
| `docs/ESTADO.md` | **Dashboard ejecutivo + índice** (este) | estado 1-línea, resumen del modelo, qué emerge, huecos, mapa de docs | cada hito |

**Reglas anti-duplicación:**
- **Mecánica del modelo** → SOLO en SPEC. ESTADO da un resumen y enlaza.
- **Parámetros** → SOLO en CONFIG.
- **Backlog / progreso** → SOLO en AUDIT. ESTADO puntea, no re-lista.
- **Ideas no planificadas** → SOLO en IDEAS (cuando una se ejecuta, pasa a AUDIT/SPEC y se retira de IDEAS).
- **ESTADO** no almacena detalle: sintetiza y enlaza. Si algo aparece en dos sitios, sobra en uno.

## Frescura de la documentación
**Saldada la deuda v2.0 (2026-06-10):** `SPEC_EVOLUCION.md` y `CONFIG.md` reescritos al modelo de nodos
(genoma de 167 genes, física direccional, crossover con ligamiento, distancia sobre genes funcionales,
combate con `failDamage`/banda de talla, r/K honesto); `VISUAL.md` actualizado para el render por nodos.
Todos los docs reflejan ahora el código real. Mantenerlos al día con la regla: cada cambio de modelo →
SPEC; cada parámetro → CONFIG; cada avance de backlog → AUDIT; cada hito → este ESTADO.
