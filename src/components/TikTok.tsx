import React, { useEffect, useState } from "react";
import type { Product } from "../lib/catalog";

type Account = { display_name: string | null; username: string | null; connected_at: string; last_synced_at: string | null };
type Classification = { product_id: string | null; theme: string | null; format: string | null; hook: string | null; cta: string | null; tags: string[] | null };
type Video = { id: string; video_id: string; title: string | null; cover_image_url: string | null; share_url: string | null; create_time: string; view_count: number; like_count: number; comment_count: number; share_count: number; classification: Classification | null };
type ClassificationDraft = { product_id: string; theme: string; format: string; hook: string; cta: string; tags: string };

const emptyDraft: ClassificationDraft = { product_id: "", theme: "", format: "", hook: "", cta: "", tags: "" };
const draftFrom = (c: Classification | null): ClassificationDraft => ({
  product_id: c?.product_id || "", theme: c?.theme || "", format: c?.format || "",
  hook: c?.hook || "", cta: c?.cta || "", tags: (c?.tags || []).join(", "),
});

interface TikTokProps { url: string | null; anonKey: string | null; accessToken: string | null; products: readonly Product[]; }

export const TikTokIntel: React.FC<TikTokProps> = ({ url, anonKey, accessToken, products }) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ClassificationDraft>(emptyDraft);
  const [saving, setSaving] = useState<string | null>(null);
  const headers = { apikey: anonKey || "", Authorization: `Bearer ${accessToken || ""}`, "Content-Type": "application/json" };

  const load = async () => {
    if (!url || !anonKey || !accessToken) { setError("Supabase no está configurado o no hay sesión de administrador."); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [a, v] = await Promise.all([
        fetch(`${url}/rest/v1/tiktok_accounts?select=display_name,username,connected_at,last_synced_at&order=connected_at.desc&limit=1`, { headers }),
        fetch(`${url}/rest/v1/tiktok_videos?select=id,video_id,title,cover_image_url,share_url,create_time,view_count,like_count,comment_count,share_count,classification:tiktok_video_classifications(product_id,theme,format,hook,cta,tags)&order=create_time.desc`, { headers }),
      ]);
      if (!a.ok || !v.ok) throw new Error("No se pudo leer la información de TikTok. Confirma que el script de Supabase fue ejecutado.");
      const accounts = await a.json();
      const rawVideos: Array<Omit<Video, "classification"> & { classification: Classification | Classification[] | null }> = await v.json();
      setAccount(accounts[0] || null);
      setVideos(rawVideos.map(row => ({ ...row, classification: Array.isArray(row.classification) ? (row.classification[0] ?? null) : row.classification })));
    } catch (e) { setError(e instanceof Error ? e.message : "Error de conexión"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggleClassify = (video: Video) => {
    if (openId === video.id) { setOpenId(null); return; }
    setOpenId(video.id); setDraft(draftFrom(video.classification));
  };

  const saveClassification = async (video: Video) => {
    if (!url || !accessToken) return;
    setSaving(video.id); setError(null);
    try {
      const body = {
        video_id: video.id,
        product_id: draft.product_id || null,
        theme: draft.theme.trim() || null,
        format: draft.format.trim() || null,
        hook: draft.hook.trim() || null,
        cta: draft.cta.trim() || null,
        tags: draft.tags.split(",").map(t => t.trim()).filter(Boolean),
        updated_at: new Date().toISOString(),
      };
      const response = await fetch(`${url}/rest/v1/tiktok_video_classifications`, { method: "POST", headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error("No se pudo guardar la clasificación. Confirma que el script de Supabase fue ejecutado.");
      setOpenId(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Error al guardar"); }
    finally { setSaving(null); }
  };

  const connect = async () => {
    if (!url || !accessToken) return;
    const response = await fetch(`${url}/functions/v1/tiktok-connect`, { headers });
    if (!response.ok) { setError("No se pudo iniciar la conexión con TikTok."); return; }
    const { authorization_url } = await response.json();
    window.location.assign(authorization_url);
  };
  const sync = async () => {
    if (!url || !accessToken) return;
    setSyncing(true); setError(null);
    try {
      const response = await fetch(`${url}/functions/v1/tiktok-sync`, { method: "POST", headers });
      if (!response.ok) throw new Error("La sincronización falló. Vuelve a conectar la cuenta si el permiso venció.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Error de sincronización"); }
    finally { setSyncing(false); }
  };

  const totals = videos.reduce((sum, video) => ({ views: sum.views + (video.view_count || 0), likes: sum.likes + (video.like_count || 0), comments: sum.comments + (video.comment_count || 0), shares: sum.shares + (video.share_count || 0) }), { views: 0, likes: 0, comments: 0, shares: 0 });
  const card = (label: string, value: number) => <div style={{ flex: "1 1 130px", background: "#FFF8E1", border: "1px solid #F1D9A5", borderRadius: 8, padding: 14 }}><div style={{ fontSize: 11, color: "#806B40", fontWeight: 700, textTransform: "uppercase" }}>{label}</div><div style={{ fontSize: 25, color: "#1A1A1A", fontWeight: 800, marginTop: 3 }}>{value.toLocaleString()}</div></div>;

  return <section>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start", marginBottom: 18 }}>
      <div><h2 style={{ margin: 0, fontSize: 24 }}>TikTok Intelligence</h2><p style={{ margin: "5px 0 0", fontSize: 13, color: "#666" }}>Videos y métricas de la cuenta autorizada. Solo lectura.</p></div>
      {account ? <button onClick={sync} disabled={syncing} style={{ background: "#C41E3A", color: "#fff", border: 0, borderRadius: 6, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>{syncing ? "Sincronizando…" : "↻ Sincronizar"}</button> : <button onClick={connect} style={{ background: "#111", color: "#fff", border: 0, borderRadius: 6, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>Conectar TikTok</button>}
    </div>
    {error && <div style={{ background: "#FDF2F2", color: "#C41E3A", padding: 12, borderRadius: 7, marginBottom: 14, fontSize: 13 }}>{error}</div>}
    {loading ? <p style={{ color: "#666" }}>Cargando TikTok…</p> : !account ? <div style={{ background: "#F7F7F7", padding: 24, borderRadius: 8, color: "#555" }}>Aún no hay una cuenta conectada. Usa <b>Conectar TikTok</b> para autorizar @maestroflores1.</div> : <>
      <div style={{ fontSize: 14, marginBottom: 16 }}><b>Cuenta conectada:</b> {account.display_name || account.username || "TikTok"}{account.last_synced_at ? ` · Última sincronización: ${new Date(account.last_synced_at).toLocaleString()}` : " · Aún no sincronizada"}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>{card("Vistas", totals.views)}{card("Likes", totals.likes)}{card("Comentarios", totals.comments)}{card("Compartidos", totals.shares)}</div>
      <h3 style={{ fontSize: 17 }}>Videos importados ({videos.length})</h3>
      <div style={{ display: "grid", gap: 10 }}>{videos.map(video => {
        const productName = products.find(p => p.id === video.classification?.product_id)?.name;
        const isOpen = openId === video.id;
        return <div key={video.id} style={{ border: "1px solid #e5e5e5", borderRadius: 8, padding: 10 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <a href={video.share_url || "#"} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 12, color: "inherit", textDecoration: "none", flex: 1, minWidth: 0 }}>
              {video.cover_image_url && <img src={video.cover_image_url} alt="Portada de TikTok" style={{ width: 68, height: 92, objectFit: "cover", borderRadius: 5, flexShrink: 0 }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, marginBottom: 5 }}>{video.title || "Video sin título"}</div>
                <div style={{ fontSize: 13, color: "#666" }}>{new Date(video.create_time).toLocaleDateString()} · {video.view_count.toLocaleString()} vistas · {video.like_count.toLocaleString()} likes · {video.comment_count.toLocaleString()} comentarios · {video.share_count.toLocaleString()} compartidos</div>
                <div style={{ fontSize: 13, color: "#444", marginTop: 5 }}>
                  {productName && <b>{productName}</b>}{productName && (video.classification?.theme || video.classification?.format) ? " · " : ""}
                  {video.classification?.theme}{video.classification?.theme && video.classification?.format ? " · " : ""}{video.classification?.format}
                  {video.classification?.tags && video.classification.tags.length > 0 && <span style={{ marginLeft: 6 }}>{video.classification.tags.map(tag => <span key={tag} style={{ background: "#FFF3D6", color: "#7A5A00", borderRadius: 4, padding: "1px 6px", fontSize: 11, marginRight: 4 }}>{tag}</span>)}</span>}
                </div>
              </div>
            </a>
            <button onClick={() => toggleClassify(video)} style={{ alignSelf: "start", background: isOpen ? "#eee" : "#F7F7F7", border: "1px solid #ddd", borderRadius: 6, padding: "7px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>{isOpen ? "Cerrar" : video.classification ? "Editar" : "Clasificar"}</button>
          </div>
          {isOpen && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee", display: "grid", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#666" }}>Producto
              <select value={draft.product_id} onChange={e => setDraft({ ...draft, product_id: e.target.value })} style={{ display: "block", width: "100%", marginTop: 3, padding: 7, borderRadius: 5, border: "1px solid #ccc" }}>
                <option value="">— Sin producto —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "#666" }}>Tema
              <input value={draft.theme} onChange={e => setDraft({ ...draft, theme: e.target.value })} style={{ display: "block", width: "100%", marginTop: 3, padding: 7, borderRadius: 5, border: "1px solid #ccc" }} />
            </label>
            <label style={{ fontSize: 12, color: "#666" }}>Formato
              <input value={draft.format} onChange={e => setDraft({ ...draft, format: e.target.value })} placeholder="Unboxing, receta, reto, testimonio…" style={{ display: "block", width: "100%", marginTop: 3, padding: 7, borderRadius: 5, border: "1px solid #ccc" }} />
            </label>
            <label style={{ fontSize: 12, color: "#666" }}>Gancho inicial
              <input value={draft.hook} onChange={e => setDraft({ ...draft, hook: e.target.value })} style={{ display: "block", width: "100%", marginTop: 3, padding: 7, borderRadius: 5, border: "1px solid #ccc" }} />
            </label>
            <label style={{ fontSize: 12, color: "#666" }}>Llamada a la acción
              <input value={draft.cta} onChange={e => setDraft({ ...draft, cta: e.target.value })} style={{ display: "block", width: "100%", marginTop: 3, padding: 7, borderRadius: 5, border: "1px solid #ccc" }} />
            </label>
            <label style={{ fontSize: 12, color: "#666" }}>Etiquetas (separadas por coma)
              <input value={draft.tags} onChange={e => setDraft({ ...draft, tags: e.target.value })} placeholder="ej. picante, verano, promo" style={{ display: "block", width: "100%", marginTop: 3, padding: 7, borderRadius: 5, border: "1px solid #ccc" }} />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setOpenId(null)} style={{ background: "transparent", border: "1px solid #ccc", borderRadius: 6, padding: "8px 12px", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
              <button onClick={() => saveClassification(video)} disabled={saving === video.id} style={{ background: "#C41E3A", color: "#fff", border: 0, borderRadius: 6, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{saving === video.id ? "Guardando…" : "Guardar clasificación"}</button>
            </div>
          </div>}
        </div>;
      })}</div>
    </>}
  </section>;
};
