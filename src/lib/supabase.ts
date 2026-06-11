import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anon);

/** Search external metadata via the edge function (keys stay server-side). */
export async function searchMetadata(
  type: "film" | "tv" | "game" | "book" | "music",
  q: string,
  save = false,
) {
  const { data, error } = await supabase.functions.invoke(
    `metadata?type=${type}&q=${encodeURIComponent(q)}${save ? "&save=1" : ""}`,
    { method: "GET" },
  );
  if (error) throw error;
  return data as { results: MetadataResult[]; saved?: string };
}

export type MetadataResult = {
  media_type: string;
  external_source: string;
  external_id: string;
  title: string;
  year: number | null;
  creators: { role: string; name: string }[];
  cover_url: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
};
