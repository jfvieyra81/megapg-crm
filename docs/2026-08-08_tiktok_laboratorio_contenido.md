# TikTok — Laboratorio de Contenido (v1)

El Laboratorio de Contenido convierte las clasificaciones y métricas de TikTok
en tres recomendaciones prácticas. José puede marcar cada recomendación como
**Planear** y, cuando ya se publicó, marcarla como **Publicada**.

## Qué hace

- Calcula las recomendaciones desde los productos, temas y formatos con mejor
  interacción entre los videos clasificados. Si todavía no hay suficiente
  información clasificada (ningún producto, tema o formato con datos), el
  Laboratorio no inventa recomendaciones: pide clasificar más videos.
- Guarda los planes por separado de los videos sincronizados; sincronizar
  TikTok no puede borrar un plan.
- Muestra los productos recomendados, el gancho, la llamada a la acción y el
  motivo basado en los datos actuales. Cuando no hay suficiente historial
  detrás de una idea puntual, lo dice explícitamente en vez de mostrar una
  cifra inventada.
- Mantiene una lista de ideas planeadas y publicadas.
- Evita duplicados de forma confiable: cada idea tiene una huella (`idea_key`)
  calculada a partir de sus productos, tema, formato y gancho — no del texto
  del título. La base de datos tiene una restricción `UNIQUE` sobre esa huella,
  así que "Planear esta idea" es seguro aunque José haga doble clic o tenga
  dos pestañas abiertas: el segundo intento no crea una fila repetida.

## Qué no hace todavía

- No publica directamente a TikTok.
- No vincula automáticamente un plan con el video publicado. Ese vínculo se
  añadirá después de tener varios planes reales y una forma confiable de
  identificar el video correspondiente.
- No usa un modelo de IA externo aún: las tres sugerencias son transparentes
  y salen de las métricas reales del CRM.

## Paso obligatorio: crear la tabla en Supabase

1. Abre el proyecto de Supabase de Dulce Sabor.
2. Ve a **SQL Editor** → **New query**.
3. Abre `supabase/2026-08-08_tiktok_content_plans.sql` en el repositorio.
4. Copia todo el contenido, pégalo en Supabase y presiona **Run**.
5. El resultado esperado es: `Success. No rows returned`.

La tabla está protegida con RLS: solo administradores del CRM pueden leer o
modificar los planes.

## Prueba de producción

1. Entra al CRM como administrador → **TikTok**.
2. Bajo el análisis aparecerá **Laboratorio de Contenido** con tres ideas.
3. Presiona **Planear** en una idea; debe aparecer en “Ideas planeadas”.
4. Presiona **Marcar publicada**; debe moverse a “Publicadas”.
5. Actualiza la página y confirma que conserva su estado.
6. Presiona **Sincronizar**: los planes deben seguir presentes.
