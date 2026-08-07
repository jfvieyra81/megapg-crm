import { corsHeaders, json, requireAdmin, service, sha256, tiktokClientKey, redirectUri } from "../_shared/tiktok.ts";

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const user = await requireAdmin(request);
    const state = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
    const { error } = await service.from("tiktok_oauth_states").insert({ state_hash: await sha256(state), requested_by: user.id, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    if (error) throw error;
    const params = new URLSearchParams({ client_key: tiktokClientKey, response_type: "code", scope: "user.info.basic,video.list", redirect_uri: redirectUri, state });
    return json({ authorization_url: `https://www.tiktok.com/v2/auth/authorize/?${params}` });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Connection failed" }, 401); }
});
