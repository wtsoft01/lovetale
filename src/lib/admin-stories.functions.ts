import { createServerFn } from "@/lib/_mock/runtime";
import { fetchWithSupabaseAuth } from "@/lib/supabase-auth-fetch";
import type { Database, Json } from "@/integrations/supabase/types";

type UserStory = Database["public"]["Tables"]["user_stories"]["Row"];
type HomePlacement = Pick<
  Database["public"]["Tables"]["home_placements"]["Row"],
  "slot" | "sort_order" | "is_active"
>;

type AdminStoryUpdateInput = {
  id: string;
  snapshotNote?: string;
  title?: string;
  logline?: string | null;
  tags?: string[];
  price_credits?: number;
  audience?: string;
  max_heat?: string;
  is_public?: boolean;
  is_listed?: boolean;
  status?: string;
  cover_url?: string | null;
  body_text?: string | null;
  source_prompt?: string;
  character_card?: Json;
  beats?: Json;
  asset_slots?: Json;
};

export type AdminStoryRow = {
  id: string;
  title: string;
  logline: string | null;
  cover_url: string | null;
  status: string;
  is_public: boolean;
  is_listed: boolean;
  price_credits: number;
  audience: string;
  max_heat: string;
  tags: string[];
  content_type: string;
  source_story_id: string | null;
  source_title: string | null;
  rpg_scenes_count: number;
  rpg_endings_total: number;
  story_overview: string;
  chapters_count: number;
  free_chapters_count: number;
  characters_count: number;
  body_chars: number;
  asset_slots_count: number;
  user_id: string;
  created_at: string;
  updated_at: string;
  beats_count: number;
  chapters: Array<{
    id: string;
    title: string;
    episodeNumber: number;
    summary: string;
    isFree: boolean;
    priceCredits: number;
    bodyChars: number;
    assetSlotsCount: number;
  }>;
};

async function adminStoriesApi<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 25_000);
  let res: Response;
  try {
    res = await fetchWithSupabaseAuth(`/api/admin/stories${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Admin stories API timed out. 저장 요청이 너무 오래 걸렸어요.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text().catch(() => "");
    let payload: any = null;
    if (contentType.includes("application/json") && raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
    }
    const reason =
      payload?.reason ||
      payload?.message ||
      raw.slice(0, 180).replace(/\s+/g, " ").trim() ||
      res.statusText ||
      "unknown_error";
    throw new Error(`Admin stories API failed (${res.status}): ${reason}`);
  }
  return (await res.json()) as T;
}

export const listAdminStories = createServerFn({ method: "GET" })
  .inputValidator(
    (input: any) =>
      (input ?? {}) as { q?: string; status?: "all" | "draft" | "published"; contentType?: string },
  )
  .handler(async ({ data }): Promise<AdminStoryRow[]> => {
    const params = new URLSearchParams();
    if (data.q) params.set("q", data.q);
    if (data.status) params.set("status", data.status);
    if (data.contentType) params.set("contentType", data.contentType);

    const payload = await adminStoriesApi<{ ok: true; rows: AdminStoryRow[] }>(
      params.toString() ? `?${params.toString()}` : "",
    );
    return payload.rows;
  });

export const getAdminStory = createServerFn({ method: "GET" })
  .inputValidator((input: any) => input as { id: string })
  .handler(async ({ data }): Promise<UserStory> => {
    const params = new URLSearchParams({ id: data.id });
    const payload = await adminStoriesApi<{ ok: true; story: UserStory }>(`?${params.toString()}`);
    return payload.story;
  });

export const updateAdminStory = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as AdminStoryUpdateInput)
  .handler(async ({ data }) => {
    const payload = await adminStoriesApi<{ ok: true; story: UserStory }>("", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return payload.story;
  });

export const listStoryVersions = createServerFn({ method: "GET" })
  .inputValidator((input: any) => input as { storyId: string })
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ mode: "versions", storyId: data.storyId });
    const payload = await adminStoriesApi<{
      ok: true;
      rows: Array<{ id: string; created_at: string; note: string | null; title: string; created_by: string | null }>;
    }>(`?${params.toString()}`);
    return payload.rows;
  });

export const restoreStoryVersion = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { versionId: string })
  .handler(async ({ data }) => {
    await adminStoriesApi<{ ok: true; story: UserStory }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore_version", versionId: data.versionId }),
    });
    return { ok: true };
  });

export const deleteAdminStory = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { id: string })
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ id: data.id });
    await adminStoriesApi<{ ok: true }>(`?${params.toString()}`, { method: "DELETE" });
    return { ok: true };
  });

export const bulkDeleteAdminStories = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { ids: string[] })
  .handler(async ({ data }) => {
    const payload = await adminStoriesApi<{ ok: true; deleted: number }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_delete", ids: data.ids }),
    });
    return { deleted: payload.deleted };
  });

export const bulkUpdateAdminStories = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { ids: string[]; action: "publish" | "unlist" | "private" })
  .handler(async ({ data }) => {
    const payload = await adminStoriesApi<{ ok: true; updated: number }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_status", ids: data.ids, statusAction: data.action }),
    });
    return { updated: payload.updated };
  });

export const createDraftStory = createServerFn({ method: "POST" })
  .inputValidator(
    (input: any) =>
      input as {
        title?: string;
        contentType?: "web_novel" | "romance_sim" | "story_rpg" | "webtoon" | "short_story" | "other";
        sourceText?: string;
        targetStoryId?: string;
        coverUrl?: string | null;
        logline?: string | null;
        storyOverview?: string | null;
        episodeTitle?: string | null;
        episodeSummary?: string | null;
        authorName?: string | null;
        previewUrl?: string | null;
        previewType?: "image" | "video" | null;
        tags?: string[];
        audience?: "all" | "female" | "male";
        maxHeat?: "soft" | "warm" | "spicy" | "steamy";
        priceCredits?: number;
        characterName?: string | null;
        characterRole?: string | null;
        characterPersona?: string | null;
        characterSpeakingStyle?: string | null;
      },
  )
  .handler(async ({ data }): Promise<{ id: string }> => {
    const payload = await adminStoriesApi<{ ok: true; id: string }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        contentType: data.contentType ?? "web_novel",
        sourceText: data.sourceText ?? "",
        targetStoryId: data.targetStoryId,
        coverUrl: data.coverUrl ?? null,
        logline: data.logline ?? null,
        storyOverview: data.storyOverview ?? "",
        episodeTitle: data.episodeTitle ?? "",
        episodeSummary: data.episodeSummary ?? "",
        authorName: data.authorName ?? "",
        previewUrl: data.previewUrl ?? null,
        previewType: data.previewType ?? null,
        tags: data.tags ?? [],
        audience: data.audience ?? "all",
        maxHeat: data.maxHeat ?? "warm",
        priceCredits: Math.max(0, Math.floor(Number(data.priceCredits) || 0)),
        characterName: data.characterName ?? "",
        characterRole: data.characterRole ?? "",
        characterPersona: data.characterPersona ?? "",
        characterSpeakingStyle: data.characterSpeakingStyle ?? "",
      }),
    });
    return { id: payload.id };
  });

export const cloneStoryAsRpg = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { sourceStoryId: string; title?: string })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const payload = await adminStoriesApi<{ ok: true; id: string }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "clone_story_rpg",
        sourceStoryId: data.sourceStoryId,
        title: data.title,
      }),
    });
    return { id: payload.id };
  });
export const quickPatchStory = createServerFn({ method: "POST" })
  .inputValidator(
    (input: any) =>
      input as {
        id: string;
        title?: string;
        cover_url?: string | null;
        price_credits?: number;
        is_public?: boolean;
        is_listed?: boolean;
        first_chapter_is_free?: boolean;
        first_chapter_price?: number;
      },
  )
  .handler(async ({ data }) => {
    await adminStoriesApi<{ ok: true; row: AdminStoryRow }>("", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { ok: true };
  });

export const setStoryHomePlacement = createServerFn({ method: "POST" })
  .inputValidator(
    (input: any) =>
      input as { id: string; slots: ("hero" | "trending" | "new" | "all")[]; sort_order?: number },
  )
  .handler(async ({ data }) => {
    await adminStoriesApi<{ ok: true }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_home_placement",
        id: data.id,
        slots: data.slots,
        sort_order: data.sort_order ?? 0,
      }),
    });
    return { ok: true };
  });

export const getStoryHomePlacement = createServerFn({ method: "GET" })
  .inputValidator((input: any) => input as { id: string })
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ mode: "placement", id: data.id });
    const payload = await adminStoriesApi<{ ok: true; placements: HomePlacement[] }>(
      `?${params.toString()}`,
    );
    return payload.placements;
  });
