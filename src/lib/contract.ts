/**
 * Contrato Representante v2 — constantes contractuales
 *
 * Estos valores codifican cláusulas del contrato firmado.
 * NO modificar sin acuerdo escrito y bump de versión del contrato.
 *
 * Extraído de App.jsx en Sesión 2 del refactor TypeScript (v5.19).
 */

// === §1 — Definiciones de cuenta ===

/** "Cuenta Activa" = compró en últimos 90 días (§1) */
export const ACTIVE_ACCOUNT_DAYS = 90;

/** "Cuenta Nueva" = sin compras en los 12 meses previos (§1) */
export const NEW_ACCOUNT_LOOKBACK_DAYS = 365;

// === §4 — Tasas de comisión ===

/** 7% sobre primer cobro de Cuenta Nueva (§4.1) */
export const COMM_RATE_NEW = 0.07;

/** 5% sobre cobros subsecuentes (§4.2) */
export const COMM_RATE_RESIDUAL = 0.05;

/** +2% rev share aditivo durante Fase 2 (§11.4 + §12.1) */
export const COMM_RATE_PHASE2_BONUS = 0.02;

// === §4.4 — Milestones ===

/** Bono one-time al cruzar umbral de Cuentas Activas simultáneas */
export type Milestone = {
  readonly count: number;
  readonly bonus: number;
};

/** Bonos por umbral de Cuentas Activas simultáneas (§4.4) */
export const MILESTONES: readonly Milestone[] = [
  { count: 25, bonus: 500 },
  { count: 50, bonus: 1000 },
  { count: 75, bonus: 1500 },
];

// === §6 — Cobros y morosidad ===

/** Pedido entregado y >60d sin cobrar = moroso (§6.2) */
export const MOROSO_DAYS = 60;

// === §10 — Terminación ===

/** Cola de 24 meses tras terminación sin causa justa (§10.3) */
export const POST_TERMINATION_TAIL_MONTHS = 24;

// === Identificadores estables (no contractuales) ===

/** ID estable del representante Francisco Carbajal (pre-seeded) */
export const REP_FRANCISCO_ID = "rep-francisco-carbajal";
