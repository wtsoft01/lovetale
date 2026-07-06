import { supabase } from "@/integrations/supabase/client";
import { createServerFn } from "@/lib/_mock/runtime";
import type { AssetSlot } from "@/lib/admin-stories-compose.functions";

type ApiOk<T> = { ok: true } & T;

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Unauthorized");
  return token;
}

async function storyAiApi<T>(payload: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch("/api/admin/story-ai", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text().catch(() => "");
  let parsed: any = null;
  if (contentType.includes("application/json") && raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const reason =
      parsed?.message ||
      parsed?.reason ||
      raw.slice(0, 220).replace(/\s+/g, " ").trim() ||
      res.statusText ||
      "unknown_error";
    throw new Error(`Story AI API failed (${res.status}): ${reason}`);
  }

  return (parsed ?? {}) as T;
}

export const translateStoryChapterToVietnamese = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { storyId: string; chapterId: string })
  .handler(async ({ data }) => {
    return storyAiApi<ApiOk<{ translatedText: string; chunks: number; providerLabels: string[]; tokensUsed: number }>>({
      action: "translate",
      storyId: data.storyId,
      chapterId: data.chapterId,
    });
  });

export const suggestStoryAssetSlots = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { storyId: string; chapterId: string; desiredCount?: number })
  .handler(async ({ data }) => {
    return storyAiApi<ApiOk<{ slots: AssetSlot[]; providerLabel?: string; tokensUsed?: number }>>({
      action: "suggest_slots",
      storyId: data.storyId,
      chapterId: data.chapterId,
      desiredCount: data.desiredCount ?? 5,
    });
  });

export const generateStoryAsset = createServerFn({ method: "POST" })
  .inputValidator(
    (i: unknown) =>
      i as {
        storyId: string;
        chapterId: string;
        kind: "image" | "video";
        prompt: string;
        offset: number;
        heatTier?: string;
      },
  )
  .handler(async ({ data }) => {
    return storyAiApi<ApiOk<{ slot: AssetSlot; generated: boolean; providerLabel: string; model: string; warning?: string }>>({
      action: "generate_asset",
      storyId: data.storyId,
      chapterId: data.chapterId,
      kind: data.kind,
      prompt: data.prompt,
      offset: data.offset,
      heatTier: data.heatTier,
    });
  });

export const analyzeStoryCharacters = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { storyId: string; chapterId: string })
  .handler(async ({ data }) => {
    return storyAiApi<
      ApiOk<{
        characterAnalysis: Array<Record<string, unknown>>;
        characters: Array<Record<string, unknown>>;
        providerLabel?: string;
        model?: string;
        tokensUsed?: number;
      }>
    >({
      action: "analyze_characters",
      storyId: data.storyId,
      chapterId: data.chapterId,
    });
  });

export const generateSingleStoryCharacter = createServerFn({ method: "POST" })
  .inputValidator(
    (i: unknown) =>
      i as {
        storyId: string;
        chapterId: string;
        existingCharacters?: Array<{ name?: string; id?: string }>;
      },
  )
  .handler(async ({ data }) => {
    return storyAiApi<
      ApiOk<{
        character: Record<string, unknown> | null;
        characterAnalysis?: Record<string, unknown> | null;
        reason?: string;
        providerLabel?: string;
        model?: string;
        tokensUsed?: number;
      }>
    >({
      action: "generate_single_character",
      storyId: data.storyId,
      chapterId: data.chapterId,
      existingCharacters: data.existingCharacters ?? [],
    });
  });

export const generateStoryRpgScenario = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { storyId: string; maxScenes?: number })
  .handler(async ({ data }) => {
    return storyAiApi<
      ApiOk<{
        storyId: string;
        title: string;
        chapters: number;
        scenes: number;
        endingsTotal: number;
        providerLabel: string;
        model: string;
        tokensUsed: number;
      }>
    >({
      action: "story_rpg_generate",
      storyId: data.storyId,
      maxScenes: data.maxScenes ?? 24,
    });
  });
