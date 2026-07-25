# Reconciliación histórica de pedidos web — por qué hay 13 sin vínculo

**Fecha de la decisión:** 2026-07-24
**Estado:** cerrado. Los 13 registros quedan **sin vínculo de forma permanente**.
**Decisión tomada por:** José, tras revisar el precheck y las 4 consultas forenses.

---

## 1. Qué son esos 13 registros

En la tabla `web_orders` hay **13 pedidos** con `status = 'imported'` para los que
**no existe forma verificable de saber a qué pedido del CRM corresponden**.

No son un error nuevo, ni datos corruptos, ni un defecto del diseño actual. Son
la huella que dejó el flujo de importación viejo.

## 2. Por qué existen — la causa técnica

El flujo viejo ([`src/components/WebOrders.tsx`](../src/components/WebOrders.tsx),
función `importOrder`) hacía **cuatro escrituras independientes desde el
navegador**, sin transacción:

1. crear/reusar el cliente,
2. crear el pedido del CRM,
3. descontar inventario,
4. marcar el `web_order` como `imported` (una llamada REST **separada**).

El problema: **el paso 4 no guardaba el vínculo de forma persistente**. Marcaba
el pedido web como importado, pero la tabla `orders` no conservaba una
referencia fiable al `web_order` de origen.

Concretamente, en producción se verificó que **ningún** pedido del CRM contiene:

- el campo `webOrderId`,
- el campo `web_order_id`,
- ni `source = 'web_order'`.

El código llegó a escribir `webOrderId` en versiones posteriores, pero **esos 13
se importaron antes**, con una versión que no lo hacía. La relación existió en
su momento, en la cabeza de quien importó, pero nunca quedó escrita en la base.

## 3. Por qué NO fueron enlazados

Se construyó un reporte forense (archivado en
[`sql/archive/`](../sql/archive/README.md)) que buscó candidatos por cuatro
señales independientes: **vínculo en el texto de las notas**, **teléfono
normalizado**, **total** y **fecha**. El resultado fue concluyente en el sentido
contrario al que se esperaba:

> **Los datos no contienen evidencia suficiente para demostrar que un pedido del
> CRM corresponde a un pedido web determinado.**

Ningún algoritmo puede cerrar esa brecha, porque las señales disponibles son
ambiguas por naturaleza:

| Señal | Por qué no basta |
|---|---|
| **Teléfono** | Liga al **cliente**, no al **pedido**. Un cliente con cinco pedidos produce cinco candidatos igual de válidos. |
| **Total** | Los precios de lista cambiaron y `web_orders.items` **no guarda el precio vigente** al momento del pedido. Caso real confirmado: 5 × `slaps-tam` + 5 × `slaps-app` con total `375`, cuando al precio actual serían `400`. Un total que no cuadra no descalifica, y uno que cuadra puede ser coincidencia. |
| **Fecha** | El pedido del CRM se creaba con la fecha de **importación**, no la del pedido. Y existe un bug de zona horaria conocido (pedidos después de ~5pm PT se guardan con la fecha del día siguiente), así que **un día de diferencia puede ser un artefacto**. |
| **Productos** | Solo se compara el **conjunto** de productos, no las cantidades. Dos pedidos de tamaño muy distinto pueden verse idénticos en esta señal. |
| **Notas** | La señal más fuerte (el flujo viejo escribía `Importado de pedido web {id}` en las notas), pero es **texto libre**: pudo editarse a mano después. |

Además, la Consulta 4 mostró que **varios pedidos web históricos apuntan al
mismo pedido del CRM** (`ORDER_SHARED_BY_WEBORDERS`). Un pedido del CRM solo
puede pertenecer a uno. Eso confirma que las señales, por sí solas, producirían
relaciones incorrectas.

### El dato que cierra el argumento

Medido el 2026-07-24: la tabla `orders` tiene **10 filas en total**, contra
**13 pedidos web** marcados `imported` que hay que explicar.

- **Aritméticamente, al menos 3 de los 13 no pueden tener un pedido propio** en la
  nube — y menos aún, porque no todos esos 10 pedidos vinieron de importaciones
  web (varios se capturaron a mano).
- Con un conjunto de candidatos tan chico, que dos pedidos compartan cliente,
  monto o fecha cercana **no dice casi nada**: el solapamiento es inevitable.
- Sugiere que **varias de esas importaciones nunca llegaron a persistir** en la
  nube, lo cual es coherente con que el flujo viejo hacía cuatro escrituras
  independientes sin transacción.

Es decir: no es que el algoritmo no haya sabido encontrar el vínculo. Es que en
buena parte de los casos **el pedido del CRM no existe** para encontrarlo.

### La decisión

**No implementar reconciliación automática.** Vincular mal es peor que no
vincular: un vínculo incorrecto contamina para siempre el historial del cliente
equivocado, y nadie volvería a revisarlo. Dejar el hueco visible es honesto y
reversible; inventar el dato no lo es.

## 4. Qué NO afecta

Que estos 13 queden sin vínculo **no tiene ningún efecto** sobre:

- **Inventario** — ya se descontó en su momento, cuando se importaron.
- **Ventas y totales** — los pedidos del CRM existen y cuentan normalmente.
- **Clientes** — los clientes se crearon y siguen ahí.
- **Comisiones** — se calculan sobre los pedidos del CRM, no sobre `web_orders`.
- **Importaciones futuras** — quedan protegidas por la RPC transaccional y el
  índice único (ver [diseño](../supabase/2026-07-24_DISENO_import_web_order.md)).

El único efecto es de **trazabilidad histórica**: no se puede responder "¿qué
pedido del CRM salió de este pedido web de mayo?" para esos 13 casos.

## 5. Clasificación de los casos

| Clasificación | Significado | Acción |
|---|---|---|
| `LEGACY_UNRECONCILED` | No hay ningún candidato: ni notas, ni teléfono, ni total, ni fecha. No reconciliable con los datos disponibles. | Ninguna. Estado final. |
| `PENDIENTE_REVISION_MANUAL` | Hay un candidato, pero la evidencia no es concluyente. | Revisión humana, solo si aparece un motivo de negocio. |

Dos casos concretos quedaron como `LEGACY_UNRECONCILED` por ausencia total de
evidencia: **`wo_moukr81xo3yc4`** y **`wo_mou8j8yfo5bu8`**.

> Se identifican por `web_order_id` a propósito, por minimización de datos: los
> nombres comerciales de los clientes no se versionan en la documentación. Para
> ver de qué negocio se trata, consultar la columna `negocio` de
> `public.vw_web_orders_pending_reconciliation`.

Un caso con `score = 7` (mismo teléfono y mismos productos, pero **total
distinto**) queda como `PENDIENTE_REVISION_MANUAL`: el score alto no es prueba,
y la diferencia de total es exactamente la clase de discrepancia que los precios
históricos explican pero no permiten confirmar.

## 6. Cómo consultarlos hoy

No hace falta volver a correr las consultas forenses. Hay una vista permanente:

```sql
select * from public.vw_web_orders_pending_reconciliation;
```

Devuelve, por cada pedido web pendiente: `web_order_id`, `negocio`, `fecha`,
`total`, `status`, el **mejor candidato** (si existe), su `score`, y el `motivo`
(`LEGACY_UNRECONCILED` o `PENDIENTE_REVISION_MANUAL`) con su explicación.

⚠️ `mejor_candidato_order_id` y `score` son **heurísticos**. La vista los muestra
para orientar a una persona, **no** para autorizar un enlace.

## 7. Cuándo SÍ sería apropiado enlazar uno a mano

Solo si aparece evidencia **externa a estas señales**, y caso por caso. Ejemplos
de evidencia que sí alcanzaría:

- **Confirmación directa del cliente** (una conversación de WhatsApp donde se ve
  el pedido, su fecha y su monto, que calza sin ambigüedad con un pedido del CRM).
- **Un comprobante físico o digital** (recibo, foto de la nota de entrega) que
  identifique el pedido del CRM y el pedido web al mismo tiempo.
- **Memoria específica y verificable de José** sobre ese pedido concreto, no una
  reconstrucción a partir de los mismos datos ambiguos.
- **`notes_contains_exact_web_order_id = true` + un solo candidato + revisión
  visual** de que las cantidades y el cliente calzan. Esta es la única señal del
  reporte que se acerca a ser determinista, pero sigue requiriendo confirmar que
  el texto no se editó y que no hay un segundo candidato reclamando el mismo id
  (categoría `EXACT_NOTE_LINK_MULTIPLE_ORDERS`).

### Condiciones obligatorias si algún día se enlaza uno

1. **Nunca en lote.** Un caso por vez, con su justificación escrita.
2. **Nunca por score.** El score ordena, no decide.
3. **Verificar antes que el pedido del CRM no esté ya reclamado** por otro pedido
   web (el índice único `orders_web_order_id_uq` lo rechazaría, pero el error de
   criterio ya estaría cometido).
4. **El SQL de reconciliación sería un archivo aparte**, con lista cerrada de ids
   explícitos, su propio rollback y aprobación explícita. Nunca parte de una
   migración ni de un proceso automático.
5. **Escribir el vínculo en `web_orders.processed_order_id`** (traza de auditoría)
   y/o en `orders.data->>'webOrderId'` (fuente autoritativa, protegida por el
   índice único).

## 8. Referencias

| Documento | Contenido |
|---|---|
| [`supabase/2026-07-24_DISENO_import_web_order.md`](../supabase/2026-07-24_DISENO_import_web_order.md) | Diseño de la RPC transaccional y de la idempotencia. |
| [`supabase/2026-07-24_PLAN_RECONCILIACION.md`](../supabase/2026-07-24_PLAN_RECONCILIACION.md) | Hoja de trabajo y criterios de clasificación usados en la revisión. |
| [`sql/archive/README.md`](../sql/archive/README.md) | Consultas forenses archivadas (solo lectura, fuera del flujo normal). |
| [`supabase/2026-07-24_view_pending_reconciliation.sql`](../supabase/2026-07-24_view_pending_reconciliation.sql) | Definición de la vista de soporte. |
