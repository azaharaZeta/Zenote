# Forrajeo por talla — dar PAYOFF a la talla (por qué no emergían herbívoros grandes)

> Ficha de idea · **estado: HECHA** · 2026-06-11 · archivada (congelada).
> Índice: [../indice-ideas.md](../indice-ideas.md) · Mecánica final: `SPEC_EVOLUCION.md` §3.1 (`resource.forageReach`).

## Problema (observación del usuario)
Todos los organismos se hacían minúsculos; ninguno crecía. Sospecha inicial: lo causó `energy.k_haul` (coste de
transporte ∝ masa, recién añadido).

## Diagnóstico (análisis estático + barridos headless)
- **Estático:** el ingreso de pasto (`absEff`) es PLANO en la talla (depende de `massMul` y anchura, NO de `sizeMass`),
  pero el coste de cría escala con la talla (`reproRef = E_max_base·sizeMass`). Un herbívoro grande cosecha igual que uno
  diminuto pero necesita ~7× más energía por cría → cría ~7× más lento → la selección lo lleva al mínimo. **Estructural.**
- **Headless (motor en Node, `new Sim(cfg)`+`step()`, reproducible):** `k_haul` es INOCENTE — quitarlo (B1) da la misma
  talla que el control (0.21 ≈ 0.216). Con varianza inicial la talla cae 0.27→0.21. Confirmado el sesgo a la baja.

## Lo que NO funcionó (descartado por el dato)
**Pasto ∝ talla** (prototipo `k_grazeSize`, ya retirado): la talla media quedó IGUAL (0.214–0.216 vs 0.21). Razón: el
mundo está **saturado** (recurso-limitado) → más *velocidad* de pastado no se traduce en más cosecha (la celda ya está
pelada). Cualquier boost del lado del INGRESO-RATE se anula bajo competencia. Lección: el cálculo estático "hierba rica"
engañaba; sin testear habríamos enviado un arreglo inútil.

## Lo que SÍ funcionó
**Forrajeo multi-celda** (`resource.forageReach`, sim.js): un cuerpo grande pasta de un ÁREA `(2·forageR+1)²` celdas,
`forageR = round(forageReach · size)`. Es una ventaja que la **escasez NO borra** (cubre más terreno). Medido:
- div=1, 6000t: `forageReach` 0→0.21, 1→0.238, 2→**0.354 (sube)**, 3→0.353 (satura).
- Arranque clonal real (div=0, 12000t): 0→0.219 (deriva abajo), 2→**0.344** + diversidad (p10–p90 0.28–0.45, max 1.0)
  + revive el nicho carnívoro (1→145). Sin coste de tick (1.54 ms/tick vs 1.69 del control). **Default = 2.**

## Lección (→ memoria)
La grandeza/diversidad de talla exige un payoff que **sobreviva a la saturación de recurso** (área de forrajeo), no
tuning del lado del ingreso-rate. Confirma y concreta `overnight-ecology-search` ("exige mecanismo estructural, no tuning").

## Pendiente (menor)
`forageR` cuenta CELDAS → el área-mundo depende de la resolución de rejilla (`gridCols/Rows`). Si molesta, escalar
`forageR` por `radio/cellW` para hacerlo independiente de la resolución. No urgente.
