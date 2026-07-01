import { supabase } from "@/integrations/supabase/client";
import { createServerFn } from "@/lib/_mock/runtime";

function clampAffection(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user.id;
}

async function initialAffection(storyId: string) {
  const { data } = await supabase
    .from("user_stories")
    .select("character_card")
    .eq("id", storyId)
    .maybeSingle();

  const card = data?.character_card && typeof data.character_card === "object" ? data.character_card as any : {};
  return clampAffection(Number(card?.environment?.initialAffection ?? 30) || 30);
}

export const getMyStoryAffection = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => i as { storyId: string })
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const { data: row, error } = await supabase
      .from("story_affection")
      .select("affection, updated_at")
      .eq("user_id", uid)
      .eq("story_id", data.storyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (row) return { affection: row.affection, updatedAt: row.updated_at };

    return { affection: await initialAffection(data.storyId), updatedAt: null as string | null };
  });

export const bumpMyStoryAffection = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { storyId: string; delta: number; reason?: string })
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const { data: row, error } = await supabase
      .from("story_affection")
      .select("affection")
      .eq("user_id", uid)
      .eq("story_id", data.storyId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const current = row?.affection ?? await initialAffection(data.storyId);
    const next = clampAffection(current + (Number(data.delta) || 0));
    const now = new Date().toISOString();
    const { error: saveError } = await supabase
      .from("story_affection")
      .upsert(
        {
          user_id: uid,
          story_id: data.storyId,
          affection: next,
          updated_at: now,
        },
        { onConflict: "user_id,story_id" },
      );
    if (saveError) throw new Error(saveError.message);

    return { affection: next };
  });

export const setMyStoryAffection = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { storyId: string; affection: number })
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const value = clampAffection(Number(data.affection) || 0);
    const { error } = await supabase
      .from("story_affection")
      .upsert(
        {
          user_id: uid,
          story_id: data.storyId,
          affection: value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,story_id" },
      );
    if (error) throw new Error(error.message);
    return { affection: value };
  });
