import React, { useEffect, useState } from "react";

type Account = { display_name: string | null; username: string | null; connected_at: string; last_synced_at: string | null };
type Video = { video_id: string; title: string | null; cover_image_url: string | null; share_url: string | null; create_time: string; view_count: number; like_count: number; comment_count: number; share_count: number };

interface TikTokProps { url: string | null; anonKey: string | null; accessToken: string | null; }

export const TikTokIntel: React.FC<TikTokProps> = ({ url, anonKey, accessToken }) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headers = { apikey: anonKey || "", Authorization: `Bearer ${accessToken || ""}` };

  const load = async () => {
    if (!url || !anonKey || !accessToken) { setError("Supabase no está configurado o no hay sesión de administrador."); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [a, v] = await Promise.all([
        fetch(`${url}/rest/v1/tiktok_accounts?select=display_name,username,connected_at,last_synced_at&order=connected_at.desc&limit=1`, { headers }),
        fetch(`${url}/rest/v1/tiktok_videos?select=video_id,title,cover_image_url,share_url,create_time,view_count,like_count,comment_count,share_count&order=create_time.desc`, { headers }),
      ]);
      if (!a.ok || !v.ok) throw new Error("No se pudo leer la información de TikTok. Confirma que el script de Supabase fue ejecutado.");
      const accounts = await a.json();
      setAccount(accounts[0] || null); setVideos(await v.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Error de conexión"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

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
      <div style={{ display: "grid", gap: 10 }}>{videos.map(video => <a key={video.video_id} href={video.share_url || "#"} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 12, color: "inherit", textDecoration: "none", border: "1px solid #e5e5e5", borderRadius: 8, padding: 10 }}>
        {video.cover_image_url && <img src={video.cover_image_url} alt="Portada de TikTok" style={{ width: 68, height: 92, objectFit: "cover", borderRadius: 5 }} />}
        <div><div style={{ fontWeight: 700, marginBottom: 5 }}>{video.title || "Video sin título"}</div><div style={{ fontSize: 13, color: "#666" }}>{new Date(video.create_time).toLocaleDateString()} · {video.view_count.toLocaleString()} vistas · {video.like_count.toLocaleString()} likes · {video.comment_count.toLocaleString()} comentarios · {video.share_count.toLocaleString()} compartidos</div></div>
      </a>)}</div>
    </>}
  </section>;
};
