import { useEffect, useState } from "react";
import { supabase, MediaType } from "../lib/supabase";
import { useApp } from "../lib/app";
import { ShelfRow, ShelfItemRow, ShelfSprites } from "../components/ShelfRow";
import { AddItemModal } from "../components/Chrome";
import { Modal, Spinner, Empty } from "../components/ui";
import { Link } from "react-router-dom";
import { WatchLaterModule } from "../components/WatchLater";

type Shelf = {
  id: string; name: string; media_type: MediaType | null; kind: string;
  smart_rules: any; material: string; sort_mode: string; position: number;
  visibility: string; show_on_profile: boolean; decorations?: { e: string; x: number }[]; view_mode?: string;
};

const SPRITES = ["\ud83e\udeb4", "\ud83c\udfc6", "\ud83e\udd96", "\ud83d\udcfc", "\ud83d\udd6f\ufe0f", "\ud83c\udfb2", "\ud83e\uddf8", "\ud83e\udea9", "\ud83d\udc0c", "\ud83d\uddff"];

const UNIT_CLASS: Record<string, string> = { film: "unit-rental", tv: "unit-rental", game: "unit-cab", book: "unit-wood", music: "unit-crate" };
const UNIT_LABEL: Record<string, string> = {
  film: "FILMS · BE KIND, REWIND", tv: "TV · BOX-SET TERRITORY", game: "GAMES · CRT NOT INCLUDED",
  book: "BOOKS", music: "THE CRATE · DIG GENTLY",
};

export default function ShelfPage() {
  const { session, profile, toast } = useApp();
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [items, setItems] = useState<Record<string, ShelfItemRow[]>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState<Shelf | null>(null);
  const [creating, setCreating] = useState(false);
  const [spritePick, setSpritePick] = useState<{ shelf: Shelf; x: number; y: number } | null>(null);

  async function load() {
    if (!session?.user) return;
    const { data: sh } = await supabase.from("shelves").select("*").eq("owner_id", session.user.id).order("position");
    setShelves((sh as Shelf[]) ?? []);
    const ids = (sh ?? []).map((s: any) => s.id);
    const { data: si } = ids.length
      ? await supabase.from("shelf_items").select("*, media_items(*), media_variants(id,name,cover_url)").in("shelf_id", ids)
      : { data: [] as any[] };
    const grouped: Record<string, ShelfItemRow[]> = {};
    ((si as any[]) ?? []).forEach((row) => { (grouped[row.shelf_id] ??= []).push(row); });
    setItems(grouped);
    const { data: rs } = await supabase.from("ratings").select("media_item_id,rating").eq("user_id", session.user.id);
    const rmap: Record<string, number> = {};
    ((rs as any[]) ?? []).forEach((r) => (rmap[r.media_item_id] = Number(r.rating)));
    setRatings(rmap);
  }
  useEffect(() => { load(); }, [session?.user?.id]);

  if (session === undefined) return <main className="app"><Spinner /></main>;
  if (!session) return <main className="app"><Empty><Link to="/auth">Sign in</Link> to build your shelves.</Empty></main>;
  if (!shelves) return <main className="app"><Spinner /></main>;

  function sortItems(shelf: Shelf, rows: ShelfItemRow[]) {
    const list = [...rows];
    if (shelf.sort_mode === "az") list.sort((a, b) => a.media_items.title.localeCompare(b.media_items.title));
    else if (shelf.sort_mode === "year") list.sort((a, b) => (a.media_items.year ?? 9999) - (b.media_items.year ?? 9999));
    else list.sort((a, b) => a.position - b.position || +new Date(a.added_at) - +new Date(b.added_at));
    return list;
  }
  function smartItems(shelf: Shelf): ShelfItemRow[] {
    const all = Object.values(items).flat();
    const seen = new Set<string>();
    const r = shelf.smart_rules ?? {};
    return all.filter((it) => {
      if (seen.has(it.media_item_id)) return false;
      seen.add(it.media_item_id);
      if (r.media_type && it.media_items.media_type !== r.media_type) return false;
      if (r.min_rating && (ratings[it.media_item_id] ?? 0) < r.min_rating) return false;
      if (r.completed && it.completion < 100) return false;
      return true;
    });
  }

  async function patchShelf(id: string, patch: Partial<Shelf>) {
    await supabase.from("shelves").update(patch).eq("id", id);
    load();
  }
  async function deleteShelf(s: Shelf) {
    if (!confirm(`Delete "${s.name}"? Items on it are removed from this shelf (ratings and reviews stay).`)) return;
    await supabase.from("shelves").delete().eq("id", s.id);
    toast("Shelf dismantled.");
    load();
  }

  return (
    <main className="app">
      <div className="view-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>The Shelf</h1>
          <p>Hover a spine to flick it out. Wipe the dusty ones — they have earned it.</p>
        </div>
        <span style={{ display: "flex", gap: 8 }}>
          <Link className="btn" to="/import">📥 Import</Link>
          <button className="btn" onClick={() => setCreating(true)}>+ New shelf</button>
        </span>
      </div>

      {shelves.map((s, idx) => {
        const rows = s.kind === "smart" ? smartItems(s) : sortItems(s, items[s.id] ?? []);
        const defaultSkin = profile?.theme?.shelfskin;
        const eff = s.material !== "default" ? s.material : (defaultSkin && defaultSkin !== "default" ? defaultSkin : null);
        const cls = eff ? ` skin-${eff}` : "";
        const t = s.media_type ?? "book";
        return (
          <div key={s.id} className={`shelf-block t-${t}`}>
            <div className="shelf-head">
              <h3><span className="dot" />{s.name}{s.kind === "smart" && <span className="chip">SMART</span>}</h3>
              <span className="count">{rows.length} shelved</span>
              <span className="shelf-ctrl">
                <button className="icon-btn" title="Rename shelf" onClick={() => {
                  const n = prompt("New name for this shelf:", s.name);
                  if (n?.trim()) patchShelf(s.id, { name: n.trim() });
                }}>✎</button>
                <button className="icon-btn" title="Move up" disabled={idx === 0} style={{ opacity: idx === 0 ? 0.3 : 1 }}
                  onClick={async () => {
                    const above = shelves[idx - 1];
                    await Promise.all([
                      supabase.from("shelves").update({ position: above.position }).eq("id", s.id),
                      supabase.from("shelves").update({ position: s.position }).eq("id", above.id),
                    ]);
                    load();
                  }}>↑</button>
                <button className="icon-btn" title="Move down" disabled={idx === shelves.length - 1} style={{ opacity: idx === shelves.length - 1 ? 0.3 : 1 }}
                  onClick={async () => {
                    const below = shelves[idx + 1];
                    await Promise.all([
                      supabase.from("shelves").update({ position: below.position }).eq("id", s.id),
                      supabase.from("shelves").update({ position: s.position }).eq("id", below.id),
                    ]);
                    load();
                  }}>↓</button>
                {s.kind !== "smart" && (
                  <select className="sel mini" value={s.sort_mode} onChange={(e) => patchShelf(s.id, { sort_mode: e.target.value })} aria-label="Sort">
                    <option value="curated">curated</option><option value="az">A–Z</option><option value="year">by year</option>
                  </select>
                )}
                <select className="sel mini" value={s.material} onChange={(e) => patchShelf(s.id, { material: e.target.value })} aria-label="Material">
                  <option value="default">default wood</option><option value="walnut">walnut</option>
                  <option value="metal">metal</option><option value="pastel">pastel</option>
                </select>
                <select className="select" title="Display mode" value={s.view_mode ?? "spines"} style={{ width: "auto", padding: "5px 8px", fontSize: 11 }}
                  onChange={(e) => patchShelf(s.id, { view_mode: e.target.value } as any)}>
                  <option value="spines">Spines</option><option value="covers">Covers</option><option value="list">List</option>
                </select>
                <button className="icon-btn" title="Place a trinket on this shelf"
                  onClick={(e) => setSpritePick({ shelf: s, x: e.clientX, y: e.clientY + 12 })}>✦</button>
                <button className={"icon-btn eye" + (s.show_on_profile ? " on" : "")} title="Shown on your public profile"
                  onClick={() => { patchShelf(s.id, { show_on_profile: !s.show_on_profile }); toast(s.show_on_profile ? "Hidden from your profile." : "Now showing on your profile."); }}>
                  👁
                </button>
                {s.kind !== "standard" && <button className="icon-btn" title="Delete shelf" onClick={() => deleteShelf(s)}>🗑</button>}
              </span>
            </div>
            <div className={`shelf-unit ${UNIT_CLASS[t]}${cls}` + (s.show_on_profile ? "" : " hidden-unit")}>
              <span className="unit-label">{s.kind === "smart" ? "SMART SHELF · AUTO-CURATED" : UNIT_LABEL[t]}</span>
              <div>
                <ShelfRow items={rows} ownerView ownerId={session.user.id} onChanged={load} view={(s.view_mode as any) ?? "spines"} />
                <ShelfSprites decorations={(s.decorations as any) ?? []} editable
                  onChange={(next) => patchShelf(s.id, { decorations: next } as any)} />
                <div className="plank" />
              </div>
              <div className="unit-foot">
                <span className="mono">{s.kind === "smart" ? describeRules(s.smart_rules) : s.visibility === "public" ? "public shelf" : s.visibility}</span>
                {s.kind !== "smart" && s.media_type && (
                  <button className="btn small" onClick={() => setAdding(s)}>+ Add</button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <WatchLaterModule />

      {adding && adding.media_type && (
        <AddItemModal open onClose={() => setAdding(null)} mediaType={adding.media_type}
          shelfId={adding.id} onAdded={load} />
      )}
      {creating && <NewShelfModal onClose={() => setCreating(false)} onCreated={load} owner={session.user.id} nextPos={shelves.length} />}
      {spritePick && (
        <div className="popover" style={{ left: Math.min(spritePick.x, innerWidth - 300), top: spritePick.y }}
          onPointerLeave={() => setSpritePick(null)}>
          <div className="pgridx">
            {SPRITES.map((e) => (
              <button key={e} onClick={() => {
                const cur = (spritePick.shelf.decorations as any) ?? [];
                if (cur.length >= 6) { toast("Six trinkets max \u2014 it's a shelf, not a gift shop."); return; }
                patchShelf(spritePick.shelf.id, { decorations: [...cur, { e, x: 8 + Math.random() * 84 }] } as any);
                setSpritePick(null);
                toast("Trinket placed. It lives here now.");
              }}>{e}</button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function describeRules(r: any) {
  if (!r) return "smart shelf";
  const bits = [];
  if (r.media_type) bits.push(r.media_type);
  if (r.min_rating) bits.push(`rated ≥ ${r.min_rating}★`);
  if (r.completed) bits.push("100% only");
  return "auto: " + (bits.join(" · ") || "everything you own");
}

function NewShelfModal({ onClose, onCreated, owner, nextPos }: {
  onClose: () => void; onCreated: () => void; owner: string; nextPos: number;
}) {
  const { toast } = useApp();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"custom" | "smart">("custom");
  const [mediaType, setMediaType] = useState<string>("film");
  const [minRating, setMinRating] = useState(0);
  const [completed, setCompleted] = useState(false);

  async function create() {
    if (!name.trim()) return toast("Give it a name first.");
    const row: any = { owner_id: owner, name: name.trim(), kind, position: nextPos };
    if (kind === "custom") row.media_type = mediaType;
    else row.smart_rules = {
      ...(mediaType !== "any" ? { media_type: mediaType } : {}),
      ...(minRating > 0 ? { min_rating: minRating } : {}),
      ...(completed ? { completed: true } : {}),
    };
    const { error } = await supabase.from("shelves").insert(row);
    if (error) toast(error.message);
    else { toast(kind === "smart" ? "Smart shelf built — it curates itself." : "Shelf built."); onCreated(); onClose(); }
  }

  return (
    <Modal open onClose={onClose}>
      <h3>New shelf</h3>
      <p className="sub">Custom shelves hold what you put on them. Smart shelves fill themselves by rule.</p>
      <div className="field"><label>Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 5★ from the 80s" /></div>
      <div className="field"><label>Kind</label>
        <div className="seg">
          <button className={kind === "custom" ? "on" : ""} onClick={() => setKind("custom")}>Custom</button>
          <button className={kind === "smart" ? "on" : ""} onClick={() => setKind("smart")}>Smart</button>
        </div></div>
      <div className="field"><label>Media type</label>
        <select className="select" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
          {kind === "smart" && <option value="any">any</option>}
          <option value="film">film</option><option value="tv">tv</option><option value="game">game</option>
          <option value="book">book</option><option value="music">music</option>
        </select></div>
      {kind === "smart" && (
        <>
          <div className="field"><label>Minimum rating</label>
            <div className="slider-row">
              <input type="range" min={0} max={5} step={0.5} value={minRating} onChange={(e) => setMinRating(+e.target.value)} />
              <span className="val">{minRating || "—"}★</span>
            </div></div>
          <div className="field" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className={"switch" + (completed ? " on" : "")} role="switch" aria-checked={completed} onClick={() => setCompleted(!completed)} />
            <span style={{ fontSize: 13 }}>only 100% completed</span>
          </div>
        </>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={create}>Build it</button>
      </div>
    </Modal>
  );
}
