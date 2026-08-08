import React, { useEffect, useState } from "react";
import type { Product } from "../lib/catalog";

type Account = { id: string; display_name: string | null; username: string | null; connected_at: string; last_synced_at: string | null };
type Classification = { product_id: string | null; product_ids: string[] | null; theme: string | null; format: string | null; hook: string | null; cta: string | null; tags: string[] | null };
type Video = { id: string; video_id: string; title: string | null; cover_image_url: string | null; share_url: string | null; create_time: string; view_count: number; like_count: number; comment_count: number; share_count: number; classification: Classification | null };
type ClassificationDraft = { product_id: string; product_ids: string[]; theme: string; format: string; hook: string; cta: string; tags: string };
type Insight = { label: string; videos: number; views: number; engagementRate: number; commentsPerThousand: number; sharesPerThousand: number };
type ContentPlan = { id: string; idea_key: string; title: string; product_ids: string[]; theme: string | null; format: string | null; hook: string | null; cta: string | null; rationale: string | null; status: "planned" | "published"; created_at: string };
type Recommendation = Omit<ContentPlan, "id" | "idea_key" | "status" | "created_at">;

const ideaKeyOf = (r: Pick<Recommendation, "product_ids" | "theme" | "format" | "hook">) =>
  [[...r.product_ids].sort().join(","), (r.theme || "").trim().toLowerCase(), (r.format || "").trim().toLowerCase(), (r.hook || "").trim().toLowerCase()].join("||");

const emptyDraft: ClassificationDraft = { product_id: "", product_ids: [], theme: "", format: "", hook: "", cta: "", tags: "" };
const draftFrom = (c: Classification | null): ClassificationDraft => ({
  product_id: c?.product_id || "", product_ids: c?.product_ids || (c?.product_id ? [c.product_id] : []), theme: c?.theme || "", format: c?.format || "",
  hook: c?.hook || "", cta: c?.cta || "", tags: (c?.tags || []).join(", "),
});

const engagementOf = (video: Video) => (video.like_count || 0) + (video.comment_count || 0) + (video.share_count || 0);
const rate = (value: number, views: number, multiplier = 100) => views > 0 ? (value / views) * multiplier : 0;
const formatRate = (value: number, digits = 1) => value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

const buildInsights = (videos: Video[], labelsFor: (video: Video) => string[]): Insight[] => {
  const groups = new Map<string, { videos: number; views: number; engagement: number; comments: number; shares: number }>();
  videos.forEach(video => {
    Array.from(new Set(labelsFor(video))).filter(Boolean).forEach(label => {
      const current = groups.get(label) || { videos: 0, views: 0, engagement: 0, comments: 0, shares: 0 };
      current.videos += 1;
      current.views += video.view_count || 0;
      current.engagement += engagementOf(video);
      current.comments += video.comment_count || 0;
      current.shares += video.share_count || 0;
      groups.set(label, current);
    });
  });
  return Array.from(groups.entries()).map(([label, group]) => ({
    label,
    videos: group.videos,
    views: group.views,
    engagementRate: rate(group.engagement, group.views),
    commentsPerThousand: rate(group.comments, group.views, 1000),
    sharesPerThousand: rate(group.shares, group.views, 1000),
  })).sort((a, b) => b.engagementRate - a.engagementRate || b.views - a.views);
};

interface TikTokProps { url: string | null; anonKey: string | null; accessToken: string | null; products: readonly Product[]; }

export const TikTokIntel: React.FC<TikTokProps> = ({ url, anonKey, accessToken, products }) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [plansConfigured, setPlansConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ClassificationDraft>(emptyDraft);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const headers = { apikey: anonKey || "", Authorization: `Bearer ${accessToken || ""}`, "Content-Type": "application/json" };

  const load = async () => {
    if (!url || !anonKey || !accessToken) { setError("Supabase no está configurado o no hay sesión de administrador."); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [a, v, p] = await Promise.all([
        fetch(`${url}/rest/v1/tiktok_accounts?select=id,display_name,username,connected_at,last_synced_at&order=connected_at.desc&limit=1`, { headers }),
        fetch(`${url}/rest/v1/tiktok_videos?select=id,video_id,title,cover_image_url,share_url,create_time,view_count,like_count,comment_count,share_count,classification:tiktok_video_classifications(product_id,product_ids,theme,format,hook,cta,tags)&order=create_time.desc`, { headers }),
        fetch(`${url}/rest/v1/tiktok_content_plans?select=id,idea_key,title,product_ids,theme,format,hook,cta,rationale,status,created_at&order=created_at.desc`, { headers }),
      ]);
      if (!a.ok || !v.ok) throw new Error("No se pudo leer la información de TikTok. Confirma que el script de Supabase fue ejecutado.");
      const accounts = await a.json();
      const rawVideos: Array<Omit<Video, "classification"> & { classification: Classification | Classification[] | null }> = await v.json();
      setAccount(accounts[0] || null);
      setVideos(rawVideos.map(row => ({ ...row, classification: Array.isArray(row.classification) ? (row.classification[0] ?? null) : row.classification })));
      setPlansConfigured(p.ok);
      setPlans(p.ok ? await p.json() : []);
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
        product_ids: Array.from(new Set([draft.product_id, ...draft.product_ids].filter(Boolean))),
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

  const savePlan = async (recommendation: Recommendation) => {
    if (!url || !accessToken || !account) return;
    setSavingPlan(recommendation.title); setError(null);
    try {
      const response = await fetch(`${url}/rest/v1/tiktok_content_plans?on_conflict=idea_key`, {
        method: "POST", headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ ...recommendation, idea_key: ideaKeyOf(recommendation), account_id: account.id, status: "planned", updated_at: new Date().toISOString() }),
      });
      if (!response.ok && response.status !== 409) throw new Error("No se pudo guardar la idea. Ejecuta el script del Laboratorio de Contenido en Supabase.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Error al guardar la idea"); }
    finally { setSavingPlan(null); }
  };

  const updatePlanStatus = async (plan: ContentPlan, status: ContentPlan["status"]) => {
    if (!url || !accessToken) return;
    setSavingPlan(plan.id); setError(null);
    try {
      const response = await fetch(`${url}/rest/v1/tiktok_content_plans?id=eq.${encodeURIComponent(plan.id)}`, {
        method: "PATCH", headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error("No se pudo actualizar el estado del plan.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Error al actualizar el plan"); }
    finally { setSavingPlan(null); }
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
  const metricCard = (label: string, value: string) => <div style={{ flex: "1 1 130px", background: "#FFF8E1", border: "1px solid #F1D9A5", borderRadius: 8, padding: 14 }}><div style={{ fontSize: 11, color: "#806B40", fontWeight: 700, textTransform: "uppercase" }}>{label}</div><div style={{ fontSize: 25, color: "#1A1A1A", fontWeight: 800, marginTop: 3 }}>{value}</div></div>;
  const classifiedVideos = videos.filter(video => !!(video.classification?.product_id || video.classification?.theme || video.classification?.format || video.classification?.hook || video.classification?.cta || video.classification?.tags?.length));
  const productInsights = buildInsights(classifiedVideos, video => {
    const ids = video.classification?.product_ids?.length ? video.classification.product_ids : (video.classification?.product_id ? [video.classification.product_id] : []);
    return ids.map(id => products.find(product => product.id === id)?.name || "").filter(Boolean);
  });
  const themeInsights = buildInsights(classifiedVideos, video => video.classification?.theme ? [video.classification.theme] : []);
  const formatInsights = buildInsights(classifiedVideos, video => video.classification?.format ? [video.classification.format] : []);
  const overallEngagementRate = rate(totals.likes + totals.comments + totals.shares, totals.views);
  const bestVideo = [...videos].sort((a, b) => rate(engagementOf(b), b.view_count) - rate(engagementOf(a), a.view_count))[0];
  const productIdFor = (name?: string) => products.find(product => product.name === name)?.id;
  const topProduct = productInsights[0];
  const secondProduct = productInsights[1];
  const topTheme = themeInsights[0];
  const topFormat = formatInsights[0];
  const hasSignal = productInsights.length > 0 || themeInsights.length > 0 || formatInsights.length > 0;
  const recommendations: Recommendation[] = hasSignal ? [
    {
      title: `Repetir: ${topFormat?.label || "formato ganador"}`,
      product_ids: productIdFor(topProduct?.label) ? [productIdFor(topProduct?.label)!] : [],
      theme: topTheme?.label || "Contenido de comunidad",
      format: topFormat?.label || "Reto de comunidad",
      hook: `El reto del Maestro: ¿cuál elegirías tú?`,
      cta: "Comenta tu respuesta y etiqueta a quien debe participar.",
      rationale: topFormat ? `${topFormat.label} acumula ${formatRate(topFormat.engagementRate)}% de interacción en ${topFormat.videos} videos clasificados.` : "Aún no hay suficientes videos clasificados por formato; usa esta idea como punto de partida y clasifica más videos para afinarla.",
    },
    {
      title: `Comparación: ${topProduct?.label || "producto favorito"}${secondProduct ? ` vs ${secondProduct.label}` : ""}`,
      product_ids: [productIdFor(topProduct?.label), productIdFor(secondProduct?.label)].filter((id): id is string => !!id),
      theme: "Comparación y conversación",
      format: "Reto de comunidad",
      hook: `¿Cuál se lleva el punto: ${topProduct?.label || "el dulce del Maestro"}${secondProduct ? ` o ${secondProduct.label}` : ""}?`,
      cta: "Vota en comentarios y etiqueta a la persona que elegiría lo contrario.",
      rationale: topProduct ? `${topProduct.label} tiene ${formatRate(topProduct.engagementRate)}% de interacción en los videos clasificados.` : "Aún no hay suficientes videos clasificados por producto; usa esta idea como punto de partida y clasifica más videos para afinarla.",
    },
    {
      title: `Prueba local: ${topProduct?.label || "Dulces del Maestro"}`,
      product_ids: productIdFor(topProduct?.label) ? [productIdFor(topProduct?.label)!] : [],
      theme: "Punto de venta y comunidad",
      format: "Prueba de producto",
      hook: `Le dimos a probar ${topProduct?.label || "el dulce del Maestro"} por primera vez…`,
      cta: "¿En qué tienda te gustaría probarlo? Déjalo en los comentarios.",
      rationale: "Prueba una reacción real y menciona un punto de venta para convertir curiosidad en visita.",
    },
  ] : [];
  const plannedPlans = plans.filter(plan => plan.status === "planned");
  const publishedPlans = plans.filter(plan => plan.status === "published");
  const planProductNames = (plan: Pick<ContentPlan, "product_ids">) => plan.product_ids.map(id => products.find(product => product.id === id)?.name).filter((name): name is string => !!name);
  const insightList = (title: string, insights: Insight[]) => <div style={{ flex: "1 1 220px", border: "1px solid #E5E5E5", borderRadius: 8, padding: 12, background: "#fff" }}>
    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>{title}</div>
    {insights.length === 0 ? <div style={{ fontSize: 12, color: "#777" }}>Aún no hay videos clasificados en esta categoría.</div> : insights.slice(0, 3).map(insight => <div key={insight.label} style={{ borderTop: "1px solid #F0F0F0", paddingTop: 8, marginTop: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{insight.label}</div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{formatRate(insight.engagementRate)}% interacción · {formatRate(insight.sharesPerThousand)} compartidos / 1,000 vistas</div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{insight.videos} {insight.videos === 1 ? "video" : "videos"} · {insight.views.toLocaleString()} vistas{insight.videos < 3 ? " · Muestra preliminar" : ""}</div>
    </div>)}
  </div>;

  return <section>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start", marginBottom: 18 }}>
      <div><h2 style={{ margin: 0, fontSize: 24 }}>TikTok Intelligence</h2><p style={{ margin: "5px 0 0", fontSize: 13, color: "#666" }}>Videos y métricas de la cuenta autorizada. Solo lectura.</p></div>
      {account ? <button onClick={sync} disabled={syncing} style={{ background: "#C41E3A", color: "#fff", border: 0, borderRadius: 6, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>{syncing ? "Sincronizando…" : "↻ Sincronizar"}</button> : <button onClick={connect} style={{ background: "#111", color: "#fff", border: 0, borderRadius: 6, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>Conectar TikTok</button>}
    </div>
    {error && <div style={{ background: "#FDF2F2", color: "#C41E3A", padding: 12, borderRadius: 7, marginBottom: 14, fontSize: 13 }}>{error}</div>}
    {loading ? <p style={{ color: "#666" }}>Cargando TikTok…</p> : !account ? <div style={{ background: "#F7F7F7", padding: 24, borderRadius: 8, color: "#555" }}>Aún no hay una cuenta conectada. Usa <b>Conectar TikTok</b> para autorizar @maestroflores1.</div> : <>
      <div style={{ fontSize: 14, marginBottom: 16 }}><b>Cuenta conectada:</b> {account.display_name || account.username || "TikTok"}{account.last_synced_at ? ` · Última sincronización: ${new Date(account.last_synced_at).toLocaleString()}` : " · Aún no sincronizada"}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>{card("Vistas", totals.views)}{card("Likes", totals.likes)}{card("Comentarios", totals.comments)}{card("Compartidos", totals.shares)}</div>
      <section style={{ background: "#F8FAFC", border: "1px solid #DCE6F0", borderRadius: 9, padding: 14, marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <div><h3 style={{ fontSize: 17, margin: 0 }}>Análisis de rendimiento</h3><p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Compara los videos clasificados por producto, tema y formato.</p></div>
          <div style={{ fontSize: 12, color: "#555" }}><b>{classifiedVideos.length}</b> de {videos.length} videos clasificados</div>
        </div>
        {classifiedVideos.length < 3 && <div style={{ background: "#FFF8E1", color: "#6C5315", borderRadius: 6, padding: "8px 10px", fontSize: 12, marginTop: 12 }}>Clasifica al menos 3 videos antes de tomar decisiones. Por ahora, los resultados son una muestra preliminar.</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          {metricCard("Interacción total", `${formatRate(overallEngagementRate)}%`)}
          {metricCard("Comentarios / 1,000", formatRate(rate(totals.comments, totals.views, 1000)))}
          {metricCard("Compartidos / 1,000", formatRate(rate(totals.shares, totals.views, 1000)))}
          <div style={{ flex: "1 1 180px", background: "#FFF8E1", border: "1px solid #F1D9A5", borderRadius: 8, padding: 14 }}><div style={{ fontSize: 11, color: "#806B40", fontWeight: 700, textTransform: "uppercase" }}>Mejor interacción</div><div style={{ fontSize: 13, color: "#1A1A1A", fontWeight: 800, marginTop: 5 }}>{bestVideo ? `${formatRate(rate(engagementOf(bestVideo), bestVideo.view_count))}% · ${bestVideo.title || "Video sin título"}` : "Sin videos"}</div></div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          {insightList("Productos", productInsights)}
          {insightList("Temas", themeInsights)}
          {insightList("Formatos", formatInsights)}
        </div>
      </section>
      <section style={{ background: "#F7FBF8", border: "1px solid #CFE5D5", borderRadius: 9, padding: 14, marginBottom: 22 }}>
        <div><h3 style={{ fontSize: 17, margin: 0 }}>Laboratorio de Contenido</h3><p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Tres ideas basadas en tus videos clasificados. Planea una, grábala y después marca que fue publicada.</p></div>
        {!plansConfigured ? <div style={{ background: "#FFF8E1", color: "#6C5315", borderRadius: 6, padding: "9px 10px", fontSize: 12, marginTop: 12 }}>Falta activar el Laboratorio. Ejecuta en Supabase el archivo <b>supabase/2026-08-08_tiktok_content_plans.sql</b>; después actualiza esta página.</div> : recommendations.length === 0 ? <div style={{ fontSize: 12, color: "#666", marginTop: 12 }}>Clasifica videos para recibir recomendaciones.</div> : <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10, marginTop: 12 }}>
            {recommendations.map(recommendation => {
              const alreadyPlanned = plans.some(plan => plan.idea_key === ideaKeyOf(recommendation));
              const names = planProductNames(recommendation);
              return <article key={recommendation.title} style={{ background: "#fff", border: "1px solid #DCE6DF", borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{recommendation.title}</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}><b>Producto:</b> {names.length ? names.join(" + ") : "Sin producto específico"}</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}><b>Formato:</b> {recommendation.format}</div>
                <div style={{ fontSize: 12, color: "#444", marginTop: 8 }}><b>Gancho:</b> “{recommendation.hook}”</div>
                <div style={{ fontSize: 12, color: "#444", marginTop: 5 }}><b>CTA:</b> {recommendation.cta}</div>
                <div style={{ fontSize: 11, color: "#68766C", marginTop: 8 }}>{recommendation.rationale}</div>
                <button onClick={() => savePlan(recommendation)} disabled={alreadyPlanned || savingPlan === recommendation.title} style={{ background: alreadyPlanned ? "#E8EEE9" : "#1F6B45", color: alreadyPlanned ? "#4E6757" : "#fff", border: 0, borderRadius: 6, padding: "8px 10px", fontWeight: 700, fontSize: 12, cursor: alreadyPlanned ? "default" : "pointer", marginTop: 10 }}>{savingPlan === recommendation.title ? "Guardando…" : alreadyPlanned ? "Ya está en planes" : "Planear esta idea"}</button>
              </article>;
            })}
          </div>
          {plannedPlans.length > 0 && <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Ideas planeadas ({plannedPlans.length})</div>
            <div style={{ display: "grid", gap: 7, marginTop: 7 }}>{plannedPlans.map(plan => <div key={plan.id} style={{ background: "#fff", border: "1px solid #DCE6DF", borderRadius: 7, padding: "9px 10px", display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
              <div><b style={{ fontSize: 13 }}>{plan.title}</b><div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{planProductNames(plan).join(" + ") || "Sin producto específico"} · {plan.format || "Sin formato"}</div></div>
              <button onClick={() => updatePlanStatus(plan, "published")} disabled={savingPlan === plan.id} style={{ background: "#1F6B45", color: "#fff", border: 0, borderRadius: 6, padding: "7px 9px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{savingPlan === plan.id ? "Guardando…" : "Marcar publicada"}</button>
            </div>)}</div>
          </div>}
          {publishedPlans.length > 0 && <div style={{ fontSize: 12, color: "#4E6757", marginTop: 12 }}><b>{publishedPlans.length}</b> {publishedPlans.length === 1 ? "idea publicada" : "ideas publicadas"}. Cuando sincronices TikTok, clasifica el nuevo video para comparar su resultado.</div>}
        </>}
      </section>
      <h3 style={{ fontSize: 17 }}>Videos importados ({videos.length})</h3>
      <div style={{ display: "grid", gap: 10 }}>{videos.map(video => {
        const productIds = video.classification?.product_ids?.length ? video.classification.product_ids : (video.classification?.product_id ? [video.classification.product_id] : []);
        const productNames = productIds.map(id => products.find(product => product.id === id)?.name).filter((name): name is string => !!name);
        const isOpen = openId === video.id;
        return <div key={video.id} style={{ border: "1px solid #e5e5e5", borderRadius: 8, padding: 10 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <a href={video.share_url || "#"} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 12, color: "inherit", textDecoration: "none", flex: 1, minWidth: 0 }}>
              {video.cover_image_url && <img src={video.cover_image_url} alt="Portada de TikTok" style={{ width: 68, height: 92, objectFit: "cover", borderRadius: 5, flexShrink: 0 }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, marginBottom: 5 }}>{video.title || "Video sin título"}</div>
                <div style={{ fontSize: 13, color: "#666" }}>{new Date(video.create_time).toLocaleDateString()} · {video.view_count.toLocaleString()} vistas · {video.like_count.toLocaleString()} likes · {video.comment_count.toLocaleString()} comentarios · {video.share_count.toLocaleString()} compartidos</div>
                <div style={{ fontSize: 13, color: "#444", marginTop: 5 }}>
                  {productNames.length > 0 && <b>{productNames.join(" + ")}</b>}{productNames.length > 0 && (video.classification?.theme || video.classification?.format) ? " · " : ""}
                  {video.classification?.theme}{video.classification?.theme && video.classification?.format ? " · " : ""}{video.classification?.format}
                  {video.classification?.tags && video.classification.tags.length > 0 && <span style={{ marginLeft: 6 }}>{video.classification.tags.map(tag => <span key={tag} style={{ background: "#FFF3D6", color: "#7A5A00", borderRadius: 4, padding: "1px 6px", fontSize: 11, marginRight: 4 }}>{tag}</span>)}</span>}
                </div>
              </div>
            </a>
            <button onClick={() => toggleClassify(video)} style={{ alignSelf: "start", background: isOpen ? "#eee" : "#F7F7F7", border: "1px solid #ddd", borderRadius: 6, padding: "7px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>{isOpen ? "Cerrar" : video.classification ? "Editar" : "Clasificar"}</button>
          </div>
          {isOpen && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee", display: "grid", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#666" }}>Producto
              <select value={draft.product_id} onChange={e => setDraft({ ...draft, product_id: e.target.value, product_ids: Array.from(new Set([e.target.value, ...draft.product_ids].filter(Boolean))) })} style={{ display: "block", width: "100%", marginTop: 3, padding: 7, borderRadius: 5, border: "1px solid #ccc" }}>
                <option value="">— Sin producto —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <fieldset style={{ border: "1px solid #DDD", borderRadius: 6, margin: 0, padding: 9 }}>
              <legend style={{ fontSize: 12, color: "#666", padding: "0 4px" }}>Productos secundarios</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 6 }}>
                {products.filter(product => product.id !== draft.product_id).map(product => <label key={product.id} style={{ fontSize: 12, color: "#444", display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={draft.product_ids.includes(product.id)} onChange={e => setDraft({ ...draft, product_ids: e.target.checked ? [...draft.product_ids, product.id] : draft.product_ids.filter(id => id !== product.id) })} />
                  {product.name}
                </label>)}
              </div>
            </fieldset>
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
