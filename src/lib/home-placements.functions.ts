import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@/lib/_mock/runtime";

export type HomeSlot = Database["public"]["Enums"]["home_slot"];

export type HomePlacementCard = {
  id: string;
  slot: HomeSlot;
  sort_order: number;
  story_id: string;
  title: string;
  logline: string | null;
  cover_url: string | null;
  price_credits: number;
  author_id: string;
  author_name: string;
  audience: string;
  max_heat: string;
  tags: string[] | null;
  created_at: string;
};

export type AdminHomePlacementRow = {
  id: string;
  slot: HomeSlot;
  sort_order: number;
  is_active: boolean;
  story_id: string;
  created_at: string;
  user_stories: {
    id: string;
    title: string;
    cover_url: string | null;
    is_public: boolean;
    is_listed: boolean;
  } | null;
};

function normalizeSortOrder(value: unknown) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export const listHomePlacements = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => i as { slot: HomeSlot })
  .handler(async ({ data }): Promise<HomePlacementCard[]> => {
    const { data: rows, error } = await supabase.rpc("list_home_placements", { _slot: data.slot });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      ...row,
      tags: row.tags ?? [],
    }));
  });

export const adminListPlacements = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => i as { slot: HomeSlot })
  .handler(async ({ data }): Promise<AdminHomePlacementRow[]> => {
    const { data: rows, error } = await supabase
      .from("home_placements")
      .select(
        "id,slot,sort_order,is_active,story_id,created_at,user_stories(id,title,cover_url,is_public,is_listed)",
      )
      .eq("slot", data.slot)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as AdminHomePlacementRow[];
  });

export const addHomePlacement = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { slot: HomeSlot; story_id: string; sort_order?: number })
  .handler(async ({ data }) => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error("Unauthorized");

    const sortOrder = normalizeSortOrder(data.sort_order);
    const { data: existing, error: existingError } = await supabase
      .from("home_placements")
      .select("id")
      .eq("slot", data.slot)
      .eq("story_id", data.story_id)
      .limit(1);
    if (existingError) throw new Error(existingError.message);

    const existingId = existing?.[0]?.id;
    const { error } = existingId
      ? await supabase
          .from("home_placements")
          .update({
            sort_order: sortOrder,
            is_active: true,
            created_by: userData.user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingId)
      : await supabase.from("home_placements").insert({
          slot: data.slot,
          story_id: data.story_id,
          sort_order: sortOrder,
          is_active: true,
          created_by: userData.user.id,
        });
    if (error) throw new Error(error.message);

    const { error: publishError } = await supabase
      .from("user_stories")
      .update({
        status: "published",
        is_public: true,
        is_listed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.story_id);
    if (publishError) throw new Error(publishError.message);

    return { ok: true };
  });

export const updateHomePlacement = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { id: string; sort_order?: number; is_active?: boolean })
  .handler(async ({ data }) => {
    const patch: Database["public"]["Tables"]["home_placements"]["Update"] = {};
    if (data.sort_order !== undefined) patch.sort_order = normalizeSortOrder(data.sort_order);
    if (data.is_active !== undefined) patch.is_active = data.is_active;

    const { error } = await supabase.from("home_placements").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeHomePlacement = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { id: string })
  .handler(async ({ data }) => {
    const { error } = await supabase.from("home_placements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
