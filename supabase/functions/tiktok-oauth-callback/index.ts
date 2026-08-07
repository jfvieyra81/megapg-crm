import { decrypt, encrypt, json, redirectUri, service, sha256, tiktokClientKey, tiktokClientSecret } from "../_shared/tiktok.ts";

Deno.serve(async request => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code"); const state = url.searchParams.get("state"); const denied = url.searchParams.get("error");
  const crmUrl = Deno.env.get("TIKTOK_CRM_URL") || "https://megapg-crm.vercel.app";
  if (denied || !code || !state) return Response.redirect(`${crmUrl}?tiktok=cancelled`, 302);
  try {
    const stateHash = await sha256(state);
    const { data: record } = await service.from("tiktok_oauth_states").select("state_hash,requested_by,expires_at,used_at").eq("state_hash", stateHash).maybeSingle();
    if (!record || record.used_at || new Date(record.expires_at) < new Date()) throw new Error("Invalid or expired OAuth state");
    await service.from("tiktok_oauth_states").update({ used_at: new Date().toISOString() }).eq("state_hash", stateHash).is("used_at", null);
    const body = new URLSearchParams({ client_key: tiktokClientKey, client_secret: tiktokClientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri });
    const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    const token = await tokenResponse.json(); if (!tokenResponse.ok || token.error) throw new Error(token.error_description || token.error || "Token exchange failed");
    const profileResponse = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", { headers: { authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResponse.json(); const user = profile.data?.user;
    if (!profileResponse.ok || !user?.open_id) throw new Error("Profile lookup failed");
    const now = Date.now();
    const { error } = await service.from("tiktok_accounts").upsert({ open_id: user.open_id, display_name: user.display_name, avatar_url: user.avatar_url, access_token_ciphertext: await encrypt(token.access_token), refresh_token_ciphertext: await encrypt(token.refresh_token), access_token_expires_at: new Date(now + token.expires_in * 1000).toISOString(), refresh_token_expires_at: new Date(now + token.refresh_expires_in * 1000).toISOString(), connected_by: record.requested_by, connected_at: new Date().toISOString() }, { onConflict: "open_id" });
    if (error) throw error;
    return Response.redirect(`${crmUrl}?tiktok=connected`, 302);
  } catch (error) { console.error(error); return Response.redirect(`${crmUrl}?tiktok=error`, 302); }
});
