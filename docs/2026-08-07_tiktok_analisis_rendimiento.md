# TikTok — Análisis de rendimiento (v1)

**CRM:** v5.32.0  
**Alcance:** análisis en el navegador de los videos y clasificaciones ya
guardadas. No agrega tablas, no cambia la sincronización y no llama a una IA.

## Métricas

- **Interacción:** `(likes + comentarios + compartidos) / vistas × 100`.
- **Comentarios por 1,000 vistas:** `comentarios / vistas × 1,000`.
- **Compartidos por 1,000 vistas:** `compartidos / vistas × 1,000`.

Los resultados se agrupan por producto, tema y formato. Cada grupo muestra el
número de videos y vistas que lo respaldan. Los grupos con menos de tres videos
se marcan como **muestra preliminar**: sirven para explorar, no para tomar una
decisión definitiva.

## Prueba manual en producción

1. Entra como administrador a **TikTok Intelligence**.
2. Confirma que aparece **Análisis de rendimiento** arriba de los videos.
3. Clasifica por lo menos tres videos con producto, tema y formato.
4. Confirma que los paneles Productos, Temas y Formatos muestran los grupos y
   sus métricas.
5. Presiona **Sincronizar** y confirma que las métricas y clasificaciones se
   conservan.

## Trabajo diferido

- El siguiente bloque puede usar estas métricas para recomendar ideas y guiones
  con IA. Antes se requieren más videos clasificados para que la recomendación
  tenga una muestra confiable.
