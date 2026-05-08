// src/components/Representatives.tsx
//
// CRUD del catálogo de representantes de venta.
// Muestra contratos, milestones cobrados, fase 2, fecha de terminación.
// Calcula en vivo cuántas cuentas activas tiene cada rep.
//
// Extraído de App.jsx en Sesión 2 bloque 4 del refactor.

import { useState } from "react";
import type { Client, Order, Representative } from "../types/domain";
import { MILESTONES } from "../lib/contract";
import { isActiveAccount } from "../lib/business/commissions";
import { fmt, fmtD, uid } from "../lib/format";
import { Btn, Badge, Modal, Inp } from "./ui";

interface RepresentativesProps {
  representatives: Representative[];
  setRepresentatives: React.Dispatch<React.SetStateAction<Representative[]>>;
  clients: Client[];
  orders: Order[];
  /** Persistencia genérica del CRM (`sv` en App.tsx). */
  saveAll: (type: string, data: unknown) => void;
}

/** Form state — paralelo a Representative pero todo es editable string-friendly. */
type RepForm = Omit<Representative, "id" | "created">;

const emptyForm: RepForm = {
  name: "",
  phone: "",
  email: "",
  contractDate: "",
  phase2Active: false,
  phase2StartDate: "",
  milestonesPaid: [],
  terminatedDate: "",
  notes: "",
};

export const Representatives = ({
  representatives,
  setRepresentatives,
  clients,
  orders,
  saveAll,
}: RepresentativesProps) => {
  const [sf, setSf] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [form, setForm] = useState<RepForm>(emptyForm);
  const [delConfirm, setDelConfirm] = useState<string | null>(null);

  const openN = () => {
    setForm(emptyForm);
    setEdit(null);
    setSf(true);
  };
  const openE = (r: Representative) => {
    setForm({ ...emptyForm, ...r, milestonesPaid: r.milestonesPaid || [] });
    setEdit(r.id);
    setSf(true);
  };

  const save = () => {
    if (!form.name) return;
    if (edit) {
      setRepresentatives(prev => {
        const n = prev.map(r => (r.id === edit ? { ...r, ...form } : r));
        saveAll("representatives", n);
        return n;
      });
    } else {
      const newRep: Representative = {
        ...form,
        id: uid(),
        created: new Date().toISOString(),
      };
      setRepresentatives(prev => {
        const n = [...prev, newRep];
        saveAll("representatives", n);
        return n;
      });
    }
    setSf(false);
  };

  const del = (id: string) => {
    if (delConfirm === id) {
      setRepresentatives(prev => {
        const n = prev.filter(r => r.id !== id);
        saveAll("representatives", n);
        return n;
      });
      setDelConfirm(null);
    } else {
      setDelConfirm(id);
      setTimeout(() => setDelConfirm(null), 3000);
    }
  };

  // Resumen total de comisiones cobradas para un rep.
  // FIXME (bug pre-existente, pendiente fix separado): lee de
  // localStorage("dulcesabor-crm") pero el resto de la app guarda en
  // localStorage("megapg-data"). Esto hace que `paidTotal` siempre devuelva 0.
  // El fix correcto es pasar `commissions` como prop y filtrar desde ahí.
  const totalPaidForRep = (repId: string): number => {
    try {
      const raw = localStorage.getItem("dulcesabor-crm") || "{}";
      const data = JSON.parse(raw) as { commissions?: Array<{ representativeId: string; status: string; totalAmount?: number }> };
      return (data.commissions || [])
        .filter(c => c.representativeId === repId && c.status === "paid")
        .reduce((s, c) => s + (c.totalAmount || 0), 0);
    } catch {
      return 0;
    }
  };

  return (
    <div>
      <div style={{ background: "#F4ECF7", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #6C3483" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#6C3483", marginBottom: 4 }}>🧑‍💼 Representantes</div>
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>
          Gestiona contratos de representantes de venta. Cada cliente puede tener un representante asignado en su ficha. Las comisiones se calculan en el tab "Comisiones".
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Btn primary onClick={openN}>+ Nuevo representante</Btn>
      </div>
      {representatives.length === 0 && (
        <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 40 }}>
          No hay representantes. Clic "+ Nuevo representante".
        </p>
      )}
      {representatives.map(r => {
        const assigned = clients.filter(c => c.representativeId === r.id);
        const active = assigned.filter(c => isActiveAccount(c.id, orders)).length;
        const paidTotal = totalPaidForRep(r.id);
        return (
          <div key={r.id} style={{ background: "#fff", border: "1px solid #eee", borderLeft: "4px solid #6C3483", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#333" }}>
                  {r.name}{" "}
                  {r.phase2Active && <Badge text="Fase 2" color="#1B7340" />}{" "}
                  {r.terminatedDate && <Badge text="Terminado" color="#888" />}
                </div>
                <div style={{ fontSize: 12, color: "#777", marginTop: 3 }}>
                  {[r.phone, r.email].filter(Boolean).join(" • ") || "Sin contacto"}
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                  <b>{assigned.length}</b> cuenta{assigned.length !== 1 ? "s" : ""} asignada{assigned.length !== 1 ? "s" : ""} •{" "}
                  <b>{active}</b> activa{active !== 1 ? "s" : ""} (90d) •{" "}
                  <b>{fmt(paidTotal)}</b> cobrado total
                </div>
                {r.contractDate && (
                  <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                    Contrato: {fmtD(r.contractDate)}
                    {r.phase2Active && r.phase2StartDate ? ` • Fase 2 desde ${fmtD(r.phase2StartDate)}` : ""}
                  </div>
                )}
                {(r.milestonesPaid || []).length > 0 && (
                  <div style={{ fontSize: 11, color: "#1B7340", marginTop: 2 }}>
                    Milestones cobrados: {r.milestonesPaid.join(", ")}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Btn small onClick={() => openE(r)}>Edit</Btn>
                <Btn
                  small
                  danger
                  onClick={() => del(r.id)}
                  style={delConfirm === r.id ? { background: "#8B0000" } : {}}
                >
                  {delConfirm === r.id ? "Sure?" : "✕"}
                </Btn>
              </div>
            </div>
          </div>
        );
      })}

      {sf && (
        <Modal title={edit ? "Editar representante" : "Nuevo representante"} onClose={() => setSf(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Inp label="Nombre *" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Francisco Carbajal" />
            <Inp label="Teléfono" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} placeholder="(707) 555-1234" />
            <Inp label="Email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} placeholder="rep@ejemplo.com" />
            <Inp label="Fecha de contrato" type="date" value={form.contractDate} onChange={v => setForm(p => ({ ...p, contractDate: v }))} />
          </div>
          <div style={{ marginTop: 10, padding: "10px 14px", background: "#f4faf4", border: "1px solid #d4ebd4", borderRadius: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1B7340" }}>
              <input
                type="checkbox"
                checked={!!form.phase2Active}
                onChange={e =>
                  setForm(p => ({
                    ...p,
                    phase2Active: e.target.checked,
                    phase2StartDate:
                      e.target.checked && !p.phase2StartDate
                        ? new Date().toISOString().slice(0, 10)
                        : p.phase2StartDate,
                  }))
                }
                style={{ width: 18, height: 18 }}
              />
              Fase 2 activa (rev share +2% adicional)
            </label>
            {form.phase2Active && (
              <div style={{ marginTop: 8 }}>
                <Inp label="Inicio Fase 2" type="date" value={form.phase2StartDate} onChange={v => setForm(p => ({ ...p, phase2StartDate: v }))} />
              </div>
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>
              Milestones cobrados (§4.4)
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {MILESTONES.map(m => {
                const paid = (form.milestonesPaid || []).includes(m.count);
                return (
                  <label
                    key={m.count}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "6px 12px",
                      border: `1px solid ${paid ? "#1B7340" : "#ddd"}`,
                      borderRadius: 6,
                      background: paid ? "#E8F5E9" : "#fff",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={paid}
                      onChange={e =>
                        setForm(p => ({
                          ...p,
                          milestonesPaid: e.target.checked
                            ? [...(p.milestonesPaid || []), m.count]
                            : (p.milestonesPaid || []).filter(x => x !== m.count),
                        }))
                      }
                    />
                    {m.count} cuentas → {fmt(m.bonus)}
                  </label>
                );
              })}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <Inp label="Fecha de terminación (si aplica)" type="date" value={form.terminatedDate} onChange={v => setForm(p => ({ ...p, terminatedDate: v }))} />
          </div>
          <Inp label="Notas" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} textarea />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <Btn onClick={() => setSf(false)}>Cancel</Btn>
            <Btn primary onClick={save}>{edit ? "Update" : "Add"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};
