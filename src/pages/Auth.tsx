import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";

export default function Auth() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit() {
    setBusy(true);
    try {
      if (mode === "signup") {
        const uname = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{2,24}$/.test(uname)) {
          alert("Username: 2–24 chars, lowercase letters, numbers, underscores only.");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: uname, display_name: uname } },
        });
        if (error) throw error;
        alert("Account created — you're in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e: any) {
      // "Database error saving new user" usually means the username is taken
      alert(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function magicLink() {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    alert(error ? error.message : "Magic link sent — check your email.");
  }

  async function oauth(provider: "google" | "discord" | "apple") {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }

  if (session) {
    return (
      <main style={{ padding: 24, maxWidth: 420 }}>
        <h1>Signed in</h1>
        <p>{session.user.email}</p>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 380 }}>
      <h1>{mode === "signup" ? "Create your account" : "Sign in"}</h1>

      {mode === "signup" && (
        <input
          value={username}
          placeholder="username (lowercase, a–z 0–9 _)"
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 8 }}
        />
      )}
      <input
        type="email"
        value={email}
        placeholder="you@example.com"
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 10, marginBottom: 8 }}
      />
      <input
        type="password"
        value={password}
        placeholder="password (min 6 characters)"
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={{ width: "100%", padding: 10, marginBottom: 8 }}
      />
      <button onClick={submit} disabled={busy} style={{ width: "100%", padding: 10 }}>
        {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>

      <p style={{ marginTop: 12, fontSize: 13 }}>
        {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "signup" ? "signin" : "signup"); }}>
          {mode === "signup" ? "Sign in" : "Create one"}
        </a>
      </p>

      <hr style={{ margin: "20px 0", opacity: 0.3 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => oauth("google")}>Google</button>
        <button onClick={() => oauth("discord")}>Discord</button>
        <button onClick={() => oauth("apple")}>Apple</button>
        <button onClick={magicLink} disabled={!email}>Email me a magic link</button>
      </div>
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 12 }}>
        OAuth buttons need their providers enabled in Supabase → Authentication → Providers.
      </p>
    </main>
  );
}
