import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, notify } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Modal, Spinner, Empty } from "../components/ui";

/* ============ /rooms — index ============ */
export default function RoomsIndex() {
  const { session, toast } = useApp();
  const [rooms, setRooms] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function load() {
    if (!session?.user) { setRooms([]); return; }
    const { data, error } = await supabase.from("room_members").select("room_id, role, rooms(id,name,created_at)").eq("user_id", session.user.id);
    if (error) { setErr(error.message); setRooms([]); return; }
    setRooms((data as any[]) ?? []);
  }
  useEffect(() => { load(); }, [session?.user?.id]);

  async function create() {
    if (!session?.user) return toast("Sign in first.");
    if (!name.trim()) return toast("Name the room.");
    const { data, error } = await supabase.from("rooms").insert({ name: name.trim(), created_by: session.user.id }).select().single();
    if (error) return toast(error.message);
    const { error: e2 } = await supabase.from("room_members").insert({ room_id: data.id, user_id: session.user.id, role: "owner" });
    if (e2) return toast(e2.message);
    toast("Room built. Furniture included, dust optional.");
    setCreating(false); setName(""); load();
  }

  if (!session) return <main className="app"><Empty><Link to="/auth">Sign in</Link> — rooms are member-only spaces.</Empty></main>;
  if (!rooms) return <main className="app"><Spinner /></main>;
  return (
    <main className="app">
      <div className="view-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div><h1>Living rooms</h1><p>Shared spaces — solo or co-curated. The room itself is the menu.</p></div>
        <button className="btn" onClick={() => setCreating(true)}>+ New room</button>
      </div>
      {err && <Empty>Rooms aren't reachable yet: <span className="mono" style={{ fontSize: 11 }}>{err}</span><br /><br />Run <b>supabase/migrations/00002_fixes.sql</b> in the SQL Editor — it fixes the room policies.</Empty>}
      {!err && rooms.length === 0 && <Empty>No rooms yet. Build one for yourself, or one to share.</Empty>}
      <div className="grid2">
        {rooms.map((r) => (
          <Link key={r.room_id} to={`/room/${r.room_id}`} className="card pad" style={{ color: "var(--text)", textDecoration: "none" }}>
            <b style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>🛋 {r.rooms?.name}</b>
            <span className="mono faint" style={{ fontSize: 10, display: "block", marginTop: 6 }}>{r.role === "owner" ? "you own this room" : "member"}</span>
          </Link>
        ))}
      </div>
      <Modal open={creating} onClose={() => setCreating(false)}>
        <h3>New room</h3>
        <p className="sub">Starts as yours alone — invite people once you're in. How many rooms is too many? Still an open question; go wild responsibly.</p>
        <div className="field"><label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Flat" /></div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={() => setCreating(false)}>Cancel</button>
          <button className="btn primary" onClick={create}>Build it</button>
        </div>
      </Modal>
    </main>
  );
}

/* ============ /room/:id — the scene ============ */
export function RoomPage() {
  const { id } = useParams();
  const { session, toast } = useApp();
  const [room, setRoom] = useState<any | null | undefined>(undefined);
  const [members, setMembers] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [overlap, setOverlap] = useState<any[]>([]);
  const [panel, setPanel] = useState<string | null>(null);
  const [invitee, setInvitee] = useState("");

  const meMember = members.find((m) => m.user_id === session?.user?.id);
  const isOwner = meMember?.role === "owner";
  const state = (room?.state ?? {}) as any;

  async function load() {
    const { data: r, error } = await supabase.from("rooms").select("*").eq("id", id).maybeSingle();
    if (error) { setRoom(null); return; }
    setRoom(r ?? null);
    if (!r) return;
    const { data: mm } = await supabase.from("room_members").select("*, profiles(id,username,display_name)").eq("room_id", id);
    setMembers((mm as any[]) ?? []);
    if (session?.user) {
      const { data: ln } = await supabase.from("loans")
        .select("*, media_items(id,title,cover_url), lender:profiles!loans_lender_id_fkey(username), borrower:profiles!loans_borrower_id_fkey(username)")
        .or(`lender_id.eq.${session.user.id},borrower_id.eq.${session.user.id}`)
        .in("status", ["requested", "active"]).order("requested_at", { ascending: false });
      setLoans((ln as any[]) ?? []);
    }
    // shared shelf: items appearing on more than one member's public shelves
    const memberIds = ((mm as any[]) ?? []).map((m) => m.user_id);
    if (memberIds.length > 1) {
      const { data: sh } = await supabase.from("shelves").select("id, owner_id").in("owner_id", memberIds);
      const shelfIds = ((sh as any[]) ?? []).map((s) => s.id);
      const ownerOf: Record<string, string> = {};
      ((sh as any[]) ?? []).forEach((s) => (ownerOf[s.id] = s.owner_id));
      if (shelfIds.length) {
        const { data: si } = await supabase.from("shelf_items").select("shelf_id, media_item_id, media_items(id,title,media_type)").in("shelf_id", shelfIds);
        const byMedia: Record<string, { item: any; owners: Set<string> }> = {};
        ((si as any[]) ?? []).forEach((row) => {
          const e = (byMedia[row.media_item_id] ??= { item: row.media_items, owners: new Set() });
          e.owners.add(ownerOf[row.shelf_id]);
        });
        setOverlap(Object.values(byMedia).filter((e) => e.owners.size > 1).map((e) => e.item).slice(0, 12));
      }
    } else setOverlap([]);
  }
  useEffect(() => { load(); }, [id, session?.user?.id]);

  if (room === undefined) return <main className="app"><Spinner /></main>;
  if (room === null) return <main className="app"><Empty>No room here — or you're not a member. <Link to="/rooms">Back to your rooms.</Link></Empty></main>;

  async function setState(patch: any) {
    const next = { ...state, ...patch };
    setRoom({ ...room, state: next });
    await supabase.from("rooms").update({ state: next }).eq("id", id);
  }
  async function invite() {
    const uname = invitee.trim().toLowerCase().replace(/^@/, "");
    if (!uname) return;
    const { data: u } = await supabase.from("profiles").select("id,username").eq("username", uname).maybeSingle();
    if (!u) return toast("No one by that name.");
    const { error } = await supabase.from("room_members").insert({ room_id: id, user_id: u.id });
    if (error) return toast(error.code === "23505" ? "Already in this room." : error.message);
    notify(u.id, "room_invite", { room_id: id, room_name: room.name });
    toast(`@${u.username} added to ${room.name}.`);
    setInvitee(""); load();
  }
  async function leave() {
    if (isOwner && members.length > 1) return toast("Owners can't leave while others remain — it's your sofa.");
    await supabase.from("room_members").delete().eq("room_id", id).eq("user_id", session!.user.id);
    toast("You left the room. Lights off behind you.");
    history.back();
  }
  async function returnLoan(l: any) {
    await supabase.from("loans").update({ status: "returned", returned_at: new Date().toISOString() }).eq("id", l.id);
    toast(`${l.media_items?.title} returned. Karma intact.`);
    load();
  }

  const PANEL: Record<string, React.ReactNode> = {
    shelf: <>
      <h4>The shared shelf</h4>
      <p className="psub">{overlap.length ? `${overlap.length} overlap${overlap.length === 1 ? "" : "s"} between members' shelves.` : members.length > 1 ? "No overlaps yet — shelve the same things and they show up here." : "Solo room — overlaps need company."}</p>
      {overlap.map((m) => (
        <Link key={m.id} to={`/m/${m.id}`} className="proom-row" style={{ color: "var(--text)", textDecoration: "none" }}>
          <span style={{ color: `var(--${m.media_type})` }}>●</span><div className="nfo"><b>{m.title}</b><span>on more than one shelf here</span></div>
          <span className="both-chip">BOTH ✓</span>
        </Link>
      ))}
    </>,
    table: <>
      <h4>The borrowed pile</h4>
      <p className="psub">Everything in circulation that involves you.</p>
      {loans.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Nothing borrowed, nothing lent. Suspiciously responsible.</p>}
      {loans.map((l) => (
        <div key={l.id} className="proom-row">
          <div className="nfo">
            <b>{l.media_items?.title}</b>
            <span>{l.lender_id === session?.user?.id ? `lent to @${l.borrower?.username}` : `borrowed from @${l.lender?.username}`} · {l.status}</span>
          </div>
          <button className="btn small" onClick={() => returnLoan(l)}>Return</button>
        </div>
      ))}
      <p className="mono faint" style={{ fontSize: 9.5, marginTop: 10 }}>lending starts from a friend's shelf — borrow buttons land there next</p>
    </>,
    tv: <>
      <h4>Continue together</h4>
      <p className="psub">{state.tv_note ? "Paused exactly where you stopped." : "Nothing parked on the TV yet."}</p>
      {state.tv_note && <div className="proom-row"><div className="nfo"><b>{state.tv_note}</b><span>set by a member</span></div></div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button className="btn small primary" onClick={() => { const v = prompt("What's on, and where did you stop? (e.g. Severance S2E7 · 00:41)"); if (v) { setState({ tv_note: v, tv_on: true }); toast("Parked on the TV for everyone in the room."); } }}>Park something</button>
        {state.tv_note && <button className="btn small" onClick={() => { setState({ tv_note: null, tv_on: false }); toast("TV cleared."); }}>Clear</button>}
      </div>
    </>,
    player: <>
      <h4>The record corner</h4>
      <p className="psub">{state.spinning ? "Now spinning — side B, presumably." : "Needle up. Silence (affectionate)."}</p>
      <button className="btn small primary" onClick={() => { setState({ spinning: !state.spinning }); toast(state.spinning ? "Needle lifted." : "Spinning. The room sways slightly."); }}>
        {state.spinning ? "Lift the needle" : "Drop the needle"}
      </button>
    </>,
    couch: <>
      <h4>Room members</h4>
      <p className="psub">Who shares this space.</p>
      {members.map((m) => (
        <Link key={m.user_id} to={`/u/${m.profiles?.username}`} className="proom-row" style={{ color: "var(--text)", textDecoration: "none" }}>
          <span className="mini-ava">{(m.profiles?.username ?? "?")[0]?.toUpperCase()}</span>
          <div className="nfo"><b>@{m.profiles?.username}</b><span>{m.role}</span></div>
        </Link>
      ))}
      {isOwner && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input className="input" value={invitee} placeholder="@username" onChange={(e) => setInvitee(e.target.value)} onKeyDown={(e) => e.key === "Enter" && invite()} />
          <button className="btn small primary" onClick={invite}>Invite</button>
        </div>
      )}
      <button className="btn small danger" style={{ marginTop: 12 }} onClick={leave}>Leave room</button>
    </>,
  };

  return (
    <main className="app">
      <div className="view-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Link to="/rooms" className="mono faint" style={{ fontSize: 10 }}>← YOUR ROOMS</Link>
          <h1>🛋 {room.name}</h1>
          <p>{members.length} member{members.length === 1 ? " · private, just you" : "s · co-curated"} — click anything, the room is the menu.</p>
        </div>
      </div>

      <div className={"room2" + (state.dim ? " dim" : "")}>
        <div className="r2-wall">
          <div className="r2-stringlights"><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="r2-window"><i className="moon" /><i className="bar-v" /><i className="bar-h" /><span className="curtain cl" /><span className="curtain cr" /></div>
          <div className="r2-poster pa"><span>BR<br />2049</span></div>
          <div className="r2-wainscot" />
        </div>
        <div className="r2-floor" />
        <div className="r2-rug" />
        <button className="r2-shelf" title="the shared shelf" onClick={() => setPanel("shelf")}>
          <i className="rrow" /><i className="rrow" /><i className="rrow" /><span className="r2-label">SHARED</span>
        </button>
        <button className={"r2-media" + (state.tv_on ? " on" : "")} title="the telly" onClick={() => setPanel("tv")}>
          <span className="crt"><span className="screen" /><i className="knob" /><i className="knob k2" /></span>
          <span className="cab"><i className="console" /><i className="pad" /><i className="pad p2" /></span>
        </button>
        <button className={"r2-side" + (state.spinning ? " spinning" : "")} title="record corner" onClick={() => setPanel("player")}>
          <span className="deck"><i className="platter" /><i className="arm" /></span>
          <span className="crate"><i /><i /><i /><i /></span>
        </button>
        <button className="r2-couch" title="the couch · members" onClick={() => setPanel("couch")}>
          <i className="back" /><i className="arm al" /><i className="arm ar" />
          <i className="cush c1" /><i className="cush c2" /><i className="blanket" />
          <span className="r2-cat" title="the room's cat" onClick={(e) => { e.stopPropagation(); toast("The cat ignores you all equally. Shared custody."); }}>🐈‍⬛</span>
        </button>
        <button className="r2-table" title="the borrowed pile" onClick={() => setPanel("table")}>
          <i className="top" /><i className="base" />
          <span className="pile p1" /><span className="pile p2" /><span className="pile p3" />
          <span className="mug m1" /><span className="mug m2" />
        </button>
        <button className="r2-lamp" title="mood lighting" onClick={() => { setState({ dim: !state.dim }); toast(state.dim ? "Lights up. The room pretends to be productive." : "Lights low. Slow cinema hours."); }}>
          <i className="pole" /><i className="shade" /><i className="glow" />
        </button>
        <div className="r2-plant"><i className="pot" /><i className="leaves" /></div>

        {panel && (
          <aside className="room-panel">
            <button className="icon-btn" style={{ position: "absolute", top: 10, right: 10 }} onClick={() => setPanel(null)}>✕</button>
            <div>{PANEL[panel]}</div>
          </aside>
        )}
      </div>
      <p className="mono faint" style={{ textAlign: "center", fontSize: 9.5, marginTop: 10, letterSpacing: ".14em" }}>EVERY OBJECT OPENS ITS OWN VIEW · STATE IS SHARED WITH THE ROOM</p>
    </main>
  );
}
