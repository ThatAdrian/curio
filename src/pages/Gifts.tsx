import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Spinner, Empty } from "../components/ui";
import { OpenBagModal, OpenWrapModal } from "../components/Gifts";

export default function Gifts() {
  const { session } = useApp();
  const [bagsIn, setBagsIn] = useState<any[] | null>(null);
  const [bagsOut, setBagsOut] = useState<any[]>([]);
  const [wrapsIn, setWrapsIn] = useState<any[]>([]);
  const [wrapsOut, setWrapsOut] = useState<any[]>([]);
  const [openBag, setOpenBag] = useState<any | null>(null);
  const [openWrap, setOpenWrap] = useState<any | null>(null);

  async function load() {
    if (!session?.user) { setBagsIn([]); return; }
    const me = session.user.id;
    const [bi, bo, wi, wo] = await Promise.all([
      supabase.from("rec_bags").select("*, sender:profiles!rec_bags_sender_id_fkey(username), bag_items(outcome)").eq("recipient_id", me).order("created_at", { ascending: false }),
      supabase.from("rec_bags").select("*, recipient:profiles!rec_bags_recipient_id_fkey(username), bag_items(outcome)").eq("sender_id", me).order("created_at", { ascending: false }),
      supabase.from("blind_wraps").select("*, sender:profiles!blind_wraps_sender_id_fkey(username), media_items(*)").eq("recipient_id", me).order("created_at", { ascending: false }),
      supabase.from("blind_wraps").select("*, recipient:profiles!blind_wraps_recipient_id_fkey(username), media_items(title)").eq("sender_id", me).order("created_at", { ascending: false }),
    ]);
    setBagsIn((bi.data as any[]) ?? []); setBagsOut((bo.data as any[]) ?? []);
    setWrapsIn((wi.data as any[]) ?? []); setWrapsOut((wo.data as any[]) ?? []);
  }
  useEffect(() => { load(); }, [session?.user?.id]);

  if (!session) return <main className="app"><Empty><Link to="/auth">Sign in</Link> to give and receive.</Empty></main>;
  if (bagsIn === null) return <main className="app"><Spinner /></main>;

  const outcomeSummary = (b: any) => {
    const os = (b.bag_items ?? []).map((i: any) => i.outcome).filter(Boolean);
    if (!os.length) return b.status;
    const s = os.filter((o: string) => o === "shelved").length, w = os.filter((o: string) => o === "watch_later").length, k = os.filter((o: string) => o === "skipped").length;
    return [s && `${s} shelved`, w && `${w} for later`, k && `${k} skipped`].filter(Boolean).join(" · ");
  };

  return (
    <main className="app">
      <div className="view-head">
        <h1>Gifts</h1>
        <p>Bags of recommendations and blind dates in brown paper. Send them from anyone's profile.</p>
      </div>
      <div className="grid2">
        <div>
          <div className="section-label">For you</div>
          {bagsIn.length === 0 && wrapsIn.length === 0 && <Empty>Nothing yet. Make a friend, get a bag.</Empty>}
          {bagsIn.map((b) => (
            <div key={b.id} className="card pad" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 26 }}>🛍</span>
              <span style={{ flex: 1 }}>
                <b style={{ fontSize: 14 }}>A bag from <Link to={`/u/${b.sender?.username}`}>@{b.sender?.username}</Link></b>
                <span className="mono faint" style={{ display: "block", fontSize: 10 }}>{b.status === "finished" ? outcomeSummary(b) : `${(b.bag_items ?? []).length} items · ${b.status}`}</span>
              </span>
              {b.status !== "finished" && <button className="btn small primary" onClick={() => setOpenBag(b)}>Open</button>}
            </div>
          ))}
          {wrapsIn.map((w) => (
            <div key={w.id} className="card pad" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 26 }}>🎀</span>
              <span style={{ flex: 1 }}>
                <b style={{ fontSize: 14 }}>Blind date from <Link to={`/u/${w.sender?.username}`}>@{w.sender?.username}</Link></b>
                <span className="mono faint" style={{ display: "block", fontSize: 10 }}>
                  {w.status === "pending" ? (w.tags ?? []).join(" · ") : w.status === "declined" ? "declined" : `${w.media_items?.title} · ${w.status}`}
                </span>
              </span>
              {w.status === "pending" && <button className="btn small primary" onClick={() => setOpenWrap(w)}>Rip it open</button>}
            </div>
          ))}
        </div>
        <div>
          <div className="section-label">Sent</div>
          {bagsOut.length === 0 && wrapsOut.length === 0 && <Empty>You haven't pressed anything into anyone's hands yet.</Empty>}
          {bagsOut.map((b) => (
            <div key={b.id} className="card pad" style={{ marginBottom: 12 }}>
              <b style={{ fontSize: 14 }}>🛍 To <Link to={`/u/${b.recipient?.username}`}>@{b.recipient?.username}</Link></b>
              <span className="mono faint" style={{ display: "block", fontSize: 10, marginTop: 4 }}>{b.status === "finished" ? `verdict: ${outcomeSummary(b)}` : b.status}</span>
            </div>
          ))}
          {wrapsOut.map((w) => (
            <div key={w.id} className="card pad" style={{ marginBottom: 12 }}>
              <b style={{ fontSize: 14 }}>🎀 To <Link to={`/u/${w.recipient?.username}`}>@{w.recipient?.username}</Link></b>
              <span className="mono faint" style={{ display: "block", fontSize: 10, marginTop: 4 }}>{w.media_items?.title} · {w.status}</span>
            </div>
          ))}
        </div>
      </div>
      {openBag && <OpenBagModal bag={openBag} onClose={() => { setOpenBag(null); load(); }} onDone={() => { setOpenBag(null); load(); }} />}
      {openWrap && <OpenWrapModal wrap={openWrap} onClose={() => { setOpenWrap(null); load(); }} onDone={() => { setOpenWrap(null); load(); }} />}
    </main>
  );
}
