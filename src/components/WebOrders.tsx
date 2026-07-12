// src/components/WebOrders.tsx
//
// Web Inbox: pedidos recibidos desde dulcesaborca.com (tabla Supabase
// `web_orders`). Permite Importar al CRM (crea/reusa cliente, crea la orden,
// descuenta inventario y marca el web_order como importado), Confirmar al
// cliente (copia un mensaje de WhatsApp) o Ignorar.
//
// Extraído de App.tsx en el Block 4.h del refactor (May 2026).
//
// Acceso a Supabase inyectado como prop `supa` ({ enabled, url, key, headers }):
// el cluster module-level (cloudEnabled/SUPA_URL/KEY/HEADERS) sigue en App.tsx
// porque lo usan ~12 sitios mas (uploads, sync, auth). Centralizarlo en
// lib/supabase.ts es un bloque futuro aislado (misma deuda que Clients.tsx).
//
// Tipos: WebOrder y WebOrderItem (shape crudo de la tabla web_orders) se
// anadieron a types/domain.ts, mismo criterio que Template/Campaign (4.g).
// normPhone se trae como helper local (solo lo usaba este componente).

import { useState, useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { Client, Order, WebOrder } from "../types/domain";
import type { InventoryItem } from "../lib/catalog";
import { Badge, Btn } from "./ui";
import { fmt, fmtD, uid } from "../lib/format";
import { pF, TIER_DISC } from "../lib/catalog";
import { WaBtn } from "../lib/whatsapp";

const normPhone = (p: string | null | undefined): string => {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  return d.length === 10 ? "1" + d : d;
};

interface WebOrdersProps {
  clients: Client[];
  setClients: Dispatch<SetStateAction<Client[]>>;
  orders: Order[];
  setOrders: Dispatch<SetStateAction<Order[]>>;
  inventory: InventoryItem[];
  setInventory: Dispatch<SetStateAction<InventoryItem[]>>;
  saveAll: (type: string, data: unknown) => void;
  supa: { enabled: boolean; url: string; key: string; headers: Record<string, string> };
}

export const WebOrders = ({ clients, setClients, orders, setOrders, inventory, setInventory, saveAll, supa }: WebOrdersProps) => {
  const [webOrders, setWebOrders] = useState<WebOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [copied, setCopied] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!supa.enabled) { setError("Supabase no configurado. Revisa src/config.js"); return; }
    setLoading(true); setError(null);
    try {
      const url = `${supa.url}/rest/v1/web_orders?status=eq.${statusFilter}&order=created_at.desc&limit=100`;
      const resp = await fetch(url, { headers: supa.headers });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setWebOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("fetchOrders failed:", e);
      setError(`Error al cargar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const updateStatus = async (id: string, newStatus: string) => {
    if (!supa.enabled) return false;
    try {
      const payload: { status: string; approved_at?: string } = { status: newStatus };
      // Timestamp approval when importing (ignored doesn't need a timestamp)
      if (newStatus === "imported") payload.approved_at = new Date().toISOString();
      const resp = await fetch(`${supa.url}/rest/v1/web_orders?id=eq.${id}`, {
        method: "PATCH",
        headers: supa.headers,
        body: JSON.stringify(payload)
      });
      return resp.ok;
    } catch (e) { console.error("updateStatus failed:", e); return false; }
  };

  const importOrder = async (wo: WebOrder) => {
    setActioning(wo.id);
    try {
      // 1. Find or create client
      const woPhone = normPhone(wo.phone);
      let client = clients.find(c => normPhone(c.phone) === woPhone);
      let updatedClients = clients;
      if (!client) {
        client = {
          id: uid(),
          name: wo.negocio || wo.encargado || `Cliente Web ${woPhone.slice(-4)}`,
          contact: wo.encargado || "",
          phone: wo.phone || "",
          address: wo.direccion || "",
          zone: "",
          tier: "Lista",
          notes: `Pedido web ${fmtD(wo.created_at || new Date().toISOString())} • Pago: ${wo.pago || "—"}`,
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

      // 3. Calculate totals with client tier discount
      const disc = TIER_DISC[client.tier] || 0;
      const sub = validItems.reduce((s, it) => s + (pF(it.productId)?.price || 0) * it.qty, 0);
      const total = sub * (1 - disc);

      // 4. Create order
      const newOrder: Order = {
        id: uid(),
        clientId: client.id,
        date: new Date().toISOString().slice(0, 10),
        items: validItems.map(it => ({ productId: it.productId, qty: Number(it.qty) })),
        discount: disc,
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
      alert(`Error al importar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActioning(null);
    }
  };

  const ignoreOrder = async (wo: WebOrder) => {
    setActioning(wo.id);
    const ok = await updateStatus(wo.id, "ignored");
    if (ok) setWebOrders(prev => prev.filter(o => o.id !== wo.id));
    else alert("Error al marcar como ignorado");
    setActioning(null);
  };

  const confirmMsg = (wo: WebOrder) => {
    const idShort = (wo.id || "").slice(-6).toUpperCase();
    const itemLines = (wo.items || []).map(it => {
      const p = pF(it.productId);
      return `  • ${p?.name || it.webLabel || it.productId} x${it.qty}`;
    }).join("\n");
    return `¡Hola ${wo.encargado || wo.negocio || ""}!\n\n¡Recibimos tu pedido! Gracias por confiar en Dulce Sabor.\n\n*Pedido #${idShort}*\n${itemLines}\n\n*Total: ${fmt(wo.total)}*\n\nTu pedido está en proceso. Te contacto pronto para coordinar la entrega.\n\nCualquier duda: (707) 360-7420\nOrdena en línea: https://dulcesaborca.com\n\nGracias,\nJosé — Dulce Sabor`;
  };

  const copyConfirmation = async (wo: WebOrder) => {
    try {
      await navigator.clipboard.writeText(confirmMsg(wo));
      setCopied(wo.id);
      setTimeout(() => setCopied(null), 2000);
    } catch { alert("Copy falló"); }
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
      {!supa.enabled && <span style={{ fontSize: 11, color: "#C41E3A", fontWeight: 700 }}>⚠️ Supabase no configurado</span>}
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
          {found ? <span style={{ color: "#777", marginLeft: 6 }}>({fmt((p?.price || 0) * it.qty)})</span> : <span style={{ marginLeft: 6, fontWeight: 700 }}>[sin match]</span>}
        </div>;
      });
      return <div key={wo.id} style={{ background: "#fff", border: "1px solid #eee", borderLeft: "4px solid #1A5276", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{wo.negocio || "(sin negocio)"} </div>
            <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>{wo.encargado || "—"} • {wo.phone || "sin teléfono"}</div>
            {wo.direccion && <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>📍 {wo.direccion}</div>}
            <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{fmtD(wo.created_at || new Date().toISOString())} • Pago: <b>{wo.pago || "—"}</b></div>
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
