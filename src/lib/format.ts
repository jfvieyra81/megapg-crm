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

/** Format a discount fraction as a percentage string preserving precision.
 *  Examples: 0.125 → "12.5", 0.0625 → "6.25", 0.03125 → "3.125", 0 → "0".
 *  Avoids the misleading rounding of Math.round(disc * 100) which shows 13%
 *  for actual 12.5%. Agregado en Block 4.h. */
export const fmtPct = (disc: number): string =>
  (+(disc * 100).toFixed(4)).toString();
