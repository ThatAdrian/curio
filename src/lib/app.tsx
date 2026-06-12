import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Theme = {
  theme?: string; accent?: string; radius?: number; frame?: string;
  avshape?: string; avdeco?: string; banner?: string;
  canvas_surface?: string; shelfskin?: string; modules?: Record<string, boolean>;
};
export type Profile = {
  id: string; username: string; display_name: string | null; bio: string | null;
  avatar_url: string | null; is_verified: boolean; visibility: string; theme: Theme; prefs?: Record<string, any>;
};

type Ctx = {
  session: Session | null | undefined; // undefined = still loading
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  setThemePatch: (patch: Theme) => Promise<void>;
  toast: (msg: string, busy?: boolean) => void;
};
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.dataset.theme = t.theme ?? "glass";
  if (t.accent) root.style.setProperty("--accent", t.accent);
  else root.style.removeProperty("--accent");
  const r = t.radius ?? 24;
  root.style.setProperty("--radius", r + "px");
  root.style.setProperty("--radius-s", Math.max(6, Math.round(r * 0.58)) + "px");
  document.body.dataset.frame = t.frame ?? "glass";
  document.body.dataset.avshape = t.avshape ?? "squircle";
  document.body.dataset.avdeco = t.avdeco ?? "none";
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; busy: boolean } | null>(null);
  const toastTimer = useRef<number>();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function refreshProfile() {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) { setProfile(null); applyTheme({}); return; }
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
    if (data) { setProfile(data as Profile); applyTheme((data.theme ?? {}) as Theme); }
  }
  useEffect(() => { refreshProfile(); }, [session?.user?.id]);

  async function setThemePatch(patch: Theme) {
    if (!profile) { applyTheme(patch); return; }
    const next = { ...(profile.theme ?? {}), ...patch };
    setProfile({ ...profile, theme: next });
    applyTheme(next);
    await supabase.from("profiles").update({ theme: next }).eq("id", profile.id);
  }

  function toast(msg: string, busy = false) {
    setToastMsg({ msg, busy });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), busy ? 2600 : 2200);
  }

  return (
    <AppCtx.Provider value={{ session, profile, refreshProfile, setThemePatch, toast }}>
      {children}
      <div className="toast-wrap">
        <div className={"toast" + (toastMsg ? " show" : "")} role="status">
          {toastMsg?.busy && <span className="spin" />}
          <span>{toastMsg?.msg}</span>
        </div>
      </div>
    </AppCtx.Provider>
  );
}
