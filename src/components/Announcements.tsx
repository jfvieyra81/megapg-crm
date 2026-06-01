// src/components/Announcements.tsx
//
// Anuncios masivos: compone un mensaje, filtra destinatarios por tier (y
// opcionalmente "solo con teléfono"), guarda/carga plantillas y, en el paso
// "send", copias/marcas cada envío uno por uno. El progreso (sentIds) se
// persiste vía saveAll para sobrevivir cierres de ventana.
//
// Extraído de App.tsx en el Block 4.g del refactor (May 2026).
//
// Tipos: Template y Campaign se añadieron a types/domain.ts (mismo criterio
// que ClientFormState en el Block 4.e) — ambos son entidades PERSISTIDAS
// (saveAll("templates" | "campaign", ...)), no estado de vista efímero.
//
// Constantes locales (TIERS, TIER_CLR) duplicadas inline: misma deuda técnica
// aceptada que en Clients.tsx / Dashboard.tsx. Se centralizan en un bloque
// futuro, cuando App.tsx deje de tener sus propias copias.

import { useState, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { Client, ClientTier, Template, Campaign } from "../types/domain";
import { Badge, Btn } from "./ui";
import { uid } from "../lib/format";
import { WaBtn } from "../lib/whatsapp";

const TIERS: readonly ClientTier[] = ["Lista", "Bronce", "Plata", "Oro"];
const TIER_CLR: Record<ClientTier, string> = { Lista: "#888", Bronce: "#996633", Plata: "#1A5276", Oro: "#1B7340" };

interface AnnouncementsProps {
  clients: Client[];
  templates: Template[];
  setTemplates: Dispatch<SetStateAction<Template[]>>;
  campaign: Campaign;
  setCampaign: Dispatch<SetStateAction<Campaign>>;
  saveAll: (type: string, data: unknown) => void;
}

export const Announcements = ({ clients, templates, setTemplates, campaign, setCampaign, saveAll }: AnnouncementsProps) => {
  const [step, setStep] = useState<"compose" | "send">(campaign.message ? "send" : "compose");
  const [showSave, setShowSave] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [delTemplateConf, setDelTemplateConf] = useState<string | null>(null);
  const delTemplateRef = useRef<string | null>(null);
  const [resetCampConf, setResetCampConf] = useState(false);
  const resetCampRef = useRef(false);

  const tiers: ClientTier[] = campaign.tiers || ["Lista", "Bronce", "Plata", "Oro"];
  const message = campaign.message || "";
  const sentIds: string[] = campaign.sentIds || [];
  const withPhoneOnly = campaign.withPhoneOnly !== false;

  const updateCampaign = (patch: Partial<Campaign>) => {
    const updated = { ...campaign, ...patch };
    setCampaign(updated);
    saveAll("campaign", updated);
  };

  const toggleTier = (tier: ClientTier) => {
    const next = tiers.includes(tier) ? tiers.filter(t => t !== tier) : [...tiers, tier];
    updateCampaign({ tiers: next });
  };

  // Filter recipients by tier and phone requirement
  const recipients = clients.filter(c =>
    tiers.includes(c.tier) && (!withPhoneOnly || c.phone)
  );

  const personalize = (msg: string, client: Client) => {
    if (!msg) return "";
    return msg
      .replace(/\{nombre\}/g, client.contact || client.name || "")
      .replace(/\{negocio\}/g, client.name || "");
  };

  const loadTemplate = (templateId: string) => {
    if (!templateId) { updateCampaign({ message: "" }); return; }
    const t = templates.find(tt => tt.id === templateId);
    if (t) updateCampaign({ message: t.body });
  };

  const saveTemplate = () => {
    if (!newTemplateName.trim() || !message.trim()) return;
    const newT: Template = { id: uid(), name: newTemplateName.trim(), body: message, createdAt: new Date().toISOString() };
    const updated = [...templates, newT];
    setTemplates(updated);
    saveAll("templates", updated);
    setShowSave(false);
    setNewTemplateName("");
  };

  const deleteTemplate = (templateId: string) => {
    if (delTemplateRef.current === templateId) {
      const updated = templates.filter(t => t.id !== templateId);
      setTemplates(updated);
      saveAll("templates", updated);
      delTemplateRef.current = null;
      setDelTemplateConf(null);
    } else {
      delTemplateRef.current = templateId;
      setDelTemplateConf(templateId);
      setTimeout(() => { if (delTemplateRef.current === templateId) { delTemplateRef.current = null; setDelTemplateConf(null); } }, 3000);
    }
  };

  const prepareSend = () => {
    if (!message.trim() || recipients.length === 0) return;
    setStep("send");
  };

  const backToCompose = () => setStep("compose");

  const resetCampaign = () => {
    if (resetCampRef.current) {
      const cleared: Campaign = { tiers: ["Lista", "Bronce", "Plata", "Oro"], message: "", sentIds: [], withPhoneOnly: true };
      setCampaign(cleared);
      saveAll("campaign", cleared);
      setStep("compose");
      resetCampRef.current = false;
      setResetCampConf(false);
    } else {
      resetCampRef.current = true;
      setResetCampConf(true);
      setTimeout(() => { if (resetCampRef.current) { resetCampRef.current = false; setResetCampConf(false); } }, 3000);
    }
  };

  const copyMsg = async (client: Client) => {
    try {
      await navigator.clipboard.writeText(personalize(message, client));
      setCopied(client.id);
      setTimeout(() => setCopied(null), 2000);
    } catch { alert("Copy falló"); }
  };

  const toggleSent = (clientId: string) => {
    const next = sentIds.includes(clientId) ? sentIds.filter(id => id !== clientId) : [...sentIds, clientId];
    updateCampaign({ sentIds: next });
  };

  // COMPOSE STEP
  if (step === "compose") {
    return <div>
      <div style={{ background: "#F4ECF7", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #6C3483" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#6C3483", marginBottom: 4 }}>Anuncios masivos</div>
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>Manda un mensaje a varios clientes a la vez. Selecciona los tiers, escribe (o carga) un mensaje, y en el siguiente paso copias y pegas uno por uno. Usa <code style={{ background: "#fff", padding: "1px 4px", borderRadius: 3 }}>{"{nombre}"}</code> para el contacto y <code style={{ background: "#fff", padding: "1px 4px", borderRadius: 3 }}>{"{negocio}"}</code> para el nombre del negocio.</div>
      </div>
      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: "16px 18px", marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>1. Elige tiers</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {TIERS.map(t => {
            const active = tiers.includes(t);
            return <button key={t} onClick={() => toggleTier(t)} style={{ padding: "6px 14px", border: `1px solid ${active ? TIER_CLR[t] : "#ddd"}`, borderRadius: 20, background: active ? TIER_CLR[t] : "#fff", color: active ? "#fff" : "#666", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{active ? "✓ " : ""}{t}</button>;
          })}
        </div>
        <label style={{ fontSize: 12, color: "#555", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={withPhoneOnly} onChange={e => updateCampaign({ withPhoneOnly: e.target.checked })} />
          Solo clientes con teléfono
        </label>
      </div>
      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: "16px 18px", marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>2. Mensaje</label>
        {templates.length > 0 && <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#777", marginBottom: 4 }}>Cargar plantilla guardada:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {templates.map(t => <div key={t.id} style={{ display: "inline-flex", alignItems: "center", background: "#f0f0f0", borderRadius: 20, padding: "3px 4px 3px 12px", gap: 4 }}>
              <button onClick={() => loadTemplate(t.id)} style={{ background: "none", border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#333" }}>{t.name}</button>
              <button onClick={() => deleteTemplate(t.id)} style={{ background: delTemplateConf === t.id ? "#C41E3A" : "#ddd", color: delTemplateConf === t.id ? "#fff" : "#666", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{delTemplateConf === t.id ? "?" : "✕"}</button>
            </div>)}
          </div>
        </div>}
        <textarea value={message} onChange={e => updateCampaign({ message: e.target.value })} rows={8} placeholder="Hola {nombre}, te queremos contar que..." style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
        {!showSave ? <Btn small onClick={() => setShowSave(true)} disabled={!message.trim()} style={{ marginTop: 8 }}>💾 Guardar como plantilla</Btn>
          : <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
            <input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} placeholder="Nombre de la plantilla" style={{ flex: 1, padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12 }} autoFocus />
            <Btn small primary onClick={saveTemplate} disabled={!newTemplateName.trim()}>Guardar</Btn>
            <Btn small onClick={() => { setShowSave(false); setNewTemplateName(""); }}>Cancelar</Btn>
          </div>}
      </div>
      <div style={{ background: "#E8F5E8", border: "1px solid #1B7340", borderRadius: 8, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "#1B7340", fontWeight: 600 }}>📨 Se enviará a</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#1B7340" }}>{recipients.length} cliente{recipients.length !== 1 ? "s" : ""}</div>
        </div>
        <Btn primary onClick={prepareSend} disabled={!message.trim() || recipients.length === 0}>Preparar envíos →</Btn>
      </div>
    </div>;
  }

  // SEND STEP
  const sentCount = sentIds.length;
  const pct = recipients.length > 0 ? Math.round(sentCount / recipients.length * 100) : 0;
  return <div>
    <div style={{ background: "#F4ECF7", borderRadius: 8, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #6C3483" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#6C3483", marginBottom: 4 }}>Enviando anuncio a {recipients.length} cliente{recipients.length !== 1 ? "s" : ""}</div>
          <div style={{ fontSize: 12, color: "#555" }}>Copia el mensaje de cada cliente, pégalo en WhatsApp, y marca como enviado. Tu progreso se guarda aunque cierres la ventana.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn small onClick={backToCompose}>← Volver a editar</Btn>
          <Btn small danger onClick={resetCampaign} style={resetCampConf ? { background: "#8B0000" } : {}}>{resetCampConf ? "Sure?" : "Nueva campaña"}</Btn>
        </div>
      </div>
    </div>
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 6 }}>
        <b>Progreso</b>
        <span>{sentCount} de {recipients.length} enviados ({pct}%)</span>
      </div>
      <div style={{ height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#1B7340", transition: "width 0.3s" }} />
      </div>
    </div>
    {recipients.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: "#999", fontSize: 13, background: "#f8f8f8", borderRadius: 8 }}>Ningún cliente coincide con los filtros. Regresa y ajusta los tiers.</div>}
    {recipients.map(c => {
      const personalized = personalize(message, c);
      const isSent = sentIds.includes(c.id);
      return <div key={c.id} style={{ background: isSent ? "#F8F8F8" : "#fff", border: "1px solid #eee", borderLeft: `4px solid ${isSent ? "#1B7340" : "#6C3483"}`, borderRadius: 8, padding: "12px 14px", marginBottom: 10, opacity: isSent ? 0.65 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>
              {c.name} <Badge text={c.tier} color={TIER_CLR[c.tier]} />
              {isSent && <Badge text="✓ Enviado" color="#1B7340" />}
            </div>
            <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>{c.contact || "—"} • {c.phone || "sin teléfono"} • {c.zone || "—"}</div>
          </div>
        </div>
        <div style={{ background: "#f8f8f8", padding: "8px 10px", borderRadius: 6, fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "inherit", color: "#333", marginBottom: 8 }}>{personalized}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn small primary onClick={() => copyMsg(c)}>{copied === c.id ? "✓ Copiado" : "Copiar"}</Btn>
          {c.phone && <WaBtn phone={c.phone} msg={personalized} label="WhatsApp" small />}
          <Btn small onClick={() => toggleSent(c.id)} style={{ background: isSent ? "#888" : "#1B7340", color: "#fff" }}>{isSent ? "Desmarcar" : "Marcar enviado"}</Btn>
        </div>
      </div>;
    })}
  </div>;
};
