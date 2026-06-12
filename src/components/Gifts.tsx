import { useEffect, useRef, useState } from "react";
import { supabase, searchMetadata, saveMediaItem, notify, coverGradient, MetadataResult, MediaType, MEDIA_LABELS } from "../lib/supabase";
import { addToWatchLater } from "../lib/extras";
import { useApp } from "../lib/app";
import { Modal, Cover, Seg } from "./ui";
import { ShelfPicker } from "../pages/MediaPage";

/* ============ tiny shared item search ============ */
function ItemSearch({ onPick }: { onPick: (r: MetadataResult) => void }) {
  const { toast } = useApp();
  const [type, setType] = useState<MediaType>("film");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MetadataResult[]>([]);
  const deb = useRef<number>();
  function onType(v: string) {
    setQ(v);
    window.clearTimeout(deb.current);
    if (v.trim().length < 2) return setResults([]);
    deb.current = window.setTimeout(async () => {
      try { setResults((await searchMetadata(type, v.trim())).slice(0, 5)); }
      catch (e: any) { toast(e.message); }
    }, 380);
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Seg options={(["film", "tv", "game", "book", "music"] as MediaType[]).map((v) => ({ v, label: MEDIA_LABELS[v] }))} value={type} onChange={setType} />
      </div>
      <input className="input" value={q} placeholder="search…" onChange={(e) => onType(e.target.value)} />
      {results.map((r, i) => (
        <button key={i} style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", padding: "7px 6px", borderRadius: 10, alignItems: "center" }}
          onClick={() => { onPick(r); setQ(""); setResults([]); }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
          <span style={{ width: 26, height: 36, borderRadius: 5, flex: "none", background: coverGradient(r.title), overflow: "hidden" }}>
            {r.cover_url && <img src={r.cover_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
          </span>
          <span style={{ fontSize: 13 }}><b>{r.title}</b> <span className="faint mono" style={{ fontSize: 10 }}>{r.year ?? ""}</span></span>
        </button>
      ))}
    </div>
  );
}

/* ============ send a recommendation bag ============ */
export function SendBagModal({ recipient, onClose }: { recipient: { id: string; username: string }; onClose: () => void }) {
  const { session, toast } = useApp();
  const [picked, setPicked] = useState<MetadataResult[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!session?.user || picked.length === 0) return toast("Put at least one thing in the bag.");
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const p of picked) ids.push(await saveMediaItem(p));
      const { data: bag, error } = await supabase.from("rec_bags")
        .insert({ sender_id: session.user.id, recipient_id: recipient.id, note: note.trim() || null }).select().single();
      if (error) throw error;
      await supabase.from("bag_items").insert(ids.map((mid, i) => ({ bag_id: bag.id, media_item_id: mid, position: i })));
      notify(recipient.id, "bag_received", { bag_id: bag.id });
      toast(`Bag handed to @${recipient.username}. ${picked.length} item${picked.length > 1 ? "s" : ""}, zero skips promised.`);
      onClose();
    } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} width={520}>
      <h3>🛍 A bag for @{recipient.username}</h3>
      <p className="sub">Up to six things you'd press into their hands. They pull them out one at a time.</p>
      {picked.length < 6 && <ItemSearch onPick={(r) => setPicked([...picked, r])} />}
      {picked.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
          {picked.map((p, i) => (
            <span key={i} className="chip">{p.title} <button onClick={() => setPicked(picked.filter((_, j) => j !== i))} style={{ marginLeft: 4 }}>✕</button></span>
          ))}
        </div>
      )}
      <div className="field" style={{ marginTop: 10 }}><label>Note taped to the bag — 140 chars</label>
        <input className="input" maxLength={140} value={note} placeholder="no skips in here, i promise" onChange={(e) => setNote(e.target.value)} /></div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || picked.length === 0} onClick={send}>Hand it over</button>
      </div>
    </Modal>
  );
}

/* ============ open a received bag — proper 3D ============ */
function BagFace({ w, h, tf, style, children }: { w: number; h: number; tf: string; style?: React.CSSProperties; children?: React.ReactNode }) {
  return (
    <div className="bagface" style={{ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, transform: tf, ...style }}>
      {children}
    </div>
  );
}

export function OpenBagModal({ bag, onClose, onDone }: { bag: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [items, setItems] = useState<any[]>([]);
  const [current, setCurrent] = useState<any | null>(null);
  const [picking, setPicking] = useState<any | null>(null);
  const [pendingFinish, setPendingFinish] = useState(false);
  const [rot, setRot] = useState({ x: -8, y: 22 });
  const [itemRot, setItemRot] = useState({ x: -8, y: 22 });
  const [grabbed, setGrabbed] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const W = 170, H = 150, D = 92;

  async function load() {
    const { data } = await supabase.from("bag_items")
      .select("*, media_items(*)").eq("bag_id", bag.id).order("position");
    setItems((data as any[]) ?? []);
    if (bag.status === "pending") await supabase.from("rec_bags").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", bag.id);
  }
  useEffect(() => { load(); }, [bag.id]);

  const remaining = items.filter((i) => !i.pulled_at);
  const inspecting = !!current;

  async function pull() {
    const next = remaining[0];
    if (!next) return;
    await supabase.from("bag_items").update({ pulled_at: new Date().toISOString() }).eq("bag_id", bag.id).eq("media_item_id", next.media_item_id);
    setItemRot({ x: -8, y: 22 });
    setCurrent({ ...next, pulled_at: new Date().toISOString() });
    setItems(items.map((i) => (i.media_item_id === next.media_item_id ? { ...i, pulled_at: new Date().toISOString() } : i)));
  }
  async function outcome(o: "shelved" | "watch_later" | "skipped") {
    if (!current) return;
    await supabase.from("bag_items").update({ outcome: o }).eq("bag_id", bag.id).eq("media_item_id", current.media_item_id);
    if (o === "watch_later") { try { toast(await addToWatchLater(current.media_item_id)); } catch (e: any) { toast(e.message); } }
    if (o === "shelved") setPicking(current);
    if (o === "skipped") toast("Skipped. The sender felt a disturbance.");
    const left = items.filter((i) => !i.pulled_at && i.media_item_id !== current.media_item_id);
    setCurrent(null);
    if (left.length === 0) {
      await supabase.from("rec_bags").update({ status: "finished", finished_at: new Date().toISOString() }).eq("id", bag.id);
      notify(bag.sender_id, "bag_returned", { bag_id: bag.id });
      if (o === "shelved") { setPendingFinish(true); return; }
      toast("Bag finished. The sender gets the verdicts.");
      onDone();
    }
  }

  const cur = current?.media_items;
  const ITW = cur?.media_type === "music" ? 150 : 120;
  const ITH = cur?.media_type === "music" ? 150 : 165;
  const ITD = cur?.media_type === "music" ? 10 : 26;
  const spineBg = "linear-gradient(180deg, rgba(255,255,255,.12), rgba(0,0,0,.32)), #3a3340";

  return (
    <Modal open onClose={onClose} width={540}>
      <h3>🛍 From @{bag.sender?.username ?? "someone"}</h3>
      <p className="sub">{inspecting ? "Drag to turn it over, then decide." : `Drag to rotate the bag · ${remaining.length} item${remaining.length === 1 ? "" : "s"} inside`}</p>
      <div className="bag-stage"
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; setGrabbed(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = (e.clientX - drag.current.x) * 0.45, dy = (e.clientY - drag.current.y) * 0.45;
          drag.current = { x: e.clientX, y: e.clientY };
          if (inspecting) setItemRot((r) => ({ x: Math.max(-80, Math.min(80, r.x - dy)), y: r.y + dx }));
          else setRot((r) => ({ x: Math.max(-80, Math.min(80, r.x - dy)), y: r.y + dx }));
        }}
        onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>

        {/* the bag — sets itself down while you inspect */}
        <div className={"bag3d" + (!grabbed && !inspecting ? " idle" : "")}
          style={{
            transform: inspecting
              ? "translateY(115px) rotateX(-4deg) scale(.82)"
              : (grabbed ? `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` : undefined),
            opacity: inspecting ? 0.15 : 1,
            transition: "transform .7s var(--spring), opacity .5s",
          }}>
          <BagFace w={W} h={H} tf={`translateZ(${D / 2}px)`} style={{ borderRadius: 6 }}>
            <div className="bag-note">{bag.note ? `“${bag.note}”` : "no skips in here — promise"}</div>
          </BagFace>
          <BagFace w={W} h={H} tf={`rotateY(180deg) translateZ(${D / 2}px)`} style={{ borderRadius: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".22em", color: "#5e3c20", border: "2px solid rgba(94,60,32,.5)", padding: "6px 10px", transform: "rotate(2deg)" }}>CURIO RECS</span>
          </BagFace>
          <BagFace w={D} h={H} tf={`rotateY(-90deg) translateZ(${W / 2}px)`} />
          <BagFace w={D} h={H} tf={`rotateY(90deg) translateZ(${W / 2}px)`} />
          <BagFace w={W} h={D} tf={`rotateX(-90deg) translateZ(${H / 2}px)`} />
        </div>

        {/* the pulled item — its own 3D box */}
        {inspecting && cur && (
          <div className="bag-item3d">
            <div className="ibx" style={{ position: "relative", transformStyle: "preserve-3d", transform: `rotateX(${itemRot.x}deg) rotateY(${itemRot.y}deg)` }}>
              <BagFace w={ITW} h={ITH} tf={`translateZ(${ITD / 2}px)`} style={{ borderRadius: 4, background: "none", boxShadow: "none" }}>
                <Cover url={cur.cover_url} title={cur.title}
                  sub={`${MEDIA_LABELS[cur.media_type as MediaType]}${cur.year ? " · " + cur.year : ""}`}
                  style={{ width: "100%", height: "100%", borderRadius: 4 }} />
              </BagFace>
              <BagFace w={ITW} h={ITH} tf={`rotateY(180deg) translateZ(${ITD / 2}px)`} style={{ borderRadius: 4, background: spineBg }}>
                <div style={{ padding: 12, color: "rgba(255,255,255,.65)", fontFamily: "var(--font-mono)", fontSize: 8.5, lineHeight: 1.9 }}>
                  picked by @{bag.sender?.username}<br />reason: “trust me”<br /><br />
                  <span style={{ border: "1px solid rgba(255,255,255,.3)", padding: "2px 7px", borderRadius: 3 }}>CURIO™ GIFT COPY</span>
                </div>
              </BagFace>
              <BagFace w={ITD} h={ITH} tf={`rotateY(-90deg) translateZ(${ITW / 2}px)`} style={{ background: spineBg }} />
              <BagFace w={ITD} h={ITH} tf={`rotateY(90deg) translateZ(${ITW / 2}px)`} style={{ background: spineBg }} />
              <BagFace w={ITW} h={ITD} tf={`rotateX(90deg) translateZ(${ITH / 2}px)`} style={{ background: spineBg }} />
              <BagFace w={ITW} h={ITD} tf={`rotateX(-90deg) translateZ(${ITH / 2}px)`} style={{ background: spineBg }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 6 }}>
        {!inspecting ? (
          remaining.length > 0
            ? <button className="btn primary" onClick={pull}>Pull one out ({remaining.length} left)</button>
            : <button className="btn" onClick={onClose}>It's empty — set the bag down</button>
        ) : (
          <>
            <button className="btn small primary" onClick={() => outcome("shelved")}>Shelve it</button>
            <button className="btn small" onClick={() => outcome("watch_later")}>→ Watch later</button>
            <button className="btn small" onClick={() => outcome("skipped")}>Skip (they'll know)</button>
          </>
        )}
      </div>
      {picking && <ShelfPicker mediaId={picking.media_item_id} mediaType={picking.media_items.media_type}
        onClose={() => { setPicking(null); if (pendingFinish) { toast("Bag finished. The sender gets the verdicts."); onDone(); } }} />}
    </Modal>
  );
}

/* ============ send a blind-date wrap ============ */
export function SendWrapModal({ recipient, onClose }: { recipient: { id: string; username: string }; onClose: () => void }) {
  const { session, toast } = useApp();
  const [picked, setPicked] = useState<MetadataResult | null>(null);
  const [tags, setTags] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!session?.user || !picked) return;
    if (tags.some((t) => !t.trim())) return toast("All three tags, please — that's the deal.");
    setBusy(true);
    try {
      const mid = await saveMediaItem(picked);
      const { error } = await supabase.from("blind_wraps").insert({
        sender_id: session.user.id, recipient_id: recipient.id, media_item_id: mid,
        tags: tags.map((t) => t.trim().toLowerCase()),
      });
      if (error) throw error;
      notify(recipient.id, "wrap_received", {});
      toast(`Wrapped and sent to @${recipient.username}. Three tags, no title.`);
      onClose();
    } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} width={520}>
      <h3>🎀 Blind date for @{recipient.username}</h3>
      <p className="sub">They see three tags and brown paper. The title stays secret until they rip it open.</p>
      {!picked ? <ItemSearch onPick={setPicked} /> : (
        <>
          <div className="chip" style={{ marginBottom: 12 }}>{picked.title} <button onClick={() => setPicked(null)} style={{ marginLeft: 4 }}>✕</button></div>
          <div className="field"><label>Three tags — honest but cryptic</label>
            {tags.map((t, i) => (
              <input key={i} className="input" style={{ marginBottom: 6 }} maxLength={24} value={t}
                placeholder={["e.g. melancholy", "e.g. one location", "e.g. trust me"][i]}
                onChange={(e) => setTags(tags.map((x, j) => (j === i ? e.target.value : x)))} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={busy} onClick={send}>Wrap it</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ============ rip open a received wrap ============ */
export function OpenWrapModal({ wrap, onClose, onDone }: { wrap: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [torn, setTorn] = useState<boolean[]>([false, false, false, false, false, false]);
  const [ripping, setRipping] = useState(false);
  const [picking, setPicking] = useState(false);
  const jags = useRef<string[]>([]);
  if (jags.current.length === 0) {
    for (let s = 0; s < 6; s++) {
      const jag = (base: number) => Array.from({ length: 9 }, (_, k) => [base + (Math.random() * 16 - 8), (k * 100) / 8]);
      const L = jag(8), R = jag(92);
      jags.current.push("polygon(" + L.map((p) => p[0].toFixed(1) + "% " + p[1].toFixed(1) + "%")
        .concat(R.reverse().map((p) => p[0].toFixed(1) + "% " + p[1].toFixed(1) + "%")).join(",") + ")");
    }
  }
  const allTorn = torn.every(Boolean);

  useEffect(() => {
    if (allTorn && wrap.status !== "ripped") {
      supabase.from("blind_wraps").update({ status: "ripped", ripped_at: new Date().toISOString() }).eq("id", wrap.id).then(() => {});
      notify(wrap.sender_id, "wrap_received", { ripped: true });
    }
  }, [allTorn]);

  function tearAt(clientX: number, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const idx = Math.max(0, Math.min(5, Math.floor(((clientX - r.left) / r.width) * 6)));
    if (!torn[idx]) setTorn(torn.map((t, i) => (i === idx ? true : t)));
  }

  return (
    <Modal open onClose={onClose} width={460}>
      <h3>🎀 From @{wrap.sender?.username ?? "someone"}</h3>
      <p className="sub">Their three words: {(wrap.tags ?? []).map((t: string) => <span key={t} className="chip" style={{ marginRight: 5 }}>{t}</span>)}</p>
      <div className="wrap-stage"
        onPointerDown={(e) => { setRipping(true); tearAt(e.clientX, e.currentTarget); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => ripping && tearAt(e.clientX, e.currentTarget)}
        onPointerUp={() => setRipping(false)} onPointerCancel={() => setRipping(false)}>
        <Cover url={wrap.media_items?.cover_url} title={allTorn ? wrap.media_items?.title : "?"}
          sub={allTorn ? `${wrap.media_items?.year ?? ""}` : undefined}
          style={{ width: "100%", height: "100%", borderRadius: 12 }} />
        {!allTorn && torn.map((t, i) => !t && (
          <div key={i} className="rip-strip2" style={{ left: (i * 16.2 - 1.5) + "%", clipPath: jags.current[i], ["--tr" as any]: ((i * 7919) % 5 - 2.5) + "deg" }} />
        ))}
        {torn.map((t, i) => t && !allTorn && (
          <div key={"t" + i} className="rip-strip2 torn2" style={{ left: (i * 16.2 - 1.5) + "%", clipPath: jags.current[i] }} />
        ))}
        {!allTorn && <span className="wrap-hint mono">drag across to rip the paper</span>}
      </div>
      {allTorn && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <b style={{ fontFamily: "var(--font-display)", fontSize: 19 }}>{wrap.media_items?.title}</b>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn small primary" onClick={async () => {
              await supabase.from("blind_wraps").update({ status: "accepted" }).eq("id", wrap.id);
              setPicking(true);
            }}>Accept — shelve it</button>
            <button className="btn small" onClick={async () => {
              await supabase.from("blind_wraps").update({ status: "declined" }).eq("id", wrap.id);
              toast("Declined. Some dates don't work out.");
              onDone();
            }}>Not for me</button>
          </div>
        </div>
      )}
      {picking && <ShelfPicker mediaId={wrap.media_item_id} mediaType={wrap.media_items?.media_type} onClose={() => { setPicking(false); onDone(); }} />}
    </Modal>
  );
}
