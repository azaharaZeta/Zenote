# Primordia — simulador de evolución emergente

## Qué es esto
Una aplicación web autocontenida (HTML/CSS/JS, sin backend) que simula un
ecosistema artificial donde el comportamiento y la morfología de los organismos
**emergen de la evolución** (herencia + mutación + selección), no de reglas
escritas a mano. El propósito es contemplativo: ver patrones emerger y fascinarse.

## Documentos de referencia (LÉELOS ANTES DE PROGRAMAR)
- `docs/SPEC_EVOLUCION.md` — reglas exactas de genética, mutación, selección,
  energética y rendimiento. **Es la fuente de verdad. No te desvíes de ella.**
- `docs/CONFIG.md` — todos los parámetros por defecto y rangos de genes.
- `docs/VISUAL.md` — estética, render y UI.

## Reglas innegociables
1. **Emergencia real.** Ninguna estrategia ("cazar", "huir", "pastar") puede estar
   codificada como if/else fijo. Toda conducta proviene de genes sujetos a
   selección. El programador define la física del mundo y la expresión de los
   genes; nunca qué genes son "buenos". Si dudas, relee SPEC sección 0 y 7.
2. **Rendimiento.** Miles de agentes a 30–60 ticks/s en el navegador. Obligatorio:
   spatial hashing (nada de O(n²)), typed arrays (SoA), Canvas 2D, sin
   asignaciones en el bucle caliente, lógica desacoplada del render. Ver SPEC §5.
3. **Belleza y fluidez.** Fondo oscuro, color = linaje, movimiento orgánico, UI
   discreta y ocultable. La fluidez es parte de la estética. Ver VISUAL.md.
   **Responsive obligatorio:** debe verse y usarse en móvil. La adaptación vive solo
   en la capa de render/UI (escalado del canvas, táctil); el mundo lógico y la
   simulación NO cambian con el tamaño de pantalla. Ver VISUAL.md §"Responsive y móvil".
4. **Configurable en vivo.** Los parámetros marcados *(UI)* en CONFIG.md deben ser
   sliders que afecten la simulación en tiempo real.
5. **Sin dependencias pesadas.** Vanilla JS preferido. Como mucho una librería
   ligera de gráficas; si la añades, justifícalo. Debe poder publicarse subiendo
   archivos estáticos.

## Pila técnica
- HTML + CSS + JavaScript vanilla (ES modules). Canvas 2D para el render.
- Sin framework ni bundler obligatorio. Si introduces uno, que el build siga
  produciendo estáticos desplegables en cualquier hosting (GitHub Pages, Netlify…).

## Plan de fases (construir incrementalmente y validar cada una)
- **Fase 1 — herbívoros:** mundo + recurso + organismos herbívoros con decisión
  reactiva parametrizada por genes + energética + reproducción asexual + mutación.
  Criterio: la distribución de algún gen deriva visiblemente (SPEC §7.1).
- **Fase 2 — carnívoros y combate:** activar dieta/agresión/combate. Criterio:
  oscilaciones depredador-presa y/o proto-especiación por dieta (SPEC §7.2–7.3).
- **Fase 3 — pulido visual y observación:** estelas, glow, histogramas en vivo,
  click-para-inspeccionar-genoma, modo contemplación, gradiente ambiental.
- **Fase 4 (opcional):** Web Worker para el motor; red neuronal diminuta como
  cerebro (pesos = genoma); reproducción sexual con especies por distancia genética.

Mantén cada fase funcionando y verificable en la UI antes de pasar a la siguiente.

## Estructura de archivos sugerida
Ver SPEC §5 (engine/, render/, ui/, main.js). Mantén el motor independiente del
render para poder moverlo a un Worker después.

## Cómo trabajar
- Empieza leyendo los tres docs. Resume tu plan antes de escribir código.
- Implementa Fase 1 completa y déjala corriendo y medida (muestra FPS y curva de
  población) antes de añadir carnívoros.
- Prioriza corrección de las reglas evolutivas sobre los efectos visuales.
- Comenta el código donde la física del mundo se traduce de los genes (la frontera
  entre "lo que define el programador" y "lo que evoluciona") para que sea auditable.
