import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, coverGradient, MEDIA_LABELS, MediaType } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Modal, Cover } from "./ui";

export type ShelfItemRow = {
  id: string; shelf_id: string; media_item_id: string; position: number;
  completion: number; completed_at: string | null; times_consumed: number;
  last_consumed_at: string | null; added_at: string;
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

export function ShelfRow({ items, ownerView, onChanged }: {
  items: ShelfItemRow[]; ownerView: boolean; onChanged: () => void;
}) {
  const { toast } = useApp();
  const nav = useNavigate();
  const [hov, setHov] = useState<string | null>(null);
  const [pop, setPop] = useState<{ item: ShelfItemRow; x: number; y: number } | null>(null);
  const [inspect, setInspect] = useState<ShelfItemRow | null>(null);
  const [edit, setEdit] = useState<ShelfItemRow | null>(null);
  const hideT = useRef<number>();
  const wipe = useRef<Record<string, number>>({});

  function emitMote(x: number, y: number) {
    const m = document.createElement("span");
    m.className = "mote";
    m.style.left = x + "px"; m.style.top = y + "px";
    m.style.setProperty("--mx", (Math.random() * 44 - 22).toFixed(0) + "px");
    m.style.setProperty("--my", (-(Math.random() * 34 + 10)).toFixed(0) + "px");
    document.body.appendChild(m);
    setTimeout(() => m.remove(), 850);
  }

  function showPop(it: ShelfItemRow, el: HTMLElement) {
    window.clearTimeout(hideT.current);
    setHov(it.id);
    const r = el.getBoundingClientRect();
    const d = dims(it)!;
    let x = r.left + (r.width + d.cw * 0.72) / 2 - 95;
    x = Math.max(10, Math.min(innerWidth - 200, x));
    let y = r.bottom + 12;
    if (y + 130 > innerHeight - 96) y = Math.max(10, r.top - 140);
    setPop({ item: it, x, y });
  }
  function scheduleHide() {
    window.clearTimeout(hideT.current);
    hideT.current = window.setTimeout(() => { setHov(null); setPop(null); }, 300);
  }
  useEffect(() => {
    const h = () => { setHov(null); setPop(null); };
    addEventListener("scroll", h, { passive: true });
    return () => removeEventListener("scroll", h);
  }, []);

  async function dustWipe(it: ShelfItemRow, e: React.PointerEvent, el: HTMLElement) {
    if (!ownerView || !isStale(it)) return;
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

  return (
    <>
      <div className="row3d">
        {items.map((it) => {
          const m = it.media_items;
          const d = dims(it)!;
          const stale = isStale(it);
          const worn = it.times_consumed >= 20;
          const loved = worn && m.media_type === "music";
          const plat = (m.metadata?.platforms?.[0] as string) ?? "";
          return (
            <div key={it.id}
              className={"sp" + (hov === it.id ? " hov" : "") + (worn ? " worn" : "") + (loved ? " loved" : "")}
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
                  <Cover url={m.cover_url} title={m.title} sub={`${MEDIA_LABELS[m.media_type]}${m.year ? " · " + m.year : ""}`} />
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
              {isStale(pop.item) ? " · 🕸 gathering dust" : ""}
            </span>
            <div className="acts">
              <button onClick={() => { setInspect(pop.item); setPop(null); setHov(null); }}>👁<br />View</button>
              <button onClick={() => nav(`/m/${pop.item.media_items.id}`)}>📄<br />Page</button>
              {ownerView && <button onClick={() => { setEdit(pop.item); setPop(null); setHov(null); }}>✎<br />Edit</button>}
              <button onClick={() => toast("Local file launching arrives with the desktop app (2.0).")}>▶<br />Open</button>
            </div>
          </>
        )}
      </div>

      <InspectModal item={inspect} onClose={() => setInspect(null)} />
      {edit && <EditModal item={edit} onClose={() => setEdit(null)} onChanged={onChanged} />}
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
            <Cover url={m.cover_url} title={m.title} sub={m.year ? String(m.year) : undefined}
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
