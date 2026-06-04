// src/types/domain.ts
//
// Tipos del modelo de datos de megapg-crm.
//
// Estos tipos describen la forma de los datos que viven en localStorage
// y en Supabase. Se usan al tipar funciones de App.tsx por dominio
// (Sesión 2 bloque 2 del refactor).
//
// Convenciones:
// - Fechas con sufijo "Date" sin timezone: formato YYYY-MM-DD (ej: "2026-05-06").
// - Fechas con sufijo "ed" / "created": ISO completo (ej: "2026-05-06T12:00:00.000Z").
// - Campos opcionales (?) son los que no siempre se guardan: ya sea porque
//   son features posteriores a v5.0 (datos viejos no los tienen) o porque
//   sólo se setean en ciertos flujos (ej: source="web" sólo en imports web).
// - Las referencias §X.Y apuntan al contrato del Representante (Francisco Carbajal).

import type { Milestone } from "../lib/contract";

// ============================================================
// Strings literales conocidos
// ============================================================

/** Tier de descuento del cliente — afecta pricing en pedidos.
 *  Mapeado a porcentajes en TIER_DISC. */
export type ClientTier = "Lista" | "Bronce" | "Plata" | "Oro";

/** Estados del pedido — workflow lineal pending → delivered → paid.
 *  Sólo "paid" devenga comisión (§4). */
export type OrderStatus = "pending" | "delivered" | "paid";

/** Origen de cliente o pedido. */
export type Source = "web";

/** Idioma preferido del cliente para recibos y mensajes WhatsApp.
 *  Default cuando undefined: "es" (preserva comportamiento de clientes legacy). */
export type Language = "en" | "es";

// ============================================================
// Cliente
// ============================================================

export interface Client {
  id: string;
  name: string;
  contact: string;          // persona contacto / encargado
  phone: string;
  email?: string;           // correo del cliente (opcional)
  address: string;
  zone: string;             // libre; valida contra ZONES en runtime
  tier: ClientTier;
  notes: string;

  /** ISO datetime — se setea al crear; clientes muy viejos pueden no tenerlo. */
  created?: string;

  /** "web" si el cliente fue creado al importar un pedido de dulcesaborca.com. */
  source?: Source;

  // ---- Visibilidad pública en dulcesaborca.com/donde-comprar (v5.10) ----
  showOnWebsite?: boolean;
  publicDisplayName?: string;
  publicHours?: string;
  publicPhotoUrl?: string;
  websitePermissionDate?: string;   // YYYY-MM-DD
  permissionConfirmed?: boolean;

  // ---- Asignación a representante (Deploy A — §1, §4.1) ----
  representativeId?: string;
  /** Si true, el cliente tenía historia de compra antes de ser asignado al rep
   *  → nunca cuenta como "Cuenta Nueva" para fines de comisión 7%. */
  priorHistoryBeforeRep?: boolean;
  /** Idioma preferido para recibos y mensajes WhatsApp.
   *  undefined = fallback a "es" (clientes legacy). Agregado en Block 4.f. */
  language?: Language;
}

// ============================================================
// Formulario de alta/edición de Cliente
// ============================================================

/** Estado del formulario de alta/edición del componente Clients.
 *  NO incluye `id`, `created`, `source` — esos se asignan al guardar
 *  (o vienen del cliente existente al editar). Todos los campos son
 *  requeridos como string/boolean con defaults vacíos para que React
 *  no se queje de inputs uncontrolled. Agregado en Block 4.e. */
export interface ClientFormState {
  name: string;
  address: string;
  phone: string;
  email: string;
  contact: string;
  zone: string;
  tier: ClientTier;
  notes: string;
  showOnWebsite: boolean;
  publicDisplayName: string;
  publicHours: string;
  publicPhotoUrl: string;
  websitePermissionDate: string;
  permissionConfirmed: boolean;
  representativeId: string;
  priorHistoryBeforeRep: boolean;
  /** Idioma del cliente, requerido en el form. Default "es" en nuevos clientes.
   *  Block 4.f. */
  language: Language;
}


// ============================================================
// Pedido
// ============================================================

/** Unidad de venta de un line item. "case" = caja (default, comportamiento
 *  histórico); "bag" = bolsa suelta (ventas chicas / "calar"). */
export type SaleUnit = "case" | "bag";

export interface OrderItem {
  productId: string;        // referencia a PRODUCTS[].id (catálogo Mega PG)
  qty: number;              // cajas; ≥ 1

  /** Precio unitario (USD/caja) al momento de la venta. Opcional para backward
   *  compat con pedidos legacy. Si undefined, fallback al precio actual del
   *  catálogo (pF(productId).price). Agregado en Block 4.g. */
  priceAtSale?: number;
  /** Costo unitario (USD/caja) al momento de la venta. Mismo patrón de fallback.
   *  Agregado en Block 4.g. */
  costAtSale?: number;
  /** Unidad de venta. undefined ⇒ "case" (compat con pedidos legacy). */
  unit?: SaleUnit;
}

export interface Order {
  id: string;
  clientId: string;
  date: string;             // YYYY-MM-DD — fecha del pedido
  items: OrderItem[];
  total: number;            // total con descuento aplicado
  discount: number;         // 0 a 1 — descuento de tier al momento del pedido
  status: OrderStatus;
  notes: string;

  /** ISO datetime — sólo en pedidos creados desde v5.x manualmente. */
  created?: string;

  // ---- Origen web (v5.x) ----
  source?: Source;
  webOrderId?: string;      // id del web_order si vino de dulcesaborca.com

  // ---- Cobro (Deploy A — §1) ----
  /** YYYY-MM-DD del día en que se cobró. Se setea automáticamente cuando
   *  status pasa a "paid"; se limpia (null) si vuelve atrás. */
  paidDate?: string | null;

  // ---- Devolución / refund (Deploy C — §6.1) ----
  returnedAmount?: number;          // dólares devueltos al cliente
  returnedDate?: string | null;     // YYYY-MM-DD del refund
  returnedNotes?: string;
}

// ============================================================
// Visita de campo
// ============================================================

export interface Visit {
  id: string;
  storeName: string;        // requerido — clave de identificación
  address: string;
  phone: string;
  contact: string;
  zone: string;             // libre; valida contra ZONES
  storeType: string;        // libre; valida contra STORE_TYPES
  date: string;             // YYYY-MM-DD
  brand: string;            // libre; valida contra BRANDS
  productsSeen: string[];   // multi-select; valida contra PRODUCTS_SEEN
  supplier: string;         // libre; valida contra SUPPLIERS
  /** Precio público observado por bolsa. El form usa "" cuando vacío,
   *  el render lo trata como 0. */
  publicPrice: number | "";
  interest: string;         // libre; valida contra INTEREST_LVL
  painPoints: string;
  leftSamples: boolean;
  samplesQty: number | "";
  notes: string;
  competitorProducts: string;
  footTraffic: string;      // "High" | "Medium" | "Low" | ""

  /** ISO datetime — sólo en visitas creadas desde v5.x. */
  created?: string;
}

// ============================================================
// Representante de ventas
// ============================================================

export interface Representative {
  id: string;
  name: string;
  phone: string;
  email: string;
  contractDate: string;     // YYYY-MM-DD — fecha de inicio del contrato
  notes: string;

  // ---- Phase 2 (§11.4 + §12.1) — bonus aditivo de +2% sobre cobros ----
  phase2Active: boolean;
  /** YYYY-MM-DD; vacío si nunca se activó. Comisión Fase 2 sólo aplica a
   *  pedidos con paidDate >= esta fecha. */
  phase2StartDate: string;

  /** Milestones (§4.4) ya cobrados — array de los `count` umbral.
   *  Ej: [25, 50] = ya cobró el bono de 25 y 50, pendiente 75. */
  milestonesPaid: number[];

  // ---- Terminación (§10.3) ----
  /** YYYY-MM-DD; vacío si activo. Tras esta fecha aplica cola post-salida
   *  (24m al 5% flat, sin Fase 2, sin nuevas cuentas, sin milestones). */
  terminatedDate: string;

  /** ISO datetime — sólo en reps creados desde v5.14+. */
  created?: string;
}

// ============================================================
// Comisión (registro mensual congelado)
// ============================================================

/** Tipo de línea: venta cobrada (positiva) o devolución (negativa). */
export type CommissionLineKind = "sale" | "return";

/** Línea de detalle dentro de una comisión mensual.
 *  Cada pedido cobrado y cada refund del mes generan una línea. */
export interface CommissionLine {
  kind: CommissionLineKind;
  orderId: string;
  clientId: string;
  clientName: string;
  orderDate: string;        // YYYY-MM-DD del pedido original
  /** Para kind="sale": fecha de cobro. Para kind="return": fecha del refund.
   *  Puede ser null en datos legacy. */
  paidDate: string | null;
  netSale: number;          // positivo en venta, negativo en refund
  /** Etiqueta legible del cálculo: "Nueva", "Residual",
   *  "Residual (cola post-salida)", "Nueva + Fase 2", "↩ Refund (...)", etc. */
  classification: string;
  rate: number;             // 0 a 1 (ej: 0.07, 0.05, 0.09 con Fase 2)
  commission: number;       // netSale * rate (signo coherente con netSale)
  phase2Applied: boolean;
  tailApplied: boolean;
}

/** Snapshot mensual de comisiones por representante.
 *  Se crea al "Marcar como pagado" (freeze) y queda inmutable. */
export interface Commission {
  id: string;
  representativeId: string;
  representativeName: string;
  month: string;            // YYYY-MM
  /** En la práctica hoy sólo "paid" — al congelar ya está pagado. */
  status: "paid" | "draft";
  paidOn: string;           // YYYY-MM-DD del freeze

  /** Detalle por pedido cobrado y por refund del mes. */
  lines: CommissionLine[];

  // ---- Subtotales ----
  newCommission: number;        // suma de líneas "Nueva" (§4.1)
  residualCommission: number;   // suma de "Residual" sin contar cola (§4.2)
  refundCommission: number;     // suma negativa de refunds del mes (§6.1)
  tailCommission: number;       // suma de líneas con tailApplied=true (§10.3)
  phase2Bonus: number;          // delta del +2% sobre líneas con Fase 2 (§11.4)
  milestoneBonus: number;       // bono one-time si se alcanzó pico nuevo (§4.4)

  /** Milestones (§4.4) que se pagaron específicamente este mes. */
  newMilestones: Milestone[];
  /** Pico de cuentas activas simultáneas observado durante el mes. */
  peakActive: number;

  // ---- Totales del mes ----
  totalNetSales: number;        // suma positiva (sin restar refunds)
  totalRefunds: number;         // valor absoluto de refunds del mes
  /** Monto neto a pagar al rep. Puede ser negativo si refunds > comisiones. */
  totalAmount: number;

  // ---- Flags de contexto (para auditoría futura) ----
  phase2ActiveDuringMonth: boolean;
  tailDuringMonth: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Anuncios masivos (Block 4.g) — entidades persistidas vía saveAll.
// ─────────────────────────────────────────────────────────────────────────────

/** Plantilla de mensaje reutilizable para anuncios masivos. */
export interface Template {
  id: string;
  name: string;
  body: string;
  bodyEn?: string;     // versión en inglés (bilingüe); body = español
  createdAt: string;   // ISO datetime
}

/** Estado persistido de la campaña de anuncios en curso (paso compose/send). */
export interface Campaign {
  tiers?: ClientTier[];
  message?: string;
  messageEn?: string;        // versión en inglés (bilingüe); message = español
  sentIds?: string[];        // ids de clientes ya marcados como enviados
  withPhoneOnly?: boolean;   // se interpreta como (!== false); default-true
}

// ─────────────────────────────────────────────────────────────────────────────
// Pedidos web (Block 4.h) — shape crudo de la tabla Supabase `web_orders`.
// ─────────────────────────────────────────────────────────────────────────────

export interface WebOrderItem {
  productId: string;
  qty: number;
  webLabel?: string;        // etiqueta original del sitio si no matchea catálogo
}

export interface WebOrder {
  id: string;
  status: string;           // "pending" | "imported" | "ignored" (valor crudo)
  total?: number;
  negocio?: string;
  encargado?: string;
  phone?: string;
  direccion?: string;
  pago?: string;
  created_at?: string;      // ISO datetime
  items?: WebOrderItem[];
}
