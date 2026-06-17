# Giro físico — que girar use los segmentos del cuerpo

> Ficha de idea · **estado: C+B HECHOS** (2026-06-17); A queda como opción futura (arriesgada) · estudio 2026-06-11.
> Índice: [indice-ideas.md](indice-ideas.md) · Mecánica de B: `SPEC_EVOLUCION.md` §2bis (`loco.angInertia`).

## Idea
Hoy el giro es **cinemático**: el rumbo rota hacia el deseo del cerebro un máx. `turnRate`/tick (emerge de la forma,
`organism.js`), pero el cuerpo no "hace" nada para girar. Que girar sea un **acto físico** con los propulsores
(remar/aletear asimétrico), emergente de la forma, sin if-else. Asimetría DINÁMICA (modulada momento a momento, no
estática — un cuerpo torcido giraría en círculos siempre).

## Tres niveles estudiados
- **C — SEÑAL VISUAL del remado. HECHO (2026-06-11).** Solo render: al girar (mirada `face` ≠ rumbo) las aletas
  LATERALES se inclinan asimétricamente hacia el giro pretendido (`canvas.js`, `turnLean = (gaze−heading)·0.5`).
  Recto → simétrico. NO toca la física. Verificado en preview (izq/der espejo). *Matiz:* usa mirada−rumbo
  (intención) → un bicho que HUYE mirando a la amenaza también se inclina (maniobra, dirección aproximada). Si se
  quiere fiel al giro real, cambiar a delta de rumbo entre frames. Ganancia 0.5 tuneable.
- **B — INERCIA ANGULAR. ✅ HECHO (2026-06-17).** Sin tocar el cerebro: el giro pasa a tener **momento** — una vel.
  angular `omega` (estado nuevo en `sim.js`) se acerca al objetivo (`turnRate·error`, capado a ±`turnRate`) con lag
  `angResp = 1/(1+angInertia·max(0,masa−1))` (en `organism.js`) → los grandes/complejos tardan en girar y sobregiran/
  contragiran; los ligeros giran casi al instante. `turnRate` se conserva como TECHO de agilidad (la palanca de las
  aletas no se modeló aparte: la agilidad ya emergía de la forma vía turnAsym/size/elong/segTurn). Nuevo `loco.angInertia`
  (UI «Inercia de giro», def 0.5; =0 → modelo previo). **Medido:** faithful (=0 ≈ baseline), estable (|omega|≤turnRate),
  ecológicamente seguro (6/6 seeds, diversidad comparable). Cerebro intacto, esfuerzo medio. ✓
- **A — GIRO 100% emergente: el cerebro controla izq/der (PENDIENTE, arriesgado).** Cambiar las salidas motoras a
  "empuje izquierdo/derecho"; avance y giro emergen del batir asimétrico. Lo más real, pero **el cambio más
  arriesgado** (rehacer la semántica motora del cerebro + re-sembrar competente + re-verificar TODA la conducta;
  riesgo de nadar en círculos / colapso). Solo si se va a por todas con re-tuning del comportamiento.

## Siguiente paso sugerido
**B** (par físico con palanca + inercia) — emergente y de bajo riesgo.
