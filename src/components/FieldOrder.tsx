// src/components/FieldOrder.tsx
// =============================================================================
// FieldOrder — captura rápida de pedidos en campo (para el rep en la tienda).
//
// Flujo móvil de 3 toques: elige cliente → suma productos con steppers −/+ →
// guarda. Produce un Order normal (status "pending") y descuenta inventario
// usando EXACTAMENTE la misma lógica que Orders.tsx (lib/business/orders.ts),
// así que recibos, comisiones y P&L lo toman sin distinción. La comisión se
// liga sola por client.representativeId.
//
// Online-only (Fase 1). La captura offline + sync queda como fase aparte.
// =============================================================================

import { useState } from "react";
import type { Client, Order, SaleUnit } from "../types/domain";
import { PRODUCTS, TIER_DISC, unitPrice, bagEnabled, type InventoryItem } from "../lib/catalog";
import {
  type DraftItem,
  buildOrder,
  applyInventory,
  stockWarnings,
  orderTotal,
} from "../lib/business/orders";
import { fmt, fmtPct } from "../lib/format";
import { WaBtn, waOrder } from "../lib/whatsapp";
import { Btn, Badge, Inp } from "./ui";

const TIER_CLR: Record<string, string> = { Lista: "#888", Bronce: "#996633", Plata: "#1A5276", Oro: "#1B7340" };

interface FieldOrderProps {
  clients: Client[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  saveAll: (type: string, data: unknown) => void;
  representativeId: string | null;
  setTab: (tab: string) => void;
  setRO: (order: Order | null) => void;
}

type Line = { qty: number; unit: SaleUnit };

export const FieldOrder = ({
  clients,
  setOrders,
  inventory,
  setInventory,
  saveAll,
  representativeId,
  setTab,
  setRO,
}: FieldOrderProps) => {
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [showAllClients, setShowAllClients] = useState(!representativeId);
  const [draft, setDraft] = useState<Record<string, Line>>({});
  const [prodSearch, setProdSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [stockAck, setStockAck] = useState(false);
  const [saved, setSaved] = useState<Order | null>(null);

  const cl = clients.find(c => c.id === clientId);
  const disc = cl ? TIER_DISC[cl.tier] || 0 : 0;

  const draftItems: DraftItem[] = Object.entries(draft)
    .filter(([, v]) => v.qty > 0)
    .map(([productId, v]) => ({ productId, qty: v.qty, unit: v.unit }));
  const total = orderTotal(draftItems, disc);
  const itemCount = draftItems.length;
  const warnings = stockWarnings(draftItems, inventory);

  // --- Stepper handlers (qty 0 = no incluido; nunca borramos la llave) ---
  const setQty = (productId: string, qty: number) =>
    setDraft(d => {
      const cur = d[productId] || { qty: 0, unit: "case" as SaleUnit };
      return { ...d, [productId]: { ...cur, qty: Math.max(0, qty) } };
    });
  const bump = (productId: string, delta: number) =>
    setQty(productId, (draft[productId]?.qty || 0) + delta);
  const setUnit = (productId: string, unit: SaleUnit) =>
    setDraft(d => {
      const cur = d[productId] || { qty: 0, unit: "case" as SaleUnit };
      return { ...d, [productId]: { ...cur, unit } };
    });

  // --- Lista de clientes (scope por rep + búsqueda) ---
  const scoped =
    showAllClients || !representativeId
      ? clients
      : clients.filter(c => c.representativeId === representativeId);
  const q = clientSearch.trim().toLowerCase();
  const clientMatches = (q
    ? scoped.filter(c => `${c.name} ${c.contact || ""} ${c.zone || ""}`.toLowerCase().includes(q))
    : scoped
  ).slice(0, 40);

  // --- Lista de productos (búsqueda) ---
  const pq = prodSearch.trim().toLowerCase();
  const prodMatches = pq
    ? PRODUCTS.filter(p => `${p.name} ${p.sku}`.toLowerCase().includes(pq))
    : PRODUCTS;

  const save = () => {
    if (!clientId || draftItems.length === 0) return;
    if (warnings.length > 0 && !stockAck) {
      setStockAck(true);
      return;
    }
    const order = buildOrder({
      clientId,
      date: new Date().toISOString().slice(0, 10),
      notes,
      status: "pending",
      items: draftItems,
      disc,
    });
    const ni = applyInventory(inventory, order.items);
    setOrders(prev => {
      const n = [...prev, order];
      saveAll("orders", n);
      return n;
    });
    setInventory(ni);
    saveAll("inventory", ni);
    setSaved(order);
    setStockAck(false);
  };

  const reset = () => {
    setSaved(null);
    setDraft({});
    setNotes("");
    setStockAck(false);
    setClientId("");
    setClientSearch("");
    setProdSearch("");
  };

  // ============================================================
  // SUCCESS VIEW (después de guardar)
  // ============================================================
  if (saved) {
    const lang = cl?.language === "en" ? "en" : "es";
    return (
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ background: "#E8F5E8", border: "1px solid #1B7340", borderRadius: 10, padding: "20px 22px", textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 30, marginBottom: 6 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1B7340" }}>Pedido guardado</div>
          <div style={{ fontSize: 13, color: "#333", marginTop: 6 }}>
            {cl?.name} · {itemCount} producto{itemCount !== 1 ? "s" : ""} · <b>{fmt(saved.total)}</b>
          </div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>Pedido #{saved.id.slice(-6).toUpperCase()} · pendiente</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cl?.phone
            ? <WaBtn phone={cl.phone} msg={waOrder(saved, cl, lang)} label="Enviar pedido por WhatsApp" />
            : <div style={{ fontSize: 12, color: "#999", textAlign: "center" }}>Este cliente no tiene teléfono para WhatsApp.</div>}
          <Btn onClick={() => { setRO(saved); setTab("receipt"); }}>Ver recibo</Btn>
          <Btn primary onClick={reset}>+ Nuevo pedido</Btn>
        </div>
      </div>
    );
  }

  // ============================================================
  // ENTRY VIEW
  // ============================================================
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 96 }}>
      <div style={{ background: "#FDEEF0", borderRadius: 8, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #C41E3A" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#C41E3A", marginBottom: 4 }}>Pedido en campo</div>
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>Captura rápida en la tienda: elige el cliente, suma productos con −/+, y guarda. Queda como pedido pendiente y descuenta inventario igual que Orders.</div>
      </div>

      {/* 1. CLIENTE */}
      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 8 }}>1. Cliente</label>
        {cl ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#333" }}>
                {cl.name} <Badge text={cl.tier} color={TIER_CLR[cl.tier] || "#888"} />
                {disc > 0 && <Badge text={`−${fmtPct(disc)}`} color="#1B7340" />}
              </div>
              <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>{cl.contact || "—"} · {cl.phone || "sin teléfono"} · {cl.zone || "—"}</div>
            </div>
            <Btn small onClick={() => setClientId("")}>Cambiar</Btn>
          </div>
        ) : (
          <>
            {representativeId && (
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <Btn small primary={!showAllClients} onClick={() => setShowAllClients(false)}>Mis clientes</Btn>
                <Btn small primary={showAllClients} onClick={() => setShowAllClients(true)}>Todos</Btn>
              </div>
            )}
            <Inp label="" value={clientSearch} onChange={(v: string) => setClientSearch(v)} placeholder="Buscar cliente..." />
            <div style={{ marginTop: 8, maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {clientMatches.length === 0 && (
                <div style={{ fontSize: 12, color: "#999", padding: "10px 4px" }}>
                  {scoped.length === 0 && representativeId
                    ? "No tienes clientes asignados — toca \"Todos\"."
                    : "Ningún cliente coincide."}
                </div>
              )}
              {clientMatches.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setClientId(c.id); setClientSearch(""); }}
                  style={{ textAlign: "left", background: "#fafafa", border: "1px solid #eee", borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>
                    {c.name} <Badge text={c.tier} color={TIER_CLR[c.tier] || "#888"} />
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{c.zone || "—"} · {c.phone || "sin teléfono"}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 2. PRODUCTOS (solo con cliente elegido) */}
      {cl && (
        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 8 }}>2. Productos</label>
          <Inp label="" value={prodSearch} onChange={(v: string) => setProdSearch(v)} placeholder="Buscar producto..." />
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {prodMatches.map(p => {
              const line = draft[p.id] || { qty: 0, unit: "case" as SaleUnit };
              const active = line.qty > 0;
              const canBag = bagEnabled(p);
              const unitNow: SaleUnit = canBag ? line.unit : "case";
              const uPrice = unitPrice(p, unitNow) * (1 - disc);
              return (
                <div key={p.id} style={{ background: active ? "#F1F8F1" : "#fafafa", border: `1px solid ${active ? "#BFE3BF" : "#eee"}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>
                        {fmt(uPrice)}/{unitNow === "bag" ? "bolsa" : "caja"}
                        {active && <> · línea <b style={{ color: "#1B7340" }}>{fmt(uPrice * line.qty)}</b></>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => bump(p.id, -1)} style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer", color: "#666" }}>−</button>
                      <input
                        value={line.qty}
                        onChange={e => setQty(p.id, parseInt(e.target.value) || 0)}
                        inputMode="numeric"
                        style={{ width: 46, height: 34, textAlign: "center", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, fontWeight: 700 }}
                      />
                      <button onClick={() => bump(p.id, 1)} style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #1B7340", background: "#1B7340", color: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer" }}>+</button>
                    </div>
                  </div>
                  {canBag && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button onClick={() => setUnit(p.id, "case")} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12, cursor: "pointer", border: `1px solid ${unitNow === "case" ? "#1A5276" : "#ddd"}`, background: unitNow === "case" ? "#1A5276" : "#fff", color: unitNow === "case" ? "#fff" : "#666" }}>Caja</button>
                      <button onClick={() => setUnit(p.id, "bag")} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12, cursor: "pointer", border: `1px solid ${unitNow === "bag" ? "#1A5276" : "#ddd"}`, background: unitNow === "bag" ? "#1A5276" : "#fff", color: unitNow === "bag" ? "#fff" : "#666" }}>Bolsa</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12 }}>
            <Inp label="Notas (opcional)" value={notes} onChange={(v: string) => setNotes(v)} placeholder="Entrega, instrucciones..." />
          </div>
        </div>
      )}

      {/* TOTAL + GUARDAR */}
      {cl && (
        <div style={{ position: "sticky", bottom: 0, background: "#fff", borderTop: "1px solid #eee", paddingTop: 10 }}>
          {warnings.length > 0 && (
            <div style={{ background: "#FFF3CD", border: "1px solid #FFE69C", borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 12, color: "#8A6D3B" }}>
              <b>Stock bajo:</b>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              {stockAck && <div style={{ marginTop: 4, fontWeight: 600 }}>Toca "Guardar" otra vez para confirmar de todos modos.</div>}
            </div>
          )}
          <div style={{ background: "#E8F5E8", border: "1px solid #1B7340", borderRadius: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: "#1B7340", fontWeight: 600 }}>{itemCount} producto{itemCount !== 1 ? "s" : ""}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#1B7340" }}>{fmt(total)}</div>
            </div>
            <Btn primary onClick={save} disabled={itemCount === 0}>
              {warnings.length > 0 && stockAck ? "Guardar de todos modos" : "Guardar pedido"}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
};
