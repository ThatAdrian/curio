// Self-serve account deletion. Verifies the caller's JWT, then hard-deletes
// the auth user — every table cascades from profiles.
import { createClient } from "npm:@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const admin = createClient(Deno.env.get("SB_URL")!, Deno.env.get("SB_SERVICE_ROLE")!);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return new Response(JSON.stringify({ error: "not signed in" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
    await admin.auth.admin.deleteUser(user.id);
    return new Response(JSON.stringify({ deleted: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
