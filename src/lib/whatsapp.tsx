// src/lib/whatsapp.ts
// =============================================================================
// Helpers de WhatsApp consolidados con soporte i18n (Block 4.f).
//
// Reemplaza las copias inline que vivían en App.tsx, Orders.tsx y Receipt.tsx.
// Las tres funciones de mensaje (waOrder, waReceipt, waPayment) aceptan un
// parámetro opcional `lang` con default "es" para preservar el comportamiento
// previo cuando los callers no lo especifican.
//
// Convenciones:
// - `lang` lo pasa el caller. Para Orders.tsx (lista) viene de client.language
//   con fallback "es". Para Receipt.tsx puede ser override manual del toggle.
// - Status labels (paid/delivered/pending) se traducen junto con cada mensaje.
// =============================================================================

import type { Client, Language, Order, OrderStatus } from "../types/domain";
import { itemPrice, pF } from "./catalog";
import { fmt, fmtD, fmtPct } from "./format";

// ============================================================
// URL / phone helpers (idénticos al original, sin i18n)
// ============================================================

export const cleanPhone = (ph: string | undefined | null): string => {
  if (!ph) return "";
  return ph.replace(/[^0-9]/g, "").replace(/^1?(\d{10})$/, "1$1");
};

export const waLink = (phone: string, msg: string): string =>
  `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(msg)}`;

// ============================================================
// Status labels localizados (usados en mensajes y exportable
// para que Receipt.tsx los reuse en el badge)
// ============================================================

/** Status → label en minúsculas (para badges on-screen). */
export const STATUS_LABEL: Record<Language, Record<OrderStatus, string>> = {
  en: { pending: "pending", delivered: "delivered", paid: "paid" },
  es: { pending: "pendiente", delivered: "entregado", paid: "pagado" },
};

/** Helper: status en mayúsculas en el idioma dado (para PDFs/recibos). */
export const statusUpper = (status: OrderStatus, lang: Language): string =>
  STATUS_LABEL[lang][status].toUpperCase();

// ============================================================
// waOrder — confirmación de pedido
// ============================================================

const waOrderEs = (order: Order, client: Client | undefined): string => {
  const items = order.items
    .map(it => {
      const p = pF(it.productId);
      return `  • ${p?.name || it.productId} x${it.qty} = ${fmt(itemPrice(it) * it.qty * (1 - (order.discount || 0)))}`;
    })
    .join("\n");
  return `*DULCE SABOR*\nPedido #${order.id.slice(-6).toUpperCase()}\nFecha: ${fmtD(order.date)}\n\nHola ${client?.contact || client?.name || ""},\n\nAquí está la confirmación de tu pedido:\n\n${items}\n${order.discount > 0 ? `\nDescuento: ${fmtPct(order.discount)}% (${client?.tier})\n` : ""}\n*TOTAL: ${fmt(order.total)}*\n\nFormas de pago: Efectivo, Zelle, Venmo o Cheque\n¿Preguntas? Llámame al (707) 360-7420\n\nOrdena en línea: https://dulcesaborca.com\n\n¡Gracias!\n— José Flores, Dulce Sabor NorCal`;
};

const waOrderEn = (order: Order, client: Client | undefined): string => {
  const items = order.items
    .map(it => {
      const p = pF(it.productId);
      return `  • ${p?.name || it.productId} x${it.qty} = ${fmt(itemPrice(it) * it.qty * (1 - (order.discount || 0)))}`;
    })
    .join("\n");
  return `*DULCE SABOR*\nOrder #${order.id.slice(-6).toUpperCase()}\nDate: ${fmtD(order.date)}\n\nHi ${client?.contact || client?.name || ""},\n\nHere's your order confirmation:\n\n${items}\n${order.discount > 0 ? `\nDiscount: ${fmtPct(order.discount)}% (${client?.tier})\n` : ""}\n*TOTAL: ${fmt(order.total)}*\n\nPayment methods: Cash, Zelle, Venmo or Check\nQuestions? Call me at (707) 360-7420\n\nOrder online: https://dulcesaborca.com\n\nThanks!\n— José Flores, Dulce Sabor NorCal`;
};

export const waOrder = (
  order: Order,
  client: Client | undefined,
  lang: Language = "es"
): string => (lang === "en" ? waOrderEn(order, client) : waOrderEs(order, client));

// ============================================================
// waReceipt — resumen de recibo
// ============================================================

const waReceiptEs = (order: Order, client: Client | undefined): string => {
  const items = order.items
    .map(it => {
      const p = pF(it.productId);
      return `${p?.name || it.productId} x${it.qty}`;
    })
    .join(", ");
  return `*DULCE SABOR — Recibo #${order.id.slice(-6).toUpperCase()}*\nFecha: ${fmtD(order.date)}\nCliente: ${client?.name || ""}\nArtículos: ${items}\n${order.discount > 0 ? `Descuento: ${fmtPct(order.discount)}%\n` : ""}*Total: ${fmt(order.total)}*\nEstado: ${statusUpper(order.status, "es")}\n\n¡Gracias por tu compra!\nJosé Flores • (707) 360-7420\nhttps://dulcesaborca.com`;
};

const waReceiptEn = (order: Order, client: Client | undefined): string => {
  const items = order.items
    .map(it => {
      const p = pF(it.productId);
      return `${p?.name || it.productId} x${it.qty}`;
    })
    .join(", ");
  return `*DULCE SABOR — Receipt #${order.id.slice(-6).toUpperCase()}*\nDate: ${fmtD(order.date)}\nCustomer: ${client?.name || ""}\nItems: ${items}\n${order.discount > 0 ? `Discount: ${fmtPct(order.discount)}%\n` : ""}*Total: ${fmt(order.total)}*\nStatus: ${statusUpper(order.status, "en")}\n\nThank you for your business!\nJosé Flores • (707) 360-7420\nhttps://dulcesaborca.com`;
};

export const waReceipt = (
  order: Order,
  client: Client | undefined,
  lang: Language = "es"
): string =>
  lang === "en" ? waReceiptEn(order, client) : waReceiptEs(order, client);

// ============================================================
// waPayment — recordatorio de pago
// ============================================================

const waPaymentEs = (order: Order, client: Client | undefined): string => {
  return `Hola ${client?.contact || client?.name || ""},\n\nRecordatorio amistoso sobre tu pedido #${order.id.slice(-6).toUpperCase()} del ${fmtD(order.date)} por *${fmt(order.total)}*.\n\nEstado: ${order.status === "delivered" ? "Entregado — pago pendiente" : "Pendiente"}\n\nFormas de pago:\n• Efectivo en la próxima visita\n• Zelle: megapg.norcal@gmail.com\n• Venmo: @MegaPG-NorCal\n• Cheque a nombre de Dulce Sabor LLC\n\n¿Preguntas? Llámame al (707) 360-7420\n\n¡Gracias!\n— José Flores, Dulce Sabor`;
};

const waPaymentEn = (order: Order, client: Client | undefined): string => {
  return `Hi ${client?.contact || client?.name || ""},\n\nFriendly reminder about your order #${order.id.slice(-6).toUpperCase()} from ${fmtD(order.date)} for *${fmt(order.total)}*.\n\nStatus: ${order.status === "delivered" ? "Delivered — payment pending" : "Pending"}\n\nPayment methods:\n• Cash on next visit\n• Zelle: megapg.norcal@gmail.com\n• Venmo: @MegaPG-NorCal\n• Check payable to Dulce Sabor LLC\n\nQuestions? Call me at (707) 360-7420\n\nThanks!\n— José Flores, Dulce Sabor`;
};

export const waPayment = (
  order: Order,
  client: Client | undefined,
  lang: Language = "es"
): string =>
  lang === "en" ? waPaymentEn(order, client) : waPaymentEs(order, client);

// ============================================================
// WaBtn — componente del botón verde de WhatsApp
// ============================================================

interface WaBtnProps {
  phone: string;
  msg: string;
  label?: string;
  small?: boolean;
}

export const WaBtn = ({ phone, msg, label, small }: WaBtnProps) => (
  <a
    href={waLink(phone, msg)}
    target="_blank"
    rel="noopener noreferrer"
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: small ? "3px 8px" : "6px 12px",
      background: "#25D366",
      color: "#fff",
      borderRadius: 6,
      fontSize: small ? 10 : 12,
      fontWeight: 600,
      textDecoration: "none",
      cursor: "pointer",
      whiteSpace: "nowrap",
    }}
  >
    {label || "WhatsApp"}
  </a>
);
