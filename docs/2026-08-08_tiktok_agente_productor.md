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

## Exportar / imprimir PDF

Dentro de cada paquete abierto, arriba a la derecha, hay un botón
**Exportar / imprimir PDF**. Al presionarlo:

1. Se abre una ventana nueva con una versión limpia del paquete — sin
   botones, sin campos editables, sin navegación del CRM — lista para leer
   durante la grabación.
2. Esa ventana llama automáticamente al diálogo de impresión del navegador.
   Desde ahí José elige **Guardar como PDF** (para archivarlo o compartirlo)
   o lo manda directo a una impresora.
3. La exportación toma el contenido **tal como está en pantalla en ese
   momento**, incluyendo cambios que todavía no se hayan guardado con
   "Guardar cambios" — no pierde nada, pero tampoco guarda nada
   automáticamente: el paquete original sigue exactamente igual después de
   exportar.

La hoja de impresión incluye: nombre de Maestro Flores y título del plan,
fecha de exportación, estado del paquete, objetivo/audiencia/hipótesis,
producto principal y secundarios, duración y formato 9:16, el guion completo
segundo a segundo en tabla, tomas, iluminación, audio, ubicación/vestuario/
props, instrucciones de edición, caption/CTA/hashtags, los dos checklists y
la nota de seguridad. Está pensada para papel Carta con márgenes normales;
el navegador intenta no cortar una fila del guion o de tomas entre dos
páginas. Con un paquete de contenido normal, el PDF queda en **2 páginas**:
la nota de seguridad se acomoda justo después del checklist "Antes de
publicar", al final de la página 2. Si el paquete tiene mucho contenido
(guion muy largo, checklists muy largos, etc.), es normal que salga una
tercera página — nunca se recorta ni se oculta información para forzar que
quepa en menos páginas.

Si el navegador bloquea la ventana emergente, el CRM muestra un aviso pidiendo
permitir ventanas emergentes para el sitio y volver a intentarlo — no se pierde
ningún dato, solo hay que reintentar.

No se usó ninguna librería nueva para esto: es HTML normal impreso con la
función nativa `window.print()` del navegador.

**Para un PDF limpio:** en el diálogo de impresión de Chrome, bajo "Más
ajustes", desmarca la casilla **"Encabezados y pies de página"**. Si queda
marcada, Chrome agrega su propio encabezado/pie (con la URL, la fecha y el
título de la pestaña) en los márgenes de cada hoja — eso lo pone el
navegador, no el CRM, así que no se puede quitar desde aquí; solo se
desactiva desde esa casilla.

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
   v5.36.1** arriba (si no, cierra y reabre la pestaña).
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
8. Edita un campo del paquete (por ejemplo el caption) **sin** presionar
   "Guardar cambios", y presiona **Exportar / imprimir PDF**. Confirma que la
   ventana de impresión muestra ese cambio aunque no se haya guardado, que
   incluye el guion y los dos checklists completos, y que no aparece ningún
   botón ni menú del CRM. Elige "Guardar como PDF" en el diálogo del
   navegador para confirmar que se genera bien.
9. Cierra la ventana de impresión y confirma que el paquete en el CRM sigue
   editable y que su estado no cambió (exportar no guarda ni modifica nada).
10. Con un paquete de contenido normal, confirma en la vista previa de
    impresión que la nota de seguridad queda al final de la **página 2**
    (justo después del checklist "Antes de publicar"), no sola en una
    tercera página casi vacía. Confirma también que todo el contenido sigue
    presente y legible.
