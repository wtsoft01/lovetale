import { supabase } from "@/integrations/supabase/client";
import { createServerFn } from "@/lib/_mock/runtime";
import { applyAffectionDelta, clampAffection } from "@/lib/affection-progression";

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
  return clampAffection(Number(card?.environment?.initialAffection ?? 0) || 0);
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

export type MyStoryAffectionRow = {
  storyId: string;
  affection: number;
  updatedAt: string;
};

export const listMyStoryAffections = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyStoryAffectionRow[]> => {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("story_affection")
      .select("story_id, affection, updated_at")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      storyId: row.story_id,
      affection: row.affection,
      updatedAt: row.updated_at,
    }));
  },
);

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
    const result = applyAffectionDelta(current, Number(data.delta) || 0, data.reason || "chat_message");
    const next = result.affection;
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

    return { affection: next, appliedDelta: result.appliedDelta, stage: result.stage };
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
