# Plan de reconciliación histórica — 13 pedidos web sin vínculo

**Fecha:** 2026-07-24 · **Rama:** `sprint/web-order-idempotency` · **Checkpoint 3.6**
**Propósito:** hoja de trabajo para revisar **a mano** los 13 casos **antes** de
escribir cualquier SQL de reconciliación.

> Este documento **no contiene SQL** y **no ordena ninguna escritura**.
> Es un instrumento de decisión humana.

---

## 0. Estado de la evidencia (leer antes que nada)

Para que nadie confunda lo comprobado con lo pendiente:

| Evidencia | Estado |
|---|---|
| Precheck (`2026-07-24_precheck_duplicados.sql`) | **EJECUTADO** por José. Resultados abajo. |
| Reporte de reconciliación (`2026-07-24_reporte_reconciliacion_web_orders.sql`) | **NO EJECUTADO.** Sus 4 consultas nunca se corrieron. |
| Migración (`2026-07-24_import_web_order.sql`) | **NO EJECUTADA.** |

**Resultado real del precheck:**

| Indicador | Valor |
|---|---|
| `dup_web_order_id` | 0 |
| `is_admin_count` | 1 |
| `src_web_order_sin_id` | 0 |
| `qty_malformada_pending` | 0 |
| `productos_sin_inventory` | 0 |
| `processed_huerfano` | 0 |
| `processed_contradictorio` | 0 |
| `rls_deshabilitado` | 0 |
| `imported_sin_vinculo` | **13** |
| `schema_integrity_ok` | **true** |
| `historical_reconciliation_required` | **true** |
| `operational_index_review_required` | **true** |
| `ok_para_migrar` | **false** |

**Consecuencia directa:** la matriz de la sección 4 va **en blanco**. No se puede
llenar sin correr el reporte, y **inventar** `candidate_order_id` o
clasificaciones sería peor que dejarla vacía. Los 13 `web_order_id` reales salen
de las Consultas 2 y 3 del reporte.

---

## 1. Resumen ejecutivo

### `schema_integrity_ok = true` — qué significa
Las ocho verificaciones técnicas del precheck salieron limpias:

- **No hay duplicados** de `webOrderId` en `orders` (0). El índice único parcial
  que crea la migración **se puede crear sin conflicto**.
- **`is_admin()` existe** — la función RPC puede apoyarse en ella.
- **RLS activo** en las cinco tablas relevantes.
- **No hay `processed_order_id` huérfano ni contradictorio** (esas columnas
  todavía no existen, así que 0 es el valor esperado).
- **No hay cantidades malformadas** en los pedidos web pendientes, ni productos
  pendientes sin fila de inventario.

**En términos simples: la arquitectura nueva no tiene defectos estructurales.**
La RPC transaccional, el índice de idempotencia y las columnas de trazabilidad
no chocan con nada de lo que hay hoy en la base.

### `historical_reconciliation_required = true` — qué significa
Hay **13 pedidos web** marcados como `imported` que **no tienen forma
verificable de saber a qué pedido del CRM corresponden**.

Esto **no es un error nuevo ni un defecto del diseño**. Es la huella que dejó el
flujo viejo: marcaba el pedido web como importado en una llamada **separada** de
la creación del pedido, y **no guardaba el vínculo** de forma persistente. La
relación existió en su momento, pero nunca quedó escrita.

### Qué está bloqueado y qué no

| Punto | Estado |
|---|---|
| Integridad de datos para migrar | ✅ Limpia |
| Idempotencia futura (índice único) | ✅ Sin conflictos |
| Vínculo histórico de 13 pedidos | ⛔ Perdido, requiere revisión humana |
| Revisión operacional del índice | ⛔ Pendiente (tamaño/actividad de `orders`) |

**El bloqueo restante es exclusivamente de datos históricos.** No hay nada que
arreglar en el código ni en el esquema nuevo.

### Punto de decisión que conviene resolver pronto

`ok_para_migrar` salió `false` **únicamente** porque `imported_sin_vinculo = 13`.
Ese criterio lo escribí de forma conservadora, pero conviene ser explícito:

**Técnicamente, estos 13 casos no impiden la migración.** No producen duplicados
(el precheck lo confirma: 0), así que el índice único se crearía sin problema.

Además hay una **dependencia de secuencia** que importa:

- Si la reconciliación va a **escribir el vínculo en `processed_order_id`**,
  entonces **la migración tiene que aplicarse primero** — esa columna no existe
  hasta entonces.
- Si en cambio escribiera el vínculo en `webOrderId` dentro de `orders.data`,
  quedaría sujeta al índice único, y un error de reconciliación sería rechazado
  por la base (lo cual es una protección, no un problema).

⇒ **Decisión para José (no la tomo yo):** ¿migrar primero y reconciliar después
(recomendado por la dependencia de secuencia), o reconciliar primero? La
recomendación técnica es **migrar primero**, porque la migración es la que crea
el lugar donde guardar el vínculo, y no depende de estos 13 casos.

---

## 2. Criterios de clasificación

Cinco categorías. Se asigna **exactamente una** por pedido web.

### `CONFIRMED`
**Cuándo:** hay **un solo** candidato elegible y la evidencia es concluyente.
En la práctica exige al menos una de estas dos:

- el **id del pedido web aparece literalmente en las notas** del pedido CRM
  (ver §3, paso 6 — la señal más fuerte disponible); **o**
- **teléfono coincide** + (**total coincide** o **conjunto de productos coincide**)
  + fecha coherente, **y no hay ningún otro candidato comparable**.

**Importante:** `CONFIRMED` es un juicio **humano**, no un resultado automático.
Ningún `candidate_score` produce esta categoría por sí solo.

### `PROBABLE`
**Cuándo:** hay un candidato claramente mejor que los demás, pero con **un punto
débil explicable**. Casos típicos:

- el **total no cuadra** pero la diferencia se explica por precios históricos
  (ver §5); o
- el **conjunto de productos no se pudo calcular** (`same_product_set` en nulo); o
- la **fecha difiere 1 día** y puede ser artefacto de zona horaria (ver §5).

**Requiere corroboración externa** antes de reconciliar: notas, historial del
cliente, WhatsApp, o memoria de José sobre ese pedido.

### `AMBIGUOUS`
**Cuándo:** la evidencia **no permite elegir**. Cualquiera de estos basta:

- dos o más candidatos elegibles con plausibilidad comparable
  (categoría `MULTIPLE_HIGH_SCORE` del reporte);
- un mismo pedido CRM es candidato de **varios** pedidos web
  (`ORDER_SHARED_BY_WEBORDERS`);
- mismo total y fecha cercana pero **teléfono distinto**
  (`SAME_TOTAL_DATE_DIFF_PHONE`).

**Regla dura: `AMBIGUOUS` nunca se reconcilia.** Se deja sin vínculo o se
investiga. Vincular mal es peor que no vincular.

### `NO_CANDIDATE`
**Cuándo:** no hay **ningún** candidato elegible (Consulta 3 del reporte).

Causas legítimas: el pedido nunca se creó en el CRM (la importación falló a
medias), se borró después, o los datos cambiaron tanto que ninguna señal aplica.

**Dejarlo sin vínculo es un resultado válido y definitivo.** No es una falla.

### `ALREADY_LINKED_CONFLICT`
**Cuándo:** los únicos pedidos CRM parecidos **ya tienen un `webOrderId` de otra
importación** (categoría `ORDER_ALREADY_LINKED_TO_OTHER_WEB_ORDER`).

Tres explicaciones posibles, y hay que distinguirlas:

1. el parecido es **coincidencia** (mismo cliente, pedidos distintos) → en el
   fondo es `NO_CANDIDATE`;
2. el **otro vínculo está mal** y este pedido web es el dueño real → grave,
   requiere investigación;
3. el pedido web se **procesó dos veces** en su momento.

**No se resuelve solo:** siempre `INVESTIGATE`.

### Mapeo categoría → acción por defecto

| Clasificación | Acción por defecto | ¿Se puede cambiar? |
|---|---|---|
| `CONFIRMED` | `RECONCILE` | Sí, a `REVIEW` si José duda |
| `PROBABLE` | `REVIEW` | Sube a `RECONCILE` solo con corroboración |
| `AMBIGUOUS` | `INVESTIGATE` | **Nunca** a `RECONCILE` directo |
| `NO_CANDIDATE` | `NO_ACTION` | — |
| `ALREADY_LINKED_CONFLICT` | `INVESTIGATE` | **Nunca** a `RECONCILE` directo |

---

## 3. Procedimiento de revisión

Para **cada** pedido web, revisar en **este orden**. El orden importa: va de la
señal más confiable a la menos confiable.

### Paso 1 — Teléfono
La señal **más fuerte** disponible. Se compara normalizado (solo dígitos, y si
quedan 10 se antepone `1`), igual que lo hace la app.

⚠️ **Matiz clave:** el teléfono liga al **cliente**, no al **pedido**. Un cliente
con cinco pedidos da cinco candidatos con el teléfono correcto. El teléfono
**acota**, no **identifica**.

### Paso 2 — Total
Segunda señal más fuerte, **pero no descalifica si no cuadra.**

⚠️ Está confirmado que hay pedidos web históricos cuyo total no corresponde al
precio de lista actual (caso real: 5 × `slaps-tam` + 5 × `slaps-app` con total
`375`, cuando hoy a $40 serían `400`). `web_orders.items` **no guarda el precio
vigente** al momento del pedido, así que la diferencia **no se puede
reconstruir**. Un total que no cuadra es **sospecha, no descarte**.

### Paso 3 — Fecha
La referencia es `approved_at` (cuándo se importó), **no** `created_at` (cuándo
el cliente pidió). Razón: el flujo viejo creaba el pedido CRM con la fecha **del
día de la importación**. El reporte también expone la diferencia contra
`created_at` como señal secundaria.

⚠️ Una diferencia de **1 día puede ser artefacto**, no realidad — ver §5 (bug UTC).

### Paso 4 — Productos
Se compara **solo el conjunto de `productId` distintos**.

⚠️ **Las cantidades NO se comparan.** Un pedido de 5 cajas y otro de 50 cajas de
los mismos productos dan `same_product_set = true` idéntico. Si los productos
coinciden, **revisar las cantidades a mano** en las columnas `items` y
`candidate_order_items`.

⚠️ `same_product_set` en **nulo** significa "no se pudo calcular", **no**
"no coinciden".

### Paso 5 — Cliente
Verificar que `candidate_client_name` y `candidate_client_phone` correspondan al
**mismo negocio** que `negocio` / `encargado` del pedido web. Un cliente creado
por otra vía puede tener nombre distinto para el mismo negocio.

### Paso 6 — Notas ← **la señal decisiva, y no está en el reporte**

**Hallazgo importante.** El flujo viejo escribía en las notas del pedido CRM el
texto literal:

> `Importado de pedido web <id_del_pedido_web>`

(está en `src/components/WebOrders.tsx`, línea 142)

**Esto significa que el id del pedido web puede estar escrito, en texto, dentro
del campo `notes` del pedido del CRM** — incluso en pedidos que no tienen el
campo `webOrderId`.

⚠️ **El reporte actual NO revisa esto.** Sus señales son teléfono, total, fecha y
productos; ninguna mira el texto de las notas.

**Por eso, al revisar cada caso, lo primero que conviene hacer con la columna
`candidate_order_notes` es buscar en ella el `web_order_id`.** Si aparece, el
vínculo es prácticamente determinista y el caso es `CONFIRMED` sin depender de
totales ni fechas.

Se recomienda **ampliar el reporte** con esta señal antes de clasificar (ver §6).
No modifico el reporte en este checkpoint.

### Paso 7 — Score (último, y solo para ordenar)

`candidate_score` se mira **al final** y **solo** para decidir en qué orden
revisar. **Nunca** decide.

**Por qué el score no reemplaza el juicio humano:**

1. **Los pesos son arbitrarios.** 4 / 3 / 2 / 2 son una convención de triage, no
   una medida de probabilidad.
2. **El umbral 7 es arbitrario.** No hay nada especial en 7.
3. **Ignora las cantidades** (paso 4).
4. **Ignora las notas** (paso 6) — precisamente la evidencia más fuerte.
5. **No puede ver la realidad.** Un pedido pudo editarse después de importarse:
   cambiar total, productos o fecha. El score mide el parecido de los datos
   **hoy**, no lo que pasó entonces.
6. **Un score alto con datos escasos engaña.** Pocas señales calculables produce
   puntajes que parecen firmes sin serlo.

Con la fórmula corregida (rev. 3.5.1), ningún candidato llega a 7 sin coincidencia
de teléfono — eso reduce falsos positivos, pero **no convierte el score en
prueba**.

---

## 4. Matriz de decisión

**Hoja de trabajo. Vacía a propósito** — los `web_order_id` reales salen de las
Consultas 2 y 3 del reporte, que aún no se ha ejecutado.

Llenar **una fila por cada uno de los 13** pedidos web:

| # | web_order_id | classification | candidate_order_id | reason | action |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |
| 4 |  |  |  |  |  |
| 5 |  |  |  |  |  |
| 6 |  |  |  |  |  |
| 7 |  |  |  |  |  |
| 8 |  |  |  |  |  |
| 9 |  |  |  |  |  |
| 10 |  |  |  |  |  |
| 11 |  |  |  |  |  |
| 12 |  |  |  |  |  |
| 13 |  |  |  |  |  |

**Reglas para llenarla:**

- `classification` — exactamente una de: `CONFIRMED`, `PROBABLE`, `AMBIGUOUS`,
  `NO_CANDIDATE`, `ALREADY_LINKED_CONFLICT`.
- `candidate_order_id` — el id del pedido CRM elegido. **Vacío** en
  `NO_CANDIDATE`. En `AMBIGUOUS`, listar **todos** los que compiten.
- `reason` — en una frase, **qué evidencia** sostiene la decisión (ej. "id del
  pedido web en las notas"; "teléfono + total + mismo día"; "dos candidatos con
  el mismo total"). Si `reason` solo dice "score alto", **la fila no está lista**.
- `action` — una de:

| Acción | Significado |
|---|---|
| `NO_ACTION` | Se queda sin vínculo, definitivo. No se escribe nada. |
| `REVIEW` | Falta un dato para decidir. Segunda pasada. |
| `RECONCILE` | Evidencia concluyente. Entra al SQL de reconciliación. |
| `INVESTIGATE` | Hay un conflicto real que hay que entender antes de tocar nada. |

**Condición de cierre:** las 13 filas con `classification` y `action`. Ninguna
fila puede quedar vacía; `NO_ACTION` es una decisión válida, dejarla en blanco no.

### Recuento de control (llenar al terminar)

| Clasificación | Cantidad |
|---|---|
| `CONFIRMED` |  |
| `PROBABLE` |  |
| `AMBIGUOUS` |  |
| `NO_CANDIDATE` |  |
| `ALREADY_LINKED_CONFLICT` |  |
| **Total (debe ser 13)** |  |

---

## 5. Riesgos conocidos

### 5.1 Pedidos compartidos
Un mismo pedido CRM puede ser candidato de **varios** pedidos web
(`ORDER_SHARED_BY_WEBORDERS`). Un pedido solo puede pertenecer a **uno**.

**Riesgo:** reconciliar dos pedidos web al mismo pedido CRM. El índice único lo
rechazaría (protección real), pero el error de criterio ya estaría cometido.
**Mitigación:** revisar los casos compartidos **juntos**, nunca por separado.

### 5.2 Múltiples candidatos
Dos o más candidatos con plausibilidad comparable (`MULTIPLE_HIGH_SCORE`).

**Riesgo:** elegir "el del score más alto" cuando la diferencia de puntaje es de
un punto y no significa nada.
**Mitigación:** `AMBIGUOUS` → `INVESTIGATE`. Si no hay evidencia que rompa el
empate, no se reconcilia.

### 5.3 Diferencias de precio históricas
`web_orders.items` **no guarda** `priceAtSale`. Los precios de lista cambiaron
(caso confirmado: total `375` vs. `400` a precio actual).

**Riesgo doble:**
- descartar un candidato correcto porque el total no cuadra;
- aceptar uno incorrecto porque el total cuadra por casualidad.

**Mitigación:** el total nunca decide solo. Es deuda técnica ya documentada
(el sitio debería guardar snapshot de precio/costo/unidad al crear el pedido web).

### 5.4 Pedidos ya reconciliados
**Nunca hubo un proceso formal de reconciliación**, así que no hay registro de
intentos previos. Pero pudo haber correcciones manuales en el CRM.

**Riesgo:** volver a vincular algo que José ya arregló a mano por otra vía, o
duplicar un ajuste.
**Mitigación:** en `CONFIRMED`, confirmar que el pedido CRM no muestra señales de
haber sido corregido ya (notas, estado, fechas de pago inconsistentes).

### 5.5 Candidatos descartados por pertenecer a otro `webOrder`
El reporte los **excluye** del ranking y los muestra aparte
(`ORDER_ALREADY_LINKED_TO_OTHER_WEB_ORDER`).

**Riesgo:** que el vínculo existente sea el **equivocado** y el dueño real sea uno
de estos 13. Excluirlo lo esconde del ranking normal.
**Mitigación:** revisar **siempre** esa categoría de la Consulta 4, aunque el caso
haya salido `NO_CANDIDATE`. La Consulta 3 incluye
`descartados_por_ya_vinculados` precisamente para no perder de vista que había
parecidos, solo inelegibles.

### 5.6 Riesgos adicionales detectados (no estaban en la lista pedida)

**a) Cantidades no comparadas.** `same_product_set` compara solo el conjunto de
productos, no cuántas cajas. Dos pedidos muy distintos en tamaño pueden verse
idénticos en esa señal. **Revisar cantidades a mano.**

**b) Bug de zona horaria (UTC).** El proyecto tiene documentado un bug conocido:
los pedidos capturados después de ~5pm hora del Pacífico se guardan con la fecha
del día siguiente (prioridad abierta en `CLAUDE.md`: *"Bug UTC en pedidos después
de ~5pm PT"*). **Consecuencia directa:** un `date_difference_days = 1` puede ser
un artefacto del bug y no una diferencia real. **No descartar candidatos por un
solo día de diferencia.**

**c) La señal de las notas no está en el reporte** (§3, paso 6). Es la evidencia
más fuerte disponible y hoy hay que buscarla a ojo en `candidate_order_notes`.

**d) Los 13 no bloquean técnicamente la migración** (§1). El riesgo aquí es de
proceso: dejar la migración detenida indefinidamente esperando una reconciliación
que es independiente, mientras el bug de duplicados sigue vivo en producción.

---

## 6. Próximos pasos

### Secuencia obligatoria

1. **Ejecutar el reporte** de reconciliación (solo lectura) y guardar los
   resultados de las 4 consultas.
2. **(Recomendado antes del paso 3)** Ampliar el reporte con la **señal de las
   notas** (§3, paso 6): buscar el `web_order_id` dentro de
   `candidate_order_notes`. Es la evidencia más fuerte disponible y puede
   resolver varios casos de forma casi determinista, ahorrando trabajo manual.
   Requiere aprobación aparte; no lo hice en este checkpoint.
3. **Llenar la matriz** (§4) con las 13 filas clasificadas.
4. **Revisar el recuento de control** y cerrar los `REVIEW` e `INVESTIGATE`.

### Solo después de clasificar los 13

**Solo cuando las 13 filas estén clasificadas podrá diseñarse un SQL de
reconciliación**, y ese SQL:

- será **un archivo independiente**, separado de la migración principal;
- **no** se mezclará con `2026-07-24_import_web_order.sql` ni con su rollback;
- actuará **únicamente** sobre las filas marcadas `RECONCILE` — nunca sobre
  `AMBIGUOUS`, `NO_CANDIDATE` ni `ALREADY_LINKED_CONFLICT`;
- será el **primer archivo de este sprint que escribe datos**, así que necesitará
  su propia aprobación explícita, su propio rollback y una lista cerrada de ids
  (nada de heurísticas de "score alto" ejecutándose solas);
- **depende de que la migración esté aplicada** si el vínculo se va a guardar en
  `processed_order_id` (esa columna no existe antes).

### Lo que NO se hace

- ❌ No se reconcilia por monto, teléfono o fecha automáticamente.
- ❌ No se usa `candidate_score` como criterio de escritura.
- ❌ No se toca la migración principal ni su rollback.
- ❌ No se modifican pedidos históricos más allá de escribir el vínculo aprobado.
- ❌ No se borra ningún pedido web ni pedido CRM.

### Decisión pendiente para José

**¿Migrar primero o reconciliar primero?** Recomendación técnica: **migrar
primero**. Razones: (a) los 13 casos no producen conflicto con el índice único
(precheck: 0 duplicados); (b) la migración crea la columna donde se guardará el
vínculo; (c) cada día sin migrar es un día en que el bug de importación duplicada
sigue expuesto en producción. La reconciliación puede ocurrir después, con calma,
sobre una base que ya está protegida.

Falta además cerrar `operational_index_review_required`: revisar el número de
filas y el tamaño de `orders` (Consulta 11 del precheck) para decidir si el
índice se crea de forma normal o concurrente.
