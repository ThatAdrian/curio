import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anon);

const FN = `${url}/functions/v1/metadata`;
const fnHeaders = { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" };

export type MediaType = "film" | "tv" | "game" | "book" | "music";

export type MetadataResult = {
  media_type: MediaType;
  external_source: string;
  external_id: string;
  title: string;
  year: number | null;
  creators: { role: string; name: string }[];
  cover_url: string | null;
  description: string | null;
  metadata: Record<string, any>;
};

/** Search external metadata via the edge function (keys stay server-side). */
export async function searchMetadata(type: MediaType, q: string): Promise<MetadataResult[]> {
  const r = await fetch(`${FN}?type=${type}&q=${encodeURIComponent(q)}`, { headers: fnHeaders });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.results ?? [];
}

/** Persist a picked search result into media_items (service-role upsert), returns its uuid. */
export async function saveMediaItem(item: MetadataResult): Promise<string> {
  const r = await fetch(FN, { method: "POST", headers: fnHeaders, body: JSON.stringify({ item }) });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.saved as string;
}

/** Insert a notification for another user (RLS requires actor_id = self). */
export async function notify(userId: string, type: string, payload: Record<string, any> = {}) {
  const { data } = await supabase.auth.getUser();
  const me = data.user?.id;
  if (!me || me === userId) return;
  await supabase.from("notifications").insert({ user_id: userId, type, actor_id: me, payload });
}

/** Deterministic fallback gradient when a cover image is missing/broken. */
export function coverGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const palettes = [
    ["#e07b39", "#7d2e46", "#241133"], ["#34465e", "#101622", "#0a0f1a"],
    ["#8ace00", "#5d8f0a", "#2e4a06"], ["#ff7ad1", "#7d4fff", "#2a1a4e"],
    ["#bfe0da", "#2e564f", "#0c1f1a"], ["#d8262c", "#5c1015", "#16060a"],
    ["#69b7ff", "#1c3f66", "#06101c"], ["#d9b577", "#7a5a2e", "#241a0d"],
    ["#3fc1c9", "#1b5b6e", "#06181f"], ["#c98ae0", "#6a2f8a", "#1f0c2e"],
  ];
  const p = palettes[h % palettes.length];
  return `linear-gradient(165deg, ${p[0]} 0%, ${p[1]} 55%, ${p[2]} 100%)`;
}

export const MEDIA_LABELS: Record<MediaType, string> = {
  film: "Film", tv: "TV", game: "Game", book: "Book", music: "Album",
};
export const MEDIA_COLORS: Record<MediaType, string> = {
  film: "var(--film)", tv: "var(--tv)", game: "var(--game)", book: "var(--book)", music: "var(--music)",
};
