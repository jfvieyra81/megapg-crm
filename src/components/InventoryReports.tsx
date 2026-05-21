// src/components/InventoryReports.tsx
//
// Extracted from App.tsx in Block 4.d (May 2026).
// Contains three operations/finance views: Inventory, Purchases, Reports.
//
// Receives `products` (the PRODUCTS catalog) and `calcWeeks` as props
// following the dependency injection pattern from Welcomes (Block 4.c).
// This avoids creating a new shared module for PRODUCTS until a future
// block consolidates the product catalog properly.
//
// Local types (Product, InventoryItem, Purchase) are declared inline
// because they are not yet in src/types/domain.ts. They will be moved
// there in a future block when the catalog/inventory/purchases dataflow
// is audited end-to-end.

import { useState } from "react";
import { Badge, Btn, Card, Modal, Inp, ST } from "./ui";
import { fmt, fmtD, uid } from "../lib/format";
import type { Order } from "../types/domain";

// ─── Local types (will move to domain.ts in a future block) ──────────
type Product = {
  id: string;
  name: string;
  sku: string;
  price: number;
  cost: number;
  bags: number;
};

type InventoryItem = {
  productId: string;
  stock: number;
  lastRestock?: string;
};

type PurchaseLineItem = {
  productId: string;
  qty: number;
  unitCost: number;
  name?: string;
};

type Purchase = {
  id: string;
  date: string;
  invoiceNum?: string;
  items: PurchaseLineItem[];
  total: number;
  notes?: string;
  source?: string;
  created: string;
};

// Low-stock threshold (cases). Duplicated from App.tsx until a future
// block consolidates business thresholds into lib/business or contract.
const LOW = 5;

// ─── Inventory ────────────────────────────────────────────────────────
interface InventoryProps {
  inventory: InventoryItem[];
  setInventory: (inv: InventoryItem[]) => void;
  orders: Order[];
  saveAll: (key: string, value: unknown) => void;
  products: readonly Product[];
  calcWeeks: (orders: Order[]) => number;
}

export const Inventory = ({
  inventory,
  setInventory,
  orders,
  saveAll,
  products,
  calcWeeks,
}: InventoryProps) => {
  const pF = (id: string): Product | undefined => products.find(p => p.id === id);
  const [sr, setSr] = useState(false);
  const [ri, setRi] = useState<Array<{ productId: string; add: number }>>([]);
  const openR = () => {
    setRi(products.map(p => ({ productId: p.id, add: 0 })));
    setSr(true);
  };
  const doR = () => {
    const ni = [...inventory];
    ri.forEach(r => {
      if (r.add > 0) {
        const idx = ni.findIndex(i => i.productId === r.productId);
        if (idx >= 0) {
          ni[idx] = { ...ni[idx], stock: ni[idx].stock + r.add, lastRestock: new Date().toISOString() };
        } else {
          ni.push({ productId: r.productId, stock: r.add, lastRestock: new Date().toISOString() });
        }
      }
    });
    setInventory(ni);
    saveAll("inventory", ni);
    setSr(false);
  };
  const tC = inventory.reduce((s, i) => s + (pF(i.productId)?.cost || 0) * i.stock, 0);
  const tR = inventory.reduce((s, i) => s + (pF(i.productId)?.price || 0) * i.stock, 0);
  const weeks = calcWeeks(orders);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <Card title="Cost" value={fmt(tC)} color="#C41E3A" />
          <Card title="Retail" value={fmt(tR)} color="#1B7340" />
          <Card title="Potential profit" value={fmt(tR - tC)} color="#6C3483" />
        </div>
        <Btn primary onClick={openR}>+ Manual restock</Btn>
      </div>
      {products.map(p => {
        const inv = inventory.find(i => i.productId === p.id);
        const st = inv?.stock || 0;
        const low = st > 0 && st <= LOW;
        const out = st === 0;
        const sold = orders.reduce(
          (s, o) => s + o.items.filter(it => it.productId === p.id).reduce((a, it) => a + it.qty, 0),
          0
        );
        const wr = weeks > 0 ? Math.round((sold / weeks) * 10) / 10 : 0;
        const wl = wr > 0 ? Math.round((st / wr) * 10) / 10 : null;
        return (
          <div
            key={p.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "7px 12px",
              background: out ? "#FDE8E8" : low ? "#FDF2E9" : "#fff",
              border: "1px solid #eee",
              borderRadius: 8,
              marginBottom: 3,
              fontSize: 13,
            }}
          >
            <div>
              <b>{p.name}</b> <span style={{ color: "#999", fontSize: 11 }}>{p.sku}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "#999" }}>
                {fmt(p.cost)} / {fmt(p.price)}
              </span>
              <span style={{ fontSize: 11, color: "#777" }}>~{wr}/wk</span>
              {wl !== null && wl < 3 && <Badge text={`${wl}wk`} color="#C41E3A" />}
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  color: out ? "#C41E3A" : low ? "#D35400" : "#1B7340",
                  minWidth: 50,
                  textAlign: "right",
                }}
              >
                {st}
              </span>
              {(out || low) && <Badge text={out ? "OUT" : "LOW"} color={out ? "#C41E3A" : "#D35400"} />}
            </div>
          </div>
        );
      })}
      {sr && (
        <Modal title="Manual restock" onClose={() => setSr(false)}>
          <p style={{ fontSize: 13, color: "#777", marginBottom: 12 }}>
            For auto-restock from invoices, use Purchases tab.
          </p>
          {products.map(p => (
            <div
              key={p.id}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f0f0f0" }}
            >
              <span style={{ fontSize: 13 }}>
                {p.name}{" "}
                <span style={{ color: "#999", fontSize: 11 }}>
                  (stock: {inventory.find(i => i.productId === p.id)?.stock || 0})
                </span>
              </span>
              <input
                type="number"
                min="0"
                value={ri.find(r => r.productId === p.id)?.add || 0}
                onChange={e =>
                  setRi(prev =>
                    prev.map(r =>
                      r.productId === p.id ? { ...r, add: parseInt(e.target.value) || 0 } : r
                    )
                  )
                }
                style={{ width: 60, padding: "5px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, textAlign: "center" }}
              />
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <Btn onClick={() => setSr(false)}>Cancel</Btn>
            <Btn primary onClick={doR}>Save</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Purchases ────────────────────────────────────────────────────────
interface PurchasesProps {
  purchases: Purchase[];
  setPurchases: (updater: (prev: Purchase[]) => Purchase[]) => void;
  inventory: InventoryItem[];
  setInventory: (inv: InventoryItem[]) => void;
  saveAll: (key: string, value: unknown) => void;
  products: readonly Product[];
}

export const Purchases = ({
  purchases,
  setPurchases,
  inventory,
  setInventory,
  saveAll,
  products,
}: PurchasesProps) => {
  const pF = (id: string): Product | undefined => products.find(p => p.id === id);
  const [mp, setMp] = useState(false);
  const [poF, setPoF] = useState<{
    date: string;
    items: Array<{ productId: string; qty: number; unitCost: number }>;
    invoiceNum: string;
    notes: string;
  }>({
    date: new Date().toISOString().slice(0, 10),
    items: products.map(p => ({ productId: p.id, qty: 0, unitCost: p.cost })),
    invoiceNum: "",
    notes: "",
  });

  const saveManual = () => {
    const items = poF.items.filter(i => i.qty > 0);
    if (items.length === 0) return;
    const total = items.reduce((s, i) => s + i.unitCost * i.qty, 0);
    const po: Purchase = {
      id: uid(),
      date: poF.date,
      invoiceNum: poF.invoiceNum,
      items: items.map(i => ({ ...i, name: pF(i.productId)?.name })),
      total,
      notes: poF.notes,
      source: "manual",
      created: new Date().toISOString(),
    };
    setPurchases(prev => {
      const n = [...prev, po];
      saveAll("purchases", n);
      return n;
    });
    const ni = [...inventory];
    items.forEach(it => {
      const idx = ni.findIndex(i => i.productId === it.productId);
      if (idx >= 0) {
        ni[idx] = { ...ni[idx], stock: ni[idx].stock + it.qty, lastRestock: new Date().toISOString() };
      } else {
        ni.push({ productId: it.productId, stock: it.qty, lastRestock: new Date().toISOString() });
      }
    });
    setInventory(ni);
    saveAll("inventory", ni);
    setMp(false);
    setPoF({
      date: new Date().toISOString().slice(0, 10),
      items: products.map(p => ({ productId: p.id, qty: 0, unitCost: p.cost })),
      invoiceNum: "",
      notes: "",
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Card
          title="Total purchased"
          value={fmt(purchases.reduce((s, p) => s + (p.total || 0), 0))}
          sub={`${purchases.length} POs`}
          color="#1A5276"
        />
        <Btn primary onClick={() => setMp(true)}>+ New purchase</Btn>
      </div>
      <ST>Purchase history</ST>
      {purchases.length === 0 && (
        <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 30 }}>No purchases yet.</p>
      )}
      {purchases.slice().reverse().map(p => (
        <div
          key={p.id}
          style={{ padding: "10px 14px", background: "#fff", border: "1px solid #eee", borderRadius: 8, marginBottom: 5 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <div>
              <b>{fmtD(p.date)}</b>
              {p.invoiceNum && <span style={{ color: "#999", marginLeft: 8 }}>#{p.invoiceNum}</span>}
            </div>
            <b style={{ color: "#C41E3A" }}>{fmt(p.total)}</b>
          </div>
          <div style={{ fontSize: 12, color: "#777" }}>
            {p.items.map(i => `${i.name || i.productId} ×${i.qty}`).join(", ")}
          </div>
        </div>
      ))}

      {mp && (
        <Modal title="New purchase" onClose={() => setMp(false)} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
            <Inp label="Date" type="date" value={poF.date} onChange={(v: string) => setPoF(p => ({ ...p, date: v }))} />
            <Inp label="Invoice #" value={poF.invoiceNum} onChange={(v: string) => setPoF(p => ({ ...p, invoiceNum: v }))} placeholder="MPG-2026-0042" />
            <Inp label="Notes" value={poF.notes} onChange={(v: string) => setPoF(p => ({ ...p, notes: v }))} />
          </div>
          {products.map(p => (
            <div
              key={p.id}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f0f0f0" }}
            >
              <span style={{ fontSize: 13 }}>
                {p.name} <span style={{ color: "#999", fontSize: 11 }}>{fmt(p.cost)}/case</span>
              </span>
              <input
                type="number"
                min="0"
                value={poF.items.find(it => it.productId === p.id)?.qty || 0}
                onChange={e =>
                  setPoF(prev => ({
                    ...prev,
                    items: prev.items.map(it =>
                      it.productId === p.id ? { ...it, qty: parseInt(e.target.value) || 0 } : it
                    ),
                  }))
                }
                style={{ width: 60, padding: "5px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, textAlign: "center" }}
              />
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 0",
              marginTop: 8,
              borderTop: "2px solid #C41E3A",
              fontSize: 16,
              fontWeight: 700,
              color: "#C41E3A",
            }}
          >
            <span>Total</span>
            <span>{fmt(poF.items.reduce((s, i) => s + i.unitCost * i.qty, 0))}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <Btn onClick={() => setMp(false)}>Cancel</Btn>
            <Btn primary onClick={saveManual}>Save &amp; update inventory</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Reports ──────────────────────────────────────────────────────────
interface ReportsProps {
  orders: Order[];
  clients: unknown[]; // Not used directly in this component; kept for API compatibility
  purchases: Purchase[];
  products: readonly Product[];
  calcWeeks: (orders: Order[]) => number;
}

export const Reports = ({
  orders,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clients: _clients,
  purchases,
  products,
  calcWeeks,
}: ReportsProps) => {
  const pF = (id: string): Product | undefined => products.find(p => p.id === id);
  const weeks = calcWeeks(orders);
  const md: Record<string, { rev: number; cost: number; cases: number; orders: number }> = {};
  orders.forEach(o => {
    const m = o.date?.slice(0, 7) || "?";
    if (!md[m]) md[m] = { rev: 0, cost: 0, cases: 0, orders: 0 };
    md[m].rev += o.total || 0;
    md[m].cost += o.items.reduce((a, it) => a + (pF(it.productId)?.cost || 0) * it.qty, 0);
    md[m].cases += o.items.reduce((a, it) => a + it.qty, 0);
    md[m].orders++;
  });
  const ps = products
    .map(p => {
      const sold = orders.reduce(
        (s, o) =>
          s + o.items.filter(it => it.productId === p.id).reduce((a, it) => a + it.qty, 0),
        0
      );
      const rev = orders.reduce(
        (s, o) =>
          s +
          o.items
            .filter(it => it.productId === p.id)
            .reduce((a, it) => a + p.price * (1 - (o.discount || 0)) * it.qty, 0),
        0
      );
      return { ...p, sold, rev, prof: rev - p.cost * sold };
    })
    .sort((a, b) => b.sold - a.sold);
  const tR = orders.reduce((s, o) => s + (o.total || 0), 0);
  const tC = orders.reduce(
    (s, o) => s + o.items.reduce((a, it) => a + (pF(it.productId)?.cost || 0) * it.qty, 0),
    0
  );

  return (
    <div>
      <ST>
        P&amp;L summary{" "}
        <span style={{ fontSize: 11, fontWeight: 400, color: "#999" }}>
          ({Math.round(weeks)} week span)
        </span>
      </ST>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <Card title="Revenue" value={fmt(tR)} color="#1B7340" />
        <Card title="COGS" value={fmt(tC)} color="#C41E3A" />
        <Card
          title="Gross profit"
          value={fmt(tR - tC)}
          sub={tR > 0 ? `${Math.round(((tR - tC) / tR) * 100)}%` : ""}
          color="#1B7340"
        />
        <Card
          title="Purchased"
          value={fmt(purchases.reduce((s, p) => s + (p.total || 0), 0))}
          color="#1A5276"
        />
      </div>
      <ST>Monthly breakdown</ST>
      {Object.entries(md)
        .sort()
        .reverse()
        .map(([m, d]) => (
          <div
            key={m}
            style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}
          >
            <b style={{ minWidth: 70 }}>{m}</b>
            <span>{d.orders} ord</span>
            <span>{d.cases} cases</span>
            <span>Rev: {fmt(d.rev)}</span>
            <span>Cost: {fmt(d.cost)}</span>
            <span style={{ color: "#1B7340", fontWeight: 700 }}>Profit: {fmt(d.rev - d.cost)}</span>
            <span style={{ fontSize: 11, color: "#777" }}>
              {d.rev > 0 ? Math.round(((d.rev - d.cost) / d.rev) * 100) : 0}%
            </span>
          </div>
        ))}
      <ST>Product performance</ST>
      {ps.filter(p => p.sold > 0).map(p => (
        <div
          key={p.id}
          style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}
        >
          <span style={{ minWidth: 160 }}>{p.name}</span>
          <span>{p.sold} cases</span>
          <span>Rev: {fmt(p.rev)}</span>
          <span style={{ color: "#1B7340", fontWeight: 600 }}>Profit: {fmt(p.prof)}</span>
        </div>
      ))}
    </div>
  );
};
