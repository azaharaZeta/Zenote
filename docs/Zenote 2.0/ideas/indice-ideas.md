# Input de Ideas de usuario Zenote 2.0

## Instrucciones
Este documento es el backlog de ideas de usuario sin procesar para Zenote 2.0
Sólo un humano puede incluir aquí ideas.
Al procesar este fichero, por cada idea listada aquí, crear su **fichero** `<idea>.md`  en la misma ruta que este fichero, y eliminar la entrada de esa idea de este listado. 
Aquí NO van ideas en curso, estados, ni análisis, ni histórico.
Documentar los análisis, estados e histórico de cada idea en curso en sus respectivos ficheros de idea.
Cuando una idea haya sido implementada o descartada, actualizar su fichero de idea y mover el fichero de idea a la carpeta `archivo` de la misma ruta que este fichero

## Ideas de usuario (pendientes de procesar)
- Fondo del abismo funcional (corrientes que arrastren, gradientes térmicos, zonas de peligro/refugio) 
- Las zonas dsplegables de la UI, remarcalas con algún marco
- Cadáveres CON FORMA que se desvanecen con su carroña (muerte visible; "A5" del estudio de color/fascinación).
- Detrito comestible: que los cadáveres (detritusM/E) sean ingeribles → nicho de CARROÑERO/descomponedor emergente, no solo herbívoro/cazador.
- Inspector al hacer clic en un organismo: genoma, linaje, edad, energía, oficio (verificar/completar si ya existe parcialmente).


## Ideas propuestas por Claude (para revisar por el humano; mover arriba las que aceptes)
Emergencia / realismo:
- r/K evolvable: hacer `reproE`/`investE` genes (cuánto acumular antes de criar y cuánto invertir por cría) → que el eje r/K (muchas crías baratas vs pocas caras) EMERJA (lo prometía el diseño 2.4; hoy son constantes).
- Barrera post-cigótica: cruzar linajes muy divergentes da crías menos viables (hoy el aislamiento es solo pre-cigótico; daría especiación más real).
- Homología compartida entre fundadores + preservar paralogía al duplicar módulos (hoy cada fundador/duplicado estrena marca → la recombinación entre linajes degenera).
- Día/noche activable como slider (ya existe `dayNightAmp`, a 0) → ritmos de actividad, ventaja para acumular reservas.

Fascinación / observación:

- Histograma en vivo de un gen seleccionable (size, photoCap, mouthCap…): ver la distribución derivar = prueba visual de la selección.
- Resaltar a los PARIENTES del organismo inspeccionado (mismo linaje/hue) → ver familias.
- Botón "capturar PNG" del lienzo (compartir el ecosistema).
- Gráfica de masa/talla media en el tiempo (con el bloat ya controlado, ver la talla evolucionar).

Técnico / robustez:
- CI real (GitHub Action) que corra `npm run test:zenote2` en cada push (hoy el gate se corre a mano).
- Promover spikes valiosos a tests de regresión del gate: uno "anti-bloat" (que falle si los generalistas grandes se disparan) y uno de balance trófico.
- Validar rendimiento en MÓVIL real (o viewport estrecho) con la población al tope; si hace falta, toggle de calidad (Baja: sin bloom/halos).