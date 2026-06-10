# Configuración por defecto — "Zenote / Primordia"

Referencia de **parámetros**. Todos viven en un único objeto `config` (`src/config.js`) que el
motor lee; **nada hardcodeado disperso**. Los marcados *(UI)* tienen control en vivo en el modo
Laboratorio y afectan a la simulación al instante; los *(UI ↻)* requieren **Sembrar** para aplicarse.
Frontera de diseño: el programador define la **física**; la conducta y la forma **evolucionan**.

> Esta tabla refleja los valores reales del modelo v2.0 (cuerpo por nodos). La mecánica que
> usan está en `SPEC_EVOLUCION.md`. Si un parámetro de notas viejas no aparece aquí (p. ej.
> `k_speed`, `k_app`, `waveFloor`, `maxAlive`, bloque `carrion`), es que **se retiró**.

## Mundo
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `world.width` | 1200 | ancho del mundo (px lógicos, fijo) |
| `world.height` | 800 | alto |
| `world.wrap` | true | toro (bordes envueltos) |

## Recurso / vegetación
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `resource.gridCols` | 64 | columnas del campo de recurso |
| `resource.gridRows` | 48 | filas |
| `resource.R_max` | 1.0 | recurso máximo por celda (normalizado) |
| `resource.R_regen` | 0.0016 | *(UI)* ritmo de rebrote — **regulador principal** de cuánta comida sostiene el mundo |
| `resource.gradient` | "perlin" | forma de la capacidad: "perlin" \| "center" \| "uniform" |
| `resource.patchiness` | 0 | *(UI)* 0 = rebrote lineal (sin parches) … 1 = logístico + difusión de semilla → **parches que emergen y migran** |
| `resource.tempFreq` | 3 | frecuencia del campo térmico (bajo = zonas climáticas grandes) |
| `resource.absRate` | 0.20 | *(UI)* ritmo de pastado/tick (antes de escalar por `metab`) |
| `resource.energyPerUnit` | 10 | **conversión recurso→energía** (1 unidad = 10 pts). Parámetro de equilibrio más sensible (SPEC §3) |
| `resource.grazeRefuge` | 0.11 | reserva de rebrote intocable por celda (evita el sobrepastoreo letal) |

## Población
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `pop.initial` | 400 | nº de fundadores al sembrar |
| `pop.maxAgents` | 1000 | **tope duro del pool** (memoria/FPS), único límite numérico — la capacidad de carga la pone el recurso, no un tope (auditoría #5) |
| `pop.seed` | 123 | si número, RNG reproducible (mismo seed → misma corrida) |
| `pop.seedDietLow` | false | true = sembrar todo herbívoro; false = dieta diversa con proto-carnívoros |
| `pop.carnivoreSeedFrac` | 0.14 | fracción de fundadores sembrados como proto-carnívoros |
| `pop.simpleStart` | true | fundadores **simples** (complejidad y apariencia emergen); false = genes aleatorios |
| `pop.startJitter` | 0.06 | magnitud del jitter gaussiano del sembrado simple |
| `pop.startDiversity` | 0 | *(UI)* diversidad inicial: **0 = fundadores casi clonales** (renacuajos simples idénticos + cohorte carnívora; ver evolucionar desde cero) … 1 = variado. A 0 los nodos extra (2..7) no se siembran (solo cabeza+cola) |

## Energética y costes
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `energy.c_base` | 0.024 | *(UI)* coste basal/tick (recalibrado por la alometría #3; antes 0.02 con `k_size` aparte) |
| `energy.massExp` | 1.5 | *(UI)* **exponente alométrico** talla→masa: `sizeMass=(radius/refRadius)^massExp`. 1 = lineal; 2 = área 2D |
| `energy.kleiber` | 0.75 | *(UI)* **exponente metabólico** (Kleiber): coste basal ∝ `mass^kleiber`. <1 = los grandes gastan menos por unidad de masa |
| `energy.k_sense` | 0.3 | coste de la visión (alcance) |
| `energy.k_metab` | 0.6 | coste del metabolismo |
| `energy.k_lifespan` | 0.35 | *(UI)* coste basal extra de la **longevidad** (disposable soma, #12): factor `(1 + k_lifespan·(1−senescence))`. Evita que la senescencia colapse a "inmortal" |
| `energy.k_temp` | 1.9 | coste por desviarse del óptimo térmico (0 = sin selección térmica) |
| `energy.k_lure` | 0.13 | coste de mantener el **señuelo** bioluminiscente (∝ prominencia) |
| `energy.k_graze` | 0.50 | pasto **extra ∝ masa** (ata la complejidad al nicho herbívoro) |
| `energy.k_effort` | 1.59 | coste extra de moverse ∝ esfuerzo (gen `speed`) |
| `energy.moveCost` | 0.015 | coef. del coste de nado **∝ velocidad²** (frena la carrera de velocidad) |
| `energy.E_max_base` | 71 | `E_max = E_max_base·mass` (mass = sizeMass·massMul). Criar cuesta `E_max_base·sizeMass` (sin nodos → la complejidad no frena la cría, #4) |
| `energy.preyGain` | 0.90 | fracción de energía de la presa aprovechada al cazar |
| `energy.corpseReturn` | 0.5 | fracción de energía que un cadáver (muerte por hambre/vejez) devuelve al campo de recurso |

## Locomoción emergente — la forma produce el movimiento (SPEC §2bis)
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `loco.kThrust` | 7.1 | calibra la velocidad-capacidad típica (recalibrado: un nadador con cola ≈ v1; cabeza sola ~0.47) |
| `loco.headThrust` | 0.15 | *(UI)* empuje de la **cabeza** (motor base débil). 1 = cabeza nadadora (régimen previo); bajo = la cabeza es carga → nadar bien exige cola/aletas (emergen por selección) |
| `loco.paddleEff` | 0.6 | peso del **remo lateral** en el gait (aleta lateral propulsa, menos que cola trasera) |
| `loco.oscFloor` | 0.15 | suelo de amplitud de oscilación por nodo |
| `loco.phaseGain` | 0.5 | *(UI)* cuánto penaliza la marcha **descoordinada** (fases dispersas) el empuje. 0 = sin penalización (modelo previo); 1 = máx. Hace funcional `osc_phase` → nadar coordinado emerge (SPEC §2bis) |
| `loco.elongMax` | 3.0 | techo de la elongación derivada de la geometría (streamlining) |
| `loco.symBase` | 0.4 | empuje útil recto mínimo (la asimetría del grafo desvía empuje a girar) |
| `loco.streamBase` | 1.0 | arrastre base del cuerpo |
| `loco.streamGain` | 0.5 | cuánto reduce el arrastre la elongación (hidrodinámica) |
| `loco.effortFloor` | 0.2 | esfuerzo mínimo de nado (gen `speed` = acelerador 0..1) |
| `loco.vMin` / `loco.vMax` | 0.15 / 3.0 | suelo/techo de la velocidad-capacidad |
| `loco.turnBase` | 0.18 | agilidad de giro base |
| `loco.turnAsym` | 0.35 | la asimetría del cuerpo mejora el giro |
| `loco.turnSize` | 0.15 | los cuerpos grandes giran peor |
| `loco.turnElong` | 0.08 | los cuerpos elongados giran peor |
| `loco.turnMin` | 0.08 | giro mínimo (nadie queda incapaz de virar) |
| `loco.bodyThrust` | 1.0 | escala del empuje del **cuerpo** (cabeza + segmentos que ondulan); propulsor principal |
| `loco.segThrust` | 0.34 | empuje de las patas de los segmentos (nodos mediales) |
| `loco.modThrust` | 0.3 | empuje de los apéndices laterales (nodos espejados) |
| `loco.segDrag` | 0.22 | arrastre extra por segmento |
| `loco.modDrag` | 0.6 | arrastre extra por nodo lateral |
| `loco.segTurn` | 0.03 | cada nodo-segmento extra empeora el giro |
| `loco.limbThrust` | 0.12 | empuje por área de tentáculo/aleta fina (propulsión secundaria) |
| `loco.limbDrag` | 0.20 | arrastre por área de tentáculo (> limbThrust → propulsor ineficiente) |
| `loco.bodyDrag` | 0.30 | arrastre por área de nodo ancho (cabeza/lóbulo) |
| `loco.bodyMass` | 0.30 | masa metabólica por área de nodo ancho (el ancho sí es volumen real) |
| `loco.tipThrust` | 0.4 | FORMA del nodo (gen `tipShape`, NEUTRO en 0.5): abrir la punta (aleta) → +empuje; afilar (púa) → −empuje |
| `loco.tipDrag` | 0.5 | abrir → +arrastre; afilar → −arrastre (streamlining) |
| `loco.tipReach` | 0.35 | afilar → +longitud (alcance: tentáculo/púa); abrir → más corto |

## Visión emergente — `sense` fija la inversión, `e_fov` reparte alcance↔ángulo (SPEC §2ter)
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `vision.halfFovMin` | 0.35 | semiángulo mínimo del cono (rad ≈ 20°): estrecho frontal (cazador) |
| `vision.halfFovMax` | 2.70 | semiángulo máximo (rad ≈ 155°): casi panorámico (presa) |
| `vision.fovRef` | 3.05 | FOV de referencia para conservar el área visual |
| `vision.rangeExp` | 0.4 | exponente del reparto alcance↔ángulo (ventaja frontal suave) |

## Dieta
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `diet.omniPenalty` | 0.0 | penalización por dieta intermedia (0 = omnívoros viables; sube para forzar especialistas) |

## Refugio de presa (estabilizador Lotka-Volterra)
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `refuge.enabled` | true | *(UI)* activar la **cobertura** de presa (#7: graduada por vegetación viva, no flag binario) |
| `refuge.strength` | 0.9 | *(UI)* fuerza de la cobertura: prob. de escape = `strength · vegetación_local`. En vivo (sin reseed) |

## Color como pigmento (SPEC §3)
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `color.matchPenalty` | 0.6 | cuánto penaliza un color desajustado con la luz local (0 = neutral, 1 = máx) → hace `hue` adaptativo |

## Edad / senescencia
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `age.mortality` | 0.0005 | *(UI)* mortalidad **base** por senescencia (el gen `senescence` la escala por individuo) |
| `age.scale` | 500 | escala temporal de la curva cuadrática de riesgo |
| `age.senesSlow` | 0.3 | multiplicador de senescencia con `senescence`=0 (longevo) |
| `age.senesFast` | 3.0 | multiplicador con `senescence`=1 (vida rápida, muere joven) |

> La **edad de madurez** ya no es un parámetro global: es el gen `mature_age` (#12, ver `expr.mature_age`).

## Reproducción
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `repro.cooldown` | 60 | enfriamiento entre crías (ticks) |
| `repro.sexual` | true | reproducción sexual (recombinación de dos padres compatibles) |
| `repro.asexual` | true | *(UI)* permitir clon mutado si no hay pareja compatible cerca (fallback) |
| `repro.speciesGenThreshold` | 0.15 | distancia genética máx. para cruzarse (= misma especie; define los clústeres) |
| `repro.mateRadius` | 70 | radio (px) de búsqueda de pareja al reproducirse |

## Mutación — una sola tasa por locus, CIEGA a la función del gen (auditoría #1)
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `mut.rate` | 0.05 | *(UI)* prob. de mutación por gen (todos por igual) |
| `mut.sigma` | 0.08 | *(UI)* magnitud de la mutación |
| `mut.bigRate` | 0.002 | prob. de macromutación (salto grande y raro) |
| `mut.bigSigmaMult` | 5 | multiplicador de magnitud de la macromutación |
| `mut.recomb` | 0.07 | *(UI)* recombinación sexual: prob. de cruce **por locus** (LIGAMIENTO). 0.5 = uniforme; →0 = tramos contiguos co-heredados |

## Combate / depredación — física trófica, no conducta (SPEC §3.1)
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `combat.enabled` | true | *(UI)* activar depredación/combate (`false` = mundo solo-herbívoro) |
| `combat.sizeAdvantage` | 1.4 | *(UI)* cuánto pesa el tamaño en quién gana el combate |
| `combat.failDamage` | 0.45 | *(UI)* energía que pierde el atacante al **fallar** (× su eMax); muere solo si llega a 0. Freno denso-dependiente. ≥1 ≈ muerte segura |
| `combat.handlingTime` | 31 | enfriamiento tras una captura (digestión) — satura la tasa de caza, amortigua oscilaciones |
| `combat.dietMargin` | 0.08 | diferencia de dieta mínima para considerar a otro "presa" (no un igual) |
| `combat.preyBandLo` | 0.20 | ratio presa/depredador **mínimo** cazable (más pequeño no compensa) |
| `combat.preyBandHi` | 2.0 | *(UI)* ratio presa/depredador **máximo** atacable (1.0 = hasta su tamaño; >1 = presa mayor, más arriesgada) |
| `combat.lureReach` | 0.85 | alcance de captura extra que da el señuelo (∝ prominencia) |

## Motor / tiempo
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `sim.targetTPS` | 20 | *(UI)* ticks por segundo objetivo, desacoplado de los fps. 0 = pausa |
| `sim.frameBudgetMs` | 40 | máx. ms simulando por frame en modo normal (si no llega, bajan fps, no se congela) |
| `sim.maxBudgetMs` | 250 | máx. ms simulando por frame en modo "máx velocidad" |

## Render (solo visual; no afecta a la simulación)
| Parámetro | Valor | Notas |
|-----------|-------|-------|
| `render.glow` | true | resplandor (bloom): halo por organismo + brillo global. Solo config (sin control en vivo) |
| `render.dprCap` | 2 | tope de densidad de píxeles (DPR) — protege FPS en retina/móvil |
| `render.quality` | 'high' | *(UI)* 'high' \| 'low'. **Baja** = sin bloom (blur), **sin halos por agente**, sin nieve marina, menos chispas, y umbrales LOD ×`lodLowMult` (más puntos) → móvil/equipos lentos |
| `render.lodBody` | 5 | LOD: rPx (radio en pantalla) mínimo para dibujar CUERPO (debajo = punto plano) |
| `render.lodFull` | 9 | LOD: rPx mínimo para el GRAFO de nodos completo (entre `lodBody` y esto = cuerpo barato: elipse de volumen orientada) |
| `render.lodEye` | 11 | LOD: rPx mínimo para los OJOS (dentro del grafo) |
| `render.lodLure` | 22 | LOD: rPx mínimo para el SEÑUELO (béziers+gradientes, caro) |
| `render.lodWave` | 18 | LOD: rPx mínimo para la ONDA viajera + 2ª pasada de contorno (si no, cuerpo en reposo, 1 pasada) |
| `render.lodHalo` | 6 | LOD: rPx mínimo para el HALO por agente (los puntos diminutos brillan ya por el bloom global) |
| `render.lodLowMult` | 2.6 | Multiplicador de todos los umbrales LOD en calidad baja (más agresivo) |
| `render.grassDensity` | 6800 | nº de motas de plancton/micro-flora luminosa repartidas por el mundo |
| `render.grassRefreshFrames` | 15 | cada cuántos frames se redibuja la capa de sustrato abisal |

## Genes — rangos de expresión (`expr`, lerp desde [0,1])
| Gen | min | max | Notas |
|-----|-----|-----|-------|
| `size` → radio px | 1.7 | 9 | solo render/contacto; **no** afecta a la energía |
| `speed` → escala de esfuerzo | 0.2 | 2.0 | acelerador; la velocidad emerge de la morfología (SPEC §2bis) |
| `sense` → alcance visión base (px) | 10 | 80 | |
| `repro_thr` → fracción de la referencia | 0.5 | 0.95 | |
| `invest` → energía a la cría (fracción) | 0.2 | 0.6 | |
| `mature_age` → edad de madurez (ticks) | 80 | 650 | #12: gatea la cría e inicia la senescencia |

> `metab`, `diet`, `hue`, `temp_pref`, `senescence` y los genes de **nodo** se usan directamente en
> `[0,1]` (su efecto está en las fórmulas de SPEC §2bis–§3). Los pesos del cerebro se mapean por
> `(gen−0.5)·BRAIN.scale` (SPEC §cerebro).
