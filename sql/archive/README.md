# sql/archive — consultas de auditoría (fuera del flujo normal)

Estos archivos **no forman parte del flujo normal del sistema**. Son consultas
forenses de **solo lectura** que se usaron una vez, en julio de 2026, para
investigar los 13 pedidos web históricos que quedaron sin vínculo a un pedido
del CRM.

**No hay que ejecutarlos de forma rutinaria.** Para la consulta cotidiana existe
una vista permanente:

```sql
select * from public.vw_web_orders_pending_reconciliation;
```

Contexto y decisiones: [`docs/RECONCILIACION_HISTORICA.md`](../../docs/RECONCILIACION_HISTORICA.md)

## Contenido

| Archivo | Qué es |
|---|---|
| `2026-07-24_reporte_reconciliacion_web_orders.sql` | Reporte forense completo (rev. 3.6.1), 4 consultas en un archivo. |
| `consulta_1_resumen.sql` | Consulta 1 extraída, ejecutable por sí sola: resumen/conteos. |
| `consulta_2_detalle.sql` | Consulta 2 extraída: detalle de candidatos (top 5 por pedido web). |
| `consulta_3_sin_candidatos.sql` | Consulta 3 extraída: pedidos web sin candidato elegible. |
| `consulta_4_ambiguedades.sql` | Consulta 4 extraída: 7 categorías de ambigüedad y contexto. |

Los cuatro `consulta_*.sql` son extracciones **byte a byte** del reporte grande;
cada uno lleva su propio bloque `WITH` y no depende de los demás.

## Reglas

- **Solo lectura.** Ninguno contiene `INSERT`, `UPDATE`, `DELETE`, `ALTER`,
  `CREATE`, `DROP`, `GRANT` ni `REVOKE`.
- **No reconcilian nada.** Lo que llaman "candidato" es una pista heurística,
  nunca una coincidencia confirmada.
- **La lógica está duplicada** en la vista `vw_web_orders_pending_reconciliation`
  (misma normalización, mismas señales, misma fórmula de score de la rev. 3.6.1).
  Si algún día se cambia una regla, hay que cambiarla en los dos lugares.
