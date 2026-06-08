# Configuración por defecto — "Primordia"

Valores de arranque. Deben vivir en un único objeto/módulo `config` que el motor
lea, y los marcados como *(UI)* deben exponerse como controles en vivo. Ningún
valor debe estar "hardcodeado" disperso por el motor.

## Mundo
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `world.width` | 1200 | px lógicos |
| `world.height` | 800 | px lógicos |
| `world.wrap` | true | toro (bordes envueltos) |
| `resource.gridCols` | 64 | resolución del campo de recurso |
| `resource.gridRows` | 48 | |
| `resource.R_max` | 1.0 | máximo por celda (normalizado) |
| `resource.R_regen` | 0.004 | *(UI)* regeneración por tick por celda |
| `resource.gradient` | "perlin" | "perlin" \| "center" \| "uniform" |
| `resource.absRate` | 0.12 | fracción del recurso de celda absorbible/tick (antes de escalar por `metab`). Bajo a propósito: evita arrasar la celda de un bocado → agentes más sanos. Valor inicial 0.5, recalibrado por observación |
| `resource.energyPerUnit` | 20 | **conversión recurso→energía**: 1 unidad de recurso = 20 pts de energía. Parámetro de equilibrio crítico (ver SPEC §3). Valor inicial 40, recalibrado por observación a un enjambre denso y bien alimentado |

## Población inicial
| Parámetro | Valor |
|-----------|-------|
| `pop.initial` | 400 |
| `pop.maxAgents` | 4000 | tope duro para proteger FPS (red de seguridad, no punto de operación). Valor inicial 8000 |
| `pop.seed` | null | si número, RNG reproducible |
| `pop.seedDietLow` | false | Fase 1: `true` siembra herbívoros (diet≈0). Fase 2: `false` |
| `pop.carnivoreSeedFrac` | 0.1 | Fase 2: fracción de fundadores sembrados como proto-carnívoros coordinados (cruza el "valle de fitness") |

## Energética
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `energy.c_base` | 0.02 | coste basal/tick |
| `energy.k_size` | 1.8 | peso del tamaño en el coste basal. Alto a propósito (Fase 2): ser grande es caro → la presa no puede escapar de la depredación volviéndose gigante. Valor inicial 1.0 |
| `energy.k_speed` | 1.6 | **legado** (F-B: la velocidad emerge de la morfología, ya no de este gen; sin efecto). |
| `energy.k_sense` | 0.3 | |
| `energy.k_metab` | 0.6 | peso de `metab` en el coste basal |
| `energy.k_temp` | 1.9 | coste extra por desviarse del óptimo térmico (`temp_pref` vs temperatura local). 0 = sin selección térmica |
| `energy.k_app` | 1.0 | coste basal de **mantener/arrastrar apéndices grandes** (∝ superficie de apéndices). F-B |
| `energy.k_effort` | 1.2 | coste extra de moverse según el esfuerzo (gen `speed`) → nadar fuerte es caro. F-B |
| `energy.moveCost` | 0.015 | coef. del coste de nado **∝ velocidad²** (arrastre hidrodinámico; frena la carrera de velocidad). F-B |
| `energy.E_max_base` | 100 | `E_max = E_max_base * (0.5 + size)` → rango 50–150 |
| `energy.preyGain` | 0.8 | fracción de energía obtenida de una presa. Subido (Fase 2) para que una caza rate-limitada compense; valor inicial 0.6 |
| `diet.omniPenalty` | 0.3 | penalización máx. de eficiencia del omnívoro (en diet=0.5). Suavizado para que el eje dieta sea escalable; valor inicial 0.5 |
| `color.matchPenalty` | 0.6 | cuánto baja la absorción si el color desajusta con la luz local (0=neutral, 1=máx). Hace que `hue` sea adaptativo |
| `energy.corpseReturn` | 0.5 | fracción de la energía del muerto devuelta como recurso |

## Locomoción emergente (F-B) — la forma produce el movimiento (ver SPEC §2bis)
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `loco.kThrust` | 12 | calibra la velocidad-capacidad típica (~0.9 px/tick con morfología media) |
| `loco.waveFloor` | 0.3 | empuje mínimo sin ondular (`m_wave`=0) |
| `loco.symBase` | 0.4 | empuje útil recto mínimo (asimétrico desvía empuje a girar) |
| `loco.streamBase` | 1.0 | arrastre base del cuerpo |
| `loco.streamGain` | 0.5 | cuánto reduce el arrastre la elongación (`m_elong`) |
| `loco.effortFloor` | 0.2 | esfuerzo mínimo (el gen `speed` es el acelerador 0..1) |
| `loco.vMin` / `loco.vMax` | 0.15 / 3.5 | suelo/techo de la velocidad-capacidad |
| `loco.turnBase` | 0.18 | agilidad de giro base (fracción que la dirección rota hacia el deseo/tick) |
| `loco.turnAsym` | 0.35 | la asimetría (`m_sym` bajo) mejora el giro |
| `loco.turnSize` | 0.15 | los cuerpos grandes giran peor (inercia) |
| `loco.turnElong` | 0.08 | los cuerpos elongados giran peor |
| `loco.turnMin` | 0.08 | giro mínimo (nadie queda incapaz de virar) |

## Visión emergente y direccional (F-D) — los ojos producen la visión (ver SPEC §2ter)
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `vision.halfFovMin` | 0.35 | semiángulo mínimo (rad ≈ 20°): cono estrecho frontal (largo alcance) |
| `vision.halfFovMax` | 2.70 | semiángulo máximo (rad ≈ 155°): casi panorámico (corto alcance) |
| `vision.fovRef` | 3.05 | FOV de referencia (rad) para repartir alcance↔ángulo |
| `vision.rangeExp` | 0.4 | exponente del reparto (0.5 = conserva área; <0.5 = ventaja frontal más suave → amortigua oscilaciones) |

## Complejidad corporal (F-C funcional) — segmentos y módulos (ver SPEC §2quater)
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `loco.segThrust` | 0.3 | empuje extra de las patas de segmentos (< segDrag → la complejidad NO da velocidad) |
| `loco.modThrust` | 0.3 | empuje extra de los apéndices de módulos |
| `loco.segDrag` | 0.6 | arrastre extra por segmentos (cuerpo largo = más lento) |
| `loco.modDrag` | 0.6 | arrastre extra por módulos |
| `loco.segTurn` | 0.06 | cada segmento extra empeora el giro |
| `loco.appTurn` | 0.01 | cada apéndice mejora un poco el giro (flavor menor) |
| `energy.k_appN` | 0.02 | coste fijo POR apéndice: MUY suave → el nº de apéndices es casi NEUTRO y DERIVA por todo el rango (1..8) → coexisten organismos con pocos/uno y con muchos (diversidad por deriva, no por nicho) |
| `energy.k_appGraze` | 0.0 | (desactivado) atar el pasto al nº empujaba a los herbívoros a "muchos"; dejándolo libre hay variedad real |
| `energy.k_body` | 0.4 | coste basal extra por masa corporal (tejido a mantener) |
| `energy.k_graze` | 0.6 | cuánto más pasta un cuerpo con más masa → ata la complejidad al nicho herbívoro |

## Senescencia (vejez)
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `age.mature` | 300 | ticks sin riesgo de muerte por edad |
| `age.mortality` | 0.0005 | escala de probabilidad de muerte/tick tras la madurez |
| `age.scale` | 500 | divisor de edad en la curva cuadrática de riesgo |

## Reproducción y mutación
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `repro.cooldown` | 60 | ticks |
| `mut.rate` | 0.03 | *(UI)* prob. de mutar cada gen |
| `mut.sigma` | 0.05 | *(UI)* desviación del ruido gaussiano |
| `mut.bigRate` | 0.002 | prob. de mutación de gran efecto |
| `mut.bigSigmaMult` | 5 | multiplicador de sigma en mutación grande |
| `repro.sexual` | true | **Fase 4**: reproducción sexual (recombinación de 2 padres compatibles); fallback asexual si no hay pareja cerca |
| `repro.speciesGenThreshold` | 0.25 | distancia genética máx. para cruzarse = misma "especie" (también define los clústeres del contador) |
| `repro.mateRadius` | 55 | radio (px) en el que se busca pareja compatible al reproducirse |
| `sim.brain` | 'neural' | **DEFECTO**: cerebro neuronal RECURRENTE (RNN Elman, pesos=genoma, sembrado competente) decide el movimiento. `'reactive'` (regla reactiva) sigue en el código pero ya NO se expone en la UI. El cerebro brilla con `resource.patchiness` alta |

## Combate (carnívoros)
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `combat.enabled` | true | Fase 2 activa. Poner `false` recupera el mundo solo-herbívoro |
| `combat.sizeAdvantage` | 1.0 | exponente sobre el tamaño en la fuerza de combate (↑ = el tamaño decide más). Resolución exacta en SPEC §3.1 |
| `combat.handlingTime` | 48 | ticks de enfriamiento tras una captura (digestión). Limita la tasa de depredación → estabiliza la coexistencia. Subido (F-D) para amortiguar las oscilaciones que acentúa la visión direccional; valor previo 30 |
| `combat.dietMargin` | 0.25 | para atacar, la presa debe estar al menos esto MÁS abajo en la dieta (además de ser más pequeña). Evita el canibalismo entre depredadores y, con ello, la carrera al gigantismo que los hacía insostenibles |
| `combat.contactRadius` | *(derivado)* | suma de radios; solo se ataca a presas MÁS pequeñas al solaparse (ver SPEC §3.1) |

## Simulación / render
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `sim.targetTPS` | 120 | *(UI)* velocidad en **ticks por segundo**, desacoplada de los fps. El motor ejecuta los ticks que toquen según el tiempo real transcurrido. 0 = pausa |
| `sim.frameBudgetMs` | 40 | máx. ms simulando por frame; si mantener `targetTPS` exige más, bajan los fps (nunca congela el render) |
| `sim.maxBudgetMs` | 250 | modo "max": simula a tope durante estos ms/frame (fps↓, ticks/s al techo de CPU) |
| `render.trails` | false | *(UI)* estelas |
| `render.glow` | true | *(UI)* |
| `render.showResourceField` | true | *(UI)* hierba/vegetación (el fondo es siempre el mapa térmico: nieve fría → marrón cálido) |
| `render.dprCap` | 2 | tope de devicePixelRatio al fijar resolución del canvas (protege FPS en pantallas retina/móvil) |
| `render.narrowBreakpoint` | 700 | px de viewport por debajo del cual la UI pasa a layout móvil y arranca con efectos apagados |

## Genes — rangos de expresión (lerp desde [0,1])
| Gen | min | max |
|-----|-----|-----|
| size → radio px | 2 | 12 |
| speed → esfuerzo (F-B; ya no fija v_max, que emerge de la morfología) | 0.2 | 2.0 |
| sense → radio px | 10 | 80 |
| repro_thr → fracción E_max | 0.5 | 0.95 |
| invest → fracción E_max a cría | 0.2 | 0.6 |
| w_food → factor de atracción comida | 0 | 2 |
| w_prey → factor de atracción presa | 0 | 2 |
| w_flee → factor de repulsión amenaza | 0 | 2 |

> `metab`, `diet`, `aggro`, `hue` y `temp_pref` se usan directamente en `[0,1]` (sin lerp a
> otro rango); su efecto está en las fórmulas de SPEC §3. `hue` se mapea a tono; `temp_pref`
> es el óptimo térmico (coste si difiere de la temperatura local, `energy.k_temp`).

> Sugerencia: empezar con `combat.enabled=false` para validar que un mundo solo
> de herbívoros ya muestra selección (genes derivando). Luego activar carnívoros.
