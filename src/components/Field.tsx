// src/components/Field.tsx
//
// Extracted from App.tsx in Block 4.d (May 2026).
// Contains the four "field intelligence" components used to capture
// and review store visits: FieldDashboard, VisitForm, VisitsList, FieldExport.
//
// Field-specific constants (ZONES, BRANDS, STORE_TYPES, INTEREST_LVL,
// SUPPLIERS, PRODUCTS_SEEN, BRAND_CLR) are duplicated inline temporarily
// from App.tsx until a future block consolidates them into a shared
// constants module. Same pattern as Welcomes.tsx (Block 4.c).

import { useState, useRef } from "react";
import { Badge, Btn, Card, Modal, Inp, ST } from "./ui";
import { fmt, fmtD, uid } from "../lib/format";
import type { Visit } from "../types/domain";

// ─── Field constants (duplicated from App.tsx, will be deduped later) ───
const ZONES: readonly string[] = [
  "Santa Rosa / Sonoma",
  "Sacramento",
  "San Jose / Bay Area",
  "Mendocino / Ukiah",
  "Oakland / Bay Area",
  "Other",
];
const BRANDS: readonly string[] = ["Mega PG", "Pigüi USA", "Both", "Neither/Unknown"];
const STORE_TYPES: readonly string[] = [
  "Dulcería",
  "Carnicería",
  "Supermercado",
  "Tienda/Market",
  "Convenience",
  "Other",
];
const INTEREST_LVL: readonly string[] = [
  "Very interested",
  "Somewhat interested",
  "Not interested",
  "Already a client",
];
const SUPPLIERS: readonly string[] = [
  "Pigüi USA (LA)",
  "Local distributor",
  "Travels to buy",
  "Online/Walmart/Amazon",
  "Unknown",
  "None (no Slaps)",
];
const PRODUCTS_SEEN: readonly string[] = [
  "Slaps Lollipops",
  "Slaps Devora/DevorAlien",
  "Cachetada/Cachetadas",
  "Cache Colors",
  "Slim Licks",
  "Bibi Licks",
  "Piguileta",
  "Mega Huevón",
  "Flamkiyos",
  "Mordidilla",
  "Don Cuco",
  "Other Pigüi",
  "None",
];
const BRAND_CLR: Record<string, string> = {
  "Mega PG": "#1B7340",
  "Pigüi USA": "#C41E3A",
  "Both": "#D35400",
  "Neither/Unknown": "#888",
};

// ─── FieldDashboard ───────────────────────────────────────────────────
interface FieldDashboardProps {
  visits: Visit[];
}

export const FieldDashboard = ({ visits }: FieldDashboardProps) => {
  const total = visits.length;
  const megaPG = visits.filter(v => v.brand === "Mega PG" || v.brand === "Both").length;
  const piguiUSA = visits.filter(v => v.brand === "Pigüi USA" || v.brand === "Both").length;
  const interested = visits.filter(
    v => v.interest === "Very interested" || v.interest === "Somewhat interested"
  ).length;
  const prices = visits.filter(v => Number(v.publicPrice) > 0).map(v => Number(v.publicPrice));
  const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const zones = ZONES.filter(z => z !== "Other")
    .map(z => {
      const zv = visits.filter(v => v.zone === z);
      return {
        zone: z,
        total: zv.length,
        mega: zv.filter(v => v.brand === "Mega PG" || v.brand === "Both").length,
        pigui: zv.filter(v => v.brand === "Pigüi USA" || v.brand === "Both").length,
      };
    })
    .filter(z => z.total > 0);
  const supplierCounts: Record<string, number> = {};
  visits.forEach(v => {
    if (v.supplier) supplierCounts[v.supplier] = (supplierCounts[v.supplier] || 0) + 1;
  });

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <Card title="Stores visited" value={total} color="#1A5276" />
        <Card title="Carry Mega PG" value={megaPG} sub={total > 0 ? `${Math.round((megaPG / total) * 100)}%` : ""} color="#1B7340" />
        <Card title="Carry Pigüi USA" value={piguiUSA} sub={total > 0 ? `${Math.round((piguiUSA / total) * 100)}%` : ""} color="#C41E3A" />
        <Card title="Interested" value={interested} sub={total > 0 ? `${Math.round((interested / total) * 100)}%` : ""} color="#D35400" />
      </div>
      {avgPrice > 0 && (
        <div style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
          Avg public price: <b>{fmt(avgPrice)}</b>/bag across {prices.length} stores
        </div>
      )}
      {zones.length > 0 && (
        <>
          <ST>Zone penetration</ST>
          {zones.map(z => (
            <div key={z.zone} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                {z.zone} <span style={{ color: "#999", fontWeight: 400 }}>({z.total} stores)</span>
              </div>
              <div style={{ display: "flex", height: 16, borderRadius: 4, overflow: "hidden", background: "#f0f0f0" }}>
                {z.mega > 0 && <div style={{ width: `${(z.mega / z.total) * 100}%`, background: "#1B7340" }} title={`Mega PG: ${z.mega}`} />}
                {z.pigui > 0 && <div style={{ width: `${(z.pigui / z.total) * 100}%`, background: "#C41E3A" }} title={`Pigüi USA: ${z.pigui}`} />}
              </div>
              <div style={{ fontSize: 10, color: "#999", marginTop: 1 }}>
                <span style={{ color: "#1B7340" }}>■ Mega PG: {z.mega}</span>{" "}
                <span style={{ color: "#C41E3A", marginLeft: 8 }}>■ Pigüi USA: {z.pigui}</span>
              </div>
            </div>
          ))}
        </>
      )}
      {Object.keys(supplierCounts).length > 0 && (
        <>
          <ST>Supplier channels</ST>
          {Object.entries(supplierCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([sup, cnt]) => (
              <div key={sup} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}>
                <span>{sup}</span>
                <b>{cnt}</b>
              </div>
            ))}
        </>
      )}
      {total === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
          No field visits yet. Go to "Visits" tab to start capturing data.
        </div>
      )}
    </div>
  );
};

// ─── VisitForm ────────────────────────────────────────────────────────
interface VisitFormProps {
  onSave: (visit: Visit) => void;
  onClose: () => void;
  editVisit: Visit | null;
}

// Form state shape — separate from Visit because the form can hold partial
// data before save (id/created assigned on save). Kept loose to match the
// pre-refactor behavior; will be tightened when Visit is fully audited.
type VisitFormState = {
  id?: string;
  created?: string;
  storeName: string;
  address: string;
  phone: string;
  contact: string;
  zone: string;
  storeType: string;
  date: string;
  brand: string;
  productsSeen: string[];
  supplier: string;
  publicPrice: string | number;
  interest: string;
  painPoints: string;
  leftSamples: boolean;
  samplesQty: string | number;
  notes: string;
  competitorProducts: string;
  footTraffic: string;
};

const emptyVisit = (): VisitFormState => ({
  storeName: "",
  address: "",
  phone: "",
  contact: "",
  zone: "",
  storeType: "",
  date: new Date().toISOString().slice(0, 10),
  brand: "",
  productsSeen: [],
  supplier: "",
  publicPrice: "",
  interest: "",
  painPoints: "",
  leftSamples: false,
  samplesQty: "",
  notes: "",
  competitorProducts: "",
  footTraffic: "",
});

export const VisitForm = ({ onSave, onClose, editVisit }: VisitFormProps) => {
  const [f, setF] = useState<VisitFormState>((editVisit as VisitFormState | null) ?? emptyVisit());
  const u = <K extends keyof VisitFormState>(k: K, v: VisitFormState[K]) =>
    setF(p => ({ ...p, [k]: v }));
  const toggleProd = (prod: string) =>
    setF(p => ({
      ...p,
      productsSeen: p.productsSeen.includes(prod)
        ? p.productsSeen.filter(x => x !== prod)
        : [...p.productsSeen, prod],
    }));
  const doSave = () => {
    if (!f.storeName) return;
    const saved = editVisit
      ? { ...editVisit, ...f }
      : { ...f, id: uid(), created: new Date().toISOString() };
    onSave(saved as unknown as Visit);
  };

  return (
    <Modal title={editVisit ? "Edit visit" : "New field visit"} onClose={onClose} wide>
      <ST>Store info</ST>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <Inp label="Store name *" value={f.storeName} onChange={(v: string) => u("storeName", v)} placeholder="Dulcería Las Tapatías" />
        <Inp label="Contact" value={f.contact} onChange={(v: string) => u("contact", v)} placeholder="María González" />
        <Inp label="Address" value={f.address} onChange={(v: string) => u("address", v)} placeholder="1630 Sebastopol Rd" />
        <Inp label="Phone" value={f.phone} onChange={(v: string) => u("phone", v)} placeholder="(707) 536-9543" />
        <Inp label="Zone" value={f.zone} onChange={(v: string) => u("zone", v)} options={ZONES} />
        <Inp label="Store type" value={f.storeType} onChange={(v: string) => u("storeType", v)} options={STORE_TYPES} />
        <Inp label="Date" type="date" value={f.date} onChange={(v: string) => u("date", v)} />
        <Inp label="Foot traffic" value={f.footTraffic} onChange={(v: string) => u("footTraffic", v)} options={["High", "Medium", "Low"]} />
      </div>
      <ST>Products & competition</ST>
      <Inp label="Brand on shelf" value={f.brand} onChange={(v: string) => u("brand", v)} options={BRANDS} />
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 3 }}>
          Products seen
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {PRODUCTS_SEEN.map(p => (
            <button
              key={p}
              onClick={() => toggleProd(p)}
              style={{
                padding: "3px 8px",
                fontSize: 11,
                border: "1px solid #ddd",
                borderRadius: 4,
                cursor: "pointer",
                background: f.productsSeen.includes(p) ? "#1B7340" : "#fff",
                color: f.productsSeen.includes(p) ? "#fff" : "#333",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <Inp label="Public price/bag" type="number" value={f.publicPrice} onChange={(v: string) => u("publicPrice", v)} placeholder="3.00" />
        <Inp label="Other competitor products" value={f.competitorProducts} onChange={(v: string) => u("competitorProducts", v)} placeholder="Vero, Lucas..." />
      </div>
      <ST>Supplier & interest</ST>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <Inp label="Who supplies them?" value={f.supplier} onChange={(v: string) => u("supplier", v)} options={SUPPLIERS} />
        <Inp label="Interest level" value={f.interest} onChange={(v: string) => u("interest", v)} options={INTEREST_LVL} />
      </div>
      <Inp label="Pain points" value={f.painPoints} onChange={(v: string) => u("painPoints", v)} textarea placeholder="What problems do they have with current supplier?" />
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>
          <input type="checkbox" checked={f.leftSamples} onChange={e => u("leftSamples", e.target.checked)} /> Left samples
        </label>
        {f.leftSamples && (
          <Inp label="Qty" type="number" value={f.samplesQty} onChange={(v: string) => u("samplesQty", v)} style={{ marginBottom: 0, width: 80 }} />
        )}
      </div>
      <Inp label="Notes" value={f.notes} onChange={(v: string) => u("notes", v)} textarea placeholder="Key observations, follow-up actions..." />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn primary onClick={doSave}>{editVisit ? "Update" : "Save visit"}</Btn>
      </div>
    </Modal>
  );
};

// ─── VisitsList ───────────────────────────────────────────────────────
interface VisitsListProps {
  visits: Visit[];
  onEdit: (visit: Visit) => void;
  onDelete: (id: string) => void;
}

export const VisitsList = ({ visits, onEdit, onDelete }: VisitsListProps) => {
  const [search, setSearch] = useState("");
  const [zf, setZf] = useState("");
  const delRef = useRef<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const del = (id: string) => {
    if (delRef.current === id) {
      onDelete(id);
      delRef.current = null;
      setDelId(null);
    } else {
      delRef.current = id;
      setDelId(id);
      setTimeout(() => {
        if (delRef.current === id) {
          delRef.current = null;
          setDelId(null);
        }
      }, 3000);
    }
  };
  const fil = visits
    .filter(
      v =>
        (!search ||
          v.storeName.toLowerCase().includes(search.toLowerCase()) ||
          v.notes?.toLowerCase().includes(search.toLowerCase())) &&
        (!zf || v.zone === zf)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search stores..."
          style={{ padding: "7px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, flex: 1, maxWidth: 250 }}
        />
        <select
          value={zf}
          onChange={e => setZf(e.target.value)}
          style={{ padding: "7px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12 }}
        >
          <option value="">All zones</option>
          {ZONES.map(z => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
      </div>
      {fil.length === 0 && (
        <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 30 }}>No visits found.</p>
      )}
      {fil.map(v => (
        <div
          key={v.id}
          style={{
            padding: "10px 14px",
            background: "#fff",
            border: "1px solid #eee",
            borderRadius: 8,
            marginBottom: 5,
            borderLeft: `4px solid ${BRAND_CLR[v.brand] || "#888"}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div>
              <b style={{ fontSize: 14 }}>{v.storeName}</b>{" "}
              {v.zone && <Badge text={v.zone} color="#6C3483" />}{" "}
              {v.brand && <Badge text={v.brand} color={BRAND_CLR[v.brand] || "#888"} />}{" "}
              {v.interest && (
                <Badge
                  text={v.interest}
                  color={
                    v.interest.includes("Very")
                      ? "#1B7340"
                      : v.interest.includes("Somewhat")
                      ? "#D35400"
                      : v.interest === "Already a client"
                      ? "#1A5276"
                      : "#888"
                  }
                />
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <Btn small onClick={() => onEdit(v)}>Edit</Btn>
              <Btn small danger onClick={() => del(v.id)} style={delId === v.id ? { background: "#8B0000" } : {}}>
                {delId === v.id ? "Sure?" : "✕"}
              </Btn>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#777" }}>
            {fmtD(v.date)} {v.storeType && `• ${v.storeType}`} {v.contact && `• ${v.contact}`}{" "}
            {Number(v.publicPrice) > 0 && `• ${fmt(v.publicPrice as number)}/bag`}
          </div>
          {v.notes && (
            <div style={{ fontSize: 12, color: "#555", marginTop: 4, lineHeight: 1.4 }}>
              {v.notes.length > 150 ? v.notes.slice(0, 150) + "..." : v.notes}
            </div>
          )}
          {v.productsSeen && v.productsSeen.length > 0 && (
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
              {v.productsSeen.map(p => (
                <span key={p} style={{ fontSize: 10, padding: "1px 6px", background: "#f0f0f0", borderRadius: 3, color: "#666" }}>
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── FieldExport ──────────────────────────────────────────────────────
interface FieldExportProps {
  visits: Visit[];
}

export const FieldExport = ({ visits }: FieldExportProps) => {
  const exportVisits = () => {
    const lines = visits
      .map(v =>
        [
          `STORE: ${v.storeName}`,
          `Zone: ${v.zone || "—"} | Type: ${v.storeType || "—"} | Date: ${fmtD(v.date)}`,
          `Contact: ${v.contact || "—"} | Phone: ${v.phone || "—"}`,
          `Address: ${v.address || "—"}`,
          `Brand on shelf: ${v.brand || "—"}`,
          `Products seen: ${v.productsSeen?.join(", ") || "—"}`,
          `Supplier: ${v.supplier || "—"} | Public price: ${v.publicPrice ? fmt(v.publicPrice as number) : "—"}`,
          `Interest: ${v.interest || "—"} | Foot traffic: ${v.footTraffic || "—"}`,
          `Left samples: ${v.leftSamples ? `Yes (${v.samplesQty || "?"})` : "No"}`,
          v.painPoints ? `Pain points: ${v.painPoints}` : null,
          v.competitorProducts ? `Competitors: ${v.competitorProducts}` : null,
          v.notes ? `Notes: ${v.notes}` : null,
          "─".repeat(50),
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n");
    const header = `DULCE SABOR — Field Intelligence Report\nExported: ${new Date().toLocaleString()}\nTotal visits: ${visits.length}\n${"═".repeat(50)}\n\n`;
    const blob = new Blob([header + lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DulceSabor_FieldData_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ background: "#EBF5FB", borderRadius: 8, padding: "16px 20px", marginBottom: 16, borderLeft: "4px solid #1A5276" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1A5276", marginBottom: 6 }}>
          Export field data for AI analysis
        </div>
        <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>
          Download your visit data as a text file, then upload it to Claude for a full intelligence
          report — pricing analysis, competitive map, and follow-up plan. Free and with full context
          of your business.
        </div>
      </div>
      <Btn primary onClick={exportVisits} disabled={visits.length === 0}>
        Export {visits.length} visit{visits.length !== 1 ? "s" : ""} for analysis
      </Btn>
      {visits.length === 0 && (
        <p style={{ color: "#999", fontSize: 12, marginTop: 8 }}>Add visits first in the Visits tab.</p>
      )}
      {visits.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <ST>Preview ({visits.length} visits)</ST>
          {visits.slice(-5).reverse().map(v => (
            <div key={v.id} style={{ padding: "6px 0", borderBottom: "1px solid #f0f0f0", fontSize: 12 }}>
              <b>{v.storeName}</b>{" "}
              <span style={{ color: "#999" }}>
                {v.zone} • {fmtD(v.date)}
              </span>{" "}
              {v.brand && <Badge text={v.brand} color={BRAND_CLR[v.brand] || "#888"} />}{" "}
              {v.interest && <Badge text={v.interest} color={v.interest.includes("Very") ? "#1B7340" : "#D35400"} />}
            </div>
          ))}
          {visits.length > 5 && (
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>...and {visits.length - 5} more</div>
          )}
        </div>
      )}
    </div>
  );
};
