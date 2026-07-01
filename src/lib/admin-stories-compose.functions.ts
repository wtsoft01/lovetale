import { createServerFn } from "@/lib/_mock/runtime";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type HeatPreset = "soft" | "warm" | "spicy" | "steamy";
export type AssetTier = HeatPreset | "premium";
export type ContentType = "web_novel" | "romance_sim" | "webtoon" | "short_story" | "other";

export type AssetSlot = {
  id: string;
  offset: number;
  segment_index?: number | null;
  scene_description: string;
  heat_tier: AssetTier;
  media_asset_id: string | null;
  media_url: string | null;
  media_type: "image" | "video" | null;
  caption: string | null;
  source: "ai" | "manual";
};

export type ChapterConfig = {
  id: string;
  title: string;
  episodeNumber: number;
  isFree: boolean;
  priceCredits: number;
  summary: string;
  body: string;
  assetSlots: AssetSlot[];
};

export type CharacterConfig = {
  id: string;
  name: string;
  role: string;
  persona: string;
  visualPrompt: string;
  speakingStyle: string;
  avatarUrl: string | null;
};

export type StoryEnvironment = {
  initialAffection: number;
  chatTone: string;
};

export const CHAPTER_SEPARATOR = "\n\n---- 다음 회차 ----\n\n";

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

type StoryRow = Database["public"]["Tables"]["user_stories"]["Row"];
type StoryInsert = Database["public"]["Tables"]["user_stories"]["Insert"];
type StoryUpdate = Database["public"]["Tables"]["user_stories"]["Update"];
type AppRole = Database["public"]["Enums"]["app_role"];

async function requireStaff(): Promise<string> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id);
  if (error) throw new Error(error.message);

  const roles = (data ?? []).map((row) => row.role as AppRole);
  if (!roles.includes("admin") && !roles.includes("editor")) throw new Error("Forbidden");
  return authData.user.id;
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user.id;
}

function recordOf(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

async function loadStory(id: string): Promise<StoryRow | null> {
  const { data, error } = await supabase.from("user_stories").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function loadOrCreateDraft(id: string, userId: string): Promise<StoryRow> {
  const existing = await loadStory(id);
  if (existing) return existing;

  const draft: StoryInsert = {
    id,
    user_id: userId,
    title: "Untitled story",
    logline: null,
    source_prompt: "admin compose draft",
    character_card: { contentType: "web_novel", chapters: [], characters: [] },
    beats: [],
    body_text: "",
    asset_slots: [],
    cover_url: null,
    status: "draft",
    is_public: false,
    is_listed: false,
    price_credits: 0,
    audience: "all",
    max_heat: "warm",
    tags: [],
    compose_step: "body",
  };

  const { data, error } = await supabase.from("user_stories").insert(draft).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

async function saveStory(id: string, values: StoryUpdate, userId: string) {
  const { data, error } = await supabase.from("user_stories").update(values).eq("id", id).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;

  const draft: StoryInsert = {
    id,
    user_id: userId,
    title: String(values.title ?? "Untitled story"),
    logline: (values.logline as string | null | undefined) ?? null,
    source_prompt: "admin compose draft",
    character_card: values.character_card ?? {},
    beats: values.beats ?? [],
    body_text: (values.body_text as string | null | undefined) ?? "",
    asset_slots: values.asset_slots ?? [],
    cover_url: (values.cover_url as string | null | undefined) ?? null,
    status: String(values.status ?? "draft"),
    is_public: Boolean(values.is_public ?? false),
    is_listed: Boolean(values.is_listed ?? false),
    price_credits: Number(values.price_credits ?? 0),
    audience: String(values.audience ?? "all"),
    max_heat: String(values.max_heat ?? "warm"),
    tags: (values.tags as string[] | undefined) ?? [],
    compose_step: String(values.compose_step ?? "body"),
  };

  const { error: insertError } = await supabase.from("user_stories").insert(draft);
  if (insertError) throw new Error(insertError.message);
}

export function buildChaptersFromRow(row: any): ChapterConfig[] {
  const card = (row?.character_card ?? {}) as any;
  const raw = Array.isArray(card.chapters) ? card.chapters : [];
  const topBody = (row?.body_text as string | null) ?? "";
  const topSlots = Array.isArray(row?.asset_slots) ? (row.asset_slots as AssetSlot[]) : [];
  if (raw.length) {
    const anyHasBody = raw.some((c: any) => typeof c.body === "string" && c.body.length > 0);
    return raw.map((c: any, i: number) => ({
      id: String(c.id || newId("ch")),
      title: String(c.title || `Episode ${i + 1}`),
      episodeNumber: Number(c.episodeNumber || i + 1),
      isFree: Boolean(c.isFree ?? i === 0),
      priceCredits: Math.max(0, Number(c.priceCredits || 0)),
      summary: String(c.summary || ""),
      body: anyHasBody ? String(c.body || "") : i === 0 ? topBody : "",
      assetSlots: Array.isArray(c.assetSlots)
        ? (c.assetSlots as AssetSlot[])
        : anyHasBody
          ? []
          : i === 0
            ? topSlots
            : [],
    }));
  }
  return [
    {
      id: newId("ch"),
      title: "Episode 1",
      episodeNumber: 1,
      isFree: true,
      priceCredits: 0,
      summary: "",
      body: topBody,
      assetSlots: topSlots,
    },
  ];
}

export function flattenChapters(chapters: ChapterConfig[]) {
  let body = "";
  const slots: AssetSlot[] = [];
  chapters.forEach((c, idx) => {
    if (idx > 0) body += CHAPTER_SEPARATOR;
    const base = body.length;
    for (const s of c.assetSlots) {
      slots.push({ ...s, offset: base + Math.max(0, Math.min(c.body.length, s.offset)) });
    }
    body += c.body;
  });
  return { body, slots };
}

export type ComposeData = {
  id: string;
  title: string;
  logline: string;
  cover_url: string | null;
  price_credits: number;
  max_heat: HeatPreset;
  audience: string;
  tags: string[];
  is_public: boolean;
  is_listed: boolean;
  compose_step: "body" | "assets" | "published";
  chapters: ChapterConfig[];
  character_card: any;
};

export type ChapterEditorData = {
  id: string;
  title: string;
  cover_url: string | null;
  contentType: ContentType;
  activeCharacterName: string;
  chapter: ChapterConfig;
  chapterSummaries: Array<{
    id: string;
    title: string;
    episodeNumber: number;
    summary: string;
    bodyChars: number;
    assetSlotsCount: number;
  }>;
  assetLibrary: Array<{
    key: string;
    url: string;
    type: "image" | "video";
    tier: HeatPreset;
    caption: string | null;
    scene: string;
  }>;
};

export type ChapterTextEditorData = {
  id: string;
  title: string;
  chapter: {
    id: string;
    title: string;
    episodeNumber: number;
    isFree: boolean;
    priceCredits: number;
    summary: string;
    body: string;
    assetSlotsCount: number;
  };
};

export type ChapterTextPatch = {
  id: string;
  title: string;
  episodeNumber: number;
  isFree: boolean;
  priceCredits: number;
  summary: string;
  body: string;
};

export type ChapterTextSummary = {
  id: string;
  title: string;
  episodeNumber: number;
  summary: string;
  isFree: boolean;
  priceCredits: number;
  bodyChars: number;
  assetSlotsCount: number;
};

export const getStoryCompose = createServerFn({ method: "GET" })
  .inputValidator((input: any) => input as { id: string })
  .handler(async ({ data }): Promise<ComposeData> => {
    const userId = await requireStaff();
    const row = await loadOrCreateDraft(data.id, userId);
    return {
      id: row.id,
      title: row.title,
      logline: row.logline ?? "",
      cover_url: row.cover_url,
      price_credits: row.price_credits,
      max_heat: (row.max_heat as HeatPreset) ?? "warm",
      audience: row.audience ?? "all",
      tags: row.tags ?? [],
      is_public: !!row.is_public,
      is_listed: !!row.is_listed,
      compose_step: (row.compose_step as ComposeData["compose_step"]) ?? "body",
      chapters: buildChaptersFromRow(row),
      character_card: recordOf(row.character_card),
    };
  });

export const getStoryChapterEditor = createServerFn({ method: "GET" })
  .inputValidator((input: any) => input as { id: string; chapterId: string })
  .handler(async ({ data }): Promise<ChapterEditorData> => {
    await requireStaff();
    const row = await loadStory(data.id);
    if (!row) throw new Error("Story not found");

    const card = recordOf(row.character_card);
    const chapters = buildChaptersFromRow(row);
    const chapter = chapters.find((item) => item.id === data.chapterId);
    if (!chapter) throw new Error("Chapter not found");

    const assetLibrary: ChapterEditorData["assetLibrary"] = [];
    const seen = new Set<string>();
    for (const item of chapters) {
      for (const slot of item.assetSlots) {
        if (!slot.media_url || !slot.media_type || seen.has(slot.media_url)) continue;
        seen.add(slot.media_url);
        assetLibrary.push({
          key: slot.id,
          url: slot.media_url,
          type: slot.media_type,
          tier: slot.heat_tier,
          caption: slot.caption,
          scene: slot.scene_description ?? "",
        });
      }
    }

    return {
      id: row.id,
      title: row.title,
      cover_url: row.cover_url,
      contentType: (card.contentType as ContentType) ?? "web_novel",
      activeCharacterName: String(card.name || card.characters?.[0]?.name || "주인공"),
      chapter,
      chapterSummaries: chapters.map((item) => ({
        id: item.id,
        title: item.title,
        episodeNumber: item.episodeNumber,
        summary: item.summary,
        bodyChars: item.body.length,
        assetSlotsCount: item.assetSlots.length,
      })),
      assetLibrary,
    };
  });

export const getStoryChapterText = createServerFn({ method: "GET" })
  .inputValidator((input: any) => input as { id: string; chapterId: string })
  .handler(async ({ data }): Promise<ChapterTextEditorData> => {
    await requireStaff();
    const row = await loadStory(data.id);
    if (!row) throw new Error("Story not found");

    const chapter = buildChaptersFromRow(row).find((item) => item.id === data.chapterId);
    if (!chapter) throw new Error("Chapter not found");

    return {
      id: row.id,
      title: row.title,
      chapter: {
        id: chapter.id,
        title: chapter.title,
        episodeNumber: chapter.episodeNumber,
        isFree: chapter.isFree,
        priceCredits: chapter.priceCredits,
        summary: chapter.summary,
        body: chapter.body,
        assetSlotsCount: chapter.assetSlots.length,
      },
    };
  });

export type ProductInput = {
  id: string;
  title: string;
  contentType: ContentType;
  logline?: string | null;
  storyOverview: string;
  chapters: ChapterConfig[];
  characters: CharacterConfig[];
  environment: StoryEnvironment;
  coverUrl?: string | null;
  priceCredits: number;
  maxHeat: HeatPreset;
  audience: "all" | "female" | "male";
  tags: string[];
  isPublic: boolean;
  isListed: boolean;
};

export const saveStoryProduct = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as ProductInput)
  .handler(async ({ data }) => {
    const userId = await requireStaff();
    const { body: flatBody, slots: flatSlots } = flattenChapters(data.chapters);
    const main = data.characters[0];
    const isPublished = data.isPublic && data.isListed;
    await saveStory(
      data.id,
      {
        title: data.title,
        logline: data.logline ?? null,
        body_text: flatBody,
        asset_slots: flatSlots as any,
        cover_url: data.coverUrl ?? null,
        price_credits: Math.max(0, Math.floor(data.priceCredits || 0)),
        max_heat: data.maxHeat,
        audience: data.audience,
        tags: data.tags.slice(0, 12),
        is_public: data.isPublic,
        is_listed: data.isListed,
        status: isPublished ? "published" : "draft",
        compose_step: isPublished ? "published" : flatSlots.length ? "assets" : "body",
        character_card: {
        contentType: data.contentType,
        storyOverview: data.storyOverview,
        chapters: data.chapters,
        characters: data.characters,
        environment: data.environment,
        name: main?.name,
        role: main?.role,
        persona: main?.persona,
        notes: main?.persona,
        visualPrompt: main?.visualPrompt,
        appearance: main?.visualPrompt,
        speakingStyle: main?.speakingStyle ?? "",
        avatarUrl: main?.avatarUrl ?? null,
        } as any,
        updated_at: new Date().toISOString(),
      },
      userId,
    );
    return { ok: true };
  });

export const saveStoryChapterEditor = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { id: string; chapter: ChapterConfig })
  .handler(async ({ data }) => {
    const userId = await requireStaff();
    const row = await loadStory(data.id);
    if (!row) throw new Error("Story not found");

    const card = recordOf(row.character_card);
    const chapters = buildChaptersFromRow(row);
    const index = chapters.findIndex((item) => item.id === data.chapter.id);
    if (index < 0) throw new Error("Chapter not found");

    const nextChapters = chapters.map((item, itemIndex) =>
      itemIndex === index
        ? {
            ...item,
            ...data.chapter,
            episodeNumber: Math.max(1, Number(data.chapter.episodeNumber) || item.episodeNumber),
            priceCredits: Math.max(0, Number(data.chapter.priceCredits) || 0),
            body: String(data.chapter.body ?? ""),
            assetSlots: Array.isArray(data.chapter.assetSlots) ? data.chapter.assetSlots : [],
          }
        : item,
    );
    const { body: flatBody, slots: flatSlots } = flattenChapters(nextChapters);

    await saveStory(
      data.id,
      {
        body_text: flatBody,
        asset_slots: flatSlots as any,
        character_card: {
          ...card,
          chapters: nextChapters,
        } as any,
        compose_step: flatSlots.length ? "assets" : "body",
        updated_at: new Date().toISOString(),
      },
      userId,
    );
    return { ok: true };
  });

export const saveStoryChapterText = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { id: string; chapter: ChapterTextPatch })
  .handler(async ({ data }) => {
    const userId = await requireStaff();
    const row = await loadStory(data.id);
    if (!row) throw new Error("Story not found");

    const card = recordOf(row.character_card);
    const chapters = buildChaptersFromRow(row);
    const index = chapters.findIndex((item) => item.id === data.chapter.id);
    if (index < 0) throw new Error("Chapter not found");

    const nextChapters = chapters.map((item, itemIndex) =>
      itemIndex === index
        ? {
            ...item,
            title: String(data.chapter.title ?? "").trim() || item.title,
            episodeNumber: Math.max(1, Math.floor(Number(data.chapter.episodeNumber) || item.episodeNumber)),
            isFree: Boolean(data.chapter.isFree),
            priceCredits: Math.max(0, Math.floor(Number(data.chapter.priceCredits) || 0)),
            summary: String(data.chapter.summary ?? ""),
            body: String(data.chapter.body ?? ""),
            assetSlots: item.assetSlots,
          }
        : item,
    );
    const { body: flatBody, slots: flatSlots } = flattenChapters(nextChapters);

    await saveStory(
      data.id,
      {
        body_text: flatBody,
        asset_slots: flatSlots as any,
        character_card: {
          ...card,
          chapters: nextChapters,
        } as any,
        compose_step: flatSlots.length ? "assets" : "body",
        updated_at: new Date().toISOString(),
      },
      userId,
    );
    return { ok: true };
  });

export const createStoryChapterText = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { id: string })
  .handler(async ({ data }): Promise<{ ok: true; chapter: ChapterTextSummary }> => {
    const userId = await requireStaff();
    const row = await loadStory(data.id);
    if (!row) throw new Error("Story not found");

    const card = recordOf(row.character_card);
    const chapters = buildChaptersFromRow(row);
    const nextEpisode =
      chapters.reduce((max, item) => Math.max(max, Math.floor(Number(item.episodeNumber) || 0)), 0) + 1;
    const chapter: ChapterConfig = {
      id: newId("ch"),
      title: `${nextEpisode}화`,
      episodeNumber: nextEpisode,
      isFree: false,
      priceCredits: 0,
      summary: "",
      body: "",
      assetSlots: [],
    };
    const nextChapters = [...chapters, chapter];
    const { body: flatBody, slots: flatSlots } = flattenChapters(nextChapters);

    await saveStory(
      data.id,
      {
        body_text: flatBody,
        asset_slots: flatSlots as any,
        character_card: {
          ...card,
          chapters: nextChapters,
        } as any,
        compose_step: flatSlots.length ? "assets" : "body",
        updated_at: new Date().toISOString(),
      },
      userId,
    );

    return {
      ok: true,
      chapter: {
        id: chapter.id,
        title: chapter.title,
        episodeNumber: chapter.episodeNumber,
        summary: chapter.summary,
        isFree: chapter.isFree,
        priceCredits: chapter.priceCredits,
        bodyChars: 0,
        assetSlotsCount: 0,
      },
    };
  });

export const saveStoryBody = createServerFn({ method: "POST" })
  .inputValidator(
    (input: any) =>
      input as {
        id: string;
        title: string;
        logline?: string | null;
        body_text: string;
        character_summary?: string;
      },
  )
  .handler(async ({ data }) => {
    const userId = await requireStaff();
    const row = await loadOrCreateDraft(data.id, userId);
    const card = recordOf(row.character_card);
    await saveStory(
      data.id,
      {
        title: data.title,
        logline: data.logline ?? null,
        body_text: data.body_text,
        compose_step: "assets",
        character_card:
          data.character_summary !== undefined ? ({ ...card, notes: data.character_summary } as any) : row.character_card,
        updated_at: new Date().toISOString(),
      },
      userId,
    );
    return { ok: true };
  });

export const saveStorySlots = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { id: string; asset_slots: AssetSlot[] })
  .handler(async ({ data }) => {
    const userId = await requireStaff();
    await saveStory(
      data.id,
      {
        asset_slots: data.asset_slots as any,
        compose_step: data.asset_slots.length ? "assets" : "body",
        updated_at: new Date().toISOString(),
      },
      userId,
    );
    return { ok: true };
  });

export const publishStoryUnified = createServerFn({ method: "POST" })
  .inputValidator(
    (input: any) =>
      input as {
        id: string;
        price_credits: number;
        max_heat: HeatPreset;
        audience?: "all" | "female" | "male";
        tags?: string[];
        cover_url?: string | null;
      },
  )
  .handler(async ({ data }) => {
    const userId = await requireStaff();
    await saveStory(
      data.id,
      {
        price_credits: Math.max(0, Math.floor(data.price_credits || 0)),
        max_heat: data.max_heat,
        audience: data.audience ?? "all",
        tags: data.tags,
        is_public: true,
        is_listed: true,
        status: "published",
        compose_step: "published",
        ...(data.cover_url !== undefined ? { cover_url: data.cover_url } : {}),
        updated_at: new Date().toISOString(),
      },
      userId,
    );
    return { ok: true };
  });

export const analyzeStoryProduct = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { id: string })
  .handler(async (): Promise<{ storyOverview: string; chapters: ChapterConfig[]; characters: CharacterConfig[] }> => {
    throw new Error("데모 모드에서는 AI 분석이 비활성화되어 있습니다.");
  });

export const unpublishStoryUnified = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { id: string })
  .handler(async ({ data }) => {
    const userId = await requireStaff();
    await saveStory(
      data.id,
      {
        is_public: false,
        is_listed: false,
        status: "draft",
        compose_step: "assets",
        updated_at: new Date().toISOString(),
      },
      userId,
    );
    return { ok: true };
  });

const legacySuggestAssetSlots = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { id: string; desiredCount?: number })
  .handler(async (): Promise<{ slots: AssetSlot[] }> => {
    throw new Error("데모 모드에서는 AI 에셋 제안을 사용할 수 없습니다.");
  });

export const suggestAssetSlots = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { id: string; desiredCount?: number })
  .handler(async ({ data }): Promise<{ slots: AssetSlot[] }> => {
    await requireStaff();
    const row = await loadStory(data.id);
    if (!row) throw new Error("Story not found");

    const body = row.body_text ?? "";
    if (body.trim().length < 120) return { slots: [] };

    const desiredCount = Math.max(1, Math.min(12, data.desiredCount ?? 5));
    const fallbackTiers: AssetTier[] = ["soft", "warm", "spicy", "steamy", "premium"];

    try {
      const { generateText } = await import("ai");
      const { runWithAdminRotation } = await import("./admin-ai-provider.server");
      const text = await runWithAdminRotation("asset_slot_recommendation", async (binding) => {
        const result = await generateText({
          model: binding.provider(binding.defaultModel),
          temperature: 0.35,
          maxTokens: 900,
          system:
            "You are a compact Korean story-editor. Return ONLY valid JSON. No markdown, no commentary.",
          prompt: [
            `Return an array of up to ${desiredCount} objects.`,
            "Each object must include: offset (integer char index), heat_tier (soft|warm|spicy|steamy|premium), scene_description (Korean sentence), caption (short optional Korean caption).",
            "Use offsets that are spread across the body text and avoid placing multiple items at the same exact offset.",
            "If the text is too short, return a smaller array.",
            "",
            `TITLE: ${row.title}`,
            `LOG_LINE: ${row.logline ?? ""}`,
            `MAX_HEAT: ${String(row.max_heat ?? "warm")}`,
            "",
            body.slice(0, 16000),
          ].join("\n"),
        });
        return { value: result.text.trim(), tokens: result.usage?.totalTokens ?? 0 };
      });

      const parsed = JSON.parse(text) as Array<Record<string, any>>;
      const slots = (Array.isArray(parsed) ? parsed : [])
        .slice(0, desiredCount)
        .map((item, index) => {
          const offset = Math.max(0, Math.min(body.length - 1, Math.floor(Number(item.offset) || 0)));
          const tierRaw = String(item.heat_tier ?? fallbackTiers[index % fallbackTiers.length]);
          const tier = (fallbackTiers.includes(tierRaw as AssetTier) ? tierRaw : fallbackTiers[index % fallbackTiers.length]) as AssetTier;
          const scene = String(item.scene_description ?? "").trim();
          return {
            id: newId("slot"),
            offset,
            scene_description: scene || "추천 장면",
            heat_tier: tier,
            media_asset_id: null,
            media_url: null,
            media_type: "image",
            caption: String(item.caption ?? "").trim() || null,
            source: "ai",
          } satisfies AssetSlot;
        })
        .sort((a, b) => a.offset - b.offset);
      if (slots.length) return { slots };
    } catch {
      // fall back to heuristic positions below
    }

    const step = Math.max(250, Math.floor(body.length / (desiredCount + 1)));
    const slots: AssetSlot[] = Array.from({ length: desiredCount }, (_, index) => {
      const offset = Math.min(body.length - 1, step * (index + 1));
      const scene = body
        .slice(Math.max(0, offset - 90), Math.min(body.length, offset + 180))
        .replace(/\s+/g, " ")
        .trim();
      return {
        id: newId("slot"),
        offset,
        scene_description: scene || "추천 장면",
        heat_tier: fallbackTiers[index % fallbackTiers.length],
        media_asset_id: null,
        media_url: null,
        media_type: "image",
        caption: null,
        source: "ai",
      };
    });
    return { slots };
  });

function splitTextForTranslation(text: string, maxChars = 7000): string[] {
  const source = text.trim();
  if (!source) return [];
  const parts = source.split(/(\n{2,})/);
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    if (!part) continue;
    if ((current + part).length <= maxChars) {
      current += part;
      continue;
    }
    if (current.trim()) chunks.push(current.trim());
    if (part.length <= maxChars) {
      current = part;
      continue;
    }
    for (let index = 0; index < part.length; index += maxChars) {
      chunks.push(part.slice(index, index + maxChars));
    }
    current = "";
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export const translateChapterBodyToVietnamese = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { id: string; chapterId: string })
  .handler(async ({ data }): Promise<{ translatedText: string; chunks: number; providerLabels: string[]; tokensUsed: number }> => {
    await requireStaff();
    const row = await loadStory(data.id);
    if (!row) throw new Error("스토리를 찾을 수 없습니다.");

    const chapters = buildChaptersFromRow(row);
    const chapter = chapters.find((item) => item.id === data.chapterId) ?? chapters[0];
    if (!chapter) throw new Error("번역할 회차를 찾을 수 없습니다.");

    const body = String(chapter.body ?? "").trim();
    if (!body) throw new Error("번역할 본문이 없습니다.");

    const chunks = splitTextForTranslation(body);
    if (!chunks.length) throw new Error("번역할 본문이 없습니다.");

    const { chatWithRotation } = await import("./llm-router.server");
    const translated: string[] = [];
    const providers = new Set<string>();
    let tokensUsed = 0;

    for (let index = 0; index < chunks.length; index += 1) {
      const result = await chatWithRotation({
        purpose: "translation",
        temperature: 0.15,
        maxTokens: 8192,
        messages: [
          {
            role: "system",
            content: [
              "You are a professional Korean-to-Vietnamese localization editor for story production.",
              "Translate Korean prose into natural Vietnamese for internal asset editors.",
              "Preserve paragraph breaks, scene flow, names, quoted dialogue, and emotional nuance.",
              "Return only the Vietnamese translation. Do not add notes, labels, markdown, or commentary.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `Chunk ${index + 1} of ${chunks.length}.`,
              "Translate the following Korean story text into Vietnamese:",
              "",
              chunks[index],
            ].join("\n"),
          },
        ],
      });
      translated.push(result.text.trim());
      providers.add(result.providerLabel);
      tokensUsed += result.tokensUsed;
    }

    return {
      translatedText: translated.join("\n\n"),
      chunks: chunks.length,
      providerLabels: [...providers],
      tokensUsed,
    };
  });

export type UnifiedReaderStory = {
  id: string;
  title: string;
  logline: string | null;
  cover_url: string | null;
  body_text: string;
  asset_slots: AssetSlot[];
  character_card: any;
  beats?: any[];
  audience: string;
  max_heat: HeatPreset;
  user_id: string;
};

export const getUnifiedReaderStory = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { id: string })
  .handler(async ({ data }): Promise<UnifiedReaderStory> => {
    await requireUserId();
    const { data: story, error } = await supabase.rpc("get_playable_user_story", { _id: data.id });
    if (error) throw new Error(error.message);
    if (!story) throw new Error("Not found");

    return {
      id: story.id,
      title: story.title,
      logline: story.logline,
      cover_url: story.cover_url,
      body_text: story.body_text ?? "",
      asset_slots: Array.isArray(story.asset_slots) ? (story.asset_slots as AssetSlot[]) : [],
      character_card: recordOf(story.character_card),
      beats: Array.isArray(story.beats) ? story.beats : [],
      audience: story.audience,
      max_heat: story.max_heat as HeatPreset,
      user_id: story.user_id,
    };
  });
