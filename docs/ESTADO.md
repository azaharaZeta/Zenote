# Estado del proyecto — dashboard

> **Documento ÍNDICE.** Foto del presente + mapa de la documentación. NO almacena detalle: la mecánica vive en
> `SPEC_EVOLUCION.md`, los parámetros en `src/config.js` (comentado), el backlog (histórico) en `archivo/AUDIT_EVOLUCION.md`, las ideas
> en `ideas/indice-ideas.md`, los hitos en `CHANGELOG.md`. Aquí solo se sintetiza y se enlaza. Actualizar en cada hito.

**Estado (2026-06-12):** simulador de evolución **genuinamente emergente** (conducta y morfología bajo
selección, sin reglas de estrategia ni fitness explícito). El **Pilar v2.0 — Forma y movimiento emergentes** está
completo, y sobre él se ha construido la **trilogía de MORFOLOGÍA evolutiva (Capas 1-3)**: forma del nodo
(púa↔elipse↔aleta), funciones ecológicas (alcance del cazador / pastoreo del herbívoro) y modos de movimiento
(ondular↔aletear con coste). El cuerpo es un genoma generativo por nodos; masa, arrastre, empuje, giro, forma y
modo de nado EMERGEN de la geometría; el render dibuja desde los nodos.

## Modelo actual (resumen — detalle en [SPEC_EVOLUCION.md](SPEC_EVOLUCION.md))

Genoma de **201 genes/agente** (SoA, typed arrays):

| Bloque | Genes | Codifica |
|---|---|---|
| Ecología | 12 | size, speed(esfuerzo), sense, metab, diet, **scav (caza↔carroña)**, repro_thr, invest, hue, temp_pref, **mature_age, senescence** (ciclo de vida) |
| Identidad / display | 11 | e_fov (visión), c_eye, orn/pref (sex.), c_lum/c_sat, señuelo (o_*), tex2 |
| Cuerpo por NODOS | 80 | 8 nodos × {present, parent, size, aspect, angle, attach, osc_amp, osc_phase, **tipShape**, **gaitMode**} → grafo generativo |
| Cerebro | 98 | MLP recurrente (Elman, 10 entradas: +cobertura local, +talla y escapabilidad de la presa); pesos = genes → deseo de movimiento (dx,dy) + impulso de ataque |

- **Frontera gen→fenotipo única**: `organism.js` + `bodyplan.js`. El cuerpo es un grafo de una sola primitiva;
  masa, arrastre, **empuje direccional**, giro y elongación EMERGEN de la geometría.
- **Herencia**: sexual (crossover con ligamiento) + asexual fallback; mutación única por locus; especies por
  distancia genética (ecología + forma de nodos).
- **Fitness 100% emergente** (sobrevivir + criar). Motor en Web Worker; render Canvas 2D desde los nodos.
- **Mundo CERRADO en materia** ("pecera") — **único escenario**:
  la materia total se CONSERVA y circula (nutriente↔pasto↔organismos↔carroña), con capacidad de carga ENDÓGENA. Nació
  de una auditoría de energía (un modelo abierto no conservaba: ~17% de la entrada era biomasa conjurada y la pop se
  clavaba en el tope del pool; el modo abierto se eliminó en 2026-06). Régimen de
  **RED TRÓFICA** (`closedRegen` + `maxAgentsCeiling` + `fleeSpeed` + `scavPenalty` + **`expr.size.min`** (suelo de
  talla), valores en `config.js` → herbívoros + carroñeros + cazadores coexisten; el suelo de talla evita la deriva a
  cuerpos diminutos que a largo plazo saturaba el pool y extinguía al cazador → trío ROBUSTO a 30k+ ticks (medido 7/7
  siembras); los cazadores, minoría ápice fluctuante); el
  nutriente libre `N` se ve en la cabecera. Mecánica → [SPEC §3ter](SPEC_EVOLUCION.md); lección → memoria `energy-ledger-not-conserved`.

## Qué EMERGE (no cableado)
Especiación · **conducta 100% neuronal** (cerebro RNN único; cazar/huir/pastar **y atacar** emergen de los
pesos — sin reglas ni gen `aggro`) · **morfología generativa** y **gait direccional** (colas atrás propulsan,
frentes penalizan; ondulantes vs remeros) · **coordinación de marcha** (la natación coordinada se premia vía
coherencia de fase → `osc_phase` funcional) · nichos de dieta/talla(r-K)/térmico ·
**ciclo de vida r/K** (madurez precoz+vida rápida ↔ tardía+longeva, con coste de longevidad) ·
**energética alométrica** (almacén ∝ masa, metabolismo ∝ masa^¾ Kleiber → economía de escala) ·
depredación estructurada por talla · **refugios móviles** (cobertura por vegetación viva → la presa se esconde en
parches densos, expuesta en claros pastados) · selección sexual (orn/pref) · identidad visual por linaje ·
**morfología funcional (Capas 1-3):** la FORMA de cada nodo evoluciona (`tipShape`: púa/garra/tentáculo ↔ elipse ↔
aleta/paleta) con compromiso físico; apéndices frontales dan **alcance de caza** (`morphReach`) y los cuerpos
anchos **mejor pastoreo** (`k_grazeWide`) → nichos divergentes cazador↔pastador; el **modo de propulsión** evoluciona
(`gaitMode`: ondular=crucero barato ↔ aletear=ráfaga cara). La especialización la destraba `diet.omniPenalty`.
· **CARROÑA y GUSANO carroñero:** toda muerte deja cadáver (campo `carrion`, decae→pasto = ciclo de nutrientes); el
gen `scav` reparte la carne en CAZAR↔CARROÑEAR (`effHunt`/`effScav`, `scavPenalty`) y el carroñeo rinde con cuerpo
FINO (`k_scavThin`) → emerge un **gusano** pequeño y elongado que ronda los cadáveres (proto-forma sembrada para
cruzar el valle morfológico; mantenida por inercia + streamlining). Tres nichos comecarne+pastador coexisten.

## Huecos / pendientes (ideas → [ideas/indice-ideas.md](ideas/indice-ideas.md))
- **Backlog de auditoría CERRADO (14/14). Trilogía de morfología (Capas 1-3) HECHA.** Lo que queda son IDEAS:
  - **Giro físico** (que girar use los segmentos): hecha la señal visual del remado (C); pendiente el **par físico
    con palanca + inercia** (B, bajo riesgo) y el giro 100% emergente del cerebro izq/der (A, arriesgado).
  - **Afinar los pesos morfológicos** observando la evolución: `tip*`, `flap*`, `morphReach`, `k_grazeWide`, `k_flap`.
  - Selección de presa por talla; nuevas **entradas sensoriales del cerebro** (cobertura/manada); Fase 2 del dibujado
    (organismos tras el dosel, en clave abisal); apiñamiento de hermanos (render).
- *Tuning emergente (memoria):* carnívoros frágiles con mutación baja; `omniPenalty` = dial de especialización
  (a 0 arrasan los omnívoros y no diverge la morfología) — no son bugs, son dinámicas a vigilar.

## Backlog auditoría (resumen — fuente histórica: [archivo/AUDIT_EVOLUCION.md](archivo/AUDIT_EVOLUCION.md))
**14/14 — CERRADO ✅:** #0 Pilar completo, #1 mutación, #2 crossover ligamiento, #3 alometría, #4 r/K honesto,
#5 maxAlive, #6 muletas energéticas, #7 refugio (cobertura graduada), #8 constantes loco, #9 cerebro neural-only,
#10 ataque del cerebro, #11 carroña, #12 historia de vida, #13 consolidar color.

---

## Mapa de la documentación (qué doc lleva qué)

| Documento | Rol | Contiene | Se actualiza cuando… |
|---|---|---|---|
| `CLAUDE.md` | Instrucciones de trabajo | reglas innegociables, pila técnica, cómo contribuir | cambia el proceso/reglas |
| `docs/SPEC_EVOLUCION.md` | **Fuente de verdad del MODELO** | mecánica: genoma, herencia, mutación, selección, energética, física por nodos, rendimiento | cambian las REGLAS del modelo |
| `src/config.js` | **Parámetros (fuente única)** | cada parámetro: valor, comentario, si es *(UI)*; agrupado por bloque | se añade/quita/cambia un parámetro |
| `docs/ANALISIS_PARAMETROS.md` | **Mapa de interacciones** | qué hace cada subsistema *a nivel de ecuación*, bucles de realimentación, modos de fallo, jerarquía de palancas (base del finetuning). NO duplica config.js (valores) — analiza la DINÁMICA | cambia el modelo o se afina la parametrización |
| `docs/VISUAL.md` | Estética y RENDER | look, render por nodos, calidad, UI, responsive | cambia el render/estética |
| `docs/archivo/AUDIT_EVOLUCION.md` | Auditoría (histórica, archivada) | análisis física/diseño/muleta, catálogo de genes, **backlog CERRADO 14/14**, el *porqué* de v2.0 | congelado (no se modifica) |
| `docs/ideas/indice-ideas.md` | **Índice de ideas** | enumeración + estado; fichas en `ideas/<slug>.md`, archivadas en `ideas/archivo/` | surge / avanza / cierra una idea |
| `docs/CHANGELOG.md` | Hitos cronológicos | qué cambió y cuándo (reciente arriba) | cada hito |
| `docs/ESTADO.md` | **Foto del presente + índice** (este) | estado 1-línea, resumen del modelo, qué emerge, huecos, mapa de docs | cada hito |
| memoria del proyecto | Observaciones / lecciones | dinámicas emergentes observadas (no derivables del código) | se observa algo no obvio |

**Reglas anti-duplicación (un hecho, un sitio):**
- **Mecánica del modelo** → SOLO en SPEC. ESTADO resume y enlaza.
- **Parámetros** → SOLO en `src/config.js` (comentado). No hay doc de parámetros (se retiró CONFIG.md por duplicar).
- **Backlog** → AUDIT (histórico, cerrado). **Ideas vivas** → `ideas/` (índice + fichas + archivo).
- **Mecánica de una idea hecha** → SPEC (no se duplica en su ficha). **Hitos** → CHANGELOG. **Observaciones emergentes** → memoria.
- **ESTADO** no almacena detalle: sintetiza y enlaza. Si algo aparece en dos sitios, sobra en uno.

## Frescura de la documentación
**Hitos y cambios → [`CHANGELOG.md`](CHANGELOG.md).** Regla de mantenimiento: cada cambio de modelo → SPEC; cada
parámetro → `src/config.js`; cada avance de idea → su ficha en `ideas/`; cada hito → CHANGELOG; cada observación
emergente → memoria del proyecto. Si un dato vive en dos sitios, sobra en uno. Todos los docs reflejan el código real.
