import { decrypt, encrypt, json, requireAdmin, service, tiktokClientKey, tiktokClientSecret } from "../_shared/tiktok.ts";

Deno.serve(async request => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    await requireAdmin(request);
    const { data: account, error } = await service.from("tiktok_accounts").select("*").order("connected_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !account) throw new Error("No TikTok account is connected");
    let accessToken = await decrypt(account.access_token_ciphertext);
    if (account.access_token_expires_at && new Date(account.access_token_expires_at).getTime() < Date.now() + 60_000) {
      const refreshToken = await decrypt(account.refresh_token_ciphertext);
      const body = new URLSearchParams({ client_key: tiktokClientKey, client_secret: tiktokClientSecret, grant_type: "refresh_token", refresh_token: refreshToken });
      const refreshed = await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
      const token = await refreshed.json(); if (!refreshed.ok || token.error) throw new Error(token.error_description || "TikTok token refresh failed");
      accessToken = token.access_token;
      await service.from("tiktok_accounts").update({ access_token_ciphertext: await encrypt(token.access_token), refresh_token_ciphertext: await encrypt(token.refresh_token), access_token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), refresh_token_expires_at: new Date(Date.now() + token.refresh_expires_in * 1000).toISOString() }).eq("id", account.id);
    }
    const fields = "id,title,video_description,create_time,cover_image_url,share_url,duration,like_count,comment_count,share_count,view_count";
    const response = await fetch(`https://open.tiktokapis.com/v2/video/list/?fields=${fields}`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ max_count: 20 }) });
    const payload = await response.json(); if (!response.ok || payload.error?.code && payload.error.code !== "ok") throw new Error(payload.error?.message || "TikTok video sync failed");
    const videos = payload.data?.videos || [];
    if (videos.length) {
      const rows = videos.map((video: Record<string, unknown>) => ({ account_id: account.id, video_id: video.id, title: video.title || null, description: video.video_description || null, cover_image_url: video.cover_image_url || null, share_url: video.share_url || null, create_time: new Date(Number(video.create_time) * 1000).toISOString(), duration_seconds: video.duration || null, view_count: video.view_count || 0, like_count: video.like_count || 0, comment_count: video.comment_count || 0, share_count: video.share_count || 0, source_payload: video, last_synced_at: new Date().toISOString() }));
      const { error: upsertError } = await service.from("tiktok_videos").upsert(rows, { onConflict: "account_id,video_id" }); if (upsertError) throw upsertError;
    }
    await service.from("tiktok_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", account.id);
    return json({ imported: videos.length });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Sync failed" }, 400); }
});
