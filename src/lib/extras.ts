import { supabase } from "./supabase";

/** Get (or lazily create) the user's Watch Later system list, then add an item. */
export async function addToWatchLater(mediaId: string): Promise<string> {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Sign in first.");
  let { data: list } = await supabase.from("lists").select("id")
    .eq("owner_id", uid).eq("system_key", "watch_later").maybeSingle();
  if (!list) {
    const { data: created, error } = await supabase.from("lists")
      .insert({ owner_id: uid, title: "Watch later", is_system: true, system_key: "watch_later", visibility: "private" })
      .select("id").single();
    if (error) throw error;
    list = created;
  }
  const { error } = await supabase.from("list_items").insert({ list_id: list.id, media_item_id: mediaId, added_by: uid });
  if (error && error.code !== "23505") throw error;
  return error?.code === "23505" ? "Already on Watch Later." : "Added to Watch Later.";
}

/** Evaluate + self-award badges. Returns newly earned badge names. */
export async function awardBadges(uid: string): Promise<string[]> {
  const [{ data: earned }, { data: defs }] = await Promise.all([
    supabase.from("user_badges").select("badge_id").eq("user_id", uid),
    supabase.from("badges").select("id,slug,name"),
  ]);
  if (!defs?.length) return [];
  const have = new Set((earned ?? []).map((e: any) => e.badge_id));
  const bySlug: Record<string, any> = {};
  defs.forEach((d: any) => (bySlug[d.slug] = d));

  const { data: myShelves } = await supabase.from("shelves").select("id").eq("owner_id", uid);
  const shelfIds = (myShelves ?? []).map((s: any) => s.id);
  const cnt = async (q: any) => (await q).count ?? 0;
  const shelved = shelfIds.length ? await cnt(supabase.from("shelf_items").select("*", { count: "exact", head: true }).in("shelf_id", shelfIds)) : 0;
  const done = shelfIds.length ? await cnt(supabase.from("shelf_items").select("*", { count: "exact", head: true }).in("shelf_id", shelfIds).gte("completion", 100)) : 0;
  const [reviews, rated, diary, clubs, rooms, bags] = await Promise.all([
    cnt(supabase.from("reviews").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("status", "published")),
    cnt(supabase.from("ratings").select("*", { count: "exact", head: true }).eq("user_id", uid)),
    cnt(supabase.from("diary_entries").select("*", { count: "exact", head: true }).eq("user_id", uid)),
    cnt(supabase.from("clubs").select("*", { count: "exact", head: true }).eq("created_by", uid)),
    cnt(supabase.from("room_members").select("*", { count: "exact", head: true }).eq("user_id", uid)),
    cnt(supabase.from("rec_bags").select("*", { count: "exact", head: true }).eq("sender_id", uid)),
  ]);

  const earnedNow: { slug: string; when: boolean }[] = [
    { slug: "first_shelf", when: shelved >= 1 }, { slug: "archivist", when: shelved >= 50 },
    { slug: "first_review", when: reviews >= 1 }, { slug: "ten_ratings", when: rated >= 10 },
    { slug: "completionist", when: done >= 1 }, { slug: "diarist", when: diary >= 7 },
    { slug: "club_founder", when: clubs >= 1 }, { slug: "roommate", when: rooms >= 1 },
    { slug: "gifter", when: bags >= 1 },
  ];
  const fresh: string[] = [];
  for (const e of earnedNow) {
    const def = bySlug[e.slug];
    if (!def || !e.when || have.has(def.id)) continue;
    const { error } = await supabase.from("user_badges").insert({ user_id: uid, badge_id: def.id });
    if (!error) fresh.push(def.name);
  }
  return fresh;
}
