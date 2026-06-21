# Input de Ideas de usuario — Zenote 2.0

## Cómo funciona este backlog (CICLO DE VIDA de una idea) — LEER ANTES DE EDITAR
Este fichero es **solo el backlog de ideas SIN PROCESAR**. Reglas estrictas para no ensuciarlo:

1. **El índice solo lista ideas sin procesar, en TEXTO BREVE** — una línea por idea, el enunciado y nada más:
   sin análisis, sin estado, sin histórico, sin detalle. (Todo eso vive en la ficha de la idea, no aquí.)
2. **Solo un HUMANO añade ideas en la sección "Ideas de usuario".** Claude puede sugerir en la sección de
   "Ideas propuestas por Claude" (zona de staging para que el humano las suba; no es el backlog real).
3. **Cuando una idea EMPIEZA a procesarse** (se analiza / se le da ficha): se **QUITA de este índice** y se crea su
   fichero propio `<idea>.md` en **esta misma carpeta** (`docs/Zenote 2.0/ideas/`). El análisis, el estado y el
   histórico van en ESE fichero, nunca aquí.
4. **Cuando una idea se TERMINA (implementada) o se DESCARTA**: se actualiza su fichero con el estado final y se
   **MUEVE a `archivo/`** (subcarpeta de esta misma ruta).
5. **Al archivar, los temas pendientes que deja la idea** (su "siguiente acción"):
   - si son **simples / sin analizar** → se añaden como idea(s) BREVE(s) en este índice (para procesar luego);
   - si ya están **analizados / son complejos** → van directamente a su propio fichero `<idea>.md` (NO al índice).
6. **Corolario:** una idea que YA tiene fichero (en esta carpeta o en `archivo/`) **NO aparece en este índice**.
   Si la ves listada aquí y ya tiene fichero, es un error de mantenimiento → quítala.

---

## Ideas de usuario (pendientes de procesar)
> Solo un humano edita esta sección. Texto breve; el detalle se desarrolla al crear la ficha.

- Sembrado inicial / slider de **Diversidad Inicial**: revisar cómo se calcula. En diversidad 0 todos los organismos
  idénticos; creciente = diferencias crecientes por organismo; 1 = diferencias amplias. Analizar qué parámetros necesitan
  un mínimo de viabilidad (¿fijos o con algo de random?) vs los independientes (color → random total). Proponer alternativa.
- **Ventana de información de organismo**: dibujar el organismo dentro de la ventana; seguir SIEMPRE con cámara (eliminar el
  botón "seguir cámara"); si el organismo muere, dejar fijo el dibujo de su cadáver hasta cerrar el visor o cambiar de organismo.
- **UI "Colorear por"**: dejar por defecto "Natural + Tejido" y llamarlo solo "Natural", con un slider de "nivel de coloreado de
  tejido" (hoy hardcodeado); eliminar "Natural (aspecto real)" y "Tejido + Aura"; renombrar "Oficio + aura real" → "Oficio".

---

## Ideas propuestas por Claude (staging — el humano las sube arriba si las acepta)
Emergencia / realismo:
- Día/noche activable como slider (ya existe `dayNightAmp`, a 0) → ritmos de actividad, ventaja por acumular reservas.

Técnico / robustez:
- Validar rendimiento en MÓVIL real (o viewport estrecho) con la población al tope; si hace falta, toggle de calidad (Baja: sin bloom/halos).
