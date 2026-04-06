import { useState, useCallback, useRef } from "react";
import { jsPDF } from "jspdf";

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
const LOW = 5;
// FIX #3: Constante única para umbral de seguimiento (antes: 14 en Dashboard, 21 en Clients)
const FOLLOWUP_DAYS = 21;
// REORDER REMINDER SETTINGS
const REMINDER_COOLDOWN_DAYS = 7;
const DEFAULT_REORDER_CYCLE = 30;
const URGENT_OVERDUE_DAYS = 7;
const ANTICIPATION_DAYS = 5;
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

// WhatsApp helpers
const cleanPhone = (ph) => { if (!ph) return ""; return ph.replace(/[^0-9]/g, "").replace(/^1?(\d{10})$/, "1$1"); };
const waLink = (phone, msg) => `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(msg)}`;
const waOrder = (order, client) => {
  const items = order.items.map(it => { const p = pF(it.productId); return `  - ${p?.name || it.productId} x${it.qty} = ${fmt((p?.price || 0) * it.qty * (1 - (order.discount || 0)))}`; }).join("\n");
  return `*MEGA PG DISTRIBUTIONS*\nOrder #${order.id.slice(-6).toUpperCase()}\nDate: ${fmtD(order.date)}\n\nHi ${client?.contact || client?.name || ""},\n\nHere's your order confirmation:\n\n${items}\n${order.discount > 0 ? `\nDiscount: ${Math.round(order.discount * 100)}% (${client?.tier})\n` : ""}\n*TOTAL: ${fmt(order.total)}*\n\nPayment: Cash, Zelle, Venmo, or Check\nQuestions? Call (707) 360-7420\n\nThank you!\n- José Flores, Mega PG NorCal`;
};
const waReceipt = (order, client) => {
  const items = order.items.map(it => { const p = pF(it.productId); return `${p?.name || it.productId} x${it.qty}`; }).join(", ");
  return `*MEGA PG — Receipt #${order.id.slice(-6).toUpperCase()}*\nDate: ${fmtD(order.date)}\nClient: ${client?.name || ""}\nItems: ${items}\n${order.discount > 0 ? `Discount: ${Math.round(order.discount * 100)}%\n` : ""}*Total: ${fmt(order.total)}*\nStatus: ${order.status.toUpperCase()}\n\nThank you for your business!\nJosé Flores • (707) 360-7420\nmegapgcandies.com`;
};
const waPayment = (order, client) => {
  return `Hi ${client?.contact || client?.name || ""},\n\nFriendly reminder about your order #${order.id.slice(-6).toUpperCase()} from ${fmtD(order.date)} for *${fmt(order.total)}*.\n\nStatus: ${order.status === "delivered" ? "Delivered — payment pending" : "Pending"}\n\nPayment options:\n- Cash on next visit\n- Zelle: megapg.norcal@gmail.com\n- Venmo: @MegaPG-NorCal\n- Check payable to Mega PG Distributions\n\nQuestions? Call (707) 360-7420\n\nThank you!\n- José Flores, Mega PG`;
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
        {c.phone && <WaBtn phone={c.phone} msg={`Hi ${c.contact || c.name},\n\nIt's José from Mega PG Distributions! Just checking in — it's been a while since your last order.\n\nWe have fresh stock of Slaps Lollipops and all your favorites ready to go. Would you like to place a reorder?\n\nYour last order was ${lastO ? fmtD(lastO.date) : "a while back"} for ${lastO ? fmt(lastO.total) : ""}.\n\nLet me know!\n(707) 360-7420`} label="Follow up" small />}
      </div>; })}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}><div><ST>Top clients by profit</ST>{cProf.slice(0, 6).map((c, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}><div><b>{c.name}</b> <Badge text={c.tier} color={TIER_CLR[c.tier]} /></div><div><span style={{ color: "#1B7340", fontWeight: 700 }}>{fmt(c.prof)}</span><span style={{ color: "#999", marginLeft: 6 }}>{c.oc} ord</span></div></div>)}</div><div><ST>Product velocity <span style={{ fontSize: 11, fontWeight: 400, color: "#999" }}>({Math.round(weeks)}wk span)</span></ST>{pVel.slice(0, 8).map(p => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0", fontSize: 12 }}><span>{p.name}</span><div style={{ display: "flex", gap: 10 }}><span>{p.sold} sold</span><span style={{ color: "#777" }}>{p.wr}/wk</span><span style={{ color: p.st === 0 ? "#C41E3A" : p.st <= LOW ? "#D35400" : "#1B7340", fontWeight: 600 }}>{p.st} stock</span>{p.wk < 3 && p.wk > 0 && <Badge text={`${p.wk}wk left`} color="#C41E3A" />}</div></div>)}</div></div>
    <ST>Recent orders</ST>{orders.slice(-6).reverse().map(o => { const cl = clients.find(c => c.id === o.clientId); const cost = o.items.reduce((a, it) => a + (pF(it.productId)?.cost || 0) * it.qty, 0); return <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}><div><b>{cl?.name || "?"}</b> <span style={{ color: "#999" }}>{fmtD(o.date)}</span></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><b>{fmt(o.total)}</b><span style={{ color: "#1B7340", fontSize: 11 }}>+{fmt((o.total || 0) - cost)}</span><Badge text={o.status} color={ST_CLR[o.status]} /></div></div>; })}
  </div>;
};

const Clients = ({ clients, setClients, orders, saveAll }) => {
  const [sf, setSf] = useState(false); const [edit, setEdit] = useState(null); const [delC, setDelC] = useState(null); const delRef = useRef(null); const [form, setForm] = useState({ name: "", address: "", phone: "", contact: "", zone: "", tier: "Lista", notes: "" }); const [search, setSearch] = useState("");
  const openN = () => { setForm({ name: "", address: "", phone: "", contact: "", zone: "", tier: "Lista", notes: "" }); setEdit(null); setSf(true); };
  const openE = (c) => { setForm({ ...c }); setEdit(c.id); setSf(true); };
  const save = () => { if (!form.name) return; if (edit) { setClients(prev => { const n = prev.map(c => c.id === edit ? { ...c, ...form } : c); saveAll("clients", n); return n; }); } else { setClients(prev => { const n = [...prev, { ...form, id: uid(), created: new Date().toISOString() }]; saveAll("clients", n); return n; }); } setSf(false); };
  const del = (id) => { if (delRef.current === id) { setClients(prev => { const n = prev.filter(c => c.id !== id); saveAll("clients", n); return n; }); delRef.current = null; setDelC(null); } else { delRef.current = id; setDelC(id); setTimeout(() => { if (delRef.current === id) { delRef.current = null; setDelC(null); } }, 3000); } };
  const fil = clients.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.zone?.toLowerCase().includes(search.toLowerCase()) || c.contact?.toLowerCase().includes(search.toLowerCase()));
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8 }}><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." style={{ padding: "7px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, flex: 1, maxWidth: 280 }} /><Btn primary onClick={openN}>+ New client</Btn></div>
    {fil.length === 0 && <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 40 }}>No clients. Click "+ New client".</p>}
    {fil.map(c => { const co = orders.filter(o => o.clientId === c.id); const last = co.length > 0 ? co.sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null; const ts = co.reduce((s, o) => s + (o.total || 0), 0); const days = last ? dSince(last.date) : null; const fu = days !== null && days > FOLLOWUP_DAYS;
      return <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: fu ? "#FDF2E9" : "#fff", border: "1px solid #eee", borderRadius: 8, marginBottom: 5 }}>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 3 }}><span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span><Badge text={c.tier} color={TIER_CLR[c.tier]} />{c.zone && <Badge text={c.zone} color="#6C3483" />}{fu && <Badge text={`${days}d — follow up!`} color="#D35400" />}</div><div style={{ fontSize: 12, color: "#777" }}>{[c.contact, c.phone].filter(Boolean).join(" • ")}</div></div>
        <div style={{ textAlign: "right", marginRight: 10, flexShrink: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{co.length} orders • {fmt(ts)}</div><div style={{ fontSize: 11, color: "#999" }}>{last ? `Last: ${fmtD(last.date)}` : "No orders"}</div></div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {c.phone && <WaBtn phone={c.phone} msg={`Hi ${c.contact || c.name}, it's José from Mega PG Distributions!\n\nHow are the Slaps selling? Ready for a reorder?\n\n(707) 360-7420`} label="WA" small />}
          <Btn small onClick={() => openE(c)}>Edit</Btn><Btn small danger onClick={() => del(c.id)} style={delC === c.id ? { minWidth: 52, background: "#8B0000" } : {}}>{delC === c.id ? "Sure?" : "✕"}</Btn></div></div>; })}
    {sf && <Modal title={edit ? "Edit client" : "New client"} onClose={() => setSf(false)}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}><Inp label="Store name *" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Dulceria Mi Carnaval" /><Inp label="Contact" value={form.contact} onChange={v => setForm(p => ({ ...p, contact: v }))} placeholder="Juan Pérez" /><Inp label="Phone" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} placeholder="(408) 555-1234" /><Inp label="Zone" value={form.zone} onChange={v => setForm(p => ({ ...p, zone: v }))} options={ZONES} /><Inp label="Tier" value={form.tier} onChange={v => setForm(p => ({ ...p, tier: v }))} options={TIERS} /><Inp label="Address" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="1161 E Santa Clara St" /></div>
      <Inp label="Notes" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} textarea /><div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><Btn onClick={() => setSf(false)}>Cancel</Btn><Btn primary onClick={save}>{edit ? "Update" : "Add"}</Btn></div></Modal>}
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
  const upSt = (id, st) => setOrders(prev => { const n = prev.map(o => o.id === id ? { ...o, status: st } : o); saveAll("orders", n); return n; });
  const delO = (id) => { if (delORef.current === id) { setOrders(prev => { const n = prev.filter(o => o.id !== id); saveAll("orders", n); return n; }); delORef.current = null; setDelConfirm(null); } else { delORef.current = id; setDelConfirm(id); setTimeout(() => { if (delORef.current === id) { delORef.current = null; setDelConfirm(null); } }, 3000); } };
  const qReorder = (o) => { setForm({ clientId: o.clientId, date: new Date().toISOString().slice(0, 10), items: o.items.map(it => ({ productId: it.productId, qty: it.qty })), notes: "Reorder from " + fmtD(o.date), status: "pending" }); setSf(true); };
  return <div>
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><Btn primary onClick={openN}>+ New order</Btn></div>
    {orders.length === 0 && <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 40 }}>No orders yet.</p>}
    {orders.slice().reverse().map(o => { const c = clients.find(x => x.id === o.clientId); const tc = o.items.reduce((a, it) => a + it.qty, 0); const cost = o.items.reduce((a, it) => a + (pF(it.productId)?.cost || 0) * it.qty, 0); const prof = (o.total || 0) - cost;
      return <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#fff", border: "1px solid #eee", borderRadius: 8, marginBottom: 4, fontSize: 13 }}>
        <div style={{ flex: 1, minWidth: 0 }}><b>{c?.name || "?"}</b> <span style={{ color: "#999" }}>{fmtD(o.date)}</span> <span style={{ color: "#777" }}>{tc} cases</span>{o.discount > 0 && <Badge text={`-${Math.round(o.discount * 100)}%`} color="#D35400" />}</div>
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
  const ps = PRODUCTS.map(p => { const sold = orders.reduce((s, o) => s + o.items.filter(it => it.productId === p.id).reduce((a, it) => a + it.qty, 0), 0); const rev = orders.reduce((s, o) => s + o.items.filter(it => it.productId === p.id).reduce((a, it) => a + (p.price * (1 - (o.discount || 0))) * it.qty, 0), 0); return { ...p, sold, rev, prof: rev - p.cost * sold }; }).sort((a, b) => b.sold - a.sold);
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

const Receipt = ({ order, clients }) => {
  if (!order) return <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 40 }}>Select from Orders tab.</p>;
  const cl = clients.find(c => c.id === order.clientId); const disc = order.discount || 0;
  const sub = order.items.reduce((s, it) => s + (pF(it.productId)?.price || 0) * it.qty, 0);
  const orderNum = order.id.slice(-6).toUpperCase();

  const downloadPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const W = doc.internal.pageSize.getWidth();
    const mg = 50, cw = W - mg * 2;
    let y = 50;
    doc.setFillColor(196, 30, 58); doc.rect(0, 0, W, 6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(196, 30, 58);
    doc.text("MEGA PG DISTRIBUTIONS", W / 2, y, { align: "center" }); y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text("Authentic Mexican Candy \u2022 Northern California", W / 2, y, { align: "center" }); y += 14;
    doc.setFontSize(10); doc.setTextColor(60, 60, 60);
    doc.text("Jos\u00e9 Flores \u2022 (707) 360-7420 \u2022 megapg.norcal@gmail.com", W / 2, y, { align: "center" }); y += 10;
    doc.setDrawColor(196, 30, 58); doc.setLineWidth(2); doc.line(mg, y, W - mg, y); y += 20;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(30, 30, 30);
    doc.text(cl?.name || "\u2014", mg, y); doc.text(`Order #${orderNum}`, W - mg, y, { align: "right" }); y += 15;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100, 100, 100);
    if (cl?.address) doc.text(cl.address, mg, y);
    doc.text(fmtD(order.date), W - mg, y, { align: "right" }); y += 14;
    if (cl?.phone) doc.text(cl.phone, mg, y);
    const sc = { pending: [211, 84, 0], delivered: [26, 82, 118], paid: [27, 115, 64] }[order.status] || [100, 100, 100];
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(sc[0], sc[1], sc[2]);
    doc.text(order.status.toUpperCase(), W - mg, y, { align: "right" }); y += (cl?.phone ? 14 : 8) + 10;
    doc.setDrawColor(196, 30, 58); doc.setLineWidth(2); doc.line(mg, y, W - mg, y); y += 16;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(196, 30, 58);
    const cols = [mg, mg + cw * 0.50, mg + cw * 0.65, mg + cw * 0.82];
    doc.text("Product", cols[0], y); doc.text("Qty", cols[1], y, { align: "center" }); doc.text("Unit Price", cols[2], y, { align: "right" }); doc.text("Total", W - mg, y, { align: "right" }); y += 8;
    doc.setDrawColor(196, 30, 58); doc.setLineWidth(0.5); doc.line(mg, y, W - mg, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
    order.items.forEach(it => { const p = pF(it.productId); doc.text(p?.name || it.productId, cols[0], y); doc.text(String(it.qty), cols[1], y, { align: "center" }); doc.text(fmt(p?.price), cols[2], y, { align: "right" }); doc.text(fmt((p?.price || 0) * it.qty), W - mg, y, { align: "right" }); y += 6; doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3); doc.line(mg, y, W - mg, y); y += 14; });
    y += 4; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5); doc.line(mg + cw * 0.5, y, W - mg, y); y += 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(60, 60, 60);
    doc.text("Subtotal", mg + cw * 0.5, y); doc.text(fmt(sub), W - mg, y, { align: "right" }); y += 18;
    if (disc > 0) { doc.setTextColor(27, 115, 64); doc.text(`Discount (${cl?.tier} ${Math.round(disc * 100)}%)`, mg + cw * 0.5, y); doc.text(`-${fmt(sub * disc)}`, W - mg, y, { align: "right" }); y += 18; }
    doc.setDrawColor(196, 30, 58); doc.setLineWidth(2); doc.line(mg + cw * 0.5, y, W - mg, y); y += 20;
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(196, 30, 58);
    doc.text("TOTAL", mg + cw * 0.5, y); doc.text(fmt(order.total), W - mg, y, { align: "right" }); y += 14;
    if (order.notes) { y += 10; doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(120, 120, 120); doc.text(`Notes: ${order.notes}`, mg, y); y += 14; }
    y += 10; doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.5); doc.line(mg, y, W - mg, y); y += 16;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(80, 80, 80); doc.text("Payment Methods", mg, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100, 100, 100);
    ["Cash on delivery", "Zelle: megapg.norcal@gmail.com", "Venmo: @MegaPG-NorCal", "Check: Mega PG Distributions LLC"].forEach(pm => { doc.text(`\u2022  ${pm}`, mg + 8, y); y += 13; });
    y += 10; doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.5); doc.line(mg, y, W - mg, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(160, 160, 160);
    doc.text("Thank you for your business!", W / 2, y, { align: "center" }); y += 12;
    doc.text("megapgcandies.com \u2022 slapslollipop.com \u2022 dulcespigui.com.mx", W / 2, y, { align: "center" });
    doc.setFillColor(196, 30, 58); doc.rect(0, doc.internal.pageSize.getHeight() - 6, W, 6, "F");
    doc.save(`MegaPG_${orderNum}_${order.date}.pdf`);
  };

  const printThermal = () => {
    const items = order.items.map(it => { const p = pF(it.productId); return `<tr><td style="padding:2px 0">${p?.name || it.productId}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right">${fmt((p?.price || 0) * it.qty * (1 - disc))}</td></tr>`; }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Print</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:monospace,sans-serif;width:72mm;font-size:12px;color:#000;padding:2mm}
@page{size:80mm auto;margin:0}
@media print{body{width:72mm;padding:2mm}}.hdr{text-align:center;border-bottom:2px dashed #000;padding-bottom:4px;margin-bottom:6px}
.hdr h1{font-size:16px;font-weight:900;letter-spacing:1px}.hdr p{font-size:10px}
.info{display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px}
table{width:100%;border-collapse:collapse;font-size:11px;margin:4px 0}th{text-align:left;border-bottom:1px dashed #000;padding:2px 0;font-size:10px}
td{padding:2px 0}.tot{border-top:2px dashed #000;margin-top:6px;padding-top:4px;font-size:11px}
.tot .line{display:flex;justify-content:space-between;padding:1px 0}
.tot .grand{font-size:16px;font-weight:900;border-top:2px solid #000;margin-top:4px;padding-top:4px}
.pay{border-top:1px dashed #000;margin-top:6px;padding-top:4px;font-size:10px}
.ftr{text-align:center;border-top:1px dashed #000;margin-top:6px;padding-top:4px;font-size:9px}
</style></head><body>
<div class="hdr"><h1>MEGA PG</h1><p>DISTRIBUTIONS LLC</p><p>Jos&eacute; Flores &bull; (707) 360-7420</p><p>megapg.norcal@gmail.com</p></div>
<div class="info"><div><b>${cl?.name || ""}</b>${cl?.phone ? `<br>${cl.phone}` : ""}</div><div style="text-align:right"><b>#${orderNum}</b><br>${fmtD(order.date)}</div></div>
<table><thead><tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Total</th></tr></thead><tbody>${items}</tbody></table>
<div class="tot"><div class="line"><span>Subtotal</span><span>${fmt(sub)}</span></div>
${disc > 0 ? `<div class="line"><span>Desc. ${cl?.tier} ${Math.round(disc * 100)}%</span><span>-${fmt(sub * disc)}</span></div>` : ""}
<div class="line grand"><span>TOTAL</span><span>${fmt(order.total)}</span></div></div>
<div class="pay"><b>Pago:</b> Cash &bull; Zelle &bull; Venmo &bull; Check</div>
${order.notes ? `<div style="font-size:10px;margin-top:4px;font-style:italic">${order.notes}</div>` : ""}
<div class="ftr">&iexcl;Gracias por su compra!<br>megapgcandies.com</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
    const w = window.open("", "_blank", "width=320,height=600");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return <div>
    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
      <Btn primary onClick={printThermal} style={{ background: "#D35400" }}>🖨 Imprimir recibo</Btn>
      <Btn primary onClick={downloadPDF}>Download PDF</Btn>
      {cl?.phone && <WaBtn phone={cl.phone} msg={waReceipt(order, cl)} label="Send via WhatsApp" />}
      {cl?.phone && order.status !== "paid" && <WaBtn phone={cl.phone} msg={waPayment(order, cl)} label="Payment reminder" />}
    </div>
    <div style={{ maxWidth: 500, margin: "0 auto", background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 24 }}>
      <div style={{ textAlign: "center", borderBottom: "2px solid #C41E3A", paddingBottom: 12, marginBottom: 12 }}><div style={{ fontSize: 20, fontWeight: 900, color: "#C41E3A" }}>MEGA PG DISTRIBUTIONS</div><div style={{ fontSize: 11, color: "#777" }}>Authentic Mexican Candy • Northern California</div><div style={{ fontSize: 12, marginTop: 4 }}>José Flores • (707) 360-7420 • megapg.norcal@gmail.com</div></div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 12 }}><div><b>{cl?.name}</b>{cl?.address && <div style={{ color: "#777" }}>{cl.address}</div>}{cl?.phone && <div style={{ color: "#777" }}>{cl.phone}</div>}</div><div style={{ textAlign: "right" }}><b>#{order.id.slice(-6).toUpperCase()}</b><div style={{ color: "#777" }}>{fmtD(order.date)}</div><Badge text={order.status} color={ST_CLR[order.status]} /></div></div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}><thead><tr style={{ borderBottom: "2px solid #C41E3A" }}><th style={{ textAlign: "left", padding: "6px 0", color: "#C41E3A" }}>Product</th><th style={{ textAlign: "center", color: "#C41E3A" }}>Qty</th><th style={{ textAlign: "right", color: "#C41E3A" }}>Unit</th><th style={{ textAlign: "right", color: "#C41E3A" }}>Total</th></tr></thead><tbody>{order.items.map((it, i) => { const p = pF(it.productId); return <tr key={i} style={{ borderBottom: "1px solid #eee" }}><td style={{ padding: "6px 0" }}>{p?.name || it.productId}</td><td style={{ textAlign: "center" }}>{it.qty}</td><td style={{ textAlign: "right" }}>{fmt(p?.price)}</td><td style={{ textAlign: "right" }}>{fmt((p?.price || 0) * it.qty)}</td></tr>; })}</tbody></table>
      <div style={{ borderTop: "1px solid #ddd", paddingTop: 8, fontSize: 13 }}><div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span>Subtotal</span><span>{fmt(sub)}</span></div>{disc > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#1B7340" }}><span>Discount ({cl?.tier} {Math.round(disc * 100)}%)</span><span>-{fmt(sub * disc)}</span></div>}<div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "2px solid #C41E3A", marginTop: 4, fontSize: 18, fontWeight: 900, color: "#C41E3A" }}><span>TOTAL</span><span>{fmt(order.total)}</span></div></div>
      {order.notes && <div style={{ fontSize: 11, color: "#777", marginTop: 8, fontStyle: "italic" }}>Notes: {order.notes}</div>}
      <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "#999", borderTop: "1px solid #eee", paddingTop: 8 }}>Thank you! • megapgcandies.com • slapslollipop.com</div>
    </div></div>;
};

// ===== MARKET INTELLIGENCE =====
const BRAND_CLR = { "Mega PG": "#1B7340", "Pigüi USA": "#C41E3A", "Both": "#D35400", "Neither/Unknown": "#888" };

const FieldDashboard = ({ visits }) => {
  const total = visits.length;
  const withBrand = visits.filter(v => v.brand && v.brand !== "Neither/Unknown");
  const megaPG = visits.filter(v => v.brand === "Mega PG" || v.brand === "Both").length;
  const piguiUSA = visits.filter(v => v.brand === "Pigüi USA" || v.brand === "Both").length;
  const interested = visits.filter(v => v.interest === "Very interested" || v.interest === "Somewhat interested").length;
  const prices = visits.filter(v => v.publicPrice > 0).map(v => Number(v.publicPrice));
  const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const zones = ZONES.filter(z => z !== "Other").map(z => { const zv = visits.filter(v => v.zone === z); return { zone: z, total: zv.length, mega: zv.filter(v => v.brand === "Mega PG" || v.brand === "Both").length, pigui: zv.filter(v => v.brand === "Pigüi USA" || v.brand === "Both").length }; }).filter(z => z.total > 0);
  const supplierCounts = {}; visits.forEach(v => { if (v.supplier) supplierCounts[v.supplier] = (supplierCounts[v.supplier] || 0) + 1; });

  return <div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
      <Card title="Stores visited" value={total} color="#1A5276" />
      <Card title="Carry Mega PG" value={megaPG} sub={total > 0 ? `${Math.round(megaPG / total * 100)}%` : ""} color="#1B7340" />
      <Card title="Carry Pigüi USA" value={piguiUSA} sub={total > 0 ? `${Math.round(piguiUSA / total * 100)}%` : ""} color="#C41E3A" />
      <Card title="Interested" value={interested} sub={total > 0 ? `${Math.round(interested / total * 100)}%` : ""} color="#D35400" />
    </div>
    {avgPrice > 0 && <div style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>Avg public price: <b>{fmt(avgPrice)}</b>/bag across {prices.length} stores</div>}
    {zones.length > 0 && <><ST>Zone penetration</ST>{zones.map(z => <div key={z.zone} style={{ marginBottom: 8 }}><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{z.zone} <span style={{ color: "#999", fontWeight: 400 }}>({z.total} stores)</span></div><div style={{ display: "flex", height: 16, borderRadius: 4, overflow: "hidden", background: "#f0f0f0" }}>{z.mega > 0 && <div style={{ width: `${z.mega / z.total * 100}%`, background: "#1B7340" }} title={`Mega PG: ${z.mega}`} />}{z.pigui > 0 && <div style={{ width: `${z.pigui / z.total * 100}%`, background: "#C41E3A" }} title={`Pigüi USA: ${z.pigui}`} />}</div><div style={{ fontSize: 10, color: "#999", marginTop: 1 }}><span style={{ color: "#1B7340" }}>■ Mega PG: {z.mega}</span> <span style={{ color: "#C41E3A", marginLeft: 8 }}>■ Pigüi USA: {z.pigui}</span></div></div>)}</>}
    {Object.keys(supplierCounts).length > 0 && <><ST>Supplier channels</ST>{Object.entries(supplierCounts).sort((a, b) => b[1] - a[1]).map(([sup, cnt]) => <div key={sup} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}><span>{sup}</span><b>{cnt}</b></div>)}</>}
    {total === 0 && <div style={{ textAlign: "center", padding: 40, color: "#999" }}>No field visits yet. Go to "Visits" tab to start capturing data.</div>}
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

const FieldExport = ({ visits }) => {
  const exportVisits = () => {
    const lines = visits.map(v => [
      `STORE: ${v.storeName}`,
      `Zone: ${v.zone || "—"} | Type: ${v.storeType || "—"} | Date: ${fmtD(v.date)}`,
      `Contact: ${v.contact || "—"} | Phone: ${v.phone || "—"}`,
      `Address: ${v.address || "—"}`,
      `Brand on shelf: ${v.brand || "—"}`,
      `Products seen: ${v.productsSeen?.join(", ") || "—"}`,
      `Supplier: ${v.supplier || "—"} | Public price: ${v.publicPrice ? fmt(v.publicPrice) : "—"}`,
      `Interest: ${v.interest || "—"} | Foot traffic: ${v.footTraffic || "—"}`,
      `Left samples: ${v.leftSamples ? `Yes (${v.samplesQty || "?"})` : "No"}`,
      v.painPoints ? `Pain points: ${v.painPoints}` : null,
      v.competitorProducts ? `Competitors: ${v.competitorProducts}` : null,
      v.notes ? `Notes: ${v.notes}` : null,
      "─".repeat(50)
    ].filter(Boolean).join("\n")).join("\n\n");
    const header = `MEGA PG DISTRIBUTIONS — Field Intelligence Report\nExported: ${new Date().toLocaleString()}\nTotal visits: ${visits.length}\n${"═".repeat(50)}\n\n`;
    const blob = new Blob([header + lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `MegaPG_FieldData_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };
  return <div>
    <div style={{ background: "#EBF5FB", borderRadius: 8, padding: "16px 20px", marginBottom: 16, borderLeft: "4px solid #1A5276" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1A5276", marginBottom: 6 }}>Export field data for AI analysis</div>
      <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>Download your visit data as a text file, then upload it to Claude for a full intelligence report — pricing analysis, competitive map, and follow-up plan. Free and with full context of your business.</div>
    </div>
    <Btn primary onClick={exportVisits} disabled={visits.length === 0}>Export {visits.length} visit{visits.length !== 1 ? "s" : ""} for analysis</Btn>
    {visits.length === 0 && <p style={{ color: "#999", fontSize: 12, marginTop: 8 }}>Add visits first in the Visits tab.</p>}
    {visits.length > 0 && <div style={{ marginTop: 16 }}><ST>Preview ({visits.length} visits)</ST>{visits.slice(-5).reverse().map(v => <div key={v.id} style={{ padding: "6px 0", borderBottom: "1px solid #f0f0f0", fontSize: 12 }}><b>{v.storeName}</b> <span style={{ color: "#999" }}>{v.zone} • {fmtD(v.date)}</span> {v.brand && <Badge text={v.brand} color={BRAND_CLR[v.brand] || "#888"} />} {v.interest && <Badge text={v.interest} color={v.interest.includes("Very") ? "#1B7340" : "#D35400"} />}</div>)}{visits.length > 5 && <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>...and {visits.length - 5} more</div>}</div>}
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
    return `Hola ${r.c.contact || r.c.name},\n\nSoy José de Mega PG Distributions. Noté que han pasado ${r.daysSince} días desde tu último pedido (${fmtD(r.lastO.date)} por ${fmt(r.lastO.total)}) y quería saber cómo estás.\n\n¿Todo bien con el inventario? Tenemos stock fresco de ${prodText} listo para entrega en tu zona.\n\nSi quieres te armo un pedido y lo entrego esta semana.\n\nGracias,\nJosé — (707) 360-7420`;
  };

  // Mensaje tono PROACTIVO (próximos)
  const msgProximo = (r) => {
    const prodText = r.topProds.length > 0 ? r.topProds.join(" y ") : "Slaps Lollipops";
    return `Hola ${r.c.contact || r.c.name},\n\nSoy José de Mega PG. Pasando a saludar y ver cómo vas de inventario de ${prodText} — por lo general reordenas cada ${r.cycle} días más o menos.\n\nTenemos stock fresco listo. Si quieres te armo el pedido ahora y lo entrego esta semana para que no te quedes corto.\n\nAvísame,\nJosé — (707) 360-7420`;
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

export default function App() {
  const saved = S.load();
  const initData = saved?.init ? saved : { clients: [], orders: [], inventory: [], purchases: [], visits: [], reminders: {}, init: true };
  if (!saved?.init) S.save(initData);
  // Migrate: add visits if missing from old save
  if (!initData.visits) initData.visits = [];
  // Migrate: add reminders if missing from old save
  if (!initData.reminders) initData.reminders = {};

  const [tab, setTab] = useState("dashboard");
  const [clients, setClients] = useState(initData.clients);
  const [orders, setOrders] = useState(initData.orders);
  const [inventory, setInventory] = useState(initData.inventory);
  const [purchases, setPurchases] = useState(initData.purchases);
  const [visits, setVisits] = useState(initData.visits);
  const [reminders, setReminders] = useState(initData.reminders);
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
    const backup = { ...stateRef.current, init: true, exportDate: new Date().toISOString(), version: "v5.1" };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `MegaPG_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };
  const importData = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.clients && !parsed.orders && !parsed.visits) return;
        const data = { clients: parsed.clients || [], orders: parsed.orders || [], inventory: parsed.inventory || [], purchases: parsed.purchases || [], visits: parsed.visits || [], reminders: parsed.reminders || {} };
        stateRef.current = data; S.save({ ...data, init: true });
        setClients(data.clients); setOrders(data.orders); setInventory(data.inventory); setPurchases(data.purchases); setVisits(data.visits); setReminders(data.reminders);
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

  const tabs = [{ id: "dashboard", l: "Dashboard" },{ id: "clients", l: `Clients (${clients.length})` },{ id: "orders", l: `Orders (${orders.length})` },{ id: "reorder", l: `Recordatorios${reorderPending > 0 ? ` (${reorderPending})` : ""}` },{ id: "inventory", l: "Inventory" },{ id: "purchases", l: "Purchases" },{ id: "reports", l: "P&L" },{ id: "receipt", l: "Receipt" },{ id: "field", l: "Field Intel" },{ id: "visits", l: `Visits (${visits.length})` },{ id: "analysis", l: "Export Intel" }];
  return <div style={{ fontFamily: "Arial,sans-serif", maxWidth: "100%", padding: "8px 12px" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 20, fontWeight: 900, color: "#C41E3A" }}>MEGA PG</span><span style={{ fontSize: 13, color: "#888" }}>CRM v5.1</span>
        <button onClick={exportData} style={{ fontSize: 10, color: "#1A5276", background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>Export</button>
        <button onClick={() => importRef.current?.click()} style={{ fontSize: 10, color: "#1A5276", background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>Import</button>
        <input ref={importRef} type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
        <button onClick={() => { if (resetRef.current === "clear") { const empty = { clients: [], orders: [], inventory: [], purchases: [], visits: [], reminders: {} }; stateRef.current = empty; S.save({ ...empty, init: true }); setClients([]); setOrders([]); setInventory([]); setPurchases([]); setVisits([]); setReminders({}); setTab("dashboard"); resetRef.current = null; setResetConf(null); } else { resetRef.current = "clear"; setResetConf("clear"); setTimeout(() => { if (resetRef.current === "clear") { resetRef.current = null; setResetConf(null); } }, 3000); } }} style={{ fontSize: 10, color: resetConf === "clear" ? "#fff" : "#C41E3A", background: resetConf === "clear" ? "#C41E3A" : "none", border: "1px solid #ddd", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>{resetConf === "clear" ? "Sure?" : "Clear all"}</button></div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "5px 11px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", background: tab === t.id ? "#C41E3A" : "transparent", color: tab === t.id ? "#fff" : "#666" }}>{t.l}</button>)}</div></div>
    <div style={{ borderTop: "2px solid #C41E3A", paddingTop: 14 }}>
      {tab === "dashboard" && <Dashboard clients={clients} orders={orders} inventory={inventory} purchases={purchases} />}
      {tab === "clients" && <Clients clients={clients} setClients={setClients} orders={orders} saveAll={sv} />}
      {tab === "orders" && <Orders clients={clients} orders={orders} setOrders={setOrders} inventory={inventory} setInventory={setInventory} saveAll={sv} setTab={setTab} setRO={setRo} />}
      {tab === "reorder" && <Reorders clients={clients} orders={orders} reminders={reminders} setReminders={setReminders} saveAll={sv} />}
      {tab === "inventory" && <Inventory inventory={inventory} setInventory={setInventory} orders={orders} saveAll={sv} />}
      {tab === "purchases" && <Purchases purchases={purchases} setPurchases={setPurchases} inventory={inventory} setInventory={setInventory} saveAll={sv} />}
      {tab === "reports" && <Reports orders={orders} clients={clients} purchases={purchases} />}
      {tab === "receipt" && <Receipt order={ro} clients={clients} />}
      {tab === "field" && <FieldDashboard visits={visits} />}
      {tab === "visits" && <><div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><Btn primary onClick={() => { setEditVisit(null); setShowVisitForm(true); }}>+ New visit</Btn></div><VisitsList visits={visits} onEdit={v => { setEditVisit(v); setShowVisitForm(true); }} onDelete={deleteVisit} /></>}
      {tab === "analysis" && <FieldExport visits={visits} />}
    </div>
    {showVisitForm && <VisitForm onSave={saveVisit} onClose={() => { setShowVisitForm(false); setEditVisit(null); }} editVisit={editVisit} />}
  </div>;
}
