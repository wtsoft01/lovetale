import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { normalizeProseLineBreaks } from "@/lib/text-normalization";

const SUPER_ADMIN_EMAIL = "admin@lovetale.org";
const STAFF_ROLES = ["admin", "editor", "moderator"] as const;
const SUPER_ADMIN_ROLES = ["admin"] as const;
const CHAPTER_SEPARATOR = "\n\n---- next episode ----\n\n";
const ensuredSuperAdminUserIds = new Set<string>();

type StaffRole = (typeof STAFF_ROLES)[number];
type UserStoryRow = Database["public"]["Tables"]["user_stories"]["Row"];
type UserStoryInsert = Database["public"]["Tables"]["user_stories"]["Insert"];
type UserStoryUpdate = Database["public"]["Tables"]["user_stories"]["Update"];
type HomeSlot = Database["public"]["Enums"]["home_slot"];

type ContentType = "web_novel" | "romance_sim" | "webtoon" | "short_story" | "other";

type CreateStoryPayload = {
  title?: string;
  contentType?: ContentType;
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
};

type BulkStatusPayload = {
  action: "bulk_status" | "bulk_delete";
  ids?: string[];
  statusAction?: "publish" | "unlist" | "private";
};

type SetPlacementPayload = {
  action: "set_home_placement";
  id?: string;
  slots?: HomeSlot[];
  sort_order?: number;
};

type RestoreVersionPayload = {
  action: "restore_version";
  versionId?: string;
};

function newId(prefix: string) {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${uuid}`;
}

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

function recordOf(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function buildChapter(
  sourceText: string,
  contentType: ContentType,
  index: number,
  title?: string,
  summary?: string,
) {
  return {
    id: newId("ch"),
    title: title?.trim() || (contentType === "short_story" ? "Short story" : `Episode ${index}`),
    episodeNumber: index,
    isFree: index === 1,
    priceCredits: 0,
    summary: summary?.trim() || "",
    body: sourceText,
    assetSlots: [],
  };
}

function normalizeStoryInsert(data: UserStoryInsert): UserStoryInsert {
  const normalized = {
    ...data,
    status: data.status ?? "draft",
    is_public: data.is_public ?? false,
    is_listed: data.is_listed ?? false,
    price_credits: data.price_credits ?? 0,
    audience: data.audience ?? "all",
    max_heat: data.max_heat ?? "warm",
    tags: data.tags ?? [],
    beats: data.beats ?? [],
    character_card: data.character_card ?? {},
    asset_slots: data.asset_slots ?? [],
    body_text: data.body_text ?? "",
    compose_step: data.compose_step ?? "body",
    source_prompt: data.source_prompt ?? "admin create",
    created_at: data.created_at ?? new Date().toISOString(),
    updated_at: data.updated_at ?? new Date().toISOString(),
  } as UserStoryInsert;
  return normalized;
}

function toAdminStoryRow(row: UserStoryRow) {
  const card = recordOf(row.character_card);
  const chapters = Array.isArray(card.chapters) ? card.chapters : [];
  const characters = Array.isArray(card.characters) ? card.characters : [];
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
    content_type: String(card.contentType ?? "web_novel"),
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

async function ensureSuperAdminRoles(userId: string) {
  const rows = SUPER_ADMIN_ROLES.map((role) => ({ user_id: userId, role }));
  const { error } = await supabaseAdmin
    .from("user_roles")
    .upsert(rows, { onConflict: "user_id,role" });
  if (error) throw new Error(error.message);
}

async function requireStaff(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return { error: jsonError("missing_token", 401) as Response, userId: "", isAdmin: false };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { error: jsonError("invalid_token", 401) as Response, userId: "", isAdmin: false };

  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (email === SUPER_ADMIN_EMAIL) {
    if (!ensuredSuperAdminUserIds.has(data.user.id)) {
      await ensureSuperAdminRoles(data.user.id);
      ensuredSuperAdminUserIds.add(data.user.id);
    }
    return { userId: data.user.id, isAdmin: true };
  }

  const { data: rolesData, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (rolesError) return { error: jsonServerError(rolesError, 500), userId: data.user.id, isAdmin: false };

  const roles = (rolesData ?? [])
    .map((row) => row.role as StaffRole)
    .filter((role): role is StaffRole => STAFF_ROLES.includes(role));
  if (!roles.includes("admin") && !roles.includes("editor")) {
    return { error: jsonError("forbidden", 403) as Response, userId: data.user.id, isAdmin: false };
  }
  return { userId: data.user.id, isAdmin: roles.includes("admin") };
}

async function listStories(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const status = url.searchParams.get("status") ?? "all";
  const contentType = url.searchParams.get("contentType") ?? "all";

  const { data, error } = await supabaseAdmin
    .from("user_stories")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) return jsonServerError(error, 500);

  let rows = (data ?? []).map(toAdminStoryRow);
  if (status === "published") rows = rows.filter((row) => row.is_public && row.is_listed);
  if (status === "draft") rows = rows.filter((row) => !row.is_public || !row.is_listed);
  if (contentType && contentType !== "all") rows = rows.filter((row) => row.content_type === contentType);
  if (q) {
    rows = rows.filter((row) => {
      const haystack = `${row.title} ${row.logline ?? ""} ${row.story_overview}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  return Response.json({ ok: true, rows });
}

async function getStory(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  if (!id) return jsonError("missing_id");

  const { data, error } = await supabaseAdmin.from("user_stories").select("*").eq("id", id).maybeSingle();
  if (error) return jsonServerError(error, 500);
  if (!data) return jsonError("story_not_found", 404);
  return Response.json({ ok: true, story: data });
}

async function listVersions(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const url = new URL(request.url);
  const storyId = String(url.searchParams.get("storyId") ?? "").trim();
  if (!storyId) return jsonError("missing_story_id");

  const { data, error } = await supabaseAdmin
    .from("story_versions")
    .select("id,created_at,note,title,created_by")
    .eq("story_id", storyId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return jsonServerError(error, 500);
  return Response.json({ ok: true, rows: data ?? [] });
}

async function getPlacement(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  if (!id) return jsonError("missing_id");

  const [{ data, error }, { data: story, error: storyError }] = await Promise.all([
    supabaseAdmin
    .from("home_placements")
    .select("slot,sort_order,is_active")
    .eq("story_id", id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("user_stories")
      .select("is_public,is_listed")
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (error) return jsonServerError(error, 500);
  if (storyError) return jsonServerError(storyError, 500);

  const placements = [...(data ?? [])];
  if (story?.is_public && story?.is_listed) {
    placements.push({ slot: "all" as HomeSlot, sort_order: 0, is_active: true });
  }

  return Response.json({ ok: true, placements });
}

async function createOrAppendStory(request: Request, payload?: Partial<CreateStoryPayload>) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const body = payload ?? ((await request.json().catch(() => ({}))) as Partial<CreateStoryPayload>);
  const title = String(body.title ?? "").trim();
  const sourceText = normalizeProseLineBreaks(String(body.sourceText ?? "")).trim();
  const contentType = (body.contentType ?? "web_novel") as ContentType;
  const targetStoryId = String(body.targetStoryId ?? "").trim();
  const coverUrl = typeof body.coverUrl === "string" && body.coverUrl.trim() ? body.coverUrl.trim() : null;
  const logline = typeof body.logline === "string" && body.logline.trim() ? body.logline.trim() : "";
  const storyOverview = String(body.storyOverview ?? sourceText).trim();
  const episodeTitleInput = String(body.episodeTitle ?? "").trim();
  const episodeSummary = String(body.episodeSummary ?? "").trim();
  const authorName = String(body.authorName ?? "").trim();
  const tags = Array.isArray(body.tags) ? body.tags.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 12) : [];
  const audience = body.audience === "female" || body.audience === "male" ? body.audience : "all";
  const maxHeat =
    body.maxHeat === "soft" || body.maxHeat === "spicy" || body.maxHeat === "steamy" ? body.maxHeat : "warm";
  const priceCredits = Math.max(0, Math.floor(Number(body.priceCredits) || 0));
  const characterName = String(body.characterName ?? "").trim();
  const characterRole = String(body.characterRole ?? "").trim();
  const characterPersona = String(body.characterPersona ?? "").trim();
  const characterSpeakingStyle = String(body.characterSpeakingStyle ?? "").trim();
  const previewUrl =
    typeof body.previewUrl === "string" && body.previewUrl.trim() ? body.previewUrl.trim() : null;
  const previewType = previewUrl ? (body.previewType === "video" ? "video" : "image") : null;
  const safeTitle = title || "Untitled story";

  const now = new Date().toISOString();
  if (targetStoryId) {
    const { data: target, error: readError } = await supabaseAdmin
      .from("user_stories")
      .select("id,title,logline,body_text,character_card,cover_url")
      .eq("id", targetStoryId)
      .maybeSingle();
    if (readError) return jsonServerError(readError, 500);
    if (!target) return jsonError("target_story_not_found", 404);

    const card = recordOf(target.character_card);
    const chapters = Array.isArray(card.chapters) ? [...card.chapters] : [];
    const nextEpisodeNumber = chapters.length + 1;
    const episodeTitle = episodeTitleInput || title || `Episode ${nextEpisodeNumber}`;
    chapters.push(buildChapter(sourceText, contentType, nextEpisodeNumber, episodeTitle, episodeSummary));
    const existingBody = typeof target.body_text === "string" ? target.body_text.trim() : "";
    const nextOverview = storyOverview || String(card.storyOverview ?? target.logline ?? "").trim();
    const nextBody = sourceText ? [existingBody, sourceText].filter(Boolean).join(CHAPTER_SEPARATOR) : existingBody;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("user_stories")
      .update({
        ...(coverUrl ? { cover_url: coverUrl } : {}),
        body_text: nextBody,
        character_card: {
          ...card,
          contentType: card.contentType ?? contentType,
          chapters,
          storyOverview: nextOverview.slice(0, 280),
          ...(authorName ? { authorName } : {}),
          ...(previewUrl ? { preview: { url: previewUrl, type: previewType } } : {}),
        },
        compose_step: "body",
        updated_at: now,
      })
      .eq("id", targetStoryId)
      .select("id")
      .single();
    if (updateError) return jsonServerError(updateError, 500);

    return Response.json({ ok: true, id: updated.id });
  }

  const chapter = sourceText ? buildChapter(sourceText, contentType, 1, episodeTitleInput, episodeSummary) : null;
  const primaryCharacter = characterName
    ? {
        id: "main",
        name: characterName,
        role: characterRole || "상대 주인공",
        persona: characterPersona,
        personality: "",
        relationship: "",
        speakingStyle: characterSpeakingStyle,
        visualPrompt: "",
        avatarUrl: null,
        tags: [],
        isPrimary: true,
        chatEnabled: true,
        reusable: true,
      }
    : null;
  const insert = normalizeStoryInsert({
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : newId("story"),
    user_id: staff.userId,
    title: safeTitle,
    logline: (logline || storyOverview) ? (logline || storyOverview).slice(0, 180) : null,
    cover_url: coverUrl,
    body_text: sourceText,
    beats: [],
    asset_slots: [],
    character_card: {
      contentType,
      chapters: chapter ? [chapter] : [],
      characters: primaryCharacter ? [primaryCharacter] : [],
      storyOverview: storyOverview ? storyOverview.slice(0, 280) : "",
      authorName,
      preview: previewUrl ? { url: previewUrl, type: previewType } : null,
      name: primaryCharacter?.name,
      role: primaryCharacter?.role,
      persona: primaryCharacter?.persona,
      notes: primaryCharacter?.persona,
      speakingStyle: primaryCharacter?.speakingStyle,
    },
    status: "draft",
    is_public: false,
    is_listed: false,
    price_credits: priceCredits,
    audience,
    max_heat: maxHeat,
    tags,
    compose_step: "body",
    source_prompt: "admin create",
    created_at: now,
    updated_at: now,
  });

  const { data, error } = await supabaseAdmin
    .from("user_stories")
    .insert(insert as any)
    .select("id")
    .single();
  if (error) return jsonServerError(error, 500);

  return Response.json({ ok: true, id: data.id });
}

async function patchStory(request: Request, payload?: Record<string, any>) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const body = payload ?? ((await request.json().catch(() => ({}))) as Record<string, any>);
  const id = String(body.id ?? "").trim();
  if (!id) return jsonError("missing_id");

  const patch: UserStoryUpdate = {};
  if (body.title !== undefined) {
    const title = String(body.title ?? "").trim();
    if (!title) return jsonError("missing_title");
    patch.title = title;
  }
  if (body.logline !== undefined) patch.logline = body.logline === null ? null : String(body.logline);
  if (body.cover_url !== undefined) patch.cover_url = body.cover_url ? String(body.cover_url) : null;
  if (body.price_credits !== undefined) patch.price_credits = Math.max(0, Math.floor(Number(body.price_credits) || 0));
  if (body.audience !== undefined) patch.audience = String(body.audience || "all");
  if (body.max_heat !== undefined) patch.max_heat = String(body.max_heat || "warm");
  if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
  if (body.body_text !== undefined) patch.body_text = body.body_text === null ? null : String(body.body_text);
  if (body.source_prompt !== undefined) patch.source_prompt = String(body.source_prompt || "admin update");
  if (body.asset_slots !== undefined) patch.asset_slots = body.asset_slots;
  if (body.character_card !== undefined) patch.character_card = body.character_card;
  if (body.beats !== undefined) patch.beats = body.beats;
  if (body.status !== undefined) patch.status = String(body.status || "draft");
  if (body.is_public !== undefined) patch.is_public = Boolean(body.is_public);
  if (body.is_listed !== undefined) patch.is_listed = Boolean(body.is_listed);
  if (body.is_public !== undefined || body.is_listed !== undefined) {
    const publishing = Boolean(body.is_public) && Boolean(body.is_listed);
    patch.status = publishing ? "published" : "draft";
  }

  const needsChapterPatch = body.first_chapter_is_free !== undefined || body.first_chapter_price !== undefined;
  const needsSnapshot = typeof body.snapshotNote === "string" && body.snapshotNote.trim();
  if (needsChapterPatch || needsSnapshot) {
    const { data: current, error: readError } = await supabaseAdmin
      .from("user_stories")
      .select("title,character_card,beats")
      .eq("id", id)
      .maybeSingle();
    if (readError) return jsonServerError(readError, 500);
    if (!current) return jsonError("story_not_found", 404);

    if (needsSnapshot) {
      const { error: snapshotError } = await supabaseAdmin.from("story_versions").insert({
        story_id: id,
        title: current.title,
        character_card: current.character_card,
        beats: current.beats,
        note: String(body.snapshotNote).trim(),
        created_by: staff.userId,
      });
      if (snapshotError) return jsonServerError(snapshotError, 500);
    }

    const card = recordOf(current.character_card);
    const chapters = Array.isArray(card.chapters) ? [...card.chapters] : [];
    if (chapters[0]) {
      chapters[0] = { ...chapters[0] };
      if (body.first_chapter_is_free !== undefined) chapters[0].isFree = Boolean(body.first_chapter_is_free);
      if (body.first_chapter_price !== undefined) chapters[0].priceCredits = Math.max(0, Math.floor(Number(body.first_chapter_price) || 0));
      patch.character_card = { ...card, chapters } as any;
    }
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("user_stories")
    .update(patch as any)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return jsonServerError(error, 500);
  return Response.json({ ok: true, row: toAdminStoryRow(data), story: data });
}

async function deleteStory(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;
  if (!staff.isAdmin) return jsonError("admin_only", 403);

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  if (!id) return jsonError("missing_id");

  const { error } = await supabaseAdmin.from("user_stories").delete().eq("id", id);
  if (error) return jsonServerError(error, 500);
  return Response.json({ ok: true });
}

async function bulkStatus(request: Request, body: BulkStatusPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string" && id.trim()) : [];
  if (!ids.length) return jsonError("missing_ids");

  const now = new Date().toISOString();
  const patch: UserStoryUpdate = { updated_at: now };
  if (body.statusAction === "publish") {
    patch.is_public = true;
    patch.is_listed = true;
    patch.status = "published";
  } else if (body.statusAction === "unlist") {
    patch.is_listed = false;
    patch.status = "draft";
  } else if (body.statusAction === "private") {
    patch.is_public = false;
    patch.is_listed = false;
    patch.status = "draft";
  } else {
    return jsonError("invalid_action");
  }

  const { data, error } = await supabaseAdmin.from("user_stories").update(patch).in("id", ids).select("id");
  if (error) return jsonServerError(error, 500);
  return Response.json({ ok: true, updated: data?.length ?? 0 });
}

async function bulkDelete(request: Request, body: BulkStatusPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;
  if (!staff.isAdmin) return jsonError("admin_only", 403);

  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string" && id.trim()) : [];
  if (!ids.length) return jsonError("missing_ids");

  const { error: placementError } = await supabaseAdmin.from("home_placements").delete().in("story_id", ids);
  if (placementError) return jsonServerError(placementError, 500);

  const { error: deleteError } = await supabaseAdmin.from("user_stories").delete().in("id", ids);
  if (deleteError) return jsonServerError(deleteError, 500);

  return Response.json({ ok: true, deleted: ids.length });
}

async function setPlacement(request: Request, body: SetPlacementPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const id = String(body.id ?? "").trim();
  if (!id) return jsonError("missing_id");

  const slots = Array.isArray(body.slots)
    ? body.slots.filter((slot): slot is HomeSlot => Boolean(slot))
    : [];
  const normalizedSlots = [...new Set(slots)];
  const placementSlots = normalizedSlots.filter((slot) => slot !== "all");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("home_placements")
    .select("id,slot")
    .eq("story_id", id);
  if (existingError) return jsonServerError(existingError, 500);

  const existingRows = existing ?? [];
  const keep = new Set(placementSlots);
  const toDelete = existingRows.filter((row) => !keep.has(row.slot)).map((row) => row.id);
  if (toDelete.length) {
    const { error: deleteError } = await supabaseAdmin.from("home_placements").delete().in("id", toDelete);
    if (deleteError) return jsonServerError(deleteError, 500);
  }

  if (!normalizedSlots.length) return Response.json({ ok: true });

  const sortOrder = Math.max(0, Math.floor(Number(body.sort_order) || 0));
  const now = new Date().toISOString();
  const existingBySlot = new Map<HomeSlot, string>();
  const duplicateIds: string[] = [];

  for (const row of existingRows) {
    if (!keep.has(row.slot)) continue;
    if (existingBySlot.has(row.slot)) duplicateIds.push(row.id);
    else existingBySlot.set(row.slot, row.id);
  }

  if (duplicateIds.length) {
    const { error: duplicateDeleteError } = await supabaseAdmin
      .from("home_placements")
      .delete()
      .in("id", duplicateIds);
    if (duplicateDeleteError) return jsonServerError(duplicateDeleteError, 500);
  }

  for (const slot of placementSlots) {
    const existingId = existingBySlot.get(slot);
    if (existingId) {
      const { error: updateError } = await supabaseAdmin
        .from("home_placements")
        .update({
          sort_order: sortOrder,
          is_active: true,
          created_by: staff.userId,
          updated_at: now,
        })
        .eq("id", existingId);
      if (updateError) return jsonServerError(updateError, 500);
    } else {
      const { error: insertError } = await supabaseAdmin.from("home_placements").insert({
        story_id: id,
        slot,
        sort_order: sortOrder,
        is_active: true,
        created_by: staff.userId,
      });
      if (insertError) return jsonServerError(insertError, 500);
    }
  }

  const { error: publishError } = await supabaseAdmin
    .from("user_stories")
    .update({
      status: "published",
      is_public: true,
      is_listed: true,
      updated_at: now,
    })
    .eq("id", id);
  if (publishError) return jsonServerError(publishError, 500);

  return Response.json({ ok: true });
}

async function restoreVersion(request: Request, body: RestoreVersionPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const versionId = String(body.versionId ?? "").trim();
  if (!versionId) return jsonError("missing_version_id");

  const { data: version, error: versionError } = await supabaseAdmin
    .from("story_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (versionError) return jsonServerError(versionError, 500);
  if (!version) return jsonError("version_not_found", 404);

  const { data, error } = await supabaseAdmin
    .from("user_stories")
    .update({
      title: version.title,
      character_card: version.character_card,
      beats: version.beats,
      updated_at: new Date().toISOString(),
    })
    .eq("id", version.story_id)
    .select("*")
    .single();
  if (error) return jsonServerError(error, 500);
  return Response.json({ ok: true, story: data });
}

export const Route = createFileRoute("/api/admin/stories")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const mode = url.searchParams.get("mode");
          if (mode === "versions") return await listVersions(request);
          if (mode === "placement") return await getPlacement(request);
          if (url.searchParams.get("id")) return await getStory(request);
          return await listStories(request);
        } catch (error) {
          console.error("[api/admin/stories] GET failed", error);
          return jsonServerError(error, 500);
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as
            | Partial<CreateStoryPayload>
            | BulkStatusPayload
            | SetPlacementPayload
            | RestoreVersionPayload;
          if (body.action === "bulk_status") return await bulkStatus(request, body);
          if (body.action === "bulk_delete") return await bulkDelete(request, body);
          if (body.action === "set_home_placement") return await setPlacement(request, body);
          if (body.action === "restore_version") return await restoreVersion(request, body);
          return await createOrAppendStory(request, body as Partial<CreateStoryPayload>);
        } catch (error) {
          console.error("[api/admin/stories] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
      PATCH: async ({ request }) => {
        try {
          return await patchStory(request);
        } catch (error) {
          console.error("[api/admin/stories] PATCH failed", error);
          return jsonServerError(error, 500);
        }
      },
      DELETE: async ({ request }) => {
        try {
          return await deleteStory(request);
        } catch (error) {
          console.error("[api/admin/stories] DELETE failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
