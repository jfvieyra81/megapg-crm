// src/lib/business/commissions.ts
//
// Reglas de negocio del cálculo de comisiones del Representante.
// Funciones puras (sin estado, sin React, sin localStorage) — testeables
// en aislamiento.
//
// Referencias §X.Y apuntan al contrato de Francisco Carbajal.
//
// Extraído desde App.jsx en Sesión 2 bloque 3 del refactor. Cero cambio
// de comportamiento — sólo se les agregaron tipos.

import {
  ACTIVE_ACCOUNT_DAYS,
  NEW_ACCOUNT_LOOKBACK_DAYS,
  COMM_RATE_NEW,
  COMM_RATE_RESIDUAL,
  COMM_RATE_PHASE2_BONUS,
  MOROSO_DAYS,
  POST_TERMINATION_TAIL_MONTHS,
  MILESTONES,
  type Milestone,
} from "../contract";
import type { Client, Order, Representative } from "../../types/domain";

// ============================================================
// Helpers internos (no exportados)
// ============================================================

/** Días enteros transcurridos desde una fecha hasta hoy. Robusto a inputs
 *  inválidos (devuelve 999 para forzar comportamiento "viejo" sin romper). */
const daysSince = (d: string | Date | null | undefined): number => {
  try {
    if (!d) return 999;
    return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  } catch {
    return 999;
  }
};

// ============================================================
// Cuentas activas y nuevas (Deploy A — §1, §4.1)
// ============================================================

/** §1: "Cuenta Activa" = el cliente tiene al menos un pedido cobrado en
 *  los últimos N días, relativo a refDate (default: hoy). */
export const isActiveAccount = (
  clientId: string,
  orders: Order[],
  refDate: Date | string = new Date(),
): boolean => {
  const ref = new Date(refDate).getTime();
  return orders.some(o => {
    if (o.clientId !== clientId || o.status !== "paid" || !o.paidDate) return false;
    const paid = new Date(o.paidDate).getTime();
    const diffDays = (ref - paid) / 86400000;
    return diffDays >= 0 && diffDays <= ACTIVE_ACCOUNT_DAYS;
  });
};

/** §1, §4.1: "Cuenta Nueva al momento del cobro" = el cliente NO tenía
 *  pedidos cobrados en los 365 días previos al paidDate del pedido en
 *  cuestión. Si el cliente tiene priorHistoryBeforeRep=true y
 *  representativeId, NUNCA cuenta como Nueva (porque la historia previa
 *  invalida el bono del 7%). */
export const wasNewAccountAt = (
  client: Client | null | undefined,
  paidOrder: Order,
  allOrders: Order[],
): boolean => {
  if (!paidOrder?.paidDate) return false;
  if (client?.representativeId && client?.priorHistoryBeforeRep) return false;
  const cutoff = new Date(paidOrder.paidDate).getTime() - NEW_ACCOUNT_LOOKBACK_DAYS * 86400000;
  return !allOrders.some(o => {
    if (o.id === paidOrder.id) return false;
    if (o.clientId !== paidOrder.clientId) return false;
    if (o.status !== "paid" || !o.paidDate) return false;
    const t = new Date(o.paidDate).getTime();
    return t >= cutoff && t < new Date(paidOrder.paidDate!).getTime();
  });
};

/** §4.4: Cuántas Cuentas Activas simultáneas tiene el rep a una fecha
 *  dada. Es la métrica que dispara los milestones. */
export const activeAccountsForRep = (
  representativeId: string,
  clients: Client[],
  orders: Order[],
  refDate: Date | string = new Date(),
): number => {
  return clients
    .filter(c => c.representativeId === representativeId && isActiveAccount(c.id, orders, refDate))
    .length;
};

/** §4.4: Milestones alcanzados por un peak de cuentas activas. */
export const milestonesEarnedAt = (peakActive: number): Milestone[] =>
  MILESTONES.filter(m => peakActive >= m.count);

// ============================================================
// Helpers de mes (formato YYYY-MM)
// ============================================================

/** "2026-05" → "mayo de 2026" (español MX, lowercase). */
export const monthLabel = (yyyymm: string): string => {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });
};

/** "2026-05" → { start: 1 mayo 00:00, end: 1 junio 00:00 }.
 *  end es exclusivo (semi-abierto [start, end)) para evitar bugs de borde. */
export const monthBounds = (yyyymm: string): { start: Date; end: Date } => {
  const [y, m] = yyyymm.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0);
  return { start, end };
};

/** ¿Cae dateISO dentro del mes yyyymm? null/undefined → false. */
export const isInMonth = (
  dateISO: string | null | undefined,
  yyyymm: string,
): boolean => {
  if (!dateISO) return false;
  const { start, end } = monthBounds(yyyymm);
  const d = new Date(dateISO).getTime();
  return d >= start.getTime() && d < end.getTime();
};

// ============================================================
// Reglas de Deploy C: Phase 2, terminación, tasa efectiva
// ============================================================

/** §11.4: ¿Está activa la Fase 2 del rep en una fecha dada?
 *  Requiere phase2Active=true Y atISO >= phase2StartDate. */
export const isPhase2ActiveAt = (
  rep: Representative | null | undefined,
  atISO: string | null | undefined,
): boolean => {
  if (!rep?.phase2Active || !rep?.phase2StartDate || !atISO) return false;
  return new Date(atISO).getTime() >= new Date(rep.phase2StartDate).getTime();
};

export interface TerminationStatus {
  /** Cobrado tras la terminación pero dentro de los 24m de cola. */
  inTail: boolean;
  /** Cobrado >24m después de la terminación → no devenga comisión. */
  afterTail: boolean;
  /** Cobrado durante el contrato vigente o sin terminación registrada. */
  withinContract: boolean;
}

/** §10.3: Determina en qué ventana cayó un cobro respecto a la fecha de
 *  terminación del rep. Si rep.terminatedDate es vacío → siempre
 *  withinContract:true. */
export const terminationStatus = (
  rep: Representative | null | undefined,
  paidDateISO: string | null | undefined,
): TerminationStatus => {
  if (!rep?.terminatedDate || !paidDateISO) {
    return { inTail: false, afterTail: false, withinContract: true };
  }
  const paid = new Date(paidDateISO).getTime();
  const term = new Date(rep.terminatedDate).getTime();
  if (paid <= term) return { inTail: false, afterTail: false, withinContract: true };

  const tailEnd = new Date(rep.terminatedDate);
  tailEnd.setMonth(tailEnd.getMonth() + POST_TERMINATION_TAIL_MONTHS);
  if (paid <= tailEnd.getTime()) {
    return { inTail: true, afterTail: false, withinContract: false };
  }
  return { inTail: false, afterTail: true, withinContract: false };
};

export interface EffectiveCommissionResult {
  /** Tasa efectiva (0 a 1). 0 si está fuera del plazo de cola. */
  rate: number;
  /** Etiqueta legible: "Nueva", "Residual", "Nueva + Fase 2",
   *  "Residual (cola post-salida)", "Fuera de plazo (>24m)". */
  classification: string;
  phase2Applied: boolean;
  tailApplied: boolean;
  /** True si el rep ya estaba terminado al momento del cobro. */
  terminated: boolean;
}

/** Tasa de comisión efectiva para un pedido cobrado, aplicando todas las
 *  reglas en orden:
 *    1. §10.3: fuera de cola → 0%
 *    2. §10.3: dentro de cola → 5% flat (sin Fase 2, sin bono nueva cuenta)
 *    3. Contrato vigente: 7% si nueva, 5% si residual; +2% si Fase 2 activa.
 */
export const effectiveCommissionRate = (
  rep: Representative,
  client: Client | null | undefined,
  paidOrder: Order,
  allOrders: Order[],
): EffectiveCommissionResult => {
  const { inTail, afterTail } = terminationStatus(rep, paidOrder.paidDate);

  if (afterTail) {
    return {
      rate: 0,
      classification: "Fuera de plazo (>24m)",
      phase2Applied: false,
      tailApplied: false,
      terminated: true,
    };
  }

  if (inTail) {
    return {
      rate: COMM_RATE_RESIDUAL,
      classification: "Residual (cola post-salida)",
      phase2Applied: false,
      tailApplied: true,
      terminated: true,
    };
  }

  // Contrato vigente
  const isNew = wasNewAccountAt(client, paidOrder, allOrders);
  const baseRate = isNew ? COMM_RATE_NEW : COMM_RATE_RESIDUAL;
  const phase2 = isPhase2ActiveAt(rep, paidOrder.paidDate);
  const finalRate = phase2 ? baseRate + COMM_RATE_PHASE2_BONUS : baseRate;
  const cls = isNew ? "Nueva" : "Residual";
  return {
    rate: finalRate,
    classification: phase2 ? `${cls} + Fase 2` : cls,
    phase2Applied: phase2,
    tailApplied: false,
    terminated: false,
  };
};

// ============================================================
// Morosos (Deploy C — §6.2)
// ============================================================

/** Pedido entregado a un cliente del rep, pero >MOROSO_DAYS sin cobrar. */
export interface MorosoEntry {
  order: Order;
  /** undefined si el cliente fue borrado pero el pedido sigue (datos legacy). */
  client: Client | undefined;
  /** Días de retraso por encima del umbral MOROSO_DAYS. */
  daysOverdue: number;
}

/** §6.2: Lista de pedidos morosos del rep, ordenados por días de
 *  retraso descendente. */
export const getMorososForRep = (
  repId: string,
  clients: Client[],
  orders: Order[],
): MorosoEntry[] => {
  const repClientIds = new Set(
    clients.filter(c => c.representativeId === repId).map(c => c.id),
  );
  return orders
    .filter(o => {
      if (!repClientIds.has(o.clientId)) return false;
      if (o.status !== "delivered") return false;
      return daysSince(o.date) > MOROSO_DAYS;
    })
    .map(o => ({
      order: o,
      client: clients.find(c => c.id === o.clientId),
      daysOverdue: daysSince(o.date) - MOROSO_DAYS,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
};
