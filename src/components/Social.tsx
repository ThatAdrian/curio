import { useEffect, useRef, useState } from "react";
import { supabase, notify } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Seg } from "./ui";

/* ============================================================
   THE CANVAS — fridge/cork/whiteboard/blank, persisted magnets
   ============================================================ */
type Magnet = { id: string; kind: string; content: any; x: number; y: number; rotation: number; z: number };
const LETCOLS = ["#ff5e5e", "#ffb454", "#2ed3b0", "#8a7bff", "#ff6fb5", "#3dff8e", "#69b7ff"];
const PHOTO_GRADS = [
  "linear-gradient(160deg,#bfe0da,#2e564f)", "linear-gradient(160deg,#11233f,#d97b2f)",
  "linear-gradient(160deg,#8ace00,#5d8f0a)", "linear-gradient(165deg,#d8262c,#16060a)",
];

export function Canvas({ ownerId, editable }: { ownerId: string; editable: boolean }) {
  const { profile, setThemePatch, toast } = useApp();
  const [items, setItems] = useState<Magnet[]>([]);
  const [surface, setSurface] = useState<string>("fridge");
  const [removeMode, setRemoveMode] = useState(false);
  const [pop, setPop] = useState<{ kind: "letter" | "sticker"; x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; ox: number; oy: number; rotating: boolean } | null>(null);
  const zTop = useRef(10);

  async function load() {
    const { data } = await supabase.from("canvas_items").select("*").eq("user_id", ownerId).order("z");
    setItems((data as Magnet[]) ?? []);
    if (!editable) {
      const { data: p } = await supabase.from("profiles").select("theme").eq("id", ownerId).single();
      setSurface((p?.theme as any)?.canvas_surface ?? "fridge");
    }
  }
  useEffect(() => { load(); }, [ownerId]);
  useEffect(() => { if (editable && profile) setSurface(profile.theme?.canvas_surface ?? "fridge"); }, [editable, profile?.theme?.canvas_surface]);

  async function addMagnet(kind: string, content: any) {
    const m = { user_id: ownerId, kind, content, x: 50 + Math.random() * 140, y: 60 + Math.random() * 120, rotation: Math.random() * 10 - 5, z: ++zTop.current };
    const { data, error } = await supabase.from("canvas_items").insert(m).select().single();
    if (error) toast("Couldn't place it: " + error.message);
    else setItems((s) => [...s, data as Magnet]);
  }

  function onDown(e: React.PointerEvent, m: Magnet, rotating = false) {
    if (!editable) return;
    e.preventDefault(); e.stopPropagation();
    if (removeMode && !rotating) {
      supabase.from("canvas_items").delete().eq("id", m.id).then(() => {});
      setItems((s) => s.filter((x) => x.id !== m.id));
      toast("Removed. The door forgets quickly.");
      return;
    }
    const el = (e.currentTarget.closest(".magnet") ?? e.currentTarget) as HTMLElement;
    const r = el.getBoundingClientRect();
    drag.current = { id: m.id, ox: e.clientX - r.left, oy: e.clientY - r.top, rotating };
    setItems((s) => s.map((x) => (x.id === m.id ? { ...x, z: ++zTop.current } : x)));
    canvasRef.current?.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current || !canvasRef.current) return;
    const fr = canvasRef.current.getBoundingClientRect();
    const d = drag.current;
    setItems((s) => s.map((m) => {
      if (m.id !== d.id) return m;
      if (d.rotating) {
        const el = canvasRef.current!.querySelector(`[data-mid="${m.id}"]`) as HTMLElement;
        const r = el.getBoundingClientRect();
        const ang = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI + 45;
        return { ...m, rotation: ang };
      }
      let x = e.clientX - fr.left - d.ox, y = e.clientY - fr.top - d.oy;
      x = Math.max(2, Math.min(fr.width - 40, x));
      y = Math.max(2, Math.min(fr.height - 40, y));
      return { ...m, x, y };
    }));
  }
  async function onUp() {
    if (!drag.current) return;
    const m = items.find((x) => x.id === drag.current!.id);
    drag.current = null;
    if (m) await supabase.from("canvas_items").update({ x: m.x, y: m.y, rotation: m.rotation, z: m.z }).eq("id", m.id);
  }

  function magnetBody(m: Magnet) {
    switch (m.kind) {
      case "letter": return <div className="m-letter" style={{ "--mc1": m.content.color } as any}>{m.content.char}</div>;
      case "photo": return <div className="m-polaroid"><i style={{ background: m.content.grad } as any} /><span>{m.content.caption}</span></div>;
      case "note": return <div className="m-note">{m.content.text}</div>;
      default: return <div className="m-sticker">{m.content.emoji ?? "✨"}</div>;
    }
  }

  return (
    <div>
      {editable && (
        <div className="canvas-tools">
          <Seg options={[{ v: "fridge", label: "Fridge" }, { v: "cork", label: "Cork" }, { v: "white", label: "White" }, { v: "blank", label: "Blank" }] as any}
            value={surface as any}
            onChange={(v) => { setSurface(v); setThemePatch({ canvas_surface: v }); }} />
          <button className="btn small" onClick={(e) => setPop({ kind: "letter", x: e.clientX, y: e.clientY + 14 })}>+ A–Z</button>
          <button className="btn small" onClick={() => addMagnet("photo", { grad: PHOTO_GRADS[items.length % 4], caption: prompt("Caption?") ?? "untitled" })}>+ Photo</button>
          <button className="btn small" onClick={() => { const t = prompt("Note text?"); if (t) addMagnet("note", { text: t.slice(0, 60) }); }}>+ Note</button>
          <button className="btn small" onClick={(e) => setPop({ kind: "sticker", x: e.clientX, y: e.clientY + 14 })}>+ Sticker</button>
          <button className={"btn small" + (removeMode ? " armed" : "")} onClick={() => setRemoveMode(!removeMode)}>🗑 Remove</button>
        </div>
      )}
      <div ref={canvasRef} className={`canvas cf-${surface}` + (removeMode ? " canvas-remove" : "")}
        onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {items.map((m) => (
          <div key={m.id} data-mid={m.id}
            className={"magnet" + (drag.current?.id === m.id ? " held" : "")}
            style={{ left: m.x, top: m.y, zIndex: m.z, "--rot": m.rotation + "deg" } as any}
            onPointerDown={(e) => onDown(e, m)}>
            {magnetBody(m)}
            {editable && <span className="rot" onPointerDown={(e) => onDown(e, m, true)} title="drag to rotate" />}
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(60,60,70,.5)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {editable ? "an empty door. fix that." : "a suspiciously tidy canvas"}
          </div>
        )}
      </div>
      {pop && (
        <div className="popover" style={{ left: Math.min(pop.x, innerWidth - 280), top: pop.y }}
          onPointerLeave={() => setPop(null)}>
          <div className="pgridx">
            {pop.kind === "letter"
              ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ★♥!?".split("").map((ch, i) => (
                <button key={ch + i} style={{ color: LETCOLS[i % 7] }}
                  onClick={() => { addMagnet("letter", { char: ch, color: LETCOLS[i % 7] }); }}>{ch}</button>
              ))
              : ["📼", "💿", "🕹️", "🦌", "🌶️", "⚡", "🫠", "🛹", "🪩", "🍕", "👾", "🎧", "🐸", "✨"].map((s) => (
                <button key={s} onClick={() => { addMagnet("sticker", { emoji: s }); setPop(null); }}>{s}</button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   GUESTBOOK — one author per page, placed stamps, likes
   ============================================================ */
export function Guestbook({ ownerId }: { ownerId: string }) {
  const { session, profile, toast } = useApp();
  const [entries, setEntries] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [placeable, setPlaceable] = useState<string | null>(null); // entry id you may stamp
  const [spread, setSpread] = useState(0);
  const [turn, setTurn] = useState<"next" | "prev" | null>(null);

  async function load() {
    const { data } = await supabase.from("guestbook_entries")
      .select("*, author:profiles!guestbook_entries_author_id_fkey(username), guestbook_marks(*), guestbook_likes(user_id)")
      .eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(12);
    setEntries((data as any[]) ?? []);
  }
  useEffect(() => { load(); }, [ownerId]);

  async function sign() {
    if (!text.trim() || !session?.user) return;
    const { data, error } = await supabase.from("guestbook_entries")
      .insert({ owner_id: ownerId, author_id: session.user.id, body: text.trim() }).select().single();
    if (error) { toast(error.message); return; }
    setText("");
    setPlaceable(data.id);
    setSpread(0);
    notify(ownerId, "guestbook_signed", { entry_id: data.id });
    toast("Page signed. Now arm a stamp and click your page to place it.");
    load();
  }

  async function place(e: React.MouseEvent, entry: any) {
    if (!armed || entry.id !== placeable) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const isDate = armed === "DATE";
    const d = new Date();
    const val = isDate
      ? `${String(d.getDate()).padStart(2, "0")} ${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getMonth()]} ${d.getFullYear()}`
      : armed;
    await supabase.from("guestbook_marks").insert({
      entry_id: entry.id, kind: isDate ? "date" : "sticker", value: val,
      x: +x.toFixed(1), y: +y.toFixed(1), rotation: +(Math.random() * 16 - 8).toFixed(0),
    });
    toast(isDate ? "Stamped. Officially dated." : "Sticker placed.");
    load();
  }

  async function like(entry: any) {
    if (!session?.user) return;
    const mine = entry.guestbook_likes?.some((l: any) => l.user_id === session.user.id);
    if (mine) await supabase.from("guestbook_likes").delete().eq("entry_id", entry.id).eq("user_id", session.user.id);
    else await supabase.from("guestbook_likes").insert({ entry_id: entry.id, user_id: session.user.id });
    load();
  }

  const spreads = Math.max(1, Math.ceil(entries.length / 2));
  const visible = entries.slice(spread * 2, spread * 2 + 2);
  function flip(dir: "next" | "prev") {
    if (turn) return;
    if (dir === "next" && spread >= spreads - 1) return;
    if (dir === "prev" && spread <= 0) return;
    setTurn(dir);
    setTimeout(() => { setSpread((p) => dir === "next" ? p + 1 : p - 1); setTurn(null); }, 330);
  }

  return (
    <div>
      <div className={"gbook" + (turn ? " turn-" + turn : "")}>
        {visible.map((en) => (
          <div key={en.id} className={"gb-pg" + (en.id === placeable && armed ? " placeable" : "")}
            onClick={(e) => place(e, en)}>
            <div className="who"><b>{en.author?.username ?? "?"}</b> — {en.body}</div>
            {(en.guestbook_marks ?? []).map((mk: any) => (
              <span key={mk.id} className={"stampel" + (mk.kind === "date" ? " date" : "")}
                style={{ left: mk.x + "%", top: mk.y + "%", "--rot": mk.rotation + "deg" } as any}>
                {mk.value}
              </span>
            ))}
            <button className={"gb-like" + (en.guestbook_likes?.some((l: any) => l.user_id === session?.user?.id) ? " on" : "")}
              onClick={(e) => { e.stopPropagation(); like(en); }}>
              ♥ {(en.guestbook_likes ?? []).length}
            </button>
          </div>
        ))}
        {entries.length === 0 && <div className="gb-pg"><div style={{ textAlign: "center", paddingTop: 30, fontFamily: "var(--font-mono)", fontSize: 9.5, opacity: 0.5 }}>— BLANK BOOK · SIGN BELOW —</div></div>}
        {entries.length > 0 && visible.length === 1 && <div className="gb-pg"><div style={{ textAlign: "center", paddingTop: 34, fontFamily: "var(--font-mono)", fontSize: 9, opacity: 0.4 }}>this page intentionally<br />left blank</div></div>}
      </div>
      {spreads > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 8 }}>
          <button className="icon-btn" disabled={spread === 0} style={{ opacity: spread === 0 ? 0.3 : 1 }} onClick={() => flip("prev")}>‹</button>
          <span className="mono faint" style={{ fontSize: 9.5, letterSpacing: ".14em" }}>SPREAD {spread + 1} / {spreads}</span>
          <button className="icon-btn" disabled={spread >= spreads - 1} style={{ opacity: spread >= spreads - 1 ? 0.3 : 1 }} onClick={() => flip("next")}>›</button>
        </div>
      )}
      {profile && (
        <>
          <div className="gb-stkbar">
            {["DATE", "📼", "⭐", "💿", "🕹️", "🦌"].map((s) => (
              <button key={s} className={armed === s ? "armed" : ""}
                style={s === "DATE" ? { fontSize: 11, fontFamily: "var(--font-mono)", border: "1.5px solid #b03030", borderRadius: 6, color: "#b03030" } : undefined}
                onClick={() => setArmed(armed === s ? null : s)}>
                {s === "DATE" ? "📅 date" : s}
              </button>
            ))}
            {armed && <span className="mono faint" style={{ fontSize: 10, marginLeft: "auto" }}>click your page to place</span>}
          </div>
          <div className="gb-sign">
            <input className="input" style={{ borderRadius: 999 }} value={text} placeholder="Sign the guestbook…"
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sign()} />
            <button className="btn small primary" onClick={sign}>Sign</button>
          </div>
        </>
      )}
    </div>
  );
}
