import { createClient } from "npm:@supabase/supabase-js@2";

export const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
export const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
export const tiktokClientKey = Deno.env.get("TIKTOK_CLIENT_KEY")!;
export const tiktokClientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET")!;
export const redirectUri = Deno.env.get("TIKTOK_REDIRECT_URI")!;
export const corsHeaders = { "access-control-allow-origin": Deno.env.get("TIKTOK_CRM_URL") || "https://megapg-crm.vercel.app", "access-control-allow-headers": "authorization, apikey, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));

async function tokenKey() {
  const source = Deno.env.get("TIKTOK_TOKEN_ENCRYPTION_KEY");
  if (!source) throw new Error("Missing TIKTOK_TOKEN_ENCRYPTION_KEY");
  return crypto.subtle.importKey("raw", unb64(source), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenKey(), encoder.encode(value));
  return `${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
}

export async function decrypt(value: string) {
  const [iv, payload] = value.split(".");
  if (!iv || !payload) throw new Error("Invalid encrypted token");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await tokenKey(), unb64(payload));
  return decoder.decode(plain);
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function requireAdmin(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const { data: { user }, error } = await service.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");
  const { data: appUser } = await service.from("app_users").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (appUser?.role !== "admin") throw new Error("Forbidden");
  return user;
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...corsHeaders } });
}
