import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DEFAULT_BASE_URLS,
  DEFAULT_MODELS,
  callProvider,
  listAllActiveLlmProviders,
  recordLlmUsage,
  type ProviderRow,
} from "@/lib/llm-router.server";
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

function buildWholeStoryChapter(row: any, chapters: ReturnType<typeof buildChaptersFromRow>) {
  let body = "";
  const assetSlots: AssetSlot[] = [];
  for (const chapter of chapters) {
    const chapterBody = String(chapter.body ?? "").trim();
    const chapterSummary = String(chapter.summary ?? "").trim();
    if (!chapterBody && !chapterSummary) continue;

    const headerLines = [`[${chapter.episodeNumber}화 ${chapter.title}]`, chapterSummary ? `요약: ${chapterSummary}` : ""].filter(Boolean);
    const header = `${body ? "\n\n" : ""}${headerLines.join("\n")}\n`;
    const bodyOffset = body.length + header.length;
    body += `${header}${chapterBody}`;

    for (const slot of Array.isArray(chapter.assetSlots) ? chapter.assetSlots : []) {
      assetSlots.push({
        ...slot,
        id: `${chapter.id}:${slot.id}`,
        offset: bodyOffset + Math.max(0, Number(slot.offset) || 0),
        caption: [chapter.title, slot.caption].filter(Boolean).join(" · "),
      } as AssetSlot);
    }
  }

  return {
    id: "story_all",
    title: "전체 스토리",
    episodeNumber: 0,
    isFree: true,
    priceCredits: 0,
    summary: String(recordOf(row?.character_card).storyOverview ?? row?.logline ?? ""),
    body: body.trim(),
    assetSlots: assetSlots.slice(0, 120),
    characterAnalysis: safeArray(recordOf(row?.character_card).characterAnalysis),
  };
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

function normalizeCharacterName(value: unknown) {
  return compactText(value, 80).replace(/[“”"'‘’『』「」()[\]{}]/g, "").trim();
}

function isGenericCharacterName(name: string) {
  const compact = normalizeCharacterName(name).replace(/\s+/g, "");
  if (!compact) return true;
  if (/^(상대주인공|주인공|캐릭터\d*|등장인물\d*|인물\d*|남자|여자|그|그녀|그사람)$/i.test(compact)) return true;
  if (/^(대표|CEO|상사|비서|회장|사장|남편|아내|친구|동료|직원|선생|학생|의사|간호사)$/.test(compact)) return true;
  return compact.length < 2 || compact.length > 20;
}

function pushGroundedName(names: Set<string>, value: unknown) {
  const name = normalizeCharacterName(value);
  if (!isGenericCharacterName(name)) names.add(name);
}

function collectGroundedCharacterNames(row: any, chapter: ReturnType<typeof buildChaptersFromRow>[number]) {
  const card = recordOf(row?.character_card);
  const body = String(chapter.body ?? "");
  const names = new Set<string>();
  const existing = Array.isArray(card.characters) ? card.characters : [];
  for (const character of existing) pushGroundedName(names, character?.name ?? character?.title);
  pushGroundedName(names, card.name);

  for (const match of body.matchAll(/(?:^|\n)\s*([가-힣A-Za-z][가-힣A-Za-z0-9 _-]{1,18})\s*[:：]/g)) {
    pushGroundedName(names, match[1]);
  }
  for (const match of body.matchAll(/([가-힣A-Za-z][가-힣A-Za-z0-9 _-]{1,18})\s*(?:이|가|은|는|도)?\s*(?:말했다|물었다|대답했다|속삭였다|중얼거렸다|웃었다|소리쳤다|외쳤다|답했다|불렀다|말을 이었다)/g)) {
    pushGroundedName(names, match[1]);
  }
  for (const match of body.matchAll(/(?:^|[\s“"'‘『「])([가-힣]{2,4})(?:야|아|씨|님|대표님|선배|오빠|형|누나|언니)(?=[,.\s?!…」』”"'])/g)) {
    pushGroundedName(names, match[1]);
  }
  for (const match of body.matchAll(/\b([가-힣]{2,4})(?:은|는|이|가|에게|와|과|의|를|을)\b/g)) {
    pushGroundedName(names, match[1]);
    if (names.size >= 12) break;
  }
  return names;
}

function excerptAroundOffset(text: string, offset: unknown, radius = 180) {
  const point = Math.max(0, Math.min(text.length, Number(offset) || 0));
  const start = Math.max(0, point - radius);
  const end = Math.min(text.length, point + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function assetTierMinAffection(tier: string) {
  if (tier === "warm") return 25;
  if (tier === "spicy") return 50;
  if (tier === "steamy") return 75;
  if (tier === "premium") return 90;
  return 0;
}

function buildCharacterAssetContext(chapter: ReturnType<typeof buildChaptersFromRow>[number]) {
  const body = String(chapter.body ?? "");
  return (Array.isArray(chapter.assetSlots) ? chapter.assetSlots : [])
    .map((slot, index) => ({
      slotId: String(slot.id || `slot_${index + 1}`),
      offset: Math.max(0, Number(slot.offset) || 0),
      heatTier: normalizeTier(slot.heat_tier),
      mediaUrl: typeof slot.media_url === "string" ? slot.media_url : null,
      mediaAssetId: typeof slot.media_asset_id === "string" ? slot.media_asset_id : null,
      mediaType: slot.media_type === "video" ? "video" : "image",
      caption: compactText(slot.caption, 180),
      sceneDescription: compactText(slot.scene_description, 320),
      source: slot.source,
      textAround: excerptAroundOffset(body, slot.offset),
    }))
    .filter((slot) => slot.mediaUrl || slot.mediaAssetId || slot.sceneDescription || slot.caption)
    .slice(0, 80);
}

function assetSlotToShowcaseAsset(slot: Record<string, any>, reason = "") {
  const mediaUrl = compactText(slot.mediaUrl ?? slot.media_url ?? slot.mediaAssetId ?? slot.media_asset_id, 500);
  const mediaType = slot.mediaType === "video" || slot.media_type === "video" ? "video" : "image";
  const tier = normalizeTier(slot.heatTier ?? slot.heat_tier);
  return {
    id: compactText(slot.slotId ?? slot.id, 120) || newId("char_asset"),
    tier,
    minAffection: assetTierMinAffection(tier),
    mediaUrl: mediaUrl || null,
    mediaType,
    caption:
      compactText(slot.caption, 160) ||
      compactText(slot.sceneDescription ?? slot.scene_description, 160) ||
      compactText(reason, 160) ||
      "캐릭터 에셋",
  };
}

function mergeCharacterShowcaseAssets(currentAssets: unknown, analyzedAssets: unknown, matchedSlots: Record<string, any>[]) {
  const map = new Map<string, Record<string, any>>();
  for (const asset of safeArray(currentAssets)) {
    const row = recordOf(asset);
    const key = compactText(row.mediaUrl ?? row.media_url ?? row.id, 500);
    if (key) map.set(key, row);
  }
  for (const asset of safeArray(analyzedAssets)) {
    const row = recordOf(asset);
    const normalized = assetSlotToShowcaseAsset(row, compactText(row.reason, 160));
    const key = compactText(normalized.mediaUrl ?? normalized.id, 500);
    if (key && !map.has(key)) map.set(key, normalized);
  }
  for (const slot of matchedSlots) {
    const normalized = assetSlotToShowcaseAsset(slot);
    const key = compactText(normalized.mediaUrl ?? normalized.id, 500);
    if (key && !map.has(key)) map.set(key, normalized);
  }
  return [...map.values()].slice(0, 20);
}

function matchSlotsForCharacter(name: string, assetContext: Record<string, any>[], assetHints: unknown) {
  const key = normalizeNameKey(name);
  const hintedIds = new Set(
    safeArray(assetHints)
      .map((hint) => compactText(recordOf(hint).slotId ?? recordOf(hint).id, 120))
      .filter(Boolean),
  );
  return assetContext.filter((slot) => {
    if (hintedIds.has(compactText(slot.slotId, 120))) return true;
    const haystack = `${slot.caption ?? ""} ${slot.sceneDescription ?? ""} ${slot.textAround ?? ""}`;
    return key && normalizeNameKey(haystack).includes(key);
  });
}

function hasGroundedCharacterEvidence(character: Record<string, any>, groundedNames: Set<string>, chapterBody: string) {
  const name = normalizeCharacterName(character.name);
  const key = normalizeNameKey(name);
  if (!name || isGenericCharacterName(name)) return false;
  if ([...groundedNames].some((grounded) => normalizeNameKey(grounded) === key)) return true;
  const evidence = compactText(character.evidence, 400);
  return Boolean(evidence && evidence.includes(name) && chapterBody.includes(name));
}

function normalizeCharacterResult(item: Record<string, any>, index: number) {
  const name = compactText(item.name, 80);
  if (!name || isGenericCharacterName(name)) return null;
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
    visibleInFrontend: Boolean(
      item.visibleInFrontend ?? item.publicVisible ?? item.showInFrontend ?? item.exposeInFrontend ?? item.chatEnabled !== false,
    ),
    reusable: item.reusable !== false,
    emotion: compactText(item.emotion, 160),
    attitude: compactText(item.attitude, 240),
    traits,
    evidence: compactText(item.evidence, 280),
    chatGuidance: compactText(item.chatGuidance, 900),
    assetHints: safeArray(item.assetHints ?? item.asset_hints)
      .map((hint) => {
        const row = recordOf(hint);
        return {
          slotId: compactText(row.slotId ?? row.id, 120),
          reason: compactText(row.reason, 240),
          usage: compactText(row.usage, 120),
        };
      })
      .filter((hint) => hint.slotId || hint.reason)
      .slice(0, 12),
    showcaseAssets: safeArray(item.showcaseAssets ?? item.showcase_assets ?? item.visualAssets)
      .map((asset) => assetSlotToShowcaseAsset(recordOf(asset), compactText(recordOf(asset).reason, 160)))
      .filter((asset) => asset.mediaUrl)
      .slice(0, 12),
  };
}

function normalizeNameKey(name: string) {
  return String(name || "").replace(/\s+/g, "").trim().toLowerCase();
}

function mergeAnalyzedCharactersIntoCard(card: Record<string, any>, chapter: any, result: Awaited<ReturnType<typeof analyzeCharactersWithLlm>>) {
  const existing = Array.isArray(card.characters) ? card.characters : [];
  const assetContext = Array.isArray(result.assetContext) ? result.assetContext : [];
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
    const matchedSlots = matchSlotsForCharacter(name, assetContext, analyzed.assetHints);
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
        assetHints: analyzed.assetHints ?? [],
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
      showcaseAssets: mergeCharacterShowcaseAssets(current.showcaseAssets, analyzed.showcaseAssets, matchedSlots),
      chatEnabled: current.chatEnabled ?? true,
      visibleInFrontend:
        current.visibleInFrontend ??
        current.publicVisible ??
        current.showInFrontend ??
        current.exposeInFrontend ??
        analyzed.visibleInFrontend ??
        true,
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
  const groundedNames = collectGroundedCharacterNames(row, chapter);
  if (!groundedNames.size) return { characterAnalysis: [], characters: [] };
  const assetContext = buildCharacterAssetContext(chapter);
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
          "Read Korean web-novel text and extract only important recurring or scene-driving characters.",
          "Use both text evidence and already-inserted image/video asset slots as production evidence.",
          "Return ONLY valid JSON. No markdown. No commentary.",
          "Never invent character names. Use only names explicitly grounded in the provided story text or existing character list.",
          "If the provided text has no grounded character names, return empty arrays.",
          "Do not use placeholders such as 상대 주인공, 주인공, 캐릭터1, 남자, 여자, CEO, 대표 as names.",
          "Each character must be usable as an AI chat persona.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "Return JSON object with fields:",
          "characters: array of objects {id,name,role,persona,personality,relationship,speakingStyle,visualPrompt,tags,isPrimary,chatEnabled,visibleInFrontend,reusable,emotion,attitude,traits,evidence,chatGuidance,assetHints,showcaseAssets}",
          "characterAnalysis: array of objects {id,name,role,emotion,attitude,traits,relationship,evidence,chatGuidance,assetHints}",
          "",
          "Rules:",
          "- Analyze the actual story text, dialogue labels, honorifics, actions, and relationships.",
          "- Analyze ASSET_SLOTS_JSON too. Slot textAround, caption, sceneDescription, and heatTier can reveal which character the asset belongs to.",
          "- A valid name must appear in a dialogue label, direct address, speech attribution, existing registered character data, or the story body.",
          "- evidence must quote or closely paraphrase the exact sentence that proves this character appears or speaks.",
          "- assetHints must be an array of {slotId, reason, usage}. Only reference slotIds that exist in ASSET_SLOTS_JSON.",
          "- showcaseAssets must be an array of {id,mediaUrl,mediaType,tier,minAffection,caption}. Use existing mediaUrl/mediaAssetId from ASSET_SLOTS_JSON when the slot visually belongs to the character.",
          "- persona: stable backstory, desire, emotional wound, relationship to the reader/protagonist.",
          "- speakingStyle: concrete Korean speaking rules, tone, sentence length, honorific/plain speech tendency.",
          "- visualPrompt: concise image generation prompt for an adult manga/webtoon-style portrait; include hair, face, body impression, mood, clothes, and asset-consistent visual details if grounded.",
          "- chatGuidance: how the character should answer the user in this exact episode context.",
          "- Keep output Korean except technical ids.",
          "- Maximum 6 characters. Put the main chat partner first.",
          "",
          `STORY_TITLE: ${row.title ?? ""}`,
          `STORY_LOGLINE: ${row.logline ?? ""}`,
          `STORY_OVERVIEW: ${card.storyOverview ?? ""}`,
          `EXISTING_CHARACTERS_JSON: ${JSON.stringify(existingCharacters).slice(0, 5000)}`,
          `GROUNDED_NAME_CANDIDATES: ${JSON.stringify([...groundedNames])}`,
          `ASSET_SLOTS_JSON: ${JSON.stringify(assetContext).slice(0, 20000)}`,
          `ANALYSIS_SCOPE: ${chapter.id === "story_all" ? "whole_story" : "chapter"}`,
          `SECTION: ${chapter.episodeNumber ? `${chapter.episodeNumber}화 ` : ""}${chapter.title}`,
          `SECTION_SUMMARY: ${chapter.summary ?? ""}`,
          "",
          "STORY_TEXT:",
          body.slice(0, chapter.id === "story_all" ? 42000 : 26000),
        ].join("\n"),
      },
    ],
  });

  const parsed = parseJsonObject(result.text);
  const chapterBody = String(chapter.body ?? "");
  const characters = safeArray(parsed.characters)
    .map((item, index) => normalizeCharacterResult(recordOf(item), index))
    .filter(Boolean)
    .filter((character) => hasGroundedCharacterEvidence(character as Record<string, any>, groundedNames, chapterBody)) as Array<Record<string, any>>;
  const characterAnalysis = safeArray(parsed.characterAnalysis)
    .map((item, index) => {
      const source = normalizeCharacterResult(recordOf(item), index);
      if (!source) return null;
      if (!hasGroundedCharacterEvidence(source, groundedNames, chapterBody)) return null;
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
        assetHints: source.assetHints ?? [],
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
          assetHints: character.assetHints ?? [],
        })),
    characters,
    providerLabel: result.providerLabel,
    model: result.model,
    tokensUsed: result.tokensUsed,
    assetContext,
  };
}

async function generateSingleCharacterWithLlm(
  row: any,
  chapter: ReturnType<typeof buildChaptersFromRow>[number],
  draftCharactersInput: unknown,
) {
  const body = String(chapter.body ?? "").trim();
  if (body.length < 80) return { character: null, reason: "본문이 짧아 캐릭터를 추출할 수 없습니다." };

  const card = recordOf(row?.character_card);
  const registeredCharacters = Array.isArray(card.characters) ? card.characters : [];
  const draftCharacters = safeArray(draftCharactersInput).map(recordOf);
  const existingCharacters = [...registeredCharacters, ...draftCharacters]
    .map((character) => ({
      id: compactText(character.id, 120),
      name: compactText(character.name ?? character.title, 80),
      role: compactText(character.role, 120),
      relationship: compactText(character.relationship, 220),
      persona: compactText(character.persona ?? character.personality ?? character.notes, 420),
    }))
    .filter((character) => character.name);
  const existingNameKeys = new Set(existingCharacters.map((character) => normalizeNameKey(character.name)));
  const groundedNames = collectGroundedCharacterNames(row, chapter);
  const assetContext = buildCharacterAssetContext(chapter);
  const { chatWithRotation } = await import("@/lib/llm-router.server");

  const result = await chatWithRotation({
    purpose: "summary",
    temperature: 0.12,
    maxTokens: 1800,
    messages: [
      {
        role: "system",
        content: [
          "You are Lovetale's senior character bible editor.",
          "Your task is to create exactly one high-confidence character profile from a Korean story chapter.",
          "Return ONLY valid JSON. No markdown. No commentary.",
          "Never invent names, jobs, relationships, or visual details. Every important field must be grounded in the story text, existing character data, or asset slot context.",
          "Prefer a named character who appears, speaks, is addressed, or drives the scene.",
          "Do not return generic labels as names: 주인공, 상대주인공, 캐릭터, 등장인물, 남자, 여자, 그, 그녀, CEO, 상사, 비서, 회장, 사장.",
          "If every suitable character is already in EXISTING_CHARACTERS_JSON, return {\"character\": null, \"reason\": \"...\"}.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "Choose ONE character only.",
          "Return JSON object:",
          "{",
          '  "character": {',
          '    "id": string,',
          '    "name": string,',
          '    "role": string,',
          '    "persona": string,',
          '    "personality": string,',
          '    "relationship": string,',
          '    "speakingStyle": string,',
          '    "visualPrompt": string,',
          '    "tags": string[],',
          '    "isPrimary": boolean,',
          '    "chatEnabled": true,',
          '    "reusable": true,',
          '    "emotion": string,',
          '    "attitude": string,',
          '    "traits": string[],',
          '    "evidence": string,',
          '    "chatGuidance": string,',
          '    "assetHints": [{"slotId": string, "reason": string, "usage": string}],',
          '    "showcaseAssets": [{"id": string, "mediaUrl": string, "mediaType": "image"|"video", "tier": string, "minAffection": number, "caption": string}]',
          "  },",
          '  "characterAnalysis": {"id": string, "name": string, "role": string, "emotion": string, "attitude": string, "traits": string[], "relationship": string, "evidence": string, "chatGuidance": string, "assetHints": []},',
          '  "reason": string',
          "}",
          "",
          "Selection rules:",
          "- Exclude names already listed in EXISTING_CHARACTERS_JSON unless no other grounded character exists.",
          "- If several candidates exist, choose the one most useful for AI chat: strongest relationship tension, recurring role, distinctive voice, or clear emotional agenda.",
          "- name must appear in CHAPTER_TEXT, GROUNDED_NAME_CANDIDATES, or EXISTING_CHARACTERS_JSON.",
          "- role must be story-specific, not generic. Example: '주인공의 계약상 상사이자 감정적으로 압박하는 남자 주인공'.",
          "- relationship must describe the relation to the protagonist/user and the current emotional power balance.",
          "- persona must include desire, wound/fear, behavioral pattern, and boundary for staying in character.",
          "- speakingStyle must be concrete Korean chat rules: 존댓말/반말, sentence length, teasing/directness, taboo words or habits.",
          "- visualPrompt must be an adult original manga/webtoon portrait prompt with grounded hair, face, build, clothes, mood, and no copyrighted/person references.",
          "- evidence must quote or closely paraphrase the exact proof from the chapter.",
          "- Keep all prose Korean except ids.",
          "",
          `STORY_TITLE: ${row.title ?? ""}`,
          `STORY_LOGLINE: ${row.logline ?? ""}`,
          `STORY_OVERVIEW: ${card.storyOverview ?? ""}`,
          `EXISTING_CHARACTERS_JSON: ${JSON.stringify(existingCharacters).slice(0, 8000)}`,
          `GROUNDED_NAME_CANDIDATES: ${JSON.stringify([...groundedNames])}`,
          `ASSET_SLOTS_JSON: ${JSON.stringify(assetContext).slice(0, 16000)}`,
          `CHAPTER: ${chapter.episodeNumber} ${chapter.title}`,
          `CHAPTER_SUMMARY: ${chapter.summary ?? ""}`,
          "",
          "CHAPTER_TEXT:",
          body.slice(0, 32000),
        ].join("\n"),
      },
    ],
  });

  const parsed = parseJsonObject(result.text);
  const rawCharacter = recordOf(parsed.character ?? parsed);
  if (!rawCharacter.name) {
    return {
      character: null,
      reason: compactText(parsed.reason, 240) || "새로 추가할 만한 캐릭터를 찾지 못했습니다.",
      providerLabel: result.providerLabel,
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }

  const character = normalizeCharacterResult(rawCharacter, 0);
  if (!character) {
    return {
      character: null,
      reason: "AI가 반환한 이름이 캐릭터 이름으로 적합하지 않습니다.",
      providerLabel: result.providerLabel,
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }

  const name = String(character.name ?? "");
  const nameKey = normalizeNameKey(name);
  const isExisting = existingNameKeys.has(nameKey);
  const groundedByCandidate = [...groundedNames].some((candidate) => normalizeNameKey(candidate) === nameKey);
  const groundedByBody = Boolean(name && body.includes(name));
  if (!isExisting && !groundedByCandidate && !groundedByBody) {
    return {
      character: null,
      reason: "본문에서 검증되는 캐릭터 이름을 찾지 못했습니다.",
      providerLabel: result.providerLabel,
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }
  if (isExisting) {
    return {
      character: null,
      reason: `${name}은 이미 캐릭터 목록에 있습니다. 다른 회차를 선택하거나 기존 캐릭터를 저장해 주세요.`,
      providerLabel: result.providerLabel,
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }

  const matchedSlots = matchSlotsForCharacter(name, assetContext, character.assetHints);
  const normalizedCharacter = {
    ...character,
    id: character.id || newId("char"),
    showcaseAssets: mergeCharacterShowcaseAssets(character.showcaseAssets, [], matchedSlots),
  };
  const analysisSource = recordOf(parsed.characterAnalysis);
  const normalizedAnalysis = {
    id: compactText(analysisSource.id, 120) || `char_insight_${chapter.id}_${normalizedCharacter.id}`,
    name: normalizedCharacter.name,
    role: compactText(analysisSource.role, 120) || normalizedCharacter.role,
    emotion: compactText(analysisSource.emotion, 160) || normalizedCharacter.emotion,
    attitude: compactText(analysisSource.attitude, 240) || normalizedCharacter.attitude,
    traits: safeArray(analysisSource.traits).length ? safeArray(analysisSource.traits) : normalizedCharacter.traits,
    relationship: compactText(analysisSource.relationship, 500) || normalizedCharacter.relationship,
    evidence: compactText(analysisSource.evidence, 280) || normalizedCharacter.evidence,
    chatGuidance: compactText(analysisSource.chatGuidance, 900) || normalizedCharacter.chatGuidance,
    assetHints: safeArray(analysisSource.assetHints).length ? safeArray(analysisSource.assetHints) : normalizedCharacter.assetHints ?? [],
  };

  return {
    character: normalizedCharacter,
    characterAnalysis: normalizedAnalysis,
    reason: compactText(parsed.reason, 240),
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
  const providers = (await listActiveAdminProviders(purposeForKind(kind))).filter((row) => row.provider === "google");
  if (!providers.length) {
    throw new Error(
      kind === "video"
        ? "영상 생성은 관리자 LLM API에 등록된 Gemini/Veo API만 사용합니다. Google provider를 video_generation 용도로 활성화해 주세요."
        : "이미지 생성은 관리자 LLM API에 등록된 Gemini 이미지 API만 사용합니다. Google provider를 image_generation 용도로 활성화해 주세요.",
    );
  }
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

function stripJsonFence(text: string) {
  return String(text ?? "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeStoryRpgId(value: unknown, fallback: string) {
  return (
    String(value || fallback)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback
  );
}

function clampStoryRpgDelta(value: unknown, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(-10, Math.min(10, Math.round(numberValue)));
}

function parseStoryRpgJson(text: string) {
  const stripped = stripJsonFence(text);
  const match = stripped.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : stripped);
}

function compactStoryRpgText(value: unknown, maxChars = 1200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function estimateStoryRpgSceneBudget(chapters: ReturnType<typeof buildStoryRpgChapters>, requestedScenes: number) {
  const totalBodyLength = chapters.reduce((sum, chapter) => sum + chapter.body.length, 0);
  const sourceDrivenMinimum = Math.max(chapters.length * 3, Math.ceil(totalBodyLength / 3500));
  return Math.max(24, Math.min(96, Math.max(requestedScenes, sourceDrivenMinimum)));
}

function buildStoryRpgChapters(row: any) {
  return buildChaptersFromRow(row)
    .map((chapter) => ({
      id: String(chapter.id),
      title: String(chapter.title || `Episode ${chapter.episodeNumber}`),
      episodeNumber: Number(chapter.episodeNumber || 1),
      summary: String(chapter.summary || ""),
      body: String(chapter.body || ""),
    }))
    .filter((chapter) => chapter.body.trim().length > 80);
}

function chapterStoryRpgExcerpt(chapter: ReturnType<typeof buildStoryRpgChapters>[number], maxChars = 18000) {
  return [
    `EPISODE_NUMBER: ${chapter.episodeNumber}`,
    `TITLE: ${chapter.title}`,
    `CURRENT_SUMMARY: ${chapter.summary}`,
    "",
    "TEXT:",
    chapter.body.slice(0, maxChars),
  ].join("\n");
}

function balancedStoryRpgExcerpt(text: string, maxChars = 7000) {
  const source = text.trim();
  if (source.length <= maxChars) return source;
  const headSize = Math.floor(maxChars * 0.42);
  const tailSize = Math.floor(maxChars * 0.38);
  const middleSize = maxChars - headSize - tailSize;
  const middleStart = Math.max(headSize, Math.floor(source.length / 2 - middleSize / 2));
  return [
    source.slice(0, headSize).trim(),
    "\n\n[중반부 발췌]\n",
    source.slice(middleStart, middleStart + middleSize).trim(),
    "\n\n[후반부 발췌]\n",
    source.slice(Math.max(0, source.length - tailSize)).trim(),
  ].join("");
}

function buildCompactStoryRpgBriefs(chapters: ReturnType<typeof buildStoryRpgChapters>) {
  return chapters.map((chapter) => ({
    episodeNumber: chapter.episodeNumber,
    title: chapter.title,
    currentSummary: chapter.summary,
    bodyLength: chapter.body.length,
    sourceExcerpt: balancedStoryRpgExcerpt(chapter.body, 9000),
  }));
}

async function selectDeepSeekStoryRpgProvider() {
  const providers = await listAllActiveLlmProviders();
  const provider =
    providers.find((row) => row.provider === "deepseek") ??
    providers.find((row) => /deepseek/i.test(`${row.label ?? ""} ${row.model ?? ""} ${row.base_url ?? ""}`));
  if (!provider) {
    throw new Error("StoryRPG 생성에 사용할 활성 DeepSeek API가 없습니다. 관리자 > LLM API관리에서 DeepSeek를 활성화해 주세요.");
  }
  return provider;
}

async function callStoryRpgProvider(
  provider: ProviderRow,
  options: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature: number;
    maxTokens: number;
  },
) {
  const out = await callProvider(provider, {
    purpose: "summary",
    messages: options.messages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  });
  if (!out.ok) {
    await recordLlmUsage(provider.id, 0, false, "summary", out.error);
    throw new Error(`[${provider.label}] ${out.error ?? "StoryRPG LLM 호출 실패"}`);
  }
  await recordLlmUsage(provider.id, out.tokens, true, "summary");
  return {
    text: out.text,
    tokens: out.tokens,
    providerLabel: provider.label,
    provider: provider.provider,
    model: provider.model || DEFAULT_MODELS[provider.provider] || DEFAULT_MODELS.deepseek,
  };
}

function storyRpgSystemPrompt() {
  return [
    "You are Lovetale's StoryRPG scenario director.",
    "Your job is to convert a registered Korean adult-romance web-novel into an interactive story game driven by user choices.",
    "Keep the original tone, relationship tension, character motives, speaking style, pacing, and emotional stakes.",
    "Do not arbitrarily shorten, summarize away, or skip important source events. Preserve the full story arc and transform it into playable branches.",
    "Do not use episode/chapter structure as the game structure. Episode numbers are source metadata only; the player experiences one continuous scenario.",
    "Do not copy long passages verbatim. Recompose the material into game scenes and choice branches while keeping the source amount, mood, and dramatic density.",
    "Adult themes may be represented as mature tension, desire, jealousy, power dynamics, and consequences, but do not create illegal, underage, coercive, or graphic sexual abuse content.",
    "Return only valid JSON. No markdown, no commentary.",
  ].join("\n");
}

async function summarizeStoryRpgChapter(provider: ProviderRow, row: any, chapter: ReturnType<typeof buildStoryRpgChapters>[number]) {
  const result = await callStoryRpgProvider(provider, {
    temperature: 0.35,
    maxTokens: 3500,
    messages: [
      { role: "system", content: storyRpgSystemPrompt() },
      {
        role: "user",
        content: [
          "Analyze this episode as source material for one continuous StoryRPG game.",
          "Return JSON:",
          "{",
          '  "episodeNumber": number,',
          '  "title": string,',
          '  "coreEvents": string[],',
          '  "characterMoves": [{"name": string, "desire": string, "attitude": string, "speakingStyle": string, "relationshipShift": string}],',
          '  "rpgSceneSeeds": [{"scene": string, "goal": string, "choiceIdea": string, "risk": string, "adultTension": string}],',
          '  "continuityHooks": string[],',
          '  "toneNotes": string',
          "}",
          "",
          `STORY_TITLE: ${row.title ?? ""}`,
          `STORY_LOGLINE: ${row.logline ?? ""}`,
          "",
          chapterStoryRpgExcerpt(chapter),
        ].join("\n"),
      },
    ],
  });
  return { parsed: parseStoryRpgJson(result.text), meta: result };
}

async function generateContinuousStoryRpgScenario(
  provider: ProviderRow,
  row: any,
  chapters: ReturnType<typeof buildStoryRpgChapters>,
  briefs: Array<Record<string, any>>,
  maxScenes: number,
) {
  const result = await callStoryRpgProvider(provider, {
    temperature: 0.78,
    maxTokens: 16000,
    messages: [
      { role: "system", content: storyRpgSystemPrompt() },
      {
        role: "user",
        content: [
          "Create one continuous StoryRPG scenario from the whole story analysis.",
          "Do not divide the game by the original episode numbers. The player should move from opening to endings through choices.",
          "Do not reduce the registered story into a short digest. The scenario must feel like a full-length playable adaptation.",
          "Use the requested scene budget as a planning target, not as an excuse to cut the story. Cover all major source beats, character shifts, conflicts, clues, emotional reversals, and payoff scenes.",
          "For each important choice, write enough follow-up scenario content so each branch feels like a real route, not a one-line consequence.",
          "Make the story exciting, emotionally sticky, and provocative in tone while preserving the registered story's atmosphere.",
          "Each scene text should usually be 900-2200 Korean characters. Climactic or route-defining scenes may be longer.",
          "Each non-ending scene should have 2-3 choices, and every choice must point to an existing nextSceneId.",
          `Create around ${maxScenes} scenes when the story volume supports it, covering opening, escalation, crisis, relationship shift, branch routes, and at least 2 endings.`,
          "",
          "Return JSON:",
          "{",
          '  "bible": {',
          '    "synopsis": string,',
          '    "toneGuide": string,',
          '    "adultIntensityGuide": string,',
          '    "relationshipRules": string[],',
          '    "timeline": string[],',
          '    "characters": [{"name": string, "role": string, "desire": string, "speakingStyle": string, "relationship": string}],',
          '    "routePlan": [{"name": string, "theme": string, "unlockCondition": string}],',
          '    "endings": [{"id": string, "name": string, "condition": string, "description": string}]',
          "  },",
          '  "scenes": [',
          "    {",
          '      "id": string,',
          '      "title": string,',
          '      "goal": string,',
          '      "mood": string,',
          '      "text": string,',
          '      "partnerLine": string,',
          '      "choices": [{"label": string, "effect": string, "tone": string, "result": string, "routeHint": string, "nextSceneId": string, "affectionDelta": number, "tensionDelta": number, "trustDelta": number}]',
          "    }",
          "  ]",
          "}",
          "",
          "Rules:",
          "- First scene id must be opening-awakening.",
          "- Use only character names grounded in the registered story analysis.",
          "- End scenes may have an empty choices array.",
          "- Choice result must be a short hook that makes the next scene feel meaningful.",
          "- Do not expose episode labels such as '1화' or 'Episode' as route structure.",
          "- If the source excerpt is long, prioritize continuity and route volume over short summaries.",
          "",
          `STORY_ID: ${row.id}`,
          `STORY_TITLE: ${row.title ?? ""}`,
          `STORY_LOGLINE: ${row.logline ?? ""}`,
          `CHAPTER_COUNT: ${chapters.length}`,
          "",
          "WHOLE_STORY_BRIEFS_JSON:",
          JSON.stringify(briefs).slice(0, 200000),
        ].join("\n"),
      },
    ],
  });
  return { parsed: parseStoryRpgJson(result.text), meta: result };
}

function normalizeStoryRpgChoice(choice: unknown, index: number, fallbackNextSceneId?: string) {
  const source = recordOf(choice);
  return {
    label: compactStoryRpgText(source.label, 80) || `${index + 1}번 선택`,
    effect: compactStoryRpgText(source.effect, 120) || "관계 변화",
    tone: compactStoryRpgText(source.tone, 40) || "선택",
    result: compactStoryRpgText(source.result, 1200) || "선택에 따라 다음 장면의 분위기가 달라집니다.",
    routeHint: compactStoryRpgText(source.routeHint || source.route, 80) || "Main Route",
    nextSceneId: compactStoryRpgText(source.nextSceneId || source.nextScene, 80) || fallbackNextSceneId || undefined,
    affectionDelta: clampStoryRpgDelta(source.affectionDelta, 1),
    tensionDelta: clampStoryRpgDelta(source.tensionDelta, 0),
    trustDelta: clampStoryRpgDelta(source.trustDelta, 1),
  };
}

function normalizeStoryRpgScenario(
  raw: Record<string, any>,
  row: any,
  chapters: ReturnType<typeof buildStoryRpgChapters>,
  providerMeta: Record<string, any>,
  maxScenes: number,
) {
  const card = recordOf(row.character_card);
  const bible = recordOf(raw.bible);
  const rawScenes = safeArray(raw.scenes).slice(0, maxScenes);
  const provisionalIds = rawScenes.map((scene, index) => normalizeStoryRpgId(recordOf(scene).id, `scene-${index + 1}`));
  const scenes = rawScenes.map((scene, index) => {
    const source = recordOf(scene);
    const id = normalizeStoryRpgId(source.id, `scene-${index + 1}`);
    const nextFallback = provisionalIds[index + 1];
    return {
      id,
      title: compactStoryRpgText(source.title, 100) || `장면 ${index + 1}`,
      text: compactStoryRpgText(source.text || source.body, 7000) || "다음 선택을 기다리는 장면입니다.",
      partnerLine: compactStoryRpgText(source.partnerLine || source.line, 700) || "지금 네 선택을 기다리고 있어.",
      goal: compactStoryRpgText(source.goal, 260) || undefined,
      mood: compactStoryRpgText(source.mood, 180) || undefined,
      choices: safeArray(source.choices).slice(0, 4).map((choice, choiceIndex) => normalizeStoryRpgChoice(choice, choiceIndex, nextFallback)),
    };
  });

  const sceneIds = new Set(scenes.map((scene) => scene.id));
  for (const [index, scene] of scenes.entries()) {
    scene.choices = scene.choices
      .filter((choice) => !choice.nextSceneId || sceneIds.has(choice.nextSceneId))
      .map((choice) => ({ ...choice, nextSceneId: choice.nextSceneId || scenes[index + 1]?.id }));
    if (index < scenes.length - 1 && scene.choices.length === 0) {
      scene.choices = [
        normalizeStoryRpgChoice(
          {
            label: "다음 장면으로 이어간다",
            effect: "+1 몰입",
            tone: "진행",
            result: "이 선택으로 다음 사건의 문이 열립니다.",
            nextSceneId: scenes[index + 1].id,
          },
          0,
          scenes[index + 1].id,
        ),
      ];
    }
  }

  const firstChapter = chapters[0] ?? {};
  const firstScene = scenes[0];
  const firstCharacter = safeArray(bible.characters)[0] ?? safeArray(card.characters)[0] ?? {};

  return {
    enabled: true,
    sourceMode: "full_story_analysis",
    generatedAt: new Date().toISOString(),
    generator: providerMeta,
    bible: {
      synopsis: compactStoryRpgText(bible.synopsis || raw.synopsis || row.logline, 1200),
      toneGuide: compactStoryRpgText(bible.toneGuide, 900),
      adultIntensityGuide: compactStoryRpgText(bible.adultIntensityGuide, 900),
      relationshipRules: safeArray(bible.relationshipRules).map((item) => compactStoryRpgText(item, 220)).filter(Boolean).slice(0, 12),
      timeline: safeArray(bible.timeline).map((item) => compactStoryRpgText(item, 260)).filter(Boolean).slice(0, 40),
      characters: safeArray(bible.characters).slice(0, 8),
      routePlan: safeArray(bible.routePlan).slice(0, 8),
      endings: safeArray(bible.endings).slice(0, 8),
    },
    startSceneTitle: firstScene?.title || firstChapter.title || "첫 선택",
    startSceneText: firstScene?.text || compactStoryRpgText(firstChapter.body, 1200),
    partnerLine: firstScene?.partnerLine || `${compactStoryRpgText(recordOf(firstCharacter).name, 40) || "주인공"}이 당신의 선택을 기다립니다.`,
    currentRoute: "Main Route",
    initialAffection: 0,
    initialTension: 35,
    initialTrust: 20,
    endingsTotal: Math.max(3, safeArray(bible.endings).length || 5),
    imagesUnlocked: 1,
    imagesLocked: 4,
    routes: [
      { name: "Desire Route", status: "진행 중", condition: "감정과 긴장을 중심으로 선택", progress: 0 },
      { name: "Trust Route", status: "잠김", condition: "신뢰 45 이상", progress: 0 },
      { name: "Ruin Route", status: "잠김", condition: "긴장 75 이상", progress: 0 },
      { name: "Hidden Ending", status: "잠김", condition: "호감도 85 이상 + 특정 선택", progress: 0 },
    ],
    choices: firstScene?.choices ?? [],
    scenes,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function buildLocalStoryRpgScenario(row: any, chapters: ReturnType<typeof buildStoryRpgChapters>, maxScenes: number, reason: string) {
  const card = recordOf(row.character_card);
  const characters = safeArray(card.characters);
  const primary = recordOf(characters[0]);
  const sceneSources = chapters
    .flatMap((chapter) => {
      const chunkCount = Math.max(1, Math.ceil(chapter.body.length / 7000));
      const chunkSize = Math.ceil(chapter.body.length / chunkCount);
      return Array.from({ length: chunkCount }, (_, chunkIndex) => ({
        chapter,
        chunkIndex,
        chunkCount,
        excerpt: balancedStoryRpgExcerpt(chapter.body.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize), 1800),
      }));
    })
    .slice(0, maxScenes);
  const scenes = sceneSources.map((source, index) => {
    const chapter = source.chapter;
    const id = index === 0 ? "opening-awakening" : `scene-${index + 1}`;
    const nextId = index < sceneSources.length - 1 ? `scene-${index + 2}` : undefined;
    return {
      id,
      title: chapter.title || `장면 ${index + 1}`,
      goal: index === 0 ? "상황을 파악하고 첫 선택을 한다" : "관계의 다음 균열을 선택한다",
      mood: index % 3 === 0 ? "낯섦과 긴장" : index % 3 === 1 ? "위험한 끌림" : "흔들리는 신뢰",
      text: source.excerpt,
      partnerLine:
        index === 0
          ? `${compactStoryRpgText(primary.name, 40) || "상대"}가 당신의 반응을 조용히 기다린다.`
          : "이 다음을 어떻게 받아들일지는 당신의 선택에 달려 있다.",
      choices: nextId
        ? [
            {
              label: "감정에 조금 더 가까이 다가간다",
              effect: "+2 호감도",
              tone: "몰입",
              result: "거리감이 조금 무너지며 다음 장면의 공기가 더 뜨거워진다.",
              routeHint: "Desire Route",
              nextSceneId: nextId,
              affectionDelta: 2,
              tensionDelta: 1,
              trustDelta: 0,
            },
            {
              label: "상황을 먼저 의심하고 관찰한다",
              effect: "+2 신뢰도",
              tone: "침착",
              result: "서두르지 않는 선택이 숨겨진 단서를 드러낸다.",
              routeHint: "Trust Route",
              nextSceneId: nextId,
              affectionDelta: 0,
              tensionDelta: -1,
              trustDelta: 2,
            },
            {
              label: "위험한 질문을 던진다",
              effect: "+3 긴장도",
              tone: "도발",
              result: "피하던 감정이 정면으로 튀어나오며 관계가 다른 방향으로 꺾인다.",
              routeHint: "Ruin Route",
              nextSceneId: nextId,
              affectionDelta: 1,
              tensionDelta: 3,
              trustDelta: -1,
            },
          ]
        : [],
    };
  });

  return {
    bible: {
      synopsis: row.logline || card.storyOverview || `${row.title}의 전체 회차를 기반으로 만든 StoryRPG 초기 시나리오입니다.`,
      toneGuide: "원문의 긴장감, 낯선 끌림, 관계 변화의 속도를 유지한다.",
      adultIntensityGuide: "직접적인 묘사보다 위험한 감정선, 선택의 대가, 호감도 해금 구조를 중심으로 운용한다.",
      relationshipRules: ["초반은 호기심과 경계가 공존한다.", "선택에 따라 호감도, 긴장도, 신뢰도가 다르게 오른다."],
      timeline: chapters.map((chapter) => `${chapter.episodeNumber}. ${chapter.title}`).slice(0, 30),
      characters: characters.slice(0, 6),
      routePlan: [
        { name: "Desire Route", theme: "끌림과 욕망", unlockCondition: "호감도 중심 선택" },
        { name: "Trust Route", theme: "단서와 신뢰", unlockCondition: "신뢰도 45 이상" },
        { name: "Ruin Route", theme: "위험과 파국", unlockCondition: "긴장도 75 이상" },
      ],
      endings: [
        { id: "ending-desire", name: "위험한 끌림", condition: "호감도 80 이상", description: "관계가 금기를 넘어선다." },
        { id: "ending-trust", name: "숨겨진 진실", condition: "신뢰도 70 이상", description: "상대의 비밀을 이해한다." },
        { id: "ending-ruin", name: "무너지는 밤", condition: "긴장도 90 이상", description: "선택의 대가가 관계를 뒤흔든다." },
      ],
    },
    scenes,
    generatorWarning: reason,
  };
}

async function generateAndSaveStoryRpgScenario(row: any, maxScenesInput: unknown) {
  const maxScenesNumber = Number(maxScenesInput);
  const requestedScenes = Number.isFinite(maxScenesNumber) && maxScenesNumber > 8 ? Math.floor(maxScenesNumber) : 48;
  const chapters = buildStoryRpgChapters(row);
  if (!chapters.length) throw new Error("StoryRPG로 변환할 회차 본문이 없습니다.");

  const maxScenes = estimateStoryRpgSceneBudget(chapters, requestedScenes);

  const provider = await selectDeepSeekStoryRpgProvider();
  const briefs = buildCompactStoryRpgBriefs(chapters);
  let tokensUsed = 0;

  let parsed: Record<string, any>;
  let meta: Record<string, any>;
  try {
    const generated = await withTimeout(
      generateContinuousStoryRpgScenario(provider, row, chapters, briefs, maxScenes),
      90000,
      "DeepSeek StoryRPG generation",
    );
    parsed = generated.parsed;
    meta = generated.meta;
    tokensUsed += Number(generated.meta.tokens ?? 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parsed = buildLocalStoryRpgScenario(row, chapters, maxScenes, message);
    meta = {
      model: "local-initial-scenario",
      providerLabel: "local fallback",
      tokens: 0,
      warning: message,
    };
  }
  const card = recordOf(row.character_card);
  const storyRpg = normalizeStoryRpgScenario(
    parsed,
    row,
    chapters,
    {
      providerLabel: provider.label,
      provider: provider.provider,
      model: meta.model,
      stages: { compactChapterBriefs: briefs.length, scenario: 1 },
      tokensUsed,
      warning: meta.warning,
    },
    maxScenes,
  );

  const nextCard = {
    ...card,
    contentType: "story_rpg",
    storyRpg,
  };
  const { error } = await supabaseAdmin
    .from("user_stories")
    .update({
      character_card: nextCard,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", row.id);
  if (error) throw new Error(error.message);

  return {
    storyId: row.id,
    title: row.title,
    chapters: chapters.length,
    scenes: storyRpg.scenes.length,
    endingsTotal: storyRpg.endingsTotal,
    providerLabel: provider.label,
    model: meta.model,
    tokensUsed,
  };
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
    const scope = body.scope === "story" || !chapterId ? "story" : "chapter";
    const { row, chapter, chapters } = await getStoryAndChapter(storyId, chapterId);
    const targetChapter = scope === "story" ? buildWholeStoryChapter(row, chapters) : chapter;
    const result = await analyzeCharactersWithLlm(row, targetChapter);
    const card = recordOf(row.character_card);
    const nextChapters =
      scope === "story"
        ? chapters
        : chapters.map((item) =>
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
        ...(scope === "story"
          ? {
              characterAnalysis: result.characterAnalysis,
              storyCharacterAnalysis: {
                updatedAt: new Date().toISOString(),
                providerLabel: result.providerLabel,
                model: result.model,
                tokensUsed: result.tokensUsed,
              },
            }
          : {}),
      },
      targetChapter,
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
    return Response.json({ ok: true, scope, ...result });
  }

  if (action === "generate_single_character") {
    const { row, chapter } = await getStoryAndChapter(storyId, chapterId);
    const result = await generateSingleCharacterWithLlm(row, chapter, body.existingCharacters);
    return Response.json({ ok: true, ...result });
  }

  if (action === "story_rpg_generate") {
    const { row } = await getStoryAndChapter(storyId, chapterId);
    const result = await generateAndSaveStoryRpgScenario(row, body.maxScenes);
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
