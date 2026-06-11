import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Empty } from "../components/ui";

export default function Settings() {
  const { session, profile, refreshProfile, toast } = useApp();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [busy, setBusy] = useState(false);

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
            <p className="faint" style={{ fontSize: 12 }}>Per-shelf visibility lives on each shelf (the 👁 toggle). Blocking is on profiles via report tooling — full mod suite lands with Clubs 1.1.</p>
            <button className="btn small" style={{ marginTop: 8 }} onClick={save}>Apply</button>
          </div>

          <div className="card pad" style={{ marginBottom: 16 }}>
            <div className="section-label">Appearance</div>
            <p className="faint" style={{ fontSize: 13 }}>Themes, accents, frames, avatar shapes and banners live in the 🎨 customizer on the tab bar — saved to your profile automatically.</p>
          </div>

          <div className="card pad">
            <div className="section-label">Account</div>
            <button className="btn danger" onClick={async () => { await supabase.auth.signOut(); toast("Signed out. The shelves will wait."); }}>Sign out</button>
          </div>
        </div>
      </div>

      <footer className="note">
        This product uses the TMDB API but is not endorsed or certified by TMDB.<br />
        Game data via IGDB · book data via Open Library · music data via MusicBrainz &amp; Cover Art Archive.<br />
        curio · a place for shelves, not feeds
      </footer>
    </main>
  );
}
