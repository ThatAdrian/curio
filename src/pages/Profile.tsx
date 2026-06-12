import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, notify, MEDIA_LABELS, MediaType } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Spinner, Empty, Cover } from "../components/ui";
import { ShelfRow, ShelfItemRow } from "../components/ShelfRow";
import { Canvas, Guestbook } from "../components/Social";
import { SendBagModal, SendWrapModal } from "../components/Gifts";
import { awardBadges } from "../lib/extras";

const UNIT_CLASS: Record<string, string> = { film: "unit-rental", tv: "unit-rental", game: "unit-cab", book: "unit-wood", music: "unit-crate" };

export default function Profile() {
  const { username } = useParams();
  const { session, profile: myProfile, toast } = useApp();
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

  const t = (p.theme ?? {}) as any;
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
            ? <Link className="btn small" to="/settings">Edit profile</Link>
            : session && <>
                <button className={"btn small" + (iFollow ? "" : " primary")} onClick={toggleFollow}>{iFollow ? "Following ✓" : "+ Follow"}</button>
                <button className="btn small" onClick={() => setGift("bag")}>🛍 Bag</button>
                <button className="btn small" onClick={() => setGift("wrap")}>🎀 Blind date</button>
              </>}
        </div>
      </div>

      <div className="stat-row">
        {(["film", "tv", "game", "book", "music"] as MediaType[]).map((mt) => (
          <div key={mt} className={`card stat t-${mt}`}>
            <b>{counts[mt] ?? 0}</b><span>{MEDIA_LABELS[mt]}s</span>
          </div>
        ))}
      </div>

      <div className="pgrid">
        <div className="pmod wide">
          <div className="section-label">{isOwn ? "Your shelves — as visitors see them" : "On the shelves"}</div>
          {shelves.length === 0 && <Empty>{isOwn ? <>Nothing public yet — flip a shelf's 👁 on the <Link to="/shelf">Shelf page</Link>.</> : "Their shelves are private, or empty. Mysterious either way."}</Empty>}
          {shelves.map((s) => (
            <div key={s.id} className={`shelf-unit ${UNIT_CLASS[s.media_type ?? "book"]}${s.material && s.material !== "default" ? " skin-" + s.material : ""}`} style={{ marginBottom: 18 }}>
              <span className="unit-label">{s.name.toUpperCase()}</span>
              <div>
                <ShelfRow items={items[s.id] ?? []} ownerView={!!isOwn} onChanged={load} />
                <div className="plank" />
              </div>
              <div className="unit-foot"><span className="mono">{(items[s.id] ?? []).length} shelved</span></div>
            </div>
          ))}
        </div>

        <div className="card pad pmod">
          <div className="section-label">Recent reviews</div>
          {recentReviews.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Nothing reviewed yet.</p>}
          {recentReviews.map((rv) => (
            <Link key={rv.id} to={`/m/${rv.media_items?.id}`} style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 0", color: "var(--text)", textDecoration: "none" }}>
              <Cover url={rv.media_items?.cover_url} title={rv.media_items?.title ?? "?"} style={{ width: 36, height: 50, flex: "none", padding: 4 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontSize: 13.5 }}>{rv.media_items?.title}</b>
                <span className="faint" style={{ fontSize: 11.5, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rv.body_md}</span>
              </span>
            </Link>
          ))}
        </div>

        <div className="card pad pmod">
          <div className="section-label">Badges</div>
          {badges.length === 0 && <p className="faint" style={{ fontSize: 13 }}>None yet — shelve, review, rate, repeat.</p>}
          <div className="badge-row">
            {badges.map((b: any) => (
              <span key={b.badges?.slug} className="badge-chip" title={b.badges?.description}>
                <i>{b.badges?.icon}</i>{b.badges?.name}
              </span>
            ))}
          </div>
        </div>

        <div className="card pad pmod">
          <div className="section-label">Spaces</div>
          {isOwn ? (
            <>
              {rooms.map((r) => (
                <Link key={r.room_id} className="btn" style={{ display: "flex", width: "100%", marginBottom: 8 }} to={`/room/${r.room_id}`}>🛋 {r.rooms?.name}</Link>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link className="btn small" to="/rooms">🛋 Living rooms</Link>
                <Link className="btn small" to="/clubs">📌 Clubs</Link>
                <Link className="btn small" to="/gifts">🎁 Gifts</Link>
                <Link className="btn small" to="/import">📥 Import</Link>
              </div>
            </>
          ) : (
            <p className="faint" style={{ fontSize: 13 }}>Rooms are member-only spaces. Clubs are public — <Link to="/clubs">browse them</Link>.</p>
          )}
        </div>

        <div className="pmod wide">
          <div className="section-label">The canvas</div>
          <Canvas ownerId={p.id} editable={!!isOwn && !!session} />
        </div>

        <div className="pmod wide">
          <div className="section-label">Guestbook — one page per visitor</div>
          <Guestbook ownerId={p.id} />
        </div>
      </div>
      {gift === "bag" && <SendBagModal recipient={{ id: p.id, username: p.username }} onClose={() => setGift(null)} />}
      {gift === "wrap" && <SendWrapModal recipient={{ id: p.id, username: p.username }} onClose={() => setGift(null)} />}
    </main>
  );
}
