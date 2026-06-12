import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase, notify, MEDIA_LABELS, MediaType } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Cover, Stars, Modal, Spinner, Empty } from "../components/ui";
import { addToWatchLater } from "../lib/extras";
import { ReportButton } from "../components/Report";

export default function MediaPage() {
  const { id } = useParams();
  const { session, profile, toast } = useApp();
  const [media, setMedia] = useState<any | null | undefined>(undefined);
  const [stats, setStats] = useState<any>(null);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [draft, setDraft] = useState<any>(null);
  const [body, setBody] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [openCmts, setOpenCmts] = useState<Set<string>>(new Set());
  const [cmts, setCmts] = useState<Record<string, any[]>>({});
  const [cmtDraft, setCmtDraft] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState(false);
  const [variants, setVariants] = useState<any[]>([]);
  const [myItems, setMyItems] = useState<any[]>([]);
  const [contributing, setContributing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!id) return;
    const { data: m } = await supabase.from("media_items").select("*").eq("id", id).maybeSingle();
    setMedia(m ?? null);
    if (!m) return;
    const { data: st } = await supabase.from("media_stats").select("*").eq("media_item_id", id).maybeSingle();
    setStats(st);
    const { data: rv } = await supabase.from("reviews")
      .select("*, author:profiles!reviews_user_id_fkey(username, display_name), review_likes(user_id), review_comments(count)")
      .eq("media_item_id", id).eq("status", "published").order("published_at", { ascending: false }).limit(30);
    setReviews((rv as any[]) ?? []);
    if (session?.user) {
      const { data: r } = await supabase.from("ratings").select("rating")
        .eq("user_id", session.user.id).eq("media_item_id", id).maybeSingle();
      setMyRating(r ? Number(r.rating) : null);
      const { data: d } = await supabase.from("reviews").select("*")
        .eq("user_id", session.user.id).eq("media_item_id", id).eq("status", "draft").maybeSingle();
      setDraft(d ?? null);
      if (d) { setBody(d.body_md); setSpoiler(d.contains_spoilers); }
      const { data: sh } = await supabase.from("shelves").select("id").eq("owner_id", session.user.id);
      const sids = ((sh as any[]) ?? []).map((x) => x.id);
      if (sids.length) {
        const { data: mi } = await supabase.from("shelf_items").select("id, completion, variant_id, shelf_id")
          .eq("media_item_id", id).in("shelf_id", sids);
        setMyItems((mi as any[]) ?? []);
      }
    }
    const { data: vs } = await supabase.from("media_variants").select("*, contributor:profiles!media_variants_contributed_by_fkey(username)").eq("media_item_id", id);
    setVariants((vs as any[]) ?? []);
  }
  useEffect(() => { load(); }, [id, session?.user?.id]);

  if (media === undefined) return <main className="app"><Spinner /></main>;
  if (media === null) return <main className="app"><Empty>This title isn't in the archive yet — find it via <Link to="/discover">Discover</Link>.</Empty></main>;

  const avg = stats && stats.rating_count > 0 ? (Number(stats.rating_sum) / stats.rating_count) : null;
  const histo: number[] = stats?.histogram ?? Array(10).fill(0);
  const maxH = Math.max(1, ...histo);
  const creators = (media.creators ?? []).map((c: any) => c.name).join(" · ");
  const meta = media.metadata ?? {};

  async function rate(v: number) {
    if (!session?.user) return toast("Sign in to rate.");
    setMyRating(v);
    const { error } = await supabase.from("ratings")
      .upsert({ user_id: session.user.id, media_item_id: id, rating: v }, { onConflict: "user_id,media_item_id" });
    if (error) toast(error.message);
    else { toast(`${v}★ — noted in the margins.`); setTimeout(load, 350); }
  }

  async function saveReview(publish: boolean) {
    if (!session?.user || !body.trim()) return;
    setBusy(true);
    const row: any = {
      user_id: session.user.id, media_item_id: id, body_md: body.trim(),
      contains_spoilers: spoiler, status: publish ? "published" : "draft",
      ...(publish ? { published_at: new Date().toISOString() } : {}),
    };
    const q = draft
      ? supabase.from("reviews").update(row).eq("id", draft.id)
      : supabase.from("reviews").insert(row);
    const { error } = await q;
    setBusy(false);
    if (error) return toast(error.message);
    if (publish) { setBody(""); setSpoiler(false); setDraft(null); toast("Review published. Be brave, be fair."); }
    else toast("Draft saved — it'll wait.");
    load();
  }

  async function toggleLike(rv: any) {
    if (!session?.user) return toast("Sign in to like reviews.");
    const mine = rv.review_likes?.some((l: any) => l.user_id === session.user.id);
    if (mine) await supabase.from("review_likes").delete().eq("review_id", rv.id).eq("user_id", session.user.id);
    else {
      await supabase.from("review_likes").insert({ review_id: rv.id, user_id: session.user.id });
      notify(rv.user_id, "review_like", { review_id: rv.id, media_title: media.title });
    }
    load();
  }

  async function toggleCmts(rvId: string) {
    const next = new Set(openCmts);
    if (next.has(rvId)) { next.delete(rvId); setOpenCmts(next); return; }
    next.add(rvId); setOpenCmts(next);
    const { data } = await supabase.from("review_comments")
      .select("*, author:profiles!review_comments_user_id_fkey(username)")
      .eq("review_id", rvId).order("created_at");
    setCmts({ ...cmts, [rvId]: (data as any[]) ?? [] });
  }
  async function postCmt(rv: any) {
    const body = (cmtDraft[rv.id] ?? "").trim();
    if (!body || !session?.user) return;
    const { error } = await supabase.from("review_comments").insert({ review_id: rv.id, user_id: session.user.id, body_md: body });
    if (error) return toast(error.message);
    notify(rv.user_id, "review_comment", { review_id: rv.id, media_title: media.title });
    setCmtDraft({ ...cmtDraft, [rv.id]: "" });
    setReviews(reviews.map((r) => r.id === rv.id
      ? { ...r, review_comments: [{ count: (r.review_comments?.[0]?.count ?? 0) + 1 }] } : r));
    const { data } = await supabase.from("review_comments")
      .select("*, author:profiles!review_comments_user_id_fkey(username)")
      .eq("review_id", rv.id).order("created_at");
    setCmts({ ...cmts, [rv.id]: (data as any[]) ?? [] });
  }

  async function logDiary() {
    if (!session?.user) return toast("Sign in first.");
    await supabase.from("diary_entries").insert({ user_id: session.user.id, media_item_id: id });
    toast(`Logged to today's diary — ${media.title}.`);
  }

  return (
    <main className="app">
      <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap", marginTop: 16 }}>
        <Cover url={media.cover_url} title={media.title}
          style={{ width: 180, aspectRatio: media.media_type === "music" ? "1" : "2/3", flex: "none" }} />
        <div style={{ flex: 1, minWidth: 260 }}>
          <span className="chip" style={{ color: `var(--${media.media_type})`, borderColor: `color-mix(in srgb, var(--${media.media_type}) 40%, transparent)` }}>
            {MEDIA_LABELS[media.media_type as MediaType].toUpperCase()}{media.year ? ` · ${media.year}` : ""} · {String(media.external_source).toUpperCase()}
          </span>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(26px,4.5vw,38px)", margin: "8px 0 2px" }}>{media.title}</h1>
          {creators && <p className="muted" style={{ fontSize: 14 }}>{creators}</p>}
          {media.description && <p className="muted" style={{ fontSize: 13.5, marginTop: 10, maxWidth: "62ch", lineHeight: 1.65 }}>{media.description}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            {meta.page_count && <span className="chip">{meta.page_count} pages</span>}
            {meta.platforms?.length > 0 && <span className="chip">{meta.platforms.slice(0, 4).join(" · ")}</span>}
            {meta.primary_type && <span className="chip">{meta.primary_type}</span>}
          </div>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 16 }}>
            {profile && <button className="btn primary" onClick={() => setPicking(true)}>+ Shelve it</button>}
            {profile && <button className="btn" onClick={logDiary}>📔 Log to diary</button>}
            {profile && <button className="btn" onClick={async () => { try { toast(await addToWatchLater(id!)); } catch (e: any) { toast(e.message); } }}>🕐 Watch later</button>}
            {media.media_type === "book" && (
              <a className="btn" target="_blank" rel="noreferrer" href={`https://openlibrary.org/works/${media.external_id}`}>📖 Read online</a>
            )}
            {media.media_type === "music" && (
              <a className="btn" target="_blank" rel="noreferrer"
                href={`https://music.youtube.com/search?q=${encodeURIComponent(((media.creators?.[0]?.name ?? "") + " " + media.title).trim())}`}>🎧 Listen</a>
            )}
            {(media.media_type === "film" || media.media_type === "tv") && (
              <a className="btn" target="_blank" rel="noreferrer"
                href={`https://www.themoviedb.org/${media.media_type === "film" ? "movie" : "tv"}/${media.external_id}`}>ℹ TMDB</a>
            )}
            {media.media_type === "game" && (
              <>
                <a className="btn" target="_blank" rel="noreferrer"
                  href={`https://www.xbox.com/en-GB/play/search?q=${encodeURIComponent(media.title)}`}>☁ Xbox Cloud</a>
                <a className="btn" target="_blank" rel="noreferrer" href="https://play.geforcenow.com">☁ GeForce NOW</a>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 28 }}>
        <div className="card pad">
          <div className="section-label">Your rating</div>
          {profile ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Stars value={myRating} onChange={rate} size={28} />
              <span className="mono faint" style={{ fontSize: 11 }}>{myRating ? myRating + "★" : "unrated"}</span>
            </div>
          ) : <p className="faint" style={{ fontSize: 13 }}><Link to="/auth">Sign in</Link> to rate in half-stars.</p>}
        </div>
        <div className="card pad">
          <div className="section-label">
            Everyone — {stats?.rating_count ?? 0} rating{(stats?.rating_count ?? 0) === 1 ? "" : "s"}{avg ? ` · ${avg.toFixed(1)}★ average` : ""}
          </div>
          <div className="histo" style={{ marginBottom: 18 }}>
            {histo.map((n, i) => (
              <div key={i} className="bar" style={{ height: (n / maxH) * 100 + "%" }} title={`${(i + 1) / 2}★ — ${n}`}>
                {(i === 0 || i === 9) && <i>{(i + 1) / 2}★</i>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {profile && (
        <div className="card pad" style={{ marginTop: 16 }}>
          <div className="section-label">{draft ? "Your draft — unpublished" : "Write a review"}</div>
          <textarea className="textarea" value={body} placeholder="What did it do to you? Markdown welcome."
            onChange={(e) => setBody(e.target.value)} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button className={"switch" + (spoiler ? " on" : "")} role="switch" aria-checked={spoiler} onClick={() => setSpoiler(!spoiler)} />
            <span style={{ fontSize: 13 }}>contains spoilers</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="btn small" disabled={busy || !body.trim()} onClick={() => saveReview(false)}>Save draft</button>
              <button className="btn small primary" disabled={busy || !body.trim()} onClick={() => saveReview(true)}>Publish</button>
            </span>
          </div>
        </div>
      )}

      {profile && myItems.length > 0 && (
        <div className="card pad" style={{ marginTop: 16 }}>
          <div className="section-label">Variant covers {myItems.some((m) => m.completion >= 100) ? "— unlocked at 100%" : "— locked"}</div>
          {!myItems.some((m) => m.completion >= 100) ? (
            <p className="faint" style={{ fontSize: 13 }}>Finish it (100% completion on your shelf) to hunt alternate covers — regional pressings, first editions, the lot.</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button className="cover" style={{ width: 84, aspectRatio: "2/3", border: !myItems[0].variant_id ? "2px solid var(--accent)" : "2px solid transparent" }}
                  onClick={async () => { await supabase.from("shelf_items").update({ variant_id: null }).eq("id", myItems[0].id); toast("Standard cover restored."); load(); }}>
                  <span className="t">standard</span>
                </button>
                {variants.map((v) => (
                  <button key={v.id} style={{ width: 84, textAlign: "center" }}
                    onClick={async () => { await supabase.from("shelf_items").update({ variant_id: v.id }).eq("id", myItems[0].id); toast(`Swapped to ${v.name} — your spine wears it now.`); load(); }}>
                    <Cover url={v.cover_url} title={v.name} style={{ aspectRatio: "2/3", border: myItems[0].variant_id === v.id ? "2px solid var(--accent)" : "2px solid transparent" }} />
                    <span className="mono faint" style={{ fontSize: 8.5 }}>{v.region ?? v.kind ?? ""}</span>
                  </button>
                ))}
              </div>
              <button className="btn small" style={{ marginTop: 12 }} onClick={() => setContributing(true)}>+ Contribute a variant</button>
            </>
          )}
        </div>
      )}

      <div className="card pad" style={{ marginTop: 16 }}>
        <div className="section-label">Reviews</div>
        {reviews.length === 0 && <p className="faint" style={{ fontSize: 13 }}>No reviews yet. First word is yours.</p>}
        {reviews.map((rv) => {
          const liked = rv.review_likes?.some((l: any) => l.user_id === session?.user?.id);
          const hidden = rv.contains_spoilers && !revealed.has(rv.id);
          return (
            <div key={rv.id} className="review">
              <div className="rev-head">
                <span className="mini-ava">{(rv.author?.username ?? "?")[0]?.toUpperCase()}</span>
                <Link className="who" to={`/u/${rv.author?.username}`} style={{ color: "var(--text)" }}>
                  {rv.author?.display_name ?? rv.author?.username}
                </Link>
                <span className="mono faint" style={{ fontSize: 10 }}>
                  {new Date(rv.published_at).toLocaleDateString()}
                  {rv.contains_spoilers ? " · ⚠ spoilers" : ""}
                </span>
              </div>
              <div className={"rev-body" + (hidden ? " spoiler" : "")}
                onClick={() => hidden && setRevealed(new Set([...revealed, rv.id]))}
                title={hidden ? "click to reveal" : undefined}>
                {rv.body_md}
              </div>
              <div className="rev-foot">
                <button className={"react" + (liked ? " on" : "")} onClick={() => toggleLike(rv)}>
                  ♥ {(rv.review_likes ?? []).length}
                </button>
                <button className="react" onClick={() => toggleCmts(rv.id)}>
                  💬 {rv.review_comments?.[0]?.count ?? 0}
                </button>
                <ReportButton targetKind="review" targetId={rv.id} small />
              </div>
              {openCmts.has(rv.id) && (
                <div style={{ marginTop: 10 }}>
                  {(cmts[rv.id] ?? []).map((c) => (
                    <div key={c.id} className="cmt">
                      <span className="body">
                        <Link to={`/u/${c.author?.username}`} style={{ color: "var(--text)" }}><b>@{c.author?.username}</b></Link>
                        {c.body_md} <time>{new Date(c.created_at).toLocaleDateString()}</time>
                      </span>
                      {c.user_id === session?.user?.id && (
                        <button className="icon-btn" style={{ width: 22, height: 22, fontSize: 10 }}
                          onClick={async () => {
                            await supabase.from("review_comments").delete().eq("id", c.id);
                            setCmts({ ...cmts, [rv.id]: cmts[rv.id].filter((x) => x.id !== c.id) });
                            setReviews(reviews.map((r) => r.id === rv.id
                              ? { ...r, review_comments: [{ count: Math.max(0, (r.review_comments?.[0]?.count ?? 1) - 1) }] } : r));
                          }}>✕</button>
                      )}
                    </div>
                  ))}
                  {profile && (
                    <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                      <input className="input" style={{ borderRadius: 999, padding: "8px 14px", fontSize: 13 }}
                        value={cmtDraft[rv.id] ?? ""} placeholder="Reply…"
                        onChange={(e) => setCmtDraft({ ...cmtDraft, [rv.id]: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && postCmt(rv)} />
                      <button className="btn small" onClick={() => postCmt(rv)}>Reply</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {picking && <ShelfPicker mediaId={id!} mediaType={media.media_type} onClose={() => setPicking(false)} />}
      {contributing && (
        <VariantForm mediaId={id!} onClose={() => setContributing(false)} onAdded={load} />
      )}
    </main>
  );
}

export function ShelfPicker({ mediaId, mediaType, onClose }: { mediaId: string; mediaType: MediaType; onClose: () => void }) {
  const { session, toast } = useApp();
  const [shelves, setShelves] = useState<any[]>([]);
  useEffect(() => {
    if (!session?.user) return;
    supabase.from("shelves").select("id,name,media_type,kind").eq("owner_id", session.user.id).neq("kind", "smart")
      .order("position").then(({ data }) => {
        setShelves(((data as any[]) ?? []).filter((s) => !s.media_type || s.media_type === mediaType));
      });
  }, [session?.user?.id]);

  async function put(shelfId: string, name: string) {
    const PRICES = ["£3.50", "99p", "2 FOR £5", "£1 BIN", "50p SALE", "£7.99", "CLEARANCE"];
    const sticker = Math.random() < 0.4 ? { label: PRICES[Math.floor(Math.random() * PRICES.length)] } : null;
    const { error } = await supabase.from("shelf_items").insert({ shelf_id: shelfId, media_item_id: mediaId, price_sticker: sticker });
    if (error) toast(error.code === "23505" ? "Already on that shelf." : error.message);
    else toast(`Shelved on ${name}.`);
    onClose();
  }
  return (
    <Modal open onClose={onClose}>
      <h3>Which shelf?</h3>
      <p className="sub">Only shelves that take this media type are shown.</p>
      {shelves.map((s) => (
        <button key={s.id} className="btn" style={{ display: "flex", width: "100%", marginBottom: 8, justifyContent: "space-between" }}
          onClick={() => put(s.id, s.name)}>
          <span>{s.name}</span><span className="mono faint" style={{ fontSize: 10 }}>{s.media_type ?? "mixed"}</span>
        </button>
      ))}
      {shelves.length === 0 && <p className="faint" style={{ fontSize: 13 }}>No matching shelves — make one on the Shelf page.</p>}
    </Modal>
  );
}


function VariantForm({ mediaId, onClose, onAdded }: { mediaId: string; onClose: () => void; onAdded: () => void }) {
  const { session, toast } = useApp();
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [url, setUrl] = useState("");
  async function add() {
    if (!session?.user || !name.trim() || !url.trim()) return toast("Name and cover URL needed.");
    const { error } = await supabase.from("media_variants").insert({
      media_item_id: mediaId, name: name.trim(), region: region.trim() || null,
      kind: "community", cover_url: url.trim(), contributed_by: session.user.id,
    });
    if (error) toast(error.message);
    else { toast("Variant contributed — fellow completionists thank you."); onAdded(); onClose(); }
  }
  return (
    <Modal open onClose={onClose}>
      <h3>Contribute a variant</h3>
      <p className="sub">An alternate cover — regional pressing, first edition, collector's box. Direct image URL for now; uploads come later.</p>
      <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PAL big-box" /></div>
      <div className="field"><label>Region (optional)</label><input className="input" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="PAL / NTSC-J / UK first ed." /></div>
      <div className="field"><label>Cover image URL</label><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={add}>Add it</button>
      </div>
    </Modal>
  );
}
