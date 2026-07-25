# Diseño técnico — `public.import_web_order` (Sprint 1A, Checkpoint 2)

**Fecha:** 2026-07-24 · **Rama:** `sprint/web-order-idempotency`
**Estado:** DISEÑO APROBADO CON AJUSTES (rev. 3) — no implementado, no committeado.
Requiere aprobación de este documento antes de Checkpoint 3.

> Este documento NO ejecuta nada. Es la especificación para revisar y aprobar.
> **No existe entorno de staging:** hay un solo proyecto Supabase (producción).
> Checkpoint 3 solo *escribe* los archivos SQL; no los ejecuta (ver §18).

### Cambios de la revisión 3 (decisiones de José, 2026-07-24)
1. **`web_orders.total` es el total comercial autoritativo.** `orders.data.total`
   guarda `web_orders.total` **tal cual**. El descuadre de precios NO hace
   rollback: se reporta en `pricingWarnings` (`ORDER_TOTAL_MISMATCH`). Motivo:
   web_orders históricos no coinciden con el precio de lista actual y
   `web_orders.items` no conserva el precio vigente al crearse (§9-bis, §6-val, §10).
2. **No existe staging** (§18): un solo proyecto Supabase (producción). Los 3
   archivos SQL se escriben pero **no se ejecutan**; nada se aplica a producción;
   el precheck es **solo lectura**. Prohibido afirmar que se probó en staging.
3. **El rollback CONSERVA las columnas `processed_*`** (§14). Elimina la función y
   los índices, pero **no** borra `processed_order_id`/`processed_at`/`processed_by`
   ni sus datos, para no perder auditoría de imports ya realizados. El rollback es
   por lo tanto intencionalmente **no-simétrico** respecto a la migración (que sí
   agrega esas columnas). Retirarlas sería una migración aparte y deliberada.

### Cambios de la revisión 2 (decisiones de José, 2026-07-24)
1. Firma final: `(p_web_order_id, p_order_id, p_new_client_id, p_items, p_deltas)`. Se elimina `p_client`.
2. El cliente se crea **exclusivamente** desde la fila bloqueada de `web_orders` (no desde el frontend).
3. Stock insuficiente: se conserva `greatest(0, stock-delta)` + se reporta en `inventoryWarnings`.
4. Fila de inventory inexistente ⇒ **error `INVENTORY_PRODUCT_NOT_FOUND` + rollback total**.
5. IDs los pasa el frontend (`p_order_id`, `p_new_client_id`); la idempotencia real la garantiza el índice único parcial.
6. Batería de validaciones server-side (no se confía en total ni en datos de cliente del frontend).
7. Aclaración histórica: intención del código vs. datos realmente persistidos en producción.
8/9/10. Seguridad, concurrencia determinista y forma de la respuesta fijadas.

---

## 0. Resumen ejecutivo (leer esto primero)

Hoy la importación de un pedido web hace **4 escrituras independientes desde el
navegador** (crear cliente → crear pedido → descontar inventario → marcar
`imported`), sin transacción. Si falla a la mitad, o si se hace doble clic, o si
dos dispositivos importan a la vez, quedan **duplicados** y/o inventario mal
descontado. La RPC transaccional cierra ese hueco.

**Los dos bloqueadores del rev. 1 están resueltos por decisión de José:**
- La RPC recibe items ya "preciados" (`p_items`) y deltas de inventario
  (`p_deltas`) del frontend, porque el catálogo (precio/costo/bolsas) vive solo
  en el frontend (`PRODUCTS`, catalog.ts) y no en la DB. **Arquitectura aprobada.**
- Stock insuficiente: **clamp a cero + advertencia** (no rechaza). Fila de
  inventory inexistente: **rechaza con rollback**. **Decidido.**

Reparto de responsabilidades:
- **Frontend** (único con el catálogo): arma `p_items` con snapshot
  (`priceAtSale`/`costAtSale`/`unit`) y `p_deltas` (`casesUsed` por producto).
- **RPC** (única con la transacción): valida, resuelve cliente **desde
  `web_orders`**, crea pedido, descuenta inventario, marca `imported`, todo
  atómico e idempotente.

**El total del pedido es `web_orders.total` (autoritativo).** La RPC recalcula
`Σ(priceAtSale·qty)` desde `p_items` solo para **detectar** descuadres y avisarlos
en `pricingWarnings`, pero **guarda `web_orders.total`** en `orders.data.total`.
El descuadre NO hace rollback (los pedidos históricos usaron precios que hoy no
podemos reconstruir).

---

## 1. Archivos del repositorio encontrados y flujo actual

| Archivo | Rol en el flujo actual |
|---|---|
| [src/components/WebOrders.tsx](src/components/WebOrders.tsx) | Inbox de pedidos web. `importOrder()` (líneas 88–173) hace TODO el trabajo client-side sin transacción. `updateStatus()` (73–86) hace el PATCH a `web_orders`. |
| [src/lib/business/orders.ts](src/lib/business/orders.ts) | Helpers canónicos del flujo normal: `buildOrderItems` (27), `orderTotal` (42), `orderCost` (49), `applyInventory` (57), `buildOrder` (90). **`WebOrders.tsx` NO los usa** — duplica la lógica inline. |
| [src/lib/catalog.ts](src/lib/catalog.ts) | Catálogo estático `PRODUCTS` (49–79) y helpers `unitPrice` (124), `unitCost` (129), `casesFor` (134), `TIER_DISC` (86). **Todo esto es frontend-only, no está en Postgres.** |
| [src/types/domain.ts](src/types/domain.ts) | Tipos `Order`/`OrderItem` (117–158), `Client` (42–75), `SaleUnit` (115), `WebOrder`/`WebOrderItem` (~314). |
| [src/App.tsx](src/App.tsx) | `serializeForCloud` (262–270): serialización a columnas + `data jsonb`. `authedHeaders` (336) / `authLookupAppUser` (400): auth. |
| `supabase/2026-07-13_rls_fase3_candado.sql` | Define `public.is_app_user()` (21–29). Patrón `SECURITY DEFINER` + `set search_path to 'public'` a copiar. |

### Cómo importa HOY `importOrder()` (WebOrders.tsx:88–173), paso a paso

1. **Cliente** (92–111): normaliza teléfono (`normPhone`, 10 díg → antepone "1"),
   busca en `clients` en memoria por teléfono. Si no existe, crea `{ id: uid(),
   name, contact, phone, address, tier:"Lista", notes, created, source:"web" }` y
   persiste con `saveAll("clients", …)`.
2. **Items** (113–126): filtra `wo.items` a los que tengan `productId` con match
   en catálogo (`pF`). Pregunta/aborta si hay productos sin match.
3. **Total** (128–131): `disc = TIER_DISC[client.tier]`; `sub = Σ price*qty`;
   `total = sub*(1-disc)`. Precio de catálogo actual, cálculo inline (no `orderTotal`).
4. **Pedido** (134–148): crea `Order` con `items: [{productId, qty}]`
   **sin `unit`/`priceAtSale`/`costAtSale`**, `source:"web"`, `webOrderId: wo.id`.
   Persiste con `saveAll("orders", …)`.
5. **Inventario** (150–157): `stock = max(0, stock - qty)` **restando `qty`
   directo** (no usa `casesFor` → no traduce bolsa a fracción de caja).
6. **Marca** (160): PATCH `web_orders?id=eq.{id}` con `{status:"imported",
   approved_at}`. Si falla → solo un `alert`; **el pedido CRM ya quedó creado**.
7. Quita el pedido de la lista local (166).

---

## 2. Diagrama del flujo actual

```
[Admin hace clic "Importar al CRM"]
        │
        ▼
  ┌───────────────────────────── importOrder() (navegador) ─────────────────────────────┐
  │ 1. POST/local  clients   (crea cliente si no existe)   ── saveAll → sync a la nube    │
  │ 2. POST/local  orders    (crea pedido {productId,qty}) ── saveAll → sync a la nube    │
  │ 3. PATCH/local inventory (stock -= qty, sin casesFor)  ── saveAll → sync a la nube    │
  │ 4. PATCH       web_orders status='imported'            ── directo REST                │
  └──────────────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
   Cada paso es independiente. NO hay transacción. NO hay lock.
   Falla en el paso 4 ⇒ pedido creado pero web_order sigue 'pending' ⇒ reimportable.
   Doble clic / 2 dispositivos ⇒ 2 pedidos para el mismo web_order.
```

---

## 3. Riesgos concretos del flujo actual

| # | Riesgo | Causa en el código |
|---|---|---|
| R1 | **Pedido duplicado** por doble clic o 2 dispositivos | No hay lock ni chequeo de `webOrderId` previo. `webOrderId` se escribe pero nunca se lee (grep: solo WebOrders.tsx:144). |
| R2 | **Pedido huérfano**: pedido creado pero `web_order` sigue `pending` | Paso 4 (PATCH) puede fallar después de crear el pedido; solo muestra `alert`. |
| R3 | **Inventario mal descontado** | Paso 5 resta `qty` directo; no usa `casesFor` → una bolsa descuenta una caja entera. |
| R4 | **Pedido sin contexto histórico** | Items guardados sin `unit`/`priceAtSale`/`costAtSale`; si el catálogo cambia, el pedido viejo se recalcula mal. |
| R5 | **Total confía en cálculo de un solo dispositivo** | Sin re-verificación; no se recalcula del lado servidor. |
| R6 | **Pérdida de red = duplicado** | Si el PATCH del paso 4 se pierde pero el pedido se creó, reintentar crea otro pedido. |

---

## 4. Firma de la RPC (APROBADA)

```sql
public.import_web_order(
  p_web_order_id  text,     -- id del web_order a importar
  p_order_id      text,     -- id que tendrá el nuevo pedido (formato uid() actual)
  p_new_client_id text,     -- id para el cliente SI hay que crearlo; se ignora si ya existe
  p_items         jsonb,    -- OrderItem[] YA snapshotteados por buildOrderItems:
                            --   [{ "productId","qty","unit","priceAtSale","costAtSale" }, ...]
  p_deltas        jsonb     -- deltas de inventario agregados por producto:
                            --   [{ "productId","casesUsed" }, ...]
) returns jsonb
```

**Notas de la firma:**
- **Sin `p_client`.** El cliente se construye **solo** con datos de la fila
  bloqueada de `web_orders` (§8). El frontend nunca envía datos de cliente.
- `p_order_id` / `p_new_client_id` conservan el **formato de id actual** (`uid()`
  del frontend). No garantizan idempotencia por sí mismos: la garantía es el
  índice único parcial (§6). En un reintento tras un commit exitoso, la RPC
  encuentra y devuelve el pedido existente **ignorando los ids recibidos de nuevo**.
- **Total (rev.3):** `orders.data.total` = `web_orders.total` **tal cual**
  (autoritativo). La RPC **sí** calcula `Σ(priceAtSale·qty)` desde `p_items`, pero
  solo para **detectar** descuadres y avisarlos en `pricingWarnings`
  (`ORDER_TOTAL_MISMATCH`) — **nunca** para reemplazar el total ni hacer rollback
  (§9-bis). Sigue sin confiar en ningún total *enviado por el frontend*.

**Descuento (tier):** en Sprint 1A **no se aplica descuento de tier** al importar:
el total es `web_orders.total` sin modificar, y `orders.data.discount = 0`. Esto
elimina la necesidad del mapa tier→disc en SQL (una regla de negocio duplicada
menos). El `tier` del cliente existente se conserva en su fila; no se usa para el
total del pedido web.

---

## 5. Algoritmo SQL paso a paso (rev. 2)

```
FUNCTION import_web_order(p_web_order_id, p_order_id, p_new_client_id, p_items, p_deltas):
  -- SECURITY DEFINER, SET search_path TO 'public','pg_temp'
  v_pricing_warnings := '[]'::jsonb;   -- avisos de precio (no bloquean)
  v_warnings         := '[]'::jsonb;   -- avisos de inventario (no bloquean)

  1.  IF NOT public.is_admin() THEN RAISE insufficient_privilege 'no_autorizado' (42501)

  2.  -- VALIDACIONES DE ENTRADA (§6-val) — antes de tocar nada
      - jsonb_typeof(p_items)='array'  AND jsonb_array_length(p_items)  > 0   ELSE INVALID_ITEMS
      - jsonb_typeof(p_deltas)='array' AND jsonb_array_length(p_deltas) > 0   ELSE INVALID_DELTAS
      - por cada item:  productId no vacío; qty > 0;
                        priceAtSale, costAtSale numéricos válidos (>= 0)       ELSE INVALID_ITEMS
      - por cada delta: productId no vacío; casesUsed > 0                       ELSE INVALID_DELTAS

  3.  SELECT * INTO wo FROM public.web_orders
        WHERE id = p_web_order_id
        FOR UPDATE;                        -- ← lock de fila: serializa concurrencia
      IF NOT FOUND THEN RAISE 'web_order_inexistente' (WEB_ORDER_NOT_FOUND)

  4.  -- IDEMPOTENCIA (capa 2): ¿ya existe un pedido para este web_order?
      SELECT id, client_id INTO v_existing_order, v_existing_client
        FROM public.orders WHERE data->>'webOrderId' = p_web_order_id LIMIT 1;
      IF v_existing_order IS NOT NULL THEN
        RETURN jsonb(success=true, alreadyImported=true, webOrderId=p_web_order_id,
                     orderId=v_existing_order, clientId=v_existing_client,
                     clientCreated=false, inventoryUpdated=0,
                     inventoryWarnings=[], pricingWarnings=[]);
      END IF;
      -- (también cubre wo.status='imported'); si status='imported' pero no hay
      --  order con ese webOrderId ⇒ dato histórico sin vínculo: ver §6-hist)

  5.  IF wo.status <> 'pending' THEN
        RAISE 'estado_no_importable: %', wo.status (NOT_IMPORTABLE_STATUS)

  6.  -- VALIDACIÓN CRUZADA contra web_orders (no confiar en frontend):
      - wo.total NO nulo (si el esquema lo permitiera), numérico y >= 0         ELSE INVALID_ORDER_TOTAL
      - cada línea de p_items debe corresponder a una línea de wo.items con el
        MISMO productId y la MISMA qty base                                   ELSE ITEMS_MISMATCH
        (se permite que wo.items tenga líneas extra sin productId que el
         frontend omite; NO se permite productId/qty en p_items ausentes en wo.items)
      - cada delta.productId debe aparecer en p_items                          ELSE DELTAS_MISMATCH
      - v_calc_items_total := Σ (priceAtSale*qty) sobre p_items   -- solo para AVISO
      - IF |v_calc_items_total - wo.total| > 0.01 THEN
          -- NO rollback (decisión rev.3): total autoritativo = wo.total
          v_pricing_warnings := v_pricing_warnings || jsonb_build_object(
            'code','ORDER_TOTAL_MISMATCH',
            'webOrderTotal', wo.total,
            'calculatedItemsTotal', round(v_calc_items_total,2),
            'difference', round(v_calc_items_total - wo.total, 2));
        END IF;

  7.  v_phone_norm := regexp_replace(coalesce(wo.phone,''), '\D','','g');
      IF length(v_phone_norm)=10 THEN v_phone_norm := '1'||v_phone_norm; END IF;

  8.  -- CLIENTE: buscar por teléfono normalizado (datos SOLO de wo, §8)
      SELECT id INTO v_client_id
        FROM public.clients
        WHERE regexp_replace(coalesce(data->>'phone',''),'\D','','g')
              = <norm sobre 10 díg> LIMIT 1;
      IF v_client_id IS NULL THEN
        v_client_id := p_new_client_id;              -- id del frontend, formato uid()
        INSERT INTO public.clients (id, representative_id, data, updated_at)
          VALUES (v_client_id, NULL,
            jsonb_build_object(
              'id', v_client_id,
              'name', coalesce(nullif(wo.negocio,''), nullif(wo.encargado,''),
                               'Cliente Web '||right(v_phone_norm,4)),
              'contact', coalesce(wo.encargado,''),
              'phone',   coalesce(wo.phone,''),
              'address', coalesce(wo.direccion,''),
              'zone', '', 'tier','Lista',
              'notes', 'Pedido web '||coalesce(wo.created_at::text,'')
                        ||' • Pago: '||coalesce(nullif(wo.pago,''),'—'),
              'created', now(), 'source','web'),
            now());
        v_client_created := true;
      ELSE
        v_client_created := false;                    -- p_new_client_id se ignora
      END IF;

  9.  -- TOTAL almacenado = web_orders.total AUTORITATIVO (decisión rev.3).
      -- NO se recalcula desde items; NO se aplica descuento de tier en Sprint 1A
      -- (el total web es el total comercial tal cual). discount = 0.
      v_total := wo.total;

  10. -- PEDIDO (id = p_order_id)
      INSERT INTO public.orders (id, client_id, status, paid_date, data, updated_at)
        VALUES (p_order_id, v_client_id, 'pending', NULL,
          jsonb_build_object(
            'id', p_order_id, 'clientId', v_client_id,
            'date', to_char(now(),'YYYY-MM-DD'),
            'items', p_items,                    -- snapshot completo (unit/price/cost)
            'discount', 0, 'total', v_total,     -- total = web_orders.total tal cual
            'status','pending',
            'notes','Importado de pedido web '||p_web_order_id
                     ||CASE WHEN coalesce(wo.pago,'')<>'' THEN ' • Pago: '||wo.pago ELSE '' END,
            'created', now(),
            'source','web_order',                -- ← Fase 2 item 10 (nuevo valor canónico)
            'webOrderId', p_web_order_id),        -- ← clave de idempotencia
          now());
      -- UNIQUE index parcial sobre (data->>'webOrderId') protege aquí (§6, capa 3).

  11. -- INVENTARIO: agrupar deltas, bloquear en orden determinista, descontar 1 vez
      v_updated := 0;
      FOR d IN (
        SELECT productId, sum(casesUsed) AS delta
          FROM jsonb_to_recordset(p_deltas) AS x(productId text, casesUsed numeric)
          GROUP BY productId
          ORDER BY productId              -- ← orden determinista (anti-deadlock, §9)
      ) LOOP
        SELECT (data->>'stock')::numeric INTO v_stock
          FROM public.inventory WHERE id = d.productId FOR UPDATE;
        IF NOT FOUND THEN
          RAISE 'inventario_sin_fila: %', d.productId (INVENTORY_PRODUCT_NOT_FOUND);  -- rollback total
        END IF;
        v_after := greatest(0, v_stock - d.delta);            -- clamp (decisión #3)
        IF v_stock < d.delta THEN                             -- hubo clamp ⇒ warning
          v_warnings := v_warnings || jsonb_build_object(
            'productId', d.productId, 'requestedDelta', d.delta,
            'stockBefore', v_stock, 'stockAfter', v_after,
            'code', 'INSUFFICIENT_STOCK_CLAMPED');
        END IF;
        UPDATE public.inventory
          SET data = jsonb_set(data,'{stock}', to_jsonb(v_after)), updated_at = now()
          WHERE id = d.productId;
        v_updated := v_updated + 1;
      END LOOP;

  12. -- MARCAR web_order (misma transacción)
      UPDATE public.web_orders
        SET status='imported', approved_at=now(),
            processed_order_id=p_order_id, processed_at=now(), processed_by=auth.uid()
        WHERE id = p_web_order_id;

  13. RETURN jsonb(success=true, alreadyImported=false, webOrderId=p_web_order_id,
                   orderId=p_order_id, clientId=v_client_id,
                   clientCreated=v_client_created, inventoryUpdated=v_updated,
                   inventoryWarnings=v_warnings, pricingWarnings=v_pricing_warnings);
  -- COMMIT implícito al retornar; cualquier RAISE arriba ⇒ ROLLBACK total.
END;
```

---

## 6. Estrategia de idempotencia

Tres capas, defensa en profundidad:

1. **Lock de fila** (§7): `SELECT … FOR UPDATE` sobre `web_orders`. Dos llamadas
   concurrentes se serializan; la segunda ve el pedido ya creado (paso 4) y
   retorna idempotente.
2. **Chequeo por `webOrderId`** (algoritmo paso 4): si ya existe un `order` con
   ese `webOrderId`, retorna `{alreadyImported:true, orderId:<existente>}`
   **ignorando los ids recibidos** — reintento tras commit exitoso siempre
   devuelve el mismo pedido.
3. **Índice único parcial** (última línea de defensa, §12):
   ```sql
   CREATE UNIQUE INDEX orders_web_order_id_uq
     ON public.orders ((data ->> 'webOrderId'))
     WHERE data ? 'webOrderId';
   ```
   Un segundo `INSERT` con el mismo `webOrderId` viola el índice → ROLLBACK. Es
   **la garantía principal** aunque falle el lock o la escritura venga fuera de la RPC.

### §6-hist — Aclaración histórica (intención del código vs. datos persistidos)
- **Intención del código actual** (WebOrders.tsx): al importar, escribe en el
  pedido `webOrderId: wo.id` (línea 144) y `source: "web"` (línea 143).
- **Datos realmente persistidos en producción** (inspección confirmada): **cero**
  `orders` contienen `webOrderId`, `web_order_id`, ni `source = "web_order"`.
  Es decir, en la data real de producción no existe hoy ningún pedido vinculado a
  un web_order por esas llaves.
- **Consecuencia para el índice:** el `WHERE data ? 'webOrderId'` excluye a todos
  los orders históricos → el índice único se crea **sin conflicto**.
- **Web_orders históricos con `status='imported'`** quedan **sin vínculo**
  persistente a un pedido; así se dejan. **NO se reconstruye la relación
  histórica automáticamente.** Sus columnas `processed_*` quedan NULL.
- **Nota de valor de `source`:** el código viejo escribía `"web"`; la RPC nueva
  escribe `"web_order"` (valor canónico de la Fase 2). No se migran los viejos.

### §6-val — Validaciones server-side (decisión #6)
La RPC valida y **rechaza (rollback)** si algo no cuadra. No confía en el frontend:

| Validación | Código de error |
|---|---|
| `p_items` es arreglo JSON no vacío | `INVALID_ITEMS` |
| `p_deltas` es arreglo JSON no vacío | `INVALID_DELTAS` |
| cada item: `productId` no vacío, `qty > 0`, `priceAtSale`/`costAtSale` numéricos válidos | `INVALID_ITEMS` |
| cada delta: `productId` no vacío, `casesUsed > 0` | `INVALID_DELTAS` |
| cada `p_items` corresponde a una línea de `web_orders.items` (mismo productId + misma qty base) | `ITEMS_MISMATCH` |
| cada `delta.productId` aparece en `p_items` | `DELTAS_MISMATCH` |
| productId "desconocido" (sin fila en `inventory`) | `INVENTORY_PRODUCT_NOT_FOUND` (en paso 11) |
| `web_orders.total` no numérico o negativo (o nulo si el esquema no lo permite) | `INVALID_ORDER_TOTAL` |
| `|Σ(priceAtSale·qty) − web_orders.total| > 0.01` | **NO rechaza** → aviso `ORDER_TOTAL_MISMATCH` en `pricingWarnings` |
| total enviado por el frontend | **ignorado** — el total autoritativo es `web_orders.total` |
| datos de cliente del frontend | **ignorados** — la RPC usa solo `web_orders` |

**Total autoritativo (rev.3):** `orders.data.total = web_orders.total` tal cual.
El descuadre `Σ(priceAtSale·qty) ≠ web_orders.total` **no bloquea** — los pedidos
históricos usaron precios que hoy no se pueden reconstruir (ej. confirmado:
5×`slaps-tam` + 5×`slaps-app`, `web_orders.total = 375`; a precio de lista actual
$40 darían $400). Se reporta:
```json
{ "code": "ORDER_TOTAL_MISMATCH", "webOrderTotal": 375,
  "calculatedItemsTotal": 400, "difference": 25 }
```

> **"productId desconocido":** la RPC **no tiene el catálogo** (frontend-only), así
> que no puede validar contra `PRODUCTS`. Lo enforce transitivamente:
> (a) `p_items` debe coincidir con `web_orders.items` (que el sitio generó del
> catálogo), y (b) todo producto a descontar debe tener fila en `inventory`
> (si no, `INVENTORY_PRODUCT_NOT_FOUND`). **Supuesto a confirmar:** todo producto
> importable tiene fila en `inventory` (§16).

---

## 7. Estrategia de locking y concurrencia

| Escenario | Mecanismo |
|---|---|
| Doble clic | Botón deshabilitado en frontend + lock de fila `web_orders`. La 2ª llamada espera y retorna idempotente. |
| Dos pestañas / dos dispositivos | `SELECT … FOR UPDATE` serializa. La 2ª ve el pedido ya creado → retorna el existente. |
| Reintento tras pérdida de red | Mismo `webOrderId` → paso 4 + índice único → retorna el existente. |
| Filas de inventory concurrentes | `SELECT … FOR UPDATE` por fila, **ordenadas por `productId`** (determinista) para minimizar deadlocks entre dos importaciones que toquen los mismos productos. |
| Rollback | Cualquier `RAISE` revierte cliente + pedido + inventario + web_order juntos (una sola transacción). |

---

## 8. Estrategia para creación/reutilización de cliente (decisión #2)

- **El frontend NO envía datos de cliente.** El cliente se construye
  **exclusivamente** con los campos de la fila bloqueada de `web_orders`:
  `negocio`, `phone`, `encargado`, `direccion`, `pago`, `created_at`.
- **Normalización:** `regexp_replace(phone,'\D','','g')`; si quedan 10 dígitos,
  anteponer `'1'` (idéntico a `normPhone`, WebOrders.tsx:29–33).
- **Búsqueda:** por teléfono normalizado sobre `clients.data->>'phone'`. El brief
  confirma que **no hay teléfonos duplicados** tras normalizar → `LIMIT 1` seguro.
- **Existe →** reutiliza su `id`, `clientCreated=false`. El `p_new_client_id`
  recibido **se ignora**. (El `tier` del cliente ya **no** se usa para el total en
  Sprint 1A — el total es `web_orders.total`, §9-bis.)
- **No existe →** crea con `id = p_new_client_id`, `tier="Lista"`, `source="web"`,
  `name = negocio || encargado || "Cliente Web ####"`, notas con fecha+pago del
  web_order. `clientCreated=true`.
- **Idempotencia + rollback del cliente:** en un reintento el pedido ya existe
  (paso 4 retorna antes de tocar clientes). En el primer intento, si el cliente
  se creó pero algo falla después, el ROLLBACK **también borra el cliente**
  (cubre "rollback después de crear cliente").

---

## 9. Estrategia de inventario (decisiones #3 y #4)

**Comportamiento canónico del flujo normal** ([applyInventory](src/lib/business/orders.ts:57)):
`used = casesFor(p, unit, qty)`; `stock = max(0, stock - used)`.

**Reparto (coherente con Fase 5):** el frontend calcula `casesUsed` por línea con
`casesFor` (tiene el catálogo) y **agrega por producto** en `p_deltas`. La RPC:
1. **Agrupa** duplicados por `productId` (`GROUP BY`) — cubre "producto duplicado
   en dos líneas".
2. **Bloquea** cada fila `FOR UPDATE` **en orden por `productId`** (anti-deadlock).
3. **Lee el saldo actual en Supabase** (no el saldo local viejo del dispositivo).
4. **Descuenta una sola vez** dentro de la transacción; `updated_at=now()`.

**`unit` (Fase 4):** `web_orders.items` no trae `unit`. Regla: **si no viene,
`"case"`**. Con `unit="case"` ⇒ `casesUsed = qty`, `priceAtSale = p.price`,
`costAtSale = p.cost`. El frontend aplica esto al armar `p_items`/`p_deltas`.

**Stock insuficiente (decisión #3):** se conserva el comportamiento actual:
```
stock_after = greatest(0, stock_before - delta)
```
No rechaza. Cuando hubo clamp (`stock_before < delta`), se agrega a
`inventoryWarnings`:
```json
{ "productId": "...", "requestedDelta": 5, "stockBefore": 2,
  "stockAfter": 0, "code": "INSUFFICIENT_STOCK_CLAMPED" }
```

**Fila de inventory inexistente (decisión #4):** **error
`INVENTORY_PRODUCT_NOT_FOUND` + ROLLBACK TOTAL.** No se omite el producto, no se
continúa en silencio.

---

## 9-bis. Total del pedido y precios (decisión rev.3)

**`web_orders.total` es el total comercial autoritativo.** La RPC:

1. **Guarda `orders.data.total = web_orders.total`** tal cual (sin recalcular, sin
   aplicar descuento de tier; `orders.data.discount = 0`).
2. **Sí calcula** `calculatedItemsTotal = Σ(priceAtSale·qty)` desde `p_items`.
3. Si `|calculatedItemsTotal − web_orders.total| > 0.01`: **NO hace rollback** —
   agrega a `pricingWarnings`:
   ```json
   { "code": "ORDER_TOTAL_MISMATCH", "webOrderTotal": <number>,
     "calculatedItemsTotal": <number>, "difference": <number> }
   ```
4. **Sí rechaza (rollback)** — validaciones duras de precio:
   - `web_orders.total` nulo cuando el esquema no lo permita, no numérico, o
     negativo → `INVALID_ORDER_TOTAL`.
   - `priceAtSale`/`costAtSale` no numéricos, `qty` inválido → `INVALID_ITEMS`.

**Por qué no bloquea el descuadre:** algunos `web_orders` históricos no coinciden
con el precio de lista actual, y `web_orders.items` **no conserva** el precio
vigente cuando se creó el pedido, así que no se puede reconstruir con certeza.
Ejemplo confirmado en datos reales: 5×`slaps-tam` + 5×`slaps-app` con
`web_orders.total = 375`, cuando a $40 de lista actual serían $400. El total
autoritativo es el que cobró el sitio (`375`), no el recalculado.

### Deuda futura (NO en Sprint 1A)
`web_orders.items` debería guardar un **snapshot** por línea al momento de crear
el pedido web, para que el CRM tenga contexto histórico fiel y estas
reconciliaciones dejen de ser necesarias:
- `priceAtSale`
- `costAtSale`
- `unit`
- reglas de negocio aplicadas o **versión de catálogo** vigente

Esto implica cambiar el sitio (dulcesaborca.com) que inserta en `web_orders`.
**Fuera de alcance de Sprint 1A** — documentado como ampliación futura.

---

## 10. Formato exacto de respuesta JSON (decisión #10)

**Éxito (importación nueva):**
```json
{
  "success": true,
  "alreadyImported": false,
  "webOrderId": "wo_abc123",
  "orderId": "mps…",
  "clientId": "mps…",
  "clientCreated": true,
  "inventoryUpdated": 3,
  "inventoryWarnings": [
    { "productId": "flamkiyos", "requestedDelta": 5, "stockBefore": 2,
      "stockAfter": 0, "code": "INSUFFICIENT_STOCK_CLAMPED" }
  ],
  "pricingWarnings": [
    { "code": "ORDER_TOTAL_MISMATCH", "webOrderTotal": 375,
      "calculatedItemsTotal": 400, "difference": 25 }
  ]
}
```

**Éxito idempotente (ya estaba importado):**
```json
{
  "success": true,
  "alreadyImported": true,
  "webOrderId": "wo_abc123",
  "orderId": "mps…",
  "clientId": "mps…",
  "clientCreated": false,
  "inventoryUpdated": 0,
  "inventoryWarnings": [],
  "pricingWarnings": []
}
```

**Error:** la RPC hace `RAISE EXCEPTION`; PostgREST lo traduce a HTTP 4xx con
`{ "code","message","details" }`. El frontend distingue por `SQLSTATE`/código
textual embebido, nunca por el texto en español (§11).

---

## 11. Errores y códigos propuestos

| Situación | Mecanismo | Etiqueta | ¿Rollback? | HTTP |
|---|---|---|---|---|
| No es admin | `RAISE insufficient_privilege` | `no_autorizado` (42501) | sí | 403 |
| web_order no existe | `RAISE` | `WEB_ORDER_NOT_FOUND` | sí | 404/400 |
| Estado no importable (`ignored`, …) | `RAISE` | `NOT_IMPORTABLE_STATUS` | sí | 409 |
| `p_items` inválido | `RAISE` | `INVALID_ITEMS` | sí | 400 |
| `p_deltas` inválido | `RAISE` | `INVALID_DELTAS` | sí | 400 |
| p_items no cuadra con web_orders.items | `RAISE` | `ITEMS_MISMATCH` | sí | 409 |
| delta sin item correspondiente | `RAISE` | `DELTAS_MISMATCH` | sí | 409 |
| `web_orders.total` nulo/no numérico/negativo | `RAISE` | `INVALID_ORDER_TOTAL` | sí | 400 |
| fila inventory inexistente | `RAISE` | `INVENTORY_PRODUCT_NOT_FOUND` | **sí** | 409 |
| Duplicado (índice único) | `unique_violation` | `23505` | sí | 409 |
| **stock insuficiente** | warning (NO error) | `INSUFFICIENT_STOCK_CLAMPED` (en `inventoryWarnings`) | **no** | 200 |
| **descuadre de total** | warning (NO error) | `ORDER_TOTAL_MISMATCH` (en `pricingWarnings`) | **no** | 200 |

> Los `SQLSTATE` custom se fijan en Checkpoint 3. El frontend distingue por la
> etiqueta (p.ej. `MESSAGE`/`ERRCODE`), no por el texto en español.

---

## 12. Índices o constraints necesarios

```sql
-- 1. Idempotencia (núcleo). Crear SOLO si el precheck de duplicados dio 0.
CREATE UNIQUE INDEX IF NOT EXISTS orders_web_order_id_uq
  ON public.orders ((data ->> 'webOrderId'))
  WHERE data ? 'webOrderId';

-- 2. Búsqueda del pedido por web_order
CREATE INDEX IF NOT EXISTS web_orders_processed_order_id_idx
  ON public.web_orders (processed_order_id);
```

**Columnas de trazabilidad nuevas en `web_orders` (Fase 3):**
```sql
ALTER TABLE public.web_orders
  ADD COLUMN IF NOT EXISTS processed_order_id text,
  ADD COLUMN IF NOT EXISTS processed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS processed_by       uuid;   -- = auth.uid()
```
(`approved_at` ya existe; se conserva para no romper la UI actual.)

**Nota (rev.3):** el mapa tier→disc **ya no se usa** en la RPC — el total es
`web_orders.total` sin descuento (§9-bis), así que no hay duplicación de
`TIER_DISC` en SQL. Una regla de negocio duplicada menos.

---

## 13. Efectos sobre RLS y permisos (decisión #8)

```sql
ALTER FUNCTION public.import_web_order(text, text, text, jsonb, jsonb)
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp';

REVOKE ALL     ON FUNCTION public.import_web_order(text, text, text, jsonb, jsonb) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.import_web_order(text, text, text, jsonb, jsonb) TO authenticated;
```

- **`SECURITY DEFINER`** + `search_path` fijo + nombres completamente calificados
  (`public.web_orders`, etc.).
- **`is_admin()` al inicio** de la función: un `authenticated` no-admin puede
  invocar pero recibe 403 (cubre "autenticado no en app_users"). `anon` ni
  siquiera tiene EXECUTE (cubre "usuario anon").
- **`auth.uid()`** dentro de la función → `processed_by`. El cliente **no** envía
  user_id.
- **RLS de tablas base:** sin cambios. La función escribe como definer; las
  políticas existentes siguen intactas para el REST normal.

---

## 14. Plan de rollback

Archivo `supabase/2026-07-24_rollback_import_web_order.sql` (Checkpoint 3).

**El rollback (decisión rev.3 #3):**
- **elimina la función** `public.import_web_order(text,text,text,jsonb,jsonb)`;
- **elimina los índices creados** (`orders_web_order_id_uq`,
  `web_orders_processed_order_id_idx`);
- **CONSERVA las columnas** `processed_order_id`, `processed_at`, `processed_by`;
- **conserva sus datos** para no perder la auditoría de imports ya realizados.

```sql
DROP FUNCTION IF EXISTS public.import_web_order(text, text, text, jsonb, jsonb);
DROP INDEX    IF EXISTS public.orders_web_order_id_uq;
DROP INDEX    IF EXISTS public.web_orders_processed_order_id_idx;
-- processed_order_id / processed_at / processed_by: NO se eliminan (auditoria).
-- NO borra datos de negocio (orders/clients/inventory/web_orders).
```

- **Reversible sin pérdida de datos.** Elimina función e índices; **no** toca las
  columnas `processed_*` ni ninguna fila de negocio.
- **Intencionalmente no-simétrico:** la migración agrega las columnas `processed_*`;
  el rollback NO las quita, porque contienen auditoría (qué pedido resultó de cada
  web_order, cuándo y quién). Son columnas nullable e inertes sin la función.
  Retirarlas sería una migración aparte y deliberada, aceptando la pérdida de esa
  auditoría.
- Los pedidos ya importados conservan su `webOrderId` en `data` (inofensivo sin
  el índice).
- Si hay que revertir en caliente, el frontend vuelve al flujo viejo por git — por
  eso Checkpoint 4 debe mantener el flujo viejo removido de forma limpia/reversible.

---

## 15. Casos de prueba necesarios (mapa al brief)

| Caso | Resultado esperado |
|---|---|
| Importación normal | 1 pedido, inventario descontado 1 vez, web_order `imported`, `processed_*` seteados. |
| Doble clic | 1 solo pedido; 2ª llamada `alreadyImported=true`. |
| Dos pestañas | Lock serializa; 2ª retorna existente. |
| Dos dispositivos | Igual que dos pestañas. |
| Reintento mismo webOrderId | Retorna pedido existente, ignora ids nuevos, no duplica. |
| Reintento con otro orderId | Índice único bloquea el 2º INSERT → devuelve existente (paso 4) antes de intentar insertar. |
| Pedido ya `imported` | Retorno idempotente inmediato. |
| Pedido `ignored` | `NOT_IMPORTABLE_STATUS`. |
| Usuario anon | Sin EXECUTE → 403/401. |
| Autenticado no-admin | `no_autorizado` (403). |
| Cliente existente | Reutiliza id, `clientCreated=false`, usa su tier, ignora `p_new_client_id`. |
| Cliente nuevo | Crea con `p_new_client_id`, `clientCreated=true`, tier "Lista", datos de web_order. |
| Producto duplicado en 2 líneas | `p_deltas` agrupado → descuenta 1 vez la suma. |
| Producto desconocido | `ITEMS_MISMATCH` (no está en web_orders.items) o `INVENTORY_PRODUCT_NOT_FOUND`. |
| Stock suficiente | Descuenta normal, sin warning. |
| Stock insuficiente | `stock_after=greatest(0,…)` + warning `INSUFFICIENT_STOCK_CLAMPED`; **no** rollback. |
| Inventario sin fila | `INVENTORY_PRODUCT_NOT_FOUND` + rollback total. |
| Pérdida de red | Reintento idempotente, sin duplicado. |
| Rollback tras crear cliente | Falla posterior ⇒ cliente NO persiste. |
| Rollback tras crear pedido | Falla posterior ⇒ pedido NO persiste. |
| Rollback durante inventario | Todo revierte. |
| Snapshot de caja | `p_items` incluye `unit,priceAtSale,costAtSale`. |
| `unit` ausente | Default `"case"` (frontend). |
| Cambio posterior de precio | Pedido conserva `priceAtSale` histórico. |
| Cambio posterior de costo | Pedido conserva `costAtSale` histórico. |
| Total manipulado por frontend | Ignorado; el total autoritativo es `web_orders.total`. |
| Descuadre de precio (histórico) | `orders.data.total = web_orders.total`; aviso `ORDER_TOTAL_MISMATCH`, sin rollback. |
| `web_orders.total` nulo/negativo/no numérico | `INVALID_ORDER_TOTAL` + rollback. |

> **Marco de pruebas:** el repo hoy no tiene runner. La Fase 7 exige detenerse y
> pedir autorización antes de instalar dependencias. Se decide en Checkpoint 5.
> **No hay staging** (§18): la verificación real será manual en producción tras
> aprobación explícita (regla 2 del proyecto). Alternativa sin instalar
> dependencias: script SQL de aserciones que José pueda correr él mismo cuando
> decida aplicar la migración.

---

## 16. Supuestos y bloqueadores restantes

**Los 3 bloqueadores previos están RESUELTOS** (firma aprobada; política de stock
decidida; total autoritativo = `web_orders.total`). Quedan supuestos a confirmar
con el diagnóstico read-only **antes de aplicar** la migración (no hay staging, §18):

1. **El descuadre de total ya no bloquea** (rev.3) — se guarda `web_orders.total`
   y se avisa. No queda riesgo de rechazar imports legítimos por precio histórico.
2. **Todo producto importable tiene fila en `inventory`.** Si un producto del
   catálogo nunca se stockeó (sin fila), la decisión #4 lo rechaza con
   `INVENTORY_PRODUCT_NOT_FOUND`. Confirmar que eso es aceptable.
3. **`web_orders` tiene RLS admin SELECT/UPDATE** (query #4 del diagnóstico).
4. **Precheck de duplicados = 0** antes de crear el índice único (esperado: 0
   orders con `webOrderId`). Si aparece cualquiera, **la migración se detiene**.
5. **`is_admin()` existe** con patrón definer + search_path (query #5).
6. **Tolerancia de aviso de total:** `0.01` absoluto (solo para decidir cuándo
   emitir `ORDER_TOTAL_MISMATCH`; no afecta el total guardado).

---

## 17. Archivos que se modificarían en Checkpoint 3 (SQL) y 4 (frontend)

**Checkpoint 3 — SQL (solo se ESCRIBEN los archivos; NO se ejecutan, §18):**
- `supabase/2026-07-24_import_web_order.sql` (NUEVO) — columnas + índices + RPC + grants.
- `supabase/2026-07-24_rollback_import_web_order.sql` (NUEVO) — rollback (§14).
- `supabase/2026-07-24_precheck_duplicados.sql` (NUEVO) — gate de duplicados, **solo lectura**.

**Checkpoint 4 — Frontend (solo lo necesario):**
- `src/lib/web-order-import.ts` (NUEVO) — arma `p_items`/`p_deltas` con los helpers
  existentes (`buildOrderItems`, `casesFor`), genera `p_order_id`/`p_new_client_id`
  con `uid()`, y llama la RPC vía REST `/rpc/import_web_order`.
- `src/components/WebOrders.tsx` (EDIT) — `importOrder` pasa a: preparar payload →
  deshabilitar botón → llamar RPC → esperar → recién actualizar estado local;
  eliminar el PATCH independiente y los `saveAll` previos a la confirmación.
- `src/types/domain.ts` (EDIT menor, si hace falta) — tipo del response de la RPC.
- `src/App.tsx` (EDIT **solo si es estrictamente necesario**) — exponer
  SUPA_URL/headers para el `/rpc/` si `web-order-import.ts` no los recibe por prop.

**NO se toca en este sprint:** `src/lib/business/orders.ts`, `src/lib/catalog.ts`
(se reutilizan tal cual), `public/sw.js`, ni nada fuera del flujo de import web.

---

## 18. Sin entorno de staging (decisión rev.3)

**Solo existe un proyecto Supabase: el operativo (producción).** No hay staging.
Reglas que rigen Checkpoint 3 en adelante:

- Checkpoint 3 **solo escribe** los 3 archivos SQL (migración, rollback, precheck).
  **No los ejecuta.**
- **Nada se aplica a producción** hasta que José lo apruebe explícitamente y decida
  cuándo correrlo él mismo (pegar-y-Run, como el resto de los SQL del proyecto).
- El **precheck es exclusivamente de lectura** (SELECT); no crea ni altera nada.
- **Prohibido afirmar que algo se "probó en staging"** — no existe tal entorno.
  Cualquier verificación previa es lectura del diagnóstico; la validación real
  ocurre en producción, con aprobación, y quedando el rollback listo por si acaso.
- El **orden seguro de aplicación** (cuando José lo autorice) será:
  1. Correr el **precheck** (lectura) → confirmar 0 duplicados de `webOrderId`.
  2. Solo si da 0: correr la **migración** (columnas + índice + RPC + grants).
  3. Tener el **rollback** a mano en la misma sesión.

---

### Fin del diseño (rev. 3) — pendiente de aprobación para Checkpoint 3
```
