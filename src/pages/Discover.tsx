import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, searchMetadata, saveMediaItem, notify, MetadataResult, MediaType, MEDIA_LABELS } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Cover, Seg, Spinner } from "../components/ui";
import { ShelfPicker } from "./MediaPage";

const MOODS = [
  ["🕯 cosy horror", "linear-gradient(150deg,#3a1a2e,#16060e)", "Mood shelves arrive once the community starts tagging — yours can be first."],
  ["⚡ brain-off bangers", "linear-gradient(150deg,#f02fc2,#4a0d6e)", "No skips, no thoughts. Tag your shelves to feed this door."],
  ["🐌 slow cinema", "linear-gradient(150deg,#1d2b38,#090d12)", "Sit with it. Mood browsing fills as people shelve."],
  ["🗺 metroidvania itch", "linear-gradient(150deg,#34465e,#101622)", "Everything here will hurt you, lovingly."],
  ["🌙 4am material", "linear-gradient(150deg,#11233f,#d97b2f)", "Headphones mandatory."],
  ["🫖 comfort rewatch", "linear-gradient(150deg,#2e564f,#0c1f1a)", "The 12 things you return to. We'll count."],
];

export default function Discover() {
  const { session, profile, toast } = useApp();
  const nav = useNavigate();
  const [type, setType] = useState<MediaType>("film");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MetadataResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [popular, setPopular] = useState<any[]>([]);
  const [newcomers, setNewcomers] = useState<any[]>([]);
  const [twins, setTwins] = useState<any[]>([]);
  const [myFollows, setMyFollows] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState<{ id: string; type: MediaType } | null>(null);
  const deb = useRef<number>();

  useEffect(() => {
    supabase.from("media_stats").select("rating_count, rating_sum, media_items(*)")
      .gt("rating_count", 0).order("rating_count", { ascending: false }).limit(12)
      .then(({ data }) => setPopular((data as any[]) ?? []));
    supabase.from("profiles").select("id,username,display_name,created_at")
      .order("created_at", { ascending: false }).limit(6)
      .then(({ data }) => setNewcomers((data as any[]) ?? []));
  }, []);
  useEffect(() => {
    if (!session?.user) return;
    supabase.from("follows").select("followee_id").eq("follower_id", session.user.id)
      .then(({ data }) => setMyFollows(new Set(((data as any[]) ?? []).map((f) => f.followee_id))));
    (async () => {
      const { data: mine } = await supabase.from("ratings").select("media_item_id,rating").eq("user_id", session.user.id);
      const my: Record<string, number> = {};
      ((mine as any[]) ?? []).forEach((r) => (my[r.media_item_id] = Number(r.rating)));
      const ids = Object.keys(my);
      if (!ids.length) return;
      const { data: theirs } = await supabase.from("ratings")
        .select("user_id, media_item_id, rating, profiles!ratings_user_id_fkey(username)")
        .in("media_item_id", ids.slice(0, 80)).neq("user_id", session.user.id).limit(500);
      const byUser: Record<string, { uname: string; diffs: number[] }> = {};
      ((theirs as any[]) ?? []).forEach((r) => {
        const e = (byUser[r.user_id] ??= { uname: r.profiles?.username ?? "?", diffs: [] });
        e.diffs.push(Math.abs(Number(r.rating) - my[r.media_item_id]));
      });
      const list = Object.entries(byUser).map(([uid, e]) => {
        const avg = e.diffs.reduce((a, b) => a + b, 0) / e.diffs.length;
        return { id: uid, username: e.uname, shared: e.diffs.length, match: Math.round(100 - (avg / 4.5) * 100) };
      }).sort((a, b) => b.shared - a.shared || b.match - a.match).slice(0, 3);
      setTwins(list);
    })();
  }, [session?.user?.id]);

  function onType(v: string) {
    setQ(v);
    window.clearTimeout(deb.current);
    if (v.trim().length < 2) { setResults([]); return; }
    deb.current = window.setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchMetadata(type, v.trim())); }
      catch (e: any) { toast("Search failed: " + e.message); }
      finally { setSearching(false); }
    }, 380);
  }
  useEffect(() => { if (q.trim().length >= 2) onType(q); }, [type]);

  async function open(r: MetadataResult) {
    try {
      const id = await saveMediaItem(r);
      nav(`/m/${id}`);
    } catch (e: any) { toast(e.message); }
  }
  async function shelve(r: MetadataResult) {
    if (!profile) return toast("Sign in to shelve things.");
    try {
      const id = await saveMediaItem(r);
      setPicking({ id, type: r.media_type as MediaType });
    } catch (e: any) { toast(e.message); }
  }

  async function dig() {
    if (!session?.user) return toast("Sign in — the crates need an owner to dig.");
    const { data: sh } = await supabase.from("shelves").select("id").eq("owner_id", session.user.id);
    const ids = ((sh as any[]) ?? []).map((s) => s.id);
    if (!ids.length) return toast("Nothing shelved yet. Nothing to confront.");
    const { data: si } = await supabase.from("shelf_items").select("media_item_id, media_items(title)").in("shelf_id", ids);
    const all = (si as any[]) ?? [];
    if (!all.length) return toast("Your crates are empty. Go shelve something first.");
    const pick = all[Math.floor(Math.random() * all.length)];
    toast(`From the crates: ${pick.media_items?.title}. You shelved this. Explain yourself.`);
    nav(`/m/${pick.media_item_id}`);
  }

  async function follow(u: any) {
    if (!session?.user) return toast("Sign in to follow.");
    await supabase.from("follows").insert({ follower_id: session.user.id, followee_id: u.id });
    setMyFollows(new Set([...myFollows, u.id]));
    notify(u.id, "follow", {});
    toast(`Following @${u.username}.`);
  }

  return (
    <main className="app">
      <div className="view-head">
        <h1>Discover</h1>
        <p>Search the archives, walk through a mood door, or dig your own crates.</p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <Seg options={(["film", "tv", "game", "book", "music"] as MediaType[]).map((v) => ({ v, label: MEDIA_LABELS[v] }))}
          value={type} onChange={setType} />
        <input className="input" style={{ flex: 1, minWidth: 220, borderRadius: 999 }} value={q}
          placeholder={`search ${MEDIA_LABELS[type].toLowerCase()}s…`} onChange={(e) => onType(e.target.value)} />
      </div>
      {searching && <Spinner />}
      {results.length > 0 && (
        <div className="cover-grid" style={{ marginBottom: 30 }}>
          {results.map((r, i) => (
            <div key={i} style={{ position: "relative" }}>
              <Cover className={type === "music" ? "sq" : ""} url={r.cover_url} title={r.title}
                sub={`${r.year ?? "—"}${r.creators[0] ? " · " + r.creators[0].name : ""}`}
                style={{ aspectRatio: type === "music" ? "1" : "2/3", cursor: "pointer", width: "100%" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: 0, transition: "opacity .2s", background: "rgba(0,0,0,.45)", borderRadius: 10 }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}>
                <button className="btn small" onClick={() => open(r)}>Page</button>
                <button className="btn small primary" onClick={() => shelve(r)}>+ Shelve</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ margin: "26px 0" }}>
        <div className="section-label">Browse by mood — no algorithm, just doors</div>
        <div className="mood-grid">
          {MOODS.map(([label, grad, msg]) => (
            <button key={label} className="mood" style={{ "--mg": grad } as any} onClick={() => toast(msg as string)}>{label}</button>
          ))}
        </div>
      </div>

      {popular.length > 0 && (
        <div style={{ margin: "26px 0" }}>
          <div className="section-label">Rated on Curio</div>
          <div className="cover-grid">
            {popular.map((p) => (
              <div key={p.media_items.id} role="link" tabIndex={0} style={{ cursor: "pointer" }}
                onClick={() => nav(`/m/${p.media_items.id}`)}
                onKeyDown={(e) => e.key === "Enter" && nav(`/m/${p.media_items.id}`)}>
                <Cover url={p.media_items.cover_url} title={p.media_items.title}
                  className={p.media_items.media_type === "music" ? "sq" : ""}
                  sub={`${p.rating_count}× rated · ${(Number(p.rating_sum) / p.rating_count).toFixed(1)}★`}
                  style={{ aspectRatio: p.media_items.media_type === "music" ? "1" : "2/3", width: "100%" }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {twins.length > 0 && (
        <div style={{ margin: "26px 0" }}>
          <div className="section-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Taste twins — people, not feeds
            <span className="chip" title="Computed from rating overlap. Never engagement.">how? rating overlap</span>
          </div>
          <div className="twin-row">
            {twins.map((t) => (
              <div key={t.id} className="card twin">
                <span className="mini-ava">{t.username[0]?.toUpperCase()}</span>
                <Link to={`/u/${t.username}`} style={{ color: "var(--text)" }}><b>@{t.username}</b></Link>
                <span className="mono" style={{ fontSize: 10, color: "var(--accent)" }}>{t.match}% match · {t.shared} shared rating{t.shared === 1 ? "" : "s"}</span>
                {!myFollows.has(t.id) && <button className="btn small" onClick={() => follow({ id: t.id, username: t.username })}>Follow</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid2" style={{ margin: "26px 0" }}>
        <div className="card pad">
          <div className="section-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Rummage <button className="btn small primary" onClick={dig}>🎲 Dig the crates</button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Pulls something random off your own shelves and hands it back to you. Confront your past choices.</p>
        </div>
        <div className="card pad">
          <div className="section-label">New shelvers</div>
          {newcomers.map((u) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
              <span className="mini-ava">{u.username[0]?.toUpperCase()}</span>
              <Link to={`/u/${u.username}`} style={{ flex: 1, color: "var(--text)", fontWeight: 600, fontSize: 13.5 }}>@{u.username}</Link>
              {session?.user?.id !== u.id && !myFollows.has(u.id) && (
                <button className="btn small" onClick={() => follow(u)}>Follow</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {picking && <ShelfPicker mediaId={picking.id} mediaType={picking.type} onClose={() => setPicking(null)} />}
    </main>
  );
}
