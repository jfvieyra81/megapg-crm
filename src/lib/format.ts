// src/lib/format.ts
//
// Helpers de formato compartidos: moneda, fecha, IDs únicos.
// Funciones puras — testeables en aislamiento.
//
// Extraído de App.jsx en Sesión 2 bloque 4 del refactor.

/** Genera un ID único (timestamp en base 36 + random). Para client-side
 *  donde no necesitamos garantía criptográfica. */
export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Formato moneda en USD: 1234.5 → "$1,234.50". Tolerante a inputs no
 *  numéricos (los trata como 0). */
export const fmt = (n: number | null | undefined): string =>
  "$" + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Formato de fecha legible en inglés US: "2026-05-06" → "May 6, 2026".
 *  Robusto a inputs inválidos (devuelve el input original). */
export const fmtD = (d: string | Date | null | undefined): string => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
};
