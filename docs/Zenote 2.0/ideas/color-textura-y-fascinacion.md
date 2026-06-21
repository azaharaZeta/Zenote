# Color, textura y fascinación visual — estudio de viabilidad — **(Zenote 2)**

> Idea de usuario: dar a los organismos colores/texturas/aspectos **fascinantes** (objetivo #2: ser fascinante de ver),
> **sin romper el objetivo #1** (evolución emergente realista con el modelado genético) y **sin penalizar el rendimiento**
> (debe correr en móvil). Estudio + plan; pendiente de decisión antes de implementar.

## El principio rector (la regla que protege el objetivo #1)
Todo lo visual debe ser **una de dos cosas**, nunca una tercera:
1. **Lectura fiel** del genotipo/fenotipo/linaje (solo render, NO toca la simulación). No puede romper la emergencia
   porque no participa en ella; el único coste es de dibujo. Ej. actual: color por tejido (función), por rol, por `hue`
   (linaje). El brillo ∝ energía de VISUAL.md es de esta clase.
2. **Rasgo bajo selección real** (un gen que EVOLUCIONA: señal de pareja, aposematismo, camuflaje). Esto SÍ es emergencia
   y sirve a los dos objetivos a la vez, pero es mecánica nueva con riesgo.

Lo que hay que **evitar** es la tercera vía: **decoración pintada a mano** o un **gen decorativo neutro** que solo deriva.
Ya se probó y se abló en Zenote 2 (genes `c_eye`/`c_sat`/`tex2`): un gen sin función deriva a ruido → ni es fascinante
(patrón sin estructura) ni aporta a la emergencia (ver [[simplificacion-ablacion-2026-06]], [[decor-gene-cost-noop-in-small-subpop]]).
**Conclusión clave: "fascinante" no exige que el color evolucione; exige que REFLEJE algo real** (forma, función, linaje,
energía). La lectura fiel da casi toda la fascinación con cero riesgo para el objetivo #1.

## Estado actual del render (la base)
`src/main.js`: cada organismo se dibuja como un **conjunto de círculos**, uno por nodo (`ctx.arc`+fill), coloreado por
tejido (`TCOL`), rol o linaje (`hsl(hue)`). Una **onda viajera** desplaza los nodos (movimiento orgánico) y hay un **halo
aditivo** barato (segunda pasada de círculos ×2.4 con `lighter`, α 0.10). Sustrato = rejilla del campo de luz; borde del
toro; viñeta. **No hay**: siluetas (los nodos son bolitas, no formas de criatura), texturas, ojos, bioluminiscencia real,
bloom. El render ya está desacoplado del motor (worker) → tocar el aspecto NO puede afectar a la sim.

→ La mayor brecha de fascinación NO es el color: es que los organismos son **manchas de bolitas**, no criaturas. La forma
ya EVOLUCIONA (morfología real), pero el render no la luce.

## Catálogo de ideas, por viabilidad
Ejes: **fascinación** (payoff) · **seguridad-emergencia** (¿toca la sim?) · **coste/móvil** · **riesgo**.

### Tier A — lecturas fieles (solo render): alto payoff, riesgo CERO para la emergencia
*(no tocan la simulación; el único límite es el dibujo, acotable por LOD → barato en móvil)*

| # | Idea | Fascinación | Coste/móvil | Notas |
|---|---|---|---|---|
| **A1** | **Siluetas por nodo** (cono/púa/aleta/elipse según `aspect`/`dir`/tejido) en vez de círculos | ★★★★ | bajo (path en vez de arc; LOD: solo de cerca) | Convierte "manchas" en CRIATURAS. La forma ya evoluciona; esto la LUCE. Mayor wow/esfuerzo. |
| **A2** | **Color en capas**: `hue`=linaje (ya) + luminosidad ∝ energía (los hambrientos se apagan) + saturación/acento ∝ especialización (tejido dominante) | ★★★ | ínfimo | Hace legible y "vivo" el enjambre; la muerte se ve venir (VISUAL.md). Todo lectura fiel. |
| **A3** | **Textura procedural = lectura del genoma** (motas/bandas cuya frecuencia/orientación derivan de params del genoma, deterministas como `hue`) | ★★★★ | medio (cachear sprite por genoma; LOD: solo de cerca) | Parientes comparten patrón → revela linaje/genotipo a ojo = fascinante Y significativo. El coste se acota con caché + LOD (lejos = punto, sin textura). |
| **A4** | **Bioluminiscencia/glow por tejido** (PHOTO teal, MOUTH ámbar…) y bloom suave | ★★★ | medio (bloom = el clásico riesgo móvil; downsampled como v1) | Estética abisal. En móvil: opcional (calidad Baja sin bloom). |
| **A5** | **Cadáveres con forma** que se desvanecen con la carroña; nacer/crecer graduado | ★★ | bajo | Da ciclo de vida visible. Lectura del estado. |

### Tier B — rasgos bajo selección (tocan la sim): sirven a #1 y #2, pero RIESGO alto
| # | Idea | Veredicto preliminar |
|---|---|---|
| **B1** | **Color/ornamento como señal de pareja evolvable** (preferencia evolvable → *runaway* de Fisher) | El ÚNICO modo de que el color EVOLUCIONE de verdad; cierra D16 (hoy `mateCompat` es métrica fija). Pero la historia dice que los genes decorativos derivan a ruido si no hay un canal de selección real; exige señal+preferencia coevolucionando. **Spike con criterios de muerte**, no quick-win. |
| **B2** | **Aposematismo / camuflaje** (color bajo selección depredador↔presa) | El nicho depredador es minoría (pocos heterótrofos, límite aceptado [[pecera-pequena-contemplativa-scope]]) → presión débil → probable deriva. Bajo payoff esperado. Descartar salvo que el nicho cazador crezca. |

## Recomendación (escalonada, por fascinación-por-riesgo-por-coste)
1. **A1 — siluetas por nodo** primero. Es el salto de fascinación más grande (criaturas, no manchas), es lectura fiel de
   la morfología que YA evoluciona, y el coste se acota con LOD (de lejos = punto/elipse; de cerca = silueta). Cero riesgo
   para el objetivo #1.
2. **A2 — color en capas** (linaje + energía + especialización). Casi gratis, hace el enjambre legible y vivo.
3. **A3 — textura procedural como lectura del genoma**, cacheada y LOD-gated (de lejos no se dibuja). Aquí está el grueso
   del "texturas fascinantes" pidiendo, hecho de forma segura: el patrón es función determinista del genoma → parientes
   se parecen → fascinante y honesto. Es el de mayor cuidado en perf → medir en móvil antes de subir el default.
4. **(Opcional, ambicioso) B1 — color como señal sexual evolvable**: SPIKE aparte, con criterios de muerte (como
   vision-organo): si el ornamento no se diferencia/coevoluciona con la preferencia → descartar. Es la única vía para que
   el color "evolucione", y de paso cerraría D16; pero es mecánica nueva y arriesgada.

**Honestidad:** A1–A5 NO hacen que el color "evolucione" — VISUALIZAN lo que ya evoluciona. Eso cumple "formas y colores
fascinantes que reflejan a los organismos reales" sin falsear emergencia. Solo B1 convierte el color en un rasgo evolucionado.

## Rendimiento y móvil (innegociable)
- Todo Tier A es **render puro** → no toca el motor (la sim sigue idéntica y determinista; VISUAL.md §responsive).
- **LOD obligatorio**: de lejos/pequeño → punto plano (sin silueta ni textura); los detalles entran al acercar. Así el
  coste no escala con la población a zoom de "mundo entero" (el caso de móvil).
- **Textura (A3) y bloom (A4) = los dos riesgos**: textura → **caché de sprite por genoma** (rehornear solo al mutar/
  cambiar tamaño en pantalla) + gate LOD; bloom → downsampled y OFF en calidad Baja. Medir ms/frame en móvil real (o
  viewport estrecho) antes de subir defaults; calidad Baja debe seguir fluida.
- Criterio de aceptación de cada paso: **fluido en móvil (calidad Baja) con la población al tope**, y la sim byte-idéntica
  (es render puro → el checksum dorado NO debe moverse).

## Estado (2026-06-19): A1 + A2 IMPLEMENTADOS ✅ (render puro)
- **A1 — siluetas por nodo**: cada nodo se dibuja como **elipse orientada** (eje = rumbo + `dir` de emisión del nodo),
  elongada por `aspect` → aletas/tentáculos/cuerpos fusiformes en vez de bolitas. LOD: si la elipse es diminuta, punto
  barato (`arc`). `main.js drawOrgs`.
- **A2 — color en capas**: en el modo por tejido (defecto) el NÚCLEO va por tejido (anatomía) y el HALO por **linaje**
  (`hsl(hue)`, aura de familia) → se ven a la vez función interna y parentesco; **vitalidad**: los hambrientos se atenúan
  (alpha ∝ energía, "la muerte se ve venir").
- **Contrato de datos nuevo**: `worker.js` envía `partData` con **stride 7** `[x,y,r,tissue,phase,aspect,dir]` y un array
  `aE` (energía normalizada por agente). Render puro → **la sim no cambia** (motor byte-idéntico, checksum dorado intacto).
- **Selector "Colorear por" reorganizado** (5 modos, default = aspecto real):
  - **Natural (aspecto real)** ← DEFAULT: todo el cuerpo = **pigmento heredado** (`hue`/linaje), SIN colorear por función;
    auto-glow del MISMO color (luminoso/abisal → engancha con bioluminiscencia A4) + motas + brillo por energía + silueta.
    Es la "visualización real total": cada criatura un color coherente = parece una especie. El color real hoy es `hue`
    (neutro); si B1 lo hace evolucionar, este modo lo mostrará.
  - **Tejido + aura** (antes "Natural (real)"): núcleo por tejido (anatomía) + aura de linaje + motas + brillo. Bonito e
    informativo a la vez.
  - **Tejido (función) / Oficio trófico / Linaje**: analíticos PUROS (una señal).
- **Verificado en vivo** (preview): siluetas tipo criatura (chevrones/nadadores fusiformes), auras de familia bien
  distintas por linaje (magenta/azul/ámbar/verde), default = Natural, sin errores. Perf: la elipse cuesta ≈ el `arc`;
  +1 `hsl`/agente en la pasada de halo; LOD acota el coste a zoom de mundo-entero (el caso móvil). Pendiente: medición
  fina de ms/frame en móvil real al subir población.

- **A3 — textura procedural ✅** (solo Natural, solo núcleo): **motas bioluminiscentes** cuyo nº (1–3) y color de acento
  derivan de `hue` (heredado) → parientes comparten patrón = revela linaje, honesto (lectura fiel, no decoración neutra).
  **LOD**: solo en nodos con `pr>3.5` px → de lejos (mundo entero / móvil) NO se dibujan → coste 0. Sin caché de sprites
  (no hizo falta): medido `ms/draw` — zoom1 (mundo entero, ~1240 ag., SIN motas) 8.2 · zoom2 1.9 · zoom3 0.9 · zoom7 0.2.
  No hay precipicio (muchos en pantalla ⇒ pequeños ⇒ sin motas; motas visibles ⇒ pocos en pantalla). Render puro.

- **Bordes ✅** (a petición): trazo oscuro abisal fino (`rgba(4,7,12,.55)`, 1.2px) por nodo, reaprovechando el path del
  relleno; define las criaturas contra el fondo/glow y articula los nodos como lóbulos/aletas. LOD `pr>3.5`. **Coste medido
  ~2 ms** (A/B controlado sobre el mismo mundo; `stroke` es ~3-4× un `fill` pero gateado por LOD → barato). Aviso de método:
  comparar entre recargas ENGAÑA (cada reset re-siembra un mundo distinto/población distinta); medir el delta en una sola
  carga (exponiendo el umbral a `window`) sobre el mismo frame.

- **A4 — bioluminiscencia/BLOOM ✅**: la capa de organismos se dibuja en un búfer (`glowCv`); su miniatura (`bloomCv`,
  1/5) se reescala ADITIVA sobre el fondo → luz suave que sangra en el color de cada criatura (abisal). Downsampled (como
  v1) → **coste ≈ 0** (medido: delta vs off dentro del ruido; downsample/upscale son GPU). Slider "Bioluminiscencia" en el
  panel (render puro, NO va al worker), default 0.75, **0 = apagado** (móvil/Baja). Reestructuró el render: `drawOrgs(c,…)`
  dibuja a un ctx parametrizable; el bloom sustituye al antiguo doble-dibujo de halos sobre el lienzo principal.
  - **BIOLUMINISCENCIA = AURA + bloom, FUSIONADAS (decisión de usuario 2026-06-19):** se probó "bloom global de los
    núcleos" y NO daba sensación de brillo (solo sube el tono / extiende el borde). Lo que irradia es el **AURA** (halo
    aditivo ancho de color real). Decisión: la bioluminiscencia ES el aura, en **TODOS los modos**, suavizada por el bloom.
    Un solo slider "Bioluminiscencia" controla aura(alpha ∝ slider)+bloom; 0 = apagado (móvil/Baja). El aura va SIEMPRE en
    el **color real** (linaje): en Natural/natmix/lineage = auto-glow del color real (bioluminiscencia); en falso-color
    (`tissue`/`role`) hace doble función (glow + canal del color real sobre el núcleo de función). Aura algo más SUTIL que
    antes (mul 2.4→2.2, alpha 0.10→0.10·slider). Eliminado el modo redundante "Tejido + aura".
- **Modo "Natural + tejido" (`natmix`) ✅** (idea de usuario): pigmento heredado + tinte SUTIL del tejido (overlay `TCOL`
  alpha 0.32). **Selector final (5 modos):** Natural (aspecto real) / Natural + tejido / Tejido + aura real / Oficio +
  aura real / Linaje.

- **B1 — color como señal sexual evolvable — SPIKE GO pero REVERTIDO por decisión de usuario (2026-06-19).** Se implementó
  tras flag `SIM_P.sexSel`: `hue`=SEÑAL + gen `pref`=PREFERENCIA evolvables; `_findMate` elegía por match señal↔preferencia
  (tono circular). Medido (`m9-sexual-selection`, 3 seeds × 25k): **coupling +0.057** (realMatch ~0.18 vs shuffled ~0.24,
  métrica autocontrolada que descarta coalescencia) → señal/preferencia se ACOPLAN = firma de Fisher (cerraría D16). Efecto
  CLARO pero MODERADO (no runaway dramático). **El usuario decidió REVERTIRLO** (código quitado, gate byte-idéntico). Queda
  como receta validada por si se retoma; para más fuerza habría que endurecer la preferencia (rechazo, no solo "prefiere").

**Pendientes:** A5 (cadáveres con forma). El eje visual de fascinación está prácticamente completo: silueta + pigmento real
+ auto-glow + motas + bordes + bloom, todo fiel a lo que evoluciona y barato en móvil.

## Pasada de belleza vs zenote1 (referencia) — 2026-06-21
El usuario pidió acercar el aspecto a zenote1 (`../../../src/render/canvas.js`, "quedaron preciosos"). Análisis: zenote2 había
hecho las versiones BARATAS (siluetas = elipses planas, sin volumen, borde duro, fondo solo veg). Lo que hacía bonito a v1 y
faltaba: **volumen** (v1 sombrea cada nodo con gradiente radial, incluso en el tier barato `_drawNode`), **siluetas bézier**
(`_silPath`), y un **abismo vivo** (nieve marina + plancton + nebulosa). Hechos (render puro → dorado INTACTO; medido 1.46 ms/draw @ 453 ag · zoom 6):
- **#1 Sombreado volumétrico por nodo** — gradiente radial luz→medio→sombra con realce hacia una luz fija (arriba-izq, `LIGHT_DX/DY`)
  → aspecto gelatinoso 3D en vez de stickers planos. LOD: solo nodos > 2.4 px (de lejos = plano, barato). `drawOrgs` + `TCOL_HSL`/`RCOL_HSL`.
- **#5 Nieve marina** — detrito a la deriva que titila (mayoría azul-frío + ~6% con color), aditivo, bajo los organismos →
  profundidad del abismo. Gateada por el slider de bioluminiscencia (0 = off, móvil). `initSnow`/`drawSnow`.
- **#2 Siluetas bézier** — cada nodo pasa de elipse a una **curva bézier base↔punta** (`silPath`, como `_silPath` de v1) que
  AFILA hacia afuera según `aspect` (gota/aleta/tentáculo). Derivado de `aspect`+`dir` SIN tocar el genoma → dorado intacto.
  Es el salto de "racimo de óvalos" a **criatura** (flores/mariposas/anémonas luminosas). Verificado a zoom 7/4/2/1.
- **TEXTURA — motas → SEGMENTACIÓN** (a petición: "puntos gordos, simplones"): las antiguas motas (3 puntos derivados del hue,
  leían como pegatina) se reemplazaron por **costillas transversales curvas** (`drawOrgs`): bandas combadas hacia la punta,
  color = SOMBRA del propio cuerpo (anatomía, no acento pegado), ajustadas al ancho LOCAL de la silueta (sin clip → barato),
  nº (3-6) derivado del linaje. Lee como cuerpo SEGMENTADO (larva/copépodo)/nervios de aleta. Como `_drawNode` de v1 pero sin clip. LOD: nodos > 5 px.
- **Verificado en preview:** criaturas con forma+volumen+segmentación + abismo vivo, sin errores. **Perf:** el `createRadialGradient`
  por nodo era caro a vista de mundo → **gateado a pr>4 px** (volumen solo al ACERCAR; a zoom-mundo plano, imperceptible a 2-3 px).
  Medido: zoom1 ~15-20 ms/draw @ 489 ag · zoom4 ~10 ms @ 443 ag (dentro del presupuesto de 20 fps). Móvil/Baja protegido (nieve+bloom OFF por el slider; gradiente/costillas size-gated).
- **#3 Borde DURO → CONTORNO suave unificado** (VISUAL.md "nada de bordes duros"): se quitó el `stroke` por-nodo (creaba líneas
  internas entre lóbulos) y se dibuja UNA silueta dilatada de todos los nodos en un solo path/fill ANTES del cuerpo (como el outline
  pass de v1, pero sin pasada doble: `silPath(...,append)` acumula) → solo asoma el reborde exterior = contorno suave, sin líneas internas. `drawOrgs`.
- **Plancton / micro-flora**: chispas glow FIJAS (`initPlankton`/`drawPlankton`, sprites teal pre-renderizados) que FLORECEN donde
  la veg local es alta (densidad por cantidad: frondoso→casi todas, pastado→casi ninguna), aditivas. Gateadas por `bloomStrength`.
- **Nebulosa de profundidad**: campo grande frío↔cálido (senos toroidales, estático) FUNDIDO en el bake de la veg (`bakeVeg` + `depthField`)
  → el abismo deja de ser un teal plano (azul casi negro ↔ índigo/violeta sutil bajo/entre la vegetación).
- **Perf con todas las capas:** zoom1 ~16-21 ms/draw @ 458 ag (dentro de 20 fps; el contorno duplica el trabajo de paths bézier).
  Móvil/Baja protegido: plancton+nieve OFF por el slider, gradiente/costillas size-gated. **La pasada de belleza vs v1 está completa**
  (forma bézier + volumen + segmentación + contorno suave + abismo vivo: nieve + plancton + nebulosa).

## Próximos pasos sugeridos
1. ~~A1 (siluetas) + A2 (color en capas) + modo "Natural (real)" default~~ ✅ HECHO 2026-06-19.
2. ~~A3 (textura procedural, motas por linaje, LOD)~~ ✅ HECHO 2026-06-19 (perf medida, sin caché necesaria).
3. Opcionales restantes: A4 (bloom/bioluminiscencia, OFF en calidad Baja), A5 (cadáveres con forma).
4. Decidir si se aborda el **spike B1** (color sexual evolvable / D16) como pista de emergencia aparte.
