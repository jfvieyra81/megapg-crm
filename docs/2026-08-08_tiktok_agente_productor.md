# TikTok — Agente Productor (paquete de producción) v1

El Agente Productor convierte una idea ya planeada en "Laboratorio de
Contenido" en un **paquete de producción** completo y editable: guion segundo
a segundo, lista de tomas, iluminación, audio, props, caption, checklists y
una nota de seguridad — todo listo para llevar a grabar.

## Qué hace

- En cada idea de "Ideas planeadas" (y también en "Ideas publicadas") aparece
  el estado del paquete — **Sin paquete**, **Borrador**, **Aprobado**,
  **Grabado** o **Publicado** — y un botón para crearlo o abrirlo.
- El paquete se genera a partir de los datos reales del plan (producto, tema,
  formato, gancho, CTA y el motivo basado en datos del Laboratorio). Ese
  motivo nunca se oculta: se muestra siempre en la parte de arriba del
  paquete junto a una hipótesis editable.
- Todo el contenido del paquete se puede editar libremente antes de
  aprobarlo: objetivo, audiencia, hipótesis, productos, duración, guion,
  tomas, iluminación, audio, props/vestuario/ubicación, instrucciones de
  edición, caption/CTA/hashtags y los dos checklists (antes de grabar y antes
  de publicar).
- El estado del paquete (Borrador → Aprobado → Grabado → Publicado) es
  independiente del estado del plan (Planeada/Publicada); José puede
  cambiarlo en cualquier momento desde los botones de estado.
- Sincronizar TikTok no borra ni modifica ningún paquete.

## Sin proveedor de IA (por ahora)

El proyecto todavía no tiene conectado ningún proveedor de IA (no hay
credenciales de OpenAI, Anthropic ni similar en ninguna función del
servidor). Por eso el botón **Crear paquete de producción** genera una
**plantilla profesional editable** con el tono de Maestro Flores (cercano,
energético, apetecible), basada en los datos del plan — sin llamar a ningún
servicio externo. José puede editar cada campo antes de aprobar el paquete.

Si en el futuro se conecta un proveedor de IA, la generación se haría desde
una Edge Function con la clave guardada solo en el servidor (nunca en el
navegador) — la estructura del paquete es la misma para ambos casos, así que
no se pierde nada de lo ya creado.

## Qué no hace

- No publica nada a TikTok directamente.
- No llama a ningún proveedor de IA externo (no hay uno conectado).
- No modifica la sincronización de TikTok, el OAuth ni ninguna Edge Function
  existente.

## Paso obligatorio: crear la tabla en Supabase

**Requiere haber corrido antes** `supabase/2026-08-08_tiktok_content_plans.sql`
(si el Laboratorio de Contenido ya funciona en el CRM, ya está corrido).

1. Abre el proyecto de Supabase de Dulce Sabor.
2. Ve a **SQL Editor** → **New query**.
3. Abre `supabase/2026-08-08_tiktok_production_packets.sql` en el repositorio.
4. Copia todo el contenido, pégalo en Supabase y presiona **Run**.
5. El resultado esperado es: `Success. No rows returned`.

La tabla está protegida con RLS: solo administradores del CRM pueden leer o
modificar los paquetes.

## Prueba de producción

**Antes de correr el SQL nuevo:**
1. Entra al CRM como administrador → **TikTok** → confirma que dice **CRM
   v5.35.0** arriba (si no, cierra y reabre la pestaña).
2. En "Ideas planeadas" (o crea una idea nueva desde el Laboratorio si no hay
   ninguna), cada tarjeta debe mostrar la nota amarilla "Activa el Agente
   Productor: ejecuta supabase/2026-08-08_tiktok_production_packets.sql" en
   vez de romperse. El resto del Laboratorio (recomendaciones, planear,
   marcar publicada) debe seguir funcionando normal.

**Corre el SQL** siguiendo los pasos de arriba.

**Después de correr el SQL:**
3. Refresca la página de TikTok. Cada idea planeada debe mostrar la etiqueta
   **Sin paquete** y el botón **Crear paquete de producción**.
4. Presiona **Crear paquete de producción**: se abre el paquete ya lleno con
   objetivo, hipótesis, guion, tomas, etc. La etiqueta cambia a **Borrador**.
5. Edita cualquier campo (por ejemplo el guion o el caption) y presiona
   **Guardar cambios**; refresca la página y confirma que el cambio se
   conservó.
6. Presiona el botón de estado **Aprobado**, luego **Grabado**, luego
   **Publicado**; confirma que la etiqueta junto al plan cambia cada vez y se
   mantiene después de refrescar.
7. Presiona **↻ Sincronizar**: el paquete y su contenido deben seguir
   presentes sin cambios.
