// src/components/Clients.tsx
//
// CRUD de clientes del CRM + publicación en dulcesaborca.com/donde-comprar.
// Extraído de App.tsx en Block 4.e del refactor (May 2026).
//
// Las tres funciones de sync con Supabase (syncClientToPublicStores,
// syncAllPublicStores, uploadStorePhoto) se inyectan como props desde
// App.tsx porque dependen de un cluster de constantes module-level
// (cloudEnabled, SUPA_URL/KEY/HEADERS, STORE_PHOTOS_BUCKET) y helpers
// (getRecentProducts, lastOrderDate, pF). Moverlas a lib/publicStores.ts
// arrastraría todo ese cluster; se hace en un bloque futuro aislado.
//
// Constantes (ZONES, TIERS, TIER_CLR, FOLLOWUP_DAYS, PUBLIC_INACTIVE_DAYS)
// y helpers locales (dSince, cleanPhone, waLink, WaBtn) están duplicados
// inline. Misma deuda técnica aceptada que en Welcomes.tsx / Field.tsx.

import React, { useState, useRef } from "react";
import type { Dispatch, SetStateAction, ChangeEvent } from "react";

import type {
  Client,
  ClientFormState,
  ClientTier,
  Order,
  Representative,
} from "../types/domain";
import { Badge, Btn, Modal, Inp } from "./ui";
import { fmt, fmtD, uid } from "../lib/format";

// ============================================================
// Constantes y helpers locales (duplicación temporal con App.tsx)
// ============================================================

const ZONES: readonly string[] = [
  "Santa Rosa / Sonoma",
  "Sacramento",
  "San Jose / Bay Area",
  "Mendocino / Ukiah",
  "Oakland / Bay Area",
  "Other",
];

const TIERS: readonly ClientTier[] = ["Lista", "Bronce", "Plata", "Oro"];

const TIER_CLR: Record<ClientTier, string> = {
  Lista: "#888",
  Bronce: "#996633",
  Plata: "#1A5276",
  Oro: "#1B7340",
};

/** Días sin pedido tras los cuales el cliente se marca para follow-up. */
const FOLLOWUP_DAYS = 21;

/** Días sin pedido tras los cuales una tienda "pública" se considera inactiva
 *  y se muestra warning en el card. */
const PUBLIC_INACTIVE_DAYS = 90;

/** Días enteros transcurridos desde una fecha (truncado). */
const dSince = (d: string | number | Date): number => {
  try {
    return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  } catch {
    return 999;
  }
};

/** Normaliza un teléfono US a 11 dígitos con prefijo "1". Idéntico a App.tsx. */
const cleanPhone = (ph: string): string => {
  if (!ph) return "";
  return ph.replace(/[^0-9]/g, "").replace(/^1?(\d{10})$/, "1$1");
};

/** Deep link de WhatsApp con teléfono normalizado y mensaje URL-encoded. */
const waLink = (phone: string, msg: string): string =>
  `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(msg)}`;

interface WaBtnProps {
  phone: string;
  msg: string;
  label?: string;
  small?: boolean;
}

const WaBtn: React.FC<WaBtnProps> = ({ phone, msg, label, small }) => (
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
// Tipos públicos del módulo
// ============================================================

/** Resultado de una operación de sync individual. */
export interface SyncResult {
  ok: boolean;
  action?: "published" | "removed";
  error?: string;
}

/** Resultado del sync masivo. */
export interface BulkSyncResult {
  ok: boolean;
  published?: number;
  removed?: number;
  errors?: number;
  error?: string;
}

interface ClientsProps {
  clients: Client[];
  setClients: Dispatch<SetStateAction<Client[]>>;
  orders: Order[];
  representatives: Representative[];
  saveAll: (type: string, data: unknown) => void;

  // ---- Sync a Supabase (inyectadas desde App.tsx) ----
  syncClientToPublicStores: (client: Client, orders: Order[]) => Promise<SyncResult>;
  syncAllPublicStores: (clients: Client[], orders: Order[]) => Promise<BulkSyncResult>;
  uploadStorePhoto: (file: File, clientId: string) => Promise<string | null>;
}

// ============================================================
// Componente
// ============================================================

export const Clients: React.FC<ClientsProps> = ({
  clients,
  setClients,
  orders,
  representatives,
  saveAll,
  syncClientToPublicStores,
  syncAllPublicStores,
  uploadStorePhoto,
}) => {
  const emptyForm: ClientFormState = {
    name: "",
    address: "",
    phone: "",
    email: "",
    contact: "",
    zone: "",
    tier: "Lista",
    notes: "",
    showOnWebsite: false,
    publicDisplayName: "",
    publicHours: "",
    publicPhotoUrl: "",
    websitePermissionDate: "",
    permissionConfirmed: false,
    representativeId: "",
    priorHistoryBeforeRep: false,
    language: "es"
  };

  const [sf, setSf] = useState<boolean>(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [delC, setDelC] = useState<string | null>(null);
  const delRef = useRef<string | null>(null);
  const [form, setForm] = useState<ClientFormState>(emptyForm);
  const [search, setSearch] = useState<string>("");
  const [showWebSection, setShowWebSection] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bulkSyncing, setBulkSyncing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openN = () => {
    setForm(emptyForm);
    setEdit(null);
    setShowWebSection(false);
    setSf(true);
  };

  const openE = (c: Client) => {
    setForm({ ...emptyForm, ...c });
    setEdit(c.id);
    setShowWebSection(!!c.showOnWebsite);
    setSf(true);
  };

  const save = async () => {
    if (!form.name) return;
    // Si marcó publicar, exigir confirmación de permiso
    if (form.showOnWebsite && !form.permissionConfirmed && !form.websitePermissionDate) {
      setSyncMsg({ ok: false, text: "⚠️ Confirma que el cliente dio permiso antes de publicar" });
      return;
    }
    const permDate =
      form.showOnWebsite && !form.websitePermissionDate
        ? new Date().toISOString().slice(0, 10)
        : form.websitePermissionDate;
    const cleanForm = { ...form, websitePermissionDate: permDate };

    let savedClient: Client | undefined;
    if (edit) {
      setClients(prev => {
        const n = prev.map(c => {
          if (c.id !== edit) return c;
          savedClient = { ...c, ...cleanForm };
          return savedClient;
        });
        saveAll("clients", n);
        return n;
      });
    } else {
      savedClient = { ...cleanForm, id: uid(), created: new Date().toISOString() };
      setClients(prev => {
        const n = [...prev, savedClient as Client];
        saveAll("clients", n);
        return n;
      });
    }
    // Sync a public_stores si está marcado o si era público y se desmarcó
    if (savedClient && (cleanForm.showOnWebsite || edit)) {
      const result = await syncClientToPublicStores(savedClient, orders);
      if (!result.ok && cleanForm.showOnWebsite) {
        setSyncMsg({ ok: false, text: "⚠️ Cliente guardado pero falló sincronización con sitio web" });
        return;
      }
    }
    setSf(false);
    setSyncMsg(null);
  };

  const del = (id: string) => {
    if (delRef.current === id) {
      const c = clients.find(x => x.id === id);
      if (c?.showOnWebsite) {
        syncClientToPublicStores({ ...c, showOnWebsite: false }, orders);
      }
      setClients(prev => {
        const n = prev.filter(x => x.id !== id);
        saveAll("clients", n);
        return n;
      });
      delRef.current = null;
      setDelC(null);
    } else {
      delRef.current = id;
      setDelC(id);
      setTimeout(() => {
        if (delRef.current === id) {
          delRef.current = null;
          setDelC(null);
        }
      }, 3000);
    }
  };

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setSyncMsg({ ok: false, text: "⚠️ Foto muy grande (máx 5MB)" });
      return;
    }
    setUploading(true);
    setSyncMsg(null);
    const clientId = edit || `temp-${Date.now()}`;
    const url = await uploadStorePhoto(file, clientId);
    setUploading(false);
    if (url) {
      setForm(p => ({ ...p, publicPhotoUrl: url }));
      setSyncMsg({ ok: true, text: "✓ Foto subida" });
    } else {
      setSyncMsg({ ok: false, text: "⚠️ Error al subir foto" });
    }
    e.target.value = "";
  };

  const handleBulkSync = async () => {
    setBulkSyncing(true);
    const result = await syncAllPublicStores(clients, orders);
    setBulkSyncing(false);
    setSyncMsg({
      ok: result.ok,
      text: result.ok
        ? `✓ Sincronizado: ${result.published ?? 0} publicados, ${result.removed ?? 0} removidos`
        : `⚠️ ${result.errors ?? 0} errores durante sync`,
    });
    setTimeout(() => setSyncMsg(null), 5000);
  };

  const fil = clients.filter(
    c =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.zone?.toLowerCase().includes(search.toLowerCase()) ||
      c.contact?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients..."
          style={{ padding: "7px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, flex: 1, maxWidth: 280 }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <Btn small onClick={handleBulkSync} disabled={bulkSyncing}>
            {bulkSyncing ? "Sincronizando..." : "🔄 Sync sitio web"}
          </Btn>
          <Btn primary onClick={openN}>+ New client</Btn>
        </div>
      </div>

      {syncMsg && !sf && (
        <div
          style={{
            padding: "8px 12px",
            marginBottom: 10,
            background: syncMsg.ok ? "#E8F5E9" : "#FDE8E8",
            color: syncMsg.ok ? "#1B7340" : "#C41E3A",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {syncMsg.text}
        </div>
      )}

      {fil.length === 0 && (
        <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 40 }}>
          No clients. Click "+ New client".
        </p>
      )}

      {fil.map(c => {
        const co = orders.filter(o => o.clientId === c.id);
        const last =
          co.length > 0
            ? co.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
            : null;
        const ts = co.reduce((s, o) => s + (o.total || 0), 0);
        const days = last ? dSince(last.date) : null;
        const fu = days !== null && days > FOLLOWUP_DAYS;
        const publicInactive = c.showOnWebsite && (days === null || days > PUBLIC_INACTIVE_DAYS);
        return (
          <div
            key={c.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              background: publicInactive ? "#FFF8E1" : fu ? "#FDF2E9" : "#fff",
              border: "1px solid #eee",
              borderRadius: 8,
              marginBottom: 5,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                <Badge text={c.tier} color={TIER_CLR[c.tier]} />
                {c.zone && <Badge text={c.zone} color="#6C3483" />}
                {c.showOnWebsite && <Badge text="🌐 Web" color="#1A5276" />}
                {c.representativeId && (
                  <Badge
                    text={`🧑‍💼 ${
                      (representatives || []).find(r => r.id === c.representativeId)?.name?.split(" ")[0] || "Rep"
                    }`}
                    color="#6C3483"
                  />
                )}
                {publicInactive && <Badge text="⚠️ +90d inactivo" color="#D35400" />}
                {fu && !publicInactive && <Badge text={`${days}d — follow up!`} color="#D35400" />}
              </div>
              <div style={{ fontSize: 12, color: "#777" }}>
                {[c.contact, c.phone].filter(Boolean).join(" • ")}
              </div>
            </div>
            <div style={{ textAlign: "right", marginRight: 10, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {co.length} orders • {fmt(ts)}
              </div>
              <div style={{ fontSize: 11, color: "#999" }}>
                {last ? `Last: ${fmtD(last.date)}` : "No orders"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {c.phone && (
                <WaBtn
                  phone={c.phone}
                  msg={`Hola ${c.contact || c.name}, soy José de Dulce Sabor.\n\n¿Cómo van las ventas de Slaps? ¿Listo para un reorden?\n\nOrdena en línea: https://dulcesaborca.com\n(707) 360-7420`}
                  label="WA"
                  small
                />
              )}
              <Btn small onClick={() => openE(c)}>Edit</Btn>
              <Btn
                small
                danger
                onClick={() => del(c.id)}
                style={delC === c.id ? { minWidth: 52, background: "#8B0000" } : {}}
              >
                {delC === c.id ? "Sure?" : "✕"}
              </Btn>
            </div>
          </div>
        );
      })}

      {sf && (
        <Modal title={edit ? "Edit client" : "New client"} onClose={() => setSf(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Inp
              label="Store name *"
              value={form.name}
              onChange={v => setForm(p => ({ ...p, name: v }))}
              placeholder="Dulceria Mi Carnaval"
            />
            <Inp
              label="Contact"
              value={form.contact}
              onChange={v => setForm(p => ({ ...p, contact: v }))}
              placeholder="Juan Pérez"
            />
            <Inp
              label="Phone"
              value={form.phone}
              onChange={v => setForm(p => ({ ...p, phone: v }))}
              placeholder="(408) 555-1234"
            />
            <Inp
              label="Email"
              value={form.email}
              onChange={v => setForm(p => ({ ...p, email: v }))}
              placeholder="cliente@correo.com"
            />
            <Inp
              label="Zone"
              value={form.zone}
              onChange={v => setForm(p => ({ ...p, zone: v }))}
              options={ZONES}
            />
            <Inp
              label="Tier"
              value={form.tier}
              onChange={v => setForm(p => ({ ...p, tier: v as ClientTier }))}
              options={TIERS}
            />
            <Inp
              label="Address"
              value={form.address}
              onChange={v => setForm(p => ({ ...p, address: v }))}
              placeholder="1161 E Santa Clara St"
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 3 }}>
              Idioma para recibos / WhatsApp
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              {(["es", "en"] as const).map(opt => (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="radio"
                    name="client-language"
                    checked={form.language === opt}
                    onChange={() => setForm(p => ({ ...p, language: opt }))}
                  />
                  {opt === "es" ? "Español" : "English"}
                </label>
              ))}
            </div>
          </div>
          <Inp
            label="Notes"
            value={form.notes}
            onChange={v => setForm(p => ({ ...p, notes: v }))}
            textarea
          />

          {/* === REPRESENTANTE ASIGNADO (Deploy A) === */}
          <div style={{ marginTop: 12, padding: "10px 14px", border: "1px solid #d4ebd4", background: "#f4faf4", borderRadius: 8 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#1B7340", marginBottom: 6 }}>
              🧑‍💼 Representante asignado
            </label>
            <select
              value={form.representativeId || ""}
              onChange={e => setForm(p => ({ ...p, representativeId: e.target.value }))}
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, marginBottom: 8 }}
            >
              <option value="">— Cuenta directa de José (sin representante) —</option>
              {(representatives || []).map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {form.representativeId && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: 8, background: "#FFF8E1", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={!!form.priorHistoryBeforeRep}
                  onChange={e => setForm(p => ({ ...p, priorHistoryBeforeRep: e.target.checked }))}
                  style={{ width: 16, height: 16, marginTop: 2 }}
                />
                <span>
                  <b>Historia previa:</b> este cliente ya nos compraba antes de ser asignado al representante. (Sus pedidos contarán como <b>residual 5%</b>, no como cuenta nueva 7%.)
                </span>
              </label>
            )}
          </div>

          {/* === SECCIÓN PUBLICAR EN SITIO WEB (v5.10) === */}
          <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
            <button
              onClick={() => setShowWebSection(s => !s)}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: form.showOnWebsite ? "#E3F2FD" : "#F8F8F8",
                border: "none",
                textAlign: "left",
                fontSize: 13,
                fontWeight: 700,
                color: "#1A5276",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>🌐 Publicar en dulcesaborca.com {form.showOnWebsite && "✓"}</span>
              <span style={{ fontSize: 16 }}>{showWebSection ? "▾" : "▸"}</span>
            </button>
            {showWebSection && (
              <div style={{ padding: "12px 14px", background: "#fff" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={!!form.showOnWebsite}
                    onChange={e => setForm(p => ({ ...p, showOnWebsite: e.target.checked }))}
                    style={{ width: 18, height: 18 }}
                  />
                  Mostrar esta tienda en /donde-comprar
                </label>
                {form.showOnWebsite && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                      <Inp
                        label="Nombre comercial (opcional)"
                        value={form.publicDisplayName}
                        onChange={v => setForm(p => ({ ...p, publicDisplayName: v }))}
                        placeholder={form.name || "Si distinto al legal"}
                      />
                      <Inp
                        label="Horario público"
                        value={form.publicHours}
                        onChange={v => setForm(p => ({ ...p, publicHours: v }))}
                        placeholder="Lun-Sáb 9am-8pm"
                      />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 5 }}>
                        Foto del local
                      </label>
                      {form.publicPhotoUrl && (
                        <div style={{ marginBottom: 6 }}>
                          <img
                            src={form.publicPhotoUrl}
                            alt="Local"
                            style={{ maxWidth: 200, maxHeight: 120, borderRadius: 6, border: "1px solid #ddd" }}
                          />
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        style={{ display: "none" }}
                      />
                      <Btn small onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        {uploading ? "Subiendo..." : form.publicPhotoUrl ? "📷 Cambiar foto" : "📷 Subir foto"}
                      </Btn>
                      {form.publicPhotoUrl && (
                        <Btn small onClick={() => setForm(p => ({ ...p, publicPhotoUrl: "" }))} style={{ marginLeft: 6 }}>
                          Quitar
                        </Btn>
                      )}
                    </div>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, padding: 10, background: "#FFF8E1", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={!!form.permissionConfirmed}
                        onChange={e => setForm(p => ({ ...p, permissionConfirmed: e.target.checked }))}
                        style={{ width: 16, height: 16, marginTop: 2 }}
                      />
                      <span>
                        <b>Confirmo</b> que el cliente me dio permiso para publicar su negocio en dulcesaborca.com (foto, dirección, horario y WhatsApp).
                        {form.websitePermissionDate && (
                          <span style={{ color: "#777" }}> — Permiso desde: {fmtD(form.websitePermissionDate)}</span>
                        )}
                      </span>
                    </label>
                  </>
                )}
                {syncMsg && (
                  <div
                    style={{
                      padding: "6px 10px",
                      marginTop: 10,
                      background: syncMsg.ok ? "#E8F5E9" : "#FDE8E8",
                      color: syncMsg.ok ? "#1B7340" : "#C41E3A",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    {syncMsg.text}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <Btn onClick={() => { setSf(false); setSyncMsg(null); }}>Cancel</Btn>
            <Btn primary onClick={save}>{edit ? "Update" : "Add"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Clients;
