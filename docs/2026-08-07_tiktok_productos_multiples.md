# TikTok — Producto principal y productos secundarios

**CRM:** v5.33.0

Cada clasificación conserva un **producto principal** (`product_id`) y guarda
todos los productos presentes en `product_ids`. Esto permite analizar recetas,
combos y promociones sin atribuir indebidamente el resultado a un solo
producto.

## Paso obligatorio antes del deploy

En Supabase Dashboard → SQL Editor, ejecutar completo:

`supabase/2026-08-07_tiktok_video_secondary_products.sql`

El script no borra datos. Copia automáticamente el producto principal de las
clasificaciones existentes a la nueva lista de productos.

## Prueba manual

1. Edita un video y elige un producto principal.
2. Marca uno o más productos secundarios.
3. Guarda y recarga: todos deben seguir visibles en el resumen.
4. Confirma que el panel Productos contabiliza el video para cada producto que
   aparece en él.
