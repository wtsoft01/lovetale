import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { createServerFn } from "@/lib/_mock/runtime";

type UserStory = Database["public"]["Tables"]["user_stories"]["Row"];
type UserStoryInsert = Database["public"]["Tables"]["user_stories"]["Insert"];
type UserStoryUpdate = Database["public"]["Tables"]["user_stories"]["Update"];

export const BUILDER_PRICING = {
  base: 50,
  text: 50,
  imagePerBeat: 10,
  perImageSlot: 10,
} as const;

export type UserStoryRow = Pick<
  UserStory,
  "id" | "title" | "logline" | "cover_url" | "status" | "is_listed" | "price_credits" | "updated_at"
>;

type GenerateInput = {
  title?: string;
  prompt?: string;
  mode?: string;
  notes?: string;
  targetBeats?: number;
  maxHeat?: string;
};

type UpdateInput = {
  id: string;
  title?: string;
  logline?: string | null;
  character_card?: Json;
  beats?: Json;
  cover_url?: string | null;
  status?: string;
  is_listed?: boolean;
  is_public?: boolean;
  price_credits?: number;
  audience?: string;
  max_heat?: string;
  tags?: string[];
  body_text?: string | null;
  source_prompt?: string;
  asset_slots?: Json;
};

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user.id;
}

function now() {
  return new Date().toISOString();
}

function sanitizeTitle(title: unknown, prompt: string) {
  const value = typeof title === "string" ? title.trim() : "";
  if (value) return value.slice(0, 80);

  const firstLine = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return (firstLine || "Untitled story").slice(0, 80);
}

function clampBeatCount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 8;
  return Math.min(30, Math.max(1, Math.round(n)));
}

function splitPromptIntoBeats(prompt: string, targetBeats: number, maxHeat: string) {
  const paragraphs = prompt
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const source =
    paragraphs.length >= 2
      ? paragraphs
      : prompt
          .split(/(?<=[.!?。！？])\s+|\r?\n/)
          .map((part) => part.trim())
          .filter(Boolean);

  const chunks = source.length > 0 ? source : [prompt.trim()];
  const selected = chunks.slice(0, targetBeats);

  while (selected.length < targetBeats && selected.length < chunks.length) {
    selected.push(chunks[selected.length]);
  }

  return selected.map((text, index) => {
    const id = index === 0 ? "start" : `beat_${index + 1}`;
    const next = index < selected.length - 1 ? (index === 0 ? "beat_2" : `beat_${index + 2}`) : null;

    return {
      id,
      text,
      narration: text,
      emotion: "calm",
      heatTier: index === selected.length - 1 ? maxHeat : "soft",
      imagePrompt: "",
      choices: next
        ? [
            {
              label: "Continue",
              next,
              affection: 1,
              emotion: "calm",
            },
          ]
        : [],
    };
  });
}

function toRow(story: UserStory): UserStoryRow {
  return {
    id: story.id,
    title: story.title,
    logline: story.logline,
    cover_url: story.cover_url,
    status: story.status,
    is_listed: story.is_listed,
    price_credits: story.price_credits,
    updated_at: story.updated_at,
  };
}

export const generateUserStory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as GenerateInput)
  .handler(async ({ data }): Promise<{ id: string; creditsCharged: number }> => {
    const userId = await requireUserId();
    const prompt = (data.prompt ?? "").trim();
    if (prompt.length < 20) throw new Error("Story text must be at least 20 characters.");

    const maxHeat = typeof data.maxHeat === "string" && data.maxHeat.trim() ? data.maxHeat.trim() : "soft";
    const targetBeats = clampBeatCount(data.targetBeats);
    const title = sanitizeTitle(data.title, prompt);
    const beats = splitPromptIntoBeats(prompt, targetBeats, maxHeat);
    const timestamp = now();

    const insert: UserStoryInsert = {
      user_id: userId,
      title,
      logline: prompt.slice(0, 180),
      cover_url: null,
      body_text: prompt,
      beats: beats as Json,
      asset_slots: [],
      character_card: {
        name: "Main character",
        personality: "",
        appearance: "",
        speakingStyle: "",
        builderMode: data.mode ?? "draft",
        notes: typeof data.notes === "string" ? data.notes : "",
        sourcePrompt: prompt,
      } as Json,
      compose_step: "body",
      audience: "all",
      max_heat: maxHeat,
      source_prompt: prompt,
      status: "draft",
      is_public: false,
      is_listed: false,
      price_credits: 0,
      tags: [],
      model: null,
      created_at: timestamp,
      updated_at: timestamp,
    };

    const { data: created, error } = await supabase.from("user_stories").insert(insert).select("id").single();
    if (error) throw new Error(error.message);

    return { id: created.id, creditsCharged: 0 };
  });

export const listMyUserStories = createServerFn({ method: "GET" }).handler(
  async (): Promise<UserStoryRow[]> => {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("user_stories")
      .select("id,title,logline,cover_url,status,is_listed,price_credits,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((story) => story as UserStoryRow);
  },
);

export const getMyUserStory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ data }): Promise<UserStory> => {
    const userId = await requireUserId();
    const { data: story, error } = await supabase
      .from("user_stories")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!story) throw new Error("Story not found.");
    return story;
  });

export const updateMyUserStory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as UpdateInput)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const patch: UserStoryUpdate = { updated_at: now() };

    for (const key of [
      "title",
      "logline",
      "character_card",
      "beats",
      "cover_url",
      "status",
      "is_listed",
      "is_public",
      "price_credits",
      "audience",
      "max_heat",
      "tags",
      "body_text",
      "source_prompt",
      "asset_slots",
    ] as const) {
      if (data[key] !== undefined) {
        (patch as Record<string, unknown>)[key] = data[key];
      }
    }

    const { error } = await supabase
      .from("user_stories")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const continueStoryWithGemini = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as Record<string, unknown>)
  .handler(async () => {
    throw new Error("AI continuation provider is not configured yet.");
  });

export const generateCharacterAssetPreview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as Record<string, unknown>)
  .handler(async (): Promise<{ url: string; storagePath: string }> => {
    throw new Error("AI image provider is not configured yet.");
  });

export const deleteMyUserStory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { id: string })
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { error } = await supabase.from("user_stories").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
