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

**Pendientes:** A4 (bioluminiscencia/bloom), A5 (cadáveres con forma), y el spike B1 (color sexual evolvable / D16).

## Próximos pasos sugeridos
1. ~~A1 (siluetas) + A2 (color en capas) + modo "Natural (real)" default~~ ✅ HECHO 2026-06-19.
2. ~~A3 (textura procedural, motas por linaje, LOD)~~ ✅ HECHO 2026-06-19 (perf medida, sin caché necesaria).
3. Opcionales restantes: A4 (bloom/bioluminiscencia, OFF en calidad Baja), A5 (cadáveres con forma).
4. Decidir si se aborda el **spike B1** (color sexual evolvable / D16) como pista de emergencia aparte.
