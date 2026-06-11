// supabase/functions/metadata/index.ts
// Search proxy: keeps API keys server-side, returns one normalized shape.
//   GET /metadata?type=film|tv|game|book|music&q=dune
//   GET /metadata?type=film&id=438631&save=1   ← fetch one + cache into media_items
//
// Secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set` in CI):
//   TMDB_API_KEY            — themoviedb.org (v3 key)
//   IGDB_CLIENT_ID          — Twitch dev console
//   IGDB_CLIENT_SECRET
//   SB_URL, SB_SERVICE_ROLE — only needed for ?save=1 caching

import { createClient } from "npm:@supabase/supabase-js@2";

type Normalized = {
  media_type: string;
  external_source: string;
  external_id: string;
  title: string;
  year: number | null;
  creators: { role: string; name: string }[];
  cover_url: string | null;
  description: string | null;
  metadata: Record<string, unknown>; // page_count, runtime_min, disc_count, platforms…
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ---------- IGDB needs a Twitch app token; cache it across invocations ----------
let igdbToken: { token: string; exp: number } | null = null;
async function getIgdbToken(): Promise<string> {
  if (igdbToken && igdbToken.exp > Date.now()) return igdbToken.token;
  const id = Deno.env.get("IGDB_CLIENT_ID")!;
  const secret = Deno.env.get("IGDB_CLIENT_SECRET")!;
  const r = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
    { method: "POST" },
  );
  const d = await r.json();
  igdbToken = { token: d.access_token, exp: Date.now() + (d.expires_in - 120) * 1000 };
  return igdbToken.token;
}

// ---------- per-source searchers ----------
async function searchTmdb(type: "film" | "tv", q: string): Promise<Normalized[]> {
  const key = Deno.env.get("TMDB_API_KEY")!;
  const kind = type === "film" ? "movie" : "tv";
  const r = await fetch(
    `https://api.themoviedb.org/3/search/${kind}?api_key=${key}&query=${encodeURIComponent(q)}`,
  );
  const d = await r.json();
  return (d.results ?? []).slice(0, 8).map((m: any) => ({
    media_type: type,
    external_source: "tmdb",
    external_id: String(m.id),
    title: m.title ?? m.name,
    year: (m.release_date ?? m.first_air_date)?.slice(0, 4) * 1 || null,
    creators: [],
    cover_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    description: m.overview ?? null,
    metadata: { vote_average: m.vote_average },
  }));
}

async function searchIgdb(q: string): Promise<Normalized[]> {
  const token = await getIgdbToken();
  const r = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": Deno.env.get("IGDB_CLIENT_ID")!,
      Authorization: `Bearer ${token}`,
    },
    body: `search "${q.replaceAll('"', "")}";
           fields name, first_release_date, cover.image_id, summary,
                  platforms.abbreviation, involved_companies.company.name,
                  involved_companies.developer;
           limit 8;`,
  });
  const d = await r.json();
  return (Array.isArray(d) ? d : []).map((g: any) => ({
    media_type: "game",
    external_source: "igdb",
    external_id: String(g.id),
    title: g.name,
    year: g.first_release_date
      ? new Date(g.first_release_date * 1000).getFullYear()
      : null,
    creators: (g.involved_companies ?? [])
      .filter((c: any) => c.developer)
      .map((c: any) => ({ role: "developer", name: c.company?.name }))
      .filter((c: any) => c.name),
    cover_url: g.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
      : null,
    description: g.summary ?? null,
    metadata: { platforms: (g.platforms ?? []).map((p: any) => p.abbreviation) },
  }));
}

async function searchOpenLibrary(q: string): Promise<Normalized[]> {
  const r = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=key,title,first_publish_year,author_name,cover_i,number_of_pages_median`,
  );
  const d = await r.json();
  return (d.docs ?? []).map((b: any) => ({
    media_type: "book",
    external_source: "openlibrary",
    external_id: b.key.replace("/works/", ""),
    title: b.title,
    year: b.first_publish_year ?? null,
    creators: (b.author_name ?? []).map((n: string) => ({ role: "author", name: n })),
    cover_url: b.cover_i
      ? `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg`
      : null,
    description: null,
    metadata: { page_count: b.number_of_pages_median ?? null }, // thickness metric
  }));
}

async function searchMusicBrainz(q: string): Promise<Normalized[]> {
  // MusicBrainz requires a descriptive UA and ≤1 req/s; fine at this scale.
  const r = await fetch(
    `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}&type=album&fmt=json&limit=8`,
    { headers: { "User-Agent": "Curio/0.1 (https://github.com/your-org/curio)" } },
  );
  const d = await r.json();
  return (d["release-groups"] ?? []).map((rg: any) => ({
    media_type: "music",
    external_source: "musicbrainz",
    external_id: rg.id,
    title: rg.title,
    year: rg["first-release-date"]?.slice(0, 4) * 1 || null,
    creators: (rg["artist-credit"] ?? []).map((a: any) => ({
      role: "artist",
      name: a.name,
    })),
    // Cover Art Archive resolves by MBID; the client can fall back if 404
    cover_url: `https://coverartarchive.org/release-group/${rg.id}/front-500`,
    description: null,
    metadata: { primary_type: rg["primary-type"] },
  }));
}

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "";
    const q = url.searchParams.get("q")?.trim() ?? "";
    const save = url.searchParams.get("save") === "1";
    if (!q) return json({ error: "missing q" }, 400);

    let results: Normalized[];
    switch (type) {
      case "film":
      case "tv":
        results = await searchTmdb(type, q);
        break;
      case "game":
        results = await searchIgdb(q);
        break;
      case "book":
        results = await searchOpenLibrary(q);
        break;
      case "music":
        results = await searchMusicBrainz(q);
        break;
      default:
        return json({ error: "type must be film|tv|game|book|music" }, 400);
    }

    // Optional: cache the top result into media_items (service role bypasses RLS)
    if (save && results[0]) {
      const sb = createClient(
        Deno.env.get("SB_URL")!,
        Deno.env.get("SB_SERVICE_ROLE")!,
      );
      const { data, error } = await sb
        .from("media_items")
        .upsert(results[0], { onConflict: "media_type,external_source,external_id" })
        .select("id")
        .single();
      if (error) throw error;
      return json({ saved: data.id, results });
    }

    return json({ results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
