import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, notify, MEDIA_LABELS, MediaType } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Spinner, Empty, Cover, Modal } from "../components/ui";
import { ShelfRow, ShelfItemRow, ShelfSprites } from "../components/ShelfRow";
import { Canvas, Guestbook } from "../components/Social";
import { SendBagModal, SendWrapModal } from "../components/Gifts";
import { ReportButton } from "../components/Report";
import { awardBadges } from "../lib/extras";

const UNIT_CLASS: Record<string, string> = { film: "unit-rental", tv: "unit-rental", game: "unit-cab", book: "unit-wood", music: "unit-crate" };

const MODULE_KEYS = ["stats","song","now","top","shelves","canvas","loans","connections","badges","reviews","status","dna","spaces","guestbook"];

export default function Profile() {
  const { username } = useParams();
  const { session, profile: myProfile, toast, setThemePatch } = useApp();
  const [p, setP] = useState<any | null | undefined>(undefined);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [iFollow, setIFollow] = useState(false);
  const [shelves, setShelves] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, ShelfItemRow[]>>({});
  const [recentReviews, setRecentReviews] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [gift, setGift] = useState<"bag" | "wrap" | null>(null);
  const [connections, setConnections] = useState<any[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<string[]>(MODULE_KEYS);
  const [dragK, setDragK] = useState<string | null>(null);
  const orderRef = useRef<string[]>(MODULE_KEYS);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [pickingTop, setPickingTop] = useState(false);

  useEffect(() => { orderRef.current = order; }, [order]);
  useEffect(() => {
    const h = () => setEditing(true);
    window.addEventListener("curio-edit-profile", h);
    return () => window.removeEventListener("curio-edit-profile", h);
  }, []);
  useEffect(() => {
    document.body.classList.toggle("editing", editing);
    return () => { document.body.classList.remove("editing"); };
  }, [editing]);
  useEffect(() => {
    if (!p) return;
    const saved = (((p.theme?.module_order as string[]) ?? [])).filter((k) => MODULE_KEYS.includes(k));
    setOrder([...saved, ...MODULE_KEYS.filter((k) => !saved.includes(k))]);
    setEditing(false);
  }, [p?.id]);
  useEffect(() => {
    const src: any = (session?.user?.id && p?.id === session.user.id ? myProfile?.theme : p?.theme) ?? {};
    const ids = ((src.top_shelf as string[]) ?? []);
    if (!ids.length) { setTopItems([]); return; }
    supabase.from("media_items").select("id,title,media_type,year,cover_url").in("id", ids)
      .then(({ data }) => { const by: any = {}; ((data as any[]) ?? []).forEach((m) => (by[m.id] = m)); setTopItems(ids.map((i) => by[i]).filter(Boolean)); });
  }, [p?.id, JSON.stringify((p?.theme as any)?.top_shelf), JSON.stringify((myProfile?.theme as any)?.top_shelf)]);
  useEffect(() => {
    if (!p?.id || session?.user?.id !== p.id) { setLoans([]); return; }
    supabase.from("loans").select("*, media_items(title), lender:profiles!loans_lender_id_fkey(username), borrower:profiles!loans_borrower_id_fkey(username)")
      .or(`lender_id.eq.${p.id},borrower_id.eq.${p.id}`).eq("status", "active")
      .then(({ data }) => setLoans((data as any[]) ?? []));
  }, [p?.id, session?.user?.id]);

  const isOwn = !username || (myProfile && username === myProfile.username);

  async function load() {
    let prof: any = null;
    if (username) {
      const { data } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
      prof = data;
    } else if (myProfile) prof = myProfile;
    else if (session === null) { setP(null); return; }
    else return; // own profile, session present, profile still loading — stay on spinner
    if (!prof) { setP(null); return; }
    setP(prof);

    const [{ count: fl }, { count: fg }] = await Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", prof.id),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", prof.id),
    ]);
    setFollowers(fl ?? 0); setFollowing(fg ?? 0);
    if (session?.user && session.user.id !== prof.id) {
      const { data: f } = await supabase.from("follows").select("follower_id")
        .eq("follower_id", session.user.id).eq("followee_id", prof.id).maybeSingle();
      setIFollow(!!f);
    }

    const { data: sh } = await supabase.from("shelves").select("*")
      .eq("owner_id", prof.id).eq("show_on_profile", true).neq("kind", "smart").order("position");
    setShelves((sh as any[]) ?? []);
    const ids = ((sh as any[]) ?? []).map((s) => s.id);
    if (ids.length) {
      const { data: si } = await supabase.from("shelf_items").select("*, media_items(*), media_variants(id,name,cover_url)").in("shelf_id", ids);
      const grouped: Record<string, ShelfItemRow[]> = {};
      const cts: Record<string, number> = {};
      ((si as any[]) ?? []).forEach((row) => {
        (grouped[row.shelf_id] ??= []).push(row);
        const t = row.media_items?.media_type;
        if (t) cts[t] = (cts[t] ?? 0) + 1;
      });
      setItems(grouped); setCounts(cts);
    } else { setItems({}); setCounts({}); }

    const { data: rv } = await supabase.from("reviews")
      .select("*, media_items(id,title,media_type,year,cover_url)")
      .eq("user_id", prof.id).eq("status", "published").order("published_at", { ascending: false }).limit(4);
    setRecentReviews((rv as any[]) ?? []);

    if (session?.user && session.user.id === prof.id) {
      const { data: rm, error } = await supabase.from("room_members").select("room_id, rooms(id,name)").eq("user_id", prof.id);
      if (!error) setRooms((rm as any[]) ?? []);
    }

    const { data: cx } = await supabase.from("connections").select("provider, external_username")
      .eq("user_id", prof.id).eq("show_on_profile", true);
    setConnections((cx as any[]) ?? []);
    if (session?.user && session.user.id !== prof.id) {
      const { data: bl } = await supabase.from("blocks").select("blocked_id")
        .eq("blocker_id", session.user.id).eq("blocked_id", prof.id).maybeSingle();
      setBlocked(!!bl);
    }

    const { data: ub } = await supabase.from("user_badges").select("earned_at, badges(slug,name,description,icon)").eq("user_id", prof.id);
    setBadges((ub as any[]) ?? []);
    if (session?.user && session.user.id === prof.id) {
      awardBadges(prof.id).then((fresh) => {
        if (fresh.length) {
          toast(`Badge earned: ${fresh.join(", ")} 🏅`);
          supabase.from("user_badges").select("earned_at, badges(slug,name,description,icon)").eq("user_id", prof.id)
            .then(({ data }) => setBadges((data as any[]) ?? []));
        }
      }).catch(() => {});
    }
  }
  useEffect(() => { load(); }, [username, myProfile?.id, session?.user?.id]);

  if (p === undefined || session === undefined) return <main className="app"><Spinner /></main>;
  if (p === null) {
    return <main className="app"><Empty>
      {username ? <>No one by that name — or their door is closed to you.</> : <><Link to="/auth">Sign in</Link> to claim your corner of Curio.</>}
    </Empty></main>;
  }

  const t = (((session?.user?.id === p.id ? myProfile?.theme : null) ?? p.theme) ?? {}) as any;
  const mods = t.modules ?? {};
  const show = (k: string) => mods[k] !== false;
  const effMat = (s: any) => (s.material && s.material !== "default") ? s.material : (t.shelfskin && t.shelfskin !== "default" ? t.shelfskin : null);
  const showPlays = !!isOwn || (p.prefs?.playtime_public === true);
  const inRotation = Object.values(items).flat()
    .filter((i: any) => i.completion > 0 && i.completion < 100)
    .sort((a: any, b: any) => b.completion - a.completion).slice(0, 4);
  const CONN_ICON: Record<string, string> = { steam: "🎮", discord: "💬", lastfm: "🎧", trakt: "📺", letterboxd: "🎬", backloggd: "🕹️", github: "🐙", other: "🔗" };
  // visitors see the OWNER's avatar styling, not their own
  const shape = t.avshape ?? "squircle";
  const avStyle: React.CSSProperties = {
    borderRadius: shape === "circle" ? "50%" : shape === "square" ? 12 : 32,
    ...(shape === "hex" ? { clipPath: "polygon(50% 0%,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%)", border: "none", borderRadius: 0 } : {}),
    ...(t.avdeco === "ring" ? { boxShadow: "0 0 0 3px var(--bg), 0 0 0 6px var(--accent)" } : {}),
  };

  async function toggleFollow() {
    if (!session?.user) return toast("Sign in to follow people.");
    if (iFollow) {
      await supabase.from("follows").delete().eq("follower_id", session.user.id).eq("followee_id", p.id);
      setIFollow(false); setFollowers((n) => n - 1);
      toast(`Unfollowed @${p.username}. The shelves part ways.`);
    } else {
      const { error } = await supabase.from("follows").insert({ follower_id: session.user.id, followee_id: p.id });
      if (error) return toast(error.message);
      setIFollow(true); setFollowers((n) => n + 1);
      notify(p.id, "follow", {});
      toast(`Following @${p.username} — their activity joins your feed.`);
    }
  }

  return (
    <main className="app">
      <div className="banner" style={t.banner ? ({ "--banner": t.banner } as any) : undefined} />
      <div className="profile-head">
        <div className="avatar" style={avStyle}>{(p.display_name ?? p.username)[0]?.toUpperCase()}</div>
        <div className="profile-id">
          <h2>{p.display_name ?? p.username}{p.is_verified && <span className="chip" title="verified creator">✓ VERIFIED</span>}</h2>
          <div className="handle">@{p.username} · {followers} follower{followers === 1 ? "" : "s"} · {following} following</div>
          {p.bio && <p className="bio">{p.bio}</p>}
        </div>
        <div className="profile-actions">
          {isOwn
            ? <>
                <button className={"btn small" + (editing ? " primary" : "")} onClick={() => setEditing(!editing)}>{editing ? "✓ Done" : "✎ Edit profile"}</button>
                <Link className="btn small" to="/settings">⚙ Settings</Link>
              </>
            : session && <>
                <button className={"btn small" + (iFollow ? "" : " primary")} onClick={toggleFollow}>{iFollow ? "Following ✓" : "+ Follow"}</button>
                <button className="btn small" onClick={() => setGift("bag")}>🛍 Bag</button>
                <button className="btn small" onClick={() => setGift("wrap")}>🎀 Blind date</button>
                <button className="btn small" onClick={async () => {
                  if (blocked) {
                    await supabase.from("blocks").delete().eq("blocker_id", session.user.id).eq("blocked_id", p.id);
                    setBlocked(false); toast(`Unblocked @${p.username}.`);
                  } else {
                    if (!confirm(`Block @${p.username}? They won't be able to see your profile, shelves or guestbook, and you'll unfollow each other.`)) return;
                    await supabase.from("blocks").insert({ blocker_id: session.user.id, blocked_id: p.id });
                    await supabase.from("follows").delete().eq("follower_id", session.user.id).eq("followee_id", p.id);
                    await supabase.from("follows").delete().eq("follower_id", p.id).eq("followee_id", session.user.id);
                    setBlocked(true); setIFollow(false); toast(`Blocked. They see a closed door now.`);
                  }
                }}>{blocked ? "🚫 Unblock" : "🚫 Block"}</button>
                <ReportButton targetKind="profile" targetId={p.id} />
              </>}
        </div>
      </div>

      {(() => {
        const ytm = (sg: any) => `https://music.youtube.com/search?q=${encodeURIComponent((((sg?.artist ?? "") + " " + (sg?.title ?? "")).trim()))}`;
        const song = t.profile_song as { title?: string; artist?: string } | undefined;
        const statusTxt = t.status as string | undefined;
        const allItems: any[] = Object.values(items).flat();
        const dna = (["film", "tv", "game", "book", "music"] as MediaType[]).map((mt) => {
          const n = allItems.filter((i: any) => i.media_items?.media_type === mt).length;
          return { mt, n, pct: Math.round((n / (allItems.length || 1)) * 100) };
        });
        const lbl = (x: string) => <div className="section-label">{x}</div>;
        const REG: { k: string; name: string; wide?: boolean; hide?: boolean; body: any }[] = [
          { k: "stats", name: "Stats", wide: true, body: <>{lbl("Stats")}<div className="stat-row" style={{ margin: 0 }}>
              {(["film", "tv", "game", "book", "music"] as MediaType[]).map((mt) => (
                <div key={mt} className={`card stat t-${mt}`}><b>{counts[mt] ?? 0}</b><span>{MEDIA_LABELS[mt]}s</span></div>
              ))}</div></> },
          { k: "song", name: "Profile song", hide: !song && !isOwn, body: <>{lbl("Profile song")}
              {song ? <p style={{ fontSize: 13.5 }}>🎶 <b>{song.title}</b>{song.artist ? <span className="muted"> — {song.artist}</span> : null} <a className="btn small" style={{ marginLeft: 8 }} target="_blank" rel="noreferrer" href={ytm(song)}>▶</a></p>
                : <p className="faint" style={{ fontSize: 13 }}>No anthem set. Tragic.</p>}
              {isOwn && <button className="btn small" style={{ marginTop: 8 }} onClick={() => {
                const ti = prompt("Song title:", song?.title ?? ""); if (ti === null) return;
                const ar = prompt("Artist:", song?.artist ?? "") ?? "";
                setThemePatch({ profile_song: ti.trim() ? { title: ti.trim(), artist: ar.trim() } : null } as any);
              }}>✎ {song ? "Change" : "Set your anthem"}</button>}</> },
          { k: "now", name: "In rotation", hide: inRotation.length === 0 && !isOwn, body: <>{lbl("In rotation — partway through")}
              {inRotation.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Start something — progress shows here.</p>}
              {inRotation.map((it: any) => (
                <Link key={it.id} to={`/m/${it.media_items?.id}`} className="rot-row" style={{ color: "var(--text)", textDecoration: "none" }}>
                  <span style={{ color: `var(--${it.media_items?.media_type})` }}>●</span>
                  <span className="nfo"><b>{it.media_items?.title}</b>
                    <span className="progress-bar" style={{ margin: "5px 0 0" }}><i style={{ width: it.completion + "%" }} /></span></span>
                  <span className="mono faint" style={{ fontSize: 10 }}>{it.completion}%</span>
                </Link>))}</> },
          { k: "top", name: "Top shelf", wide: true, hide: topItems.length === 0 && !isOwn, body: <>{lbl("Top shelf — the all-timers")}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {topItems.map((m: any) => (
                  <Link key={m.id} to={`/m/${m.id}`} style={{ width: 76, color: "var(--text)", textDecoration: "none" }}>
                    <Cover url={m.cover_url} title={m.title} style={{ aspectRatio: m.media_type === "music" ? "1" : "2/3" }} />
                    <span className="mono" style={{ fontSize: 8.5, display: "block", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title.toUpperCase()}</span>
                  </Link>))}
                {topItems.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Nothing enshrined yet.</p>}
              </div>
              {isOwn && <button className="btn small" style={{ marginTop: 10 }} onClick={() => setPickingTop(true)}>✎ Choose up to 6</button>}</> },
          { k: "shelves", name: "Shelves", wide: true, body: <>
              <div className="section-label">{isOwn ? "Your shelves — as visitors see them" : "On the shelves"}</div>
              {shelves.length === 0 && <Empty>{isOwn ? <>Nothing public yet — flip a shelf's 👁 on the <Link to="/shelf">Shelf page</Link>.</> : "Their shelves are private, or empty. Mysterious either way."}</Empty>}
              {shelves.map((sh) => (
                <div key={sh.id} className={`shelf-unit ${UNIT_CLASS[sh.media_type ?? "book"]}${effMat(sh) ? " skin-" + effMat(sh) : ""}`} style={{ marginBottom: 18 }}>
                  <span className="unit-label">{sh.name.toUpperCase()}</span>
                  <div>
                    <ShelfRow items={items[sh.id] ?? []} ownerView={!!isOwn} ownerId={p.id} onChanged={load} showPlays={showPlays} />
                    <ShelfSprites decorations={(sh.decorations as any) ?? []} editable={false} />
                    <div className="plank" />
                  </div>
                  <div className="unit-foot"><span className="mono">{(items[sh.id] ?? []).length} shelved</span></div>
                </div>))}</> },
          { k: "canvas", name: "The Canvas", wide: true, body: <>{lbl("The canvas")}<Canvas ownerId={p.id} editable={!!isOwn && !!session} /></> },
          { k: "loans", name: "On loan", hide: !isOwn || loans.length === 0, body: <>{lbl("On loan")}
              {loans.map((l: any) => (
                <div key={l.id} className="wl-row"><span style={{ flex: 1, fontSize: 13 }}>
                  <b>{l.media_items?.title}</b> <span className="mono faint" style={{ fontSize: 10 }}>{l.lender_id === p.id ? `→ @${l.borrower?.username}` : `← @${l.lender?.username}`}</span></span>
                  {l.due_at && <span className="mono faint" style={{ fontSize: 9.5 }}>{Math.max(0, Math.ceil((+new Date(l.due_at) - Date.now()) / 86400000))}d</span>}
                </div>))}</> },
          { k: "connections", name: "Connections", hide: connections.length === 0 && !isOwn, body: <>{lbl("Elsewhere")}
              {connections.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Nothing linked — add some in <Link to="/settings">Settings</Link>.</p>}
              <div className="badge-row">{connections.map((c) => (
                <span key={c.provider} className="conn-chip" title={c.provider}><i>{CONN_ICON[c.provider] ?? CONN_ICON.other}</i>{c.external_username}<span className="mono">{c.provider.toUpperCase()}</span></span>))}</div></> },
          { k: "badges", name: "Badges", body: <>{lbl("Badges")}
              {badges.length === 0 && <p className="faint" style={{ fontSize: 13 }}>None yet — shelve, review, rate, repeat.</p>}
              <div className="badge-row">{badges.map((b: any) => (
                <span key={b.badges?.slug} className="badge-chip" title={b.badges?.description}><i>{b.badges?.icon}</i>{b.badges?.name}</span>))}</div></> },
          { k: "reviews", name: "Recent reviews", wide: true, body: <>{lbl("Recent reviews")}
              {recentReviews.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Nothing reviewed yet.</p>}
              {recentReviews.map((rv) => (
                <Link key={rv.id} to={`/m/${rv.media_items?.id}`} style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 0", color: "var(--text)", textDecoration: "none" }}>
                  <Cover url={rv.media_items?.cover_url} title={rv.media_items?.title ?? "?"} style={{ width: 36, height: 50, flex: "none", padding: 4 }} />
                  <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13.5 }}>{rv.media_items?.title}</b>
                    <span className="faint" style={{ fontSize: 11.5, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rv.body_md}</span></span>
                </Link>))}</> },
          { k: "status", name: "Status", hide: !statusTxt && !isOwn, body: <>{lbl("Status")}
              {statusTxt ? <p className="bio" style={{ fontStyle: "italic" }}>“{statusTxt}”</p> : <p className="faint" style={{ fontSize: 13 }}>No status. Enigmatic.</p>}
              {isOwn && <button className="btn small" style={{ marginTop: 8 }} onClick={() => {
                const v = prompt("Status (140 chars):", statusTxt ?? ""); if (v === null) return;
                setThemePatch({ status: v.trim().slice(0, 140) || null } as any);
              }}>✎ Set status</button>}</> },
          { k: "dna", name: "Taste DNA", hide: allItems.length === 0 && !isOwn, body: <>{lbl("Taste DNA — the split")}
              {dna.map((d) => (
                <div key={d.mt} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                  <span className="mono" style={{ fontSize: 9, width: 42 }}>{MEDIA_LABELS[d.mt].toUpperCase()}</span>
                  <span className="progress-bar" style={{ flex: 1, margin: 0 }}><i style={{ width: d.pct + "%", background: `var(--${d.mt})` }} /></span>
                  <span className="mono faint" style={{ fontSize: 9, width: 30, textAlign: "right" }}>{d.pct}%</span>
                </div>))}</> },
          { k: "spaces", name: "Spaces", body: <>{lbl("Spaces")}
              {isOwn ? (<>
                {rooms.map((r) => (<Link key={r.room_id} className="btn" style={{ display: "flex", width: "100%", marginBottom: 8 }} to={`/room/${r.room_id}`}>🛋 {r.rooms?.name}</Link>))}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link className="btn small" to="/rooms">🛋 Living rooms</Link>
                  <Link className="btn small" to="/clubs">📌 Clubs</Link>
                  <Link className="btn small" to="/gifts">🎁 Gifts</Link>
                  <Link className="btn small" to="/import">📥 Import</Link>
                </div></>) : (<p className="faint" style={{ fontSize: 13 }}>Rooms are member-only spaces. Clubs are public — <Link to="/clubs">browse them</Link>.</p>)}</> },
          { k: "guestbook", name: "Guestbook", wide: true, body: <>{lbl("Guestbook — one page per visitor")}<Guestbook ownerId={p.id} /></> },
        ];
        const REGMAP: Record<string, any> = {}; REG.forEach((m) => (REGMAP[m.k] = m));
        const GRIP = <svg className="ic" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}><circle cx="8" cy="5" r="1.4" /><circle cx="16" cy="5" r="1.4" /><circle cx="8" cy="12" r="1.4" /><circle cx="16" cy="12" r="1.4" /><circle cx="8" cy="19" r="1.4" /><circle cx="16" cy="19" r="1.4" /></svg>;
        const XIC = <svg className="ic" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}><path d="M18 6 6 18M6 6l12 12" /></svg>;
        return (<>
          {editing && isOwn && (
            <div className="card edit-banner">
              <span style={{ fontSize: 13.5 }}><b>Edit mode</b> — drag modules to rearrange, ✕ to remove, add more from the tray at the bottom.</span>
              <button className="btn primary small" onClick={() => setEditing(false)}>Done</button>
            </div>)}
          <div className="pgrid">
            {order.map((k) => {
              const m = REGMAP[k];
              if (!m || mods[k] === false || m.hide) return null;
              return (
                <div key={k} className={"pmod" + (m.wide ? " wide" : "") + (dragK === k ? " dragging" : "")}
                  draggable={editing && !!isOwn}
                  onDragStart={(e) => { if (!editing || !isOwn) return; setDragK(k); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", ""); } catch {} }}
                  onDragOver={(e) => {
                    if (!dragK || dragK === k) return; e.preventDefault();
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const before = e.clientY < r.top + r.height / 2;
                    setOrder((o) => { const x = o.filter((z) => z !== dragK); const i = x.indexOf(k); x.splice(before ? i : i + 1, 0, dragK); return [...x]; });
                  }}
                  onDragEnd={() => { if (dragK) { setDragK(null); setThemePatch({ module_order: orderRef.current } as any); } }}>
                  {isOwn && (
                    <div className="mod-tools">
                      <button className="grab" aria-label="Drag to move module">{GRIP}</button>
                      <button className="rm" aria-label="Remove module" onClick={() => { setThemePatch({ modules: { ...mods, [k]: false } } as any); toast(`${m.name} moved to the tray.`); }}>{XIC}</button>
                    </div>)}
                  {m.body}
                </div>);
            })}
          </div>
          {isOwn && (
            <div className="mod-tray">
              <div className="section-label" style={{ marginBottom: 0 }}>Add a module</div>
              <div className="tray-chips">
                {REG.filter((m) => mods[m.k] === false).map((m) => (
                  <button key={m.k} className="tray-chip" onClick={() => { setThemePatch({ modules: { ...mods, [m.k]: true } } as any); toast(`${m.name} added to your profile.`); }}>＋ {m.name}</button>))}
                {REG.every((m) => mods[m.k] !== false) && <span className="faint" style={{ fontSize: 12 }}>Everything's on the board.</span>}
              </div>
            </div>)}
        </>);
      })()}

      {pickingTop && (() => {
        const uniq: any[] = []; const seen = new Set<string>();
        Object.values(items).flat().forEach((it: any) => { if (!seen.has(it.media_item_id)) { seen.add(it.media_item_id); uniq.push(it); } });
        const cur = new Set<string>(((t.top_shelf as string[]) ?? []));
        return (
          <Modal open onClose={() => setPickingTop(false)} width={560}>
            <h3>Top shelf</h3>
            <p className="sub">Up to six all-timers, in pride of place. Tap to toggle.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxHeight: 360, overflowY: "auto" }}>
              {uniq.map((it: any) => { const on = cur.has(it.media_item_id); return (
                <button key={it.media_item_id} style={{ width: 76 }} onClick={() => {
                  const next = new Set(cur);
                  if (on) next.delete(it.media_item_id);
                  else { if (next.size >= 6) return toast("Six. It's a top shelf, not the whole shop."); next.add(it.media_item_id); }
                  setThemePatch({ top_shelf: [...next] } as any);
                }}>
                  <Cover url={it.media_variants?.cover_url ?? it.media_items?.cover_url} title={it.media_items?.title}
                    style={{ aspectRatio: it.media_items?.media_type === "music" ? "1" : "2/3", border: on ? "2px solid var(--accent)" : "2px solid transparent" }} />
                </button>); })}
              {uniq.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Shelve some things first — your public shelves feed this.</p>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><button className="btn primary" onClick={() => setPickingTop(false)}>Done</button></div>
          </Modal>);
      })()}

      {gift === "bag" && <SendBagModal recipient={{ id: p.id, username: p.username }} onClose={() => setGift(null)} />}
      {gift === "wrap" && <SendWrapModal recipient={{ id: p.id, username: p.username }} onClose={() => setGift(null)} />}
    </main>
  );
}
