import React, { useState } from "react";
import type { Product } from "../lib/catalog";
import type { GuionBeat, LuzSetup, PacketStatus, ProductionPacket, ProductionPacketContent, Toma } from "../lib/productionPacket";

const STATUS_LABEL: Record<PacketStatus, string> = { borrador: "Borrador", aprobado: "Aprobado", grabado: "Grabado", publicado: "Publicado" };
const STATUS_ORDER: PacketStatus[] = ["borrador", "aprobado", "grabado", "publicado"];

const num = (value: string) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };

const label: React.CSSProperties = { fontSize: 12, color: "#666", display: "block", marginTop: 10 };
const input: React.CSSProperties = { display: "block", width: "100%", marginTop: 3, padding: 7, borderRadius: 5, border: "1px solid #ccc", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" };
const smallInput: React.CSSProperties = { ...input, width: 64, display: "inline-block" };

function ArrayEditor<T>({ title, items, onChange, newRow, renderRow }: { title: string; items: T[]; onChange: (items: T[]) => void; newRow: () => T; renderRow: (item: T, update: (patch: Partial<T>) => void) => React.ReactNode }) {
  return <div style={{ marginTop: 14 }}>
    <div style={{ fontWeight: 800, fontSize: 13 }}>{title}</div>
    <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
      {items.map((item, i) => <div key={i} style={{ border: "1px solid #E2E8E4", borderRadius: 6, padding: 8, background: "#FAFCFA" }}>
        {renderRow(item, patch => onChange(items.map((it, ix) => (ix === i ? { ...it, ...patch } : it))))}
        <button onClick={() => onChange(items.filter((_, ix) => ix !== i))} style={{ marginTop: 6, background: "transparent", color: "#B3261E", border: "1px solid #E8B4AF", borderRadius: 5, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>Quitar fila</button>
      </div>)}
    </div>
    <button onClick={() => onChange([...items, newRow()])} style={{ marginTop: 7, background: "#EEF5F0", color: "#1F6B45", border: "1px solid #CFE5D5", borderRadius: 5, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Agregar fila</button>
  </div>;
}

interface Props {
  url: string; anonKey: string; accessToken: string;
  products: readonly Product[];
  plan: { id: string; title: string; theme: string | null; format: string | null; hook: string | null; cta: string | null; rationale: string | null };
  packet: ProductionPacket;
  onSaved: () => Promise<void> | void;
  onError: (message: string) => void;
  onClose: () => void;
}

export const TikTokProductionPacket: React.FC<Props> = ({ url, anonKey, accessToken, products, plan, packet, onSaved, onError, onClose }) => {
  const [draft, setDraft] = useState<ProductionPacketContent>(packet.content);
  const [hashtagsText, setHashtagsText] = useState(packet.content.hashtags.join(" "));
  const [saving, setSaving] = useState(false);
  const [settingStatus, setSettingStatus] = useState(false);
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const set = <K extends keyof ProductionPacketContent>(key: K, value: ProductionPacketContent[K]) => setDraft(d => ({ ...d, [key]: value }));

  const saveContent = async () => {
    setSaving(true);
    try {
      const sanitized: ProductionPacketContent = {
        ...draft,
        hashtags: hashtagsText.split(/\s+/).map(h => h.trim()).filter(Boolean),
        checklist_pre_grabacion: draft.checklist_pre_grabacion.map(s => s.trim()).filter(Boolean),
        checklist_pre_publicacion: draft.checklist_pre_publicacion.map(s => s.trim()).filter(Boolean),
      };
      const response = await fetch(`${url}/rest/v1/tiktok_production_packets?id=eq.${encodeURIComponent(packet.id)}`, {
        method: "PATCH", headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({ content: sanitized, updated_at: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error("No se pudo guardar el paquete de producción.");
      await onSaved();
    } catch (e) { onError(e instanceof Error ? e.message : "Error al guardar el paquete"); }
    finally { setSaving(false); }
  };

  const setStatus = async (status: PacketStatus) => {
    if (status === packet.status) return;
    setSettingStatus(true);
    try {
      const response = await fetch(`${url}/rest/v1/tiktok_production_packets?id=eq.${encodeURIComponent(packet.id)}`, {
        method: "PATCH", headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error("No se pudo cambiar el estado del paquete.");
      await onSaved();
    } catch (e) { onError(e instanceof Error ? e.message : "Error al cambiar el estado del paquete"); }
    finally { setSettingStatus(false); }
  };

  return <div style={{ background: "#fff", border: "1px solid #CFE5D5", borderRadius: 8, padding: 14, marginTop: 8 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "start" }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Paquete de producción</div>
        <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>Generado por: {packet.source === "ai" ? "IA" : "plantilla (sin proveedor de IA configurado)"} · Actualizado {new Date(packet.updated_at).toLocaleString()}</div>
      </div>
      <button onClick={onClose} style={{ background: "transparent", border: "1px solid #ccc", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>Cerrar</button>
    </div>

    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
      {STATUS_ORDER.map(s => <button key={s} onClick={() => setStatus(s)} disabled={settingStatus} style={{ background: packet.status === s ? "#1F6B45" : "#EEF5F0", color: packet.status === s ? "#fff" : "#1F6B45", border: "1px solid #CFE5D5", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: settingStatus ? "default" : "pointer" }}>{STATUS_LABEL[s]}</button>)}
    </div>

    <div style={{ background: "#F7FBF8", border: "1px solid #DCE6DF", borderRadius: 6, padding: 10, marginTop: 12, fontSize: 12, color: "#3D4A41" }}>
      <div><b>Plan:</b> {plan.title}</div>
      {plan.theme && <div style={{ marginTop: 3 }}><b>Tema:</b> {plan.theme}</div>}
      {plan.format && <div style={{ marginTop: 3 }}><b>Formato:</b> {plan.format}</div>}
      {plan.hook && <div style={{ marginTop: 3 }}><b>Gancho original:</b> {plan.hook}</div>}
      {plan.cta && <div style={{ marginTop: 3 }}><b>CTA original:</b> {plan.cta}</div>}
      <div style={{ marginTop: 3 }}><b>Motivo basado en datos (Laboratorio):</b> {plan.rationale || "Sin motivo registrado en el plan."}</div>
    </div>

    <label style={label}>Objetivo del video
      <textarea value={draft.objetivo} onChange={e => set("objetivo", e.target.value)} style={{ ...input, minHeight: 44 }} />
    </label>
    <label style={label}>Audiencia
      <textarea value={draft.audiencia} onChange={e => set("audiencia", e.target.value)} style={{ ...input, minHeight: 44 }} />
    </label>
    <label style={label}>Hipótesis a probar (editable — basada en el motivo del plan)
      <textarea value={draft.hipotesis} onChange={e => set("hipotesis", e.target.value)} style={{ ...input, minHeight: 44 }} />
    </label>

    <label style={label}>Producto principal
      <select value={draft.producto_principal_id} onChange={e => set("producto_principal_id", e.target.value)} style={input}>
        <option value="">— Sin producto —</option>
        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
    <fieldset style={{ border: "1px solid #DDD", borderRadius: 6, margin: "10px 0 0", padding: 9 }}>
      <legend style={{ fontSize: 12, color: "#666", padding: "0 4px" }}>Productos secundarios</legend>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 6 }}>
        {products.filter(p => p.id !== draft.producto_principal_id).map(p => <label key={p.id} style={{ fontSize: 12, color: "#444", display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={draft.productos_secundarios_ids.includes(p.id)} onChange={e => set("productos_secundarios_ids", e.target.checked ? [...draft.productos_secundarios_ids, p.id] : draft.productos_secundarios_ids.filter(id => id !== p.id))} />
          {p.name}
        </label>)}
      </div>
    </fieldset>

    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
      <label style={{ fontSize: 12, color: "#666" }}>Duración objetivo (segundos)
        <input type="number" min={1} value={draft.duracion_objetivo_seg} onChange={e => set("duracion_objetivo_seg", num(e.target.value))} style={smallInput} />
      </label>
      <div style={{ fontSize: 12, color: "#666" }}>Formato de video: <b>9:16 (vertical)</b></div>
    </div>

    <ArrayEditor<GuionBeat> title="Guion segundo a segundo" items={draft.guion} onChange={items => set("guion", items)} newRow={() => ({ seg_inicio: 0, seg_fin: 0, accion: "", dialogo: "", texto_pantalla: "" })} renderRow={(beat, update) => <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#666" }}>Inicio</span><input type="number" value={beat.seg_inicio} onChange={e => update({ seg_inicio: num(e.target.value) })} style={smallInput} />
        <span style={{ fontSize: 11, color: "#666" }}>Fin</span><input type="number" value={beat.seg_fin} onChange={e => update({ seg_fin: num(e.target.value) })} style={smallInput} />
      </div>
      <input placeholder="Acción en cámara" value={beat.accion} onChange={e => update({ accion: e.target.value })} style={input} />
      <input placeholder="Diálogo / voz en off" value={beat.dialogo} onChange={e => update({ dialogo: e.target.value })} style={input} />
      <input placeholder="Texto en pantalla" value={beat.texto_pantalla} onChange={e => update({ texto_pantalla: e.target.value })} style={input} />
    </div>} />

    <ArrayEditor<Toma> title="Lista de tomas" items={draft.tomas} onChange={items => set("tomas", items)} newRow={() => ({ seg_inicio: 0, seg_fin: 0, encuadre: "", distancia: "", movimiento: "", accion: "" })} renderRow={(toma, update) => <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#666" }}>Inicio</span><input type="number" value={toma.seg_inicio} onChange={e => update({ seg_inicio: num(e.target.value) })} style={smallInput} />
        <span style={{ fontSize: 11, color: "#666" }}>Fin</span><input type="number" value={toma.seg_fin} onChange={e => update({ seg_fin: num(e.target.value) })} style={smallInput} />
      </div>
      <input placeholder="Encuadre" value={toma.encuadre} onChange={e => update({ encuadre: e.target.value })} style={input} />
      <input placeholder="Distancia" value={toma.distancia} onChange={e => update({ distancia: e.target.value })} style={input} />
      <input placeholder="Movimiento de cámara" value={toma.movimiento} onChange={e => update({ movimiento: e.target.value })} style={input} />
      <input placeholder="Acción" value={toma.accion} onChange={e => update({ accion: e.target.value })} style={input} />
    </div>} />

    <ArrayEditor<LuzSetup> title="Plan de iluminación" items={draft.iluminacion} onChange={items => set("iluminacion", items)} newRow={() => ({ posicion: "", tipo_luz: "", resultado: "" })} renderRow={(luz, update) => <div style={{ display: "grid", gap: 6 }}>
      <input placeholder="Posición" value={luz.posicion} onChange={e => update({ posicion: e.target.value })} style={input} />
      <input placeholder="Tipo de luz" value={luz.tipo_luz} onChange={e => update({ tipo_luz: e.target.value })} style={input} />
      <input placeholder="Resultado buscado" value={luz.resultado} onChange={e => update({ resultado: e.target.value })} style={input} />
    </div>} />

    <div style={{ fontWeight: 800, fontSize: 13, marginTop: 14 }}>Audio</div>
    <label style={label}>Música / ambiente
      <input value={draft.audio.musica_ambiente} onChange={e => set("audio", { ...draft.audio, musica_ambiente: e.target.value })} style={input} />
    </label>
    <label style={label}>Efectos
      <input value={draft.audio.efectos} onChange={e => set("audio", { ...draft.audio, efectos: e.target.value })} style={input} />
    </label>
    <label style={label}>Momentos de corte
      <input value={draft.audio.momentos_corte} onChange={e => set("audio", { ...draft.audio, momentos_corte: e.target.value })} style={input} />
    </label>

    <label style={label}>Props
      <input value={draft.props} onChange={e => set("props", e.target.value)} style={input} />
    </label>
    <label style={label}>Vestuario
      <input value={draft.vestuario} onChange={e => set("vestuario", e.target.value)} style={input} />
    </label>
    <label style={label}>Ubicación
      <input value={draft.ubicacion} onChange={e => set("ubicacion", e.target.value)} style={input} />
    </label>
    <label style={label}>Instrucciones de edición
      <textarea value={draft.instrucciones_edicion} onChange={e => set("instrucciones_edicion", e.target.value)} style={{ ...input, minHeight: 44 }} />
    </label>

    <label style={label}>Caption
      <textarea value={draft.caption} onChange={e => set("caption", e.target.value)} style={{ ...input, minHeight: 44 }} />
    </label>
    <label style={label}>CTA
      <input value={draft.cta} onChange={e => set("cta", e.target.value)} style={input} />
    </label>
    <label style={label}>Hashtags (separados por espacio)
      <input value={hashtagsText} onChange={e => setHashtagsText(e.target.value)} style={input} />
    </label>

    <label style={label}>Checklist antes de grabar (una por línea)
      <textarea value={draft.checklist_pre_grabacion.join("\n")} onChange={e => set("checklist_pre_grabacion", e.target.value.split("\n"))} style={{ ...input, minHeight: 70 }} />
    </label>
    <label style={label}>Checklist antes de publicar (una por línea)
      <textarea value={draft.checklist_pre_publicacion.join("\n")} onChange={e => set("checklist_pre_publicacion", e.target.value.split("\n"))} style={{ ...input, minHeight: 70 }} />
    </label>

    <div style={{ background: "#FDF2F2", border: "1px solid #F3C6C1", borderRadius: 6, padding: 10, marginTop: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 12, color: "#8A2A22" }}>Nota de seguridad</div>
      <textarea value={draft.nota_seguridad} onChange={e => set("nota_seguridad", e.target.value)} style={{ ...input, minHeight: 44, marginTop: 4, background: "#fff" }} />
    </div>

    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
      <button onClick={saveContent} disabled={saving} style={{ background: "#1F6B45", color: "#fff", border: 0, borderRadius: 6, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer" }}>{saving ? "Guardando…" : "Guardar cambios"}</button>
    </div>
  </div>;
};
