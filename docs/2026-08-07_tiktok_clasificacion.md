# TikTok — Clasificación de videos (base v1)

**Fecha:** 2026-08-07 · **CRM:** v5.31.0
**Alcance:** tabla nueva + interfaz admin para clasificar videos ya
importados. No toca `tiktok_accounts`, `tiktok_videos` ni la Edge Function
`tiktok-sync` — cero riesgo para la sincronización existente.

## Qué se agregó

1. **`supabase/2026-08-07_tiktok_video_classifications.sql`** — tabla nueva
   `tiktok_video_classifications` (1 fila opcional por video, relación 1:1 con
   `tiktok_videos`), con: `product_id`, `theme` (tema), `format` (formato),
   `hook` (gancho inicial), `cta` (llamada a la acción), `tags` (etiquetas,
   arreglo de texto). RLS admin-only, mismo patrón que el resto de TikTok
   Intelligence.
2. **`src/components/TikTok.tsx`** — cada video de la lista ahora tiene un
   botón **Clasificar / Editar**. Al abrirlo aparece un formulario con los 6
   campos de arriba; **Guardar clasificación** hace upsert a la tabla nueva.
   El resumen (producto · tema · formato · etiquetas) se muestra debajo del
   título del video una vez guardado.
3. **`src/App.tsx`** — el tab TikTok ahora recibe el catálogo de productos
   (`products={PRODUCTS}`) para poblar el selector de "Producto".

## Paso 1 — Correr el SQL (Jose, en Supabase)

1. Entra a **Supabase Dashboard → SQL Editor**.
2. Abre el archivo `supabase/2026-08-07_tiktok_video_classifications.sql`,
   copia todo el contenido y pégalo.
3. Dale **Run**. Es seguro volver a correrlo si hace falta (no borra nada).

## Paso 2 — Probar en producción (después del deploy)

No hay pruebas locales de login (el magic link no funciona en localhost), así
que la prueba real es en `megapg-crm.vercel.app` ya con la versión desplegada:

1. Entra con tu cuenta de administrador.
2. Ve al tab **TikTok**. Deben seguir apareciendo los mismos videos de
   siempre (la sincronización no cambió).
3. En cualquier video, dale **Clasificar**.
4. Llena Producto, Tema, Formato, Gancho inicial, Llamada a la acción y
   Etiquetas (separadas por coma, ej. `picante, verano, promo`).
5. Dale **Guardar clasificación** — el panel se cierra y bajo el título del
   video debe verse el resumen (producto en negritas, tema, formato,
   etiquetas como chips).
6. Refresca la página (F5) y confirma que la clasificación sigue ahí
   (se leyó de Supabase, no de memoria local).
7. Vuelve a abrir el mismo video con **Editar**, cambia un campo y guarda de
   nuevo — debe actualizar la misma fila, no crear una segunda.
8. Confirma que **↻ Sincronizar** sigue funcionando igual que antes (trae
   videos nuevos de TikTok sin afectar las clasificaciones ya guardadas).

## Deuda / siguiente paso natural

- `format` y `tags` son texto libre — sin catálogo fijo todavía. Si con el
  tiempo aparecen valores repetidos, se puede convertir a un selector con
  opciones fijas en un pase aparte.
- No hay vista de "todos los videos sin clasificar" ni filtro por
  producto/tema — es la base de datos; la capa de análisis/reportes es
  trabajo futuro, fuera de este bloque.
