import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/app";

export function WatchLaterModule() {
  const { session, toast } = useApp();
  const [items, setItems] = useState<any[]>([]);
  const [listId, setListId] = useState<string | null>(null);

  async function load() {
    if (!session?.user) return;
    const { data: list } = await supabase.from("lists").select("id")
      .eq("owner_id", session.user.id).eq("system_key", "watch_later").maybeSingle();
    if (!list) return;
    setListId(list.id);
    const { data } = await supabase.from("list_items")
      .select("media_item_id, added_at, media_items(id,title,media_type,year)")
      .eq("list_id", list.id).order("added_at", { ascending: false }).limit(20);
    setItems((data as any[]) ?? []);
  }
  useEffect(() => { load(); }, [session?.user?.id]);

  if (!items.length) return null;
  return (
    <div className="card pad" style={{ marginBottom: 30 }}>
      <div className="section-label">Watch later — {items.length} waiting patiently</div>
      {items.map((it) => (
        <div key={it.media_item_id} className="wl-row">
          <span style={{ color: `var(--${it.media_items?.media_type})` }}>●</span>
          <Link to={`/m/${it.media_items?.id}`} style={{ flex: 1, color: "var(--text)", fontWeight: 600, fontSize: 13.5 }}>
            {it.media_items?.title} <span className="mono faint" style={{ fontSize: 10 }}>{it.media_items?.year ?? ""}</span>
          </Link>
          <button className="icon-btn" style={{ width: 28, height: 28 }} title="Remove"
            onClick={async () => {
              await supabase.from("list_items").delete().eq("list_id", listId!).eq("media_item_id", it.media_item_id);
              toast("Removed. Guilt reduced by one.");
              load();
            }}>✕</button>
        </div>
      ))}
    </div>
  );
}
