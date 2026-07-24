import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@/lib/_mock/runtime";
import {
  ambiguousKoreanGivenNameKeys,
  characterNameAliasKeys,
  characterNameSetsLikelySame,
  cleanCharacterDisplayName,
  normalizeCharacterNameKey,
  preferredCharacterDisplayName,
} from "@/lib/character-name-match";
import { getFreshAccessToken } from "@/lib/supabase-auth-fetch";

type UserStory = Pick<
  Database["public"]["Tables"]["user_stories"]["Row"],
  "id" | "title" | "logline" | "cover_url" | "character_card" | "updated_at"
> & { body_text?: string | null };
type StoryUpdate = Database["public"]["Tables"]["user_stories"]["Update"];
type AppRole = Database["public"]["Enums"]["app_role"];

export type StoryCharacter = {
  id: string;
  name: string;
  role: string;
  persona: string;
  personality: string;
  relationship: string;
  speakingStyle: string;
  replyPattern?: string;
  llmPurpose?: string;
  llmModel?: string;
  visualPrompt: string;
  avatarUrl: string | null;
  tags: string[];
  isPrimary: boolean;
  chatEnabled: boolean;
  visibleInFrontend: boolean;
  reusable: boolean;
  showcaseAssets?: CharacterVisualAsset[];
  chapterInsights?: CharacterChapterInsight[];
  duplicateAliases?: string[];
  duplicateExclusions?: string[];
  importanceScore?: number;
  dialogueCount?: number;
  mentionCount?: number;
  rankInStory?: number;
};

export type CharacterVisualAsset = {
  id: string;
  tier: "soft" | "warm" | "spicy" | "steamy" | "premium";
  minAffection: number;
  mediaUrl: string | null;
  mediaType: "image" | "video";
  caption: string;
};

export type CharacterChapterInsight = {
  chapterId: string;
  chapterTitle: string;
  episodeNumber: number;
  emotion?: string;
  attitude?: string;
  traits?: string[];
  relationship?: string;
  evidence?: string;
  chatGuidance?: string;
};

export type CharacterStoryRow = {
  storyId: string;
  storyTitle: string;
  contentType: "story" | "story_rpg";
  logline: string;
  coverUrl: string | null;
  updatedAt: string;
  storyOverview: string;
  activeCharacterName: string;
  chapters: Array<{
    id: string;
    title: string;
    episodeNumber: number;
    bodyChars: number;
    summary: string;
    characterAnalysisCount: number;
    assetSlotCount: number;
  }>;
  characters: StoryCharacter[];
};

export type ReusableCharacterRow = StoryCharacter & {
  storyId: string;
  storyTitle: string;
  updatedAt: string;
};

export type PublicChatCharacterRow = StoryCharacter & {
  storyId: string;
  storyTitle: string;
  contentType: "story" | "story_rpg";
  logline: string;
  coverUrl: string | null;
  updatedAt: string;
  initialAffection: number;
  avatarIsVirtual: boolean;
  mainScore: number;
  dialogueCount: number;
  mentionCount: number;
  rankInStory: number;
};

export type SaveStoryCharactersInput = {
  storyId: string;
  storyOverview?: string;
  characters: StoryCharacter[];
};

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function recordOf(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function asString(value: unknown, fallback = "") {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  return text.trim() || fallback;
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12);
  return asString(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function asOptionalBoolean(...values: unknown[]) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const text = value.trim().toLowerCase();
      if (!text) continue;
      if (["true", "1", "yes", "y", "on"].includes(text)) return true;
      if (["false", "0", "no", "n", "off"].includes(text)) return false;
    }
  }
  return null;
}

function normalizeVisualAssets(value: unknown): CharacterVisualAsset[] {
  if (!Array.isArray(value)) return [];
  const fallbackTiers: CharacterVisualAsset["tier"][] = ["soft", "warm", "spicy", "steamy", "premium"];
  const fallbackMins = { soft: 0, warm: 35, spicy: 65, steamy: 85, premium: 95 };
  return value
    .map((asset, index) => {
      const row = recordOf(asset);
      const tier = fallbackTiers.includes(row.tier) ? row.tier : fallbackTiers[index % fallbackTiers.length];
      return {
        id: asString(row.id, newId("visual")),
        tier,
        minAffection: Math.max(0, Math.min(100, Number(row.minAffection ?? fallbackMins[tier]) || fallbackMins[tier])),
        mediaUrl: asString(row.mediaUrl ?? row.media_url) || null,
        mediaType: row.mediaType === "video" || row.media_type === "video" ? "video" : "image",
        caption: asString(row.caption),
      } satisfies CharacterVisualAsset;
    })
    .filter((asset) => asset.mediaUrl || asset.caption)
    .slice(0, 12);
}

function normalizeChapterInsights(value: unknown): CharacterChapterInsight[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((insight) => {
      const row = recordOf(insight);
      return {
        chapterId: asString(row.chapterId ?? row.chapter_id),
        chapterTitle: asString(row.chapterTitle ?? row.chapter_title),
        episodeNumber: Math.max(0, Math.floor(Number(row.episodeNumber ?? row.episode_number) || 0)),
        emotion: asString(row.emotion),
        attitude: asString(row.attitude),
        traits: asStringArray(row.traits),
        relationship: asString(row.relationship),
        evidence: asString(row.evidence),
        chatGuidance: asString(row.chatGuidance ?? row.chat_guidance),
      };
    })
    .filter((insight) => insight.chapterId || insight.evidence || insight.chatGuidance)
    .slice(-30);
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function clampPercent(value: unknown, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function initialAffectionFromCard(card: Record<string, any>) {
  return clampPercent(recordOf(card.environment).initialAffection, 0);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inferCharacterGender(character: Pick<StoryCharacter, "role" | "personality" | "visualPrompt">) {
  const text = [character.role, character.personality, character.visualPrompt].join(" ").toLowerCase();
  if (/(남성|남자|남주|남편|오빠|형|아버지|아빠|ceo|male|man|boy|he\b|him\b)/i.test(text)) return "male";
  if (/(여성|여자|여주|아내|언니|누나|엄마|female|woman|girl|she\b|her\b)/i.test(text)) return "female";
  return "neutral";
}

function createVirtualAvatarDataUrl(
  character: Pick<StoryCharacter, "id" | "name" | "role" | "personality" | "visualPrompt">,
  storyId = "",
) {
  const seed = hashText(`${storyId}:${character.id}:${character.name}:${character.role}`);
  const gender = inferCharacterGender(character);
  const palettes =
    gender === "male"
      ? [
          ["#38bdf8", "#7c3aed", "#09090f", "#e0f2fe"],
          ["#60a5fa", "#ef4444", "#111827", "#dbeafe"],
        ]
      : gender === "female"
        ? [
            ["#ec4899", "#fb7185", "#160711", "#ffe4f1"],
            ["#f472b6", "#a78bfa", "#100719", "#fce7f3"],
          ]
        : [
            ["#f59e0b", "#22c55e", "#101014", "#fef3c7"],
            ["#d946ef", "#38bdf8", "#020617", "#f5d0fe"],
          ];
  const palette = palettes[seed % palettes.length];
  const subtitle = (character.role || "Lovetale").slice(0, 18);
  const hairColor = gender === "male" ? "#151923" : gender === "female" ? "#2a1020" : "#171827";
  const faceColor = gender === "male" ? "#f1c2a4" : gender === "female" ? "#ffd0c6" : "#efc3ad";
  const eyeColor = gender === "male" ? "#60a5fa" : gender === "female" ? "#ec4899" : "#f59e0b";
  const shoulderWidth = gender === "male" ? 230 : gender === "female" ? 190 : 210;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette[2]}"/>
      <stop offset="0.58" stop-color="#050510"/>
      <stop offset="1" stop-color="${palette[0]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="28%" cy="18%" r="65%">
      <stop offset="0" stop-color="${palette[1]}" stop-opacity=".72"/>
      <stop offset=".5" stop-color="${palette[0]}" stop-opacity=".18"/>
      <stop offset="1" stop-color="${palette[2]}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette[0]}"/>
      <stop offset="1" stop-color="${palette[1]}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="800" fill="url(#bg)"/>
  <rect width="640" height="800" fill="url(#glow)"/>
  <circle cx="470" cy="110" r="150" fill="${palette[0]}" opacity=".24"/>
  <circle cx="145" cy="246" r="112" fill="${palette[1]}" opacity=".18"/>
  <ellipse cx="320" cy="684" rx="270" ry="150" fill="#000" opacity=".38"/>
  <path d="M${320 - shoulderWidth / 2} 720 C${320 - shoulderWidth / 2 + 12} 595 ${320 - shoulderWidth / 3} 542 320 542 C${320 + shoulderWidth / 3} 542 ${320 + shoulderWidth / 2 - 12} 595 ${320 + shoulderWidth / 2} 720 Z" fill="url(#body)" opacity=".86"/>
  <path d="M208 727 C230 626 266 581 320 581 C374 581 410 626 432 727 Z" fill="#050510" opacity=".42"/>
  <path d="M196 342 C196 224 246 142 322 142 C404 142 452 227 444 344 C438 441 390 511 321 511 C249 511 199 438 196 342 Z" fill="${faceColor}"/>
  <path d="M194 346 C178 247 217 130 319 116 C415 126 469 232 448 350 C418 306 404 233 357 207 C320 251 251 227 194 346 Z" fill="${hairColor}"/>
  <path d="M219 360 C245 327 281 320 309 337" fill="none" stroke="${hairColor}" stroke-width="18" stroke-linecap="round" opacity=".82"/>
  <path d="M331 337 C363 318 403 330 425 362" fill="none" stroke="${hairColor}" stroke-width="18" stroke-linecap="round" opacity=".82"/>
  <ellipse cx="277" cy="357" rx="17" ry="10" fill="#111827"/>
  <ellipse cx="366" cy="357" rx="17" ry="10" fill="#111827"/>
  <circle cx="281" cy="354" r="4" fill="${eyeColor}"/>
  <circle cx="370" cy="354" r="4" fill="${eyeColor}"/>
  <path d="M314 393 C325 400 337 398 346 391" fill="none" stroke="#9f6858" stroke-width="5" stroke-linecap="round" opacity=".62"/>
  <path d="M292 434 C319 452 350 448 372 431" fill="none" stroke="#9f354d" stroke-width="7" stroke-linecap="round" opacity=".74"/>
  <path d="M202 525 C245 561 396 560 438 522" fill="none" stroke="${palette[3]}" stroke-opacity=".34" stroke-width="2"/>
  <text x="320" y="625" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#fff">${escapeXml(character.name || "Lovetale")}</text>
  <text x="320" y="667" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" letter-spacing="4" fill="rgba(255,255,255,.76)">${escapeXml(subtitle)}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function normalizeCharacter(character: Record<string, any>, index: number): StoryCharacter {
  const primary = Boolean(character.isPrimary ?? character.primary ?? index === 0);
  const chatEnabled = asOptionalBoolean(character.chatEnabled, character.chat_enabled) ?? true;
  const visibleInFrontend =
    asOptionalBoolean(
      character.visibleInFrontend,
      character.visible_in_frontend,
      character.publicVisible,
      character.public_visible,
      character.showInFrontend,
      character.show_in_frontend,
      character.exposeInFrontend,
      character.expose_in_frontend,
      character.chatVisible,
      character.chat_visible,
    ) === true;
  return {
    id: asString(character.id, newId("char")),
    name: asString(character.name),
    role: asString(character.role, primary ? "Main Character" : "Supporting Character"),
    persona: asString(character.persona ?? character.notes ?? character.description),
    personality: asString(character.personality),
    relationship: asString(character.relationship ?? character.relation),
    speakingStyle: asString(character.speakingStyle ?? character.speaking_style),
    replyPattern: asString(character.replyPattern ?? character.reply_pattern ?? character.chatGuidance ?? character.chat_guidance),
    llmPurpose: asString(character.llmPurpose ?? character.llm_purpose, "chat"),
    llmModel: asString(character.llmModel ?? character.llm_model),
    visualPrompt: asString(character.visualPrompt ?? character.visual_prompt ?? character.appearance),
    avatarUrl: asString(character.avatarUrl ?? character.avatar_url) || null,
    tags: asStringArray(character.tags),
    isPrimary: primary,
    chatEnabled,
    visibleInFrontend,
    reusable: character.reusable !== false,
    showcaseAssets: normalizeVisualAssets(character.showcaseAssets ?? character.showcase_assets ?? character.visualAssets),
    chapterInsights: normalizeChapterInsights(character.chapterInsights ?? character.chapter_insights),
    duplicateAliases: asStringArray(character.duplicateAliases ?? character.duplicate_aliases),
    duplicateExclusions: asStringArray(character.duplicateExclusions ?? character.duplicate_exclusions),
  };
}

function characterNameSet(character: Pick<StoryCharacter, "name" | "duplicateAliases">) {
  return [character.name, ...(character.duplicateAliases ?? [])].filter(Boolean);
}

function characterExclusionSet(character: Pick<StoryCharacter, "duplicateExclusions">) {
  return character.duplicateExclusions ?? [];
}

function findCharacterKey(
  rows: Map<string, StoryCharacter>,
  name: string,
  duplicateAliases: string[],
  duplicateExclusions: string[],
  blockedGivenKeys: ReadonlySet<string>,
) {
  const key = normalizeCharacterNameKey(name);
  if (rows.has(key)) return key;
  const names = [name, ...duplicateAliases];
  for (const [currentKey, character] of rows.entries()) {
    const aliases = characterNameSet(character);
    if (
      characterNameSetsLikelySame(aliases, names, {
        blockedGivenKeys,
        aExcludedNames: characterExclusionSet(character),
        bExcludedNames: duplicateExclusions,
      })
    ) {
      return currentKey;
    }
  }
  return key;
}

function mergeVisualAssets(a: CharacterVisualAsset[] = [], b: CharacterVisualAsset[] = []) {
  const byKey = new Map<string, CharacterVisualAsset>();
  for (const asset of [...a, ...b]) {
    const key = asString(asset.mediaUrl ?? asset.id);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, asset);
  }
  return [...byKey.values()].slice(0, 12);
}

function mergeChapterInsights(a: CharacterChapterInsight[] = [], b: CharacterChapterInsight[] = []) {
  const byKey = new Map<string, CharacterChapterInsight>();
  for (const insight of [...a, ...b]) {
    const key = asString(insight.chapterId || `${insight.episodeNumber}:${insight.evidence}`);
    if (!key) continue;
    const current = byKey.get(key);
    byKey.set(key, {
      ...insight,
      ...current,
      chapterId: current?.chapterId || insight.chapterId,
      chapterTitle: current?.chapterTitle || insight.chapterTitle,
      episodeNumber: current?.episodeNumber || insight.episodeNumber,
      emotion: current?.emotion || insight.emotion,
      attitude: current?.attitude || insight.attitude,
      traits: [...new Set([...(current?.traits ?? []), ...(insight.traits ?? [])])].slice(0, 8),
      relationship: current?.relationship || insight.relationship,
      evidence: current?.evidence || insight.evidence,
      chatGuidance: current?.chatGuidance || insight.chatGuidance,
    });
  }
  return [...byKey.values()].sort((a, b) => a.episodeNumber - b.episodeNumber).slice(-30);
}

function mergeCharacterRow(current: StoryCharacter, next: StoryCharacter): StoryCharacter {
  const name = preferredCharacterDisplayName(current.name, next.name);
  const duplicateAliases = [current.name, next.name, ...(current.duplicateAliases ?? []), ...(next.duplicateAliases ?? [])]
    .map((value) => cleanCharacterDisplayName(asString(value)))
    .filter((value) => value && normalizeCharacterNameKey(value) !== normalizeCharacterNameKey(name));
  const mergedNameKeys = new Set([name, ...duplicateAliases].map(normalizeCharacterNameKey).filter(Boolean));
  const duplicateExclusions = [...(current.duplicateExclusions ?? []), ...(next.duplicateExclusions ?? [])]
    .map((value) => cleanCharacterDisplayName(asString(value)))
    .filter((value) => value && !mergedNameKeys.has(normalizeCharacterNameKey(value)));
  return {
    ...next,
    ...current,
    id: current.id || next.id,
    name,
    role: current.role || next.role,
    persona: current.persona || next.persona,
    personality: current.personality || next.personality,
    relationship: current.relationship || next.relationship,
    speakingStyle: current.speakingStyle || next.speakingStyle,
    replyPattern: current.replyPattern || next.replyPattern,
    llmPurpose: current.llmPurpose || next.llmPurpose,
    llmModel: current.llmModel || next.llmModel,
    visualPrompt: current.visualPrompt || next.visualPrompt,
    avatarUrl: current.avatarUrl || next.avatarUrl,
    tags: [...new Set([...(current.tags ?? []), ...(next.tags ?? [])])].slice(0, 12),
    isPrimary: current.isPrimary || next.isPrimary,
    chatEnabled: current.chatEnabled || next.chatEnabled,
    visibleInFrontend: current.visibleInFrontend || next.visibleInFrontend,
    reusable: current.reusable || next.reusable,
    showcaseAssets: mergeVisualAssets(current.showcaseAssets, next.showcaseAssets),
    chapterInsights: mergeChapterInsights(current.chapterInsights, next.chapterInsights),
    duplicateAliases: [...new Set(duplicateAliases)].slice(0, 8),
    duplicateExclusions: [...new Set(duplicateExclusions)].slice(0, 20),
  };
}

function dedupeCharactersByKoreanName(characters: StoryCharacter[]) {
  const byName = new Map<string, StoryCharacter>();
  const blockedGivenKeys = ambiguousKoreanGivenNameKeys(characters.map(characterNameSet));
  for (const character of characters) {
    const key = findCharacterKey(
      byName,
      character.name,
      character.duplicateAliases ?? [],
      character.duplicateExclusions ?? [],
      blockedGivenKeys,
    );
    const current = byName.get(key);
    const merged = current ? mergeCharacterRow(current, character) : character;
    const mergedKey = normalizeCharacterNameKey(merged.name);
    if (mergedKey && mergedKey !== key) byName.delete(key);
    byName.set(mergedKey || key, merged);
  }
  return [...byName.values()];
}

function charactersFromCard(card: Record<string, any>): StoryCharacter[] {
  const rows = Array.isArray(card.characters) && card.characters.length
    ? card.characters
    : card.name
      ? [
          {
            id: "main",
            name: card.name,
            role: card.role ?? "Main Character",
            persona: card.persona ?? card.notes ?? card.description ?? "",
            personality: card.personality ?? "",
            relationship: card.relationship ?? "",
            speakingStyle: card.speakingStyle ?? "",
            visualPrompt: card.visualPrompt ?? card.visual_prompt ?? card.appearance ?? "",
            avatarUrl: card.avatarUrl ?? card.avatar_url ?? null,
            tags: card.tags ?? [],
            isPrimary: true,
            chatEnabled: true,
            visibleInFrontend: false,
            reusable: true,
          },
        ]
      : [null];

  const normalized = dedupeCharactersByKoreanName(rows
    .filter(Boolean)
    .map((character: Record<string, any>, index: number) => normalizeCharacter(character, index))
    .filter((character) => character.name));

  if (normalized.length && !normalized.some((character) => character.isPrimary)) {
    normalized[0] = { ...normalized[0], isPrimary: true };
  }

  return normalized;
}

function storyTextForCharacterRanking(story: UserStory) {
  const card = recordOf(story.character_card);
  const chapters = Array.isArray(card.chapters) ? card.chapters : [];
  const storyRpg = recordOf(card.storyRpg);
  const scenes = Array.isArray(storyRpg.scenes) ? storyRpg.scenes : [];
  const chapterBodies = chapters
    .map((chapter) =>
      [chapter?.title, chapter?.summary, chapter?.body]
        .map((value) => (typeof value === "string" ? value : ""))
        .join("\n"),
    )
    .join("\n");
  const sceneBodies = scenes
    .map((scene) =>
      [scene?.title, scene?.text, scene?.partnerLine, scene?.line]
        .map((value) => (typeof value === "string" ? value : ""))
        .join("\n"),
    )
    .join("\n");
  return [story.title, story.logline, story.body_text, chapterBodies, sceneBodies].filter(Boolean).join("\n");
}

function inferContentType(card: Record<string, any>): "story" | "story_rpg" {
  const storyRpg = recordOf(card.storyRpg);
  const sourceStoryId = String(storyRpg.sourceStoryId || card.sourceStoryId || "").trim();
  const hasStoryRpgScenes = Array.isArray(storyRpg.scenes) && storyRpg.scenes.length > 0;
  const hasStoryRpgConfig = Boolean(storyRpg.enabled || storyRpg.generatedFrom || hasStoryRpgScenes);
  return card.contentType === "story_rpg" && (Boolean(sourceStoryId) || hasStoryRpgConfig)
    ? "story_rpg"
    : "story";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern)).length;
}

function uniqueCharacterAliases(name: string) {
  return [...new Set([name, ...characterNameAliasKeys(name)].map((item) => item.trim()).filter(Boolean))];
}

function characterImportance(character: StoryCharacter, storyText: string, index: number) {
  const name = character.name.trim();
  if (!name) {
    return {
      mainScore: 0,
      dialogueCount: 0,
      mentionCount: 0,
      rankBias: 0,
    };
  }

  const aliases = uniqueCharacterAliases(name);
  const dialogueCount = aliases.reduce(
    (sum, alias) => sum + countMatches(storyText, new RegExp(`(?:^|\\n)\\s*${escapeRegExp(alias)}\\s*[:：]`, "g")),
    0,
  );
  const speechAttributionCount = aliases.reduce(
    (sum, alias) =>
      sum +
      countMatches(
        storyText,
        new RegExp(
          `${escapeRegExp(alias)}\\s*(?:이|가|은|는|도)?\\s*(?:말했다|물었다|대답했다|속삭였다|중얼거렸다|웃었다|소리쳤다|외쳤다|답했다|불렀다|말을 이었다|입을 열었다)`,
          "g",
        ),
      ),
    0,
  );
  const addressCount = aliases.reduce(
    (sum, alias) =>
      sum +
      countMatches(
        storyText,
        new RegExp(`${escapeRegExp(alias)}(?:야|아|씨|님|대표님|선배|오빠|형|누나|언니|사장님|실장님)`, "g"),
      ),
    0,
  );
  const mentionCount = aliases.reduce((sum, alias) => sum + countMatches(storyText, new RegExp(escapeRegExp(alias), "g")), 0);
  const hasImageBonus = character.avatarUrl ? 8 : 0;
  const primaryBonus = character.isPrimary ? 18 : 0;
  const chatBonus = character.chatEnabled ? 5 : -20;
  const insightBonus = Math.min(character.chapterInsights?.length ?? 0, 10) * 3;
  const rankBias = Math.max(0, 5 - index);
  const mainScore =
    dialogueCount * 12 +
    speechAttributionCount * 9 +
    addressCount * 5 +
    Math.min(mentionCount, 80) +
    hasImageBonus +
    primaryBonus +
    chatBonus +
    insightBonus +
    rankBias;

  return {
    mainScore,
    dialogueCount: dialogueCount + speechAttributionCount,
    mentionCount,
    rankBias,
  };
}

function rankStoryCharacters(characters: StoryCharacter[], story: UserStory) {
  const storyText = storyTextForCharacterRanking(story);
  return characters
    .map((character, index) => ({
      ...character,
      ...characterImportance(character, storyText, index),
    }))
    .sort((a, b) => {
      const primaryDelta = Number(b.isPrimary) - Number(a.isPrimary);
      if (primaryDelta !== 0) return primaryDelta;
      return b.mainScore - a.mainScore;
    })
    .map((character, index) => ({
      ...character,
      importanceScore: character.mainScore,
      rankInStory: index + 1,
    }));
}

function withVirtualAvatar(character: StoryCharacter, storyId: string): StoryCharacter {
  if (character.avatarUrl) return character;
  return {
    ...character,
    avatarUrl: createVirtualAvatarDataUrl(character, storyId),
  };
}

function toStoryRow(story: UserStory): CharacterStoryRow {
  const card = recordOf(story.character_card);
  const characters = rankStoryCharacters(charactersFromCard(card), story);
  const chapters = Array.isArray(card.chapters) ? card.chapters : [];
  const primary = characters.find((character) => character.isPrimary) ?? characters[0];
  return {
    storyId: story.id,
    storyTitle: story.title,
    contentType: inferContentType(card),
    logline: story.logline ?? "",
    coverUrl: story.cover_url,
    updatedAt: story.updated_at,
    storyOverview: asString(card.storyOverview ?? story.logline),
    activeCharacterName: primary?.name ?? asString(card.name, "캐릭터 미등록"),
    chapters: chapters.map((chapter: Record<string, any>, index: number) => ({
      id: asString(chapter.id, `chapter-${index + 1}`),
      title: asString(chapter.title, `${index + 1}화`),
      episodeNumber: Number(chapter.episodeNumber ?? index + 1) || index + 1,
      bodyChars: asString(chapter.body).length,
      summary: asString(chapter.summary),
      characterAnalysisCount: Array.isArray(chapter.characterAnalysis) ? chapter.characterAnalysis.length : 0,
      assetSlotCount: Array.isArray(chapter.assetSlots) ? chapter.assetSlots.length : 0,
    })),
    characters,
  };
}

function sanitizeCharacters(characters: StoryCharacter[]) {
  const rows = characters
    .map((character, index) =>
      normalizeCharacter(
        {
          ...character,
          id: character.id || newId("char"),
          name: character.name,
        },
        index,
      ),
    )
    .filter((character) => character.name.trim());

  const dedupedRows = dedupeCharactersByKoreanName(rows);
  if (!dedupedRows.length) return [];

  const primaryIndex = Math.max(0, dedupedRows.findIndex((character) => character.isPrimary));
  return dedupedRows.map((character, index) => ({
    ...character,
    isPrimary: index === primaryIndex,
  }));
}

async function requireStaff(): Promise<string> {
  await getFreshAccessToken();
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

async function loadStory(storyId: string): Promise<UserStory> {
  const { data, error } = await supabase
    .from("user_stories")
    .select("id,title,logline,cover_url,body_text,character_card,updated_at")
    .eq("id", storyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("스토리를 찾을 수 없습니다.");
  return data as UserStory;
}

export const listCharacterStories = createServerFn({ method: "GET" }).handler(
  async (): Promise<CharacterStoryRow[]> => {
    await requireStaff();
    return await listCharacterStoryRows();
  },
);

export const listReusableCharacters = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReusableCharacterRow[]> => {
    await requireStaff();
    const stories = await listCharacterStoryRows();
    return stories.flatMap((story) =>
      story.characters
        .filter((character) => character.reusable)
        .map((character) => ({
          ...character,
          storyId: story.storyId,
          storyTitle: story.storyTitle,
          updatedAt: story.updatedAt,
        })),
    );
  },
);

export const listPublicChatCharacters = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicChatCharacterRow[]> => {
    const { data, error } = await supabase
      .from("user_stories")
      .select("id,title,logline,cover_url,character_card,updated_at,is_public,is_listed")
      .eq("is_public", true)
      .eq("is_listed", true)
      .order("updated_at", { ascending: false })
      .limit(120);

    if (error) throw new Error(error.message);

    return (data ?? []).flatMap((story) => {
      const row = toStoryRow(story as UserStory);
      const initialAffection = initialAffectionFromCard(recordOf((story as UserStory).character_card));
      const storyText = storyTextForCharacterRanking(story as UserStory);
      const ranked = row.characters
        .filter((character) => character.chatEnabled === true && character.visibleInFrontend === true)
        .map((character, index) => ({
          character,
          ...characterImportance(character, storyText, index),
        }))
        .sort((a, b) => {
          const imageDelta = Number(Boolean(b.character.avatarUrl)) - Number(Boolean(a.character.avatarUrl));
          if (imageDelta !== 0) return imageDelta;
          return b.mainScore - a.mainScore;
        });

      return ranked
        .map((score, index) => {
          const { character } = score;
          const avatarIsVirtual = !character.avatarUrl;
          return {
            ...withVirtualAvatar(character, row.storyId),
            storyId: row.storyId,
            storyTitle: row.storyTitle,
            logline: row.logline,
            coverUrl: row.coverUrl,
            updatedAt: row.updatedAt,
            initialAffection,
            avatarIsVirtual,
            mainScore: score?.mainScore ?? 0,
            dialogueCount: score?.dialogueCount ?? 0,
            mentionCount: score?.mentionCount ?? 0,
            rankInStory: index + 1,
          };
        });
    });
  },
);

async function listCharacterStoryRows() {
  const { data, error } = await supabase
    .from("user_stories")
    .select("id,title,logline,cover_url,body_text,character_card,updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data ?? []).map((story) => toStoryRow(story as UserStory));
}

export const saveStoryCharacters = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as SaveStoryCharactersInput)
  .handler(async ({ data }) => {
    await requireStaff();
    const story = await loadStory(data.storyId);
    const card = recordOf(story.character_card);
    const characters = sanitizeCharacters(data.characters);
    const primary = characters.find((character) => character.isPrimary) ?? characters[0];

    const patch: StoryUpdate = {
      character_card: {
        ...card,
        storyOverview: asString(data.storyOverview ?? card.storyOverview ?? story.logline),
        characters,
        name: primary?.name ?? "",
        role: primary?.role ?? "",
        persona: primary?.persona ?? "",
        notes: primary?.persona ?? "",
        personality: primary?.personality ?? "",
        relationship: primary?.relationship ?? "",
        speakingStyle: primary?.speakingStyle ?? "",
        visualPrompt: primary?.visualPrompt ?? "",
        appearance: primary?.visualPrompt ?? "",
        avatarUrl: primary?.avatarUrl ?? null,
      } as any,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("user_stories").update(patch).eq("id", story.id);
    if (error) throw new Error(error.message);
    return { ok: true, story: toStoryRow({ ...story, character_card: patch.character_card as any, updated_at: patch.updated_at! }) };
  });

export const generateReusableCharacter = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as Record<string, unknown>)
  .handler(async () => {
    throw new Error("AI 캐릭터 생성은 아직 연결되지 않았습니다.");
  });

