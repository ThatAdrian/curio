import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Empty, Modal } from "../components/ui";

export default function Settings() {
  const { session, profile, refreshProfile, toast } = useApp();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [conns, setConns] = useState<any[]>([]);
  const [addingConn, setAddingConn] = useState(false);
  const [connProv, setConnProv] = useState("steam");
  const [connUser, setConnUser] = useState("");
  const [blockedList, setBlockedList] = useState<any[]>([]);

  async function loadExtras() {
    if (!profile) return;
    const { data: cx } = await supabase.from("connections").select("*").eq("user_id", profile.id).order("provider");
    setConns((cx as any[]) ?? []);
    const { data: bl } = await supabase.from("blocks")
      .select("blocked_id, blocked:profiles!blocks_blocked_id_fkey(username)").eq("blocker_id", profile.id);
    setBlockedList((bl as any[]) ?? []);
  }
  useEffect(() => { loadExtras(); }, [profile?.id]);

  async function changePassword() {
    if (pw.length < 6) return toast("Password: at least 6 characters.");
    if (pw !== pw2) return toast("Passwords don't match.");
    const { error } = await supabase.auth.updateUser({ password: pw });
    toast(error ? error.message : "Password changed — no email needed, no limit hit.");
    if (!error) { setPw(""); setPw2(""); }
  }

  async function exportData() {
    const uid = profile!.id;
    const { data: shelfIds } = await supabase.from("shelves").select("id").eq("owner_id", uid);
    const ids = (shelfIds ?? []).map((x: any) => x.id);
    const [sh, si, ra, rv, di, li] = await Promise.all([
      supabase.from("shelves").select("*").eq("owner_id", uid),
      ids.length
        ? supabase.from("shelf_items").select("*, media_items(title, media_type, year, external_source, external_id)").in("shelf_id", ids)
        : Promise.resolve({ data: [] } as any),
      supabase.from("ratings").select("*, media_items(title)").eq("user_id", uid),
      supabase.from("reviews").select("*, media_items(title)").eq("user_id", uid),
      supabase.from("diary_entries").select("*, media_items(title)").eq("user_id", uid),
      supabase.from("lists").select("*, list_items(*, media_items(title))").eq("owner_id", uid),
    ]);
    const blob = new Blob([JSON.stringify({
      exported_at: new Date().toISOString(), profile: { username: profile!.username, theme: profile!.theme },
      shelves: sh.data, shelf_items: si.data, ratings: ra.data, reviews: rv.data, diary: di.data, lists: li.data,
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `curio-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast("Exported. Your shelves, in a file, forever yours.");
  }

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username);
    setDisplayName(profile.display_name ?? "");
    setBio(profile.bio ?? "");
    setVisibility(profile.visibility);
  }, [profile?.id]);

  if (!session) return <main className="app"><Empty><Link to="/auth">Sign in</Link> first.</Empty></main>;
  if (!profile) return <main className="app"><Empty>Loading your profile…</Empty></main>;

  async function save() {
    const uname = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,24}$/.test(uname)) return toast("Username: 2–24 chars, a–z 0–9 _ only.");
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      username: uname, display_name: displayName.trim() || uname,
      bio: bio.trim() || null, visibility,
    }).eq("id", profile!.id);
    setBusy(false);
    if (error) toast(error.message.includes("duplicate") ? "That username is taken." : error.message);
    else { toast("Saved. You remain extremely you."); refreshProfile(); }
  }

  return (
    <main className="app">
      <div className="view-head"><h1>Settings</h1><p>Identity, privacy, and the boring-but-important.</p></div>

      <div className="grid2">
        <div className="card pad">
          <div className="section-label">Identity</div>
          <div className="field"><label>Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
          <div className="field"><label>Display name</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
          <div className="field"><label>Bio — 400 chars</label>
            <textarea className="textarea" maxLength={400} value={bio} onChange={(e) => setBio(e.target.value)} /></div>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "…" : "Save"}</button>
        </div>

        <div>
          <div className="card pad" style={{ marginBottom: 16 }}>
            <div className="section-label">Privacy</div>
            <div className="field"><label>Profile visibility</label>
              <select className="select" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                <option value="public">public — anyone can view</option>
                <option value="followers">followers — only people who follow you</option>
                <option value="private">private — just you</option>
              </select></div>
            <p className="faint" style={{ fontSize: 12 }}>Per-shelf visibility lives on each shelf (the 👁 toggle).</p>
            <div style={{ borderTop: "1px solid var(--stroke)", margin: "12px 0 10px" }} />
            <div className="section-label">Playtime &amp; sessions</div>
            {([
              ["playtime_tracking", "Track playtime automatically (desktop app)", true],
              ["playtime_public", "Show play counts &amp; playtime on my public profile", false],
            ] as [string, string, boolean][]).map(([k, label, def]) => {
              const prefs = (profile as any)?.prefs ?? {};
              const on = prefs[k] === undefined ? def : prefs[k] === true;
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                  <button className={"switch" + (on ? " on" : "")} role="switch" aria-checked={on}
                    onClick={async () => {
                      await supabase.from("profiles").update({ prefs: { ...prefs, [k]: !on } }).eq("id", profile!.id);
                      refreshProfile();
                      toast(k === "playtime_public" ? (!on ? "Play counts now visible on your profile." : "Play counts hidden — yours alone.") : (!on ? "Desktop will track sessions from real process time." : "Tracking off — sessions stay manual diary entries only."));
                    }} />
                  <span style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: label }} />
                </div>
              );
            })}
            <p className="faint mono" style={{ fontSize: 9, marginTop: 6 }}>PLAYTIME IS NEVER MANUALLY ENTERED — REAL STATS ONLY, FROM THE DESKTOP APP. PRIVATE BY DEFAULT.</p>
            <button className="btn small" style={{ marginTop: 8 }} onClick={save}>Apply</button>
          </div>

          <div className="card pad" style={{ marginBottom: 16 }}>
            <div className="section-label">Experience</div>
            {([
              ["reduce_motion", "Reduce motion — calm every animation", false],
              ["dust", "Dust &amp; cobwebs on neglected items", true],
              ["stickers", "Price stickers on shelved finds", true],
              ["lean", "Let the odd spine lean naturally", true],
              ["autoplay_songs", "Autoplay profile songs when visiting", true],
            ] as [string, string, boolean][]).map(([k, label, def]) => {
              const prefs = (profile as any)?.prefs ?? {};
              const on = prefs[k] === undefined ? def : prefs[k] === true;
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                  <button className={"switch" + (on ? " on" : "")} role="switch" aria-checked={on}
                    onClick={async () => { await supabase.from("profiles").update({ prefs: { ...prefs, [k]: !on } }).eq("id", profile!.id); refreshProfile(); }} />
                  <span style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: label }} />
                </div>);
            })}
          </div>

          <div className="card pad" style={{ marginBottom: 16 }}>
            <div className="section-label">Notifications — what rings the bell</div>
            {([
              ["notif_social", "Follows, guestbook &amp; review activity", true],
              ["notif_gifts", "Bags &amp; blind dates", true],
              ["notif_loans", "Borrowing &amp; returns", true],
              ["notif_clubs", "Rooms &amp; clubs", true],
            ] as [string, string, boolean][]).map(([k, label, def]) => {
              const prefs = (profile as any)?.prefs ?? {};
              const on = prefs[k] === undefined ? def : prefs[k] === true;
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                  <button className={"switch" + (on ? " on" : "")} role="switch" aria-checked={on}
                    onClick={async () => { await supabase.from("profiles").update({ prefs: { ...prefs, [k]: !on } }).eq("id", profile!.id); refreshProfile(); }} />
                  <span style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: label }} />
                </div>);
            })}
          </div>

          <div className="card pad" style={{ marginBottom: 16 }}>
            <div className="section-label">Shelf defaults</div>
            <div className="field"><label>New shelves display as</label>
              <select className="select" value={((profile as any)?.prefs?.default_view as string) ?? "spines"}
                onChange={async (e) => {
                  const prefs = (profile as any)?.prefs ?? {};
                  await supabase.from("profiles").update({ prefs: { ...prefs, default_view: e.target.value } }).eq("id", profile!.id);
                  refreshProfile(); toast("Default saved — existing shelves keep their own setting.");
                }}>
                <option value="spines">Spines (the proper way)</option>
                <option value="covers">Covers — face out</option>
                <option value="list">List — pure utility</option>
              </select></div>
          </div>

          <div className="card pad" style={{ marginBottom: 16 }}>
            <div className="section-label">Security</div>
            <div className="field"><label>New password</label>
              <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="field"><label>Confirm it</label>
              <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && changePassword()} /></div>
            <button className="btn small" onClick={changePassword}>Change password</button>
          </div>

          <div className="card pad" style={{ marginBottom: 16 }}>
            <div className="section-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Connections — shown as chips on your profile
              <button className="btn small" onClick={() => setAddingConn(true)}>+ Add</button>
            </div>
            {conns.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Nothing linked. Steam, Last.fm, Letterboxd — wear them on your profile.</p>}
            {conns.map((c) => (
              <div key={c.id} className="wl-row">
                <span style={{ flex: 1, fontSize: 13.5 }}><b>{c.provider}</b> <span className="mono faint" style={{ fontSize: 10 }}>{c.external_username}</span></span>
                <button className={"switch" + (c.show_on_profile ? " on" : "")} role="switch" aria-checked={c.show_on_profile}
                  title="Show on profile"
                  onClick={async () => { await supabase.from("connections").update({ show_on_profile: !c.show_on_profile }).eq("id", c.id); loadExtras(); }} />
                <button className="icon-btn" style={{ width: 28, height: 28 }}
                  onClick={async () => { await supabase.from("connections").delete().eq("id", c.id); toast("Unlinked."); loadExtras(); }}>✕</button>
              </div>
            ))}
            <p className="faint mono" style={{ fontSize: 9, marginTop: 8 }}>DISPLAY-ONLY FOR NOW · LIVE SYNC (STEAM PLAYTIME, LAST.FM SCROBBLES) IS ON THE ROADMAP</p>
          </div>

          <div className="card pad" style={{ marginBottom: 16 }}>
            <div className="section-label">Blocked</div>
            {blockedList.length === 0 && <p className="faint" style={{ fontSize: 13 }}>No one. The door is open to all, for now.</p>}
            {blockedList.map((b) => (
              <div key={b.blocked_id} className="wl-row">
                <span style={{ flex: 1, fontSize: 13.5 }}>@{b.blocked?.username}</span>
                <button className="btn small" onClick={async () => {
                  await supabase.from("blocks").delete().eq("blocker_id", profile!.id).eq("blocked_id", b.blocked_id);
                  toast("Unblocked. Forgiveness is free."); loadExtras();
                }}>Unblock</button>
              </div>
            ))}
          </div>

          <div className="card pad" style={{ marginBottom: 16 }}>
            <div className="section-label">Appearance</div>
            <p className="faint" style={{ fontSize: 13 }}>Themes, accents, frames, avatar shapes and banners live in the 🎨 customizer on the tab bar — saved to your profile automatically.</p>
          </div>

          <div className="card pad" style={{ marginBottom: 16 }}>
            <div className="section-label">Your data</div>
            <p className="faint" style={{ fontSize: 13, marginBottom: 8 }}>Bring your history from Letterboxd, Goodreads, or any CSV.</p>
            <Link className="btn small" to="/import">📥 Open the import wizard</Link>
          </div>

          <div className="card pad">
            <div className="section-label">Account</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn small" onClick={exportData}>⬇ Export my data (JSON)</button>
              <button className="btn danger small" onClick={async () => { await supabase.auth.signOut(); toast("Signed out. The shelves will wait."); }}>Sign out</button>
            </div>
            <button className="btn danger small" style={{ marginTop: 10 }} onClick={async () => {
              const typed = prompt(`This deletes everything — shelves, reviews, rooms, the lot. Export first.\n\nType your username (@${profile!.username}) to confirm:`);
              if (typed?.trim().toLowerCase() !== profile!.username.toLowerCase()) { if (typed !== null) toast("Username didn't match. Nothing deleted."); return; }
              const { data: sess } = await supabase.auth.getSession();
              const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
                method: "POST",
                headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${sess.session?.access_token}` },
              });
              const d = await r.json();
              if (d.deleted) { toast("Account deleted. The shelves are bare."); await supabase.auth.signOut(); }
              else toast(d.error ?? "Couldn't delete — try again.");
            }}>Delete my account permanently</button>
            <p className="faint mono" style={{ fontSize: 9, marginTop: 8 }}>EXPORT FIRST. DELETION IS IMMEDIATE AND CASCADES THROUGH EVERYTHING.</p>
          </div>
        </div>
      </div>

      <Modal open={addingConn} onClose={() => setAddingConn(false)}>
        <h3>Link a profile</h3>
        <p className="sub">Display-only chips for now — proof of taste across the internet.</p>
        <div className="field"><label>Service</label>
          <select className="select" value={connProv} onChange={(e) => setConnProv(e.target.value)}>
            {["steam", "discord", "lastfm", "trakt", "letterboxd", "backloggd", "github", "other"].map((p2) => <option key={p2} value={p2}>{p2}</option>)}
          </select></div>
        <div className="field"><label>Your username there</label>
          <input className="input" value={connUser} onChange={(e) => setConnUser(e.target.value)} /></div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={() => setAddingConn(false)}>Cancel</button>
          <button className="btn primary" onClick={async () => {
            if (!connUser.trim()) return;
            const { error } = await supabase.from("connections").insert({ user_id: profile!.id, provider: connProv, external_username: connUser.trim() });
            toast(error ? (error.code === "23505" ? "Already linked that one." : error.message) : "Linked — it's on your profile.");
            setAddingConn(false); setConnUser(""); loadExtras();
          }}>Link it</button>
        </div>
      </Modal>

      <footer className="note">
        This product uses the TMDB API but is not endorsed or certified by TMDB.<br />
        Game data via IGDB · book data via Open Library · music data via MusicBrainz &amp; Cover Art Archive.<br />
        curio · a place for shelves, not feeds
      </footer>
    </main>
  );
}
