# SPIKE M2 — ¿emerge la coexistencia depredador-presa sin diales cableados? → **GO**

> La puerta **make-or-break** del rediseño (riesgo R1). Pregunta: ¿la **respuesta funcional (tripa/saciedad, 2.3)**
> + el **refugio espacial (2.1)** producen coexistencia depredador-presa estable **SIN** los estabilizadores
> Lotka-Volterra cableados (`handlingTime`, `failDamage`, `fleeCap`, `refuge.strength`)?
>
> Rebanada ecológica mínima: recurso→presa→depredador en un toro 2D, **conducta codificada a mano** (la evolucionada
> es de M6). Ablación: tripa on/off · cobertura on/off · tamaño de mundo. Reproducir:
> `node zenote2/spikes/m2-coexistence/run.mjs 8000 1,2,3 1000,1500,2000,2500`

## Veredicto: **GO** ✅

Coexistencia **EMERGE** de dos mecanismos, **ningún dial de balance cableado**:

1. **Refugio espacial (tamaño de mundo) — lever DOMINANTE.** Mundo pequeño → los ciclos depredador-presa se
   **sincronizan** globalmente → boom-bust → **extinción mutua**. Mundo grande → ciclos locales **desincronizados**
   (efecto Huffaker) → coexistencia. **Valida la tesis central de 2.1: el espacio es la fricción ecológica ausente.**
2. **Tripa (saciedad = respuesta funcional tipo II) — 2º estabilizador.** Baja el umbral de tamaño necesario para
   coexistir. **Valida 2.3** (saciedad emergente sustituye a `handlingTime`).

### Matriz de coexistencia (seeds con ambos vivos, 8000 ticks)
```
            size 1000   1500   2000   2500
naive          0/3      1/3    1/3    3/3
gut            0/3      3/3    3/3    3/3     ← la saciedad ensancha la ventana
cover          0/3      1/3    2/3    3/3
gut+cover      0/3      3/3    3/3    3/3
```
### Confirmación a horizonte largo (20.000 ticks, size 2000)
- **gut+cover: 3/3 coexiste** (mínimos sanos 68-257) · naive: 1/3 (2 colapsan ~tick 800).
- El mecanismo emergente **persiste** a largo plazo; no es un transitorio de 8k.

### Comparación con el baseline (la vara de M0)
| | App ACTUAL (v1) | Spike M2 (emergente) |
|---|---|---|
| Coexistencia | ~3/8 seeds (cadena plena), cazador extinción-propenso | **3/3 seeds** (size≥2000, 20k) |
| Estabilizadores | 5 diales cableados (handlingTime/failDamage/fleeCap/refuge/preyBand) | **0 diales** (tripa + espacio) |
**→ Iguala/supera la coexistencia del baseline con CERO diales de balance.** La afirmación central de RC3 queda
**sostenida**: la coexistencia es consecuencia de la física (saciedad + espacio), no de constantes ajustadas.

## Caveats (honestidad — esto es un spike, no la validación final)
- **Coexistencia OSCILATORIA**, no plácida (CV 0.5-0.8): persiste con oscilaciones amplias pero acotadas (mínimos
  en cientos, no roza el 0 a size≥2000). Si esa oscilación es "bella/contemplativa" es cuestión de R6 (render, M5).
- **Dependiente del tamaño de mundo:** colapsa a size 1000 (sincronización/Allee) — coincide con la fragilidad del
  mundo pequeño del baseline. El modelo nuevo necesita mundo ≥1500-2000 a esta densidad/fuerza de depredador.
- **Conducta codificada a mano + parámetros físicos elegidos a ojo** (no evolucionados ni calibrados). El GO es
  "la física ecológica PUEDE producir coexistencia emergente robusta". Que sobreviva con **conducta evolucionada**
  (M6) y bajo calibración fina queda por confirmar.
- Probado a 20k (no 40k) y con un solo régimen de fuerza de depredador. El barrido muestra que la ventana de
  coexistencia es ancha (sizes 1500-2500), no un filo.

## Implicación para el roadmap
R1 (el riesgo que podía tumbar todo el rediseño) **retirado en dirección GO**. El kill-criterion mayor de 2.6 NO se
dispara. Se puede construir encima con confianza razonable. Próximos: **M1** (spike de coste R2) y **M3** (spike de
convergencia del genoma R3), antes de levantar la pila por capas (M4 leyes → …).
