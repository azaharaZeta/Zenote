# Morfología evolutiva por nodos — Capas 1-3

> Ficha de idea · **estado: HECHA** · 2026-06-10/11 · archivada (congelada).
> Índice: [../../ideas/indice-ideas.md](../indice-ideas.md) · Mecánica final (verdad): `SPEC_EVOLUCION.md` §2bis/§3.

## Contexto / problema
Poca variedad de cuerpos: el sembrado a `startDiversity=0` es renacuajo (cabeza+cola), el renacuajo base ya nada
bien (**selección estabilizadora**) y añadir un nodo era un **acantilado** (umbral duro `present≥0.5` + coste de
golpe en masa/arrastre/decoherencia de fase). Cada nodo era una elipse (`aspect` solo cambiaba la elongación) y el
movimiento era una sola oscilación. Objetivo: ver evolucionar alas/tentáculos/garras "como en la naturaleza",
por capas, sin if-else (la física usa las formas; la selección decide).

## Lo hecho (journey)

**Presencia GRADUADA + anclaje (2026-06-10).** `present` deja de ser on/off: banda `[0.4,0.6]`, el nodo aparece de
forma continua (peso 0→1 que escala su área → masa/arrastre/empuje), pleno ≥0.6. El render usa la misma banda → el
nodo **crece** al aparecer (`bodyplan.js` `presWeight`, `canvas.js`). Anclaje: el suelo del factor de distancia
hijo↔padre subió 0.4→0.85 → los hijos no quedan enterrados bajo el padre.

**Capa 1 — FORMA del nodo (`tipShape`).** Gen nuevo por nodo (genoma 169→177): afila a la punta (<0.5: púa/garra/
tentáculo) ↔ elipse (≈0.5) ↔ se abre (>0.5: aleta/paleta/ala). Física honesta y neutra en 0.5: abrir → +empuje
+arrastre; afilar → −empuje, −arrastre, +alcance. Coefs `loco.tipThrust/tipDrag/tipReach`. Render: silueta
paramétrica en `drawNode` (`silPath`). Test `tipShape` 6/6. Verificado en preview (púa/elipse/aleta).

**Capa 2 — FUNCIONES ecológicas.**
- *Alcance de captura morfológico:* apéndices FRONTALES extienden el radio de caza (`plan.fwdReach` →
  `sim.morphReach` → combate `sim.js`; `combat.morphReach`). Cuesta nado (`gait<0`) → solo rentabiliza al
  depredador → garras/tentáculos al frente emergen en carnívoros. Test 5/5.
- *Pastoreo por anchura:* el pasto escala con la anchura del cuerpo (baja elongación), `absEff·(1+k_grazeWide·
  anchura)`; cuerpos anchos pastan más. La MISMA elongación tira de herbívoros (anchos) y carnívoros
  (aerodinámicos) a formas opuestas. Test 3/3.
- *Maniobra:* ya emergente vía `turnRate`/persecución; sin lever nuevo.

**Capa 3 — MODO de movimiento (`gaitMode`).** Gen nuevo por nodo (genoma 177→185): 0 ondular ↔ 1 aletear. Aletear
da +empuje lateral (`effFlap=1+flapGain·m·sin²emit`) y +arrastre; **coste energético** del golpe activo
(`flapCost=k_flap·flapWork` multiplica el coste de nado) → trade-off honesto crucero↔ráfaga. Render: batido rápido,
amplio, asimétrico y desacoplado de la onda del cuerpo. Tests gaitMode 6/6 + flapCost 5/5. Verificado en preview.

## Resultado / observaciones
La diversidad morfológica se abrió de verdad (mariposas de aletas, cazadores con apéndices, etc.). La
**especialización la destraba `diet.omniPenalty`** (subido a 0.05): a 0, los omnívoros arrasan y la morfología no
diverge (ver memoria `omnipenalty-gates-specialization`).

## Pendiente (sigue en el índice, no aquí)
Afinar pesos morfológicos (`tip*`, `flap*`, `morphReach`, `k_grazeWide`, `k_flap`) observando la evolución ·
apiñamiento de hermanos (nodos con mismo `parent`+`emit`) · selección de presa por talla · entradas del cerebro.
