import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/app";

export default function Auth() {
  const { session, toast } = useApp();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (mode === "signup") {
        const uname = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{2,24}$/.test(uname)) {
          toast("Username: 2–24 chars, lowercase letters, numbers, underscores.");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { username: uname, display_name: uname } },
        });
        if (error) throw error;
        toast("Account created — welcome to the shop floor.");
        nav("/");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast("Signed in. The shelves missed you.");
        nav("/");
      }
    } catch (e: any) {
      const msg = String(e.message ?? e);
      toast(msg.includes("Invalid login") ? "Wrong email or password."
        : msg.includes("Database error") ? "That username is probably taken — try another."
        : msg);
    } finally { setBusy(false); }
  }

  async function magicLink() {
    if (!email) return toast("Type your email first.");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    toast(error ? error.message : "Magic link sent — note: the built-in mailer allows only a couple per hour.");
  }

  async function oauth(provider: "google" | "discord" | "apple") {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }

  if (session) {
    return (
      <main className="app" style={{ maxWidth: 440 }}>
        <div className="card pad" style={{ marginTop: 30 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24 }}>Signed in</h1>
          <p className="muted" style={{ margin: "6px 0 14px" }}>{session.user.email}</p>
          <button className="btn danger" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </main>
    );
  }

  return (
    <main className="app" style={{ maxWidth: 440 }}>
      <div className="card pad" style={{ marginTop: 30 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24 }}>
          {mode === "signup" ? "Create your account" : "Sign in"}
        </h1>
        <p className="muted" style={{ margin: "4px 0 16px", fontSize: 13.5 }}>
          {mode === "signup" ? "Pick a username — it's your address here." : "Email and password. No emails sent, no limits hit."}
        </p>

        {mode === "signup" && (
          <div className="field"><label>Username</label>
            <input className="input" value={username} placeholder="lowercase, a–z 0–9 _"
              onChange={(e) => setUsername(e.target.value)} /></div>
        )}
        <div className="field"><label>Email</label>
          <input className="input" type="email" value={email} placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Password</label>
          <input className="input" type="password" value={password} placeholder="min 6 characters"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} /></div>

        <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy} onClick={submit}>
          {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>

        <p style={{ marginTop: 14, fontSize: 13.5, textAlign: "center" }}>
          {mode === "signup" ? "Already have an account? " : "New here? "}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "signup" ? "signin" : "signup"); }}>
            {mode === "signup" ? "Sign in" : "Create one"}
          </a>
        </p>

        <hr style={{ margin: "18px 0", border: "none", borderTop: "1px solid var(--stroke)" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button className="btn small" onClick={() => oauth("google")}>Google</button>
          <button className="btn small" onClick={() => oauth("discord")}>Discord</button>
          <button className="btn small" onClick={() => oauth("apple")}>Apple</button>
          <button className="btn small" onClick={magicLink}>Magic link</button>
        </div>
        <p className="faint mono" style={{ fontSize: 9.5, textAlign: "center", marginTop: 12, letterSpacing: ".06em" }}>
          OAUTH NEEDS PROVIDERS ENABLED IN SUPABASE · MAGIC LINKS ARE RATE-LIMITED UNTIL REAL SMTP
        </p>
      </div>
    </main>
  );
}
