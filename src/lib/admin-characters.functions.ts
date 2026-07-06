import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@/lib/_mock/runtime";

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
  reusable: boolean;
  showcaseAssets?: CharacterVisualAsset[];
};

export type CharacterVisualAsset = {
  id: string;
  tier: "soft" | "warm" | "spicy" | "steamy" | "premium";
  minAffection: number;
  mediaUrl: string | null;
  mediaType: "image" | "video";
  caption: string;
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

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
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
    chatEnabled: character.chatEnabled !== false,
    reusable: character.reusable !== false,
    showcaseAssets: normalizeVisualAssets(character.showcaseAssets ?? character.showcase_assets ?? character.visualAssets),
  };
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
            reusable: true,
          },
        ]
      : [null];

  const normalized = rows
    .filter(Boolean)
    .map((character: Record<string, any>, index: number) => normalizeCharacter(character, index))
    .filter((character) => character.name);

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

  const escapedName = escapeRegExp(name);
  const dialogueCount = countMatches(
    storyText,
    new RegExp(`(?:^|\\n)\\s*${escapedName}\\s*[:：]`, "g"),
  );
  const speechAttributionCount = countMatches(
    storyText,
    new RegExp(
      `${escapedName}\\s*(?:이|가|은|는)?\\s*(?:말했다|물었다|대답했다|속삭였다|중얼거렸다|웃었다|소리쳤다|입을 열었다)`,
      "g",
    ),
  );
  const addressCount = countMatches(
    storyText,
    new RegExp(`${escapedName}(?:씨|님|오빠|언니|누나|아빠|대표님|사장님)`, "g"),
  );
  const mentionCount = countMatches(storyText, new RegExp(escapedName, "g"));
  const hasImageBonus = character.avatarUrl ? 8 : 0;
  const primaryBonus = character.isPrimary ? 18 : 0;
  const chatBonus = character.chatEnabled ? 5 : -20;
  const rankBias = Math.max(0, 5 - index);
  const mainScore =
    dialogueCount * 12 +
    speechAttributionCount * 9 +
    addressCount * 5 +
    Math.min(mentionCount, 80) +
    hasImageBonus +
    primaryBonus +
    chatBonus +
    rankBias;

  return {
    mainScore,
    dialogueCount: dialogueCount + speechAttributionCount,
    mentionCount,
    rankBias,
  };
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
  const characters = charactersFromCard(card);
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

function sanitizeCharacters(characters: StoryCharacter[], storyId = "") {
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

  if (!rows.length) return [];

  const primaryIndex = Math.max(0, rows.findIndex((character) => character.isPrimary));
  return rows.map((character, index) => ({
    ...character,
    isPrimary: index === primaryIndex,
    avatarUrl: character.avatarUrl || createVirtualAvatarDataUrl(character, storyId),
  }));
}

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
      const storyText = storyTextForCharacterRanking(story as UserStory);
      const ranked = row.characters
        .filter((character) => character.chatEnabled)
        .map((character, index) => ({
          character,
          ...characterImportance(character, storyText, index),
        }))
        .filter(
          (item) =>
            item.dialogueCount > 0 ||
            item.mentionCount >= 2 ||
            item.character.isPrimary ||
            Boolean(item.character.avatarUrl),
        )
        .sort((a, b) => {
          const imageDelta = Number(Boolean(b.character.avatarUrl)) - Number(Boolean(a.character.avatarUrl));
          if (imageDelta !== 0) return imageDelta;
          return b.mainScore - a.mainScore;
        })
        .slice(0, 5)
        .sort((a, b) => b.mainScore - a.mainScore)
        .slice(0, Math.max(2, Math.min(5, row.characters.length)));

      return row.characters
        .filter((character) => ranked.some((item) => item.character.id === character.id))
        .map((character) => {
          const score = ranked.find((item) => item.character.id === character.id);
          const avatarIsVirtual = !character.avatarUrl;
          return {
            ...withVirtualAvatar(character, row.storyId),
            storyId: row.storyId,
            storyTitle: row.storyTitle,
            logline: row.logline,
            coverUrl: row.coverUrl,
            updatedAt: row.updatedAt,
            avatarIsVirtual,
            mainScore: score?.mainScore ?? 0,
            dialogueCount: score?.dialogueCount ?? 0,
            mentionCount: score?.mentionCount ?? 0,
            rankInStory: ranked.findIndex((item) => item.character.id === character.id) + 1,
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
    const characters = sanitizeCharacters(data.characters, story.id);
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

