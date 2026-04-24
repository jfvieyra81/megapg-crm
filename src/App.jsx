import { useState, useCallback, useRef, useEffect } from "react";
import { jsPDF } from "jspdf";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const SUPA_URL = SUPABASE_URL && SUPABASE_URL !== "YOUR_PROJECT_URL_HERE" ? SUPABASE_URL : null;
const SUPA_KEY = SUPABASE_KEY && SUPABASE_KEY !== "YOUR_ANON_KEY_HERE" ? SUPABASE_KEY : null;
const SUPA_HEADERS = { "Content-Type": "application/json", "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}`, "Prefer": "return=representation" };
const cloudEnabled = !!(SUPA_URL && SUPA_KEY);

const PRODUCTS = [
  // SLAPS LOLLIPOPS
  { id: "slaps-mix", name: "Slaps Mix", sku: "DPG-SLPMIX-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-tam", name: "Slaps Tamarind", sku: "DPG-SLPTAM-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-mgo", name: "Slaps Mango", sku: "DPG-SLPMGO-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-wtm", name: "Slaps Watermelon", sku: "DPG-SLPWTM-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-app", name: "Slaps Green Apple", sku: "DPG-SLPAPP-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-dbx", name: "Slaps DobleX", sku: "DPG-DBXPIC-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-pkl", name: "Slaps Pickle", sku: "DPG-SLPPIK-25", price: 40, cost: 22.00, bags: 25 },
  { id: "slaps-dev", name: "Slaps Devora", sku: "DPG-SLPDEV-40", price: 80, cost: 50.00, bags: 40 },
  { id: "slaps-aln", name: "Slaps DevorAlien", sku: "DPG-SLPALN-40", price: 80, cost: 50.00, bags: 40 },
  // CACHETADA
  { id: "cachetada", name: "Pigüi Cachetada 100ct", sku: "DPG-CACHE100", price: 270, cost: 181, bags: 100 },
  // SOFT CANDIES
  { id: "piguileta", name: "Piguileta Fuego", sku: "DPG-PGFUEG-16", price: 85, cost: 57.60, bags: 16 },
  { id: "piguileta-c", name: "Piguileta Cool", sku: "DPG-PGCOOL-16", price: 85, cost: 57.60, bags: 16 },
  { id: "mega-hue-d", name: "Mega Huevón Display", sku: "DPG-MGAHUE-30", price: 84, cost: 51.20, bags: 16 },
  { id: "mega-hue-b", name: "Mega Huevón Bolsa", sku: "DPG-MGAHUE-10", price: 105, cost: 62.00, bags: 10 },
  { id: "don-cuco", name: "Bolas Don Cuco", sku: "DPG-DONCUC-12", price: 115, cost: 76.80, bags: 12 },
  { id: "mordidilla", name: "Mordidilla", sku: "DPG-MORDCH-12", price: 60, cost: 35.40, bags: 12 },
  { id: "flamkiyos", name: "Flamkiyos", sku: "DPG-FLAMKI-10", price: 93, cost: 55.20, bags: 12 },
  // CANDY POWDER
  { id: "cache-chm", name: "Cache Colors Chamoy Lg", sku: "DPG-CLRCHM-12", price: 115, cost: 76.80, bags: 12 },
  { id: "cache-mix", name: "Cache Colors Assorted Lg", sku: "DPG-CLRMIX-12", price: 115, cost: 76.80, bags: 12 },
  { id: "cache-pkl", name: "Cache Colors Pickle Lg", sku: "DPG-CLRPIK-12", price: 135, cost: 90.60, bags: 12 },
  // SLIM LICKS & BIBI LICKS
  { id: "slim-sour", name: "Slim Licks Sour", sku: "MPG-SLMSOU-24", price: 32, cost: 21.12, bags: 24 },
  { id: "slim-spcy", name: "Slim Licks Spicy", sku: "MPG-SLMSPI-24", price: 32, cost: 21.12, bags: 24 },
  { id: "bibi-sour", name: "Bibi Licks Sour", sku: "MPG-BIBSOU-12", price: 85, cost: 53.76, bags: 12 },
  { id: "bibi-spcy", name: "Bibi Licks Spicy", sku: "MPG-BIBISPI-12", price: 85, cost: 53.76, bags: 12 },
];
const ZONES = ["Santa Rosa / Sonoma", "Sacramento", "San Jose / Bay Area", "Mendocino / Ukiah", "Oakland / Bay Area", "Other"];
const TIERS = ["Lista", "Bronce", "Plata", "Oro"];
const BRANDS = ["Mega PG", "Pigüi USA", "Both", "Neither/Unknown"];
const STORE_TYPES = ["Dulcería", "Carnicería", "Supermercado", "Tienda/Market", "Convenience", "Other"];
const INTEREST_LVL = ["Very interested", "Somewhat interested", "Not interested", "Already a client"];
const SUPPLIERS = ["Pigüi USA (LA)", "Local distributor", "Travels to buy", "Online/Walmart/Amazon", "Unknown", "None (no Slaps)"];
const PRODUCTS_SEEN = ["Slaps Lollipops", "Slaps Devora/DevorAlien", "Cachetada/Cachetadas", "Cache Colors", "Slim Licks", "Bibi Licks", "Piguileta", "Mega Huevón", "Flamkiyos", "Mordidilla", "Don Cuco", "Other Pigüi", "None"];
const TIER_DISC = { Lista: 0, Bronce: 0.03125, Plata: 0.0625, Oro: 0.125 };
const TIER_CLR = { Lista: "#888", Bronce: "#996633", Plata: "#1A5276", Oro: "#1B7340" };
const ST_CLR = { pending: "#D35400", delivered: "#1A5276", paid: "#1B7340" };
// PAYMENT TERMS — v5.11
const PAYMENT_TERMS = ["Contado", "Crédito 7 días", "Crédito 15 días", "Crédito 30 días"];
const TERM_DAYS = { "Contado": 0, "Crédito 7 días": 7, "Crédito 15 días": 15, "Crédito 30 días": 30 };
const TERM_CLR = { "Contado": "#1B7340", "Crédito 7 días": "#1A5276", "Crédito 15 días": "#D35400", "Crédito 30 días": "#6C3483" };

// LANGUAGE — v5.13 — Bilingual receipts and WhatsApp messages
const LANGUAGES = ["Español", "English"];
const LANG_CLR = { "Español": "#C41E3A", "English": "#1A5276" };
// Translation dictionary — keys in Spanish, values in English
const T = {
  "Español": (k) => k, // identity — Spanish is the source
  "English": (k) => ({
    // Receipt headers
    "INVOICE / FACTURA": "INVOICE",
    "BILL TO / FACTURAR A": "BILL TO",
    "FECHAS": "DATES",
    "Pedido": "Order date",
    "Entrega": "Delivery date",
    "Vence": "Due date",
    "Términos": "Terms",
    "ESTADO": "STATUS",
    "Producto": "Product",
    "Cant.": "Qty",
    "Precio": "Price",
    "Total": "Total",
    "Subtotal": "Subtotal",
    "Descuento": "Discount",
    "Sales Tax (Sale for Resale)": "Sales Tax (Sale for Resale)",
    "TOTAL": "TOTAL",
    "PAGADO el": "PAID on",
    "SALE FOR RESALE / VENTA PARA REVENTA": "SALE FOR RESALE",
    "Buyer's Resale Certificate on file. CA Seller's Permit:": "Buyer's Resale Certificate on file. CA Seller's Permit:",
    "Formas de pago": "Payment methods",
    "Cheque a nombre de:": "Check payable to:",
    "Efectivo contra entrega": "Cash on delivery",
    "Firma del cliente / recibido": "Customer signature / received",
    "Firma del vendedor": "Seller signature",
    "Atn:": "Attn:",
    "Notas:": "Notes:",
    "¡Gracias!": "Thank you!",
    "¡Gracias por tu compra!": "Thank you for your business!",
    // Payment terms
    "Contado": "Net on receipt",
    "Crédito 7 días": "Net 7",
    "Crédito 15 días": "Net 15",
    "Crédito 30 días": "Net 30",
    // Order status
    "pending": "pending",
    "delivered": "delivered",
    "paid": "paid",
  }[k] || k),
};
const tr = (lang, key) => (T[lang] || T["Español"])(key);

const SCORE_CLR = (s) => s >= 90 ? "#1B7340" : s >= 70 ? "#D35400" : s >= 50 ? "#C41E3A" : "#888";

// === BUSINESS LEGAL INFO — v5.12 — Para recibos legales en California ===
const BUSINESS = {
  legalName: "Dulce Sabor LLC",
  tradeName: "DULCE SABOR",
  tagline: "Dulces Mexicanos Auténticos • Norte de California",
  address: "1123 W Standley St",
  cityStateZip: "Ukiah, CA 95482",
  phone: "(707) 360-7420",
  email: "megapg.norcal@gmail.com",
  website: "dulcesaborca.com",
  contact: "José Flores",
  ein: "42-1867709",
  sellersPermit: "213-306080",
  zelle: "megapg.norcal@gmail.com",
  venmo: "@MegaPG-NorCal",
};

// Genera número de factura secuencial INV-YYYY-NNNN basado en posición de la orden
const invoiceNumber = (order, allOrders) => {
  const year = new Date(order.date).getFullYear();
  const sameYear = allOrders.filter(o => new Date(o.date).getFullYear() === year).sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id));
  const idx = sameYear.findIndex(o => o.id === order.id) + 1;
  return `INV-${year}-${String(idx).padStart(4, "0")}`;
};
const LOW = 5;
// FIX #3: Constante única para umbral de seguimiento (antes: 14 en Dashboard, 21 en Clients)
const FOLLOWUP_DAYS = 21;
// REORDER REMINDER SETTINGS
const REMINDER_COOLDOWN_DAYS = 7;
const DEFAULT_REORDER_CYCLE = 30;
const URGENT_OVERDUE_DAYS = 7;
const ANTICIPATION_DAYS = 5;
// POST-DELIVERY FOLLOW-UP SETTINGS
const POSTDEL_MIN_DAYS = 3;    // Earliest: give client time to actually sell product
const POSTDEL_MAX_DAYS = 21;   // Latest: after this, reorder reminder takes over
const POSTDEL_URGENT_DAYS = 14; // "Last chance" threshold
// WELCOME NEW CLIENT SETTINGS
const WELCOME_MAX_DAYS = 14;   // Window after first order to send welcome
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (n) => "$" + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtD = (d) => { try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
const dSince = (d) => { try { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); } catch { return 999; } };
const pF = (id) => PRODUCTS.find(p => p.id === id);
const S = {
  load() {
    try {
      const raw = localStorage.getItem("megapg-data");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  save(data) {
    try { localStorage.setItem("megapg-data", JSON.stringify(data)); } catch(e) { console.error("Save failed:", e); }
  },
};

// === PUBLIC STORES SYNC (v5.10) — sync clientes a dulcesaborca.com/donde-comprar ===
const STORE_PHOTOS_BUCKET = "store-photos";
const PUBLIC_INACTIVE_DAYS = 90;

const uploadStorePhoto = async (file, clientId) => {
  if (!cloudEnabled || !file) return null;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${clientId}-${Date.now()}.${ext || "jpg"}`;
  try {
    const resp = await fetch(`${SUPA_URL}/storage/v1/object/${STORE_PHOTOS_BUCKET}/${path}`, {
      method: "POST",
      headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}`, "Content-Type": file.type || "image/jpeg", "x-upsert": "true" },
      body: file,
    });
    if (!resp.ok) { console.error("Upload failed:", await resp.text()); return null; }
    return `${SUPA_URL}/storage/v1/object/public/${STORE_PHOTOS_BUCKET}/${path}`;
  } catch(e) { console.error("Upload error:", e); return null; }
};

const getRecentProducts = (clientId, orders, days = 90) => {
  const cutoff = Date.now() - days * 86400000;
  const recent = orders.filter(o => o.clientId === clientId && new Date(o.date).getTime() >= cutoff);
  const map = {};
  recent.forEach(o => (o.items || []).forEach(it => {
    const p = pF(it.productId);
    if (!p) return;
    if (!map[p.id] || new Date(o.date) > new Date(map[p.id].lastOrdered)) {
      map[p.id] = { name: p.name, lastOrdered: o.date };
    }
  }));
  return Object.values(map);
};

const lastOrderDate = (clientId, orders) => {
  const co = orders.filter(o => o.clientId === clientId);
  if (co.length === 0) return null;
  return co.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date;
};

const syncClientToPublicStores = async (client, orders) => {
  if (!cloudEnabled) return { ok: false, error: "Supabase no configurado" };
  try {
    if (!client.showOnWebsite) {
      const r = await fetch(`${SUPA_URL}/rest/v1/public_stores?id=eq.${client.id}`, {
        method: "DELETE",
        headers: SUPA_HEADERS,
      });
      return r.ok ? { ok: true, action: "removed" } : { ok: false, error: await r.text() };
    }
    const lastDate = lastOrderDate(client.id, orders);
    const row = {
      id: client.id,
      display_name: client.publicDisplayName || client.name,
      city: client.zone || "",
      zone: client.zone || "",
      address: client.address || "",
      hours: client.publicHours || "",
      whatsapp: client.phone || "",
      photo_url: client.publicPhotoUrl || "",
      recent_products: getRecentProducts(client.id, orders, PUBLIC_INACTIVE_DAYS),
      last_purchase_date: lastDate ? lastDate.slice(0, 10) : null,
      updated_at: new Date().toISOString(),
    };
    const resp = await fetch(`${SUPA_URL}/rest/v1/public_stores`, {
      method: "POST",
      headers: { ...SUPA_HEADERS, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
    });
    if (!resp.ok) { const err = await resp.text(); console.error("Sync failed:", err); return { ok: false, error: err }; }
    return { ok: true, action: "published" };
  } catch(e) { console.error("Sync error:", e); return { ok: false, error: e.message }; }
};

const syncAllPublicStores = async (clients, orders) => {
  if (!cloudEnabled) return { ok: false, error: "Supabase no configurado", count: 0 };
  let published = 0, removed = 0, errors = 0;
  for (const c of clients) {
    const r = await syncClientToPublicStores(c, orders);
    if (!r.ok) errors++;
    else if (r.action === "published") published++;
    else if (r.action === "removed") removed++;
  }
  return { ok: errors === 0, published, removed, errors };
};

// FIX #4: Calcula semanas reales desde la primera orden en lugar de hardcodear /4
const calcWeeks = (orders) => {
  if (orders.length === 0) return 1;
  const dates = orders.map(o => new Date(o.date).getTime()).filter(t => !isNaN(t));
  if (dates.length === 0) return 1;
  const earliest = Math.min(...dates);
  const weeks = Math.max(1, (Date.now() - earliest) / (7 * 86400000));
  return Math.round(weeks * 10) / 10;
};

// Calculate average reorder cycle (days between orders) for a client
const calcClientCycle = (clientOrders) => {
  if (clientOrders.length < 2) return DEFAULT_REORDER_CYCLE;
  const sorted = [...clientOrders].sort((a, b) => new Date(a.date) - new Date(b.date));
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const g = (new Date(sorted[i].date) - new Date(sorted[i-1].date)) / 86400000;
    if (g > 0) gaps.push(g);
  }
  if (gaps.length === 0) return DEFAULT_REORDER_CYCLE;
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  return Math.max(7, Math.round(avg));
};

// PAYMENT SCORE — v5.11 — evalúa puntualidad del cliente (0-100)
// Lógica: empieza en 100. Por cada orden atrasada vs. sus términos, baja puntos según los días de retraso.
// Sin historial suficiente → null (no hay datos para juzgar)
const calcPaymentScore = (client, clientOrders) => {
  const term = TERM_DAYS[client?.paymentTerms] ?? 0;
  // Solo contamos órdenes que ya tienen resolución (pagadas o claramente atrasadas)
  const evaluable = clientOrders.filter(o => o.status === "paid" || o.status === "delivered");
  if (evaluable.length < 2) return null; // Muy pocos datos
  let score = 100;
  let latePenalty = 0;
  evaluable.forEach(o => {
    if (o.status === "paid" && o.paidDate) {
      const delivered = o.deliveredDate || o.date;
      const daysToPay = Math.max(0, (new Date(o.paidDate) - new Date(delivered)) / 86400000);
      const overdue = Math.max(0, daysToPay - term);
      if (overdue > 0) latePenalty += Math.min(15, overdue); // máx 15 pts por orden tardía
    } else if (o.status === "delivered") {
      // Entregada pero no pagada → revisar si ya venció
      const delivered = o.deliveredDate || o.date;
      const daysSinceDelivery = dSince(delivered);
      const overdue = Math.max(0, daysSinceDelivery - term);
      if (overdue > 0) latePenalty += Math.min(20, overdue); // actualmente atrasada = más castigo
    }
  });
  score = Math.max(0, Math.round(score - latePenalty / evaluable.length * 3));
  return Math.min(100, score);
};

// DUE DATE — fecha en que se debe pagar una orden según los términos del cliente
const orderDueDate = (order, client) => {
  const term = TERM_DAYS[client?.paymentTerms] ?? 0;
  const baseDate = order.deliveredDate || order.date;
  const due = new Date(baseDate);
  due.setDate(due.getDate() + term);
  return due;
};

const daysUntilDue = (order, client) => {
  const due = orderDueDate(order, client);
  return Math.floor((due.getTime() - Date.now()) / 86400000);
};

// WhatsApp helpers
const cleanPhone = (ph) => { if (!ph) return ""; return ph.replace(/[^0-9]/g, "").replace(/^1?(\d{10})$/, "1$1"); };
const waLink = (phone, msg) => `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(msg)}`;
const waOrder = (order, client) => {
  const isEN = client?.language === "English";
  const items = order.items.map(it => { const p = pF(it.productId); return `  • ${p?.name || it.productId} x${it.qty} = ${fmt((p?.price || 0) * it.qty * (1 - (order.discount || 0)))}`; }).join("\n");
  if (isEN) {
    return `*DULCE SABOR*\nOrder #${order.id.slice(-6).toUpperCase()}\nDate: ${fmtD(order.date)}\n\nHi ${client?.contact || client?.name || ""},\n\nHere is your order confirmation:\n\n${items}\n${order.discount > 0 ? `\nDiscount: ${Math.round(order.discount * 100)}% (${client?.tier})\n` : ""}${order.foDisc ? `1st order discount: ${order.foDisc.tier} cases — $${order.foDisc.price}/case Slaps\n` : ""}\n*TOTAL: ${fmt(order.total)}*\n\nPayment: Cash, Zelle, Venmo or Check\nQuestions? Call me at (707) 360-7420\n\nOrder online: https://dulcesaborca.com\n\nThank you!\n— José Flores, Dulce Sabor NorCal`;
  }
  return `*DULCE SABOR*\nPedido #${order.id.slice(-6).toUpperCase()}\nFecha: ${fmtD(order.date)}\n\nHola ${client?.contact || client?.name || ""},\n\nAquí está la confirmación de tu pedido:\n\n${items}\n${order.discount > 0 ? `\nDescuento: ${Math.round(order.discount * 100)}% (${client?.tier})\n` : ""}${order.foDisc ? `Descuento 1ª orden: ${order.foDisc.tier} cajas — $${order.foDisc.price}/caja Slaps\n` : ""}\n*TOTAL: ${fmt(order.total)}*\n\nFormas de pago: Efectivo, Zelle, Venmo o Cheque\n¿Preguntas? Llámame al (707) 360-7420\n\nOrdena en línea: https://dulcesaborca.com\n\n¡Gracias!\n— José Flores, Dulce Sabor NorCal`;
};
const waReceipt = (order, client) => {
  const isEN = client?.language === "English";
  const items = order.items.map(it => { const p = pF(it.productId); return `${p?.name || it.productId} x${it.qty}`; }).join(", ");
  if (isEN) {
    return `*DULCE SABOR — Receipt #${order.id.slice(-6).toUpperCase()}*\nDate: ${fmtD(order.date)}\nCustomer: ${client?.name || ""}\nItems: ${items}\n${order.discount > 0 ? `Discount: ${Math.round(order.discount * 100)}%\n` : ""}${order.foDisc ? `1st order discount: ${order.foDisc.tier} cases — $${order.foDisc.price}/case Slaps\n` : ""}*Total: ${fmt(order.total)}*\nStatus: ${order.status.toUpperCase()}\n\nThank you for your business!\nJosé Flores • (707) 360-7420\nhttps://dulcesaborca.com`;
  }
  return `*DULCE SABOR — Recibo #${order.id.slice(-6).toUpperCase()}*\nFecha: ${fmtD(order.date)}\nCliente: ${client?.name || ""}\nArtículos: ${items}\n${order.discount > 0 ? `Descuento: ${Math.round(order.discount * 100)}%\n` : ""}${order.foDisc ? `Descuento 1ª orden: ${order.foDisc.tier} cajas — $${order.foDisc.price}/caja Slaps\n` : ""}*Total: ${fmt(order.total)}*\nEstado: ${order.status.toUpperCase()}\n\n¡Gracias por tu compra!\nJosé Flores • (707) 360-7420\nhttps://dulcesaborca.com`;
};
const waPayment = (order, client) => {
  const isEN = client?.language === "English";
  if (isEN) {
    return `Hi ${client?.contact || client?.name || ""},\n\nFriendly reminder about your order #${order.id.slice(-6).toUpperCase()} from ${fmtD(order.date)} for *${fmt(order.total)}*.\n\nStatus: ${order.status === "delivered" ? "Delivered — payment pending" : "Pending"}\n\nPayment options:\n• Cash on next visit\n• Zelle: megapg.norcal@gmail.com\n• Venmo: @MegaPG-NorCal\n• Check payable to Dulce Sabor LLC\n\nQuestions? Call me at (707) 360-7420\n\nThank you!\n— José Flores, Dulce Sabor`;
  }
  return `Hola ${client?.contact || client?.name || ""},\n\nRecordatorio amistoso sobre tu pedido #${order.id.slice(-6).toUpperCase()} del ${fmtD(order.date)} por *${fmt(order.total)}*.\n\nEstado: ${order.status === "delivered" ? "Entregado — pago pendiente" : "Pendiente"}\n\nFormas de pago:\n• Efectivo en la próxima visita\n• Zelle: megapg.norcal@gmail.com\n• Venmo: @MegaPG-NorCal\n• Cheque a nombre de Dulce Sabor LLC\n\n¿Preguntas? Llámame al (707) 360-7420\n\n¡Gracias!\n— José Flores, Dulce Sabor`;
};
const WaBtn = ({ phone, msg, label, small }) => <a href={waLink(phone, msg)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: small ? "3px 8px" : "6px 12px", background: "#25D366", color: "#fff", borderRadius: 6, fontSize: small ? 10 : 12, fontWeight: 600, textDecoration: "none", cursor: "pointer", whiteSpace: "nowrap" }}>{label || "WhatsApp"}</a>;

const Badge = ({ text, color }) => <span style={{ background: color + "22", color, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>{text}</span>;
const Btn = ({ children, onClick, primary, danger, small, disabled, style: s }) => <button disabled={disabled} onClick={onClick} style={{ padding: small ? "4px 10px" : "8px 16px", fontSize: small ? 12 : 13, fontWeight: 600, border: "none", borderRadius: 6, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, background: danger ? "#C41E3A" : primary ? "#1B7340" : "#f0f0f0", color: primary || danger ? "#fff" : "#333", ...s }}>{children}</button>;
const Card = ({ title, value, sub, color }) => <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "12px 14px", borderLeft: `4px solid ${color || "#1B7340"}`, minWidth: 0 }}><div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{title}</div><div style={{ fontSize: 20, fontWeight: 700, color: color || "#1B7340" }}>{value}</div>{sub && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{sub}</div>}</div>;
const Modal = ({ title, onClose, children, wide }) => <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}><div style={{ background: "#fff", borderRadius: 12, width: "92%", maxWidth: wide ? 800 : 600, maxHeight: "88vh", overflow: "auto", padding: "20px 24px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h3 style={{ fontSize: 18, fontWeight: 700, color: "#C41E3A" }}>{title}</h3><button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#999" }}>✕</button></div>{children}</div></div>;
const Inp = ({ label, value, onChange, type, placeholder, style: s, options, textarea }) => <div style={{ marginBottom: 10, ...s }}>{label && <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 3 }}>{label}</label>}{options ? <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}><option value="">-- Select --</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select> : textarea ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, resize: "vertical" }} /> : <input type={type || "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />}</div>;
const ST = ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, marginTop: 16, color: "#C41E3A", borderBottom: "2px solid #C41E3A", paddingBottom: 4 }}>{children}</h3>;

const Dashboard = ({ clients, orders, inventory }) => {
  const tRev = orders.reduce((s, o) => s + (o.total || 0), 0);
  const tCost = orders.reduce((s, o) => s + o.items.reduce((a, it) => a + (pF(it.productId)?.cost || 0) * it.qty, 0), 0);
  const gP = tRev - tCost;
  const tCases = orders.reduce((s, o) => s + o.items.reduce((a, it) => a + it.qty, 0), 0);
  const tStock = inventory.reduce((s, it) => s + it.stock, 0);
  const pend = orders.filter(o => o.status !== "paid").reduce((s, o) => s + (o.total || 0), 0);
  // FIX #4: Usar semanas reales en vez de /4 hardcodeado
  const weeks = calcWeeks(orders);
  const stale = clients.map(c => { const co = orders.filter(o => o.clientId === c.id); const last = co.length > 0 ? co.sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null; return { ...c, lastD: last?.date, ds: last ? dSince(last.date) : 999, oc: co.length, ts: co.reduce((s, o) => s + (o.total || 0), 0) }; }).filter(c => c.oc > 0 && c.ds > FOLLOWUP_DAYS).sort((a, b) => b.ds - a.ds);
  const lowS = inventory.filter(i => i.stock > 0 && i.stock <= LOW).map(i => ({ ...i, p: pF(i.productId) }));
  const outS = inventory.filter(i => i.stock === 0).map(i => ({ ...i, p: pF(i.productId) }));
  const cProf = clients.map(c => { const co = orders.filter(o => o.clientId === c.id); const r = co.reduce((s, o) => s + (o.total || 0), 0); const ct = co.reduce((s, o) => s + o.items.reduce((a, it) => a + (pF(it.productId)?.cost || 0) * it.qty, 0), 0); return { name: c.name, tier: c.tier, r, prof: r - ct, oc: co.length }; }).filter(c => c.oc > 0).sort((a, b) => b.prof - a.prof);
  // FIX #4: Velocidad semanal con semanas reales
  const pVel = PRODUCTS.map(p => { const sold = orders.reduce((s, o) => s + o.items.filter(it => it.productId === p.id).reduce((a, it) => a + it.qty, 0), 0); const st = inventory.find(i => i.productId === p.id)?.stock || 0; const wr = weeks > 0 ? Math.round(sold / weeks * 10) / 10 : 0; const wk = wr > 0 ? Math.round(st / wr * 10) / 10 : st > 0 ? 99 : 0; return { ...p, sold, st, wr, wk }; }).sort((a, b) => b.sold - a.sold);
  return <div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}><Card title="Revenue" value={fmt(tRev)} color="#1B7340" /><Card title="Gross profit" value={fmt(gP)} sub={tRev > 0 ? `${Math.round(gP / tRev * 100)}% margin` : ""} color="#1B7340" /><Card title="Cases sold" value={tCases} color="#1A5276" /><Card title="Pending $" value={fmt(pend)} color={pend > 0 ? "#C41E3A" : "#1B7340"} /><Card title="In stock" value={`${tStock} cases`} color="#6C3483" /></div>
    {(stale.length > 0 || lowS.length > 0 || outS.length > 0) && <div style={{ background: "#FDF2E9", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #D35400" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#D35400", marginBottom: 6 }}>Action needed</div>{outS.map(i => <div key={i.productId} style={{ fontSize: 12, padding: "2px 0", color: "#C41E3A" }}>OUT: <b>{i.p?.name}</b></div>)}{lowS.map(i => <div key={i.productId} style={{ fontSize: 12, padding: "2px 0", color: "#D35400" }}>LOW: <b>{i.p?.name}</b> — {i.stock} left</div>)}{stale.slice(0, 5).map(c => {
      const lastO = orders.filter(o => o.clientId === c.id).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      return <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
        <span style={{ fontSize: 12, color: "#996633", flex: 1 }}>FOLLOW UP: <b>{c.name}</b> — {c.ds} days since last order</span>
        {c.phone && <WaBtn phone={c.phone} msg={`Hola ${c.contact || c.name},\n\nSoy José de Dulce Sabor. Pasando a saludar — noté que ha pasado un tiempo desde tu último pedido.\n\nTenemos stock fresco de Slaps Lollipops y todos tus favoritos listos para entrega. ¿Quieres que te arme un pedido?\n\nTu último pedido fue ${lastO ? fmtD(lastO.date) : "hace un tiempo"}${lastO ? ` por ${fmt(lastO.total)}` : ""}.\n\nTambién puedes ordenar en línea: https://dulcesaborca.com\n\n¡Avísame!\nJosé — (707) 360-7420`} label="Follow up" small />}
      </div>; })}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}><div><ST>Top clients by profit</ST>{cProf.slice(0, 6).map((c, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}><div><b>{c.name}</b> <Badge text={c.tier} color={TIER_CLR[c.tier]} /></div><div><span style={{ color: "#1B7340", fontWeight: 700 }}>{fmt(c.prof)}</span><span style={{ color: "#999", marginLeft: 6 }}>{c.oc} ord</span></div></div>)}</div><div><ST>Product velocity <span style={{ fontSize: 11, fontWeight: 400, color: "#999" }}>({Math.round(weeks)}wk span)</span></ST>{pVel.slice(0, 8).map(p => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0", fontSize: 12 }}><span>{p.name}</span><div style={{ display: "flex", gap: 10 }}><span>{p.sold} sold</span><span style={{ color: "#777" }}>{p.wr}/wk</span><span style={{ color: p.st === 0 ? "#C41E3A" : p.st <= LOW ? "#D35400" : "#1B7340", fontWeight: 600 }}>{p.st} stock</span>{p.wk < 3 && p.wk > 0 && <Badge text={`${p.wk}wk left`} color="#C41E3A" />}</div></div>)}</div></div>
    <ST>Recent orders</ST>{orders.slice(-6).reverse().map(o => { const cl = clients.find(c => c.id === o.clientId); const cost = o.items.reduce((a, it) => a + (pF(it.productId)?.cost || 0) * it.qty, 0); return <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}><div><b>{cl?.name || "?"}</b> <span style={{ color: "#999" }}>{fmtD(o.date)}</span></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><b>{fmt(o.total)}</b><span style={{ color: "#1B7340", fontSize: 11 }}>+{fmt((o.total || 0) - cost)}</span><Badge text={o.status} color={ST_CLR[o.status]} /></div></div>; })}
  </div>;
};

const Clients = ({ clients, setClients, orders, saveAll }) => {
  const emptyForm = { name: "", address: "", phone: "", contact: "", zone: "", tier: "Lista", notes: "", ownerGroup: "", paymentTerms: "Contado", creditLimit: "", language: "Español", showOnWebsite: false, publicDisplayName: "", publicHours: "", publicPhotoUrl: "", websitePermissionDate: "", permissionConfirmed: false };
  const [sf, setSf] = useState(false); const [edit, setEdit] = useState(null); const [delC, setDelC] = useState(null); const delRef = useRef(null);
  const [form, setForm] = useState(emptyForm); const [search, setSearch] = useState("");
  const [showWebSection, setShowWebSection] = useState(false); const [uploading, setUploading] = useState(false); const [syncMsg, setSyncMsg] = useState(null); const [bulkSyncing, setBulkSyncing] = useState(false);
  const fileInputRef = useRef(null);

  const openN = () => { setForm(emptyForm); setEdit(null); setShowWebSection(false); setSf(true); };
  const openE = (c) => { setForm({ ...emptyForm, ...c }); setEdit(c.id); setShowWebSection(!!c.showOnWebsite); setSf(true); };

  const save = async () => {
    if (!form.name) return;
    // Si marcó publicar, exigir confirmación de permiso
    if (form.showOnWebsite && !form.permissionConfirmed && !form.websitePermissionDate) {
      setSyncMsg({ ok: false, text: "⚠️ Confirma que el cliente dio permiso antes de publicar" });
      return;
    }
    const permDate = form.showOnWebsite && !form.websitePermissionDate ? new Date().toISOString().slice(0, 10) : form.websitePermissionDate;
    const cleanForm = { ...form, websitePermissionDate: permDate };
    let savedClient;
    if (edit) {
      setClients(prev => { const n = prev.map(c => c.id === edit ? (savedClient = { ...c, ...cleanForm }) : c); saveAll("clients", n); return n; });
    } else {
      savedClient = { ...cleanForm, id: uid(), created: new Date().toISOString() };
      setClients(prev => { const n = [...prev, savedClient]; saveAll("clients", n); return n; });
    }
    // Sync a public_stores si está marcado o si era público y se desmarcó
    if (savedClient && (cleanForm.showOnWebsite || edit)) {
      const result = await syncClientToPublicStores(savedClient, orders);
      if (!result.ok && cleanForm.showOnWebsite) {
        setSyncMsg({ ok: false, text: "⚠️ Cliente guardado pero falló sincronización con sitio web" });
        return;
      }
    }
    setSf(false); setSyncMsg(null);
  };

  const del = (id) => {
    if (delRef.current === id) {
      const c = clients.find(x => x.id === id);
      if (c?.showOnWebsite) syncClientToPublicStores({ ...c, showOnWebsite: false }, orders);
      setClients(prev => { const n = prev.filter(c => c.id !== id); saveAll("clients", n); return n; });
      delRef.current = null; setDelC(null);
    } else {
      delRef.current = id; setDelC(id);
      setTimeout(() => { if (delRef.current === id) { delRef.current = null; setDelC(null); } }, 3000);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setSyncMsg({ ok: false, text: "⚠️ Foto muy grande (máx 5MB)" }); return; }
    setUploading(true); setSyncMsg(null);
    const clientId = edit || `temp-${Date.now()}`;
    const url = await uploadStorePhoto(file, clientId);
    setUploading(false);
    if (url) { setForm(p => ({ ...p, publicPhotoUrl: url })); setSyncMsg({ ok: true, text: "✓ Foto subida" }); }
    else setSyncMsg({ ok: false, text: "⚠️ Error al subir foto" });
    e.target.value = "";
  };

  const handleBulkSync = async () => {
    setBulkSyncing(true);
    const result = await syncAllPublicStores(clients, orders);
    setBulkSyncing(false);
    setSyncMsg({ ok: result.ok, text: result.ok ? `✓ Sincronizado: ${result.published} publicados, ${result.removed} removidos` : `⚠️ ${result.errors} errores durante sync` });
    setTimeout(() => setSyncMsg(null), 5000);
  };

  const fil = clients.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.zone?.toLowerCase().includes(search.toLowerCase()) || c.contact?.toLowerCase().includes(search.toLowerCase()) || c.ownerGroup?.toLowerCase().includes(search.toLowerCase()));

  // Agrupar por ownerGroup para mostrar tarjeta resumen arriba del grupo
  const groupsSeen = new Set();
  const filWithGroupMarker = fil.map(c => {
    const isFirstOfGroup = c.ownerGroup && !groupsSeen.has(c.ownerGroup);
    if (c.ownerGroup) groupsSeen.add(c.ownerGroup);
    return { ...c, _isFirstOfGroup: isFirstOfGroup };
  });

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." style={{ padding: "7px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, flex: 1, maxWidth: 280 }} />
      <div style={{ display: "flex", gap: 6 }}>
        <Btn small onClick={handleBulkSync} disabled={bulkSyncing}>{bulkSyncing ? "Sincronizando..." : "🔄 Sync sitio web"}</Btn>
        <Btn primary onClick={openN}>+ New client</Btn>
      </div>
    </div>
    {syncMsg && !sf && <div style={{ padding: "8px 12px", marginBottom: 10, background: syncMsg.ok ? "#E8F5E9" : "#FDE8E8", color: syncMsg.ok ? "#1B7340" : "#C41E3A", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>{syncMsg.text}</div>}
    {fil.length === 0 && <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 40 }}>No clients. Click "+ New client".</p>}
    {filWithGroupMarker.map(c => {
      const co = orders.filter(o => o.clientId === c.id);
      const last = co.length > 0 ? co.sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null;
      const ts = co.reduce((s, o) => s + (o.total || 0), 0);
      const days = last ? dSince(last.date) : null;
      const fu = days !== null && days > FOLLOWUP_DAYS;
      const publicInactive = c.showOnWebsite && (days === null || days > PUBLIC_INACTIVE_DAYS);
      const score = calcPaymentScore(c, co);
      const owedNow = co.filter(o => o.status !== "paid").reduce((s, o) => s + (o.total || 0), 0);
      // Indicador de grupo (misma dueña)
      const groupSiblings = c.ownerGroup ? clients.filter(x => x.ownerGroup === c.ownerGroup).length : 0;
      return <div key={c.id}>
        {c._isFirstOfGroup && groupSiblings > 1 && <div style={{ fontSize: 11, fontWeight: 700, color: "#6C3483", marginTop: 8, marginBottom: 4, padding: "2px 8px" }}>👥 Grupo: {c.ownerGroup} ({groupSiblings} sucursales)</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: publicInactive ? "#FFF8E1" : fu ? "#FDF2E9" : "#fff", border: "1px solid #eee", borderLeft: c.ownerGroup ? "4px solid #6C3483" : "1px solid #eee", borderRadius: 8, marginBottom: 5 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
              <Badge text={c.tier} color={TIER_CLR[c.tier]} />
              {c.zone && <Badge text={c.zone} color="#6C3483" />}
              {c.language === "English" && <Badge text="EN" color={LANG_CLR["English"]} />}
              {c.paymentTerms && c.paymentTerms !== "Contado" && <Badge text={c.paymentTerms} color={TERM_CLR[c.paymentTerms]} />}
              {score !== null && <Badge text={`Score ${score}`} color={SCORE_CLR(score)} />}
              {c.showOnWebsite && <Badge text="🌐 Web" color="#1A5276" />}
              {publicInactive && <Badge text="⚠️ +90d inactivo" color="#D35400" />}
              {fu && !publicInactive && <Badge text={`${days}d — follow up!`} color="#D35400" />}
            </div>
            <div style={{ fontSize: 12, color: "#777" }}>{[c.contact, c.phone].filter(Boolean).join(" • ")}</div>
          </div>
          <div style={{ textAlign: "right", marginRight: 10, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{co.length} orders • {fmt(ts)}</div>
            <div style={{ fontSize: 11, color: "#999" }}>{last ? `Last: ${fmtD(last.date)}` : "No orders"}</div>
            {owedNow > 0 && <div style={{ fontSize: 11, color: "#C41E3A", fontWeight: 700 }}>Debe: {fmt(owedNow)}</div>}
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {c.phone && <WaBtn phone={c.phone} msg={`Hola ${c.contact || c.name}, soy José de Dulce Sabor.\n\n¿Cómo van las ventas de Slaps? ¿Listo para un reorden?\n\nOrdena en línea: https://dulcesaborca.com\n(707) 360-7420`} label="WA" small />}
            <Btn small onClick={() => openE(c)}>Edit</Btn><Btn small danger onClick={() => del(c.id)} style={delC === c.id ? { minWidth: 52, background: "#8B0000" } : {}}>{delC === c.id ? "Sure?" : "✕"}</Btn>
          </div>
        </div>
      </div>;
    })}
    {sf && <Modal title={edit ? "Edit client" : "New client"} onClose={() => setSf(false)}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <Inp label="Store name *" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Dulceria Mi Carnaval" />
        <Inp label="Contact" value={form.contact} onChange={v => setForm(p => ({ ...p, contact: v }))} placeholder="Juan Pérez" />
        <Inp label="Phone" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} placeholder="(408) 555-1234" />
        <Inp label="Zone" value={form.zone} onChange={v => setForm(p => ({ ...p, zone: v }))} options={ZONES} />
        <Inp label="Tier" value={form.tier} onChange={v => setForm(p => ({ ...p, tier: v }))} options={TIERS} />
        <Inp label="Address" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="1161 E Santa Clara St" />
      </div>
      {/* === SUCURSALES, CRÉDITO E IDIOMA — v5.13 === */}
      <div style={{ background: "#F8F4FF", borderRadius: 8, padding: "10px 14px", marginTop: 6, marginBottom: 6, borderLeft: "4px solid #6C3483" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6C3483", marginBottom: 6 }}>Sucursal, términos de pago e idioma</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0 12px" }}>
          <Inp label="Grupo (mismo dueño)" value={form.ownerGroup} onChange={v => setForm(p => ({ ...p, ownerGroup: v }))} placeholder="Ej: Luis Hdez" />
          <Inp label="Términos de pago" value={form.paymentTerms} onChange={v => setForm(p => ({ ...p, paymentTerms: v }))} options={PAYMENT_TERMS} />
          <Inp label="Límite de crédito ($)" type="number" value={form.creditLimit} onChange={v => setForm(p => ({ ...p, creditLimit: v }))} placeholder="opcional" />
          <Inp label="Idioma del cliente" value={form.language} onChange={v => setForm(p => ({ ...p, language: v }))} options={LANGUAGES} />
        </div>
        <div style={{ fontSize: 11, color: "#777", lineHeight: 1.4 }}>El idioma controla el recibo y los mensajes de WhatsApp para este cliente. Si tienes varias sucursales del mismo dueño, pon el mismo "Grupo".</div>
      </div>
      <Inp label="Notes" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} textarea />

      {/* === SECCIÓN PUBLICAR EN SITIO WEB (v5.10) === */}
      <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
        <button onClick={() => setShowWebSection(s => !s)} style={{ width: "100%", padding: "10px 14px", background: form.showOnWebsite ? "#E3F2FD" : "#F8F8F8", border: "none", textAlign: "left", fontSize: 13, fontWeight: 700, color: "#1A5276", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>🌐 Publicar en dulcesaborca.com {form.showOnWebsite && "✓"}</span>
          <span style={{ fontSize: 16 }}>{showWebSection ? "▾" : "▸"}</span>
        </button>
        {showWebSection && <div style={{ padding: "12px 14px", background: "#fff" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={!!form.showOnWebsite} onChange={e => setForm(p => ({ ...p, showOnWebsite: e.target.checked }))} style={{ width: 18, height: 18 }} />
            Mostrar esta tienda en /donde-comprar
          </label>
          {form.showOnWebsite && <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              <Inp label="Nombre comercial (opcional)" value={form.publicDisplayName} onChange={v => setForm(p => ({ ...p, publicDisplayName: v }))} placeholder={form.name || "Si distinto al legal"} />
              <Inp label="Horario público" value={form.publicHours} onChange={v => setForm(p => ({ ...p, publicHours: v }))} placeholder="Lun-Sáb 9am-8pm" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 5 }}>Foto del local</label>
              {form.publicPhotoUrl && <div style={{ marginBottom: 6 }}><img src={form.publicPhotoUrl} alt="Local" style={{ maxWidth: 200, maxHeight: 120, borderRadius: 6, border: "1px solid #ddd" }} /></div>}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
              <Btn small onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? "Subiendo..." : form.publicPhotoUrl ? "📷 Cambiar foto" : "📷 Subir foto"}</Btn>
              {form.publicPhotoUrl && <Btn small onClick={() => setForm(p => ({ ...p, publicPhotoUrl: "" }))} style={{ marginLeft: 6 }}>Quitar</Btn>}
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, padding: 10, background: "#FFF8E1", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={!!form.permissionConfirmed} onChange={e => setForm(p => ({ ...p, permissionConfirmed: e.target.checked }))} style={{ width: 16, height: 16, marginTop: 2 }} />
              <span><b>Confirmo</b> que el cliente me dio permiso para publicar su negocio en dulcesaborca.com (foto, dirección, horario y WhatsApp). {form.websitePermissionDate && <span style={{ color: "#777" }}>— Permiso desde: {fmtD(form.websitePermissionDate)}</span>}</span>
            </label>
          </>}
          {syncMsg && <div style={{ padding: "6px 10px", marginTop: 10, background: syncMsg.ok ? "#E8F5E9" : "#FDE8E8", color: syncMsg.ok ? "#1B7340" : "#C41E3A", borderRadius: 6, fontSize: 12 }}>{syncMsg.text}</div>}
        </div>}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><Btn onClick={() => { setSf(false); setSyncMsg(null); }}>Cancel</Btn><Btn primary onClick={save}>{edit ? "Update" : "Add"}</Btn></div>
    </Modal>}
  </div>;
};

const Orders = ({ clients, orders, setOrders, inventory, setInventory, saveAll, setTab, setRO }) => {
  const [sf, setSf] = useState(false); const [delConfirm, setDelConfirm] = useState(null); const delORef = useRef(null); const [stockAck, setStockAck] = useState(false); const [form, setForm] = useState({ clientId: "", date: new Date().toISOString().slice(0, 10), items: [{ productId: "", qty: 1 }], notes: "", status: "pending" });
  const openN = () => { setForm({ clientId: "", date: new Date().toISOString().slice(0, 10), items: [{ productId: "", qty: 1 }], notes: "", status: "pending" }); setSf(true); };
  const addL = () => setForm(p => ({ ...p, items: [...p.items, { productId: "", qty: 1 }] }));
  const remL = (i) => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  const upL = (i, f, v) => setForm(p => { const items = [...p.items]; items[i] = { ...items[i], [f]: f === "qty" ? Math.max(1, parseInt(v) || 1) : v }; return { ...p, items }; });
  const cl = clients.find(c => c.id === form.clientId); const disc = cl ? TIER_DISC[cl.tier] || 0 : 0;
  const calcT = () => form.items.reduce((s, it) => { const p = pF(it.productId); return s + (p ? p.price * it.qty * (1 - disc) : 0); }, 0);
  const calcC = () => form.items.reduce((s, it) => { const p = pF(it.productId); return s + (p ? p.cost * it.qty : 0); }, 0);

  // FIX #5: Checar stock antes de guardar orden
  const getStockWarnings = () => {
    const warnings = [];
    form.items.filter(it => it.productId).forEach(it => {
      const inv = inventory.find(i => i.productId === it.productId);
      const avail = inv?.stock || 0;
      if (it.qty > avail) {
        const p = pF(it.productId);
        warnings.push(`${p?.name}: requesting ${it.qty}, only ${avail} in stock`);
      }
    });
    return warnings;
  };

  const saveO = () => { if (!form.clientId || form.items.every(it => !it.productId)) return;
    const warnings = getStockWarnings();
    if (warnings.length > 0 && !stockAck) { setStockAck(true); return; }
    const vi = form.items.filter(it => it.productId); const total = calcT(); const order = { id: uid(), ...form, items: vi, total, discount: disc, created: new Date().toISOString() }; const ni = [...inventory]; vi.forEach(it => { const idx = ni.findIndex(inv => inv.productId === it.productId); if (idx >= 0) ni[idx] = { ...ni[idx], stock: Math.max(0, ni[idx].stock - it.qty) }; }); setOrders(prev => { const n = [...prev, order]; saveAll("orders", n); return n; }); setInventory(ni); saveAll("inventory", ni); setSf(false); setStockAck(false); };
  const upSt = (id, st) => setOrders(prev => {
    const n = prev.map(o => {
      if (o.id !== id) return o;
      const updated = { ...o, status: st };
      // v5.11: registrar fecha de cambio de estado para scoring de pago
      if (st === "delivered" && !o.deliveredDate) updated.deliveredDate = new Date().toISOString().slice(0, 10);
      if (st === "paid" && !o.paidDate) updated.paidDate = new Date().toISOString().slice(0, 10);
      return updated;
    });
    saveAll("orders", n);
    return n;
  });
  const delO = (id) => { if (delORef.current === id) { setOrders(prev => { const n = prev.filter(o => o.id !== id); saveAll("orders", n); return n; }); delORef.current = null; setDelConfirm(null); } else { delORef.current = id; setDelConfirm(id); setTimeout(() => { if (delORef.current === id) { delORef.current = null; setDelConfirm(null); } }, 3000); } };
  const qReorder = (o) => { setForm({ clientId: o.clientId, date: new Date().toISOString().slice(0, 10), items: o.items.map(it => ({ productId: it.productId, qty: it.qty })), notes: "Reorder from " + fmtD(o.date), status: "pending" }); setSf(true); };
  return <div>
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><Btn primary onClick={openN}>+ New order</Btn></div>
    {orders.length === 0 && <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 40 }}>No orders yet.</p>}
    {orders.slice().reverse().map(o => { const c = clients.find(x => x.id === o.clientId); const tc = o.items.reduce((a, it) => a + it.qty, 0); const cost = o.items.reduce((a, it) => a + (pF(it.productId)?.cost || 0) * it.qty, 0); const prof = (o.total || 0) - cost;
      return <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#fff", border: "1px solid #eee", borderRadius: 8, marginBottom: 4, fontSize: 13 }}>
        <div style={{ flex: 1, minWidth: 0 }}><b>{c?.name || "?"}</b> <span style={{ color: "#999" }}>{fmtD(o.date)}</span> <span style={{ color: "#777" }}>{tc} cases</span>{o.discount > 0 && <Badge text={`-${Math.round(o.discount * 100)}%`} color="#D35400" />}{o.foDisc && <Badge text={`1ª orden ${o.foDisc.tier}`} color="#1A5276" />}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}><div style={{ textAlign: "right", marginRight: 4 }}><div style={{ fontWeight: 700 }}>{fmt(o.total)}</div><div style={{ fontSize: 11, color: "#1B7340" }}>+{fmt(prof)}</div></div>
        <select value={o.status} onChange={e => upSt(o.id, e.target.value)} style={{ padding: "3px 6px", border: "1px solid #ddd", borderRadius: 4, fontSize: 11, background: o.status === "paid" ? "#E8F5E8" : o.status === "delivered" ? "#EBF5FB" : "#FDF2E9" }}><option value="pending">Pending</option><option value="delivered">Delivered</option><option value="paid">Paid</option></select>
        {c?.phone && <WaBtn phone={c.phone} msg={o.status !== "paid" ? waPayment(o, c) : waOrder(o, c)} label={o.status !== "paid" ? "Remind" : "WA"} small />}
        <Btn small onClick={() => qReorder(o)} style={{ fontSize: 10 }}>Reorder</Btn><Btn small onClick={() => { setRO(o); setTab("receipt"); }} style={{ fontSize: 10 }}>Receipt</Btn>
        <Btn small danger onClick={() => delO(o.id)} style={delConfirm === o.id ? { fontSize: 10, minWidth: 52, background: "#8B0000" } : { fontSize: 10 }}>{delConfirm === o.id ? "Sure?" : "✕"}</Btn></div></div>; })}
    {sf && <Modal title="New order" onClose={() => setSf(false)} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}><div style={{ marginBottom: 10 }}><label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 3 }}>Client *</label><select value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}><option value="">-- Select --</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.tier})</option>)}</select></div><Inp label="Date" type="date" value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} /></div>
      {form.clientId && cl && <div style={{ fontSize: 12, color: "#1B7340", marginBottom: 10, padding: "6px 10px", background: "#E8F5E8", borderRadius: 6 }}>{cl.name} — {cl.tier} {disc > 0 ? `(${Math.round(disc * 100)}% off)` : "(list price)"}</div>}
      <label style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Items</label>
      {form.items.map((it, i) => {
        // FIX #5: Mostrar stock disponible y warning visual
        const inv = it.productId ? inventory.find(x => x.productId === it.productId) : null;
        const avail = inv?.stock || 0;
        const overStock = it.productId && it.qty > avail;
        return <div key={i} style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
          <select value={it.productId} onChange={e => upL(i, "productId", e.target.value)} style={{ flex: 2, padding: "7px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}><option value="">-- Product --</option>{PRODUCTS.map(p => { const pInv = inventory.find(x => x.productId === p.id); return <option key={p.id} value={p.id}>{p.name} ({fmt(p.price)}) — {pInv?.stock || 0} avail</option>; })}</select>
          <input type="number" min="1" value={it.qty} onChange={e => upL(i, "qty", e.target.value)} style={{ width: 55, padding: "7px", border: `1px solid ${overStock ? "#C41E3A" : "#ddd"}`, borderRadius: 6, fontSize: 13, textAlign: "center", background: overStock ? "#FDE8E8" : "#fff" }} />
          <span style={{ fontSize: 12, color: "#1B7340", minWidth: 60, fontWeight: 600 }}>{it.productId ? fmt(pF(it.productId)?.price * it.qty * (1 - disc)) : ""}</span>
          {overStock && <span style={{ fontSize: 10, color: "#C41E3A", fontWeight: 700, whiteSpace: "nowrap" }}>only {avail}!</span>}
          {form.items.length > 1 && <button onClick={() => remL(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C41E3A", fontSize: 16 }}>✕</button>}
        </div>; })}
      <Btn small onClick={addL} style={{ marginTop: 8 }}>+ Add product</Btn>
      <Inp label="Notes" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} textarea style={{ marginTop: 10 }} />
      {getStockWarnings().length > 0 && <div style={{ background: "#FDF2E9", padding: "8px 12px", borderRadius: 6, marginTop: 8, fontSize: 12, color: "#D35400", borderLeft: "3px solid #D35400" }}>
        <b>Stock warnings:</b> {getStockWarnings().join("; ")}
        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>You can still create the order — inventory will go to 0.</div>
      </div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#E8F5E8", borderRadius: 8, margin: "12px 0" }}><div><div style={{ fontSize: 12, color: "#1B7340" }}>Total</div><div style={{ fontSize: 24, fontWeight: 900, color: "#1B7340" }}>{fmt(calcT())}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 12, color: "#777" }}>Cost: {fmt(calcC())}</div><div style={{ fontSize: 16, fontWeight: 700, color: "#1B7340" }}>Profit: {fmt(calcT() - calcC())}</div></div></div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Btn onClick={() => { setSf(false); setStockAck(false); }}>Cancel</Btn><Btn primary onClick={saveO}>{stockAck ? "Confirm — create anyway" : "Create order"}</Btn></div>
    </Modal>}
  </div>;
};

const Inventory = ({ inventory, setInventory, orders, saveAll }) => {
  const [sr, setSr] = useState(false); const [ri, setRi] = useState([]);
  const openR = () => { setRi(PRODUCTS.map(p => ({ productId: p.id, add: 0 }))); setSr(true); };
  const doR = () => { const ni = [...inventory]; ri.forEach(r => { if (r.add > 0) { const idx = ni.findIndex(i => i.productId === r.productId); if (idx >= 0) ni[idx] = { ...ni[idx], stock: ni[idx].stock + r.add, lastRestock: new Date().toISOString() }; else ni.push({ productId: r.productId, stock: r.add, lastRestock: new Date().toISOString() }); } }); setInventory(ni); saveAll("inventory", ni); setSr(false); };
  const tC = inventory.reduce((s, i) => s + (pF(i.productId)?.cost || 0) * i.stock, 0);
  const tR = inventory.reduce((s, i) => s + (pF(i.productId)?.price || 0) * i.stock, 0);
  // FIX #4: Usar semanas reales
  const weeks = calcWeeks(orders);
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}><div style={{ display: "flex", gap: 10 }}><Card title="Cost" value={fmt(tC)} color="#C41E3A" /><Card title="Retail" value={fmt(tR)} color="#1B7340" /><Card title="Potential profit" value={fmt(tR - tC)} color="#6C3483" /></div><Btn primary onClick={openR}>+ Manual restock</Btn></div>
    {PRODUCTS.map(p => { const inv = inventory.find(i => i.productId === p.id); const st = inv?.stock || 0; const low = st > 0 && st <= LOW; const out = st === 0; const sold = orders.reduce((s, o) => s + o.items.filter(it => it.productId === p.id).reduce((a, it) => a + it.qty, 0), 0); const wr = weeks > 0 ? Math.round(sold / weeks * 10) / 10 : 0; const wl = wr > 0 ? Math.round(st / wr * 10) / 10 : null;
      return <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", background: out ? "#FDE8E8" : low ? "#FDF2E9" : "#fff", border: "1px solid #eee", borderRadius: 8, marginBottom: 3, fontSize: 13 }}>
        <div><b>{p.name}</b> <span style={{ color: "#999", fontSize: 11 }}>{p.sku}</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}><span style={{ fontSize: 11, color: "#999" }}>{fmt(p.cost)} / {fmt(p.price)}</span><span style={{ fontSize: 11, color: "#777" }}>~{wr}/wk</span>{wl !== null && wl < 3 && <Badge text={`${wl}wk`} color="#C41E3A" />}<span style={{ fontSize: 18, fontWeight: 900, color: out ? "#C41E3A" : low ? "#D35400" : "#1B7340", minWidth: 50, textAlign: "right" }}>{st}</span>{(out || low) && <Badge text={out ? "OUT" : "LOW"} color={out ? "#C41E3A" : "#D35400"} />}</div></div>; })}
    {sr && <Modal title="Manual restock" onClose={() => setSr(false)}><p style={{ fontSize: 13, color: "#777", marginBottom: 12 }}>For auto-restock from invoices, use Purchases tab.</p>{PRODUCTS.map(p => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f0f0f0" }}><span style={{ fontSize: 13 }}>{p.name} <span style={{ color: "#999", fontSize: 11 }}>(stock: {inventory.find(i => i.productId === p.id)?.stock || 0})</span></span><input type="number" min="0" value={ri.find(r => r.productId === p.id)?.add || 0} onChange={e => setRi(prev => prev.map(r => r.productId === p.id ? { ...r, add: parseInt(e.target.value) || 0 } : r))} style={{ width: 60, padding: "5px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, textAlign: "center" }} /></div>)}<div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}><Btn onClick={() => setSr(false)}>Cancel</Btn><Btn primary onClick={doR}>Save</Btn></div></Modal>}
  </div>;
};

const Purchases = ({ purchases, setPurchases, inventory, setInventory, saveAll }) => {
  const [mp, setMp] = useState(false);
  const [poF, setPoF] = useState({ date: new Date().toISOString().slice(0, 10), items: PRODUCTS.map(p => ({ productId: p.id, qty: 0, unitCost: p.cost })), invoiceNum: "", notes: "" });

  const saveManual = () => {
    const items = poF.items.filter(i => i.qty > 0); if (items.length === 0) return;
    const total = items.reduce((s, i) => s + i.unitCost * i.qty, 0);
    const po = { id: uid(), date: poF.date, invoiceNum: poF.invoiceNum, items: items.map(i => ({ ...i, name: pF(i.productId)?.name })), total, notes: poF.notes, source: "manual", created: new Date().toISOString() };
    setPurchases(prev => { const n = [...prev, po]; saveAll("purchases", n); return n; });
    const ni = [...inventory]; items.forEach(it => { const idx = ni.findIndex(i => i.productId === it.productId); if (idx >= 0) ni[idx] = { ...ni[idx], stock: ni[idx].stock + it.qty, lastRestock: new Date().toISOString() }; else ni.push({ productId: it.productId, stock: it.qty, lastRestock: new Date().toISOString() }); });
    setInventory(ni); saveAll("inventory", ni); setMp(false); setPoF({ date: new Date().toISOString().slice(0, 10), items: PRODUCTS.map(p => ({ productId: p.id, qty: 0, unitCost: p.cost })), invoiceNum: "", notes: "" });
  };

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}><Card title="Total purchased" value={fmt(purchases.reduce((s, p) => s + (p.total || 0), 0))} sub={`${purchases.length} POs`} color="#1A5276" /><Btn primary onClick={() => setMp(true)}>+ New purchase</Btn></div>
    <ST>Purchase history</ST>
    {purchases.length === 0 && <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 30 }}>No purchases yet.</p>}
    {purchases.slice().reverse().map(p => <div key={p.id} style={{ padding: "10px 14px", background: "#fff", border: "1px solid #eee", borderRadius: 8, marginBottom: 5 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><div><b>{fmtD(p.date)}</b>{p.invoiceNum && <span style={{ color: "#999", marginLeft: 8 }}>#{p.invoiceNum}</span>}</div><b style={{ color: "#C41E3A" }}>{fmt(p.total)}</b></div><div style={{ fontSize: 12, color: "#777" }}>{p.items.map(i => `${i.name || i.productId} ×${i.qty}`).join(", ")}</div></div>)}

    {mp && <Modal title="New purchase" onClose={() => setMp(false)} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}><Inp label="Date" type="date" value={poF.date} onChange={v => setPoF(p => ({ ...p, date: v }))} /><Inp label="Invoice #" value={poF.invoiceNum} onChange={v => setPoF(p => ({ ...p, invoiceNum: v }))} placeholder="MPG-2026-0042" /><Inp label="Notes" value={poF.notes} onChange={v => setPoF(p => ({ ...p, notes: v }))} /></div>
      {PRODUCTS.map(p => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f0f0f0" }}><span style={{ fontSize: 13 }}>{p.name} <span style={{ color: "#999", fontSize: 11 }}>{fmt(p.cost)}/case</span></span><input type="number" min="0" value={poF.items.find(it => it.productId === p.id)?.qty || 0} onChange={e => setPoF(prev => ({ ...prev, items: prev.items.map(it => it.productId === p.id ? { ...it, qty: parseInt(e.target.value) || 0 } : it) }))} style={{ width: 60, padding: "5px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, textAlign: "center" }} /></div>)}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", marginTop: 8, borderTop: "2px solid #C41E3A", fontSize: 16, fontWeight: 700, color: "#C41E3A" }}><span>Total</span><span>{fmt(poF.items.reduce((s, i) => s + i.unitCost * i.qty, 0))}</span></div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><Btn onClick={() => setMp(false)}>Cancel</Btn><Btn primary onClick={saveManual}>Save & update inventory</Btn></div></Modal>}
  </div>;
};

const Reports = ({ orders, clients, purchases }) => {
  // FIX #4: Usar semanas reales
  const weeks = calcWeeks(orders);
  const md = {}; orders.forEach(o => { const m = o.date?.slice(0, 7) || "?"; if (!md[m]) md[m] = { rev: 0, cost: 0, cases: 0, orders: 0 }; md[m].rev += o.total || 0; md[m].cost += o.items.reduce((a, it) => a + (pF(it.productId)?.cost || 0) * it.qty, 0); md[m].cases += o.items.reduce((a, it) => a + it.qty, 0); md[m].orders++; });
  const ps = PRODUCTS.map(p => { const sold = orders.reduce((s, o) => s + o.items.filter(it => it.productId === p.id).reduce((a, it) => a + it.qty, 0), 0); const rev = orders.reduce((s, o) => s + o.items.filter(it => it.productId === p.id).reduce((a, it) => { const base = (o.foDisc && p.id === "Slaps") ? o.foDisc.price : p.price * (1 - (o.discount || 0)); return a + base * it.qty; }, 0), 0); return { ...p, sold, rev, prof: rev - p.cost * sold }; }).sort((a, b) => b.sold - a.sold);
  const tR = orders.reduce((s, o) => s + (o.total || 0), 0); const tC = orders.reduce((s, o) => s + o.items.reduce((a, it) => a + (pF(it.productId)?.cost || 0) * it.qty, 0), 0);
  return <div>
    <ST>P&L summary <span style={{ fontSize: 11, fontWeight: 400, color: "#999" }}>({Math.round(weeks)} week span)</span></ST>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}><Card title="Revenue" value={fmt(tR)} color="#1B7340" /><Card title="COGS" value={fmt(tC)} color="#C41E3A" /><Card title="Gross profit" value={fmt(tR - tC)} sub={tR > 0 ? `${Math.round((tR - tC) / tR * 100)}%` : ""} color="#1B7340" /><Card title="Purchased" value={fmt(purchases.reduce((s, p) => s + (p.total || 0), 0))} color="#1A5276" /></div>
    <ST>Monthly breakdown</ST>
    {Object.entries(md).sort().reverse().map(([m, d]) => <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}><b style={{ minWidth: 70 }}>{m}</b><span>{d.orders} ord</span><span>{d.cases} cases</span><span>Rev: {fmt(d.rev)}</span><span>Cost: {fmt(d.cost)}</span><span style={{ color: "#1B7340", fontWeight: 700 }}>Profit: {fmt(d.rev - d.cost)}</span><span style={{ fontSize: 11, color: "#777" }}>{d.rev > 0 ? Math.round((d.rev - d.cost) / d.rev * 100) : 0}%</span></div>)}
    <ST>Product performance</ST>
    {ps.filter(p => p.sold > 0).map(p => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}><span style={{ minWidth: 160 }}>{p.name}</span><span>{p.sold} cases</span><span>Rev: {fmt(p.rev)}</span><span style={{ color: "#1B7340", fontWeight: 600 }}>Profit: {fmt(p.prof)}</span></div>)}
  </div>;
};

const Receipt = ({ order, clients, orders }) => {
  if (!order) return <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 40 }}>Select from Orders tab.</p>;
  const cl = clients.find(c => c.id === order.clientId); const disc = order.discount || 0;
  const sub = order.items.reduce((s, it) => s + (pF(it.productId)?.price || 0) * it.qty, 0);
  const invNum = invoiceNumber(order, orders || []);
  const dueDate = cl ? orderDueDate(order, cl) : null;
  const terms = cl?.paymentTerms || "Contado";
  const lang = cl?.language || "Español";

  const downloadPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const W = doc.internal.pageSize.getWidth();
    const mg = 50, cw = W - mg * 2;
    let y = 50;
    doc.setFillColor(196, 30, 58); doc.rect(0, 0, W, 6, "F");
    // Header — nombre comercial
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(196, 30, 58);
    doc.text(BUSINESS.tradeName, W / 2, y, { align: "center" }); y += 16;
    // Nombre legal
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
    doc.text(BUSINESS.legalName, W / 2, y, { align: "center" }); y += 11;
    doc.setTextColor(120, 120, 120);
    doc.text(BUSINESS.tagline, W / 2, y, { align: "center" }); y += 11;
    doc.text(`${BUSINESS.address}, ${BUSINESS.cityStateZip}`, W / 2, y, { align: "center" }); y += 11;
    doc.text(`${BUSINESS.contact} \u2022 ${BUSINESS.phone} \u2022 ${BUSINESS.email}`, W / 2, y, { align: "center" }); y += 11;
    doc.setFontSize(8); doc.setTextColor(140, 140, 140);
    doc.text(`EIN: ${BUSINESS.ein}  \u2022  CA Seller's Permit: ${BUSINESS.sellersPermit}`, W / 2, y, { align: "center" }); y += 14;
    doc.setDrawColor(196, 30, 58); doc.setLineWidth(2); doc.line(mg, y, W - mg, y); y += 18;

    // INVOICE label + número
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(60, 60, 60);
    doc.text(tr(lang, "INVOICE / FACTURA"), mg, y);
    doc.setFontSize(11); doc.setTextColor(196, 30, 58);
    doc.text(invNum, W - mg, y, { align: "right" }); y += 18;

    // Bill To + Fechas
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text(tr(lang, "BILL TO / FACTURAR A"), mg, y);
    doc.text(tr(lang, "FECHAS"), W - mg - 160, y); y += 12;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
    doc.text(cl?.name || "\u2014", mg, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
    doc.text(`${tr(lang, "Pedido")}: ${fmtD(order.date)}`, W - mg - 160, y); y += 12;
    if (cl?.address) { doc.text(cl.address, mg, y); }
    if (order.deliveredDate) doc.text(`${tr(lang, "Entrega")}: ${fmtD(order.deliveredDate)}`, W - mg - 160, y); y += 12;
    if (cl?.contact) { doc.text(`${tr(lang, "Atn:")} ${cl.contact}`, mg, y); }
    if (dueDate && terms !== "Contado") doc.text(`${tr(lang, "Vence")}: ${fmtD(dueDate)}`, W - mg - 160, y); y += 12;
    if (cl?.phone) { doc.text(cl.phone, mg, y); y += 12; }

    // Status badge + términos
    y += 6;
    const sc = { pending: [211, 84, 0], delivered: [26, 82, 118], paid: [27, 115, 64] }[order.status] || [100, 100, 100];
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(sc[0], sc[1], sc[2]);
    doc.text(`${tr(lang, "ESTADO")}: ${tr(lang, order.status).toUpperCase()}`, mg, y);
    doc.setTextColor(108, 52, 131);
    doc.text(`${tr(lang, "Términos")}: ${tr(lang, terms)}`, W - mg, y, { align: "right" }); y += 16;

    doc.setDrawColor(196, 30, 58); doc.setLineWidth(2); doc.line(mg, y, W - mg, y); y += 16;

    // Tabla productos
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(196, 30, 58);
    const cols = [mg, mg + cw * 0.50, mg + cw * 0.65, mg + cw * 0.82];
    doc.text(tr(lang, "Producto"), cols[0], y); doc.text(tr(lang, "Cant."), cols[1], y, { align: "center" }); doc.text(tr(lang, "Precio"), cols[2], y, { align: "right" }); doc.text(tr(lang, "Total"), W - mg, y, { align: "right" }); y += 8;
    doc.setDrawColor(196, 30, 58); doc.setLineWidth(0.5); doc.line(mg, y, W - mg, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
    order.items.forEach(it => { const p = pF(it.productId); doc.text(p?.name || it.productId, cols[0], y); doc.text(String(it.qty), cols[1], y, { align: "center" }); doc.text(fmt(p?.price), cols[2], y, { align: "right" }); doc.text(fmt((p?.price || 0) * it.qty), W - mg, y, { align: "right" }); y += 6; doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3); doc.line(mg, y, W - mg, y); y += 14; });
    y += 4; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5); doc.line(mg + cw * 0.5, y, W - mg, y); y += 16;

    // Totales
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(60, 60, 60);
    doc.text(tr(lang, "Subtotal"), mg + cw * 0.5, y); doc.text(fmt(sub), W - mg, y, { align: "right" }); y += 16;
    if (disc > 0) { doc.setTextColor(27, 115, 64); doc.text(`${tr(lang, "Descuento")} (${cl?.tier} ${Math.round(disc * 100)}%)`, mg + cw * 0.5, y); doc.text(`-${fmt(sub * disc)}`, W - mg, y, { align: "right" }); y += 16; }
    doc.setTextColor(120, 120, 120); doc.setFontSize(9);
    doc.text(tr(lang, "Sales Tax (Sale for Resale)"), mg + cw * 0.5, y); doc.text("$0.00", W - mg, y, { align: "right" }); y += 14;
    doc.setDrawColor(196, 30, 58); doc.setLineWidth(2); doc.line(mg + cw * 0.5, y, W - mg, y); y += 20;
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(196, 30, 58);
    doc.text(tr(lang, "TOTAL"), mg + cw * 0.5, y); doc.text(fmt(order.total), W - mg, y, { align: "right" }); y += 16;

    // Si está pagada — info de pago
    if (order.status === "paid" && order.paidDate) {
      y += 8; doc.setFillColor(232, 245, 232); doc.rect(mg, y - 4, cw, 22, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(27, 115, 64);
      doc.text(`${tr(lang, "PAGADO el")} ${fmtD(order.paidDate)}`, mg + 8, y + 10);
      if (order.paymentMethod) doc.text(`${order.paymentMethod}${order.paymentRef ? ` #${order.paymentRef}` : ""}`, W - mg - 8, y + 10, { align: "right" });
      y += 28;
    }

    if (order.notes) { y += 6; doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(120, 120, 120); doc.text(`${tr(lang, "Notas:")} ${order.notes}`, mg, y); y += 14; }

    // Sale for Resale notice
    y += 8; doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.5); doc.line(mg, y, W - mg, y); y += 12;
    doc.setFillColor(255, 248, 225); doc.rect(mg, y - 4, cw, 28, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    doc.text(tr(lang, "SALE FOR RESALE / VENTA PARA REVENTA"), mg + 8, y + 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text(`${tr(lang, "Buyer's Resale Certificate on file. CA Seller's Permit:")} ${BUSINESS.sellersPermit}`, mg + 8, y + 20);
    y += 36;

    // Formas de pago
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(80, 80, 80); doc.text(tr(lang, "Formas de pago"), mg, y); y += 13;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100, 100, 100);
    [`${tr(lang, "Cheque a nombre de:")} ${BUSINESS.legalName}`, `Zelle: ${BUSINESS.zelle}`, `Venmo: ${BUSINESS.venmo}`, tr(lang, "Efectivo contra entrega")].forEach(pm => { doc.text(`\u2022  ${pm}`, mg + 8, y); y += 12; });

    // Línea de firma
    y += 12; doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.5);
    doc.line(mg, y, mg + cw * 0.45, y); doc.line(mg + cw * 0.55, y, W - mg, y); y += 10;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140, 140, 140);
    doc.text(tr(lang, "Firma del cliente / recibido"), mg, y); doc.text(tr(lang, "Firma del vendedor"), mg + cw * 0.55, y); y += 16;

    // Footer
    doc.setFontSize(8); doc.setTextColor(160, 160, 160);
    doc.text(`${tr(lang, "¡Gracias por tu compra!")} \u2022 https://${BUSINESS.website}`, W / 2, y, { align: "center" });
    doc.setFillColor(196, 30, 58); doc.rect(0, doc.internal.pageSize.getHeight() - 6, W, 6, "F");
    doc.save(`${invNum}_${(cl?.name || "cliente").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
  };

  const printThermal = () => {
    const items = order.items.map(it => { const p = pF(it.productId); return `<tr><td style="padding:2px 0">${p?.name || it.productId}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right">${fmt((p?.price || 0) * it.qty * (1 - disc))}</td></tr>`; }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Print</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:monospace,sans-serif;width:72mm;font-size:11px;color:#000;padding:2mm}
@page{size:80mm auto;margin:0}
@media print{body{width:72mm;padding:2mm}}.hdr{text-align:center;border-bottom:2px dashed #000;padding-bottom:4px;margin-bottom:6px}
.hdr h1{font-size:16px;font-weight:900;letter-spacing:1px}.hdr p{font-size:9px;line-height:1.3}
.legal{font-size:8px;color:#000;text-align:center;border-bottom:1px dashed #000;padding-bottom:3px;margin-bottom:6px;line-height:1.3}
.info{display:flex;justify-content:space-between;margin-bottom:4px;font-size:10px}
.info2{font-size:9px;margin-bottom:6px;line-height:1.4}
table{width:100%;border-collapse:collapse;font-size:11px;margin:4px 0}th{text-align:left;border-bottom:1px dashed #000;padding:2px 0;font-size:10px}
td{padding:2px 0}.tot{border-top:2px dashed #000;margin-top:6px;padding-top:4px;font-size:11px}
.tot .line{display:flex;justify-content:space-between;padding:1px 0}
.tot .grand{font-size:15px;font-weight:900;border-top:2px solid #000;margin-top:4px;padding-top:4px}
.resale{border:1px dashed #000;padding:4px;margin-top:6px;font-size:9px;text-align:center;font-weight:700}
.pay{border-top:1px dashed #000;margin-top:6px;padding-top:4px;font-size:9px;line-height:1.4}
.sig{margin-top:10px;font-size:9px}.sig .line{border-bottom:1px solid #000;height:18px}
.ftr{text-align:center;border-top:1px dashed #000;margin-top:6px;padding-top:4px;font-size:9px}
.paid{background:#000;color:#fff;text-align:center;padding:3px;margin-top:6px;font-weight:900;font-size:11px}
</style></head><body>
<div class="hdr"><h1>${BUSINESS.tradeName}</h1><p><b>${BUSINESS.legalName}</b></p><p>${BUSINESS.address}<br>${BUSINESS.cityStateZip}</p><p>${BUSINESS.contact} &bull; ${BUSINESS.phone}</p><p>${BUSINESS.email}</p></div>
<div class="legal">EIN: ${BUSINESS.ein}<br>CA Seller's Permit: ${BUSINESS.sellersPermit}</div>
<div class="info"><div><b>${tr(lang, "INVOICE / FACTURA")}</b></div><div><b>${invNum}</b></div></div>
<div class="info2"><b>${cl?.name || ""}</b>${cl?.address ? `<br>${cl.address}` : ""}${cl?.contact ? `<br>${tr(lang, "Atn:")} ${cl.contact}` : ""}${cl?.phone ? `<br>${cl.phone}` : ""}<br>${tr(lang, "Pedido")}: ${fmtD(order.date)}${order.deliveredDate ? `<br>${tr(lang, "Entrega")}: ${fmtD(order.deliveredDate)}` : ""}${dueDate && terms !== "Contado" ? `<br>${tr(lang, "Vence")}: ${fmtD(dueDate)} (${tr(lang, terms)})` : `<br>${tr(lang, "Términos")}: ${tr(lang, terms)}`}</div>
<table><thead><tr><th>${tr(lang, "Producto")}</th><th style="text-align:center">${tr(lang, "Cant.")}</th><th style="text-align:right">${tr(lang, "Total")}</th></tr></thead><tbody>${items}</tbody></table>
<div class="tot"><div class="line"><span>${tr(lang, "Subtotal")}</span><span>${fmt(sub)}</span></div>
${disc > 0 ? `<div class="line"><span>${lang === "English" ? "Disc." : "Desc."} ${cl?.tier} ${Math.round(disc * 100)}%</span><span>-${fmt(sub * disc)}</span></div>` : ""}
<div class="line" style="font-size:9px;color:#666"><span>${tr(lang, "Sales Tax (Sale for Resale)")}</span><span>$0.00</span></div>
<div class="line grand"><span>${tr(lang, "TOTAL")}</span><span>${fmt(order.total)}</span></div></div>
${order.status === "paid" && order.paidDate ? `<div class="paid">${tr(lang, "PAGADO el").toUpperCase()} ${fmtD(order.paidDate)}${order.paymentMethod ? ` &bull; ${order.paymentMethod}${order.paymentRef ? ` #${order.paymentRef}` : ""}` : ""}</div>` : ""}
<div class="resale">${tr(lang, "SALE FOR RESALE / VENTA PARA REVENTA")}<br>${lang === "English" ? "Resale Cert. on file" : "Resale Cert. en archivo"}<br>Permit: ${BUSINESS.sellersPermit}</div>
<div class="pay"><b>${tr(lang, "Formas de pago")}:</b><br>&bull; ${tr(lang, "Cheque a nombre de:")} ${BUSINESS.legalName}<br>&bull; Zelle: ${BUSINESS.zelle}<br>&bull; Venmo: ${BUSINESS.venmo}<br>&bull; ${tr(lang, "Efectivo contra entrega")}</div>
${order.notes ? `<div style="font-size:9px;margin-top:4px;font-style:italic">${order.notes}</div>` : ""}
<div class="sig"><div class="line"></div><div style="text-align:center">${tr(lang, "Firma del cliente / recibido")}</div></div>
<div class="ftr">${tr(lang, "¡Gracias por tu compra!")}<br>https://${BUSINESS.website}</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
    const w = window.open("", "_blank", "width=320,height=600");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return <div>
    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
      <Btn primary onClick={printThermal} style={{ background: "#D35400" }}>🖨 Imprimir recibo</Btn>
      <Btn primary onClick={downloadPDF}>Descargar PDF</Btn>
      {cl?.phone && <WaBtn phone={cl.phone} msg={waReceipt(order, cl)} label="Enviar por WhatsApp" />}
      {cl?.phone && order.status !== "paid" && <WaBtn phone={cl.phone} msg={waPayment(order, cl)} label="Recordatorio de pago" />}
    </div>
    <div style={{ maxWidth: 540, margin: "0 auto", background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 24 }}>
      {/* Header */}
      <div style={{ textAlign: "center", borderBottom: "2px solid #C41E3A", paddingBottom: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#C41E3A", letterSpacing: 1 }}>{BUSINESS.tradeName}</div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 2, fontWeight: 600 }}>{BUSINESS.legalName}</div>
        <div style={{ fontSize: 10, color: "#888" }}>{BUSINESS.tagline}</div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{BUSINESS.address}, {BUSINESS.cityStateZip}</div>
        <div style={{ fontSize: 11, color: "#555" }}>{BUSINESS.contact} • {BUSINESS.phone} • {BUSINESS.email}</div>
        <div style={{ fontSize: 9, color: "#999", marginTop: 4 }}>EIN: {BUSINESS.ein} • CA Seller's Permit: {BUSINESS.sellersPermit}</div>
      </div>

      {/* Invoice number */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #eee" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#555" }}>{tr(lang, "INVOICE / FACTURA")}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#C41E3A" }}>{invNum}</div>
      </div>

      {/* Bill to + dates */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 9, color: "#999", fontWeight: 700, letterSpacing: 0.5 }}>{tr(lang, "BILL TO / FACTURAR A")}</div>
          <div style={{ fontWeight: 700, marginTop: 3 }}>{cl?.name}</div>
          {cl?.address && <div style={{ color: "#777", fontSize: 11 }}>{cl.address}</div>}
          {cl?.contact && <div style={{ color: "#777", fontSize: 11 }}>{tr(lang, "Atn:")} {cl.contact}</div>}
          {cl?.phone && <div style={{ color: "#777", fontSize: 11 }}>{cl.phone}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: "#999", fontWeight: 700, letterSpacing: 0.5 }}>{tr(lang, "FECHAS")}</div>
          <div style={{ fontSize: 11, marginTop: 3 }}>{tr(lang, "Pedido")}: <b>{fmtD(order.date)}</b></div>
          {order.deliveredDate && <div style={{ fontSize: 11 }}>{tr(lang, "Entrega")}: <b>{fmtD(order.deliveredDate)}</b></div>}
          {dueDate && terms !== "Contado" && <div style={{ fontSize: 11, color: "#C41E3A" }}>{tr(lang, "Vence")}: <b>{fmtD(dueDate)}</b></div>}
          <div style={{ marginTop: 6 }}>
            <Badge text={tr(lang, order.status)} color={ST_CLR[order.status]} />
            <span style={{ marginLeft: 4 }}><Badge text={tr(lang, terms)} color={TERM_CLR[terms] || "#888"} /></span>
          </div>
        </div>
      </div>

      {/* Tabla productos */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
        <thead><tr style={{ borderBottom: "2px solid #C41E3A" }}><th style={{ textAlign: "left", padding: "6px 0", color: "#C41E3A" }}>{tr(lang, "Producto")}</th><th style={{ textAlign: "center", color: "#C41E3A" }}>{tr(lang, "Cant.")}</th><th style={{ textAlign: "right", color: "#C41E3A" }}>{tr(lang, "Precio")}</th><th style={{ textAlign: "right", color: "#C41E3A" }}>{tr(lang, "Total")}</th></tr></thead>
        <tbody>{order.items.map((it, i) => { const p = pF(it.productId); return <tr key={i} style={{ borderBottom: "1px solid #eee" }}><td style={{ padding: "6px 0" }}>{p?.name || it.productId}</td><td style={{ textAlign: "center" }}>{it.qty}</td><td style={{ textAlign: "right" }}>{fmt(p?.price)}</td><td style={{ textAlign: "right" }}>{fmt((p?.price || 0) * it.qty)}</td></tr>; })}</tbody>
      </table>

      {/* Totales */}
      <div style={{ borderTop: "1px solid #ddd", paddingTop: 8, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span>{tr(lang, "Subtotal")}</span><span>{fmt(sub)}</span></div>
        {disc > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#1B7340" }}><span>{tr(lang, "Descuento")} ({cl?.tier} {Math.round(disc * 100)}%)</span><span>-{fmt(sub * disc)}</span></div>}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#999", fontSize: 11 }}><span>{tr(lang, "Sales Tax (Sale for Resale)")}</span><span>$0.00</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "2px solid #C41E3A", marginTop: 4, fontSize: 18, fontWeight: 900, color: "#C41E3A" }}><span>{tr(lang, "TOTAL")}</span><span>{fmt(order.total)}</span></div>
      </div>

      {/* Pago registrado si está pagada */}
      {order.status === "paid" && order.paidDate && (
        <div style={{ background: "#E8F5E8", border: "1px solid #1B7340", borderRadius: 6, padding: "8px 12px", marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#1B7340", fontWeight: 700, fontSize: 13 }}>✓ {tr(lang, "PAGADO el")} {fmtD(order.paidDate)}</div>
          {order.paymentMethod && <div style={{ fontSize: 12, color: "#555" }}>{order.paymentMethod}{order.paymentRef ? ` #${order.paymentRef}` : ""}</div>}
        </div>
      )}

      {order.notes && <div style={{ fontSize: 11, color: "#777", marginTop: 8, fontStyle: "italic" }}>{tr(lang, "Notas:")} {order.notes}</div>}

      {/* Sale for Resale notice */}
      <div style={{ background: "#FFF8E1", border: "1px solid #F39C12", borderRadius: 6, padding: "8px 12px", marginTop: 12, fontSize: 11 }}>
        <div style={{ fontWeight: 700, color: "#666" }}>{tr(lang, "SALE FOR RESALE / VENTA PARA REVENTA")}</div>
        <div style={{ color: "#888", marginTop: 2 }}>{tr(lang, "Buyer's Resale Certificate on file. CA Seller's Permit:")} {BUSINESS.sellersPermit}</div>
      </div>

      {/* Formas de pago */}
      <div style={{ marginTop: 12, fontSize: 11, color: "#666" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{tr(lang, "Formas de pago")}</div>
        <div>• {tr(lang, "Cheque a nombre de:")} <b>{BUSINESS.legalName}</b></div>
        <div>• Zelle: {BUSINESS.zelle}</div>
        <div>• Venmo: {BUSINESS.venmo}</div>
        <div>• {tr(lang, "Efectivo contra entrega")}</div>
      </div>

      {/* Firmas */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginTop: 24 }}>
        <div><div style={{ borderBottom: "1px solid #999", height: 30 }}></div><div style={{ fontSize: 9, color: "#999", marginTop: 3, textAlign: "center" }}>{tr(lang, "Firma del cliente / recibido")}</div></div>
        <div><div style={{ borderBottom: "1px solid #999", height: 30 }}></div><div style={{ fontSize: 9, color: "#999", marginTop: 3, textAlign: "center" }}>{tr(lang, "Firma del vendedor")}</div></div>
      </div>

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "#999", borderTop: "1px solid #eee", paddingTop: 8 }}>{tr(lang, "¡Gracias!")} • https://{BUSINESS.website}</div>
    </div></div>;
};

// ===== MARKET INTELLIGENCE =====
const BRAND_CLR = { "Mega PG": "#1B7340", "Pigüi USA": "#C41E3A", "Both": "#D35400", "Neither/Unknown": "#888" };

// === COBROS — v5.11 === Cuentas por cobrar con fechas de vencimiento por términos
const Cobros = ({ clients, orders, setOrders, saveAll }) => {
  const [zf, setZf] = useState("");
  const [payModal, setPayModal] = useState(null); // { orderId, method, ref }
  const [copied, setCopied] = useState(null);

  // Todas las órdenes entregadas pero no pagadas
  const unpaid = orders.filter(o => o.status === "delivered").map(o => {
    const c = clients.find(x => x.id === o.clientId);
    if (!c) return null;
    const due = orderDueDate(o, c);
    const daysLeft = daysUntilDue(o, c);
    return { o, c, due, daysLeft };
  }).filter(Boolean);

  const fil = zf ? unpaid.filter(r => r.c.zone === zf) : unpaid;
  const sorted = fil.sort((a, b) => a.daysLeft - b.daysLeft);

  const atrasadas = sorted.filter(r => r.daysLeft < 0);
  const hoy = sorted.filter(r => r.daysLeft === 0);
  const proximas = sorted.filter(r => r.daysLeft > 0 && r.daysLeft <= 7);
  const futuras = sorted.filter(r => r.daysLeft > 7);

  const totalAtrasado = atrasadas.reduce((s, r) => s + (r.o.total || 0), 0);
  const totalHoy = hoy.reduce((s, r) => s + (r.o.total || 0), 0);
  const totalProximas = proximas.reduce((s, r) => s + (r.o.total || 0), 0);
  const totalFuturas = futuras.reduce((s, r) => s + (r.o.total || 0), 0);
  const totalGeneral = totalAtrasado + totalHoy + totalProximas + totalFuturas;

  // Agrupar atrasadas + hoy + próximas por zona para planear ruta
  const porZona = {};
  [...atrasadas, ...hoy, ...proximas].forEach(r => {
    const z = r.c.zone || "Sin zona";
    if (!porZona[z]) porZona[z] = [];
    porZona[z].push(r);
  });

  const marcarPagado = (orderId, method, ref) => {
    setOrders(prev => {
      const n = prev.map(o => {
        if (o.id !== orderId) return o;
        return { ...o, status: "paid", paidDate: new Date().toISOString().slice(0, 10), paymentMethod: method, paymentRef: ref || "" };
      });
      saveAll("orders", n);
      return n;
    });
    setPayModal(null);
  };

  const copyCobroMsg = async (r) => {
    const msg = `Hola ${r.c.contact || r.c.name},\n\nRecordatorio amistoso: tienes un saldo pendiente de *${fmt(r.o.total)}* de tu pedido del ${fmtD(r.o.date)}.\n\n${r.daysLeft < 0 ? `Venció hace ${Math.abs(r.daysLeft)} día${Math.abs(r.daysLeft) !== 1 ? "s" : ""}.` : r.daysLeft === 0 ? "Vence hoy." : `Vence en ${r.daysLeft} día${r.daysLeft !== 1 ? "s" : ""}.`}\n\nFormas de pago:\n• Cheque a nombre de Dulce Sabor LLC\n• Zelle: megapg.norcal@gmail.com\n• Venmo: @MegaPG-NorCal\n• Efectivo\n\n¿Paso a recoger el cheque? Avísame qué día te queda bien.\n\nGracias,\nJosé — (707) 360-7420`;
    try { await navigator.clipboard.writeText(msg); setCopied(r.o.id); setTimeout(() => setCopied(null), 2000); } catch {}
  };

  const row = (r) => {
    const urgent = r.daysLeft < 0;
    const today = r.daysLeft === 0;
    const color = urgent ? "#C41E3A" : today ? "#D35400" : r.daysLeft <= 7 ? "#F39C12" : "#1A5276";
    return <div key={r.o.id} style={{ background: "#fff", border: "1px solid #eee", borderLeft: `4px solid ${color}`, borderRadius: 8, padding: "10px 14px", marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{r.c.name} <Badge text={r.c.paymentTerms || "Contado"} color={TERM_CLR[r.c.paymentTerms] || "#888"} /></div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>
            {r.c.contact || "—"} • {r.c.phone || "sin tel"} • {r.c.zone || "—"}
          </div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>
            Pedido #{r.o.id.slice(-6).toUpperCase()} del {fmtD(r.o.date)}
            {r.o.deliveredDate && ` • Entregado ${fmtD(r.o.deliveredDate)}`}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#1B7340" }}>{fmt(r.o.total)}</div>
          <Badge text={urgent ? `${Math.abs(r.daysLeft)}d atrasado` : today ? "Vence HOY" : `Vence en ${r.daysLeft}d`} color={color} />
          <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>Vence: {fmtD(r.due)}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <Btn small primary onClick={() => setPayModal({ orderId: r.o.id, clientName: r.c.name, total: r.o.total, method: "Cheque", ref: "" })}>Registrar pago</Btn>
        <Btn small onClick={() => copyCobroMsg(r)}>{copied === r.o.id ? "✓ Copiado" : "Copiar recordatorio"}</Btn>
        {r.c.phone && <WaBtn phone={r.c.phone} msg={`Hola ${r.c.contact || r.c.name}, recordatorio del pedido del ${fmtD(r.o.date)} por ${fmt(r.o.total)}. ¿Paso por el cheque esta semana? — José, Dulce Sabor`} label="WA" small />}
      </div>
    </div>;
  };

  return <div>
    <div style={{ background: "#FDF2E9", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #D35400" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#D35400", marginBottom: 4 }}>Cuentas por cobrar</div>
      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>Órdenes entregadas sin pago, ordenadas por fecha de vencimiento según los términos de cada cliente. Usa el filtro de zona para planear tu ruta de cobros semanal.</div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
      <Card title="Atrasado" value={fmt(totalAtrasado)} sub={`${atrasadas.length} orden${atrasadas.length !== 1 ? "es" : ""}`} color="#C41E3A" />
      <Card title="Vence hoy" value={fmt(totalHoy)} sub={`${hoy.length} orden${hoy.length !== 1 ? "es" : ""}`} color="#D35400" />
      <Card title="Próximos 7 días" value={fmt(totalProximas)} sub={`${proximas.length} orden${proximas.length !== 1 ? "es" : ""}`} color="#F39C12" />
      <Card title="Futuras" value={fmt(totalFuturas)} sub={`${futuras.length} orden${futuras.length !== 1 ? "es" : ""}`} color="#1A5276" />
      <Card title="TOTAL" value={fmt(totalGeneral)} sub={`${sorted.length} orden${sorted.length !== 1 ? "es" : ""}`} color="#1B7340" />
    </div>

    <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Filtrar por zona:</label>
      <select value={zf} onChange={e => setZf(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12 }}>
        <option value="">Todas las zonas</option>
        {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
      </select>
    </div>

    {sorted.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 13, background: "#f8f8f8", borderRadius: 8 }}>No hay cobros pendientes. 🎉</div>}

    {atrasadas.length > 0 && <><ST>🔴 Atrasadas ({atrasadas.length})</ST>{atrasadas.map(row)}</>}
    {hoy.length > 0 && <><ST>🟠 Vencen hoy ({hoy.length})</ST>{hoy.map(row)}</>}
    {proximas.length > 0 && <><ST>🟡 Vencen en los próximos 7 días ({proximas.length})</ST>{proximas.map(row)}</>}
    {futuras.length > 0 && <><ST>🔵 Futuras ({futuras.length})</ST>{futuras.map(row)}</>}

    {Object.keys(porZona).length > 1 && (atrasadas.length + hoy.length + proximas.length) > 0 && <>
      <ST>🗺️ Ruta sugerida de cobros por zona</ST>
      <div style={{ fontSize: 12, color: "#777", marginBottom: 8 }}>Agrupa tus visitas de cobro por zona para optimizar la ruta.</div>
      {Object.entries(porZona).sort((a, b) => b[1].length - a[1].length).map(([zone, rs]) => {
        const t = rs.reduce((s, r) => s + r.o.total, 0);
        return <div key={zone} style={{ padding: "8px 12px", background: "#F8F4FF", borderLeft: "4px solid #6C3483", borderRadius: 6, marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#6C3483" }}>{zone} — {rs.length} parada{rs.length !== 1 ? "s" : ""} • {fmt(t)}</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{rs.map(r => r.c.name).join(" • ")}</div>
        </div>;
      })}
    </>}

    {payModal && <Modal title={`Registrar pago — ${payModal.clientName}`} onClose={() => setPayModal(null)}>
      <div style={{ fontSize: 14, marginBottom: 12, padding: "10px 14px", background: "#E8F5E8", borderRadius: 6 }}>
        <div style={{ color: "#1B7340" }}>Monto: <b style={{ fontSize: 18 }}>{fmt(payModal.total)}</b></div>
      </div>
      <Inp label="Forma de pago" value={payModal.method} onChange={v => setPayModal(p => ({ ...p, method: v }))} options={["Cheque", "Efectivo", "Zelle", "Venmo", "Otro"]} />
      <Inp label={payModal.method === "Cheque" ? "Número de cheque" : "Referencia (opcional)"} value={payModal.ref} onChange={v => setPayModal(p => ({ ...p, ref: v }))} placeholder={payModal.method === "Cheque" ? "#1234" : ""} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <Btn onClick={() => setPayModal(null)}>Cancelar</Btn>
        <Btn primary onClick={() => marcarPagado(payModal.orderId, payModal.method, payModal.ref)}>Confirmar pago</Btn>
      </div>
    </Modal>}
  </div>;
};

const VisitForm = ({ onSave, onClose, editVisit }) => {
  const [f, setF] = useState(editVisit || { storeName: "", address: "", phone: "", contact: "", zone: "", storeType: "", date: new Date().toISOString().slice(0, 10), brand: "", productsSeen: [], supplier: "", publicPrice: "", interest: "", painPoints: "", leftSamples: false, samplesQty: "", notes: "", competitorProducts: "", footTraffic: "" });
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleProd = (prod) => setF(p => ({ ...p, productsSeen: p.productsSeen.includes(prod) ? p.productsSeen.filter(x => x !== prod) : [...p.productsSeen, prod] }));
  const doSave = () => { if (!f.storeName) return; onSave(editVisit ? { ...editVisit, ...f } : { ...f, id: uid(), created: new Date().toISOString() }); };
  return <Modal title={editVisit ? "Edit visit" : "New field visit"} onClose={onClose} wide>
    <ST>Store info</ST>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
      <Inp label="Store name *" value={f.storeName} onChange={v => u("storeName", v)} placeholder="Dulcería Las Tapatías" />
      <Inp label="Contact" value={f.contact} onChange={v => u("contact", v)} placeholder="María González" />
      <Inp label="Address" value={f.address} onChange={v => u("address", v)} placeholder="1630 Sebastopol Rd" />
      <Inp label="Phone" value={f.phone} onChange={v => u("phone", v)} placeholder="(707) 536-9543" />
      <Inp label="Zone" value={f.zone} onChange={v => u("zone", v)} options={ZONES} />
      <Inp label="Store type" value={f.storeType} onChange={v => u("storeType", v)} options={STORE_TYPES} />
      <Inp label="Date" type="date" value={f.date} onChange={v => u("date", v)} />
      <Inp label="Foot traffic" value={f.footTraffic} onChange={v => u("footTraffic", v)} options={["High", "Medium", "Low"]} />
    </div>
    <ST>Products & competition</ST>
    <Inp label="Brand on shelf" value={f.brand} onChange={v => u("brand", v)} options={BRANDS} />
    <div style={{ marginBottom: 10 }}><label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 3 }}>Products seen</label><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{PRODUCTS_SEEN.map(p => <button key={p} onClick={() => toggleProd(p)} style={{ padding: "3px 8px", fontSize: 11, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", background: f.productsSeen.includes(p) ? "#1B7340" : "#fff", color: f.productsSeen.includes(p) ? "#fff" : "#333" }}>{p}</button>)}</div></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}><Inp label="Public price/bag" type="number" value={f.publicPrice} onChange={v => u("publicPrice", v)} placeholder="3.00" /><Inp label="Other competitor products" value={f.competitorProducts} onChange={v => u("competitorProducts", v)} placeholder="Vero, Lucas..." /></div>
    <ST>Supplier & interest</ST>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}><Inp label="Who supplies them?" value={f.supplier} onChange={v => u("supplier", v)} options={SUPPLIERS} /><Inp label="Interest level" value={f.interest} onChange={v => u("interest", v)} options={INTEREST_LVL} /></div>
    <Inp label="Pain points" value={f.painPoints} onChange={v => u("painPoints", v)} textarea placeholder="What problems do they have with current supplier?" />
    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}><label style={{ fontSize: 12, fontWeight: 600, color: "#555" }}><input type="checkbox" checked={f.leftSamples} onChange={e => u("leftSamples", e.target.checked)} /> Left samples</label>{f.leftSamples && <Inp label="Qty" type="number" value={f.samplesQty} onChange={v => u("samplesQty", v)} style={{ marginBottom: 0, width: 80 }} />}</div>
    <Inp label="Notes" value={f.notes} onChange={v => u("notes", v)} textarea placeholder="Key observations, follow-up actions..." />
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><Btn onClick={onClose}>Cancel</Btn><Btn primary onClick={doSave}>{editVisit ? "Update" : "Save visit"}</Btn></div>
  </Modal>;
};

const VisitsList = ({ visits, onEdit, onDelete }) => {
  const [search, setSearch] = useState(""); const [zf, setZf] = useState("");
  const delRef = useRef(null); const [delId, setDelId] = useState(null);
  const del = (id) => { if (delRef.current === id) { onDelete(id); delRef.current = null; setDelId(null); } else { delRef.current = id; setDelId(id); setTimeout(() => { if (delRef.current === id) { delRef.current = null; setDelId(null); } }, 3000); } };
  const fil = visits.filter(v => (!search || v.storeName.toLowerCase().includes(search.toLowerCase()) || v.notes?.toLowerCase().includes(search.toLowerCase())) && (!zf || v.zone === zf)).sort((a, b) => new Date(b.date) - new Date(a.date));
  return <div>
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stores..." style={{ padding: "7px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, flex: 1, maxWidth: 250 }} /><select value={zf} onChange={e => setZf(e.target.value)} style={{ padding: "7px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12 }}><option value="">All zones</option>{ZONES.map(z => <option key={z} value={z}>{z}</option>)}</select></div>
    {fil.length === 0 && <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 30 }}>No visits found.</p>}
    {fil.map(v => <div key={v.id} style={{ padding: "10px 14px", background: "#fff", border: "1px solid #eee", borderRadius: 8, marginBottom: 5, borderLeft: `4px solid ${BRAND_CLR[v.brand] || "#888"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div><b style={{ fontSize: 14 }}>{v.storeName}</b> {v.zone && <Badge text={v.zone} color="#6C3483" />} {v.brand && <Badge text={v.brand} color={BRAND_CLR[v.brand] || "#888"} />} {v.interest && <Badge text={v.interest} color={v.interest.includes("Very") ? "#1B7340" : v.interest.includes("Somewhat") ? "#D35400" : v.interest === "Already a client" ? "#1A5276" : "#888"} />}</div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}><Btn small onClick={() => onEdit(v)}>Edit</Btn><Btn small danger onClick={() => del(v.id)} style={delId === v.id ? { background: "#8B0000" } : {}}>{delId === v.id ? "Sure?" : "✕"}</Btn></div>
      </div>
      <div style={{ fontSize: 12, color: "#777" }}>{fmtD(v.date)} {v.storeType && `• ${v.storeType}`} {v.contact && `• ${v.contact}`} {v.publicPrice > 0 && `• ${fmt(v.publicPrice)}/bag`}</div>
      {v.notes && <div style={{ fontSize: 12, color: "#555", marginTop: 4, lineHeight: 1.4 }}>{v.notes.length > 150 ? v.notes.slice(0, 150) + "..." : v.notes}</div>}
      {v.productsSeen?.length > 0 && <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>{v.productsSeen.map(p => <span key={p} style={{ fontSize: 10, padding: "1px 6px", background: "#f0f0f0", borderRadius: 3, color: "#666" }}>{p}</span>)}</div>}
    </div>)}
  </div>;
};

const Reorders = ({ clients, orders, reminders, setReminders, saveAll }) => {
  const [edits, setEdits] = useState({});
  const [copied, setCopied] = useState(null);

  const rows = clients.map(c => {
    const co = orders.filter(o => o.clientId === c.id).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (co.length === 0) return null;
    const lastO = co[0];
    const daysSince = dSince(lastO.date);
    const cycle = calcClientCycle(co);
    const overdue = daysSince - cycle; // positive = vencido, negative = próximo
    const lastReminder = reminders[c.id]?.lastSent;
    const dsReminder = lastReminder ? dSince(lastReminder) : 999;
    const inCooldown = dsReminder < REMINDER_COOLDOWN_DAYS;
    const prodCount = {};
    co.forEach(o => o.items.forEach(it => { prodCount[it.productId] = (prodCount[it.productId] || 0) + it.qty; }));
    const topProds = Object.entries(prodCount).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([pid]) => pF(pid)?.name).filter(Boolean);
    return { c, lastO, daysSince, cycle, overdue, inCooldown, dsReminder, topProds, orderCount: co.length };
  }).filter(Boolean);

  // Vencidos: ya pasó el ciclo. Próximos: faltan 1..ANTICIPATION_DAYS para el ciclo.
  const vencidos = rows.filter(r => r.overdue >= 0 && !r.inCooldown).sort((a, b) => b.overdue - a.overdue);
  const proximos = rows.filter(r => r.overdue < 0 && r.overdue >= -ANTICIPATION_DAYS && !r.inCooldown).sort((a, b) => b.overdue - a.overdue);
  const cooldown = rows.filter(r => r.inCooldown && (r.overdue >= -ANTICIPATION_DAYS));

  // Mensaje tono RECUPERACIÓN (vencidos)
  const msgVencido = (r) => {
    const prodText = r.topProds.length > 0 ? r.topProds.join(" y ") : "Slaps Lollipops";
    return `Hola ${r.c.contact || r.c.name},\n\nSoy José de Dulce Sabor. Noté que han pasado ${r.daysSince} días desde tu último pedido (${fmtD(r.lastO.date)} por ${fmt(r.lastO.total)}) y quería saber cómo estás.\n\n¿Todo bien con el inventario? Tenemos stock fresco de ${prodText} listo para entrega en tu zona.\n\nSi quieres te armo un pedido y lo entrego esta semana. También puedes ordenar directo en https://dulcesaborca.com\n\nGracias,\nJosé — (707) 360-7420`;
  };

  // Mensaje tono PROACTIVO (próximos)
  const msgProximo = (r) => {
    const prodText = r.topProds.length > 0 ? r.topProds.join(" y ") : "Slaps Lollipops";
    return `Hola ${r.c.contact || r.c.name},\n\nSoy José de Dulce Sabor. Pasando a saludar y ver cómo vas de inventario de ${prodText} — por lo general reordenas cada ${r.cycle} días más o menos.\n\nTenemos stock fresco listo. Si quieres te armo el pedido ahora y lo entrego esta semana para que no te quedes corto. También puedes ordenar directo en https://dulcesaborca.com\n\nAvísame,\nJosé — (707) 360-7420`;
  };

  const defaultMsg = (r) => r.overdue >= 0 ? msgVencido(r) : msgProximo(r);
  const getMsg = (r) => edits[r.c.id] ?? defaultMsg(r);

  const copyMsg = async (r) => {
    try {
      await navigator.clipboard.writeText(getMsg(r));
      setCopied(r.c.id);
      setTimeout(() => setCopied(null), 2000);
    } catch(e) { alert("Copy falló — selecciona el texto manualmente"); }
  };

  const markSent = (r) => {
    const updated = { ...reminders, [r.c.id]: { lastSent: new Date().toISOString(), daysOverdue: r.overdue } };
    setReminders(updated); saveAll("reminders", updated);
  };

  const resetCooldown = (clientId) => {
    const updated = { ...reminders };
    delete updated[clientId];
    setReminders(updated); saveAll("reminders", updated);
  };

  const urgColor = (overdue) => overdue >= URGENT_OVERDUE_DAYS ? "#C41E3A" : "#D35400";

  // Render as function (not component) to avoid remount on every keystroke that would kill textarea focus
  const renderRow = (r, kind) => {
    const msg = getMsg(r);
    const borderColor = kind === "vencido" ? urgColor(r.overdue) : "#F39C12";
    const badgeText = kind === "vencido" ? `${r.overdue}d vencido` : `en ${Math.abs(r.overdue)}d`;
    const badgeColor = kind === "vencido" ? urgColor(r.overdue) : "#F39C12";
    return <div key={r.c.id} style={{ background: "#fff", border: "1px solid #eee", borderLeft: `4px solid ${borderColor}`, borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{r.c.name} <Badge text={r.c.tier} color={TIER_CLR[r.c.tier]} /></div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>{r.c.contact || "—"} • {r.c.phone || "sin teléfono"} • {r.c.zone || "—"}</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>Último pedido: <b>{fmtD(r.lastO.date)}</b> ({fmt(r.lastO.total)}) • Ciclo: <b>{r.cycle}d</b> • {r.orderCount} pedido{r.orderCount !== 1 ? "s" : ""} total</div>
        </div>
        <Badge text={badgeText} color={badgeColor} />
      </div>
      <textarea value={msg} onChange={e => setEdits(p => ({ ...p, [r.c.id]: e.target.value }))} rows={6} style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <Btn small primary onClick={() => copyMsg(r)}>{copied === r.c.id ? "✓ Copiado" : "Copiar mensaje"}</Btn>
        {r.c.phone && <WaBtn phone={r.c.phone} msg={msg} label="Abrir WhatsApp" small />}
        <Btn small onClick={() => markSent(r)} style={{ background: "#1B7340", color: "#fff" }}>Marcar enviado</Btn>
        {edits[r.c.id] !== undefined && <Btn small onClick={() => setEdits(p => { const n = { ...p }; delete n[r.c.id]; return n; })}>Reset texto</Btn>}
      </div>
    </div>;
  };

  const urgentCount = vencidos.filter(r => r.overdue >= URGENT_OVERDUE_DAYS).length;

  return <div>
    <div style={{ background: "#EBF5FB", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #1A5276" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1A5276", marginBottom: 4 }}>Recordatorios de reorden</div>
      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>Vencidos: clientes que ya pasaron su ciclo de reorden. Próximos: clientes que llegarán a su ciclo en los próximos {ANTICIPATION_DAYS} días (contáctalos antes de que se queden sin producto). Cooldown de {REMINDER_COOLDOWN_DAYS} días tras "Marcar enviado". Clientes con 1 solo pedido usan ciclo default de {DEFAULT_REORDER_CYCLE} días.</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
      <Card title="Vencidos" value={vencidos.length} color="#C41E3A" />
      <Card title={`Próximos (${ANTICIPATION_DAYS}d)`} value={proximos.length} color="#F39C12" />
      <Card title={`Urgentes (${URGENT_OVERDUE_DAYS}+ días)`} value={urgentCount} color="#8B0000" />
      <Card title="En cooldown" value={cooldown.length} color="#888" />
    </div>
    {vencidos.length === 0 && proximos.length === 0 && cooldown.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: "#999", fontSize: 13, background: "#f8f8f8", borderRadius: 8 }}>No hay recordatorios pendientes. 🎉</div>}
    {vencidos.length > 0 && <>
      <ST>🔴 Vencidos ({vencidos.length}) — tono recuperación</ST>
      {vencidos.map(r => renderRow(r, "vencido"))}
    </>}
    {proximos.length > 0 && <>
      <ST>🟡 Próximos a reordenar ({proximos.length}) — tono proactivo</ST>
      {proximos.map(r => renderRow(r, "proximo"))}
    </>}
    {cooldown.length > 0 && <>
      <ST>⏸ En cooldown ({cooldown.length})</ST>
      {cooldown.map(r => <div key={r.c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", background: "#f8f8f8", borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
        <div><b>{r.c.name}</b> <span style={{ color: "#999" }}>— enviado hace {r.dsReminder}d, reaparece en {REMINDER_COOLDOWN_DAYS - r.dsReminder}d</span></div>
        <Btn small onClick={() => resetCooldown(r.c.id)} style={{ fontSize: 10 }}>Reset</Btn>
      </div>)}
    </>}
  </div>;
};

// Phone normalization (keep digits only, prefix '1' for US 10-digit)
const PostDelivery = ({ clients, orders, followups, setFollowups, saveAll }) => {
  const [edits, setEdits] = useState({});
  const [copied, setCopied] = useState(null);

  // Build rows from delivered/paid orders within the follow-up window, excluding already-followed-up
  const rows = orders
    .filter(o => (o.status === "delivered" || o.status === "paid") && !followups[o.id])
    .map(o => {
      const daysSince = dSince(o.date);
      if (daysSince < POSTDEL_MIN_DAYS || daysSince > POSTDEL_MAX_DAYS) return null;
      const client = clients.find(c => c.id === o.clientId);
      if (!client) return null;
      // Find top product in this specific order (by qty)
      const topItem = [...(o.items || [])].sort((a, b) => b.qty - a.qty)[0];
      const topProd = topItem ? pF(topItem.productId)?.name : null;
      const totalCases = (o.items || []).reduce((s, it) => s + Number(it.qty || 0), 0);
      return { order: o, client, daysSince, topProd, totalCases };
    })
    .filter(Boolean)
    .sort((a, b) => b.daysSince - a.daysSince); // Most urgent (oldest delivery) first

  const ready = rows.filter(r => r.daysSince < POSTDEL_URGENT_DAYS);
  const urgent = rows.filter(r => r.daysSince >= POSTDEL_URGENT_DAYS);

  const defaultMsg = (r) => {
    const prodText = r.topProd || "tu pedido";
    return `Hola ${r.client.contact || r.client.name},\n\nSoy José de Dulce Sabor. Pasé a saludar y ver cómo te va con el pedido del ${fmtD(r.order.date)} — ${prodText}.\n\n¿Cómo está saliendo? ¿La gente lo está aceptando bien? Me interesa saber qué tal va para poder ayudarte mejor.\n\nSi necesitas reorden, quieres probar algún producto nuevo, o tienes cualquier duda, avísame. También puedes ordenar en línea: https://dulcesaborca.com\n\nGracias por la confianza,\nJosé — (707) 360-7420`;
  };

  const getMsg = (r) => edits[r.order.id] ?? defaultMsg(r);

  const copyMsg = async (r) => {
    try {
      await navigator.clipboard.writeText(getMsg(r));
      setCopied(r.order.id);
      setTimeout(() => setCopied(null), 2000);
    } catch(e) { alert("Copy falló — selecciona el texto manualmente"); }
  };

  const markSent = (r) => {
    const updated = { ...followups, [r.order.id]: { sentAt: new Date().toISOString(), clientId: r.client.id } };
    setFollowups(updated);
    saveAll("followups", updated);
  };

  const renderRow = (r) => {
    const msg = getMsg(r);
    const isUrgent = r.daysSince >= POSTDEL_URGENT_DAYS;
    const borderColor = isUrgent ? "#C41E3A" : "#1A5276";
    const badgeText = `Entregado hace ${r.daysSince}d`;
    const badgeColor = isUrgent ? "#C41E3A" : "#1A5276";
    return <div key={r.order.id} style={{ background: "#fff", border: "1px solid #eee", borderLeft: `4px solid ${borderColor}`, borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{r.client.name} <Badge text={r.client.tier} color={TIER_CLR[r.client.tier]} /></div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>{r.client.contact || "—"} • {r.client.phone || "sin teléfono"} • {r.client.zone || "—"}</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>Pedido #{r.order.id.slice(-6).toUpperCase()} • <b>{fmtD(r.order.date)}</b> • {fmt(r.order.total)} • {r.totalCases} caja{r.totalCases !== 1 ? "s" : ""} • Estado: <b>{r.order.status}</b></div>
        </div>
        <Badge text={badgeText} color={badgeColor} />
      </div>
      <textarea value={msg} onChange={e => setEdits(p => ({ ...p, [r.order.id]: e.target.value }))} rows={7} style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <Btn small primary onClick={() => copyMsg(r)}>{copied === r.order.id ? "✓ Copiado" : "Copiar mensaje"}</Btn>
        {r.client.phone && <WaBtn phone={r.client.phone} msg={msg} label="Abrir WhatsApp" small />}
        <Btn small onClick={() => markSent(r)} style={{ background: "#1B7340", color: "#fff" }}>Marcar enviado</Btn>
        {edits[r.order.id] !== undefined && <Btn small onClick={() => setEdits(p => { const n = { ...p }; delete n[r.order.id]; return n; })}>Reset texto</Btn>}
      </div>
    </div>;
  };

  return <div>
    <div style={{ background: "#EBF5FB", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #1A5276" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1A5276", marginBottom: 4 }}>Seguimiento post-entrega</div>
      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>Pedidos entregados hace entre {POSTDEL_MIN_DAYS} y {POSTDEL_MAX_DAYS} días que aún no tienen seguimiento. El objetivo es saber cómo va la venta del producto en la tienda. Una vez marcado como enviado, el pedido no vuelve a aparecer aquí. Después de {POSTDEL_MAX_DAYS} días, el módulo de recordatorios de reorden toma el relevo.</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
      <Card title="Listos para seguir" value={ready.length} color="#1A5276" />
      <Card title={`Última oportunidad (${POSTDEL_URGENT_DAYS}+d)`} value={urgent.length} color="#C41E3A" />
      <Card title="Total pendientes" value={rows.length} color="#6C3483" />
    </div>
    {rows.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: "#999", fontSize: 13, background: "#f8f8f8", borderRadius: 8 }}>No hay pedidos pendientes de seguimiento. 🎉</div>}
    {urgent.length > 0 && <>
      <ST>🔴 Última oportunidad ({urgent.length})</ST>
      {urgent.map(r => renderRow(r))}
    </>}
    {ready.length > 0 && <>
      <ST>🔵 Listos para seguimiento ({ready.length})</ST>
      {ready.map(r => renderRow(r))}
    </>}
  </div>;
};

const Welcomes = ({ clients, orders, welcomes, setWelcomes, saveAll }) => {
  const [edits, setEdits] = useState({});
  const [copied, setCopied] = useState(null);

  // Find clients whose first (and only so far, OR whose earliest) order was recent and who haven't been welcomed
  const rows = clients
    .filter(c => !welcomes[c.id])
    .map(c => {
      const co = orders.filter(o => o.clientId === c.id);
      if (co.length === 0) return null; // No orders yet → no welcome (they haven't "committed")
      // Sort ascending to find earliest order
      const sorted = [...co].sort((a, b) => new Date(a.date) - new Date(b.date));
      const firstO = sorted[0];
      const daysSinceFirst = dSince(firstO.date);
      if (daysSinceFirst > WELCOME_MAX_DAYS) return null; // Too late, the moment passed
      // Find top product in that first order
      const topItem = [...(firstO.items || [])].sort((a, b) => b.qty - a.qty)[0];
      const topProd = topItem ? pF(topItem.productId)?.name : null;
      return { client: c, firstO, daysSinceFirst, topProd };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysSinceFirst - b.daysSinceFirst); // Freshest first (most recently acquired clients on top)

  const defaultMsg = (r) => {
    const name = r.client.contact || r.client.name;
    return `¡Hola ${name}!\n\nSoy José de Dulce Sabor y te quiero dar la bienvenida como nuevo cliente. ¡Gracias por tu confianza!\n\nAquí va toda la información que necesitas:\n\n📦 Productos: Dulces mexicanos auténticos con entrega directa en tu zona\n💰 Formas de pago: Efectivo, Zelle (megapg.norcal@gmail.com), Venmo (@MegaPG-NorCal) o cheque a nombre de Dulce Sabor LLC\n🌐 Ordena en línea cuando necesites: https://dulcesaborca.com\n📞 Cualquier duda o pedido: (707) 360-7420\n\nEstoy a tus órdenes. Mi meta es que tus ventas crezcan — si hay algo que puedo hacer mejor, avísame con confianza.\n\n¡Gracias y bienvenid@ a la familia Dulce Sabor!\nJosé Flores`;
  };

  const getMsg = (r) => edits[r.client.id] ?? defaultMsg(r);

  const copyMsg = async (r) => {
    try {
      await navigator.clipboard.writeText(getMsg(r));
      setCopied(r.client.id);
      setTimeout(() => setCopied(null), 2000);
    } catch(e) { alert("Copy falló — selecciona el texto manualmente"); }
  };

  const markSent = (r) => {
    const updated = { ...welcomes, [r.client.id]: { sentAt: new Date().toISOString() } };
    setWelcomes(updated);
    saveAll("welcomes", updated);
  };

  const renderRow = (r) => {
    const msg = getMsg(r);
    return <div key={r.client.id} style={{ background: "#fff", border: "1px solid #eee", borderLeft: "4px solid #1B7340", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{r.client.name} <Badge text={r.client.tier} color={TIER_CLR[r.client.tier]} /> <Badge text="NUEVO" color="#1B7340" /></div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>{r.client.contact || "—"} • {r.client.phone || "sin teléfono"} • {r.client.zone || "—"}</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>Primer pedido: <b>{fmtD(r.firstO.date)}</b> ({fmt(r.firstO.total)}){r.topProd ? ` • ${r.topProd}` : ""}</div>
        </div>
        <Badge text={r.daysSinceFirst === 0 ? "Hoy" : `Hace ${r.daysSinceFirst}d`} color="#1B7340" />
      </div>
      <textarea value={msg} onChange={e => setEdits(p => ({ ...p, [r.client.id]: e.target.value }))} rows={10} style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <Btn small primary onClick={() => copyMsg(r)}>{copied === r.client.id ? "✓ Copiado" : "Copiar mensaje"}</Btn>
        {r.client.phone && <WaBtn phone={r.client.phone} msg={msg} label="Abrir WhatsApp" small />}
        <Btn small onClick={() => markSent(r)} style={{ background: "#1B7340", color: "#fff" }}>Marcar enviado</Btn>
        {edits[r.client.id] !== undefined && <Btn small onClick={() => setEdits(p => { const n = { ...p }; delete n[r.client.id]; return n; })}>Reset texto</Btn>}
      </div>
    </div>;
  };

  return <div>
    <div style={{ background: "#E8F5E8", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #1B7340" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1B7340", marginBottom: 4 }}>Bienvenida a nuevos clientes</div>
      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>Clientes que hicieron su primer pedido en los últimos {WELCOME_MAX_DAYS} días y aún no han recibido mensaje de bienvenida. Un cliente solo aparece aquí una vez — después de "Marcar enviado", sale para siempre.</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
      <Card title="Nuevos clientes" value={rows.length} color="#1B7340" />
      <Card title="Ya bienvenidos" value={Object.keys(welcomes).length} color="#888" />
    </div>
    {rows.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: "#999", fontSize: 13, background: "#f8f8f8", borderRadius: 8 }}>No hay clientes nuevos pendientes de bienvenida. 🎉</div>}
    {rows.map(r => renderRow(r))}
  </div>;
};

const Announcements = ({ clients, templates, setTemplates, campaign, setCampaign, saveAll }) => {
  const [step, setStep] = useState(campaign.message ? "send" : "compose");
  const [showSave, setShowSave] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [copied, setCopied] = useState(null);
  const [delTemplateConf, setDelTemplateConf] = useState(null);
  const delTemplateRef = useRef(null);
  const [resetCampConf, setResetCampConf] = useState(false);
  const resetCampRef = useRef(false);

  const tiers = campaign.tiers || ["Lista", "Bronce", "Plata", "Oro"];
  const message = campaign.message || "";
  const sentIds = campaign.sentIds || [];
  const withPhoneOnly = campaign.withPhoneOnly !== false;

  const updateCampaign = (patch) => {
    const updated = { ...campaign, ...patch };
    setCampaign(updated);
    saveAll("campaign", updated);
  };

  const toggleTier = (tier) => {
    const next = tiers.includes(tier) ? tiers.filter(t => t !== tier) : [...tiers, tier];
    updateCampaign({ tiers: next });
  };

  // Filter recipients by tier and phone requirement
  const recipients = clients.filter(c =>
    tiers.includes(c.tier) && (!withPhoneOnly || c.phone)
  );

  const personalize = (msg, client) => {
    if (!msg) return "";
    return msg
      .replace(/\{nombre\}/g, client.contact || client.name || "")
      .replace(/\{negocio\}/g, client.name || "");
  };

  const loadTemplate = (templateId) => {
    if (!templateId) { updateCampaign({ message: "" }); return; }
    const t = templates.find(tt => tt.id === templateId);
    if (t) updateCampaign({ message: t.body });
  };

  const saveTemplate = () => {
    if (!newTemplateName.trim() || !message.trim()) return;
    const newT = { id: uid(), name: newTemplateName.trim(), body: message, createdAt: new Date().toISOString() };
    const updated = [...templates, newT];
    setTemplates(updated);
    saveAll("templates", updated);
    setShowSave(false);
    setNewTemplateName("");
  };

  const deleteTemplate = (templateId) => {
    if (delTemplateRef.current === templateId) {
      const updated = templates.filter(t => t.id !== templateId);
      setTemplates(updated);
      saveAll("templates", updated);
      delTemplateRef.current = null;
      setDelTemplateConf(null);
    } else {
      delTemplateRef.current = templateId;
      setDelTemplateConf(templateId);
      setTimeout(() => { if (delTemplateRef.current === templateId) { delTemplateRef.current = null; setDelTemplateConf(null); } }, 3000);
    }
  };

  const prepareSend = () => {
    if (!message.trim() || recipients.length === 0) return;
    setStep("send");
  };

  const backToCompose = () => setStep("compose");

  const resetCampaign = () => {
    if (resetCampRef.current) {
      const cleared = { tiers: ["Lista", "Bronce", "Plata", "Oro"], message: "", sentIds: [], withPhoneOnly: true };
      setCampaign(cleared);
      saveAll("campaign", cleared);
      setStep("compose");
      resetCampRef.current = false;
      setResetCampConf(false);
    } else {
      resetCampRef.current = true;
      setResetCampConf(true);
      setTimeout(() => { if (resetCampRef.current) { resetCampRef.current = false; setResetCampConf(false); } }, 3000);
    }
  };

  const copyMsg = async (client) => {
    try {
      await navigator.clipboard.writeText(personalize(message, client));
      setCopied(client.id);
      setTimeout(() => setCopied(null), 2000);
    } catch(e) { alert("Copy falló"); }
  };

  const toggleSent = (clientId) => {
    const next = sentIds.includes(clientId) ? sentIds.filter(id => id !== clientId) : [...sentIds, clientId];
    updateCampaign({ sentIds: next });
  };

  // COMPOSE STEP
  if (step === "compose") {
    return <div>
      <div style={{ background: "#F4ECF7", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #6C3483" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#6C3483", marginBottom: 4 }}>Anuncios masivos</div>
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>Manda un mensaje a varios clientes a la vez. Selecciona los tiers, escribe (o carga) un mensaje, y en el siguiente paso copias y pegas uno por uno. Usa <code style={{ background: "#fff", padding: "1px 4px", borderRadius: 3 }}>{"{nombre}"}</code> para el contacto y <code style={{ background: "#fff", padding: "1px 4px", borderRadius: 3 }}>{"{negocio}"}</code> para el nombre del negocio.</div>
      </div>
      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: "16px 18px", marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>1. Elige tiers</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {TIERS.map(t => {
            const active = tiers.includes(t);
            return <button key={t} onClick={() => toggleTier(t)} style={{ padding: "6px 14px", border: `1px solid ${active ? TIER_CLR[t] : "#ddd"}`, borderRadius: 20, background: active ? TIER_CLR[t] : "#fff", color: active ? "#fff" : "#666", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{active ? "✓ " : ""}{t}</button>;
          })}
        </div>
        <label style={{ fontSize: 12, color: "#555", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={withPhoneOnly} onChange={e => updateCampaign({ withPhoneOnly: e.target.checked })} />
          Solo clientes con teléfono
        </label>
      </div>
      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: "16px 18px", marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>2. Mensaje</label>
        {templates.length > 0 && <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#777", marginBottom: 4 }}>Cargar plantilla guardada:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {templates.map(t => <div key={t.id} style={{ display: "inline-flex", alignItems: "center", background: "#f0f0f0", borderRadius: 20, padding: "3px 4px 3px 12px", gap: 4 }}>
              <button onClick={() => loadTemplate(t.id)} style={{ background: "none", border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#333" }}>{t.name}</button>
              <button onClick={() => deleteTemplate(t.id)} style={{ background: delTemplateConf === t.id ? "#C41E3A" : "#ddd", color: delTemplateConf === t.id ? "#fff" : "#666", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{delTemplateConf === t.id ? "?" : "✕"}</button>
            </div>)}
          </div>
        </div>}
        <textarea value={message} onChange={e => updateCampaign({ message: e.target.value })} rows={8} placeholder="Hola {nombre}, te queremos contar que..." style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
        {!showSave ? <Btn small onClick={() => setShowSave(true)} disabled={!message.trim()} style={{ marginTop: 8 }}>💾 Guardar como plantilla</Btn>
          : <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
            <input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} placeholder="Nombre de la plantilla" style={{ flex: 1, padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12 }} autoFocus />
            <Btn small primary onClick={saveTemplate} disabled={!newTemplateName.trim()}>Guardar</Btn>
            <Btn small onClick={() => { setShowSave(false); setNewTemplateName(""); }}>Cancelar</Btn>
          </div>}
      </div>
      <div style={{ background: "#E8F5E8", border: "1px solid #1B7340", borderRadius: 8, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "#1B7340", fontWeight: 600 }}>📨 Se enviará a</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#1B7340" }}>{recipients.length} cliente{recipients.length !== 1 ? "s" : ""}</div>
        </div>
        <Btn primary onClick={prepareSend} disabled={!message.trim() || recipients.length === 0}>Preparar envíos →</Btn>
      </div>
    </div>;
  }

  // SEND STEP
  const sentCount = sentIds.length;
  const pct = recipients.length > 0 ? Math.round(sentCount / recipients.length * 100) : 0;
  return <div>
    <div style={{ background: "#F4ECF7", borderRadius: 8, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #6C3483" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#6C3483", marginBottom: 4 }}>Enviando anuncio a {recipients.length} cliente{recipients.length !== 1 ? "s" : ""}</div>
          <div style={{ fontSize: 12, color: "#555" }}>Copia el mensaje de cada cliente, pégalo en WhatsApp, y marca como enviado. Tu progreso se guarda aunque cierres la ventana.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn small onClick={backToCompose}>← Volver a editar</Btn>
          <Btn small danger onClick={resetCampaign} style={resetCampConf ? { background: "#8B0000" } : {}}>{resetCampConf ? "Sure?" : "Nueva campaña"}</Btn>
        </div>
      </div>
    </div>
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 6 }}>
        <b>Progreso</b>
        <span>{sentCount} de {recipients.length} enviados ({pct}%)</span>
      </div>
      <div style={{ height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#1B7340", transition: "width 0.3s" }} />
      </div>
    </div>
    {recipients.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: "#999", fontSize: 13, background: "#f8f8f8", borderRadius: 8 }}>Ningún cliente coincide con los filtros. Regresa y ajusta los tiers.</div>}
    {recipients.map(c => {
      const personalized = personalize(message, c);
      const isSent = sentIds.includes(c.id);
      return <div key={c.id} style={{ background: isSent ? "#F8F8F8" : "#fff", border: "1px solid #eee", borderLeft: `4px solid ${isSent ? "#1B7340" : "#6C3483"}`, borderRadius: 8, padding: "12px 14px", marginBottom: 10, opacity: isSent ? 0.65 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>
              {c.name} <Badge text={c.tier} color={TIER_CLR[c.tier]} />
              {isSent && <Badge text="✓ Enviado" color="#1B7340" />}
            </div>
            <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>{c.contact || "—"} • {c.phone || "sin teléfono"} • {c.zone || "—"}</div>
          </div>
        </div>
        <div style={{ background: "#f8f8f8", padding: "8px 10px", borderRadius: 6, fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "inherit", color: "#333", marginBottom: 8 }}>{personalized}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn small primary onClick={() => copyMsg(c)}>{copied === c.id ? "✓ Copiado" : "Copiar"}</Btn>
          {c.phone && <WaBtn phone={c.phone} msg={personalized} label="WhatsApp" small />}
          <Btn small onClick={() => toggleSent(c.id)} style={{ background: isSent ? "#888" : "#1B7340", color: "#fff" }}>{isSent ? "Desmarcar" : "Marcar enviado"}</Btn>
        </div>
      </div>;
    })}
  </div>;
};

const normPhone = (p) => { if (!p) return ""; const d = p.replace(/\D/g, ""); return d.length === 10 ? "1" + d : d; };

const WebOrders = ({ clients, setClients, orders, setOrders, inventory, setInventory, saveAll, setTab, setRO }) => {
  const [webOrders, setWebOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [copied, setCopied] = useState(null);
  const [actioning, setActioning] = useState(null);

  const fetchOrders = useCallback(async () => {
    if (!cloudEnabled) { setError("Supabase no configurado. Revisa src/config.js"); return; }
    setLoading(true); setError(null);
    try {
      const url = `${SUPA_URL}/rest/v1/web_orders?status=eq.${statusFilter}&order=created_at.desc&limit=100`;
      const resp = await fetch(url, { headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}` } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setWebOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("fetchOrders failed:", e);
      setError(`Error al cargar: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const updateStatus = async (id, newStatus) => {
    if (!cloudEnabled) return false;
    try {
      const payload = { status: newStatus };
      // Timestamp approval when importing (ignored doesn't need a timestamp)
      if (newStatus === "imported") payload.approved_at = new Date().toISOString();
      const resp = await fetch(`${SUPA_URL}/rest/v1/web_orders?id=eq.${id}`, {
        method: "PATCH",
        headers: SUPA_HEADERS,
        body: JSON.stringify(payload)
      });
      return resp.ok;
    } catch (e) { console.error("updateStatus failed:", e); return false; }
  };

  const importOrder = async (wo) => {
    setActioning(wo.id);
    try {
      // 1. Find or create client
      const woPhone = normPhone(wo.phone);
      let client = clients.find(c => normPhone(c.phone) === woPhone);
      let updatedClients = clients;
      const isNewClient = !client;
      if (!client) {
        client = {
          id: uid(),
          name: wo.negocio || wo.encargado || `Cliente Web ${woPhone.slice(-4)}`,
          contact: wo.encargado || "",
          phone: wo.phone || "",
          address: wo.direccion || "",
          zone: "",
          tier: "Lista",
          notes: `Pedido web ${fmtD(wo.created_at || new Date())} • Pago: ${wo.pago || "—"}`,
          created: new Date().toISOString(),
          source: "web"
        };
        updatedClients = [...clients, client];
        setClients(updatedClients);
        saveAll("clients", updatedClients);
      }

      // 2. Map items to CRM order items, skipping any with unknown productId
      const validItems = (wo.items || []).filter(it => it.productId && pF(it.productId));
      if (validItems.length === 0) {
        alert("Este pedido no tiene productos válidos para importar al CRM.");
        setActioning(null);
        return;
      }
      const skipped = (wo.items || []).length - validItems.length;
      if (skipped > 0) {
        if (!confirm(`${skipped} producto(s) del pedido no coinciden con tu catálogo y serán omitidos. ¿Continuar?`)) {
          setActioning(null);
          return;
        }
      }

      // 3. Calculate totals with client tier discount + 1ª orden override on Slaps
      const disc = TIER_DISC[client.tier] || 0;
      // First-order discount: only for brand-new clients with no prior orders, applies to Slaps qty tiers
      const hasPriorOrders = orders.some(o => o.clientId === client.id);
      const slapsItem = validItems.find(it => it.productId === "Slaps");
      const slapsQty = slapsItem ? Number(slapsItem.qty) : 0;
      let foDisc = null;
      if (isNewClient && !hasPriorOrders && slapsQty >= 5) {
        if (slapsQty >= 20) foDisc = { tier: "20+", price: 35 };
        else if (slapsQty >= 10) foDisc = { tier: "10-19", price: 37.50 };
        else foDisc = { tier: "5-9", price: 38.75 };
      }
      const sub = validItems.reduce((s, it) => {
        const p = pF(it.productId);
        if (foDisc && it.productId === "Slaps") return s + foDisc.price * it.qty;
        return s + (p?.price || 0) * it.qty * (1 - disc);
      }, 0);
      const total = sub;

      // 4. Create order
      const newOrder = {
        id: uid(),
        clientId: client.id,
        date: new Date().toISOString().slice(0, 10),
        items: validItems.map(it => ({ productId: it.productId, qty: Number(it.qty) })),
        discount: foDisc ? 0 : disc,
        foDisc,
        total: parseFloat(total.toFixed(2)),
        status: "pending",
        notes: `Importado de pedido web ${wo.id}${wo.pago ? ` • Pago: ${wo.pago}` : ""}`,
        source: "web",
        webOrderId: wo.id
      };
      const updatedOrders = [...orders, newOrder];
      setOrders(updatedOrders);
      saveAll("orders", updatedOrders);

      // 5. Decrement inventory
      const updatedInventory = inventory.map(inv => {
        const matchingItem = validItems.find(it => it.productId === inv.productId);
        if (matchingItem) return { ...inv, stock: Math.max(0, inv.stock - Number(matchingItem.qty)) };
        return inv;
      });
      setInventory(updatedInventory);
      saveAll("inventory", updatedInventory);

      // 6. Mark web_order as imported in Supabase
      const ok = await updateStatus(wo.id, "imported");
      if (!ok) {
        alert("⚠️ El pedido se importó al CRM pero no se pudo marcar como importado en Supabase. Aparecerá otra vez al recargar. Usa 'Ignorar' manualmente.");
      }

      // 7. Remove from local list
      setWebOrders(prev => prev.filter(o => o.id !== wo.id));
    } catch (e) {
      console.error("importOrder failed:", e);
      alert(`Error al importar: ${e.message}`);
    } finally {
      setActioning(null);
    }
  };

  const ignoreOrder = async (wo) => {
    setActioning(wo.id);
    const ok = await updateStatus(wo.id, "ignored");
    if (ok) setWebOrders(prev => prev.filter(o => o.id !== wo.id));
    else alert("Error al marcar como ignorado");
    setActioning(null);
  };

  const confirmMsg = (wo) => {
    const idShort = (wo.id || "").slice(-6).toUpperCase();
    const itemLines = (wo.items || []).map(it => {
      const p = pF(it.productId);
      return `  • ${p?.name || it.webLabel || it.productId} x${it.qty}`;
    }).join("\n");
    return `¡Hola ${wo.encargado || wo.negocio || ""}!\n\n¡Recibimos tu pedido! Gracias por confiar en Dulce Sabor.\n\n*Pedido #${idShort}*\n${itemLines}\n\n*Total: ${fmt(wo.total)}*\n\nTu pedido está en proceso. Te contacto pronto para coordinar la entrega.\n\nCualquier duda: (707) 360-7420\nOrdena en línea: https://dulcesaborca.com\n\nGracias,\nJosé — Dulce Sabor`;
  };

  const copyConfirmation = async (wo) => {
    try {
      await navigator.clipboard.writeText(confirmMsg(wo));
      setCopied(wo.id);
      setTimeout(() => setCopied(null), 2000);
    } catch(e) { alert("Copy falló"); }
  };

  const pendingCount = webOrders.length;

  return <div>
    <div style={{ background: "#EBF5FB", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #1A5276" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1A5276", marginBottom: 4 }}>Pedidos Web — Inbox</div>
      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>Pedidos recibidos desde dulcesaborca.com. Usa <b>Importar al CRM</b> para crear cliente y orden automáticamente, <b>Confirmar al cliente</b> para copiar un mensaje de WhatsApp de confirmación, o <b>Ignorar</b> para descartar pruebas/duplicados.</div>
    </div>
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
      <Btn small onClick={fetchOrders} disabled={loading}>{loading ? "Cargando..." : "↻ Actualizar"}</Btn>
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "5px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12 }}>
        <option value="pending">Pendientes</option>
        <option value="imported">Importados</option>
        <option value="ignored">Ignorados</option>
      </select>
      <span style={{ fontSize: 12, color: "#777" }}>{pendingCount} pedido{pendingCount !== 1 ? "s" : ""}</span>
      {!cloudEnabled && <span style={{ fontSize: 11, color: "#C41E3A", fontWeight: 700 }}>⚠️ Supabase no configurado</span>}
    </div>
    {error && <div style={{ background: "#FDE8E8", border: "1px solid #C41E3A", borderRadius: 6, padding: "10px 14px", marginBottom: 12, color: "#C41E3A", fontSize: 12 }}>{error}</div>}
    {!loading && webOrders.length === 0 && !error && <div style={{ padding: "32px", textAlign: "center", color: "#999", fontSize: 13, background: "#f8f8f8", borderRadius: 8 }}>{statusFilter === "pending" ? "No hay pedidos web pendientes. 🎉" : `No hay pedidos con estado "${statusFilter}".`}</div>}
    {webOrders.map(wo => {
      const isProcessing = actioning === wo.id;
      const itemRows = (wo.items || []).map((it, i) => {
        const p = pF(it.productId);
        const found = !!p;
        return <div key={i} style={{ fontSize: 11, color: found ? "#555" : "#C41E3A", padding: "2px 0" }}>
          • {p?.name || it.webLabel || it.productId} <b>x{it.qty}</b>
          {found ? <span style={{ color: "#777", marginLeft: 6 }}>({fmt((p.price || 0) * it.qty)})</span> : <span style={{ marginLeft: 6, fontWeight: 700 }}>[sin match]</span>}
        </div>;
      });
      return <div key={wo.id} style={{ background: "#fff", border: "1px solid #eee", borderLeft: "4px solid #1A5276", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{wo.negocio || "(sin negocio)"} </div>
            <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>{wo.encargado || "—"} • {wo.phone || "sin teléfono"}</div>
            {wo.direccion && <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>📍 {wo.direccion}</div>}
            <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{fmtD(wo.created_at || new Date())} • Pago: <b>{wo.pago || "—"}</b></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#1B7340" }}>{fmt(wo.total)}</div>
            <Badge text={wo.status} color={wo.status === "pending" ? "#D35400" : wo.status === "imported" ? "#1B7340" : "#888"} />
          </div>
        </div>
        <div style={{ background: "#f8f8f8", borderRadius: 6, padding: "8px 10px", marginBottom: 8 }}>{itemRows}</div>
        {wo.status === "pending" && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn small primary disabled={isProcessing} onClick={() => importOrder(wo)}>{isProcessing ? "..." : "Importar al CRM"}</Btn>
          <Btn small disabled={isProcessing} onClick={() => copyConfirmation(wo)} style={{ background: "#25D366", color: "#fff" }}>{copied === wo.id ? "✓ Copiado" : "Confirmar al cliente"}</Btn>
          {wo.phone && <WaBtn phone={wo.phone} msg={confirmMsg(wo)} label="Abrir WA" small />}
          <Btn small danger disabled={isProcessing} onClick={() => ignoreOrder(wo)}>Ignorar</Btn>
        </div>}
      </div>;
    })}
  </div>;
};

export default function App() {
  const saved = S.load();
  const defaultCampaign = { tiers: ["Lista", "Bronce", "Plata", "Oro"], message: "", sentIds: [], withPhoneOnly: true };
  const initData = saved?.init ? saved : { clients: [], orders: [], inventory: [], purchases: [], visits: [], reminders: {}, followups: {}, welcomes: {}, templates: [], campaign: defaultCampaign, init: true };
  if (!saved?.init) S.save(initData);
  // Migrate: add visits if missing from old save
  if (!initData.visits) initData.visits = [];
  // Migrate: add reminders if missing from old save
  if (!initData.reminders) initData.reminders = {};
  // Migrate: add followups if missing from old save
  if (!initData.followups) initData.followups = {};
  // Migrate: add welcomes if missing from old save
  if (!initData.welcomes) initData.welcomes = {};
  // Migrate: add templates if missing from old save
  if (!initData.templates) initData.templates = [];
  // Migrate: add campaign if missing from old save
  if (!initData.campaign) initData.campaign = defaultCampaign;

  const [tab, setTab] = useState("dashboard");
  const [clients, setClients] = useState(initData.clients);
  const [orders, setOrders] = useState(initData.orders);
  const [inventory, setInventory] = useState(initData.inventory);
  const [purchases, setPurchases] = useState(initData.purchases);
  const [visits, setVisits] = useState(initData.visits);
  const [reminders, setReminders] = useState(initData.reminders);
  const [followups, setFollowups] = useState(initData.followups);
  const [welcomes, setWelcomes] = useState(initData.welcomes);
  const [templates, setTemplates] = useState(initData.templates);
  const [campaign, setCampaign] = useState(initData.campaign);
  const [ro, setRo] = useState(null); const [resetConf, setResetConf] = useState(null); const resetRef = useRef(null);
  const [showVisitForm, setShowVisitForm] = useState(false); const [editVisit, setEditVisit] = useState(null);
  const stateRef = useRef(initData);

  const sv = useCallback((type, data) => { stateRef.current = { ...stateRef.current, [type]: data }; S.save({ ...stateRef.current, init: true }); }, []);

  const saveVisit = (visit) => {
    const isEdit = visits.some(v => v.id === visit.id);
    const updated = isEdit ? visits.map(v => v.id === visit.id ? visit : v) : [...visits, visit];
    setVisits(updated); sv("visits", updated); setShowVisitForm(false); setEditVisit(null);
  };
  const deleteVisit = (id) => { const updated = visits.filter(v => v.id !== id); setVisits(updated); sv("visits", updated); };

  const importRef = useRef();
  const exportData = () => {
    const backup = { ...stateRef.current, init: true, exportDate: new Date().toISOString(), version: "v5.13" };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `DulceSabor_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };
  const importData = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.clients && !parsed.orders && !parsed.visits) return;
        const data = { clients: parsed.clients || [], orders: parsed.orders || [], inventory: parsed.inventory || [], purchases: parsed.purchases || [], visits: parsed.visits || [], reminders: parsed.reminders || {}, followups: parsed.followups || {}, welcomes: parsed.welcomes || {}, templates: parsed.templates || [], campaign: parsed.campaign || defaultCampaign };
        stateRef.current = data; S.save({ ...data, init: true });
        setClients(data.clients); setOrders(data.orders); setInventory(data.inventory); setPurchases(data.purchases); setVisits(data.visits); setReminders(data.reminders); setFollowups(data.followups); setWelcomes(data.welcomes); setTemplates(data.templates); setCampaign(data.campaign);
        setTab("dashboard");
      } catch {}
    };
    reader.readAsText(file); e.target.value = "";
  };

  // Count pending reorder reminders for tab badge (vencidos + próximos, excluding cooldown)
  const reorderPending = clients.reduce((n, c) => {
    const co = orders.filter(o => o.clientId === c.id).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (co.length === 0) return n;
    const cycle = calcClientCycle(co);
    const overdue = dSince(co[0].date) - cycle;
    const lastR = reminders[c.id]?.lastSent;
    const inCool = lastR && dSince(lastR) < REMINDER_COOLDOWN_DAYS;
    return (overdue >= -ANTICIPATION_DAYS && !inCool) ? n + 1 : n;
  }, 0);

  // Count pending post-delivery follow-ups for tab badge
  const postdelPending = orders.reduce((n, o) => {
    if (o.status !== "delivered" && o.status !== "paid") return n;
    if (followups[o.id]) return n;
    const ds = dSince(o.date);
    if (ds < POSTDEL_MIN_DAYS || ds > POSTDEL_MAX_DAYS) return n;
    const clientExists = clients.some(c => c.id === o.clientId);
    return clientExists ? n + 1 : n;
  }, 0);

  // Count pending welcome messages for tab badge
  const welcomesPending = clients.reduce((n, c) => {
    if (welcomes[c.id]) return n;
    const co = orders.filter(o => o.clientId === c.id);
    if (co.length === 0) return n;
    const earliest = co.reduce((min, o) => new Date(o.date) < new Date(min.date) ? o : min, co[0]);
    const ds = dSince(earliest.date);
    return ds <= WELCOME_MAX_DAYS ? n + 1 : n;
  }, 0);

  // Fetch pending web orders count for tab badge
  const [webPendingCount, setWebPendingCount] = useState(0);
  useEffect(() => {
    if (!cloudEnabled) return;
    const fetchCount = async () => {
      try {
        const resp = await fetch(`${SUPA_URL}/rest/v1/web_orders?status=eq.pending&select=id`, {
          headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}` }
        });
        if (resp.ok) {
          const data = await resp.json();
          setWebPendingCount(Array.isArray(data) ? data.length : 0);
        }
      } catch(e) { /* silent */ }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  // DAILY DIGEST: runs once on first load of each calendar day
  const digestSentRef = useRef(false);
  useEffect(() => {
    if (!cloudEnabled || digestSentRef.current) return;
    const today = new Date().toISOString().slice(0, 10);
    const lastDigest = localStorage.getItem("ds-last-digest");
    if (lastDigest === today) { digestSentRef.current = true; return; }

    const timer = setTimeout(async () => {
      if (digestSentRef.current) return;
      digestSentRef.current = true;

      // Fetch current web_orders pending count (async, fresh)
      let webPending = 0;
      try {
        const resp = await fetch(`${SUPA_URL}/rest/v1/web_orders?status=eq.pending&select=id`, {
          headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}` }
        });
        if (resp.ok) {
          const data = await resp.json();
          webPending = Array.isArray(data) ? data.length : 0;
        }
      } catch(e) { console.error("Digest web_orders fetch failed:", e); }

      // Compute reorder counts (split vencidos vs proximos)
      let vencidos = 0, proximos = 0;
      clients.forEach(c => {
        const co = orders.filter(o => o.clientId === c.id).sort((a, b) => new Date(b.date) - new Date(a.date));
        if (co.length === 0) return;
        const cycle = calcClientCycle(co);
        const overdue = dSince(co[0].date) - cycle;
        const lastR = reminders[c.id]?.lastSent;
        const inCool = lastR && dSince(lastR) < REMINDER_COOLDOWN_DAYS;
        if (inCool) return;
        if (overdue >= 0) vencidos++;
        else if (overdue >= -ANTICIPATION_DAYS) proximos++;
      });

      // Compute welcomes pending
      const welcomesPend = clients.reduce((n, c) => {
        if (welcomes[c.id]) return n;
        const co = orders.filter(o => o.clientId === c.id);
        if (co.length === 0) return n;
        const earliest = co.reduce((min, o) => new Date(o.date) < new Date(min.date) ? o : min, co[0]);
        return dSince(earliest.date) <= WELCOME_MAX_DAYS ? n + 1 : n;
      }, 0);

      // Compute post-delivery pending
      const postdelPend = orders.reduce((n, o) => {
        if (o.status !== "delivered" && o.status !== "paid") return n;
        if (followups[o.id]) return n;
        const ds = dSince(o.date);
        if (ds < POSTDEL_MIN_DAYS || ds > POSTDEL_MAX_DAYS) return n;
        return clients.some(c => c.id === o.clientId) ? n + 1 : n;
      }, 0);

      // Compute inventory counts
      const lowStockCount = inventory.filter(i => i.stock > 0 && i.stock <= LOW).length;
      const outStockCount = inventory.filter(i => i.stock === 0).length;

      // Compute cobros pendientes (atrasados + hoy)
      let cobrosAtrasados = 0, cobrosHoy = 0, montoAtrasado = 0;
      orders.filter(o => o.status === "delivered").forEach(o => {
        const c = clients.find(x => x.id === o.clientId);
        if (!c) return;
        const d = daysUntilDue(o, c);
        if (d < 0) { cobrosAtrasados++; montoAtrasado += (o.total || 0); }
        else if (d === 0) cobrosHoy++;
      });

      const total = webPending + vencidos + proximos + welcomesPend + postdelPend + lowStockCount + outStockCount + cobrosAtrasados + cobrosHoy;

      // Skip if nothing pending (still mark as sent to avoid re-check)
      if (total === 0) {
        localStorage.setItem("ds-last-digest", today);
        return;
      }

      // Build digest body
      const dateStr = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      const lines = [`¡Buenos días José! ☀️`, ``, `Aquí está tu resumen del ${dateStr}:`, ``];
      if (webPending > 0) lines.push(`📬 Pedidos web pendientes por importar: ${webPending}`);
      if (vencidos > 0) lines.push(`⏰ Recordatorios vencidos: ${vencidos}`);
      if (proximos > 0) lines.push(`🟡 Recordatorios próximos: ${proximos}`);
      if (welcomesPend > 0) lines.push(`👋 Clientes nuevos sin bienvenida: ${welcomesPend}`);
      if (postdelPend > 0) lines.push(`📊 Seguimientos post-entrega: ${postdelPend}`);
      if (cobrosAtrasados > 0) lines.push(`💰 Cobros atrasados: ${cobrosAtrasados} (${fmt(montoAtrasado)})`);
      if (cobrosHoy > 0) lines.push(`💵 Cobros que vencen hoy: ${cobrosHoy}`);
      if (lowStockCount > 0) lines.push(`📉 Productos con inventario bajo: ${lowStockCount}`);
      if (outStockCount > 0) lines.push(`❌ Productos agotados: ${outStockCount}`);
      lines.push(``, `TOTAL: ${total} alerta${total !== 1 ? "s" : ""}`, ``, `Abrir CRM: ${window.location.origin}`, ``, `Que tengas un excelente día. 📚`);

      // Insert into daily_digests table — Supabase trigger will send the email
      try {
        const resp = await fetch(`${SUPA_URL}/rest/v1/daily_digests`, {
          method: 'POST',
          headers: SUPA_HEADERS,
          body: JSON.stringify({ body: lines.join('\n'), digest_date: today })
        });
        if (resp.ok) {
          localStorage.setItem("ds-last-digest", today);
          console.log("Daily digest sent");
        } else {
          console.error("Digest insert failed:", resp.status);
          digestSentRef.current = false; // Allow retry on next mount
        }
      } catch(e) {
        console.error("Digest send failed:", e);
        digestSentRef.current = false;
      }
    }, 5000); // 5s delay to let all state settle

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Count cobros pendientes (delivered, unpaid) for tab badge
  const cobrosPending = orders.filter(o => o.status === "delivered").length;

  const tabs = [{ id: "dashboard", l: "Dashboard" },{ id: "clients", l: `Clients (${clients.length})` },{ id: "orders", l: `Orders (${orders.length})` },{ id: "weborders", l: `Web Inbox${webPendingCount > 0 ? ` (${webPendingCount})` : ""}` },{ id: "welcome", l: `Bienvenida${welcomesPending > 0 ? ` (${welcomesPending})` : ""}` },{ id: "reorder", l: `Recordatorios${reorderPending > 0 ? ` (${reorderPending})` : ""}` },{ id: "postdel", l: `Seguimiento${postdelPending > 0 ? ` (${postdelPending})` : ""}` },{ id: "cobros", l: `Cobros${cobrosPending > 0 ? ` (${cobrosPending})` : ""}` },{ id: "anuncios", l: "Anuncios" },{ id: "inventory", l: "Inventory" },{ id: "purchases", l: "Purchases" },{ id: "reports", l: "P&L" },{ id: "receipt", l: "Receipt" },{ id: "visits", l: `Visits (${visits.length})` }];
  return <div style={{ fontFamily: "Arial,sans-serif", maxWidth: "100%", padding: "8px 12px" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/logo.png" alt="Dulce Sabor LLC" style={{ height: 46, width: "auto", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "#888" }}>CRM v5.13</span>
        <button onClick={exportData} style={{ fontSize: 10, color: "#1A5276", background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>Export</button>
        <button onClick={() => importRef.current?.click()} style={{ fontSize: 10, color: "#1A5276", background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>Import</button>
        <input ref={importRef} type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
        <button onClick={() => { if (resetRef.current === "clear") { const empty = { clients: [], orders: [], inventory: [], purchases: [], visits: [], reminders: {}, followups: {}, welcomes: {}, templates: [], campaign: defaultCampaign }; stateRef.current = empty; S.save({ ...empty, init: true }); setClients([]); setOrders([]); setInventory([]); setPurchases([]); setVisits([]); setReminders({}); setFollowups({}); setWelcomes({}); setTemplates([]); setCampaign(defaultCampaign); setTab("dashboard"); resetRef.current = null; setResetConf(null); } else { resetRef.current = "clear"; setResetConf("clear"); setTimeout(() => { if (resetRef.current === "clear") { resetRef.current = null; setResetConf(null); } }, 3000); } }} style={{ fontSize: 10, color: resetConf === "clear" ? "#fff" : "#C41E3A", background: resetConf === "clear" ? "#C41E3A" : "none", border: "1px solid #ddd", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>{resetConf === "clear" ? "Sure?" : "Clear all"}</button></div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "5px 11px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", background: tab === t.id ? "#C41E3A" : "transparent", color: tab === t.id ? "#fff" : "#666" }}>{t.l}</button>)}</div></div>
    <div style={{ borderTop: "2px solid #C41E3A", paddingTop: 14 }}>
      {tab === "dashboard" && <Dashboard clients={clients} orders={orders} inventory={inventory} purchases={purchases} />}
      {tab === "clients" && <Clients clients={clients} setClients={setClients} orders={orders} saveAll={sv} />}
      {tab === "orders" && <Orders clients={clients} orders={orders} setOrders={setOrders} inventory={inventory} setInventory={setInventory} saveAll={sv} setTab={setTab} setRO={setRo} />}
      {tab === "reorder" && <Reorders clients={clients} orders={orders} reminders={reminders} setReminders={setReminders} saveAll={sv} />}
      {tab === "postdel" && <PostDelivery clients={clients} orders={orders} followups={followups} setFollowups={setFollowups} saveAll={sv} />}
      {tab === "welcome" && <Welcomes clients={clients} orders={orders} welcomes={welcomes} setWelcomes={setWelcomes} saveAll={sv} />}
      {tab === "anuncios" && <Announcements clients={clients} templates={templates} setTemplates={setTemplates} campaign={campaign} setCampaign={setCampaign} saveAll={sv} />}
      {tab === "weborders" && <WebOrders clients={clients} setClients={setClients} orders={orders} setOrders={setOrders} inventory={inventory} setInventory={setInventory} saveAll={sv} setTab={setTab} setRO={setRo} />}
      {tab === "inventory" && <Inventory inventory={inventory} setInventory={setInventory} orders={orders} saveAll={sv} />}
      {tab === "purchases" && <Purchases purchases={purchases} setPurchases={setPurchases} inventory={inventory} setInventory={setInventory} saveAll={sv} />}
      {tab === "reports" && <Reports orders={orders} clients={clients} purchases={purchases} />}
      {tab === "receipt" && <Receipt order={ro} clients={clients} orders={orders} />}
      {tab === "cobros" && <Cobros clients={clients} orders={orders} setOrders={setOrders} saveAll={sv} />}
      {tab === "visits" && <><div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><Btn primary onClick={() => { setEditVisit(null); setShowVisitForm(true); }}>+ New visit</Btn></div><VisitsList visits={visits} onEdit={v => { setEditVisit(v); setShowVisitForm(true); }} onDelete={deleteVisit} /></>}
    </div>
    {showVisitForm && <VisitForm onSave={saveVisit} onClose={() => { setShowVisitForm(false); setEditVisit(null); }} editVisit={editVisit} />}
  </div>;
}
