// Generates last month's receipt for every user with diary entries.
// Schedule it: Dashboard → Integrations → Cron → monthly, invoke this function.
// (Or invoke manually from the Edge Functions page any time.)
import { createClient } from "npm:@supabase/supabase-js@2";
Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SB_URL")!, Deno.env.get("SB_SERVICE_ROLE")!);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const { data: rows, error } = await admin.from("diary_entries")
    .select("user_id, media_item_id, media_items(title, media_type)")
    .gte("consumed_on", iso(start)).lt("consumed_on", iso(end)).limit(20000);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const byUser: Record<string, Record<string, { t: string; mt: string; n: number }>> = {};
  for (const r of (rows ?? []) as any[]) {
    const u = (byUser[r.user_id] ??= {});
    const k = r.media_item_id;
    u[k] ??= { t: r.media_items?.title ?? "?", mt: r.media_items?.media_type ?? "film", n: 0 };
    u[k].n++;
  }
  const label = start.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  let generated = 0;
  for (const [uid, lines] of Object.entries(byUser)) {
    const items = Object.values(lines).sort((a, b) => b.n - a.n);
    const total = items.reduce((s, l) => s + l.n, 0);
    const { error: e2 } = await admin.from("receipts").upsert(
      { user_id: uid, kind: "monthly", period_start: iso(start), data: { label, lines: items, total } },
      { onConflict: "user_id,kind,period_start" });
    if (!e2) generated++;
  }
  return new Response(JSON.stringify({ period: label, generated }), { headers: { "Content-Type": "application/json" } });
});
