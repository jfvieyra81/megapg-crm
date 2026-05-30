// src/components/PostDelivery.tsx
//
// Seguimiento post-entrega: pedidos entregados/pagados dentro de la ventana
// de follow-up (POSTDEL_MIN_DAYS..POSTDEL_MAX_DAYS) que aún no tienen
// seguimiento registrado. Permite copiar/editar un mensaje y marcar enviado.
// Extraído de App.tsx.
//
// `followups`, `setFollowups` y `saveAll` se inyectan como props desde
// App.tsx (mismo patrón que Reorders / Clients). Constantes (TIER_CLR,
// POSTDEL_*) y el helper dSince están duplicados inline — misma deuda
// técnica aceptada que en el resto de componentes ya extraídos.

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

const POSTDEL_MIN_DAYS = 3;     // Earliest: give client time to actually sell product
const POSTDEL_MAX_DAYS = 21;    // Latest: after this, reorder reminder takes over
const POSTDEL_URGENT_DAYS = 14; // "Last chance" threshold

const dSince = (d: string | number | Date): number => {
  try { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); } catch { return 999; }
};

// ============================================================
// PostDelivery
// ============================================================

type Followups = Record<string, { sentAt: string; clientId: string }>;

interface PostDeliveryRow {
  order: Order;
  client: Client;
  daysSince: number;
  topProd: string | null | undefined;
  totalCases: number;
}

interface PostDeliveryProps {
  clients: Client[];
  orders: Order[];
  followups: Followups;
  setFollowups: Dispatch<SetStateAction<Followups>>;
  saveAll: (type: string, data: unknown) => void;
}

export const PostDelivery: React.FC<PostDeliveryProps> = ({ clients, orders, followups, setFollowups, saveAll }) => {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  // Build rows from delivered/paid orders within the follow-up window, excluding already-followed-up
  const rows: PostDeliveryRow[] = orders
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
    .filter((r): r is PostDeliveryRow => r !== null)
    .sort((a, b) => b.daysSince - a.daysSince); // Most urgent (oldest delivery) first

  const ready = rows.filter(r => r.daysSince < POSTDEL_URGENT_DAYS);
  const urgent = rows.filter(r => r.daysSince >= POSTDEL_URGENT_DAYS);

  const defaultMsg = (r: PostDeliveryRow) => {
    const prodText = r.topProd || "tu pedido";
    return `Hola ${r.client.contact || r.client.name},\n\nSoy José de Dulce Sabor. Pasé a saludar y ver cómo te va con el pedido del ${fmtD(r.order.date)} — ${prodText}.\n\n¿Cómo está saliendo? ¿La gente lo está aceptando bien? Me interesa saber qué tal va para poder ayudarte mejor.\n\nSi necesitas reorden, quieres probar algún producto nuevo, o tienes cualquier duda, avísame. También puedes ordenar en línea: https://dulcesaborca.com\n\nGracias por la confianza,\nJosé — (707) 360-7420`;
  };

  const getMsg = (r: PostDeliveryRow) => edits[r.order.id] ?? defaultMsg(r);

  const copyMsg = async (r: PostDeliveryRow) => {
    try {
      await navigator.clipboard.writeText(getMsg(r));
      setCopied(r.order.id);
      setTimeout(() => setCopied(null), 2000);
    } catch { alert("Copy falló — selecciona el texto manualmente"); }
  };

  const markSent = (r: PostDeliveryRow) => {
    const updated = { ...followups, [r.order.id]: { sentAt: new Date().toISOString(), clientId: r.client.id } };
    setFollowups(updated);
    saveAll("followups", updated);
  };

  const renderRow = (r: PostDeliveryRow) => {
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
