// src/components/Dashboard.tsx
//
// Dashboard principal del CRM: métricas globales (revenue, profit, cases,
// pending, stock), panel "Action needed" (clientes sin pedido reciente +
// stock bajo/agotado), top clientes por ganancia, velocidad de producto y
// pedidos recientes. Extraído de App.tsx.
//
// `calcWeeks` se inyecta como prop desde App.tsx, igual que ya se hace con
// Inventory y Reports (vive inline en App.tsx y no se modularizó).
//
// Constantes (TIER_CLR, LOW, FOLLOWUP_DAYS) y el helper dSince están
// duplicados inline. Misma deuda técnica aceptada que en Clients.tsx /
// Welcomes.tsx / Field.tsx; se limpia cuando se centralicen en un módulo.

import React from "react";
import type { Client, Order, ClientTier } from "../types/domain";
import type { InventoryItem } from "../lib/catalog";
import { PRODUCTS, pF, ST_CLR, itemCost } from "../lib/catalog";
import { Badge, Card, ST } from "./ui";
import { WaBtn } from "../lib/whatsapp";
import { fmt, fmtD } from "../lib/format";

// ============================================================
// Constantes y helpers locales (duplicación temporal con App.tsx)
// ============================================================

const TIER_CLR: Record<ClientTier, string> = { Lista: "#888", Bronce: "#996633", Plata: "#1A5276", Oro: "#1B7340" };
const LOW = 5;
const FOLLOWUP_DAYS = 21;

const dSince = (d: string | number | Date): number => {
  try { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); } catch { return 999; }
};

// ============================================================
// Dashboard
// ============================================================

interface DashboardProps {
  clients: Client[];
  orders: Order[];
  inventory: InventoryItem[];
  calcWeeks: (orders: Order[]) => number;
}

export const Dashboard: React.FC<DashboardProps> = ({ clients, orders, inventory, calcWeeks }) => {
  const tRev = orders.reduce((s, o) => s + (o.total || 0), 0);
  const tCost = orders.reduce((s, o) => s + o.items.reduce((a, it) => a + itemCost(it) * it.qty, 0), 0);
  const gP = tRev - tCost;
  const tCases = orders.reduce((s, o) => s + o.items.reduce((a, it) => a + it.qty, 0), 0);
  const tStock = inventory.reduce((s, it) => s + it.stock, 0);
  const pend = orders.filter(o => o.status !== "paid").reduce((s, o) => s + (o.total || 0), 0);
  // FIX #4: Usar semanas reales en vez de /4 hardcodeado
  const weeks = calcWeeks(orders);
  const stale = clients.map(c => { const co = orders.filter(o => o.clientId === c.id); const last = co.length > 0 ? co.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null; return { ...c, lastD: last?.date, ds: last ? dSince(last.date) : 999, oc: co.length, ts: co.reduce((s, o) => s + (o.total || 0), 0) }; }).filter(c => c.oc > 0 && c.ds > FOLLOWUP_DAYS).sort((a, b) => b.ds - a.ds);
  const lowS = inventory.filter(i => i.stock > 0 && i.stock <= LOW).map(i => ({ ...i, p: pF(i.productId) }));
  const outS = inventory.filter(i => i.stock === 0).map(i => ({ ...i, p: pF(i.productId) }));
  const cProf = clients.map(c => { const co = orders.filter(o => o.clientId === c.id); const r = co.reduce((s, o) => s + (o.total || 0), 0); const ct = co.reduce((s, o) => s + o.items.reduce((a, it) => a + itemCost(it) * it.qty, 0), 0); return { name: c.name, tier: c.tier, r, prof: r - ct, oc: co.length }; }).filter(c => c.oc > 0).sort((a, b) => b.prof - a.prof);
  // FIX #4: Velocidad semanal con semanas reales
  const pVel = PRODUCTS.map(p => { const sold = orders.reduce((s, o) => s + o.items.filter(it => it.productId === p.id).reduce((a, it) => a + it.qty, 0), 0); const st = inventory.find(i => i.productId === p.id)?.stock || 0; const wr = weeks > 0 ? Math.round(sold / weeks * 10) / 10 : 0; const wk = wr > 0 ? Math.round(st / wr * 10) / 10 : st > 0 ? 99 : 0; return { ...p, sold, st, wr, wk }; }).sort((a, b) => b.sold - a.sold);
  return <div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}><Card title="Revenue" value={fmt(tRev)} color="#1B7340" /><Card title="Gross profit" value={fmt(gP)} sub={tRev > 0 ? `${Math.round(gP / tRev * 100)}% margin` : ""} color="#1B7340" /><Card title="Cases sold" value={tCases} color="#1A5276" /><Card title="Pending $" value={fmt(pend)} color={pend > 0 ? "#C41E3A" : "#1B7340"} /><Card title="In stock" value={`${tStock} cases`} color="#6C3483" /></div>
    {(stale.length > 0 || lowS.length > 0 || outS.length > 0) && <div style={{ background: "#FDF2E9", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #D35400" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#D35400", marginBottom: 6 }}>Action needed</div>{outS.map(i => <div key={i.productId} style={{ fontSize: 12, padding: "2px 0", color: "#C41E3A" }}>OUT: <b>{i.p?.name}</b></div>)}{lowS.map(i => <div key={i.productId} style={{ fontSize: 12, padding: "2px 0", color: "#D35400" }}>LOW: <b>{i.p?.name}</b> — {i.stock} left</div>)}{stale.slice(0, 5).map(c => {
      const lastO = orders.filter(o => o.clientId === c.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      return <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
        <span style={{ fontSize: 12, color: "#996633", flex: 1 }}>FOLLOW UP: <b>{c.name}</b> — {c.ds} days since last order</span>
        {c.phone && <WaBtn phone={c.phone} msg={`Hola ${c.contact || c.name},\n\nSoy José de Dulce Sabor. Pasando a saludar — noté que ha pasado un tiempo desde tu último pedido.\n\nTenemos stock fresco de Slaps Lollipops y todos tus favoritos listos para entrega. ¿Quieres que te arme un pedido?\n\nTu último pedido fue ${lastO ? fmtD(lastO.date) : "hace un tiempo"}${lastO ? ` por ${fmt(lastO.total)}` : ""}.\n\nTambién puedes ordenar en línea: https://dulcesaborca.com\n\n¡Avísame!\nJosé — (707) 360-7420`} label="Follow up" small />}
      </div>; })}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}><div><ST>Top clients by profit</ST>{cProf.slice(0, 6).map((c, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}><div><b>{c.name}</b> <Badge text={c.tier} color={TIER_CLR[c.tier]} /></div><div><span style={{ color: "#1B7340", fontWeight: 700 }}>{fmt(c.prof)}</span><span style={{ color: "#999", marginLeft: 6 }}>{c.oc} ord</span></div></div>)}</div><div><ST>Product velocity <span style={{ fontSize: 11, fontWeight: 400, color: "#999" }}>({Math.round(weeks)}wk span)</span></ST>{pVel.slice(0, 8).map(p => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0", fontSize: 12 }}><span>{p.name}</span><div style={{ display: "flex", gap: 10 }}><span>{p.sold} sold</span><span style={{ color: "#777" }}>{p.wr}/wk</span><span style={{ color: p.st === 0 ? "#C41E3A" : p.st <= LOW ? "#D35400" : "#1B7340", fontWeight: 600 }}>{p.st} stock</span>{p.wk < 3 && p.wk > 0 && <Badge text={`${p.wk}wk left`} color="#C41E3A" />}</div></div>)}</div></div>
    <ST>Recent orders</ST>{orders.slice(-6).reverse().map(o => { const cl = clients.find(c => c.id === o.clientId); const cost = o.items.reduce((a, it) => a + itemCost(it) * it.qty, 0); return <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}><div><b>{cl?.name || "?"}</b> <span style={{ color: "#999" }}>{fmtD(o.date)}</span></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><b>{fmt(o.total)}</b><span style={{ color: "#1B7340", fontSize: 11 }}>+{fmt((o.total || 0) - cost)}</span><Badge text={o.status} color={ST_CLR[o.status]} /></div></div>; })}
  </div>;
};
