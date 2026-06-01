// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Refactor en progreso — bloques 2A + 2B completados.
//   2A: constantes y utilidades puras tipadas (PRODUCTS, MILESTONES, helpers).
//   2B: tipo Client + propagación al componente Clients.
//   2C: pendiente — tipo Order + componente Orders.
//   2D: pendiente — Visit, Representative, Commission.
// Este archivo usa @ts-nocheck temporalmente porque la migración a TypeScript
// es incremental. Lo de abajo está tipado; el resto se irá tipando en los
// bloques siguientes. Cuando los 4 bloques estén completos, se quita este
// pragma y el archivo entra a strict mode.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback, useRef, useEffect, useMemo, type Dispatch, type SetStateAction, type ChangeEvent } from "react";
import { jsPDF } from "jspdf";
import { SUPABASE_URL, SUPABASE_KEY } from "./config";

import {
  isActiveAccount,
  milestonesEarnedAt,
  monthLabel,
  monthBounds,
  isInMonth,
  isPhase2ActiveAt,
  effectiveCommissionRate,
  getMorososForRep,
} from "./lib/business/commissions";
import {
  ACTIVE_ACCOUNT_DAYS,
  NEW_ACCOUNT_LOOKBACK_DAYS,
  COMM_RATE_NEW,
  COMM_RATE_RESIDUAL,
  COMM_RATE_PHASE2_BONUS,
  MILESTONES,
  MOROSO_DAYS,
  POST_TERMINATION_TAIL_MONTHS,
  REP_FRANCISCO_ID,
  type Milestone,
} from "./lib/contract";
import { Representatives } from "./components/Representatives";
import Commissions from "./components/Commissions";
import Welcomes from "./components/Welcomes";
import { FieldDashboard, VisitForm, VisitsList, FieldExport } from "./components/Field";
import { Inventory, Purchases, Reports } from "./components/InventoryReports";
import { Clients } from "./components/Clients";
import { Orders } from "./components/Orders";
import { Receipt } from "./components/Receipt";
import { Dashboard } from "./components/Dashboard";
import { PostDelivery } from "./components/PostDelivery";
import { Reorders } from "./components/Reorders";
import { LoginScreen, AccessDeniedScreen } from "./components/Auth";
import { Announcements } from "./components/Announcements";
import { WebOrders } from "./components/WebOrders";
import { PRODUCTS, pF, TIER_DISC, ST_CLR } from "./lib/catalog";
import type { InventoryItem } from "./lib/catalog";
import { WaBtn, cleanPhone, waLink, waOrder, waPayment, waReceipt } from "./lib/whatsapp";
// ─── Tipos del dominio (incremental: 2A=primitivos+constantes, 2B=Client) ───

export type Tier = "Lista" | "Bronce" | "Plata" | "Oro";
export type OrderStatus = "pending" | "delivered" | "paid";
export type Brand = "Mega PG" | "Pigüi USA" | "Both" | "Neither/Unknown";

// ─── Bloque 2B: Client ────────────────────────────────────────────────────────
// Cliente del CRM. Forma derivada del código real del archivo (formulario de
// alta/edición + clientes creados desde import de pedidos web). Los campos
// requeridos son los que SIEMPRE están presentes (id se asigna en `uid()` al
// crear; name y tier son obligatorios en el form). El resto es opcional porque
// el código en varios lugares hace `c.zone || ""`, `c.phone && ...`, etc.,
// reflejando que pueden venir vacíos o ausentes (clientes legacy / web import
// con datos parciales).
export interface Client {
  // Identidad
  readonly id: string;
  name: string;
  tier: Tier;

  // Contacto
  contact?: string;
  phone?: string;
  address?: string;
  zone?: string;
  notes?: string;

  // Storefront público (sync a dulcesaborca.com/donde-comprar)
  showOnWebsite?: boolean;
  publicDisplayName?: string;
  publicHours?: string;
  publicPhotoUrl?: string;
  websitePermissionDate?: string;
  permissionConfirmed?: boolean;

  // Asignación de representante (Contrato §1)
  representativeId?: string;
  priorHistoryBeforeRep?: boolean;

  // Audit
  created?: string;
  source?: string;
}

// Estado del formulario de alta/edición del componente Clients. NO incluye
// `id`, `created`, `source` — esos se asignan al guardar (o vienen del cliente
// existente al editar). Todos los campos son requeridos como string/boolean
// con defaults vacíos para que React no se queje de inputs uncontrolled.
export interface ClientFormState {
  name: string;
  address: string;
  phone: string;
  contact: string;
  zone: string;
  tier: Tier;
  notes: string;
  showOnWebsite: boolean;
  publicDisplayName: string;
  publicHours: string;
  publicPhotoUrl: string;
  websitePermissionDate: string;
  permissionConfirmed: boolean;
  representativeId: string;
  priorHistoryBeforeRep: boolean;
}

// ─── Configuración de Supabase ────────────────────────────────────────────────
const SUPA_URL: string | null = SUPABASE_URL && SUPABASE_URL !== "YOUR_PROJECT_URL_HERE" ? SUPABASE_URL : null;
const SUPA_KEY: string | null = SUPABASE_KEY && SUPABASE_KEY !== "YOUR_ANON_KEY_HERE" ? SUPABASE_KEY : null;
const SUPA_HEADERS: Record<string, string> = { "Content-Type": "application/json", "apikey": SUPA_KEY as string, "Authorization": `Bearer ${SUPA_KEY}`, "Prefer": "return=representation" };
const cloudEnabled: boolean = !!(SUPA_URL && SUPA_KEY);

// ─── Catálogo de productos ────────────────────────────────────────────────────

// ─── Enums de UI ──────────────────────────────────────────────────────────────
const ZONES: readonly string[] = ["Santa Rosa / Sonoma", "Sacramento", "San Jose / Bay Area", "Mendocino / Ukiah", "Oakland / Bay Area", "Other"];
const TIERS: readonly Tier[] = ["Lista", "Bronce", "Plata", "Oro"];
const BRANDS: readonly Brand[] = ["Mega PG", "Pigüi USA", "Both", "Neither/Unknown"];
const STORE_TYPES: readonly string[] = ["Dulcería", "Carnicería", "Supermercado", "Tienda/Market", "Convenience", "Other"];
const INTEREST_LVL: readonly string[] = ["Very interested", "Somewhat interested", "Not interested", "Already a client"];
const SUPPLIERS: readonly string[] = ["Pigüi USA (LA)", "Local distributor", "Travels to buy", "Online/Walmart/Amazon", "Unknown", "None (no Slaps)"];
const PRODUCTS_SEEN: readonly string[] = ["Slaps Lollipops", "Slaps Devora/DevorAlien", "Cachetada/Cachetadas", "Cache Colors", "Slim Licks", "Bibi Licks", "Piguileta", "Mega Huevón", "Flamkiyos", "Mordidilla", "Don Cuco", "Other Pigüi", "None"];

// ─── Tablas de lookup ─────────────────────────────────────────────────────────
const TIER_CLR: Record<Tier, string> = { Lista: "#888", Bronce: "#996633", Plata: "#1A5276", Oro: "#1B7340" };

// ─── Umbrales operativos ──────────────────────────────────────────────────────
const LOW: number = 5;
// FIX #3: Constante única para umbral de seguimiento (antes: 14 en Dashboard, 21 en Clients)
const FOLLOWUP_DAYS: number = 21;

// REORDER REMINDER SETTINGS
const REMINDER_COOLDOWN_DAYS: number = 7;
const DEFAULT_REORDER_CYCLE: number = 30;
const URGENT_OVERDUE_DAYS: number = 7;
const ANTICIPATION_DAYS: number = 5;

// POST-DELIVERY FOLLOW-UP SETTINGS
const POSTDEL_MIN_DAYS: number = 3;    // Earliest: give client time to actually sell product
const POSTDEL_MAX_DAYS: number = 21;   // Latest: after this, reorder reminder takes over
const POSTDEL_URGENT_DAYS: number = 14; // "Last chance" threshold

// WELCOME NEW CLIENT SETTINGS
const WELCOME_MAX_DAYS: number = 14;   // Window after first order to send welcome

// ─── Helpers puros ────────────────────────────────────────────────────────────
const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (n: number | string | null | undefined): string => "$" + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtD = (d: string | number | Date): string => {
  try {
    // Las fechas date-only ("YYYY-MM-DD") se parsean como medianoche UTC y se
    // corren un día atrás en zonas al oeste de UTC (p. ej. California). Parsearlas
    // en hora local evita el corrimiento.
    const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
      ? new Date(d + "T00:00:00")
      : new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return String(d); }
};
const dSince = (d: string | number | Date): number => { try { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); } catch { return 999; } };

// ─── Facade de localStorage ───────────────────────────────────────────────────
// El tipo del payload es `unknown` por ahora; bloque 2D introducirá un tipo
// `StoredData` específico cuando todos los dominios estén tipados.
const S = {
  load(): unknown {
    try {
      const raw = localStorage.getItem("megapg-data");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  save(data: unknown): void {
    try { localStorage.setItem("megapg-data", JSON.stringify(data)); } catch(e) { console.error("Save failed:", e); }
  },
};

// === PUBLIC STORES SYNC (v5.10) — sync clientes a dulcesaborca.com/donde-comprar ===
const STORE_PHOTOS_BUCKET: string = "store-photos";
const PUBLIC_INACTIVE_DAYS: number = 90;

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

// === COMMISSION HELPERS (Deploy A) ===
// Helpers de comisiones extraídos a src/lib/business/commissions.ts (Sesión 2 bloque 3)

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

// === D1 (v5.17): Cloud sync — generic upsert para clients/orders/representatives/commissions ===
const CLOUD_SYNCED_KEY = "ds-cloud-synced-v1";
const cloudIsSynced = () => { try { return localStorage.getItem(CLOUD_SYNCED_KEY) === "1"; } catch { return false; } };
const setCloudSyncedFlag = (yes) => { try { yes ? localStorage.setItem(CLOUD_SYNCED_KEY, "1") : localStorage.removeItem(CLOUD_SYNCED_KEY); } catch {} };

// Translate localStorage shape (camelCase) → Supabase row shape (snake_case top-level + JSONB data)
const serializeForCloud = (table, item) => {
  const updated_at = new Date().toISOString();
  if (table === "clients") return { id: item.id, representative_id: item.representativeId || null, data: item, updated_at };
  if (table === "orders") return { id: item.id, client_id: item.clientId, status: item.status || "pending", paid_date: item.paidDate || null, data: item, updated_at };
  if (table === "representatives") return { id: item.id, data: item, updated_at };
  if (table === "commissions") return { id: item.id, representative_id: item.representativeId, month: item.month, data: item, updated_at };
  return item;
};

const cloudUpsert = async (table, items) => {
  if (!cloudEnabled) return { ok: false, error: "Supabase no configurado" };
  if (!Array.isArray(items)) items = [items];
  if (items.length === 0) return { ok: true, count: 0 };
  const rows = items.map(it => serializeForCloud(table, it));
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?on_conflict=id`, {
      method: "POST",
      headers: { ...authedHeaders(), "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows)
    });
    if (!r.ok) {
      const txt = await r.text();
      return { ok: false, error: `HTTP ${r.status}: ${txt.slice(0, 250)}` };
    }
    return { ok: true, count: rows.length };
  } catch (e) {
    return { ok: false, error: e.message || "Network error" };
  }
};

// === D2 (v5.18): Supabase Auth ===
const AUTH_TOKEN_KEY = "ds-supabase-auth";
const authStore = {
  get() { try { return JSON.parse(localStorage.getItem(AUTH_TOKEN_KEY) || "null"); } catch { return null; } },
  set(session) { try { localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify(session)); } catch {} },
  clear() { try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch {} }
};

// Returns headers WITH Bearer = access_token if logged in, else Bearer = anon key
const authedHeaders = () => {
  const session = authStore.get();
  const token = session?.access_token || SUPA_KEY;
  return { "Content-Type": "application/json", "apikey": SUPA_KEY, "Authorization": `Bearer ${token}`, "Prefer": "return=representation" };
};

// Send OTP magic link to email
const authSendMagicLink = async (email) => {
  if (!cloudEnabled) return { ok: false, error: "Supabase no configurado" };
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(window.location.origin)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPA_KEY },
      body: JSON.stringify({ email, options: { email_redirect_to: window.location.origin } })
    });
    if (!r.ok) {
      const txt = await r.text();
      return { ok: false, error: `HTTP ${r.status}: ${txt.slice(0, 250)}` };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message || "Network error" }; }
};

// Parse magic link tokens from URL hash (#access_token=...&refresh_token=...)
const authParseHashTokens = () => {
  const hash = window.location.hash;
  if (!hash || !hash.includes("access_token=")) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  const expires_at = parseInt(params.get("expires_at") || "0", 10);
  if (!access_token) return null;
  return { access_token, refresh_token, expires_at };
};

// Get user info from Supabase using the access_token
const authGetUser = async (access_token) => {
  if (!cloudEnabled) return { ok: false, error: "Supabase no configurado" };
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${access_token}` }
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const user = await r.json();
    return { ok: true, user };
  } catch (e) { return { ok: false, error: e.message }; }
};

// Refresh token if expired
const authRefreshSession = async (refresh_token) => {
  if (!cloudEnabled || !refresh_token) return { ok: false };
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPA_KEY },
      body: JSON.stringify({ refresh_token })
    });
    if (!r.ok) return { ok: false };
    const data = await r.json();
    return { ok: true, session: data };
  } catch { return { ok: false }; }
};

// Look up app_user row by auth_user_id (returns role + representative_id)
const authLookupAppUser = async (auth_user_id, access_token) => {
  if (!cloudEnabled) return null;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/app_users?auth_user_id=eq.${auth_user_id}&select=role,representative_id,email`, {
      headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${access_token}` }
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
  } catch { return null; }
};

const authLogout = async () => {
  const session = authStore.get();
  if (session?.access_token && cloudEnabled) {
    try {
      await fetch(`${SUPA_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${session.access_token}` }
      });
    } catch {}
  }
  authStore.clear();
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

const Badge = ({ text, color }) => <span style={{ background: color + "22", color, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>{text}</span>;
const Btn = ({ children, onClick, primary, danger, small, disabled, style: s }) => <button disabled={disabled} onClick={onClick} style={{ padding: small ? "4px 10px" : "8px 16px", fontSize: small ? 12 : 13, fontWeight: 600, border: "none", borderRadius: 6, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, background: danger ? "#C41E3A" : primary ? "#1B7340" : "#f0f0f0", color: primary || danger ? "#fff" : "#333", ...s }}>{children}</button>;
const Card = ({ title, value, sub, color }) => <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "12px 14px", borderLeft: `4px solid ${color || "#1B7340"}`, minWidth: 0 }}><div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{title}</div><div style={{ fontSize: 20, fontWeight: 700, color: color || "#1B7340" }}>{value}</div>{sub && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{sub}</div>}</div>;
const Modal = ({ title, onClose, children, wide }) => <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}><div style={{ background: "#fff", borderRadius: 12, width: "92%", maxWidth: wide ? 800 : 600, maxHeight: "88vh", overflow: "auto", padding: "20px 24px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h3 style={{ fontSize: 18, fontWeight: 700, color: "#C41E3A" }}>{title}</h3><button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#999" }}>✕</button></div>{children}</div></div>;
const Inp = ({ label, value, onChange, type, placeholder, style: s, options, textarea }) => <div style={{ marginBottom: 10, ...s }}>{label && <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 3 }}>{label}</label>}{options ? <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}><option value="">-- Select --</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select> : textarea ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, resize: "vertical" }} /> : <input type={type || "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />}</div>;
const ST = ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, marginTop: 16, color: "#C41E3A", borderBottom: "2px solid #C41E3A", paddingBottom: 4 }}>{children}</h3>;

// ===== MARKET INTELLIGENCE =====
const BRAND_CLR = { "Mega PG": "#1B7340", "Pigüi USA": "#C41E3A", "Both": "#D35400", "Neither/Unknown": "#888" };

export default function App() {
  const saved = S.load();
  const defaultCampaign = { tiers: ["Lista", "Bronce", "Plata", "Oro"], message: "", sentIds: [], withPhoneOnly: true };
  const defaultRepresentatives = [{
    id: REP_FRANCISCO_ID,
    name: "Francisco Carbajal",
    phone: "",
    email: "",
    contractDate: "",
    phase2Active: false,
    phase2StartDate: "",
    milestonesPaid: [],
    terminatedDate: "",
    notes: "",
    created: new Date().toISOString()
  }];
  const initData = saved?.init ? saved : { clients: [], orders: [], inventory: [], purchases: [], visits: [], reminders: {}, followups: {}, welcomes: {}, templates: [], campaign: defaultCampaign, representatives: defaultRepresentatives, commissions: [], init: true };
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
  // Migrate: add representatives + Francisco pre-seed if missing (Deploy A)
  if (!initData.representatives || initData.representatives.length === 0) initData.representatives = defaultRepresentatives;
  // Migrate: ensure Francisco exists even if user has other reps
  if (!initData.representatives.find(r => r.id === REP_FRANCISCO_ID)) initData.representatives = [defaultRepresentatives[0], ...initData.representatives];
  // Migrate: add commissions array (Deploy B)
  if (!initData.commissions) initData.commissions = [];

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
  const [representatives, setRepresentatives] = useState(initData.representatives);
  const [commissions, setCommissions] = useState(initData.commissions);
  const [ro, setRo] = useState(null); const [resetConf, setResetConf] = useState(null); const resetRef = useRef(null);
  const [showVisitForm, setShowVisitForm] = useState(false); const [editVisit, setEditVisit] = useState(null);
  const stateRef = useRef(initData);

  // === D1 (v5.17): Cloud sync state ===
  const [cloudStatus, setCloudStatus] = useState(() => {
    if (!cloudEnabled) return "disabled";
    return cloudIsSynced() ? "synced" : "unsynced";
  });
  const [cloudError, setCloudError] = useState(null);
  const [showMigrateModal, setShowMigrateModal] = useState(false);
  const [migrateStep, setMigrateStep] = useState(null);
  const [migrateResults, setMigrateResults] = useState({});

  // === D2 (v5.18): Auth state ===
  // authState: "checking" → loading on first paint, "loggedOut" → show LoginScreen,
  //            "denied" → show AccessDeniedScreen, "ready" → show CRM
  // If cloudEnabled is false (no Supabase config), we skip auth entirely (legacy mode).
  const [authState, setAuthState] = useState(cloudEnabled ? "checking" : "ready");
  const [currentUser, setCurrentUser] = useState(null); // { email, role, representativeId, auth_user_id }

  // Bootstrap auth on mount: parse magic-link hash, validate session, lookup app_user
  useEffect(() => {
    if (!cloudEnabled) return;

    (async () => {
      // 1. Check if magic link tokens are in URL
      const hashTokens = authParseHashTokens();
      if (hashTokens) {
        authStore.set(hashTokens);
        // Clean URL so we don't re-parse on refresh
        try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch {}
      }

      // 2. Get current session from storage
      let session = authStore.get();
      if (!session?.access_token) { setAuthState("loggedOut"); return; }

      // 3. Check if expired; refresh if needed
      const nowSec = Math.floor(Date.now() / 1000);
      if (session.expires_at && session.expires_at < nowSec + 60) {
        const refreshed = await authRefreshSession(session.refresh_token);
        if (!refreshed.ok) { authStore.clear(); setAuthState("loggedOut"); return; }
        session = refreshed.session;
        authStore.set(session);
      }

      // 4. Validate token by fetching user
      const userR = await authGetUser(session.access_token);
      if (!userR.ok) { authStore.clear(); setAuthState("loggedOut"); return; }

      // 5. Look up app_user row → role, representative_id
      const appUser = await authLookupAppUser(userR.user.id, session.access_token);
      if (!appUser) {
        // Authenticated, but no entry in app_users → access denied
        setCurrentUser({ email: userR.user.email, role: null, representativeId: null, auth_user_id: userR.user.id });
        setAuthState("denied");
        return;
      }

      setCurrentUser({
        email: userR.user.email,
        role: appUser.role,
        representativeId: appUser.representative_id,
        auth_user_id: userR.user.id
      });
      setAuthState("ready");
    })();
  }, []);

  const handleLogout = async () => {
    await authLogout();
    setCurrentUser(null);
    setAuthState("loggedOut");
    // Hard reload to flush all in-memory state
    setTimeout(() => window.location.reload(), 100);
  };

  const sv = useCallback((type, data) => {
    stateRef.current = { ...stateRef.current, [type]: data };
    S.save({ ...stateRef.current, init: true });
    // D1: auto-sync to cloud on save (fire-and-forget) if migration done
    if (cloudEnabled && cloudIsSynced() && ["clients", "orders", "representatives", "commissions"].includes(type)) {
      setCloudStatus("syncing");
      cloudUpsert(type, data).then(r => {
        if (r.ok) { setCloudStatus("synced"); setCloudError(null); }
        else { setCloudStatus("error"); setCloudError(r.error); }
      }).catch(e => { setCloudStatus("error"); setCloudError(e.message); });
    }
  }, []);

  // === D1: Bulk migration localStorage → Supabase ===
  const migrateToCloud = async () => {
    if (!cloudEnabled) { alert("Supabase no está configurado en este build."); return; }
    setShowMigrateModal(true);
    setMigrateStep("starting");
    setMigrateResults({});
    setCloudError(null);

    const types = ["representatives", "clients", "orders", "commissions"];
    const results = {};

    for (const t of types) {
      setMigrateStep(t);
      const items = stateRef.current[t] || [];
      const r = await cloudUpsert(t, items);
      results[t] = { ok: r.ok, count: items.length, error: r.error };
      setMigrateResults({ ...results });
      if (!r.ok) {
        setMigrateStep("error");
        setCloudStatus("error");
        setCloudError(`Error en ${t}: ${r.error}`);
        return;
      }
    }

    setCloudSyncedFlag(true);
    setCloudStatus("synced");
    setMigrateStep("done");
  };

  // Listen for representatives updates from inside Commissions (when freezing milestones)
  useEffect(() => {
    const handler = (e) => { if (Array.isArray(e.detail)) setRepresentatives(e.detail); };
    window.addEventListener("ds-reps-updated", handler);
    return () => window.removeEventListener("ds-reps-updated", handler);
  }, []);

  const saveVisit = (visit) => {
    const isEdit = visits.some(v => v.id === visit.id);
    const updated = isEdit ? visits.map(v => v.id === visit.id ? visit : v) : [...visits, visit];
    setVisits(updated); sv("visits", updated); setShowVisitForm(false); setEditVisit(null);
  };
  const deleteVisit = (id) => { const updated = visits.filter(v => v.id !== id); setVisits(updated); sv("visits", updated); };

  const importRef = useRef();
  const exportData = () => {
    const backup = { ...stateRef.current, init: true, exportDate: new Date().toISOString(), version: "v5.18" };
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
        const importedReps = parsed.representatives || defaultRepresentatives;
        const repsWithFrancisco = importedReps.find(r => r.id === REP_FRANCISCO_ID) ? importedReps : [defaultRepresentatives[0], ...importedReps];
        const data = { clients: parsed.clients || [], orders: parsed.orders || [], inventory: parsed.inventory || [], purchases: parsed.purchases || [], visits: parsed.visits || [], reminders: parsed.reminders || {}, followups: parsed.followups || {}, welcomes: parsed.welcomes || {}, templates: parsed.templates || [], campaign: parsed.campaign || defaultCampaign, representatives: repsWithFrancisco, commissions: parsed.commissions || [] };
        stateRef.current = data; S.save({ ...data, init: true });
        setClients(data.clients); setOrders(data.orders); setInventory(data.inventory); setPurchases(data.purchases); setVisits(data.visits); setReminders(data.reminders); setFollowups(data.followups); setWelcomes(data.welcomes); setTemplates(data.templates); setCampaign(data.campaign); setRepresentatives(data.representatives); setCommissions(data.commissions);
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

      const total = webPending + vencidos + proximos + welcomesPend + postdelPend + lowStockCount + outStockCount;

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

  const tabs = [{ id: "dashboard", l: "Dashboard" },{ id: "clients", l: `Clients (${clients.length})` },{ id: "orders", l: `Orders (${orders.length})` },{ id: "weborders", l: `Web Inbox${webPendingCount > 0 ? ` (${webPendingCount})` : ""}` },{ id: "welcome", l: `Bienvenida${welcomesPending > 0 ? ` (${welcomesPending})` : ""}` },{ id: "reorder", l: `Recordatorios${reorderPending > 0 ? ` (${reorderPending})` : ""}` },{ id: "postdel", l: `Seguimiento${postdelPending > 0 ? ` (${postdelPending})` : ""}` },{ id: "anuncios", l: "Anuncios" },{ id: "inventory", l: "Inventory" },{ id: "purchases", l: "Purchases" },{ id: "reps", l: `Representantes (${representatives.length})` },{ id: "commissions", l: "Comisiones" },{ id: "reports", l: "P&L" },{ id: "receipt", l: "Receipt" },{ id: "field", l: "Field Intel" },{ id: "visits", l: `Visits (${visits.length})` },{ id: "analysis", l: "Export Intel" }];

  // === D2 (v5.18): Auth gate ===
  if (authState === "checking") return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FDF2E9" }}><div style={{ fontSize: 14, color: "#888" }}>⏳ Verificando sesión...</div></div>;
  if (authState === "loggedOut") return <LoginScreen sendMagicLink={authSendMagicLink} />;

  if (authState === "denied") return <AccessDeniedScreen email={currentUser?.email} onLogout={handleLogout} />;

  return <div style={{ fontFamily: "Arial,sans-serif", maxWidth: "100%", padding: "8px 12px" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/logo.png" alt="Dulce Sabor LLC" style={{ height: 46, width: "auto", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "#888" }}>CRM v5.21.2</span>
        {currentUser && <span title={`${currentUser.email} • ${currentUser.role}`} style={{ fontSize: 11, fontWeight: 700, color: currentUser.role === "admin" ? "#1B7340" : "#6C3483", background: currentUser.role === "admin" ? "#E8F5E8" : "#F4ECF7", padding: "3px 8px", borderRadius: 12, border: `1px solid ${currentUser.role === "admin" ? "#C8E6C9" : "#E1BEE7"}` }}>👤 {currentUser.email.split("@")[0]} ({currentUser.role})</span>}
        {currentUser && <button onClick={handleLogout} title="Cerrar sesión" style={{ fontSize: 10, color: "#888", background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>Logout</button>}
        <button onClick={exportData} style={{ fontSize: 10, color: "#1A5276", background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>Export</button>
        <button onClick={() => importRef.current?.click()} style={{ fontSize: 10, color: "#1A5276", background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>Import</button>
        <input ref={importRef} type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
        {/* D1 (v5.17): Cloud sync indicator */}
        {cloudEnabled && (cloudStatus === "unsynced"
          ? <button onClick={migrateToCloud} title="Migra todo tu localStorage a Supabase (one-shot)" style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#1A5276", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>☁️ Migrar al cloud</button>
          : <button onClick={migrateToCloud} title={cloudError || "Sync activo. Click para re-sincronizar todo."} style={{ fontSize: 10, fontWeight: 600, background: "none", border: `1px solid ${cloudStatus === "error" ? "#C41E3A" : cloudStatus === "syncing" ? "#F39C12" : "#1B7340"}`, color: cloudStatus === "error" ? "#C41E3A" : cloudStatus === "syncing" ? "#B7950B" : "#1B7340", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>
              {cloudStatus === "synced" && "☁️ ✓"}
              {cloudStatus === "syncing" && "☁️ ⏳"}
              {cloudStatus === "error" && "☁️ ⚠️"}
            </button>)}
        <button onClick={() => { if (resetRef.current === "clear") { const empty = { clients: [], orders: [], inventory: [], purchases: [], visits: [], reminders: {}, followups: {}, welcomes: {}, templates: [], campaign: defaultCampaign, representatives: defaultRepresentatives, commissions: [] }; stateRef.current = empty; S.save({ ...empty, init: true }); setClients([]); setOrders([]); setInventory([]); setPurchases([]); setVisits([]); setReminders({}); setFollowups({}); setWelcomes({}); setTemplates([]); setCampaign(defaultCampaign); setRepresentatives(defaultRepresentatives); setCommissions([]); setTab("dashboard"); resetRef.current = null; setResetConf(null); } else { resetRef.current = "clear"; setResetConf("clear"); setTimeout(() => { if (resetRef.current === "clear") { resetRef.current = null; setResetConf(null); } }, 3000); } }} style={{ fontSize: 10, color: resetConf === "clear" ? "#fff" : "#C41E3A", background: resetConf === "clear" ? "#C41E3A" : "none", border: "1px solid #ddd", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>{resetConf === "clear" ? "Sure?" : "Clear all"}</button></div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "5px 11px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", background: tab === t.id ? "#C41E3A" : "transparent", color: tab === t.id ? "#fff" : "#666" }}>{t.l}</button>)}</div></div>
    <div style={{ borderTop: "2px solid #C41E3A", paddingTop: 14 }}>
      {tab === "dashboard" && <Dashboard clients={clients} orders={orders} inventory={inventory} calcWeeks={calcWeeks} />}
      {tab === "clients" && <Clients
        clients={clients}
        setClients={setClients}
        orders={orders}
        representatives={representatives}
        saveAll={sv}
        syncClientToPublicStores={syncClientToPublicStores}
        syncAllPublicStores={syncAllPublicStores}
        uploadStorePhoto={uploadStorePhoto}
      />}
      {tab === "orders" && <Orders clients={clients} orders={orders} setOrders={setOrders} inventory={inventory} setInventory={setInventory} saveAll={sv} setTab={setTab} setRO={setRo} />}
      {tab === "reorder" && <Reorders clients={clients} orders={orders} reminders={reminders} setReminders={setReminders} saveAll={sv} calcClientCycle={calcClientCycle} />}
      {tab === "postdel" && <PostDelivery clients={clients} orders={orders} followups={followups} setFollowups={setFollowups} saveAll={sv} />}
        {tab === "welcome" && <Welcomes clients={clients} orders={orders} welcomes={welcomes} setWelcomes={setWelcomes} saveAll={sv} getProductName={(id) => pF(id)?.name ?? null} />}
      {tab === "anuncios" && <Announcements clients={clients} templates={templates} setTemplates={setTemplates} campaign={campaign} setCampaign={setCampaign} saveAll={sv} />}
      {tab === "weborders" && <WebOrders clients={clients} setClients={setClients} orders={orders} setOrders={setOrders} inventory={inventory} setInventory={setInventory} saveAll={sv} supa={{ enabled: cloudEnabled, url: SUPA_URL, key: SUPA_KEY, headers: SUPA_HEADERS }} />}
      {tab === "inventory" && <Inventory inventory={inventory} setInventory={setInventory} orders={orders} commissions={commissions} saveAll={sv} products={PRODUCTS} calcWeeks={calcWeeks}/>}
      {tab === "purchases" && <Purchases purchases={purchases} setPurchases={setPurchases} inventory={inventory} setInventory={setInventory} saveAll={sv} products={PRODUCTS}/>}
      {tab === "reps" && <Representatives representatives={representatives} setRepresentatives={setRepresentatives} clients={clients} orders={orders} commissions={commissions} saveAll={sv} />}
      {tab === "commissions" && <Commissions representatives={representatives} clients={clients} orders={orders} commissions={commissions} setCommissions={setCommissions} saveAll={sv} />}
      {tab === "reports" && <Reports orders={orders} clients={clients} purchases={purchases} products={PRODUCTS} calcWeeks={calcWeeks}/>}
      {tab === "receipt" && <Receipt order={ro} clients={clients} />}
      {tab === "field" && <FieldDashboard visits={visits} />}
      {tab === "visits" && <><div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><Btn primary onClick={() => { setEditVisit(null); setShowVisitForm(true); }}>+ New visit</Btn></div><VisitsList visits={visits} onEdit={v => { setEditVisit(v); setShowVisitForm(true); }} onDelete={deleteVisit} /></>}
      {tab === "analysis" && <FieldExport visits={visits} />}
    </div>
    {showVisitForm && <VisitForm onSave={saveVisit} onClose={() => { setShowVisitForm(false); setEditVisit(null); }} editVisit={editVisit} />}

    {/* === D1 (v5.17): Migration progress modal === */}
    {showMigrateModal && <Modal title="☁️ Migración a Supabase" onClose={() => (migrateStep === "done" || migrateStep === "error") && setShowMigrateModal(false)}>
      {migrateStep === "starting" && <p style={{ fontSize: 13, color: "#555" }}>Iniciando migración...</p>}
      {(["representatives", "clients", "orders", "commissions"].includes(migrateStep)) && <div style={{ fontSize: 13, color: "#555" }}>
        <p>Subiendo <b>{migrateStep}</b>...</p>
        <div style={{ background: "#f8f8f8", borderRadius: 6, padding: "10px 14px", fontFamily: "monospace", fontSize: 12 }}>
          {Object.entries(migrateResults).map(([k, v]) => <div key={k}>{v.ok ? "✓" : "✗"} {k}: {v.count} registros{v.error ? ` — ${v.error}` : ""}</div>)}
          <div>⏳ {migrateStep}...</div>
        </div>
      </div>}
      {migrateStep === "done" && <div style={{ fontSize: 13, color: "#555" }}>
        <p style={{ color: "#1B7340", fontWeight: 700, fontSize: 15 }}>✅ Migración completa</p>
        <div style={{ background: "#E8F5E8", borderRadius: 6, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, margin: "10px 0" }}>
          {Object.entries(migrateResults).map(([k, v]) => <div key={k}>✓ {k}: <b>{v.count}</b> registros subidos</div>)}
        </div>
        <p style={{ fontSize: 12, color: "#777" }}>De ahora en adelante, cada cambio que hagas se sincronizará automáticamente al cloud (badge ☁️ ✓ en la barra superior). Si aparece ☁️ ⚠️ pasa el cursor encima para ver el error.</p>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><Btn primary onClick={() => setShowMigrateModal(false)}>OK</Btn></div>
      </div>}
      {migrateStep === "error" && <div style={{ fontSize: 13, color: "#555" }}>
        <p style={{ color: "#C41E3A", fontWeight: 700, fontSize: 15 }}>❌ Error en la migración</p>
        <div style={{ background: "#FDF2F2", borderRadius: 6, padding: "10px 14px", fontFamily: "monospace", fontSize: 11, margin: "10px 0", color: "#C41E3A", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {cloudError}
        </div>
        <div style={{ background: "#f8f8f8", borderRadius: 6, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, margin: "10px 0" }}>
          {Object.entries(migrateResults).map(([k, v]) => <div key={k}>{v.ok ? "✓" : "✗"} {k}: {v.count} registros{v.error ? ` — ${v.error}` : ""}</div>)}
        </div>
        <p style={{ fontSize: 12, color: "#777" }}>¿Causas comunes? (1) No corriste el SQL D1 en Supabase. (2) Las RLS policies no permiten anon. (3) Una tabla tiene restricción de FK que falla. Mándale captura de este error a Claude.</p>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><Btn onClick={() => setShowMigrateModal(false)}>Cerrar</Btn></div>
      </div>}
    </Modal>}
  </div>;
}
