import { useState } from "react";
import { Link } from "react-router-dom";
import Papa from "papaparse";
import { supabase, searchMetadata, saveMediaItem, MediaType } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Empty, Seg } from "../components/ui";

type Row = { title: string; year: number | null; rating: number | null; date: string | null; type: MediaType; include: boolean; status?: string };
type Source = "letterboxd" | "goodreads" | "generic";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ImportPage() {
  const { session, toast } = useApp();
  const [source, setSource] = useState<Source>("letterboxd");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<{ ok: number; miss: number } | null>(null);

  if (!session) return <main className="app"><Empty><Link to="/auth">Sign in</Link> to import your history.</Empty></main>;

  function snapRating(v: number) { return Math.max(0.5, Math.min(5, Math.round(v * 2) / 2)); }

  function parseFile(file: File) {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const out: Row[] = [];
        for (const r of res.data as any[]) {
          if (out.length >= 100) break;
          if (source === "letterboxd") {
            const title = r["Name"]; if (!title) continue;
            out.push({
              title, year: r["Year"] ? +r["Year"] : null,
              rating: r["Rating"] ? snapRating(+r["Rating"]) : null,
              date: r["Watched Date"] || r["Date"] || null, type: "film", include: true,
            });
          } else if (source === "goodreads") {
            const title = r["Title"]; if (!title) continue;
            const rt = +r["My Rating"];
            out.push({
              title: title.replace(/\s*\(.*\)\s*$/, ""), year: null,
              rating: rt > 0 ? snapRating(rt) : null,
              date: r["Date Read"] ? r["Date Read"].replaceAll("/", "-") : null, type: "book", include: true,
            });
          } else {
            const title = r["title"] ?? r["Title"]; if (!title) continue;
            const t = (r["type"] ?? r["Type"] ?? "film").toLowerCase();
            out.push({
              title, year: r["year"] ? +r["year"] : null,
              rating: r["rating"] ? snapRating(+r["rating"]) : null,
              date: r["date"] ?? null,
              type: (["film", "tv", "game", "book", "music"].includes(t) ? t : "film") as MediaType, include: true,
            });
          }
        }
        setRows(out); setReport(null);
        toast(out.length ? `Parsed ${out.length} rows (capped at 100 per run).` : "Couldn't find rows — check the source setting matches the file.");
      },
      error: (e) => toast("Parse failed: " + e.message),
    });
  }

  async function run() {
    const todo = rows.filter((r) => r.include);
    if (!todo.length) return;
    setRunning(true); setProgress(0);
    const uid = session!.user.id;
    // target shelves: standard shelf per type
    const { data: shelves } = await supabase.from("shelves").select("id, media_type").eq("owner_id", uid).eq("kind", "standard");
    const shelfFor: Record<string, string> = {};
    ((shelves as any[]) ?? []).forEach((s) => { if (s.media_type) shelfFor[s.media_type] = s.id; });

    let ok = 0, miss = 0;
    const { data: imp } = await supabase.from("imports").insert({ user_id: uid, source: source === "generic" ? "csv" : source, status: "running" }).select().single();

    for (let i = 0; i < todo.length; i++) {
      const r = todo[i];
      try {
        const results = await searchMetadata(r.type, r.title);
        let pick = results[0];
        if (r.year) {
          const byYear = results.find((x) => x.year && Math.abs(x.year - r.year!) <= 1);
          if (byYear) pick = byYear;
        }
        if (!pick) throw new Error("no match");
        const mid = await saveMediaItem(pick);
        const shelfId = shelfFor[r.type];
        if (shelfId) {
          const { error } = await supabase.from("shelf_items").insert({ shelf_id: shelfId, media_item_id: mid });
          if (error && error.code !== "23505") throw error;
        }
        if (r.rating) await supabase.from("ratings").upsert({ user_id: uid, media_item_id: mid, rating: r.rating }, { onConflict: "user_id,media_item_id" });
        if (r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date)) {
          await supabase.from("diary_entries").insert({ user_id: uid, media_item_id: mid, consumed_on: r.date.slice(0, 10) });
        }
        r.status = "✓"; ok++;
      } catch { r.status = "✗"; miss++; }
      setProgress(Math.round(((i + 1) / todo.length) * 100));
      setRows([...rows]);
      await sleep(300); // be kind to the metadata APIs
    }
    if (imp) await supabase.from("imports").update({ status: "done", stats: { rows: todo.length, matched: ok, skipped: miss } }).eq("id", imp.id);
    setReport({ ok, miss }); setRunning(false);
    toast(`Import finished: ${ok} matched, ${miss} couldn't be found.`);
  }

  return (
    <main className="app">
      <div className="view-head">
        <h1>Import</h1>
        <p>Bring your history over — Letterboxd, Goodreads, or any CSV with title/year/type/rating/date columns.</p>
      </div>
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Seg options={[{ v: "letterboxd", label: "Letterboxd" }, { v: "goodreads", label: "Goodreads" }, { v: "generic", label: "Generic CSV" }] as any}
            value={source as any} onChange={(v) => setSource(v as Source)} />
          <label className="btn small" style={{ cursor: "pointer" }}>
            Choose CSV…
            <input type="file" accept=".csv,text/csv" style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])} />
          </label>
          <span className="mono faint" style={{ fontSize: 10 }}>
            {source === "letterboxd" ? "use watched.csv or diary.csv from your Letterboxd export"
              : source === "goodreads" ? "use the library export from Goodreads → My Books"
              : "columns: title, year, type (film/tv/game/book/music), rating, date"}
          </span>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card pad">
          <div className="section-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {rows.filter((r) => r.include).length} of {rows.length} selected
            <span style={{ display: "flex", gap: 8 }}>
              <button className="btn small" disabled={running} onClick={() => setRows(rows.map((r) => ({ ...r, include: !rows.every((x) => x.include) })))}>toggle all</button>
              <button className="btn small primary" disabled={running} onClick={run}>{running ? "importing…" : "Import"}</button>
            </span>
          </div>
          {running && <div className="progress-bar"><i style={{ width: progress + "%" }} /></div>}
          {report && <p className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>done — {report.ok} matched · {report.miss} not found (niche editions sometimes need adding by hand)</p>}
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {rows.map((r, i) => (
              <div key={i} className="wl-row">
                <input type="checkbox" checked={r.include} disabled={running}
                  onChange={() => setRows(rows.map((x, j) => (j === i ? { ...x, include: !x.include } : x)))} />
                <span style={{ flex: 1, fontSize: 13 }}>
                  <b>{r.title}</b> <span className="mono faint" style={{ fontSize: 10 }}>{r.year ?? ""} · {r.type}{r.rating ? ` · ${r.rating}★` : ""}{r.date ? ` · ${r.date.slice(0, 10)}` : ""}</span>
                </span>
                <span className="mono" style={{ fontSize: 12, width: 18, textAlign: "center", color: r.status === "✓" ? "var(--book)" : r.status === "✗" ? "var(--film)" : "var(--text-3)" }}>{r.status ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
