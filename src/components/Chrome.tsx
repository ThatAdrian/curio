import { useEffect, useRef, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { supabase, searchMetadata, saveMediaItem, MetadataResult, MediaType, coverGradient } from "../lib/supabase";
import { useApp, Theme } from "../lib/app";
import { Modal } from "./ui";

/* ============================================================
   AddItem — search-as-you-type metadata autofill → shelf
   ============================================================ */
export function AddItemModal({ open, onClose, mediaType, shelfId, onAdded }: {
  open: boolean; onClose: () => void; mediaType: MediaType; shelfId: string; onAdded: () => void;
}) {
  const { toast } = useApp();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MetadataResult[]>([]);
  const [picked, setPicked] = useState<MetadataResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const deb = useRef<number>();

  useEffect(() => { if (open) { setQ(""); setResults([]); setPicked(null); } }, [open]);

  function onType(v: string) {
    setQ(v); setPicked(null);
    window.clearTimeout(deb.current);
    if (v.trim().length < 2) { setResults([]); return; }
    deb.current = window.setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchMetadata(mediaType, v.trim())); }
      catch (e: any) { toast("Search failed: " + e.message); }
      finally { setSearching(false); }
    }, 350);
  }

  async function add() {
    if (!picked) return;
    setBusy(true);
    try {
      const mediaId = await saveMediaItem(picked);
      const PRICES = ["\u00a33.50", "99p", "2 FOR \u00a35", "\u00a31 BIN", "50p SALE", "\u00a37.99", "CLEARANCE"];
      const sticker = Math.random() < 0.4 ? { label: PRICES[Math.floor(Math.random() * PRICES.length)] } : null;
      const { error } = await supabase.from("shelf_items").insert({ shelf_id: shelfId, media_item_id: mediaId, price_sticker: sticker });
      if (error) {
        if (error.code === "23505") toast("Already on this shelf — it can't be shelved twice.");
        else throw error;
      } else {
        toast(sticker ? `${picked.title} shelved \u2014 price sticker still on. Peel it or wear it proudly.` : `${picked.title} shelved.`);
        onAdded(); onClose();
      }
    } catch (e: any) { toast("Couldn't shelve it: " + e.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h3>Add to shelf</h3>
      <p className="sub">Start typing — metadata autofills from TMDB, IGDB, Open Library and MusicBrainz.</p>
      <div className="field">
        <input className="input" autoFocus value={q} placeholder="search titles…" onChange={(e) => onType(e.target.value)} />
      </div>
      {searching && <p className="faint mono" style={{ fontSize: 11 }}>searching…</p>}
      {!picked && results.map((r, i) => (
        <button key={i} onClick={() => setPicked(r)}
          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "9px 8px", borderRadius: 12 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
          <span style={{ width: 34, height: 46, borderRadius: 6, flex: "none", overflow: "hidden", background: coverGradient(r.title) }}>
            {r.cover_url && <img src={r.cover_url} style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: "block", fontSize: 13.5 }}>{r.title}</b>
            <span className="mono faint" style={{ fontSize: 10.5 }}>
              {r.year ?? "—"}{r.creators[0] ? " · " + r.creators[0].name : ""}
            </span>
          </span>
          <span className="chip">{r.external_source.toUpperCase()}</span>
        </button>
      ))}
      {picked && (
        <>
          <div className="card pad" style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
            <span style={{ width: 52, height: 70, borderRadius: 8, flex: "none", overflow: "hidden", background: coverGradient(picked.title) }}>
              {picked.cover_url && <img src={picked.cover_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </span>
            <span>
              <b>{picked.title}</b>
              <span className="mono faint" style={{ display: "block", fontSize: 11 }}>
                {picked.year ?? "—"} · {picked.external_source.toUpperCase()}
              </span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setPicked(null)}>Back</button>
            <button className="btn primary" disabled={busy} onClick={add}>{busy ? "…" : "Put it on the shelf"}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ============================================================
   TopBar — wordmark + notifications bell
   ============================================================ */
export function TopBar() {
  const { session, profile } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);

  async function load() {
    if (!session?.user) return;
    const { data } = await supabase.from("notifications")
      .select("*, actor:profiles!notifications_actor_id_fkey(username)")
      .eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(20);
    setNotifs((data as any[]) ?? []);
  }
  useEffect(() => { load(); }, [session?.user?.id]);

  const unread = notifs.filter((n) => !n.read_at).length;

  async function openPanel() {
    setOpen(!open);
    if (!open && unread > 0) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() })
        .eq("user_id", session!.user.id).is("read_at", null);
      setTimeout(load, 400);
    }
  }
  const LABEL: Record<string, string> = {
    follow: "started following you", guestbook_signed: "signed your guestbook",
    review_like: "liked your review", review_comment: "commented on your review",
    bag_received: "handed you a bag of recommendations 🛍", bag_returned: "finished your bag — verdicts in",
    wrap_received: "sent you a blind date 🎀", room_invite: "added you to a living room 🛋",
    badge_earned: "— badge earned 🏅", loan_requested: "wants to borrow something",
    loan_returned: "returned what they borrowed",
  };

  return (
    <>
      <header className="topbar">
        <Link to="/" className="wordmark" style={{ textDecoration: "none" }}><span className="dot" />curio</Link>
        {profile && (
          <div className="bellwrap">
            <button className="icon-btn" aria-label="Notifications" onClick={openPanel}>🔔
              {unread > 0 && <span className="bellbadge">{unread}</span>}
            </button>
          </div>
        )}
      </header>
      {open && (
        <div className="notif-panel">
          <div className="section-label">For you — private</div>
          {notifs.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Nothing yet. Quiet shelves, calm mind.</p>}
          {notifs.filter((n) => {
            const pf: any = profile?.prefs ?? {};
            const t = n.type as string;
            const g = t.startsWith("bag_") || t === "wrap_received" ? "notif_gifts"
              : t.startsWith("loan_") ? "notif_loans"
              : t === "room_invite" ? "notif_clubs" : "notif_social";
            return pf[g] !== false;
          }).map((n) => (
            <div key={n.id} className={"notif" + (!n.read_at ? " unread" : "")} style={{ cursor: "pointer" }}
              onClick={() => {
                setOpen(false);
                const t = n.type as string;
                if (t === "follow" && n.actor?.username) nav(`/u/${n.actor.username}`);
                else if (t.startsWith("bag_") || t === "wrap_received") nav("/gifts");
                else if (t === "room_invite" && n.payload?.room_id) nav(`/room/${n.payload.room_id}`);
                else if (t.startsWith("loan_")) nav("/rooms");
                else if (t === "guestbook_signed") nav("/");
                else nav("/activity");
              }}>
              <span className="mini-ava">{(n.actor?.username ?? "?")[0]?.toUpperCase()}</span>
              <div className="ninfo">
                <b>@{n.actor?.username ?? "someone"} {LABEL[n.type] ?? n.type}</b>
                <span>{new Date(n.created_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ============================================================
   TabBar
   ============================================================ */
export function TabBar({ onCustomize }: { onCustomize: () => void }) {
  const loc = useLocation();
  const nav = useNavigate();
  const tabs = [
    { path: "/", ic: "👤", label: "Profile" },
    { path: "/shelf", ic: "📚", label: "Shelf" },
    { path: "/discover", ic: "🧭", label: "Discover" },
    { path: "/activity", ic: "⚡", label: "Activity" },
    { path: "/settings", ic: "⚙", label: "Settings" },
  ];
  return (
    <nav className="tabbar-wrap">
      <div className="tabbar" role="tablist">
        {tabs.map((t) => (
          <button key={t.path} className={"tab" + (loc.pathname === t.path ? " active" : "")}
            onClick={() => nav(t.path)}>
            <span className="ic">{t.ic}</span><span className="lbl">{t.label}</span>
          </button>
        ))}
        <span className="divider" />
        <button className="tab" onClick={onCustomize}><span className="ic">🎨</span><span className="lbl">Theme</span></button>
      </div>
    </nav>
  );
}

/* ============================================================
   Customizer sheet — persists to profiles.theme
   ============================================================ */
const BANNERS = [
  "linear-gradient(120deg,#1b1f3a 0%,#3a2a68 38%,#7c3f7d 70%,#c25b63 100%)",
  "linear-gradient(120deg,#f02fc2,#7d4fff,#28b0c9)",
  "linear-gradient(120deg,#0c2c1e,#2f6b4f,#caa05f)",
  "linear-gradient(120deg,#040805,#0c2415,#3dff8e)",
  "linear-gradient(120deg,#11233f,#d97b2f)",
];
export function CustomizerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, setThemePatch, toast } = useApp();
  const t: Theme = profile?.theme ?? {};
  const ACCENTS = ["#8a7bff", "#ff6b5e", "#2ed3b0", "#ffb454", "#ff6fb5", "#3dff8e"];
  const navSheet = useNavigate();
  const [earned, setEarned] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open || !profile) return;
    supabase.from("user_badges").select("badges(slug)").eq("user_id", profile.id)
      .then(({ data }) => setEarned(new Set(((data as any[]) ?? []).map((b) => b.badges?.slug))));
  }, [open, profile?.id]);
  const MATS = [
    { v: "default", n: "Cedar", s: "the default — honest wood" },
    { v: "walnut", n: "Walnut", s: "darker, moodier" },
    { v: "metal", n: "Industrial", s: "grated steel", need: "ten_ratings", hint: "rate 10 things in half-stars" },
    { v: "pastel", n: "Pastel dream", s: "soft & milky", need: "completionist", hint: "take something to 100%" },
  ];
  const MODS: [string, string][] = [
    ["stats", "Stat cards"], ["rotation", "In rotation"], ["connections", "Connections"],
    ["badges", "Badges"], ["reviews", "Recent reviews"], ["spaces", "Spaces"],
    ["canvas", "The canvas"], ["guestbook", "Guestbook"],
  ];
  const mods = (t as any).modules ?? {};

  return (
    <>
      <div className={"sheet-scrim" + (open ? " open" : "")} onClick={onClose} />
      <aside className={"sheet" + (open ? " open" : "")}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Your space, your rules</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <p className="sub">Saved to your profile — visitors see it exactly as you styled it.</p>

        <section>
          <div className="section-label">Theme</div>
          <div className="theme-grid">
            {[["glass", "Liquid Glass", "the iOS look"], ["vapor", "Vapor", "hyperpop daylight"],
              ["paperback", "Paperback", "reading-room warm"], ["terminal", "Terminal", "phosphor & mono"]].map(([v, n, s]) => (
              <button key={v} className={"theme-card" + ((t.theme ?? "glass") === v ? " on" : "")}
                onClick={() => { setThemePatch({ theme: v }); toast(`Theme: ${n}.`); }}>
                <b>{n}</b><span>{s}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="section-label">Accent</div>
          <div className="accent-row">
            {ACCENTS.map((a) => (
              <button key={a} className={"accent-dot" + (t.accent === a ? " on" : "")}
                style={{ background: a }} aria-label={a} onClick={() => setThemePatch({ accent: a })} />
            ))}
          </div>
        </section>

        <section>
          <div className="section-label">Card frame</div>
          <div className="theme-grid">
            {[["glass", "Soft glass"], ["outline", "Outline"], ["double", "Double ink"], ["gradient", "Gradient edge"]].map(([v, n]) => (
              <button key={v} className={"theme-card" + ((t.frame ?? "glass") === v ? " on" : "")}
                onClick={() => setThemePatch({ frame: v })}><b>{n}</b></button>
            ))}
          </div>
        </section>

        <section>
          <div className="section-label">Corners</div>
          <div className="slider-row">
            <input type="range" min={6} max={32} value={t.radius ?? 24}
              onChange={(e) => setThemePatch({ radius: +e.target.value })} />
            <span className="val">{t.radius ?? 24}px</span>
          </div>
        </section>

        <section>
          <div className="section-label">Avatar shape</div>
          <div className="shape-row">
            {[["squircle", 9], ["circle", 50], ["square", 3], ["hex", 0]].map(([v, r]) => (
              <button key={v} className={"shape-pick" + ((t.avshape ?? "squircle") === v ? " on" : "")}
                onClick={() => setThemePatch({ avshape: v as string })} aria-label={v as string}>
                <i style={v === "hex"
                  ? { clipPath: "polygon(50% 0%,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%)" }
                  : { borderRadius: (r as number) + (v === "circle" ? "%" : "px") }} />
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="section-label">Avatar decoration</div>
          <div className="theme-grid">
            {[["none", "None"], ["ring", "Accent ring"], ["holo", "Holo rim"]].map(([v, n]) => (
              <button key={v} className={"theme-card" + ((t.avdeco ?? "none") === v ? " on" : "")}
                onClick={() => setThemePatch({ avdeco: v })}><b>{n}</b></button>
            ))}
          </div>
        </section>

        <section>
          <div className="section-label">Default shelf material — per-shelf picks override this</div>
          <div className="theme-grid">
            {MATS.map((m) => {
              const locked = !!m.need && !earned.has(m.need);
              return (
                <button key={m.v} className={"theme-card" + ((t.shelfskin ?? "default") === m.v ? " on" : "") + (locked ? " locked" : "")}
                  onClick={() => {
                    if (locked) return toast(`Locked — ${m.hint}. Finishes are earned, not bought.`);
                    setThemePatch({ shelfskin: m.v });
                    toast(m.v === "default" ? "Back to cedar. The books exhale." : `${m.n} it is — every default shelf wears it now.`);
                  }}>
                  <b>{m.n}</b><span>{m.s}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="section-label">Profile modules</div>
          <p className="sub" style={{ marginBottom: 10 }}>Add, remove and rearrange profile modules with <b>Edit profile</b> on your profile page — drag to taste.</p>
          <button className="btn small" onClick={() => { onClose(); navSheet("/"); setTimeout(() => window.dispatchEvent(new Event("curio-edit-profile")), 80); }}>✎ Open profile in edit mode</button>
        </section>

        <section>
          <div className="section-label">Profile banner</div>
          <div className="banner-row">
            {BANNERS.map((b) => (
              <button key={b} className={"banner-pick" + (t.banner === b ? " on" : "")}
                style={{ background: b }} onClick={() => setThemePatch({ banner: b })} aria-label="banner" />
            ))}
          </div>
        </section>
      </aside>
    </>
  );
}
