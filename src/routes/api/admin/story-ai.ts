import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_BASE_URLS, DEFAULT_MODELS } from "@/lib/llm-router.server";
import type { AssetSlot, AssetTier } from "@/lib/admin-stories-compose.functions";

const SUPER_ADMIN_EMAIL = "admin@lovetale.org";
const STAFF_ROLES = ["admin", "editor", "moderator"] as const;
const ASSET_TIERS: AssetTier[] = ["soft", "warm", "spicy", "steamy", "premium"];

type StaffRole = (typeof STAFF_ROLES)[number];

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function requireStaff(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return { error: jsonError("missing_token", 401) as Response, userId: "", email: "" };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { error: jsonError("invalid_token", 401) as Response, userId: "", email: "" };

  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (email === SUPER_ADMIN_EMAIL) {
    await supabaseAdmin.from("user_roles").upsert({ user_id: data.user.id, role: "admin" }, { onConflict: "user_id,role" });
    return { userId: data.user.id, email };
  }

  const { data: rolesData, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (rolesError) return { error: jsonServerError(rolesError, 500), userId: data.user.id, email };

  const roles = (rolesData ?? [])
    .map((row) => row.role as StaffRole)
    .filter((role): role is StaffRole => STAFF_ROLES.includes(role));
  if (!roles.includes("admin") && !roles.includes("editor")) {
    return { error: jsonError("forbidden", 403) as Response, userId: data.user.id, email };
  }
  return { userId: data.user.id, email };
}

function normalizeTier(value: unknown, fallback: AssetTier = "soft"): AssetTier {
  const tier = String(value ?? "");
  return ASSET_TIERS.includes(tier as AssetTier) ? (tier as AssetTier) : fallback;
}

function recordOf(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function buildChaptersFromRow(row: any) {
  const card = recordOf(row?.character_card);
  const raw = Array.isArray(card.chapters) ? card.chapters : [];
  const topBody = String(row?.body_text ?? "");
  const topSlots = Array.isArray(row?.asset_slots) ? (row.asset_slots as AssetSlot[]) : [];
  if (!raw.length) {
    return [
      {
        id: "ch_1",
        title: "Episode 1",
        episodeNumber: 1,
        isFree: true,
        priceCredits: 0,
        summary: "",
        body: topBody,
        assetSlots: topSlots,
        characterAnalysis: [],
      },
    ];
  }
  const anyHasBody = raw.some((chapter: any) => typeof chapter.body === "string" && chapter.body.length > 0);
  return raw.map((chapter: any, index: number) => ({
    id: String(chapter.id || `ch_${index + 1}`),
    title: String(chapter.title || `Episode ${index + 1}`),
    episodeNumber: Number(chapter.episodeNumber || index + 1),
    isFree: Boolean(chapter.isFree ?? index === 0),
    priceCredits: Math.max(0, Number(chapter.priceCredits || 0)),
    summary: String(chapter.summary || ""),
    body: anyHasBody ? String(chapter.body || "") : index === 0 ? topBody : "",
    assetSlots: Array.isArray(chapter.assetSlots)
      ? (chapter.assetSlots as AssetSlot[])
      : anyHasBody
        ? []
        : index === 0
          ? topSlots
          : [],
    characterAnalysis: Array.isArray(chapter.characterAnalysis) ? chapter.characterAnalysis : [],
  }));
}

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
    for (let index = 0; index < part.length; index += maxChars) chunks.push(part.slice(index, index + maxChars));
    current = "";
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function getStoryAndChapter(storyId: string, chapterId?: string) {
  const { data: row, error } = await supabaseAdmin.from("user_stories").select("*").eq("id", storyId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("스토리를 찾을 수 없습니다.");
  const chapters = buildChaptersFromRow(row);
  const chapter = chapters.find((item) => item.id === chapterId) ?? chapters[0];
  if (!chapter) throw new Error("회차를 찾을 수 없습니다.");
  return { row, chapter, chapters };
}

async function translateChapter(body: string) {
  if (!body.trim()) throw new Error("번역할 본문이 없습니다.");
  const chunks = splitTextForTranslation(body);
  if (!chunks.length) throw new Error("번역할 본문이 없습니다.");

  const { chatWithRotation } = await import("@/lib/llm-router.server");
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
          content: [`Chunk ${index + 1} of ${chunks.length}.`, "Translate the following Korean story text into Vietnamese:", "", chunks[index]].join("\n"),
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
}

function parseJsonArray(text: string): Array<Record<string, any>> {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const match = trimmed.match(/\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : trimmed);
}

function parseJsonObject(text: string): Record<string, any> {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : trimmed);
}

function compactText(value: unknown, maxChars = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function safeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeCharacterResult(item: Record<string, any>, index: number) {
  const name = compactText(item.name, 80);
  if (!name) return null;
  const traits = safeArray(item.traits)
    .map((trait) => compactText(trait, 40))
    .filter(Boolean)
    .slice(0, 8);
  return {
    id: compactText(item.id, 120) || `char_${name.replace(/\s+/g, "_")}_${index + 1}`,
    name,
    role: compactText(item.role, 120) || (index === 0 ? "주요 대화 상대" : "등장 인물"),
    persona: compactText(item.persona ?? item.description ?? item.chatGuidance, 900),
    personality: compactText(item.personality, 500) || traits.join(", "),
    relationship: compactText(item.relationship, 500),
    speakingStyle: compactText(item.speakingStyle ?? item.speaking_style, 500),
    visualPrompt: compactText(item.visualPrompt ?? item.visual_prompt ?? item.appearance, 800),
    avatarUrl: typeof item.avatarUrl === "string" ? item.avatarUrl : null,
    tags: safeArray(item.tags)
      .map((tag) => compactText(tag, 32))
      .filter(Boolean)
      .slice(0, 8),
    isPrimary: Boolean(item.isPrimary ?? index === 0),
    chatEnabled: item.chatEnabled !== false,
    reusable: item.reusable !== false,
    emotion: compactText(item.emotion, 160),
    attitude: compactText(item.attitude, 240),
    traits,
    evidence: compactText(item.evidence, 280),
    chatGuidance: compactText(item.chatGuidance, 900),
  };
}

function normalizeNameKey(name: string) {
  return String(name || "").replace(/\s+/g, "").trim().toLowerCase();
}

function mergeAnalyzedCharactersIntoCard(card: Record<string, any>, chapter: any, result: Awaited<ReturnType<typeof analyzeCharactersWithLlm>>) {
  const existing = Array.isArray(card.characters) ? card.characters : [];
  const byName = new Map<string, any>();
  for (const character of existing) {
    const name = compactText(character?.name ?? character?.title, 80);
    if (name) byName.set(normalizeNameKey(name), { ...character, name });
  }

  for (const analyzed of result.characters) {
    const name = compactText(analyzed.name, 80);
    if (!name) continue;
    const key = normalizeNameKey(name);
    const current = byName.get(key) ?? {};
    const matchingInsight =
      result.characterAnalysis.find((item) => normalizeNameKey(String(item.name ?? "")) === key) ?? analyzed;
    const chapterInsights = Array.isArray(current.chapterInsights) ? current.chapterInsights : [];
    const nextInsights = [
      ...chapterInsights.filter((item: any) => item.chapterId !== chapter.id),
      {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        episodeNumber: chapter.episodeNumber,
        emotion: matchingInsight.emotion,
        attitude: matchingInsight.attitude,
        traits: matchingInsight.traits,
        relationship: matchingInsight.relationship,
        evidence: matchingInsight.evidence,
        chatGuidance: matchingInsight.chatGuidance,
      },
    ].slice(-20);

    byName.set(key, {
      ...current,
      ...analyzed,
      id: current.id || analyzed.id || `char_${name.replace(/\s+/g, "_")}`,
      name,
      role: current.role || analyzed.role,
      persona: current.persona || analyzed.persona || analyzed.chatGuidance,
      personality: current.personality || analyzed.personality || safeArray(analyzed.traits).join(", "),
      relationship: current.relationship || analyzed.relationship,
      speakingStyle: current.speakingStyle || analyzed.speakingStyle,
      visualPrompt: current.visualPrompt || analyzed.visualPrompt,
      appearance: current.appearance || current.visualPrompt || analyzed.visualPrompt,
      avatarUrl: current.avatarUrl || analyzed.avatarUrl || null,
      chatEnabled: current.chatEnabled ?? true,
      reusable: current.reusable ?? true,
      chapterInsights: nextInsights,
    });
  }

  const characters = [...byName.values()];
  const primary = characters.find((character) => character.isPrimary) ?? characters[0];
  return {
    ...card,
    characters,
    ...(primary
      ? {
          name: primary.name,
          role: primary.role,
          persona: primary.persona,
          notes: primary.persona || primary.notes,
          personality: primary.personality,
          relationship: primary.relationship,
          speakingStyle: primary.speakingStyle,
          visualPrompt: primary.visualPrompt,
          appearance: primary.appearance || primary.visualPrompt,
          avatarUrl: primary.avatarUrl ?? null,
        }
      : {}),
  };
}

async function analyzeCharactersWithLlm(row: any, chapter: ReturnType<typeof buildChaptersFromRow>[number]) {
  const body = String(chapter.body ?? "").trim();
  if (body.length < 80) return { characterAnalysis: [], characters: [] };
  const card = recordOf(row?.character_card);
  const existingCharacters = Array.isArray(card.characters) ? card.characters : [];
  const { chatWithRotation } = await import("@/lib/llm-router.server");
  const result = await chatWithRotation({
    purpose: "summary",
    temperature: 0.15,
    maxTokens: 2400,
    messages: [
      {
        role: "system",
        content: [
          "You are Lovetale's character continuity analyst.",
          "Read Korean web-novel chapters and extract only important recurring or scene-driving characters.",
          "Return ONLY valid JSON. No markdown. No commentary.",
          "Do not invent characters. If a name is ambiguous, use the most likely in-story character name and explain evidence.",
          "Each character must be usable as an AI chat persona.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "Return JSON object with fields:",
          "characters: array of objects {id,name,role,persona,personality,relationship,speakingStyle,visualPrompt,tags,isPrimary,chatEnabled,reusable,emotion,attitude,traits,evidence,chatGuidance}",
          "characterAnalysis: array of objects {id,name,role,emotion,attitude,traits,relationship,evidence,chatGuidance}",
          "",
          "Rules:",
          "- Analyze the actual chapter text, dialogue labels, honorifics, actions, and relationships.",
          "- persona: stable backstory, desire, emotional wound, relationship to the reader/protagonist.",
          "- speakingStyle: concrete Korean speaking rules, tone, sentence length, honorific/plain speech tendency.",
          "- visualPrompt: concise image generation prompt for an adult manga/webtoon-style portrait; include hair, face, mood, clothes if grounded.",
          "- chatGuidance: how the character should answer the user in this exact episode context.",
          "- Keep output Korean except technical ids.",
          "- Maximum 6 characters. Put the main chat partner first.",
          "",
          `STORY_TITLE: ${row.title ?? ""}`,
          `STORY_LOGLINE: ${row.logline ?? ""}`,
          `STORY_OVERVIEW: ${card.storyOverview ?? ""}`,
          `EXISTING_CHARACTERS_JSON: ${JSON.stringify(existingCharacters).slice(0, 5000)}`,
          `CHAPTER: ${chapter.episodeNumber}화 ${chapter.title}`,
          `CHAPTER_SUMMARY: ${chapter.summary ?? ""}`,
          "",
          "CHAPTER_TEXT:",
          body.slice(0, 26000),
        ].join("\n"),
      },
    ],
  });

  const parsed = parseJsonObject(result.text);
  const characters = safeArray(parsed.characters)
    .map((item, index) => normalizeCharacterResult(recordOf(item), index))
    .filter(Boolean) as Array<Record<string, any>>;
  const characterAnalysis = safeArray(parsed.characterAnalysis)
    .map((item, index) => {
      const source = normalizeCharacterResult(recordOf(item), index);
      if (!source) return null;
      return {
        id: source.id || `char_insight_${chapter.id}_${index}`,
        name: source.name,
        role: source.role,
        emotion: source.emotion,
        attitude: source.attitude,
        traits: source.traits,
        relationship: source.relationship,
        evidence: source.evidence,
        chatGuidance: source.chatGuidance,
      };
    })
    .filter(Boolean) as Array<Record<string, any>>;

  return {
    characterAnalysis: characterAnalysis.length
      ? characterAnalysis
      : characters.map((character, index) => ({
          id: `char_insight_${chapter.id}_${index}`,
          name: character.name,
          role: character.role,
          emotion: character.emotion,
          attitude: character.attitude,
          traits: character.traits,
          relationship: character.relationship,
          evidence: character.evidence,
          chatGuidance: character.chatGuidance,
        })),
    characters,
    providerLabel: result.providerLabel,
    model: result.model,
    tokensUsed: result.tokensUsed,
  };
}

async function suggestSlots(row: any, body: string, desiredCount: number) {
  if (body.trim().length < 80) return { slots: [] as AssetSlot[] };
  const count = Math.max(1, Math.min(12, desiredCount || 5));
  const { chatWithRotation } = await import("@/lib/llm-router.server");

  const result = await chatWithRotation({
    purpose: "asset_recommendation",
    temperature: 0.25,
    maxTokens: 1800,
    messages: [
      {
        role: "system",
        content: "You are a Korean story asset editor. Return ONLY valid JSON array. No markdown.",
      },
      {
        role: "user",
        content: [
          `Return up to ${count} objects for asset insertion.`,
          "Each object: offset integer, heat_tier one of soft|warm|spicy|steamy|premium, scene_description Korean sentence, caption short Korean caption.",
          "Choose offsets that match visual/emotional scene moments and spread them across the body.",
          "",
          `TITLE: ${row.title}`,
          `LOG_LINE: ${row.logline ?? ""}`,
          "",
          body.slice(0, 18000),
        ].join("\n"),
      },
    ],
  });

  const parsed = parseJsonArray(result.text);
  const slots = parsed.slice(0, count).map((item, index) => {
    const offset = Math.max(0, Math.min(body.length, Math.floor(Number(item.offset) || 0)));
    return {
      id: newId("slot"),
      offset,
      scene_description: String(item.scene_description ?? "AI 추천 장면").trim(),
      heat_tier: normalizeTier(item.heat_tier, ASSET_TIERS[index % ASSET_TIERS.length]),
      media_asset_id: null,
      media_url: null,
      media_type: "image",
      caption: String(item.caption ?? "").trim() || null,
      source: "ai",
    } satisfies AssetSlot;
  });

  return { slots, providerLabel: result.providerLabel, tokensUsed: result.tokensUsed };
}

async function ensureStoryMediaBucket() {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  if (listError) throw new Error(listError.message);
  if ((buckets ?? []).some((bucket) => bucket.name === "story-media")) return;
  const { error } = await supabaseAdmin.storage.createBucket("story-media", { public: false });
  if (error) throw new Error(error.message);
}

async function uploadGeneratedFile(options: {
  userId: string;
  storyId: string;
  chapterId: string;
  bytes: Uint8Array;
  mimeType: string;
  kind: "image" | "video";
  prompt: string;
}) {
  await ensureStoryMediaBucket();
  const ext = options.mimeType.includes("png")
    ? "png"
    : options.mimeType.includes("webp")
      ? "webp"
      : options.mimeType.includes("jpeg") || options.mimeType.includes("jpg")
        ? "jpg"
        : options.mimeType.includes("mp4")
          ? "mp4"
          : "bin";
  const storagePath = `assets/${options.storyId}/ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("story-media")
    .upload(storagePath, options.bytes, { upsert: true, contentType: options.mimeType });
  if (error) throw new Error(error.message);

  const hashSource = `${storagePath}:${options.bytes.length}:${options.prompt.slice(0, 80)}`;
  const hash = Buffer.from(hashSource).toString("base64url").slice(0, 48);
  const mediaInsert = await supabaseAdmin.from("media_assets").insert({
    user_id: options.userId,
    story_id: options.storyId,
    chapter_id: options.chapterId,
    asset_type: options.kind,
    storage_path: storagePath,
    file_name: storagePath.split("/").pop() ?? `ai.${ext}`,
    file_size: options.bytes.length,
    mime_type: options.mimeType,
    content_hash: hash,
    tags: ["ai", options.kind],
    status: "ready",
    validation_errors: [],
    metadata: { prompt: options.prompt },
  } as any);
  if (mediaInsert.error) {
    console.warn("media_assets insert failed", mediaInsert.error.message);
  }

  return storagePath;
}

function purposeForKind(kind: "image" | "video") {
  return kind === "video" ? "video_generation" : "image_generation";
}

function defaultAssetModel(provider: string, kind: "image" | "video", configuredModel?: string | null) {
  if (provider === "google") {
    if (kind === "video") return /veo/i.test(configuredModel ?? "") ? configuredModel! : "veo-3.0-fast-generate-001";
    return /imagen|image|banana/i.test(configuredModel ?? "") ? configuredModel! : "imagen-4.0-fast-generate-001";
  }
  if (kind === "image" && provider === "openai") return /image|dall|gpt-image/i.test(configuredModel ?? "") ? configuredModel! : "gpt-image-1";
  return configuredModel || DEFAULT_MODELS[provider] || "gpt-4o-mini";
}

async function generateAsset(request: Request, userId: string, body: Record<string, any>) {
  const kind = body.kind === "video" ? "video" : "image";
  const storyId = String(body.storyId ?? "");
  const chapterId = String(body.chapterId ?? "");
  const prompt = String(body.prompt ?? "").trim();
  const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
  const heatTier = normalizeTier(body.heatTier);
  if (!storyId || !chapterId) throw new Error("storyId/chapterId가 필요합니다.");
  if (!prompt) throw new Error("생성 프롬프트가 필요합니다.");

  const { chapter } = await getStoryAndChapter(storyId, chapterId);
  const { listActiveAdminProviders, recordAdminUsage } = await import("@/lib/admin-ai-provider.server");
  const providers = await listActiveAdminProviders(purposeForKind(kind));
  if (!providers.length) throw new Error("사용 가능한 이미지/영상 생성 API가 없습니다. /admin/llm에서 사용처를 확인하세요.");

  let generatedPath: string | null = null;
  let providerLabel = "";
  let model = "";
  let lastError = "";

  for (const row of providers) {
    providerLabel = row.label;
    model = defaultAssetModel(row.provider, kind, row.model);
    try {
      if (row.provider === "google") {
        const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
        const google = createGoogleGenerativeAI({
          apiKey: row.api_key ?? "",
          baseURL: (row.base_url?.trim() || DEFAULT_BASE_URLS.google).replace(/\/$/, ""),
        });
        if (kind === "image") {
          const { generateImage } = await import("ai");
          const result = await generateImage({
            model: google.image(model as any),
            prompt,
            n: 1,
            aspectRatio: "9:16",
            providerOptions: { google: { personGeneration: "allow_adult", aspectRatio: "9:16" } },
            maxRetries: 0,
          });
          generatedPath = await uploadGeneratedFile({
            userId,
            storyId,
            chapterId,
            bytes: result.image.uint8Array,
            mimeType: result.image.mediaType || "image/png",
            kind,
            prompt,
          });
          await recordAdminUsage(row.id, 0, true, purposeForKind(kind));
          break;
        }

        const { experimental_generateVideo } = await import("ai");
        const result = await experimental_generateVideo({
          model: google.video(model as any),
          prompt,
          n: 1,
          aspectRatio: "9:16",
          duration: 5,
          providerOptions: { google: { personGeneration: "allow_adult" } },
          maxRetries: 0,
        });
        generatedPath = await uploadGeneratedFile({
          userId,
          storyId,
          chapterId,
          bytes: result.video.uint8Array,
          mimeType: result.video.mediaType || "video/mp4",
          kind,
          prompt,
        });
        await recordAdminUsage(row.id, 0, true, purposeForKind(kind));
        break;
      }

      if (kind === "image") {
        const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
        const { generateImage } = await import("ai");
        const compat = createOpenAICompatible({
          name: `asset-${row.provider}`,
          baseURL: (row.base_url?.trim() || DEFAULT_BASE_URLS[row.provider] || DEFAULT_BASE_URLS.openai).replace(/\/$/, ""),
          headers: { Authorization: `Bearer ${row.api_key ?? ""}` },
        });
        const result = await generateImage({
          model: compat.imageModel(model),
          prompt,
          n: 1,
          aspectRatio: "9:16",
          maxRetries: 0,
        });
        generatedPath = await uploadGeneratedFile({
          userId,
          storyId,
          chapterId,
          bytes: result.image.uint8Array,
          mimeType: result.image.mediaType || "image/png",
          kind,
          prompt,
        });
        await recordAdminUsage(row.id, 0, true, purposeForKind(kind));
        break;
      }

      throw new Error("이 provider는 영상 생성 모델 호출을 지원하지 않습니다.");
    } catch (error: any) {
      lastError = String(error?.message ?? error);
      await recordAdminUsage(row.id, 0, false, purposeForKind(kind), lastError.slice(0, 500));
    }
  }

  if (!generatedPath) {
    const { chatWithRotation } = await import("@/lib/llm-router.server");
    const promptResult = await chatWithRotation({
      purpose: purposeForKind(kind),
      temperature: 0.4,
      maxTokens: 900,
      messages: [
        {
          role: "system",
          content: "You are an asset director. Return a concise production prompt and caption in Korean. No markdown.",
        },
        {
          role: "user",
          content: [
            `Asset kind: ${kind}`,
            `Chapter: ${chapter.title}`,
            "Refine this prompt for a production artist or image/video generation model:",
            "",
            prompt,
          ].join("\n"),
        },
      ],
    });
    providerLabel = promptResult.providerLabel;
    model = promptResult.model;
    lastError = lastError || "생성 파일을 반환하는 모델이 없어 프롬프트 슬롯만 생성했습니다.";
    const slot: AssetSlot = {
      id: newId("asset_ai"),
      offset,
      scene_description: promptResult.text.trim() || prompt,
      heat_tier: heatTier,
      media_asset_id: null,
      media_url: null,
      media_type: kind,
      caption: kind === "video" ? "AI 영상 생성 프롬프트" : "AI 이미지 생성 프롬프트",
      source: "ai",
    };
    return { slot, generated: false, providerLabel, model, warning: lastError };
  }

  const slot: AssetSlot = {
    id: newId("asset_ai"),
    offset,
    scene_description: prompt,
    heat_tier: heatTier,
    media_asset_id: generatedPath,
    media_url: generatedPath,
    media_type: kind,
    caption: kind === "video" ? "AI 생성 영상" : "AI 생성 이미지",
    source: "ai",
  };
  return { slot, generated: true, providerLabel, model };
}

async function handlePost(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, any>;
  const action = String(body.action ?? "");
  const storyId = String(body.storyId ?? "");
  const chapterId = String(body.chapterId ?? "");

  if (action === "translate") {
    const { chapter } = await getStoryAndChapter(storyId, chapterId);
    const result = await translateChapter(chapter.body);
    return Response.json({ ok: true, ...result });
  }

  if (action === "suggest_slots") {
    const { row, chapter } = await getStoryAndChapter(storyId, chapterId);
    const result = await suggestSlots(row, chapter.body, Math.floor(Number(body.desiredCount) || 5));
    return Response.json({ ok: true, ...result });
  }

  if (action === "generate_asset") {
    const result = await generateAsset(request, staff.userId, body);
    return Response.json({ ok: true, ...result });
  }

  if (action === "analyze_characters") {
    const { row, chapter, chapters } = await getStoryAndChapter(storyId, chapterId);
    const result = await analyzeCharactersWithLlm(row, chapter);
    const card = recordOf(row.character_card);
    const nextChapters = chapters.map((item) =>
      item.id === chapter.id
        ? {
            ...item,
            characterAnalysis: result.characterAnalysis,
          }
        : item,
    );
    const nextCard = mergeAnalyzedCharactersIntoCard(
      {
        ...card,
        chapters: nextChapters,
      },
      chapter,
      result,
    );
    const { error } = await supabaseAdmin
      .from("user_stories")
      .update({
        character_card: nextCard,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", storyId);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, ...result });
  }

  return jsonError("unknown_action");
}

export const Route = createFileRoute("/api/admin/story-ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handlePost(request);
        } catch (error) {
          console.error("[api/admin/story-ai] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
