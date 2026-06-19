# Modo de coloreado "Natural + tejido" — **(Zenote 2)** · IMPLEMENTADO 2026-06-19

> Idea de usuario: nuevo modo que mezcle el color real (pigmento) con un % SUTIL del color del tejido.

`main.js drawOrgs`: modo `natmix` (selector "Natural + tejido"). El cuerpo va en el **pigmento heredado** (`hue`, como
Natural) y sobre cada nodo se superpone su color de tejido (`TCOL`) a **alpha 0.32** (tinte sutil de función) → se ve la
familia/pigmento con un matiz de anatomía. Mantiene motas, bordes y bloom. Render puro. Es el punto medio entre "Natural
(aspecto real)" (pigmento puro) y "Tejido + aura" (anatomía dominante). Forma parte del eje de fascinación
([[zenote2-render-data-contract]], docs/Zenote 2.0/ideas/color-textura-y-fascinacion.md).
