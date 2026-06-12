import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Cover, Spinner, Empty } from "../components/ui";
import { ReceiptCard } from "../components/Receipt";

export default function Activity() {
  const { session } = useApp();
  const [feed, setFeed] = useState<any[] | null>(null);
  const [diary, setDiary] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      if (!session?.user) { setFeed([]); return; }
      const { data: fl } = await supabase.from("follows").select("followee_id").eq("follower_id", session.user.id);
      const ids = [session.user.id, ...((fl as any[]) ?? []).map((f) => f.followee_id)];
      const { data: rv } = await supabase.from("reviews")
        .select("*, author:profiles!reviews_user_id_fkey(username, display_name), media_items(id,title,media_type,cover_url,year)")
        .in("user_id", ids).eq("status", "published").order("published_at", { ascending: false }).limit(25);
      setFeed((rv as any[]) ?? []);
      const { data: de } = await supabase.from("diary_entries")
        .select("*, media_items(id,title,media_type)")
        .eq("user_id", session.user.id).order("consumed_on", { ascending: false }).limit(14);
      setDiary((de as any[]) ?? []);
    })();
  }, [session?.user?.id]);

  if (session === undefined || feed === null) return <main className="app"><Spinner /></main>;
  if (!session) return <main className="app"><Empty><Link to="/auth">Sign in</Link> to see what your people are shelving.</Empty></main>;

  // group diary by date
  const byDay: Record<string, any[]> = {};
  diary.forEach((d) => (byDay[d.consumed_on] ??= []).push(d));
  const days = Object.keys(byDay).sort().reverse();

  return (
    <main className="app">
      <div className="view-head">
        <h1>Activity</h1>
        <p>Reviews from people you follow, and your own diary. Chronological. No algorithm, ever.</p>
      </div>
      <div className="grid2">
        <div>
          <div className="section-label">The feed</div>
          {feed.length === 0 && (
            <Empty>Quiet in here. <Link to="/discover">Follow some shelvers</Link> or publish a review — someone has to go first.</Empty>
          )}
          {feed.map((rv) => (
            <div key={rv.id} className="card pad" style={{ marginBottom: 12 }}>
              <div className="rev-head">
                <span className="mini-ava">{(rv.author?.username ?? "?")[0]?.toUpperCase()}</span>
                <Link className="who" to={`/u/${rv.author?.username}`} style={{ color: "var(--text)" }}>@{rv.author?.username}</Link>
                <span className="faint" style={{ fontSize: 12 }}>reviewed</span>
                <Link to={`/m/${rv.media_items?.id}`} style={{ fontWeight: 700, fontSize: 13.5 }}>{rv.media_items?.title}</Link>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <Link to={`/m/${rv.media_items?.id}`} style={{ flex: "none" }}>
                  <Cover url={rv.media_items?.cover_url} title={rv.media_items?.title ?? "?"} style={{ width: 44, height: 60, padding: 4 }} />
                </Link>
                <p className={"rev-body" + (rv.contains_spoilers ? " spoiler" : "")} style={{ fontSize: 13, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                  title={rv.contains_spoilers ? "spoilers — open the page to reveal" : undefined}>
                  {rv.body_md}
                </p>
              </div>
              <span className="mono faint" style={{ fontSize: 9.5, display: "block", marginTop: 8 }}>{new Date(rv.published_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="section-label">Your diary</div>
          <ReceiptCard />
          <div style={{ height: 12 }} />
          {days.length === 0 && <Empty>Log sessions from any media page or shelf — they stack up here, day by day.</Empty>}
          {days.map((day) => (
            <div key={day} className="card pad" style={{ marginBottom: 12 }}>
              <div className="mono faint" style={{ fontSize: 10, letterSpacing: ".14em", marginBottom: 8 }}>
                {new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              </div>
              {byDay[day].map((d) => (
                <Link key={d.id} to={`/m/${d.media_items?.id}`} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0", color: "var(--text)", fontSize: 13.5 }}>
                  <span style={{ color: `var(--${d.media_items?.media_type})` }}>●</span>
                  <b>{d.media_items?.title}</b>
                  {d.is_rewatch && <span className="chip">again</span>}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
