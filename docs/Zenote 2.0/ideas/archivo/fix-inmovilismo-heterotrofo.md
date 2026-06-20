# Análisis y fix: inmovilismo en heterótrofos

**Estado: RESUELTO (2026-06-20).** Análisis pedido por el usuario ("inmovilismo en heterótrofos, debería ser residual").

## Síntoma
Los heterótrofos (que deberían moverse a cazar) estaban quietos. Medido: no eran cazadores — eran sésiles **sin músculo**
(thrust≈0, vmax≈0) que fotosintetizaban y atrapaban presa/carroña **pasivamente** al contacto. No podían moverse.

## Causa raíz (anterior a la carroña)
La **fotosíntesis es una vía de escape universal**: disponible para todos (incluso los de boca) y `photoMotionK` premia la
quietud → sentarse a fotosintetizar gana a cazar. Además se **sobreinvertía en foto** (photoCap 80-130 con saturación
`photoHalf`=40) → todo el presupuesto de partes iba a foto, sin dejar para boca/músculo. `eDensity=4` (de #4) lo agravó (masa
cara al nacer → músculo podado a 0).

## Prototipos descartados
- **A — captura exige acercarse** (`huntCloseMin`): NO robusto (multi-seed: ayuda 2/5, empeora 2/5 — al gatear la caza sueltan
  la boca y siguen sentados; la foto es la red de escape). Flag inerte (=0) queda en config por si se combina luego.
- **Bajar luz**: mata todo (mundo 100% dependiente de foto).
- **photoMotionK=0**: ×4 movimiento pero baja pop y no crea cazadores (siguen photo-dependientes).

## Fix adoptado (robusto, físico)
**`photoHalf` 40→4** (la foto satura con poca inversión → libera presupuesto → muchos más con boca y músculo) + **`eDensity` 4→0**
(eD>0 encarecía el músculo). Se mantuvo `photoMotionK`=2 (estética planta-sésil). Medido (3 seeds, robusto): el mundo pasa de
~86% a ~37% quieto; en la config del usuario (seed100/div0): pop 71→568, quietos 99%→55%, organismos con boca 5→189 y se mueven.

**Coste:** eD=0 deja el nicho carroñero (#4) DORMIDO (carroña energéticamente pobre; mecanismo/sensor/cadáveres siguen). Tensión
inherente: carroña con energía (eD>0) ⟷ cazadores móviles (músculo barato, eD bajo) — no se pueden tener ambos (conservación).

## Verificación
Gate 8/8 (dorado `0xa51bdfd6`); conservación/saturación/viabilidad intactas. Preview: mundo vivo y diverso, con cazadores
elongados con ojos (antes inexistentes). Herramientas: `spikes/het-immobility/` (probe, photo-saturation, combo, etc.).

## Si se quiere empujar más (no hecho)
Bajar `photoMotionK` a ~0.5 (caza 26%, mundo 70% en movimiento) pero se pierde la sesilidad planta de los autótrofos.
