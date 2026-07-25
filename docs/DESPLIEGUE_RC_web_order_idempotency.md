# Paquete de despliegue — Release Candidate
## Importación idempotente de pedidos web (Sprint 1A, Checkpoint 3)

**Fecha:** 2026-07-24 · **Rama:** `sprint/web-order-idempotency`
**Estado:** RELEASE CANDIDATE — aprobado por José, **pendiente de ejecución**.
**Alcance de este despliegue:** **solo base de datos.** El frontend NO cambia
(eso es Checkpoint 4).

---

## 0. Lee esto antes de tocar nada

Tres cosas que cambian cómo hay que leer el resto del documento:

### 0.1 La compuerta es `ok_para_migrar_estructura`, no `ok_para_migrar`

El precheck fue **corregido** (2026-07-24b) para separar la integridad
estructural de la reconciliación histórica. Ahora la consulta 12 devuelve estas
columnas de veredicto:

| Columna | Valor exigido | Qué significa |
|---|---|---|
| **`ok_para_migrar_estructura`** | **`true`** ← **COMPUERTA** | `schema_integrity_ok AND dup_web_order_id = 0`. Es el **único** booleano que hay que consultar para decidir si se despliega. |
| `schema_integrity_ok` | `true` | Las 8 verificaciones técnicas limpias. |
| `dup_web_order_id` | `0` | Sin esto el índice único no se puede crear. |
| `historical_reconciliation_required` | `true` **aceptado** | Estado conocido y documentado en [`RECONCILIACION_HISTORICA.md`](RECONCILIACION_HISTORICA.md). **No bloquea.** |
| `operational_index_review_required` | `true` hasta cerrar §1.4 | Lo cierra una persona, no el SQL. **Ya resuelto — ver §0.4.** |
| `veredicto` | texto | Frase legible que dice qué hacer. Léela primero. |
| `ok_para_migrar` | `false` **esperado** | **HEREDADO. No usarlo.** Se conserva por compatibilidad; mezcla estructura con historia, así que será `false` de forma permanente mientras los 13 registros históricos sigan sin vínculo — que es el estado **deseado**, no un problema. |

**Por qué se conservó el nombre `ok_para_migrar`:** por compatibilidad, como se
pidió. La señal engañosa se neutraliza aquí (en el checklist) y con la columna
`veredicto`, no renombrando la columna. Riesgo **R3: CERRADO**.

### 0.2 Nada de esto se ha ejecutado nunca. No existe staging.

Hay **un solo proyecto Supabase: producción**. Ni la migración, ni la vista, ni
la RPC se han ejecutado en ningún entorno. Lo único ejecutado fue el precheck
(solo lectura) y las consultas forenses (solo lectura).

**Consecuencia honesta:** la primera ejecución de la RPC y de la vista ocurrirá
en producción. Ambas son reversibles (riesgos **R9**, **R10**).

### 0.3 Después de este despliegue, la app se comporta igual… con un matiz.

La RPC queda creada pero **nadie la llama** (el frontend sigue con el flujo
viejo). Sin embargo el **índice único empieza a actuar de inmediato** sobre lo
que escribe el flujo viejo. Eso previene duplicados en la nube, pero cambia el
modo de falla de una doble importación: en vez de crear dos pedidos, la
sincronización del segundo va a fallar. Ver riesgo **R2** y el **congelamiento
operativo obligatorio de §8**.

### 0.4 R1 resuelto con datos reales: el índice no concurrente es seguro

Medido en producción el 2026-07-24:

| Métrica | Valor real |
|---|---|
| `orders_row_count` | **10** |
| `pg_relation_size('public.orders')` | **40 kB** |
| `pg_total_relation_size('public.orders')` | **144 kB** |
| Índices existentes en `orders` | 4: `orders_pkey` (unique, id), `idx_orders_client`, `idx_orders_paid_date`, `idx_orders_status` |

**Decisión: se mantiene `create unique index` NO concurrente, tal como está
escrito. No hay que cambiar nada.**

Fundamento: con **10 filas y 40 kB**, construir el índice es una operación de
microsegundos. El lock `SHARE` sobre `orders` existirá durante un lapso
imperceptible, muy por debajo del umbral de <100 000 filas de la tabla de
decisión. Usar `concurrently` aquí sería peor: obligaría a sacar la sentencia de
la transacción (perdiendo la atomicidad de la migración) para resolver un
problema que no existe. **Riesgo R1: CERRADO.**

Dos observaciones adicionales de esos resultados, que sí importan:

1. **Ningún índice actual toca `data->>'webOrderId'`**, y no existe
   `orders_web_order_id_uq`. Confirma que (a) la migración no ha sido aplicada, y
   (b) el índice nuevo no colisiona con nada existente.

2. **Solo hay 10 pedidos en la nube contra 13 pedidos web marcados `imported`.**
   Esto es analíticamente relevante y **refuerza la decisión de no reconciliar
   automáticamente**: el conjunto de candidatos posibles es más chico que el
   conjunto de pedidos web a explicar, así que forzosamente varios pedidos web no
   pueden tener un pedido propio, y cualquier coincidencia heurística tiene una
   probabilidad alta de ser casual. También explica de forma natural por qué la
   Consulta 4 encontró un mismo pedido compartido como candidato por varios
   pedidos web. Ver nota ampliada en §9.

---

## 1. Checklist de producción

Marca cada casilla en orden. **No avances si una falla.**

### Pre-vuelo

- [ ] **1.0 CONFIRMACIÓN INEQUÍVOCA DEL PROYECTO SUPABASE.** Obligatorio **antes
      de abrir o usar el SQL Editor**, y antes de cualquier otro punto de este
      checklist. **No basta con el nombre visible** — dos proyectos distintos
      pueden tener nombres parecidos (o el mismo nombre, en organizaciones
      distintas).

      - [ ] Leer visualmente en el Dashboard de Supabase:
        - **nombre del proyecto**
        - **organización o workspace** (no solo el proyecto — la organización
          también, porque el nombre del proyecto puede repetirse entre
          organizaciones distintas a las que José tenga acceso)
        - **región** del proyecto
        - **URL o project ref** (el identificador único que aparece en la URL
          del dashboard, tipo `https://supabase.com/dashboard/project/<ref>`,
          y que también aparece en `Settings → General`)
        - **entorno:** confirmar que es **producción** (no un proyecto de
          prueba, staging, o de otro cliente)
      - [ ] Comparar esos cinco datos con la referencia conocida del proyecto
        Mega PG CRM (el que usa `megapg-crm.vercel.app`). Si no se tiene esa
        referencia anotada de antes, **anotarla ahora** en un lugar seguro para
        futuras ejecuciones.
      - [ ] Tomar una **captura de pantalla** del dashboard mostrando esos
        cinco datos, o anotar el **project ref** a mano, **antes de pegar
        cualquier SQL** en el editor.

      **Condición STOP:** si existe **cualquier duda** sobre el proyecto, la
      organización o el entorno que está abierto — por mínima que parezca —
      **no pegar ni ejecutar SQL**. Cerrar la pestaña, volver a entrar desde
      cero al dashboard, y repetir esta verificación antes de continuar.

- [ ] **1.1 Respaldo / punto de restauración.** Confirmar en Supabase que hay
      backup reciente o PITR habilitado. Es la red de seguridad real; el rollback
      escrito cubre el esquema, no un accidente de datos.
- [ ] **1.2 Ventana de baja actividad.** Que José y Francisco no estén
      capturando pedidos durante la ejecución (ver 1.4).
- [ ] **1.3 Versión de PostgreSQL ≥ 15** (necesaria para `security_invoker` en la
      vista):
      ```sql
      select current_setting('server_version_num')::int >= 150000 as soporta_security_invoker,
             version();
      ```
      Si diera `false`, **no crear la vista** y avisar: habría que resolver la
      seguridad de otra forma (riesgo **R7**).

- [x] **1.4 `operational_index_review_required` — CERRADO el 2026-07-24.**
      Medido: `orders_row_count = 10`, tabla 40 kB, total 144 kB.
      **Decisión: índice NO concurrente, migración sin cambios.** Fundamento
      completo en §0.4. Solo hay que **re-verificar el número si el despliegue se
      hace mucho después** de esta fecha y la tabla creció de forma inesperada:
      ```sql
      select count(*) as orders_row_count from public.orders;
      ```
      | `orders_row_count` | Decisión |
      |---|---|
      | **< 100 000** | Seguir con la migración tal como está. **← caso actual (10).** |
      | 100 000 – 1 000 000 | Seguir, pero en ventana de baja actividad confirmada. |
      | **> 1 000 000** o escrituras intensas | **DETENERSE.** Habría que sacar el `create unique index` de la transacción y usar `concurrently` → nueva aprobación. |

- [ ] **1.5 Precheck completo.** Correr
      [`supabase/2026-07-24_precheck_duplicados.sql`](../supabase/2026-07-24_precheck_duplicados.sql)
      y verificar en la consulta 12:
      - **`ok_para_migrar_estructura = true`** ← la compuerta
      - `veredicto` = empieza con `ESTRUCTURA OK PARA MIGRAR`
      - `schema_integrity_ok = true`
      - `dup_web_order_id = 0`
      - `is_admin_count = 1`
      - `rls_deshabilitado = 0`
      - `historical_reconciliation_required = true` → **esperado y aceptado**
      - `imported_sin_vinculo = 13` → **esperado**
      - `ok_para_migrar = false` → **esperado, heredado, ignorar** (§0.1)

- [ ] **1.6 DECLARAR EL CONGELAMIENTO DE IMPORTACIONES (R2).** Obligatorio y
      **antes** de correr la migración. Procedimiento completo en **§8**:
      registrar fecha/hora de inicio, avisar a Francisco, y anotar el conteo
      base de la consulta de verificación §8.3.

- [ ] **1.7 Tener el rollback abierto en otra pestaña** del SQL Editor, listo
      para pegar:
      [`2026-07-24_rollback_import_web_order.sql`](../supabase/2026-07-24_rollback_import_web_order.sql)
      y [`2026-07-24_rollback_view_pending_reconciliation.sql`](../supabase/2026-07-24_rollback_view_pending_reconciliation.sql).

### Ejecución

- [ ] **1.8 Migración.** Pegar y correr
      [`supabase/2026-07-24_import_web_order.sql`](../supabase/2026-07-24_import_web_order.sql)
      completo (incluye su propio `begin;` / `commit;`).
- [ ] **1.9 Validaciones post-despliegue de la migración** (§3.1 a §3.4).
- [ ] **1.10 Vista.** Pegar y correr
      [`supabase/2026-07-24_view_pending_reconciliation.sql`](../supabase/2026-07-24_view_pending_reconciliation.sql).
- [ ] **1.11 Validaciones post-despliegue de la vista** (§3.5, §3.6).

### Cierre

- [ ] **1.12 Smoke test en producción.** Abrir el CRM (megapg-crm.vercel.app),
      entrar a **Pedidos Web** y confirmar que la pestaña carga y lista igual que
      antes. **No importar ningún pedido** — el congelamiento de §8 está activo.
- [ ] **1.13 No tocar el frontend.** No hay deploy de Vercel en este release. No
      se bumpea versión ni `CACHE_NAME` (no hubo cambio de código de la app).
- [ ] **1.14 Registrar el resultado** en este documento (§7, tabla de registro).

---

## 2. Orden exacto de ejecución

```
PASO 0   Respaldo/PITR confirmado                            (Supabase dashboard)
PASO 1   Chequeo de versión de PostgreSQL >= 15              (SELECT, §1.3)
PASO 2   Re-verificar orders_row_count (ya cerrado: 10)      (SELECT, §1.4)
PASO 3   Precheck completo                                   (SELECT, §1.5)
           → exigir ok_para_migrar_estructura = true
PASO 4   DECLARAR CONGELAMIENTO de importaciones             (§8 — humano)
           → anotar hora de inicio y conteo base §8.3
           ↓ solo si PASO 3 pasa y PASO 4 está declarado
PASO 5   MIGRACIÓN  2026-07-24_import_web_order.sql          (DDL, transaccional)
PASO 6   Validaciones §3.1–§3.4                              (SELECT)
           ↓ solo si PASO 6 pasa
PASO 7   VISTA      2026-07-24_view_pending_reconciliation.sql (DDL)
PASO 8   Validaciones §3.5–§3.6                              (SELECT)
PASO 9   Smoke test en la app, SIN importar nada             (manual)
```

**Reglas de orden que no se pueden invertir:**

1. **La vista va DESPUÉS de la migración**, sin excepción. La vista referencia
   `web_orders.processed_order_id`, columna que crea la migración. Al revés falla
   con `column does not exist` (error limpio, no destructivo).
2. **El precheck va ANTES de la migración.** Si `dup_web_order_id > 0`, el
   `create unique index` falla y aborta toda la transacción.
3. **El congelamiento (§8) se declara ANTES de la migración.** Si se declara
   después, existe una ventana en la que alguien podría importar un pedido justo
   cuando el índice ya está puesto y el frontend viejo no sabe convivir con él.
4. **Nada del frontend en este release.**

---

## 3. Validaciones posteriores al despliegue

Todas son `SELECT`. Correr en orden y comparar con la columna "esperado".

### 3.1 Columnas de trazabilidad creadas
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'web_orders'
  and column_name in ('processed_order_id', 'processed_at', 'processed_by')
order by column_name;
```
**Esperado:** 3 filas → `processed_at` (timestamptz), `processed_by` (uuid),
`processed_order_id` (text). Todas nullable.

### 3.2 Índices creados
```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in ('orders_web_order_id_uq', 'web_orders_processed_order_id_idx')
order by indexname;
```
**Esperado:** 2 filas. `orders_web_order_id_uq` debe ser **UNIQUE** y llevar
`WHERE (data ? 'webOrderId')`.

### 3.3 Función creada con la firma y seguridad correctas
```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as firma,
       p.prosecdef                               as security_definer,
       p.proconfig                               as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'import_web_order';
```
**Esperado:** 1 fila.
- `firma` = `text, text, text, jsonb, jsonb`
- `security_definer` = `true`
- `config` = `{search_path=public,pg_temp}`

Si `security_definer` fuera `false` o `config` viniera vacío, **hacer rollback**:
la función no debe correr sin `search_path` fijo.

### 3.4 Permisos de ejecución correctos (crítico de seguridad)
```sql
select
  has_function_privilege('anon',
    'public.import_web_order(text,text,text,jsonb,jsonb)', 'EXECUTE')          as anon_puede_ejecutar,
  has_function_privilege('authenticated',
    'public.import_web_order(text,text,text,jsonb,jsonb)', 'EXECUTE')          as authenticated_puede_ejecutar;
```
**Esperado:** `anon_puede_ejecutar = false`, `authenticated_puede_ejecutar = true`.

Si `anon` diera `true`, **rollback inmediato**: sería una función de escritura
expuesta al público.

### 3.5 Vista creada, con `security_invoker` y sin acceso anónimo
```sql
select c.relname, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'vw_web_orders_pending_reconciliation';
```
**Esperado:** `reloptions` contiene `security_invoker=true`.

```sql
select has_table_privilege('anon',
         'public.vw_web_orders_pending_reconciliation', 'SELECT') as anon_puede_leer;
```
**Esperado:** `false`. Si diera `true`, correr el rollback de la vista.

### 3.6 La vista devuelve los 13 casos conocidos
```sql
select motivo, count(*) as casos
from public.vw_web_orders_pending_reconciliation
group by motivo
order by motivo;
```
**Esperado:** total **13** filas repartidas entre `LEGACY_UNRECONCILED` (los sin
candidato, entre ellos `wo_moukr81xo3yc4` y `wo_mou8j8yfo5bu8`) y
`PENDIENTE_REVISION_MANUAL`.

Si el total no da 13, **no es motivo de rollback**, pero hay que entender por qué
antes de seguir: significa que la vista y el reporte forense no coinciden.

### 3.7 Control de no-regresión: seguir sin duplicados
```sql
select data ->> 'webOrderId' as web_order_id, count(*) as veces
from public.orders
where data ->> 'webOrderId' is not null and data ->> 'webOrderId' <> ''
group by 1
having count(*) > 1;
```
**Esperado:** **0 filas**, hoy y siempre. Vale la pena repetirla unos días
después del despliegue.

---

## 4. Plan de rollback

### 4.1 Rollback completo (orden inverso)

```
PASO A   2026-07-24_rollback_view_pending_reconciliation.sql   (elimina la vista)
PASO B   2026-07-24_rollback_import_web_order.sql              (elimina función + índices)
```

**El orden importa:** la vista depende de la columna `processed_order_id`. En la
práctica el rollback de la migración **conserva** esa columna, así que invertir el
orden no rompe nada, pero se documenta el orden correcto por claridad.

### 4.2 Qué revierte y qué NO

| Objeto | ¿Se elimina en rollback? |
|---|---|
| Vista `vw_web_orders_pending_reconciliation` | **Sí** |
| Función `import_web_order` | **Sí** |
| Índice `orders_web_order_id_uq` | **Sí** |
| Índice `web_orders_processed_order_id_idx` | **Sí** |
| Columnas `processed_order_id` / `processed_at` / `processed_by` | **NO — se conservan a propósito** |
| Filas de `orders`, `clients`, `inventory`, `web_orders` | **NO se tocan** |

**Por qué se conservan las columnas `processed_*`:** si la migración estuvo
activa y alguien importó un pedido, esas columnas guardan **auditoría** (qué
pedido salió de qué pedido web, cuándo y quién). Borrarlas destruiría esa
evidencia. El rollback es por eso **intencionalmente no simétrico**; quedan como
columnas nullable e inertes. Retirarlas sería una migración aparte y deliberada.

### 4.3 Ventana de rollback y punto de no retorno

- **Antes de que alguien importe un pedido web con el flujo nuevo:** rollback
  totalmente limpio, sin consecuencias.
- **Después de la primera importación por la RPC:** el rollback sigue siendo
  seguro (no borra datos de negocio), pero el pedido, el cliente y el descuento
  de inventario creados **permanecen** — como debe ser. Solo se pierde la
  protección de idempotencia hacia adelante.
- En este release **nadie puede importar por la RPC** todavía (el frontend no la
  llama), así que la ventana de rollback limpio es de hecho indefinida.

### 4.4 Si la migración falla a mitad

No hay nada que hacer: está envuelta en `begin; … commit;`, así que un fallo
revierte la transacción completa y la base queda como antes. Basta leer el error
y decidir.

---

## 5. Idempotencia de los scripts

Verificado leyendo cada archivo:

| Script | ¿Idempotente? | Mecanismo |
|---|---|---|
| `2026-07-24_precheck_duplicados.sql` | **Sí** | Solo `SELECT`. No escribe nada. |
| `2026-07-24_import_web_order.sql` | **Sí** | `add column if not exists` (×3), `create unique index if not exists`, `create index if not exists`, `create or replace function`, `revoke`/`grant` (idempotentes por naturaleza). |
| `2026-07-24_view_pending_reconciliation.sql` | **Sí** | `create or replace view` + `revoke`/`grant`. |
| `2026-07-24_rollback_import_web_order.sql` | **Sí** | `drop function if exists`, `drop index if exists` (×2). |
| `2026-07-24_rollback_view_pending_reconciliation.sql` | **Sí** | `drop view if exists`. |
| `sql/archive/*.sql` | **Sí** | Solo `SELECT`. |

**Dos matices honestos sobre esa idempotencia:**

1. `create index if not exists` **no valida la definición** del índice existente.
   Si ya hubiera un índice con ese nombre pero distinto contenido, el script lo
   saltaría en silencio. La validación §3.2 existe precisamente para detectarlo:
   hay que **leer** el `indexdef`, no solo contar filas.
2. `create or replace function` sobrescribe sin avisar. Es lo que queremos para
   re-correr, pero significa que correr una versión **vieja** del archivo pisaría
   una nueva. Correr siempre el archivo del repo en la rama correcta.

---

## 6. Riesgos residuales

Ordenados por lo que más conviene entender antes de aprobar la ejecución.

### R1 — El índice bloquea escrituras en `orders` mientras se crea · **CERRADO**
`create unique index` no es concurrente y toma un lock `SHARE` sobre
`public.orders` que bloquea escrituras mientras corre.
**Medido el 2026-07-24: 10 filas, 40 kB.** A esa escala la construcción es de
microsegundos. **Se mantiene el índice no concurrente.** Detalle en §0.4.
**Residual:** solo si la tabla creciera de forma inesperada antes de ejecutar;
el paso 1.4 lo re-verifica con una consulta.

### R2 — El índice cambia el modo de falla del flujo viejo · **MITIGADO por §8**
El frontend sigue usando `importOrder` (el flujo viejo, no transaccional), que
**sí** escribe `webOrderId` en los pedidos nuevos. Por lo tanto, a partir del
despliegue, esos pedidos quedan sujetos al índice único.

- **Antes:** doble importación (dos dispositivos, doble clic) → **dos pedidos
  duplicados** en la nube, en silencio.
- **Después:** el segundo pedido se crea en el dispositivo pero **la
  sincronización a Supabase falla** con violación de índice único (`23505`).

Es una mejora neta —el duplicado deja de propagarse— pero **más ruidosa**: puede
quedar un pedido "fantasma" solo en el localStorage de un dispositivo y un error
de sincronización.
**Mitigación formal: el congelamiento operativo de §8**, obligatorio desde antes
de la migración y hasta que Checkpoint 4 esté en producción.

### R3 — `ok_para_migrar` daba una señal engañosa · **CERRADO**
El precheck fue corregido: ahora expone **`ok_para_migrar_estructura`**
(= `schema_integrity_ok AND dup_web_order_id = 0`) como compuerta real,
`historical_reconciliation_required` como estado aceptado y separado, y una
columna `veredicto` en texto legible. `ok_para_migrar` se conserva con su nombre
por compatibilidad, documentado como heredado y no utilizable como compuerta.
Ver §0.1.

### R4 — La RPC queda desplegada sin consumidor · **ACEPTADO**
Nadie la llama hasta Checkpoint 4. Pero **queda invocable** vía
`POST /rest/v1/rpc/import_web_order` por cualquier usuario `authenticated` que
además sea admin. Si alguien la llamara con parámetros válidos sobre un pedido
`pending`, **haría una importación real**. No es un agujero (exige admin y
validaciones completas), pero es un camino de escritura vivo sin interfaz.
**Mitigación:** validación §3.4 confirma que `anon` no puede; no compartir la
firma; Checkpoint 4 la conecta formalmente.

### R5 — Nunca se ejecutó en ningún entorno · **ESTRUCTURAL**
No hay staging: la primera ejecución de la migración, de la RPC y de la vista
será en producción. La migración es transaccional (falla = sin efecto) y la vista
es reversible, así que el riesgo real es de **error de sintaxis o de lógica no
detectado**, no de corrupción. **Mitigación:** transacción + rollback listo +
validaciones §3.

### R6 — La vista nunca se ejecutó · **BAJO**
Si tiene un error de sintaxis, `create or replace view` falla sin efectos
secundarios. Si tiene un error de *lógica*, se notaría en §3.6 (el total ≠ 13).
**Mitigación:** §3.6 compara contra el resultado forense ya conocido.

### R7 — La vista exige PostgreSQL 15+ · **VERIFICABLE**
`security_invoker = true` no existe antes de PG15. Sin él, la vista correría con
los permisos de su dueño y **saltaría RLS**, exponiendo `web_orders`. El
`revoke ... from anon` limita el daño, pero no es suficiente por sí solo.
**Mitigación:** paso 1.3 lo verifica antes; si falla, no crear la vista.

### R11 — El filtro del índice es por presencia de llave, no por valor · **ACEPTADO**
El índice único es:

```
on public.orders ((data ->> 'webOrderId'))  where data ? 'webOrderId'
```

`data ? 'webOrderId'` significa *"el JSON tiene la llave"*, **no** "el valor no es
nulo ni vacío". Coincide con el diseño aprobado (rev. 3 §12) y la expresión de
unicidad es la correcta, pero el matiz importa:

| Valor de `webOrderId` | Comportamiento actual |
|---|---|
| llave ausente (pedidos normales) | no indexado ✅ |
| id real | indexado, unicidad aplicada ✅ |
| `null` explícito | indexado, pero SQL trata los NULL como distintos → sin colisión falsa ✅ |
| **cadena vacía `""`** | indexado con valor `''` → **dos filas con `""` colisionarían** ⚠️ |

**Por qué se acepta y NO se cambia:** la cadena vacía no tiene camino real de
llegar. El frontend viejo escribe `wo.id` (llave primaria de `web_orders`, nunca
vacía) y la RPC nueva rechaza el vacío con `INVALID_WEB_ORDER_ID`. Hoy además hay
**cero** pedidos con `webOrderId`, así que ninguna fila está indexada. Cambiar el
filtro durante el cierre del Release Candidate sería introducir un cambio
funcional nuevo sin necesidad.

**Si algún día apareciera** un `webOrderId` vacío, el síntoma sería una violación
de índice único (`23505`) al sincronizar; el arreglo es endurecer el filtro a
`where data ->> 'webOrderId' is not null and data ->> 'webOrderId' <> ''`, en una
migración aparte.

### R8 — Lógica duplicada entre la vista y el reporte archivado · **DEUDA**
La fórmula de score, la normalización de teléfono y las reglas de elegibilidad
están escritas **dos veces**: en la vista y en `sql/archive/`. Si alguien cambia
una regla en un lado, los números divergen sin aviso.
**Mitigación:** documentado en los dos archivos y en §3.6 (el conteo cruzado lo
detectaría). Es deuda aceptada, de la misma familia que las constantes duplicadas
que ya registra `CLAUDE.md`.

### R9 — Los 13 quedan sin vínculo permanentemente · **ACEPTADO Y DOCUMENTADO**
Sin efecto sobre inventario, ventas, clientes, comisiones ni pedidos futuros.
Solo se pierde trazabilidad histórica. Ver [`RECONCILIACION_HISTORICA.md`](RECONCILIACION_HISTORICA.md).

### R10 — El bug UTC sigue vivo · **FUERA DE ALCANCE**
Los pedidos capturados después de ~5pm PT se guardan con la fecha del día
siguiente (prioridad abierta en `CLAUDE.md`). Este despliegue **no lo arregla** y
la RPC usa `to_char(now(), 'YYYY-MM-DD')`, así que hereda el mismo
comportamiento. **Mitigación:** ninguna aquí; es un bloque aparte.

---

## 7. Recomendación final

**Recomiendo ejecutar en producción.** Los dos riesgos que quedaban abiertos ya
están cerrados:

- **R1 cerrado con datos:** 10 filas, 40 kB → el índice no concurrente es seguro,
  la migración no se toca (§0.4).
- **R3 cerrado:** el precheck ahora expone `ok_para_migrar_estructura` como
  compuerta real y ya no emite una señal engañosa (§0.1).

Queda **una condición no negociable**:

> **Declarar y respetar el congelamiento de importaciones web de §8**, desde antes
> de la migración y hasta que Checkpoint 4 esté verificado en producción.
> Importar en esa ventana es la única forma realista de generar un problema con
> este release.

### Por qué recomiendo avanzar

- La compuerta técnica está limpia: `schema_integrity_ok = true`, cero
  duplicados, `is_admin()` presente, RLS activo en las cinco tablas.
- **La tabla es diminuta** (10 filas, 144 kB con índices): la migración es
  prácticamente instantánea y el riesgo de bloqueo es nulo.
- La migración es **transaccional** y su rollback es **verificado y no
  destructivo**: el peor caso realista es "no pasó nada, leamos el error".
- Cada día sin migrar es un día en que el bug de importación duplicada sigue
  expuesto en producción.
- Los 13 casos históricos **no bloquean nada técnicamente** y ya están decididos
  y documentados.

### Lo que este release NO entrega

Que quede escrito, para que nadie lo dé por hecho:

- ❌ El frontend **no** usa la RPC todavía (Checkpoint 4).
- ❌ Los snapshots `unit`/`priceAtSale`/`costAtSale` en los items **no** llegan
  aún a los pedidos web importados (los escribe el frontend nuevo).
- ❌ Los 13 pedidos históricos **no** se reconcilian.
- ❌ El bug UTC **no** se arregla.

### Registro de ejecución (llenar al desplegar)

| Campo | Valor |
|---|---|
| Fecha y hora de ejecución | |
| Quién ejecutó | |
| `orders_row_count` re-verificado (paso 1.4) | |
| Estrategia de índice elegida | no concurrente (decidido, §0.4) |
| `ok_para_migrar_estructura` en el momento | |
| `veredicto` (texto) | |
| Congelamiento declarado: fecha/hora inicio (§8) | |
| Conteo base de §8.3 antes de migrar | |
| Migración: ¿ok? | |
| Vista: ¿ok? | |
| Filas en la vista (esperado 13) | |
| Validaciones §3.1–§3.7: ¿todas ok? | |
| Incidencias | |

---

## 8. Congelamiento operativo de importaciones web (R2)

**Obligatorio.** Ninguna importación de pedidos web debe ocurrir entre esta
migración y el despliegue de Checkpoint 4.

### 8.1 Por qué

Durante ese intervalo convive lo peor de los dos mundos: el **índice único ya
está activo**, pero el **frontend sigue con el flujo viejo**, que no sabe manejar
un rechazo del índice. Una importación en esa ventana puede dejar un pedido
creado en el dispositivo pero **no sincronizado** a Supabase, con un error de
sync silencioso. No se pierde dinero ni datos del negocio, pero se genera una
inconsistencia local que después hay que limpiar a mano.

### 8.2 Inicio, responsable y alcance

| Punto | Definición |
|---|---|
| **Inicio del congelamiento** | **Antes** de correr la migración (paso 4 del orden de ejecución). Se declara y se anota la fecha/hora exacta en el registro de §7. |
| **Quién lo declara** | **José.** Es quien ejecuta la migración y quien tiene acceso de admin. |
| **Quién debe confirmarlo** | **José confirma que él no importará**, y **avisa a Francisco** para que no intente hacerlo desde el celular. Francisco debe responder que se enteró (WhatsApp sirve como registro). |
| **Qué queda congelado** | **Solo el botón "Importar al CRM"** de la pestaña Pedidos Web. |
| **Qué sigue funcionando normal** | Todo lo demás: capturar pedidos normales, cobrar, inventario, clientes, visitas, comisiones, y el sitio dulcesaborca.com sigue **recibiendo** pedidos web con normalidad (solo no se importan al CRM todavía). |

**Nota que reduce mucho el riesgo real:** hoy **Francisco no tiene fila en
`app_users`**, así que no puede entrar al CRM; y las políticas RLS de
`web_orders` son solo para admin. En la práctica **el único que puede importar es
José**, así que el congelamiento se cumple con una sola persona. Aun así se avisa
a Francisco, por si su acceso se habilita en el intervalo.

### 8.3 Cómo verificar que no entraron pedidos nuevos

**Tres valores distintos, que no deben confundirse entre sí:**

| Concepto | Qué es | De dónde sale |
|---|---|---|
| **Valor histórico esperado** | La cifra documentada en la auditoría del 2026-07-24: `pedidos_con_web_order_id = 0`, `web_orders_importados = 13`. Es una **referencia documental**, congelada en el momento en que se hizo el reporte forense. | `docs/RECONCILIACION_HISTORICA.md` y el precheck ya ejecutado. |
| **Línea base real (Consulta A)** | El valor que la base **realmente tiene** en el instante en que se inicia el despliegue de hoy. Puede coincidir con el histórico o no (por ejemplo, si se capturó algún pedido normal entre el 24 de julio y la fecha real de ejecución). | Se mide corriendo la Consulta A, ahora mismo, al declarar el congelamiento. |
| **Valor de referencia durante el congelamiento** | La línea base real (Consulta A) — no el número histórico — es lo que debe permanecer estable mientras dure el congelamiento. | Consultas B y C se comparan contra A, no contra "13". |

**`web_orders_importados = 13` NO es una condición rígida de éxito operativo.**
Es una referencia histórica documentada, útil para detectar sorpresas, pero el
criterio real de "todo va bien" es que **A, B y C coincidan entre sí** (con la
única excepción explicable: una prueba controlada autorizada).

#### Consulta A — Línea base real (correr AL INICIAR el congelamiento)

```sql
select
  (select count(*) from public.orders
     where data ->> 'webOrderId' is not null
       and data ->> 'webOrderId' <> '')                    as pedidos_con_web_order_id,
  (select count(*) from public.web_orders
     where status = 'imported')                            as web_orders_importados,
  (select count(*) from public.web_orders
     where status = 'imported'
       and approved_at > '<FECHA_HORA_INICIO_CONGELAMIENTO>'::timestamptz)
                                                           as importados_durante_congelamiento;
```

- **Propósito:** establecer el punto de referencia real de hoy. Esta corrida
  **define** la línea base; no se compara contra sí misma.
- **Qué hacer con el resultado:** **anotarlo** (los tres números) en el registro
  de §8.4. Esto es "Consulta A" en todo lo que sigue.
- **Condición para detenerse en ESTA corrida:** si `pedidos_con_web_order_id` o
  `web_orders_importados` **difieren del valor histórico esperado** (0 y 13),
  **no continuar automáticamente** — investigar primero por qué cambió respecto
  a la auditoría del 24 de julio (¿se capturó un pedido nuevo con `webOrderId`?
  ¿se importó algo manualmente desde entonces?). Puede ser una explicación
  legítima (por eso no es un STOP automático de esquema), pero **debe
  entenderse antes de declarar la línea base como válida**.

#### Consulta B — Verificación previa a migrar (correr JUSTO ANTES del Paso 5)

Misma consulta, con el mismo `<FECHA_HORA_INICIO_CONGELAMIENTO>` de la Consulta A:

```sql
select
  (select count(*) from public.orders
     where data ->> 'webOrderId' is not null
       and data ->> 'webOrderId' <> '')                    as pedidos_con_web_order_id,
  (select count(*) from public.web_orders
     where status = 'imported')                            as web_orders_importados,
  (select count(*) from public.web_orders
     where status = 'imported'
       and approved_at > '<FECHA_HORA_INICIO_CONGELAMIENTO>'::timestamptz)
                                                           as importados_durante_congelamiento;
```

- **Propósito:** cerrar la ventana de tiempo entre declarar el congelamiento
  (Consulta A) y ejecutar el DDL de la migración.
- **Condición exacta:** los tres valores deben ser **idénticos a la Consulta A**
  — no a "13", no al histórico, a **A**. Cualquier diferencia en
  `pedidos_con_web_order_id`, `web_orders_importados` o
  `importados_durante_congelamiento` respecto a A → **DETENERSE**. El
  congelamiento se rompió entre A y B; no continuar con la migración hasta
  entender qué entró.

#### Consulta C — Verificación previa a levantar el congelamiento

Misma consulta, mismo `<FECHA_HORA_INICIO_CONGELAMIENTO>`:

```sql
select
  (select count(*) from public.orders
     where data ->> 'webOrderId' is not null
       and data ->> 'webOrderId' <> '')                    as pedidos_con_web_order_id,
  (select count(*) from public.web_orders
     where status = 'imported')                            as web_orders_importados,
  (select count(*) from public.web_orders
     where status = 'imported'
       and approved_at > '<FECHA_HORA_INICIO_CONGELAMIENTO>'::timestamptz)
                                                           as importados_durante_congelamiento;
```

- **Propósito:** confirmar que, durante todo el intervalo del congelamiento, no
  entró ningún pedido **no controlado**.
- **Condición exacta:** cualquier diferencia respecto a la Consulta A debe
  **explicarse por completo** por una de estas dos causas, y ninguna otra:
  1. La **prueba controlada autorizada** de §8.5 (que deliberadamente crea
     un pedido con `webOrderId` y marca un `web_order` como `imported`) —
     en ese caso, `pedidos_con_web_order_id` y `web_orders_importados` subirán
     en exactamente 1 cada uno, o
  2. Ninguna otra causa. Si hay una diferencia que no corresponde a la prueba
     controlada, **no levantar el congelamiento** — investigar primero.
- **`importados_durante_congelamiento`:** su valor esperado depende de si ya se
  corrió la prueba controlada. Si se corrió, debe ser exactamente **1** (el
  `web_order` de la prueba). Si no se ha corrido ninguna prueba todavía, debe
  ser **0**. Cualquier otro valor → **no levantar el congelamiento**.

**Regla general para las tres consultas:** ninguna se evalúa contra el número
"13" como si fuera una meta fija. Se evalúan **una contra otra** (A es la
referencia de B y C) y, solo en la primera corrida, A se contrasta contra el
histórico documentado como una señal de alerta temprana, no como un bloqueo.

Complementariamente, la validación §3.7 (cero duplicados de `webOrderId`) debe
seguir dando 0 filas en todo momento, en las tres corridas.

### 8.4 Cuándo se levanta

El congelamiento se levanta **solo** cuando se cumplen las cuatro condiciones:

1. **Checkpoint 4 está desplegado en producción** (Vercel, con la etiqueta de
   versión y el `CACHE_NAME` bumpeados según la regla 4 del proyecto).
2. **El frontend nuevo llama a la RPC** y ya no ejecuta el PATCH independiente ni
   guarda nada local antes de la confirmación.
3. **Se corrió la prueba controlada de §8.5 y cumplió TODOS sus criterios de
   éxito** — no solo "se probó", sino que se verificó cada uno de los 15 puntos
   de §8.5.
4. **José lo declara levantado** y lo anota abajo.

| Campo | Valor |
|---|---|
| Fecha/hora de inicio del congelamiento | |
| Francisco avisado (sí/no, cómo) | |
| Consulta A — línea base real (los 3 valores) | |
| Consulta A vs. valor histórico esperado: ¿coincide? (si no, explicación) | |
| Consulta B — justo antes de migrar (¿idéntica a A?) | |
| Consulta C — antes de levantar (los 3 valores) | |
| Consulta C vs. A: diferencia explicada por prueba controlada §8.5 (sí/no) | |
| Fecha/hora de levantamiento | |
| Quién lo levantó | |

---

### 8.5 CRITERIOS DE ÉXITO — PRUEBA CONTROLADA

**Esta prueba requiere autorización separada, explícita y previa a ejecutarla.**
No forma parte de las validaciones de solo lectura del resto de este documento:
**escribe datos reales** — crea un cliente (si hace falta), un pedido, descuenta
inventario y marca un `web_order` como `imported`. Nada de esto se ejecuta como
parte del pre-vuelo ni de este checklist; se ejecuta solo cuando, en el momento
de Checkpoint 4, alguien lo autorice explícitamente.

#### La prueba se considera APROBADA solo si se cumplen los 15 puntos:

1. Se procesó **un único** `web_order` autorizado específicamente para la
   prueba (no uno elegido al azar de los 13 históricos).
2. Se creó **exactamente un** `order` nuevo.
3. El `order` nuevo contiene el **`webOrderId` correcto** dentro de `data`.
4. `web_orders.processed_order_id` quedó poblado con el **id del `order` creado**
   en el punto 2 (no vacío, no de otro pedido).
5. `web_orders.processed_at` quedó poblado (no `null`).
6. `web_orders.processed_by` quedó poblado con **el usuario correcto** (el
   `auth.uid()` de quien ejecutó la prueba, vía `is_admin()`).
7. El `status` del `web_order` quedó en el valor esperado por el diseño
   (`imported`).
8. Los **productos y cantidades** del `order` coinciden con los del `web_order`
   de origen (mismo `productId`, misma `qty` por línea).
9. El **total** del `order` coincide con el cálculo esperado según el diseño de
   la RPC (`web_orders.total`, autoritativo — ver `2026-07-24_DISENO_import_web_order.md`).
10. El **inventario disminuye exactamente una vez** por cada producto
    involucrado (verificar `inventory.data->>'stock'` antes y después).
11. **No se crean clientes duplicados** — si el cliente ya existía por
    teléfono normalizado, se reutiliza; si no existía, se crea uno solo.
12. Un **segundo intento** con el **mismo** `web_order` (reintento manual de la
    misma prueba) **no crea otro `order`**.
13. Ese segundo intento devuelve el **resultado o error idempotente esperado**
    según el diseño de la RPC (respuesta de "ya importado", no un error genérico
    ni un nuevo pedido).
14. La consulta de duplicados de `webOrderId` (§3.7) devuelve **cero filas**
    después de la prueba.
15. Los postchecks de permisos, índices, función y vista (§3.1 a §3.6) **siguen
    pasando** después de la prueba, sin regresión.

#### La prueba se considera FALLIDA si ocurre cualquiera de estos:

- **Más de un `order` creado** para el mismo `web_order`.
- **Inventario descontado dos veces** (o descontado para un producto que no
  correspondía).
- `processed_order_id` **incorrecto o nulo** después de una importación exitosa.
- **Diferencia inesperada** en productos, cantidades o total respecto al
  `web_order` de origen.
- El **segundo intento crea otra orden** en vez de comportarse de forma
  idempotente.
- **Cualquier cambio en registros no relacionados con la prueba** — por ejemplo,
  otro `order`, otro cliente, u otra fila de `inventory` que no correspondía al
  `web_order` de prueba.

Si la prueba falla por cualquiera de estos motivos, **no levantar el
congelamiento**, revertir el dato de prueba si corresponde (a mano, ya que es
un dato real, no vía el rollback de esquema), y detener Checkpoint 4 hasta
entender la causa.

---

## 9. Nota analítica: solo 10 pedidos contra 13 pedidos web

Los datos de §0.4 revelan algo que vale la pena dejar escrito, porque **refuerza
la decisión de no reconciliar**:

La tabla `orders` tiene **10 filas** en total, mientras hay **13 pedidos web**
marcados `imported` esperando explicación.

**Implicaciones:**

1. **Aritméticamente, al menos 3 de los 13 no pueden tener un pedido propio** en
   la nube — ni siquiera si todos los pedidos existentes provinieran de
   importaciones web (y no todos lo son: hay pedidos capturados a mano).
2. **Explica de forma natural** por qué la Consulta 4 encontró un mismo pedido
   compartido como candidato por varios pedidos web: con un conjunto de
   candidatos tan chico, el solapamiento es inevitable, no sospechoso.
3. **Sube mucho la probabilidad de que una coincidencia heurística sea casual.**
   Con 10 candidatos, que dos compartan cliente, monto o fecha cercana no dice
   casi nada.
4. **Sugiere que varias de esas importaciones nunca llegaron a persistir** en la
   nube — consistente con que el flujo viejo hacía cuatro escrituras
   independientes sin transacción, exactamente el fallo que esta migración corrige.

Nada de esto cambia el plan. Lo que hace es **confirmar que la decisión de dejar
los 13 sin vínculo es la correcta**, y no una renuncia por falta de esfuerzo: la
evidencia simplemente no existe en la base.
