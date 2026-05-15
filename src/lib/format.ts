// src/lib/format.ts
//
// Utilidades de formato compartidas entre componentes.
// Extraídas de App.tsx en Block 4.b del refactor.

/** Genera un ID corto tipo base-36 (timestamp + random). */
export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Formatea un número como moneda USD ($1,234.56). Null-safe → "$0.00". */
export const fmt = (n: number | null | undefined): string =>
  "$" + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Formatea una fecha ISO como "May 6, 2026". Null-safe → devuelve el input. */
export const fmtD = (d: string | null | undefined): string => {
  try {
    if (!d) return d as string;
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d as string;
  }
};
