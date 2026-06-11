# Giro físico — que girar use los segmentos del cuerpo

> Ficha de idea · **estado: EN CURSO** (C hecho; B/A pendientes) · estudio 2026-06-11.
> Índice: [indice-ideas.md](indice-ideas.md).

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
- **B — AUTORIDAD de giro desde la palanca de los propulsores (PENDIENTE, recomendado).** Sin tocar el cerebro: el
  giro pasa a ser un **par físico** cuya fuerza máxima emerge de la palanca de las aletas laterales (área lateral ×
  brazo de momento, calculable de la geometría de nodos) + **inercia angular** (∝ masa·talla² → los grandes no giran
  de golpe, sobrepasan, contra-giran). Sustituye `turnRate` por algo emergente-de-la-forma con momento realista.
  Riesgo BAJO (cerebro intacto). Esfuerzo medio.
- **A — GIRO 100% emergente: el cerebro controla izq/der (PENDIENTE, arriesgado).** Cambiar las salidas motoras a
  "empuje izquierdo/derecho"; avance y giro emergen del batir asimétrico. Lo más real, pero **el cambio más
  arriesgado** (rehacer la semántica motora del cerebro + re-sembrar competente + re-verificar TODA la conducta;
  riesgo de nadar en círculos / colapso). Solo si se va a por todas con re-tuning del comportamiento.

## Siguiente paso sugerido
**B** (par físico con palanca + inercia) — emergente y de bajo riesgo.
