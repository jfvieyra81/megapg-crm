# CLAUDE.md — Mega PG CRM (Dulce Sabor)

CRM de distribución de dulces (React + TypeScript estricto + Vite), en producción
en Vercel (megapg-crm.vercel.app), con sincronización a Supabase. Dueño: José —
**no técnico, hispanohablante: comunícate en español, paso a paso, sin jerga**.
Usuario de campo: Francisco (representante, usa la app desde el celular).

## Reglas de trabajo (obligatorias)

1. **Decisión primero:** presenta opciones numeradas con pros/contras y espera a
   que José elija antes de escribir código. Un bloque/tema a la vez, nunca dos
   frentes abiertos.
2. **Puerta de validación, en este orden exacto:**
   `npx tsc --noEmit` → `npx esbuild src/App.tsx --format=esm --jsx=automatic`
   → `npm run build` → commit → push → smoke test en producción (Vercel).
   No hay pruebas locales de runtime: el login por magic link no funciona en
   localhost, así que todo se verifica en producción después del deploy.
3. **`git status --short` antes de cada `git add`/commit.** Los archivos nuevos
   se agregan explícitamente por nombre. (Un archivo sin trackear causó una
   caída de producción de 4 días: Vercel compilaba en ~5s fallando en silencio.)
4. **Cada release bumpea DOS cosas:** la etiqueta `CRM vX.Y.Z` en `src/App.tsx`
   y `CACHE_NAME` en `public/sw.js`. Sin excepción — el número de versión es la
   herramienta de diagnóstico de caché en los dispositivos de José.
5. **Cero cambios de comportamiento en desktop** cuando el bloque es móvil, y
   cero cambios de lógica cuando el bloque es refactor estructural (moves puros).
6. **Mensajes de commit detallados** (heredoc): decisión tomada, deuda aceptada,
   trabajo diferido. No one-liners.
7. **Señal de Vercel:** build de ~5s = falló la compilación; 10–12s = éxito.
   Badge "Ready Stale" = el build promovido está detrás de commits más nuevos.
8. Un bloque NO está "hecho" hasta que su commit aparece en `origin/main` y
   José lo confirmó en producción (idealmente también en su teléfono).

## Arquitectura y trampas conocidas

- `src/App.tsx` está bajo **`@ts-nocheck`** y excluido de `tsc` — valida su
  sintaxis con esbuild (regla 2). Los componentes extraídos en
  `src/components/*.tsx` y libs en `src/lib/*.ts` SÍ son TypeScript estricto.
- **Sincronización nube:** `CLOUD_TABLES` en App.tsx define qué se sincroniza
  (representatives, clients, orders, commissions, inventory, purchases).
  `inventory` no tiene `id` propio: su llave es `productId` (ver `cloudKeyOf` y
  `mergeByKey`). Fusión = unión por llave, en conflicto gana la nube (LWW).
  **Aún NO se sincronizan:** visits, reminders, followups, welcomes, templates,
  campaign — viven solo en el localStorage de cada dispositivo.
- Los datos compartidos (catálogo, constantes de negocio) se **inyectan como
  props** a los componentes extraídos, no se importan directo.
- `??` no atrapa strings vacíos — para enums/idioma usa igualdad explícita
  (`=== "es" || === "en"`).
- Detección móvil: hook `useIsMobile` (max-width 768px). ⚠️ Chrome Android con
  "Sitio de escritorio" activado la rompe (viewport ancho) — es lo primero que
  hay que revisar si alguien reporta "se ve como computadora" en el celular.
- Duplicación temporal de constantes (TIER_CLR, LOW, etc.) en componentes:
  deuda aceptada; se limpia en un pase de dedup dedicado, no al pasar.

## Prioridades abiertas (2026-07-13)

1. **RLS/seguridad (top):** endurecer políticas de las tablas core + las nuevas
   `inventory`/`purchases` (hoy permisivas) + `public_stores` pendiente.
   `customer_orders` y `web_orders` ya quedaron cerradas.
2. Pedido de campo: historial del cliente + "repetir último pedido".
3. Sincronizar visits/reminders/followups (mismo patrón que inventory).
4. Bug UTC en pedidos después de ~5pm PT (`todayLocal()` pendiente).
5. Tailwind: diferido a propósito hasta terminar el refactor estructural.

Los SQL que José debe correr en Supabase se guardan en `supabase/*.sql`
con fecha, y se le dan con instrucciones de pegar-y-Run (él no escribe SQL).
