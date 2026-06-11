import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function magicLink() {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (!error) setSent(true);
    else alert(error.message);
  }
  async function oauth(provider: "google" | "discord" | "apple") {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }

  return (
    <main style={{ padding: 24, maxWidth: 380 }}>
      <h1>Sign in</h1>
      {sent ? (
        <p>Check your email for the magic link.</p>
      ) : (
        <>
          <input
            type="email" value={email} placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <button onClick={magicLink}>Email me a magic link</button>
          <p style={{ margin: "16px 0 8px" }}>or</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => oauth("google")}>Google</button>
            <button onClick={() => oauth("discord")}>Discord</button>
            <button onClick={() => oauth("apple")}>Apple</button>
          </div>
          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 16 }}>
            Enable each provider in Supabase → Authentication → Providers.
            Steam links as a connection later (it's OpenID, not OAuth).
          </p>
        </>
      )}
    </main>
  );
}
