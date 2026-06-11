import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, notify } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Modal, Spinner, Empty } from "../components/ui";

/* ============ /clubs — the corkboard index ============ */
export default function ClubsIndex() {
  const { session, toast } = useApp();
  const [clubs, setClubs] = useState<any[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  async function load() {
    const { data } = await supabase.from("clubs")
      .select("*, club_members(count)").order("created_at", { ascending: false }).limit(40);
    setClubs((data as any[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!session?.user) return toast("Sign in to found a club.");
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (slug.length < 2) return toast("Give it a proper name first.");
    const { data, error } = await supabase.from("clubs")
      .insert({ slug, name: name.trim(), description: desc.trim() || null, created_by: session.user.id })
      .select().single();
    if (error) return toast(error.message.includes("duplicate") ? "A club already has that name." : error.message);
    await supabase.from("club_members").insert({ club_id: data.id, user_id: session.user.id, role: "owner" });
    toast("Club founded. You're the owner — mod tools included.");
    setCreating(false); setName(""); setDesc("");
    load();
  }

  if (!clubs) return <main className="app"><Spinner /></main>;
  return (
    <main className="app">
      <div className="view-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div><h1>Clubs</h1><p>Public, chronological feeds around a shared obsession. Pinned to the board.</p></div>
        <button className="btn" onClick={() => setCreating(true)}>+ Found a club</button>
      </div>
      {clubs.length === 0 && <Empty>No clubs yet. Found the first one — name it something unhinged.</Empty>}
      <div className="grid2">
        {clubs.map((c) => (
          <Link key={c.id} to={`/c/${c.slug}`} className="card pad" style={{ color: "var(--text)", textDecoration: "none" }}>
            <b style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>📌 {c.name}</b>
            {c.description && <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{c.description}</p>}
            <span className="mono faint" style={{ fontSize: 10, display: "block", marginTop: 8 }}>
              {c.club_members?.[0]?.count ?? 0} member{(c.club_members?.[0]?.count ?? 0) === 1 ? "" : "s"}
            </span>
          </Link>
        ))}
      </div>
      <Modal open={creating} onClose={() => setCreating(false)}>
        <h3>Found a club</h3>
        <p className="sub">You'll be the owner — you can appoint mods, pin bulletins, and remove posts.</p>
        <div className="field"><label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PAL Region Defenders" /></div>
        <div className="field"><label>Description</label>
          <textarea className="textarea" style={{ minHeight: 70 }} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={() => setCreating(false)}>Cancel</button>
          <button className="btn primary" onClick={create}>Pin it to the board</button>
        </div>
      </Modal>
    </main>
  );
}

/* ============ /c/:slug — one club ============ */
export function ClubPage() {
  const { slug } = useParams();
  const { session, toast } = useApp();
  const [club, setClub] = useState<any | null | undefined>(undefined);
  const [members, setMembers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [bulletins, setBulletins] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [bullTitle, setBullTitle] = useState("");

  const me = members.find((m) => m.user_id === session?.user?.id);
  const isMod = me && (me.role === "owner" || me.role === "mod");

  async function load() {
    const { data: c } = await supabase.from("clubs").select("*").eq("slug", slug).maybeSingle();
    setClub(c ?? null);
    if (!c) return;
    const [{ data: mm }, { data: pp }, { data: bb }] = await Promise.all([
      supabase.from("club_members").select("*, profiles(username)").eq("club_id", c.id),
      supabase.from("club_posts").select("*, author:profiles!club_posts_author_id_fkey(username), club_post_likes(user_id)")
        .eq("club_id", c.id).order("created_at", { ascending: false }).limit(40),
      supabase.from("club_bulletins").select("*").eq("club_id", c.id).order("position"),
    ]);
    setMembers((mm as any[]) ?? []); setPosts((pp as any[]) ?? []); setBulletins((bb as any[]) ?? []);
  }
  useEffect(() => { load(); }, [slug]);

  if (club === undefined) return <main className="app"><Spinner /></main>;
  if (club === null) return <main className="app"><Empty>No club at this address. <Link to="/clubs">Back to the board.</Link></Empty></main>;

  async function joinLeave() {
    if (!session?.user) return toast("Sign in to join.");
    if (me) {
      if (me.role === "owner") return toast("Owners can't abandon ship — transfer ownership first (coming with mod tools 1.1).");
      await supabase.from("club_members").delete().eq("club_id", club.id).eq("user_id", session.user.id);
      toast("Left the club. No hard feelings, probably.");
    } else {
      await supabase.from("club_members").insert({ club_id: club.id, user_id: session.user.id });
      toast(`Joined ${club.name}.`);
    }
    load();
  }
  async function post() {
    if (!body.trim() || !me) return;
    const { error } = await supabase.from("club_posts").insert({ club_id: club.id, author_id: session!.user.id, body_md: body.trim() });
    if (error) return toast(error.message);
    setBody(""); load();
  }
  async function like(p: any) {
    if (!session?.user) return;
    const mine = p.club_post_likes?.some((l: any) => l.user_id === session.user.id);
    if (mine) await supabase.from("club_post_likes").delete().eq("post_id", p.id).eq("user_id", session.user.id);
    else await supabase.from("club_post_likes").insert({ post_id: p.id, user_id: session.user.id });
    load();
  }
  async function removePost(p: any) {
    await supabase.from("club_posts").update({ removed_by: session!.user.id }).eq("id", p.id);
    toast("Post removed (soft) — author can still see it.");
    load();
  }
  async function pinBulletin() {
    if (!bullTitle.trim()) return;
    await supabase.from("club_bulletins").insert({ club_id: club.id, title: bullTitle.trim(), pinned_by: session!.user.id, position: bulletins.length });
    setBullTitle(""); load();
  }

  return (
    <main className="app">
      <div className="view-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Link to="/clubs" className="mono faint" style={{ fontSize: 10 }}>← THE BOARD</Link>
          <h1>📌 {club.name}</h1>
          {club.description && <p>{club.description}</p>}
        </div>
        {session && <button className={"btn" + (me ? "" : " primary")} onClick={joinLeave}>{me ? (me.role === "owner" ? "Owner 👑" : "Leave") : "+ Join"}</button>}
      </div>

      <div className="grid2">
        <div>
          {me ? (
            <div className="card pad" style={{ marginBottom: 14 }}>
              <textarea className="textarea" style={{ minHeight: 70 }} value={body}
                placeholder={`Post to ${club.name}…`} onChange={(e) => setBody(e.target.value)} />
              <button className="btn small primary" style={{ marginTop: 10 }} onClick={post}>Post</button>
            </div>
          ) : <Empty>Join the club to post. Reading is free.</Empty>}
          {posts.filter((p) => !p.removed_by || p.author_id === session?.user?.id).map((p) => (
            <div key={p.id} className="card pad" style={{ marginBottom: 12, opacity: p.removed_by ? 0.5 : 1 }}>
              <div className="rev-head">
                <span className="mini-ava">{(p.author?.username ?? "?")[0]?.toUpperCase()}</span>
                <Link className="who" to={`/u/${p.author?.username}`} style={{ color: "var(--text)" }}>@{p.author?.username}</Link>
                <span className="mono faint" style={{ fontSize: 9.5 }}>{new Date(p.created_at).toLocaleString()}{p.removed_by ? " · removed by a mod" : ""}</span>
              </div>
              <p className="rev-body" style={{ fontSize: 13.5 }}>{p.body_md}</p>
              <div className="rev-foot">
                <button className={"react" + (p.club_post_likes?.some((l: any) => l.user_id === session?.user?.id) ? " on" : "")}
                  onClick={() => like(p)}>♥ {(p.club_post_likes ?? []).length}</button>
                {isMod && !p.removed_by && <button className="react" onClick={() => removePost(p)}>🛡 remove</button>}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="card pad" style={{ marginBottom: 14 }}>
            <div className="section-label">Bulletins — pinned by mods</div>
            {bulletins.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Nothing pinned.</p>}
            {bulletins.map((b) => (
              <div key={b.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--stroke)" }}>
                <b style={{ fontSize: 13.5 }}>📍 {b.title}</b>
                {b.body && <p className="muted" style={{ fontSize: 12.5 }}>{b.body}</p>}
              </div>
            ))}
            {isMod && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input className="input" value={bullTitle} placeholder="Pin a bulletin…" onChange={(e) => setBullTitle(e.target.value)} />
                <button className="btn small" onClick={pinBulletin}>Pin</button>
              </div>
            )}
          </div>
          <div className="card pad">
            <div className="section-label">{members.length} member{members.length === 1 ? "" : "s"}</div>
            {members.map((m) => (
              <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0" }}>
                <span className="mini-ava">{(m.profiles?.username ?? "?")[0]?.toUpperCase()}</span>
                <Link to={`/u/${m.profiles?.username}`} style={{ color: "var(--text)", fontSize: 13.5, fontWeight: 600, flex: 1 }}>@{m.profiles?.username}</Link>
                {m.role !== "member" && <span className="chip">{m.role.toUpperCase()}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
