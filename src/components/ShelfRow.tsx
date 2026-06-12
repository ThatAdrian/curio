import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, notify, coverGradient, MEDIA_LABELS, MediaType } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Modal, Cover } from "./ui";

export type ShelfItemRow = {
  id: string; shelf_id: string; media_item_id: string; position: number;
  completion: number; completed_at: string | null; times_consumed: number;
  last_consumed_at: string | null; added_at: string;
  price_sticker: { label: string } | null;
  media_variants?: { id: string; name: string; cover_url: string } | null;
  media_items: {
    id: string; media_type: MediaType; title: string; year: number | null;
    cover_url: string | null; metadata: Record<string, any>;
    creators: { role: string; name: string }[];
  };
};

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

function dims(it: ShelfItemRow) {
  const m = it.media_items; const h = hash(m.title);
  switch (m.media_type) {
    case "film": return { w: 34, h: 186, cw: 126 };
    case "tv": return { w: 40, h: 186, cw: 126 };
    case "game": return { w: 22 + (h % 5), h: 138 + (h % 30), cw: 118 };
    case "book": {
      const pages = Number(m.metadata?.page_count) || 280;
      return { w: Math.max(24, Math.min(54, Math.round(20 + pages / 28))), h: 156 + (h % 24), cw: 112 };
    }
    case "music": return { w: 11 + (h % 3), h: 172, cw: 172 };
  }
}

function spineColor(title: string) {
  const pals = ["#2c2c31", "#3a3128", "#27343b", "#1f2b3a", "#3a2a5c", "#5c2f33", "#23272b", "#7a5a2e", "#1f3a4a", "#4a4a52", "#2a3340", "#6f9a0a"];
  return pals[hash(title) % pals.length];
}

const PLAT_COLORS: Record<string, string> = {
  NDS: "#8a8f98", "3DS": "#c0392b", NGC: "#6a5acd", Wii: "#0096d2", WiiU: "#0096d2",
  Switch: "#e60012", PS1: "#444c5c", PS2: "#2a3a6e", PS3: "#003791", PS4: "#003791", PS5: "#003791",
  PSP: "#444c5c", X360: "#107c10", XONE: "#107c10", PC: "#3a4b6b", SNES: "#5c4a9c", NES: "#8a2a2a", GBA: "#4a2a8a",
};

const DAY = 86400000;
function isStale(it: ShelfItemRow) {
  const last = it.last_consumed_at ? +new Date(it.last_consumed_at) : null;
  const added = +new Date(it.added_at);
  if (last) return Date.now() - last > 120 * DAY;
  return Date.now() - added > 30 * DAY;
}

export function emitMote(x: number, y: number) {
  const m = document.createElement("span");
  m.className = "mote";
  m.style.left = x + "px"; m.style.top = y + "px";
  m.style.setProperty("--mx", (Math.random() * 44 - 22).toFixed(0) + "px");
  m.style.setProperty("--my", (-(Math.random() * 34 + 10)).toFixed(0) + "px");
  document.body.appendChild(m);
  setTimeout(() => m.remove(), 850);
}

export function ShelfRow({ items, ownerView, ownerId, onChanged }: {
  items: ShelfItemRow[]; ownerView: boolean; ownerId?: string; onChanged: () => void;
}) {
  const { session, toast } = useApp();
  const nav = useNavigate();
  const [hov, setHov] = useState<string | null>(null);
  const [pop, setPop] = useState<{ item: ShelfItemRow; x: number; y: number } | null>(null);
  const [inspect, setInspect] = useState<ShelfItemRow | null>(null);
  const [edit, setEdit] = useState<ShelfItemRow | null>(null);
  const [blowing, setBlowing] = useState<ShelfItemRow | null>(null);
  const hideT = useRef<number>();
  const wipe = useRef<Record<string, number>>({});
  const peel = useRef<{ el: HTMLElement; item: ShelfItemRow; p: number; x: number; y: number } | null>(null);

  /* ---------- sticker peel engine (drag across to curl it off) ---------- */
  useEffect(() => {
    function move(e: PointerEvent) {
      const pl = peel.current;
      if (!pl) return;
      pl.p = Math.min(1.2, pl.p + (Math.abs(e.clientX - pl.x) + Math.abs(e.clientY - pl.y)) / 130);
      pl.x = e.clientX; pl.y = e.clientY;
      pl.el.style.transform = `rotate(${8 + pl.p * 58}deg) translate(${pl.p * 15}px,${-pl.p * 9}px) scale(${1 - pl.p * 0.1})`;
      pl.el.style.boxShadow = `0 ${2 + pl.p * 11}px ${6 + pl.p * 15}px rgba(0,0,0,.45)`;
      if (Math.random() < 0.3) emitMote(e.clientX, e.clientY);
      if (pl.p >= 1.2) finishPeel();
    }
    async function finishPeel() {
      const pl = peel.current; if (!pl) return;
      peel.current = null;
      pl.el.style.transition = ""; pl.el.style.transform = "";
      pl.el.classList.add("peeling");
      await supabase.from("shelf_items").update({ price_sticker: null }).eq("id", pl.item.id);
      toast("Peeled clean off in one. Kept in a drawer forever, obviously.");
      setTimeout(onChanged, 650);
    }
    function up() {
      const pl = peel.current; if (!pl) return;
      if (pl.p >= 0.75) return void finishPeel();
      pl.el.style.transition = "transform .45s var(--spring), box-shadow .3s";
      pl.el.style.transform = ""; pl.el.style.boxShadow = "";
      peel.current = null;
      toast("It resists. Commit to the peel.");
    }
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
  }, [onChanged]);

  function showPop(it: ShelfItemRow, el: HTMLElement) {
    window.clearTimeout(hideT.current);
    setHov(it.id);
    const r = el.getBoundingClientRect();
    const d = dims(it)!;
    let x = r.left + (r.width + d.cw * 0.72) / 2 - 95;
    x = Math.max(10, Math.min(innerWidth - 200, x));
    let y = r.bottom + 12;
    if (y + 140 > innerHeight - 96) y = Math.max(10, r.top - 150);
    setPop({ item: it, x, y });
  }
  function scheduleHide() {
    window.clearTimeout(hideT.current);
    hideT.current = window.setTimeout(() => {
      if (peel.current) return scheduleHide(); // mid-peel: keep the cover out
      setHov(null); setPop(null);
    }, 300);
  }
  useEffect(() => {
    const h = () => { setHov(null); setPop(null); };
    addEventListener("scroll", h, { passive: true });
    return () => removeEventListener("scroll", h);
  }, []);

  async function dustWipe(it: ShelfItemRow, e: React.PointerEvent, el: HTMLElement) {
    if (!ownerView || !isStale(it) || peel.current) return;
    const moved = Math.abs(e.movementX) + Math.abs(e.movementY);
    wipe.current[it.id] = (wipe.current[it.id] ?? 0) + moved;
    const dust = el.querySelector(".dustf") as HTMLElement | null;
    if (dust) dust.style.opacity = String(Math.max(0, 1 - wipe.current[it.id] / 240));
    if (moved > 2 && Math.random() < 0.4) emitMote(e.clientX, e.clientY);
    if (wipe.current[it.id] > 240) {
      delete wipe.current[it.id];
      for (let i = 0; i < 8; i++) setTimeout(() => emitMote(e.clientX + (Math.random() * 30 - 15), e.clientY), i * 35);
      await supabase.from("shelf_items").update({ last_consumed_at: new Date().toISOString() }).eq("id", it.id);
      toast(`Dusted. ${it.media_items.title} looks almost guilty about it.`);
      onChanged();
    }
  }

  async function borrow(it: ShelfItemRow) {
    if (!session?.user || !ownerId) return toast("Sign in to borrow.");
    const { data: existing } = await supabase.from("loans").select("id,status")
      .eq("borrower_id", session.user.id).eq("media_item_id", it.media_item_id)
      .in("status", ["requested", "active"]).maybeSingle();
    if (existing) return toast(existing.status === "requested" ? "Already asked — patience is part of borrowing." : "You've already got this one out.");
    const { error } = await supabase.from("loans").insert({
      lender_id: ownerId, borrower_id: session.user.id,
      media_item_id: it.media_item_id, shelf_item_id: it.id,
    });
    if (error) return toast(error.message);
    notify(ownerId, "loan_requested", { title: it.media_items.title });
    toast(`Asked to borrow ${it.media_items.title}. They'll see the request — check your rooms' coffee table.`);
    setPop(null); setHov(null);
  }

  return (
    <>
      <div className="row3d">
        {items.map((it) => {
          const m = it.media_items;
          const d = dims(it)!;
          const stale = isStale(it);
          const worn = it.times_consumed >= 20;
          const loved = worn && m.media_type === "music";
          const lean = hash(m.title) % 7 === 3;
          const plat = (m.metadata?.platforms?.[0] as string) ?? "";
          return (
            <div key={it.id}
              className={"sp" + (hov === it.id ? " hov" : "") + (worn ? " worn" : "") + (loved ? " loved" : "") + (lean ? " lean" : "")}
              data-type={m.media_type}
              style={{ "--w": d.w + "px", "--h": d.h + "px", "--cw": d.cw + "px" } as any}
              tabIndex={0}
              onPointerEnter={(e) => showPop(it, e.currentTarget)}
              onPointerLeave={scheduleHide}
              onPointerMove={(e) => dustWipe(it, e, e.currentTarget)}
            >
              <div className="sp3d">
                <div className="face fspine" data-plat={plat}
                  style={{ background: spineColor(m.title), "--pcol": PLAT_COLORS[plat] ?? "#444" } as any}>
                  <span className="stxt">{m.title}</span>
                  {stale && <div className="dustf" />}
                </div>
                <div className="face ffront">
                  <Cover url={it.media_variants?.cover_url ?? m.cover_url} title={m.title}
                    sub={`${MEDIA_LABELS[m.media_type]}${m.year ? " · " + m.year : ""}${it.media_variants ? " · " + it.media_variants.name : ""}`} />
                  {it.price_sticker?.label && ownerView && (
                    <span className="price-stk" data-peel
                      onPointerDown={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        const el = e.currentTarget as HTMLElement;
                        el.style.transition = "none";
                        peel.current = { el, item: it, p: 0, x: e.clientX, y: e.clientY };
                      }}>
                      {it.price_sticker.label}
                    </span>
                  )}
                  {it.price_sticker?.label && !ownerView && <span className="price-stk" style={{ cursor: "default" }}>{it.price_sticker.label}</span>}
                  {stale && <div className="dustf" />}
                </div>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div style={{ alignSelf: "center", padding: "30px 10px", fontFamily: "var(--font-mono)", fontSize: 11, opacity: 0.7 }}>
            empty shelf — hit + Add and give it a life
          </div>
        )}
      </div>

      {/* global fixed popup */}
      <div className={"sp-pop" + (pop ? " show" : "")}
        style={pop ? { left: pop.x, top: pop.y } : undefined}
        onPointerEnter={() => window.clearTimeout(hideT.current)}
        onPointerLeave={scheduleHide}>
        {pop && (
          <>
            <b>{pop.item.media_items.title}</b>
            <span className="fchip">
              {pop.item.completion >= 100 ? "★ 100% complete" : pop.item.completion > 0 ? pop.item.completion + "% in" : "on the shelf"}
              {pop.item.times_consumed > 0 ? ` · ${pop.item.times_consumed} plays` : ""}
              {isStale(pop.item) ? " · 🕸 dusty" : ""}
            </span>
            <div className="acts">
              <button onClick={() => { setInspect(pop.item); setPop(null); setHov(null); }}>👁<br />View</button>
              <button onClick={() => nav(`/m/${pop.item.media_items.id}`)}>📄<br />Page</button>
              {ownerView && isStale(pop.item) && pop.item.media_items.media_type === "game" && (
                <button onClick={() => { setBlowing(pop.item); setPop(null); setHov(null); }}>🌬<br />Ritual</button>
              )}
              {ownerView && <button onClick={() => { setEdit(pop.item); setPop(null); setHov(null); }}>✎<br />Edit</button>}
              {!ownerView && session && ownerId && ownerId !== session.user.id && (
                <button onClick={() => borrow(pop.item)}>📚<br />Borrow</button>
              )}
              {ownerView && <button onClick={() => toast("Local file launching arrives with the desktop app (2.0).")}>▶<br />Open</button>}
            </div>
          </>
        )}
      </div>

      <InspectModal item={inspect} onClose={() => setInspect(null)} />
      {edit && <EditModal item={edit} onClose={() => setEdit(null)} onChanged={onChanged} />}
      {blowing && <BlowModal item={blowing} onClose={() => setBlowing(null)} onChanged={onChanged} />}
    </>
  );
}

/* ---------- shelf sprites: placeable trinkets along the plank ---------- */
export function ShelfSprites({ decorations, editable, onChange }: {
  decorations: { e: string; x: number }[]; editable: boolean;
  onChange?: (next: { e: string; x: number }[]) => void;
}) {
  const { toast } = useApp();
  return (
    <>
      {decorations.map((d, i) => (
        <span key={i} className="sprite" style={{ left: d.x + "%" }}
          title={editable ? "click to remove" : undefined}
          onClick={() => {
            if (!editable || !onChange) return;
            onChange(decorations.filter((_, j) => j !== i));
            toast("Trinket pocketed.");
          }}>
          {d.e}
        </span>
      ))}
    </>
  );
}

/* ---------- 3D inspect ---------- */
function InspectModal({ item, onClose }: { item: ShelfItemRow | null; onClose: () => void }) {
  const [rot, setRot] = useState({ x: -10, y: 26 });
  const [idle, setIdle] = useState(true);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { if (item) { setRot({ x: -10, y: 26 }); setIdle(true); } }, [item]);
  if (!item) return null;

  const m = item.media_items;
  const d = dims(item)!;
  const K = m.media_type === "music" ? 1.5 : 1.75;
  const W = d.cw * K, H = d.h * K, D = Math.max(d.w * K, 8);
  const spine = spineColor(m.title);
  const face = (w: number, h: number, tf: string, bg: string, inner?: React.ReactNode) => (
    <div className="iface" style={{
      width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, transform: tf, background: bg, borderRadius: 3,
    }}>{inner}</div>
  );

  return (
    <Modal open onClose={onClose} width={620}>
      <div className="inspect-stage"
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; setIdle(false); (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
          drag.current = { x: e.clientX, y: e.clientY };
          setRot((r) => ({ x: Math.max(-85, Math.min(85, r.x - dy * 0.45)), y: r.y + dx * 0.45 }));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}>
        <div className={"ibox" + (idle ? " idle" : "")}
          style={!idle ? { transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` } : undefined}>
          {face(W, H, `translateZ(${D / 2}px)`, coverGradient(m.title), (
            <Cover url={item.media_variants?.cover_url ?? m.cover_url} title={m.title} sub={m.year ? String(m.year) : undefined}
              style={{ width: "100%", height: "100%", borderRadius: 0 }} />
          ))}
          {face(W, H, `rotateY(180deg) translateZ(${D / 2}px)`, spine, (
            <div style={{ padding: 16, color: "rgba(255,255,255,.6)", fontFamily: "var(--font-mono)", fontSize: 9, lineHeight: 1.8 }}>
              {(m.creators ?? []).map((c) => c.name).join(" · ") || "—"}<br /><br />
              <span style={{ border: "1px solid rgba(255,255,255,.3)", padding: "2px 7px", borderRadius: 3 }}>CURIO™ ARCHIVAL COPY</span>
            </div>
          ))}
          {face(D, H, `rotateY(-90deg) translateZ(${W / 2}px)`, spine, (
            <span style={{ writingMode: "vertical-rl", color: "#fff", fontSize: 13, fontWeight: 600 }}>{m.title}</span>
          ))}
          {face(D, H, `rotateY(90deg) translateZ(${W / 2}px)`, spine)}
          {face(W, D, `rotateX(90deg) translateZ(${H / 2}px)`, spine)}
          {face(W, D, `rotateX(-90deg) translateZ(${H / 2}px)`, spine)}
        </div>
      </div>
      <div className="inspect-cap">
        <h3>{m.title}</h3>
        <div className="hint">drag to rotate · esc to put it back</div>
      </div>
    </Modal>
  );
}

/* ---------- cartridge blow ritual ---------- */
function BlowModal({ item, onClose, onChanged }: { item: ShelfItemRow; onClose: () => void; onChanged: () => void }) {
  const { toast } = useApp();
  const [progress, setProgress] = useState(0);
  const [clean, setClean] = useState(false);
  const raf = useRef<number>();
  const holding = useRef(false);
  const done = useRef(false);

  function start(e: React.PointerEvent) {
    if (clean) return;
    holding.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const tick = () => {
      if (!holding.current) return;
      setProgress((p) => {
        const np = Math.min(100, p + 1.6);
        if (Math.random() < 0.35) {
          const btn = document.querySelector(".blow-btn");
          if (btn) { const r = btn.getBoundingClientRect(); emitMote(r.left + Math.random() * r.width, r.top - 40 - Math.random() * 30); }
        }
        if (np >= 100) finish();
        return np;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }
  function stop() {
    holding.current = false;
    if (raf.current) cancelAnimationFrame(raf.current);
    if (!clean) setProgress((p) => (p < 100 ? Math.max(0, p - 12) : p));
  }
  async function finish() {
    if (done.current) return;
    done.current = true;
    holding.current = false;
    if (raf.current) cancelAnimationFrame(raf.current);
    setClean(true);
    await supabase.from("shelf_items").update({ last_consumed_at: new Date().toISOString() }).eq("id", item.id);
    toast("The contacts gleam. It'll boot first try — it always does after the ritual.");
    setTimeout(() => { onChanged(); onClose(); }, 1100);
  }

  return (
    <Modal open onClose={onClose}>
      <h3>The ritual</h3>
      <p className="sub">{item.media_items.title} has been sitting a while. You know what to do. (Officially this does nothing. Officially.)</p>
      <div className="blow-stage">
        <div className={"cart" + (clean ? " clean" : progress > 0 ? " shaking dirty" : " dirty")}
          style={{ "--cartcov": coverGradient(item.media_items.title) } as any} />
        <button className="btn primary blow-btn" style={{ minWidth: 200, justifyContent: "center" }}
          onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>
          <span className="fill" style={{ width: progress + "%" }} />
          <span>{clean ? "✨ pristine" : progress > 0 ? "keep blowing…" : "🌬 hold to blow"}</span>
        </button>
      </div>
    </Modal>
  );
}

/* ---------- edit shelf item ---------- */
function EditModal({ item, onClose, onChanged }: { item: ShelfItemRow; onClose: () => void; onChanged: () => void }) {
  const { toast } = useApp();
  const [completion, setCompletion] = useState(item.completion);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const patch: any = { completion };
    if (completion >= 100 && !item.completed_at) patch.completed_at = new Date().toISOString();
    await supabase.from("shelf_items").update(patch).eq("id", item.id);
    toast(completion >= 100 ? "100% — variant hunting unlocks for this one." : "Saved.");
    onChanged(); onClose();
  }
  async function logPlay() {
    setBusy(true);
    await supabase.from("shelf_items").update({
      times_consumed: item.times_consumed + 1, last_consumed_at: new Date().toISOString(),
    }).eq("id", item.id);
    await supabase.from("diary_entries").insert({
      user_id: (await supabase.auth.getUser()).data.user!.id,
      media_item_id: item.media_item_id, is_rewatch: item.times_consumed > 0,
    });
    toast(`Logged — ${item.media_items.title} goes in today's diary.`);
    onChanged(); onClose();
  }
  async function remove() {
    if (!confirm(`Take ${item.media_items.title} off the shelf?`)) return;
    await supabase.from("shelf_items").delete().eq("id", item.id);
    toast("Off the shelf. The gap stares back.");
    onChanged(); onClose();
  }

  return (
    <Modal open onClose={onClose}>
      <h3>{item.media_items.title}</h3>
      <p className="sub">Progress, plays, and shelf housekeeping.</p>
      <div className="field">
        <label>Completion — {completion}%</label>
        <div className="slider-row">
          <input type="range" min={0} max={100} step={5} value={completion}
            onChange={(e) => setCompletion(+e.target.value)} />
          <span className="val">{completion}%</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <button className="btn primary" disabled={busy} onClick={save}>Save</button>
        <button className="btn" disabled={busy} onClick={logPlay}>+ Log a session</button>
        <button className="btn danger" disabled={busy} onClick={remove} style={{ marginLeft: "auto" }}>Remove</button>
      </div>
    </Modal>
  );
}
