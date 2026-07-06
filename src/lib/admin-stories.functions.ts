import { createServerFn } from "@/lib/_mock/runtime";
import { createServerFn as createTanStackServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";

type UserStory = Database["public"]["Tables"]["user_stories"]["Row"];
type StaffRole = "admin" | "editor" | "moderator";
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

const SUPER_ADMIN_EMAIL = "admin@lovetale.org";
const STAFF_ROLES: StaffRole[] = ["admin", "editor", "moderator"];

function recordOf(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

async function ensureSuperAdminRoles(userId: string) {
  const { error } = await supabaseAdmin.from("user_roles").upsert(
    STAFF_ROLES.map((role) => ({ user_id: userId, role })),
    { onConflict: "user_id,role" },
  );
  if (error) throw new Error(error.message);
}

async function requireStoryManager(context: any) {
  const userId = String(context?.userId ?? "");
  const email = String(context?.claims?.email ?? "").trim().toLowerCase();
  if (!userId) throw new Error("Unauthorized");
  if (email === SUPER_ADMIN_EMAIL) await ensureSuperAdminRoles(userId);

  const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((row) => row.role as StaffRole).filter((role): role is StaffRole => STAFF_ROLES.includes(role));
  if (!roles.includes("admin") && !roles.includes("editor")) throw new Error("Forbidden");
}

function toAdminStoryRow(row: UserStory): AdminStoryRow {
  const card = recordOf(row.character_card);
  const storyRpg = recordOf(card.storyRpg);
  const chapters = Array.isArray(card.chapters) ? card.chapters : [];
  const characters = Array.isArray(card.characters) ? card.characters : [];
  const rpgScenes = Array.isArray(storyRpg.scenes) ? storyRpg.scenes : [];
  const rawContentType = String(card.contentType ?? "web_novel");
  const sourceStoryId = String(storyRpg.sourceStoryId || card.sourceStoryId || "").trim() || null;
  const hasStoryRpgWork =
    Boolean(sourceStoryId) || storyRpg.enabled === true || Boolean(storyRpg.generatedFrom) || rpgScenes.length > 0;
  const contentType =
    rawContentType === "story_rpg" && hasStoryRpgWork
      ? "story_rpg"
      : rawContentType === "story_rpg"
        ? String(card.sourceContentType || storyRpg.sourceContentType || "web_novel")
        : rawContentType;
  const chapterRows = chapters.map((chapter: any, index: number) => {
    const body = typeof chapter?.body === "string" ? chapter.body : "";
    const assetSlots = Array.isArray(chapter?.assetSlots) ? chapter.assetSlots : [];
    return {
      id: String(chapter?.id ?? `chapter-${index + 1}`),
      title: String(chapter?.title ?? `Episode ${index + 1}`),
      episodeNumber: Number(chapter?.episodeNumber ?? index + 1),
      summary: String(chapter?.summary ?? ""),
      isFree: Boolean(chapter?.isFree ?? index === 0),
      priceCredits: Math.max(0, Number(chapter?.priceCredits ?? 0)),
      bodyChars: body.length,
      assetSlotsCount: assetSlots.length,
    };
  });

  return {
    id: row.id,
    title: row.title,
    logline: row.logline,
    cover_url: row.cover_url,
    status: row.status,
    is_public: row.is_public,
    is_listed: row.is_listed,
    price_credits: row.price_credits,
    audience: row.audience,
    max_heat: row.max_heat,
    tags: row.tags ?? [],
    content_type: contentType,
    source_story_id: sourceStoryId,
    source_title: String(storyRpg.sourceTitle || card.sourceTitle || "").trim() || null,
    rpg_scenes_count: rpgScenes.length,
    rpg_endings_total: Math.max(0, Number(storyRpg.endingsTotal ?? 0) || 0),
    story_overview: String(card.storyOverview ?? row.logline ?? ""),
    chapters: chapterRows,
    chapters_count: chapterRows.length,
    free_chapters_count: chapterRows.filter((chapter) => chapter.isFree).length,
    characters_count: characters.length || (card.name ? 1 : 0),
    body_chars: typeof row.body_text === "string" ? row.body_text.length : 0,
    asset_slots_count: Array.isArray(row.asset_slots) ? row.asset_slots.length : 0,
    user_id: row.user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    beats_count: Array.isArray(row.beats) ? row.beats.length : 0,
  };
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Unauthorized");
  return token;
}

async function adminStoriesApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch(`/api/admin/stories${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
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

export const listAdminStories = createTanStackServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: any) =>
      (input ?? {}) as { q?: string; status?: "all" | "draft" | "published"; contentType?: string },
  )
  .handler(async ({ data, context }): Promise<AdminStoryRow[]> => {
    await requireStoryManager(context);

    const { data: rowsData, error } = await supabaseAdmin
      .from("user_stories")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    let rows = (rowsData ?? []).map((row) => toAdminStoryRow(row as UserStory));
    if (data.status === "published") rows = rows.filter((row) => row.is_public && row.is_listed);
    if (data.status === "draft") rows = rows.filter((row) => !row.is_public || !row.is_listed);
    if (data.contentType && data.contentType !== "all") rows = rows.filter((row) => row.content_type === data.contentType);
    const q = String(data.q ?? "").trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) => `${row.title} ${row.logline ?? ""} ${row.story_overview}`.toLowerCase().includes(q));
    }
    return rows;
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
