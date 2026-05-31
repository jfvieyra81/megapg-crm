// src/components/Reorders.tsx
//
// Recordatorios de reorden: detecta clientes vencidos (ya pasaron su ciclo de
// reorden estimado) y próximos (llegarán al ciclo en ANTICIPATION_DAYS), con
// cooldown tras "Marcar enviado". Genera mensajes de tono recuperación o
// proactivo. Extraído de App.tsx.
//
// `reminders`, `setReminders`, `saveAll` y `calcClientCycle` se inyectan como
// props desde App.tsx (mismo patrón que Reports/Inventory con calcWeeks).
// Constantes (TIER_CLR, REMINDER_COOLDOWN_DAYS, etc.) y dSince están
// duplicados inline — misma deuda técnica aceptada que en el resto.

import React, { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Client, Order, ClientTier } from "../types/domain";
import { pF } from "../lib/catalog";
import { Badge, Btn, Card, ST } from "./ui";
import { WaBtn } from "../lib/whatsapp";
import { fmt, fmtD } from "../lib/format";

// ============================================================
// Constantes y helpers locales (duplicación temporal con App.tsx)
// ============================================================

const TIER_CLR: Record<ClientTier, string> = { Lista: "#888", Bronce: "#996633", Plata: "#1A5276", Oro: "#1B7340" };

const REMINDER_COOLDOWN_DAYS = 7;
const DEFAULT_REORDER_CYCLE = 30;
const URGENT_OVERDUE_DAYS = 7;
const ANTICIPATION_DAYS = 5;

const dSince = (d: string | number | Date): number => {
  try { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); } catch { return 999; }
};

// ============================================================
// Reorders
// ============================================================

type Reminders = Record<string, { lastSent: string; daysOverdue: number }>;

interface ReorderRow {
  c: Client;
  lastO: Order;
  daysSince: number;
  cycle: number;
  overdue: number;
  inCooldown: boolean;
  dsReminder: number;
  topProds: string[];
  orderCount: number;
}

interface ReordersProps {
  clients: Client[];
  orders: Order[];
  reminders: Reminders;
  setReminders: Dispatch<SetStateAction<Reminders>>;
  saveAll: (type: string, data: unknown) => void;
  calcClientCycle: (clientOrders: Order[]) => number;
}

export const Reorders: React.FC<ReordersProps> = ({ clients, orders, reminders, setReminders, saveAll, calcClientCycle }) => {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const rows: ReorderRow[] = clients.map(c => {
    const co = orders.filter(o => o.clientId === c.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (co.length === 0) return null;
    const lastO = co[0];
    const daysSince = dSince(lastO.date);
    const cycle = calcClientCycle(co);
    const overdue = daysSince - cycle; // positive = vencido, negative = próximo
    const lastReminder = reminders[c.id]?.lastSent;
    const dsReminder = lastReminder ? dSince(lastReminder) : 999;
    const inCooldown = dsReminder < REMINDER_COOLDOWN_DAYS;
    const prodCount: Record<string, number> = {};
    co.forEach(o => o.items.forEach(it => { prodCount[it.productId] = (prodCount[it.productId] || 0) + it.qty; }));
    const topProds = Object.entries(prodCount).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([pid]) => pF(pid)?.name).filter((n): n is string => Boolean(n));
    return { c, lastO, daysSince, cycle, overdue, inCooldown, dsReminder, topProds, orderCount: co.length };
  }).filter((r): r is ReorderRow => r !== null);

  // Vencidos: ya pasó el ciclo. Próximos: faltan 1..ANTICIPATION_DAYS para el ciclo.
  const vencidos = rows.filter(r => r.overdue >= 0 && !r.inCooldown).sort((a, b) => b.overdue - a.overdue);
  const proximos = rows.filter(r => r.overdue < 0 && r.overdue >= -ANTICIPATION_DAYS && !r.inCooldown).sort((a, b) => b.overdue - a.overdue);
  const cooldown = rows.filter(r => r.inCooldown && (r.overdue >= -ANTICIPATION_DAYS));

  // Mensaje tono RECUPERACIÓN (vencidos)
  const msgVencido = (r: ReorderRow) => {
    const prodText = r.topProds.length > 0 ? r.topProds.join(" y ") : "Slaps Lollipops";
    return `Hola ${r.c.contact || r.c.name},\n\nSoy José de Dulce Sabor. Noté que han pasado ${r.daysSince} días desde tu último pedido (${fmtD(r.lastO.date)} por ${fmt(r.lastO.total)}) y quería saber cómo estás.\n\n¿Todo bien con el inventario? Tenemos stock fresco de ${prodText} listo para entrega en tu zona.\n\nSi quieres te armo un pedido y lo entrego esta semana. También puedes ordenar directo en https://dulcesaborca.com\n\nGracias,\nJosé — (707) 360-7420`;
  };

  // Mensaje tono PROACTIVO (próximos)
  const msgProximo = (r: ReorderRow) => {
    const prodText = r.topProds.length > 0 ? r.topProds.join(" y ") : "Slaps Lollipops";
    return `Hola ${r.c.contact || r.c.name},\n\nSoy José de Dulce Sabor. Pasando a saludar y ver cómo vas de inventario de ${prodText} — por lo general reordenas cada ${r.cycle} días más o menos.\n\nTenemos stock fresco listo. Si quieres te armo el pedido ahora y lo entrego esta semana para que no te quedes corto. También puedes ordenar directo en https://dulcesaborca.com\n\nAvísame,\nJosé — (707) 360-7420`;
  };

  const defaultMsg = (r: ReorderRow) => r.overdue >= 0 ? msgVencido(r) : msgProximo(r);
  const getMsg = (r: ReorderRow) => edits[r.c.id] ?? defaultMsg(r);

  const copyMsg = async (r: ReorderRow) => {
    try {
      await navigator.clipboard.writeText(getMsg(r));
      setCopied(r.c.id);
      setTimeout(() => setCopied(null), 2000);
    } catch { alert("Copy falló — selecciona el texto manualmente"); }
  };

  const markSent = (r: ReorderRow) => {
    const updated = { ...reminders, [r.c.id]: { lastSent: new Date().toISOString(), daysOverdue: r.overdue } };
    setReminders(updated); saveAll("reminders", updated);
  };

  const resetCooldown = (clientId: string) => {
    const updated = { ...reminders };
    delete updated[clientId];
    setReminders(updated); saveAll("reminders", updated);
  };

  const urgColor = (overdue: number) => overdue >= URGENT_OVERDUE_DAYS ? "#C41E3A" : "#D35400";

  // Render as function (not component) to avoid remount on every keystroke that would kill textarea focus
  const renderRow = (r: ReorderRow, kind: "vencido" | "proximo") => {
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
