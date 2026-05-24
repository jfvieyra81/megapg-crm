// src/components/Orders.tsx
// =============================================================================
// Orders — CRUD de pedidos + modal de devolución (§6.1 del contrato).
// Extraído de App.tsx en Block 4.d. Comportamiento idéntico al original.
//
// Helpers duplicados inline (cleanPhone, waLink, waOrder, waPayment, WaBtn):
// son copias temporales del original en App.tsx; se consolidarán en un
// bloque futuro de limpieza de helpers de WhatsApp.
// =============================================================================

import { useState, useRef } from "react";
import type {
  Client,
  Order,
  OrderItem,
  OrderStatus,
} from "../types/domain";
import {
  PRODUCTS,
  pF,
  TIER_DISC,
  type InventoryItem,
} from "../lib/catalog";
import { fmt, fmtD, uid } from "../lib/format";
import { Btn, Modal, Inp, Badge } from "./ui";

// ============================================================
// WhatsApp helpers (duplicados inline — consolidar en bloque futuro)
// ============================================================
const cleanPhone = (ph: string | undefined | null): string => {
  if (!ph) return "";
  return ph.replace(/[^0-9]/g, "").replace(/^1?(\d{10})$/, "1$1");
};

const waLink = (phone: string, msg: string): string =>
  `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(msg)}`;

const waOrder = (order: Order, client: Client | undefined): string => {
  const items = order.items
    .map(it => {
      const p = pF(it.productId);
      return `  • ${p?.name || it.productId} x${it.qty} = ${fmt((p?.price || 0) * it.qty * (1 - (order.discount || 0)))}`;
    })
    .join("\n");
  return `*DULCE SABOR*\nPedido #${order.id.slice(-6).toUpperCase()}\nFecha: ${fmtD(order.date)}\n\nHola ${client?.contact || client?.name || ""},\n\nAquí está la confirmación de tu pedido:\n\n${items}\n${order.discount > 0 ? `\nDescuento: ${Math.round(order.discount * 100)}% (${client?.tier})\n` : ""}\n*TOTAL: ${fmt(order.total)}*\n\nFormas de pago: Efectivo, Zelle, Venmo o Cheque\n¿Preguntas? Llámame al (707) 360-7420\n\nOrdena en línea: https://dulcesaborca.com\n\n¡Gracias!\n— José Flores, Dulce Sabor NorCal`;
};

const waPayment = (order: Order, client: Client | undefined): string => {
  return `Hola ${client?.contact || client?.name || ""},\n\nRecordatorio amistoso sobre tu pedido #${order.id.slice(-6).toUpperCase()} del ${fmtD(order.date)} por *${fmt(order.total)}*.\n\nEstado: ${order.status === "delivered" ? "Entregado — pago pendiente" : "Pendiente"}\n\nFormas de pago:\n• Efectivo en la próxima visita\n• Zelle: megapg.norcal@gmail.com\n• Venmo: @MegaPG-NorCal\n• Cheque a nombre de Dulce Sabor LLC\n\n¿Preguntas? Llámame al (707) 360-7420\n\n¡Gracias!\n— José Flores, Dulce Sabor`;
};

interface WaBtnProps {
  phone: string;
  msg: string;
  label?: string;
  small?: boolean;
}
const WaBtn = ({ phone, msg, label, small }: WaBtnProps) => (
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

// ============================================================
// Tipos locales del formulario
// ============================================================
interface OrderFormItem {
  productId: string;
  qty: number;
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
  items: [{ productId: "", qty: 1 }],
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
    setForm(p => ({ ...p, items: [...p.items, { productId: "", qty: 1 }] }));
  const remL = (i: number) =>
    setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  const upL = (i: number, f: "productId" | "qty", v: string) =>
    setForm(p => {
      const items = [...p.items];
      items[i] = {
        ...items[i],
        [f]: f === "qty" ? Math.max(1, parseInt(v) || 1) : v,
      };
      return { ...p, items };
    });

  const cl = clients.find(c => c.id === form.clientId);
  const disc = cl ? TIER_DISC[cl.tier] || 0 : 0;
  const calcT = (): number =>
    form.items.reduce((s, it) => {
      const p = pF(it.productId);
      return s + (p ? p.price * it.qty * (1 - disc) : 0);
    }, 0);
  const calcC = (): number =>
    form.items.reduce((s, it) => {
      const p = pF(it.productId);
      return s + (p ? p.cost * it.qty : 0);
    }, 0);

  // FIX #5: Checar stock antes de guardar orden
  const getStockWarnings = (): string[] => {
    const warnings: string[] = [];
    form.items
      .filter(it => it.productId)
      .forEach(it => {
        const inv = inventory.find(i => i.productId === it.productId);
        const avail = inv?.stock || 0;
        if (it.qty > avail) {
          const p = pF(it.productId);
          warnings.push(`${p?.name}: requesting ${it.qty}, only ${avail} in stock`);
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
    const vi: OrderItem[] = form.items.filter(it => it.productId);
    const total = calcT();
    const order: Order = {
      id: uid(),
      ...form,
      items: vi,
      total,
      discount: disc,
      created: new Date().toISOString(),
    };
    const ni: InventoryItem[] = [...inventory];
    vi.forEach(it => {
      const idx = ni.findIndex(inv => inv.productId === it.productId);
      if (idx >= 0)
        ni[idx] = { ...ni[idx], stock: Math.max(0, ni[idx].stock - it.qty) };
    });
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
        // Deploy A: auto-populate paidDate when status transitions to paid; clear if moving away
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
      items: o.items.map(it => ({ productId: it.productId, qty: it.qty })),
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
            (a, it) => a + (pF(it.productId)?.cost || 0) * it.qty,
            0
          );
          const prof = (o.total || 0) - cost;
          const hasReturn = !!(o.returnedAmount && o.returnedAmount > 0);
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
                  <Badge text={`-${Math.round(o.discount * 100)}%`} color="#D35400" />
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
                    msg={o.status !== "paid" ? waPayment(o, c) : waOrder(o, c)}
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
              {disc > 0 ? `(${Math.round(disc * 100)}% off)` : "(list price)"}
            </div>
          )}
          <label style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>
            Items
          </label>
          {form.items.map((it, i) => {
            // FIX #5: Mostrar stock disponible y warning visual
            const inv = it.productId
              ? inventory.find(x => x.productId === it.productId)
              : null;
            const avail = inv?.stock || 0;
            const overStock = !!(it.productId && it.qty > avail);
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
                        {p.name} ({fmt(p.price)}) — {pInv?.stock || 0} avail
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
                <span
                  style={{
                    fontSize: 12,
                    color: "#1B7340",
                    minWidth: 60,
                    fontWeight: 600,
                  }}
                >
                  {it.productId
                    ? fmt((pF(it.productId)?.price || 0) * it.qty * (1 - disc))
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
                    only {avail}!
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
