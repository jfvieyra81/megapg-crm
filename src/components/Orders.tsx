// src/components/Orders.tsx
// =============================================================================
// Orders — CRUD de pedidos + modal de devolución (§6.1 del contrato).
// Extraído de App.tsx en Block 4.d.
//
// Block 4.f: WhatsApp helpers ahora importados desde lib/whatsapp.tsx
// (eliminada duplicación inline). Mensajes wa* respetan el idioma del
// cliente (client.language) con fallback "es".
// =============================================================================

import { useState, useRef } from "react";
import type {
  Client,
  Order,
  OrderStatus,
  SaleUnit,
} from "../types/domain";
import {
  PRODUCTS,
  pF,
  TIER_DISC,
  itemCost,
  bagEnabled,
  unitPrice,
  unitCost,
  casesFor,
  type InventoryItem,
} from "../lib/catalog";
import { buildOrder, applyInventory } from "../lib/business/orders";
import { fmt, fmtD, fmtPct } from "../lib/format";
import { WaBtn, waOrder, waPayment } from "../lib/whatsapp";
import { Btn, Modal, Inp, Badge } from "./ui";

// ============================================================
// Tipos locales del formulario
// ============================================================
interface OrderFormItem {
  productId: string;
  qty: number;
  unit: SaleUnit;
}

interface OrderForm {
  clientId: string;
  date: string;
  items: OrderFormItem[];
  notes: string;
  status: OrderStatus;
}

interface ReturnFormState {
  amount: string;
  date: string;
  notes: string;
}

// ============================================================
// Component
// ============================================================
interface OrdersProps {
  clients: Client[];
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  saveAll: (type: string, data: unknown) => void;
  setTab: (tab: string) => void;
  setRO: (order: Order | null) => void;
}

const buildEmptyForm = (): OrderForm => ({
  clientId: "",
  date: new Date().toISOString().slice(0, 10),
  items: [{ productId: "", qty: 1, unit: "case" }],
  notes: "",
  status: "pending",
});

export const Orders = ({
  clients,
  orders,
  setOrders,
  inventory,
  setInventory,
  saveAll,
  setTab,
  setRO,
}: OrdersProps) => {
  const [sf, setSf] = useState<boolean>(false);
  const [delConfirm, setDelConfirm] = useState<string | null>(null);
  const delORef = useRef<string | null>(null);
  const [stockAck, setStockAck] = useState<boolean>(false);
  const [form, setForm] = useState<OrderForm>(buildEmptyForm);

  // Deploy C: return modal state
  const [returnFor, setReturnFor] = useState<Order | null>(null);
  const [returnForm, setReturnForm] = useState<ReturnFormState>({
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const openN = () => {
    setForm(buildEmptyForm());
    setSf(true);
  };
  const addL = () =>
    setForm(p => ({ ...p, items: [...p.items, { productId: "", qty: 1, unit: "case" }] }));
  const remL = (i: number) =>
    setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  const upL = (i: number, f: "productId" | "qty" | "unit", v: string) =>
    setForm(p => {
      const items = [...p.items];
      const cur = items[i];
      if (f === "qty") {
        items[i] = { ...cur, qty: Math.max(1, parseInt(v) || 1) };
      } else if (f === "unit") {
        items[i] = { ...cur, unit: v === "bag" ? "bag" : "case" };
      } else {
        // Al cambiar de producto, si el nuevo no se vende por bolsa, regresa a caja.
        const np = pF(v);
        items[i] = {
          ...cur,
          productId: v,
          unit: cur.unit === "bag" && bagEnabled(np) ? "bag" : "case",
        };
      }
      return { ...p, items };
    });

  const cl = clients.find(c => c.id === form.clientId);
  const disc = cl ? TIER_DISC[cl.tier] || 0 : 0;
  const calcT = (): number =>
    form.items.reduce((acc, it) => {
      const p = pF(it.productId);
      return acc + (p ? unitPrice(p, it.unit) * it.qty * (1 - disc) : 0);
    }, 0);
  const calcC = (): number =>
    form.items.reduce((acc, it) => {
      const p = pF(it.productId);
      return acc + (p ? unitCost(p, it.unit) * it.qty : 0);
    }, 0);

  // FIX #5: Checar stock antes de guardar orden
  const getStockWarnings = (): string[] => {
    const warnings: string[] = [];
    form.items
      .filter(it => it.productId)
      .forEach(it => {
        const p = pF(it.productId);
        const inv = inventory.find(i => i.productId === it.productId);
        const availCases = inv?.stock || 0;
        if (casesFor(p, it.unit, it.qty) > availCases) {
          const unitWord = it.unit === "bag" ? "bag(s)" : "case(s)";
          const availInUnit =
            it.unit === "bag" ? Math.floor(availCases * (p?.bags || 1)) : availCases;
          warnings.push(
            `${p?.name}: requesting ${it.qty} ${unitWord}, only ${availInUnit} in stock`
          );
        }
      });
    return warnings;
  };

  const saveO = () => {
    if (!form.clientId || form.items.every(it => !it.productId)) return;
    const warnings = getStockWarnings();
    if (warnings.length > 0 && !stockAck) {
      setStockAck(true);
      return;
    }
    const order = buildOrder({
      clientId: form.clientId,
      date: form.date,
      notes: form.notes,
      status: form.status,
      items: form.items,
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
    setSf(false);
    setStockAck(false);
  };

  const upSt = (id: string, st: OrderStatus) =>
    setOrders(prev => {
      const n = prev.map(o => {
        if (o.id !== id) return o;
        const updated: Order = { ...o, status: st };
        if (st === "paid" && !o.paidDate)
          updated.paidDate = new Date().toISOString().slice(0, 10);
        if (st !== "paid" && o.paidDate) updated.paidDate = null;
        return updated;
      });
      saveAll("orders", n);
      return n;
    });

  const delO = (id: string) => {
    if (delORef.current === id) {
      setOrders(prev => {
        const n = prev.filter(o => o.id !== id);
        saveAll("orders", n);
        return n;
      });
      delORef.current = null;
      setDelConfirm(null);
    } else {
      delORef.current = id;
      setDelConfirm(id);
      setTimeout(() => {
        if (delORef.current === id) {
          delORef.current = null;
          setDelConfirm(null);
        }
      }, 3000);
    }
  };

  const qReorder = (o: Order) => {
    setForm({
      clientId: o.clientId,
      date: new Date().toISOString().slice(0, 10),
      items: o.items.map(it => ({
        productId: it.productId,
        qty: it.qty,
        unit: it.unit ?? "case",
      })),
      notes: "Reorder from " + fmtD(o.date),
      status: "pending",
    });
    setSf(true);
  };

  // Deploy C: open / save / clear return
  const openReturn = (o: Order) => {
    setReturnFor(o);
    setReturnForm({
      amount: o.returnedAmount ? String(o.returnedAmount) : "",
      date: o.returnedDate || new Date().toISOString().slice(0, 10),
      notes: o.returnedNotes || "",
    });
  };
  const saveReturn = () => {
    if (!returnFor) return;
    const amt = parseFloat(returnForm.amount);
    if (isNaN(amt) || amt < 0) {
      alert("Cantidad inválida");
      return;
    }
    if (amt > (returnFor.total || 0)) {
      if (
        !confirm(
          `La devolución (${fmt(amt)}) supera el total del pedido (${fmt(returnFor.total)}). ¿Continuar?`
        )
      )
        return;
    }
    setOrders(prev => {
      const n = prev.map(o =>
        o.id === returnFor.id
          ? {
              ...o,
              returnedAmount: amt,
              returnedDate: returnForm.date,
              returnedNotes: returnForm.notes,
            }
          : o
      );
      saveAll("orders", n);
      return n;
    });
    setReturnFor(null);
  };
  const clearReturn = () => {
    if (!returnFor) return;
    if (!confirm("¿Eliminar el registro de devolución de este pedido?")) return;
    setOrders(prev => {
      const n = prev.map(o =>
        o.id === returnFor.id
          ? { ...o, returnedAmount: 0, returnedDate: null, returnedNotes: "" }
          : o
      );
      saveAll("orders", n);
      return n;
    });
    setReturnFor(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Btn primary onClick={openN}>+ New order</Btn>
      </div>
      {orders.length === 0 && (
        <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 40 }}>
          No orders yet.
        </p>
      )}
      {orders
        .slice()
        .reverse()
        .map(o => {
          const c = clients.find(x => x.id === o.clientId);
          const tc = o.items.reduce((a, it) => a + it.qty, 0);
          const cost = o.items.reduce(
            (a, it) => a + itemCost(it) * it.qty,
            0
          );
          const prof = (o.total || 0) - cost;
          const hasReturn = !!(o.returnedAmount && o.returnedAmount > 0);
          const cLang = c?.language ?? "es";
          return (
            <div
              key={o.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: hasReturn ? "#FDF2F2" : "#fff",
                border: "1px solid #eee",
                borderRadius: 8,
                marginBottom: 4,
                fontSize: 13,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{c?.name || "?"}</b>{" "}
                <span style={{ color: "#999" }}>{fmtD(o.date)}</span>{" "}
                <span style={{ color: "#777" }}>{tc} cases</span>
                {o.discount > 0 && (
                  <Badge text={`-${fmtPct(o.discount)}%`} color="#D35400" />
                )}
                {hasReturn && (
                  <Badge text={`↩ -${fmt(o.returnedAmount)}`} color="#C41E3A" />
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                <div style={{ textAlign: "right", marginRight: 4 }}>
                  <div style={{ fontWeight: 700 }}>{fmt(o.total)}</div>
                  <div style={{ fontSize: 11, color: "#1B7340" }}>+{fmt(prof)}</div>
                </div>
                <select
                  value={o.status}
                  onChange={e => upSt(o.id, e.target.value as OrderStatus)}
                  style={{
                    padding: "3px 6px",
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    fontSize: 11,
                    background:
                      o.status === "paid"
                        ? "#E8F5E8"
                        : o.status === "delivered"
                          ? "#EBF5FB"
                          : "#FDF2E9",
                  }}
                >
                  <option value="pending">Pending</option>
                  <option value="delivered">Delivered</option>
                  <option value="paid">Paid</option>
                </select>
                {c?.phone && (
                  <WaBtn
                    phone={c.phone}
                    msg={
                      o.status !== "paid"
                        ? waPayment(o, c, cLang)
                        : waOrder(o, c, cLang)
                    }
                    label={o.status !== "paid" ? "Remind" : "WA"}
                    small
                  />
                )}
                <Btn small onClick={() => qReorder(o)} style={{ fontSize: 10 }}>
                  Reorder
                </Btn>
                <Btn
                  small
                  onClick={() => {
                    setRO(o);
                    setTab("receipt");
                  }}
                  style={{ fontSize: 10 }}
                >
                  Receipt
                </Btn>
                {o.status === "paid" && (
                  <Btn
                    small
                    onClick={() => openReturn(o)}
                    style={{
                      fontSize: 10,
                      background: hasReturn ? "#C41E3A" : "#f0f0f0",
                      color: hasReturn ? "#fff" : "#333",
                    }}
                  >
                    ↩ {hasReturn ? "Edit" : "Devol"}
                  </Btn>
                )}
                <Btn
                  small
                  danger
                  onClick={() => delO(o.id)}
                  style={
                    delConfirm === o.id
                      ? { fontSize: 10, minWidth: 52, background: "#8B0000" }
                      : { fontSize: 10 }
                  }
                >
                  {delConfirm === o.id ? "Sure?" : "✕"}
                </Btn>
              </div>
            </div>
          );
        })}
      {sf && (
        <Modal title="New order" onClose={() => setSf(false)} wide>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0 12px",
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#555",
                  marginBottom: 3,
                }}
              >
                Client *
              </label>
              <select
                value={form.clientId}
                onChange={e =>
                  setForm(p => ({ ...p, clientId: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <option value="">-- Select --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.tier})
                  </option>
                ))}
              </select>
            </div>
            <Inp
              label="Date"
              type="date"
              value={form.date}
              onChange={v => setForm(p => ({ ...p, date: v }))}
            />
          </div>
          {form.clientId && cl && (
            <div
              style={{
                fontSize: 12,
                color: "#1B7340",
                marginBottom: 10,
                padding: "6px 10px",
                background: "#E8F5E8",
                borderRadius: 6,
              }}
            >
              {cl.name} — {cl.tier}{" "}
              {disc > 0 ? `(${fmtPct(disc)}% off)` : "(list price)"}
            </div>
          )}
          <label style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>
            Items
          </label>
          {form.items.map((it, i) => {
            const prod = it.productId ? pF(it.productId) : undefined;
            const inv = it.productId
              ? inventory.find(x => x.productId === it.productId)
              : null;
            const availCases = inv?.stock || 0;
            const canBag = bagEnabled(prod);
            const availInUnit =
              it.unit === "bag"
                ? Math.floor(availCases * (prod?.bags || 1))
                : availCases;
            const overStock = !!(
              it.productId && casesFor(prod, it.unit, it.qty) > availCases
            );
            return (
              <div
                key={i}
                style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}
              >
                <select
                  value={it.productId}
                  onChange={e => upL(i, "productId", e.target.value)}
                  style={{
                    flex: 2,
                    padding: "7px",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <option value="">-- Product --</option>
                  {PRODUCTS.map(p => {
                    const pInv = inventory.find(x => x.productId === p.id);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({fmt(p.price)}
                        {bagEnabled(p) ? ` / ${fmt(p.bagPrice)} bolsa` : ""}) —{" "}
                        {pInv?.stock || 0} avail
                      </option>
                    );
                  })}
                </select>
                <input
                  type="number"
                  min="1"
                  value={it.qty}
                  onChange={e => upL(i, "qty", e.target.value)}
                  style={{
                    width: 55,
                    padding: "7px",
                    border: `1px solid ${overStock ? "#C41E3A" : "#ddd"}`,
                    borderRadius: 6,
                    fontSize: 13,
                    textAlign: "center",
                    background: overStock ? "#FDE8E8" : "#fff",
                  }}
                />
                <select
                  value={it.unit}
                  onChange={e => upL(i, "unit", e.target.value)}
                  disabled={!it.productId}
                  title={
                    canBag
                      ? "Unidad de venta"
                      : "Este producto solo se vende por caja"
                  }
                  style={{
                    padding: "7px",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    fontSize: 12,
                    background: "#fff",
                  }}
                >
                  <option value="case">Caja</option>
                  {canBag && <option value="bag">Bolsa</option>}
                </select>
                <span
                  style={{
                    fontSize: 12,
                    color: "#1B7340",
                    minWidth: 60,
                    fontWeight: 600,
                  }}
                >
                  {it.productId
                    ? fmt(unitPrice(prod, it.unit) * it.qty * (1 - disc))
                    : ""}
                </span>
                {overStock && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "#C41E3A",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    only {availInUnit}!
                  </span>
                )}
                {form.items.length > 1 && (
                  <button
                    onClick={() => remL(i)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#C41E3A",
                      fontSize: 16,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          <Btn small onClick={addL} style={{ marginTop: 8 }}>
            + Add product
          </Btn>
          <Inp
            label="Notes"
            value={form.notes}
            onChange={v => setForm(p => ({ ...p, notes: v }))}
            textarea
            style={{ marginTop: 10 }}
          />
          {getStockWarnings().length > 0 && (
            <div
              style={{
                background: "#FDF2E9",
                padding: "8px 12px",
                borderRadius: 6,
                marginTop: 8,
                fontSize: 12,
                color: "#D35400",
                borderLeft: "3px solid #D35400",
              }}
            >
              <b>Stock warnings:</b> {getStockWarnings().join("; ")}
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                You can still create the order — inventory will go to 0.
              </div>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              background: "#E8F5E8",
              borderRadius: 8,
              margin: "12px 0",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "#1B7340" }}>Total</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#1B7340" }}>
                {fmt(calcT())}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#777" }}>Cost: {fmt(calcC())}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1B7340" }}>
                Profit: {fmt(calcT() - calcC())}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn
              onClick={() => {
                setSf(false);
                setStockAck(false);
              }}
            >
              Cancel
            </Btn>
            <Btn primary onClick={saveO}>
              {stockAck ? "Confirm — create anyway" : "Create order"}
            </Btn>
          </div>
        </Modal>
      )}

      {/* Deploy C: Return modal */}
      {returnFor && (
        <Modal title="Registrar devolución / refund" onClose={() => setReturnFor(null)}>
          <div
            style={{
              background: "#FDF2F2",
              borderLeft: "4px solid #C41E3A",
              padding: "10px 14px",
              borderRadius: 6,
              marginBottom: 12,
              fontSize: 12,
              color: "#555",
              lineHeight: 1.5,
            }}
          >
            <b>Pedido:</b>{" "}
            {clients.find(c => c.id === returnFor.clientId)?.name || "?"} •{" "}
            {fmtD(returnFor.date)} • Total: <b>{fmt(returnFor.total)}</b>
            <div style={{ marginTop: 4 }}>
              El monto registrado se restará de las comisiones del representante en
              el mes de la fecha de devolución (§6.1).
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0 12px",
            }}
          >
            <Inp
              label="Monto devuelto *"
              value={returnForm.amount}
              onChange={v =>
                setReturnForm(p => ({ ...p, amount: v.replace(/[^0-9.]/g, "") }))
              }
              placeholder="0.00"
            />
            <Inp
              label="Fecha de devolución *"
              type="date"
              value={returnForm.date}
              onChange={v => setReturnForm(p => ({ ...p, date: v }))}
            />
          </div>
          <Inp
            label="Notas (motivo, etc)"
            value={returnForm.notes}
            onChange={v => setReturnForm(p => ({ ...p, notes: v }))}
            textarea
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              marginTop: 12,
            }}
          >
            {returnFor.returnedAmount && returnFor.returnedAmount > 0 ? (
              <Btn danger onClick={clearReturn}>
                Eliminar devolución
              </Btn>
            ) : (
              <span />
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => setReturnFor(null)}>Cancel</Btn>
              <Btn primary onClick={saveReturn}>
                Guardar devolución
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
