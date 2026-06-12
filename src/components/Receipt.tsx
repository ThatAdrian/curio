import { useEffect, useState } from "react";
import { supabase, MEDIA_LABELS } from "../lib/supabase";
import { useApp } from "../lib/app";

export function ReceiptCard() {
  const { session, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [annual, setAnnual] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);

  const now = new Date();
  const start = annual ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  const label = annual ? String(now.getFullYear()) : now.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  useEffect(() => {
    if (!session?.user || !open) return;
    supabase.from("diary_entries").select("*, media_items(title, media_type)")
      .eq("user_id", session.user.id).gte("consumed_on", start.toISOString().slice(0, 10))
      .order("consumed_on")
      .then(({ data }) => setEntries((data as any[]) ?? []));
  }, [session?.user?.id, open, annual]);

  // aggregate: title → plays
  const lines: Record<string, { t: string; mt: string; n: number }> = {};
  entries.forEach((e) => {
    const k = e.media_item_id;
    lines[k] ??= { t: e.media_items?.title ?? "?", mt: e.media_items?.media_type ?? "film", n: 0 };
    lines[k].n++;
  });
  const items = Object.values(lines).sort((a, b) => b.n - a.n);

  async function archive() {
    if (!session?.user) return;
    const { error } = await supabase.from("receipts").insert({
      user_id: session.user.id, kind: annual ? "annual" : "monthly",
      period_start: start.toISOString().slice(0, 10),
      data: { label, lines: items, total: entries.length },
    });
    toast(error ? (error.code === "23505" ? "Already archived for this period." : error.message) : "Receipt archived. Crinkle preserved.");
  }

  if (!session) return null;
  return (
    <div style={{ marginTop: 8 }}>
      {!open ? (
        <button className="btn small" onClick={() => setOpen(true)}>🧾 Print this month's receipt</button>
      ) : (
        <div className="receipt">
          <div className="r-head">CURIO CORNER SHOP<br />*** CUSTOMER COPY ***</div>
          <div className="r-row"><span>PERIOD</span><span>{label.toUpperCase()}</span></div>
          <div className="r-tear" />
          {items.length === 0 && <div className="r-row"><span>NO SESSIONS LOGGED</span><span>—</span></div>}
          {items.slice(0, 14).map((l, i) => (
            <div key={i} className="r-row"><span>{l.t.slice(0, 24).toUpperCase()} {l.n > 1 ? `×${l.n}` : ""}</span><span>{MEDIA_LABELS[l.mt as keyof typeof MEDIA_LABELS]?.toUpperCase()}</span></div>
          ))}
          {items.length > 14 && <div className="r-row"><span>…AND {items.length - 14} MORE</span><span /></div>}
          <div className="r-tear" />
          <div className="r-row r-total"><span>TOTAL SESSIONS</span><span>{entries.length}</span></div>
          <div className="r-row"><span>AMOUNT DUE</span><span>£0.00 (TASTE IS FREE)</span></div>
          <div className="r-foot">THANK YOU FOR CONSUMING RESPONSIBLY</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10 }}>
            <button className="btn small" onClick={() => setAnnual(!annual)}>{annual ? "month view" : "year view"}</button>
            <button className="btn small" onClick={archive}>Archive it</button>
            <button className="btn small" onClick={() => setOpen(false)}>Crumple</button>
          </div>
        </div>
      )}
    </div>
  );
}
