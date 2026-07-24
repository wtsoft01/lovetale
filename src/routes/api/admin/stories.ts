import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type { AssetSlot, AssetTier, ChapterCharacterInsight, ChapterConfig } from "@/lib/admin-stories-compose.functions";
import {
  ambiguousKoreanGivenNameKeys,
  characterNameSetsLikelySame,
  cleanCharacterDisplayName,
  normalizeCharacterNameKey,
  preferredCharacterDisplayName,
} from "@/lib/character-name-match";
import { mapNormalizedProseOffset, normalizeProseLineBreaks } from "@/lib/text-normalization";
import { findChapterByLocator, findChapterIndexByLocator, stableChapterIdForStory } from "@/lib/story-chapter-locator";
import { isSuperAdminEmail } from "@/lib/staff-auth";

const STAFF_ROLES = ["admin", "editor", "moderator"] as const;
const SUPER_ADMIN_ROLES = ["admin"] as const;
const CHAPTER_SEPARATOR = "\n\n---- next episode ----\n\n";
const ensuredSuperAdminUserIds = new Set<string>();

type StaffRole = (typeof STAFF_ROLES)[number];
type UserStoryRow = Database["public"]["Tables"]["user_stories"]["Row"];
type UserStoryInsert = Database["public"]["Tables"]["user_stories"]["Insert"];
type UserStoryUpdate = Database["public"]["Tables"]["user_stories"]["Update"];
type HomeSlot = Database["public"]["Enums"]["home_slot"];
type HeatPreset = "soft" | "warm" | "spicy" | "steamy";

type ContentType = "web_novel" | "romance_sim" | "story_rpg" | "webtoon" | "short_story" | "other";

type UserStoryListRow = Pick<
  UserStoryRow,
  | "id"
  | "title"
  | "logline"
  | "cover_url"
  | "status"
  | "is_public"
  | "is_listed"
  | "price_credits"
  | "audience"
  | "max_heat"
  | "tags"
  | "character_card"
  | "user_id"
  | "created_at"
  | "updated_at"
> &
  Partial<Pick<UserStoryRow, "body_text" | "asset_slots" | "beats">>;

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

type CloneStoryRpgPayload = {
  action: "clone_story_rpg";
  sourceStoryId?: string;
  title?: string;
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

type ChapterTextPatch = {
  id: string;
  originalId?: string;
  title: string;
  episodeNumber: number;
  originalEpisodeNumber?: number;
  isFree: boolean;
  priceCredits: number;
  summary: string;
  body: string;
};

type ProductInput = {
  action: "save_product";
  id: string;
  title: string;
  contentType: ContentType;
  logline?: string | null;
  storyOverview: string;
  chapters: ChapterConfig[];
  characters: Array<Record<string, any>>;
  environment: Record<string, any>;
  coverUrl?: string | null;
  priceCredits: number;
  maxHeat: HeatPreset;
  audience: "all" | "female" | "male";
  tags: string[];
  isPublic: boolean;
  isListed: boolean;
};

type SaveBodyPayload = {
  action: "save_body";
  id: string;
  title: string;
  logline?: string | null;
  body_text: string;
  character_summary?: string;
};

type SaveSlotsPayload = {
  action: "save_slots";
  id: string;
  asset_slots: AssetSlot[];
};

type PublishPayload = {
  action: "publish_unified";
  id: string;
  price_credits: number;
  max_heat: HeatPreset;
  audience?: "all" | "female" | "male";
  tags?: string[];
  cover_url?: string | null;
};

type UnpublishPayload = {
  action: "unpublish_unified";
  id: string;
};

type CreateChapterPayload = {
  action: "create_chapter_text";
  id: string;
};

type DeleteChapterPayload = {
  action: "delete_chapter_text";
  id: string;
  chapterId: string;
};

type SaveChapterTextPayload = {
  action: "save_chapter_text";
  id: string;
  chapter: ChapterTextPatch;
};

type SaveChapterEditorPayload = {
  action: "save_chapter_editor";
  id: string;
  chapter: ChapterConfig;
  assetOnly?: boolean;
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

function defaultStoryRpgConfig(input: {
  enabled?: boolean;
  title: string;
  logline: string;
  sceneText: string;
  characterName: string;
}) {
  return {
    enabled: input.enabled ?? false,
    startSceneTitle: "첫 선택",
    startSceneText: input.sceneText || input.logline || "첫 장면을 입력하세요.",
    partnerLine: input.characterName ? `${input.characterName}이(가) 당신의 선택을 기다립니다.` : "상대가 당신의 선택을 기다립니다.",
    currentRoute: "Main Route",
    initialAffection: 0,
    initialTension: 35,
    initialTrust: 20,
    endingsTotal: 5,
    choices: [],
  };
}

function buildChapter(
  storyId: string,
  sourceText: string,
  contentType: ContentType,
  index: number,
  title?: string,
  summary?: string,
) {
  return {
    id: stableChapterIdForStory(storyId, index),
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

function toAdminStoryRow(row: UserStoryListRow) {
  const card = recordOf(row.character_card);
  const storyRpg = recordOf(card.storyRpg);
  const chapters = Array.isArray(card.chapters) ? card.chapters : [];
  const characters = Array.isArray(card.characters) ? card.characters : [];
  const rpgScenes = Array.isArray(storyRpg.scenes) ? storyRpg.scenes : [];
  const rawContentType = String(card.contentType ?? "web_novel");
  const sourceStoryId = String(storyRpg.sourceStoryId || card.sourceStoryId || "").trim() || null;
  const hasStoryRpgWork =
    Boolean(sourceStoryId) ||
    storyRpg.enabled === true ||
    Boolean(storyRpg.generatedFrom) ||
    rpgScenes.length > 0;
  const isStoryRpgWork = rawContentType === "story_rpg" && hasStoryRpgWork;
  const contentType = isStoryRpgWork
    ? "story_rpg"
    : rawContentType === "story_rpg"
      ? String(card.sourceContentType || storyRpg.sourceContentType || "web_novel")
      : rawContentType;
  const chapterRows = chapters.map((chapter: any, index: number) => {
    const body = typeof chapter?.body === "string" ? chapter.body : "";
    const assetSlots = Array.isArray(chapter?.assetSlots) ? chapter.assetSlots : [];
    return {
      id: String(chapter?.id ?? stableChapterIdForStory(row.id, chapter?.episodeNumber ?? index + 1)),
      title: String(chapter?.title ?? `Episode ${index + 1}`),
      episodeNumber: Number(chapter?.episodeNumber ?? index + 1),
      summary: String(chapter?.summary ?? ""),
      isFree: Boolean(chapter?.isFree ?? index === 0),
      priceCredits: Math.max(0, Number(chapter?.priceCredits ?? 0)),
      bodyChars: body.length,
      assetSlotsCount: assetSlots.length,
    };
  });
  const chapterBodyChars = chapterRows.reduce((sum, chapter) => sum + chapter.bodyChars, 0);
  const chapterAssetSlotsCount = chapterRows.reduce((sum, chapter) => sum + chapter.assetSlotsCount, 0);
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
    body_chars: chapterBodyChars || (typeof row.body_text === "string" ? row.body_text.length : 0),
    asset_slots_count: chapterAssetSlotsCount || (Array.isArray(row.asset_slots) ? row.asset_slots.length : 0),
    user_id: row.user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    beats_count: Array.isArray(row.beats) ? row.beats.length : 0,
  };
}

function compactText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function textIncludesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function inferEmotion(text: string) {
  if (textIncludesAny(text, ["두려", "무서", "불안", "떨", "긴장", "숨이 막", "식은땀"])) return "불안과 긴장";
  if (textIncludesAny(text, ["분노", "화가", "짜증", "노려", "소리쳤", "화를"])) return "분노와 경계";
  if (textIncludesAny(text, ["끌리", "두근", "설렘", "심장", "뜨거", "욕망"])) return "끌림과 혼란";
  if (textIncludesAny(text, ["상처", "눈물", "후회", "미안", "죄책"])) return "상처와 후회";
  if (textIncludesAny(text, ["다정", "부드럽", "웃", "안심", "따뜻"])) return "다정함과 호기심";
  return "긴장 속 호기심";
}

function inferAttitude(text: string) {
  if (textIncludesAny(text, ["명령", "붙잡", "막아", "소유", "독점", "집착"])) return "주도적이고 압박하는 태도";
  if (textIncludesAny(text, ["피하", "도망", "물러", "거절", "숨기"])) return "방어적이고 조심스러운 태도";
  if (textIncludesAny(text, ["비웃", "도발", "놀리", "장난", "능청"])) return "도발적이고 능청스러운 태도";
  if (textIncludesAny(text, ["고백", "기다", "바라", "손을", "안아"])) return "감정을 숨기지 못하는 태도";
  return "상대의 반응을 살피는 태도";
}

function inferTraits(text: string) {
  const traits = new Set<string>();
  if (textIncludesAny(text, ["차갑", "무표정", "냉정"])) traits.add("차가움");
  if (textIncludesAny(text, ["다정", "부드럽", "따뜻"])) traits.add("다정함");
  if (textIncludesAny(text, ["집착", "질투", "소유", "독점"])) traits.add("집착");
  if (textIncludesAny(text, ["비밀", "숨기", "거짓", "정체"])) traits.add("비밀스러움");
  if (textIncludesAny(text, ["위험", "협박", "명령", "압박"])) traits.add("위험함");
  if (textIncludesAny(text, ["후회", "상처", "눈물", "미안"])) traits.add("상처");
  if (!traits.size) traits.add("감정 절제");
  return [...traits].slice(0, 4);
}

function inferRelationship(text: string) {
  if (textIncludesAny(text, ["계약", "거래", "조건", "위장"])) return "조건으로 묶였지만 감정이 흔들리는 관계";
  if (textIncludesAny(text, ["상사", "대표", "CEO", "비서", "회사"])) return "권력 차이와 사적인 감정이 충돌하는 관계";
  if (textIncludesAny(text, ["친구", "소꿉친구", "첫사랑", "재회"])) return "익숙함과 설렘이 다시 섞이는 관계";
  if (textIncludesAny(text, ["비밀", "정체", "거짓", "오해"])) return "말하지 못한 진실 때문에 긴장하는 관계";
  return "서로의 속마음을 확인하지 못해 긴장하는 관계";
}

function normalizeCharacterName(value: unknown) {
  return compactText(value).replace(/[“”"'‘’『』「」()[\]{}]/g, "").trim();
}

function isGenericCharacterName(name: string) {
  const compact = normalizeCharacterName(name).replace(/\s+/g, "");
  if (!compact) return true;
  if (/^(상대주인공|주인공|캐릭터\d*|등장인물\d*|남자|여자|그|그녀|그사람)$/i.test(compact)) return true;
  if (/^(대표|CEO|상사|비서|회장|사장|남편|아내|친구|동료|직원|선생|학생)$/.test(compact)) return true;
  return compact.length < 2 || compact.length > 20;
}

function pushGroundedName(names: Set<string>, value: unknown) {
  const name = normalizeCharacterName(value);
  if (!isGenericCharacterName(name)) names.add(name);
}

function candidateCharacterNames(body: string, card: Record<string, any>) {
  const names = new Set<string>();
  const existing = Array.isArray(card.characters) ? card.characters : [];
  for (const character of existing) pushGroundedName(names, character?.name ?? character?.title);
  pushGroundedName(names, card.name);

  const dialogueLabels = body.matchAll(/(?:^|\n)\s*([가-힣A-Za-z][가-힣A-Za-z0-9 _-]{1,18})\s*[:：]/g);
  for (const match of dialogueLabels) pushGroundedName(names, match[1]);

  const speechAttributions = body.matchAll(
    /([가-힣A-Za-z][가-힣A-Za-z0-9 _-]{1,18})\s*(?:이|가|은|는|도)?\s*(?:말했다|물었다|대답했다|속삭였다|중얼거렸다|웃었다|소리쳤다|외쳤다|답했다|불렀다|말을 이었다)/g,
  );
  for (const match of speechAttributions) pushGroundedName(names, match[1]);

  const addressPatterns = body.matchAll(/(?:^|[\s“"'‘『「])([가-힣]{2,4})(?:야|아|씨|님|대표님|선배|오빠|형|누나|언니)(?=[,.\s?!…」』”"'])/g);
  for (const match of addressPatterns) pushGroundedName(names, match[1]);

  const stopWords = new Set([
    "나는",
    "내가",
    "그는",
    "그녀",
    "그가",
    "그때",
    "순간",
    "머리",
    "눈앞",
    "입술",
    "손끝",
    "계약",
    "비밀",
    "사람",
    "남자",
    "여자",
    "대표",
    "상사",
    "회장",
    "비서",
  ]);
  const nameLike = body.matchAll(/\b([가-힣]{2,4})(?:은|는|이|가|에게|와|과|의|를|을)\b/g);
  for (const match of nameLike) {
    const name = normalizeCharacterName(match[1]);
    if (!stopWords.has(name)) pushGroundedName(names, name);
    if (names.size >= 8) break;
  }

  return [...names].slice(0, 6);
}

function evidenceForName(body: string, name: string) {
  const sentences = body
    .split(/(?<=[.!?。！？]|다\.|요\.|까\.)\s+|\n+/)
    .map((sentence) => compactText(sentence))
    .filter((sentence) => sentence.length > 12);
  const named = sentences.find((sentence) => sentence.includes(name));
  return (named ?? sentences[0] ?? compactText(body).slice(0, 160)).slice(0, 220);
}

function analyzeChapterCharacters(
  chapter: Pick<ChapterConfig, "id" | "title" | "episodeNumber" | "summary" | "body">,
  card: Record<string, any>,
): ChapterCharacterInsight[] {
  const source = compactText([chapter.title, chapter.summary, chapter.body].filter(Boolean).join(" "));
  if (!source) return [];
  return candidateCharacterNames(chapter.body || source, card).map((name, index) => {
    const evidence = evidenceForName(chapter.body || source, name);
    const context = compactText([evidence, chapter.summary, source.slice(0, 700)].join(" "));
    const emotion = inferEmotion(context);
    const attitude = inferAttitude(context);
    const traits = inferTraits(context);
    const relationship = inferRelationship(context);
    return {
      id: `char_insight_${chapter.id}_${index}`,
      name,
      role: index === 0 ? "주요 대화 상대" : "등장 인물",
      emotion,
      attitude,
      traits,
      relationship,
      evidence,
      chatGuidance: `${name}은(는) 이 회차에서 ${emotion}을(를) 품고 있으며, ${attitude}로 반응한다. 채팅에서는 ${traits.join(", ")} 성향과 ${relationship}를 유지한다.`,
    };
  });
}

function mergeCharacterInsights(card: Record<string, any>, chapters: ChapterConfig[]) {
  const existing = Array.isArray(card.characters) ? card.characters : [];
  const blockedGivenKeys = ambiguousKoreanGivenNameKeys([
    ...existing.map((character) => [
      String(character?.name ?? character?.title ?? ""),
      ...(Array.isArray(character?.duplicateAliases) ? character.duplicateAliases : []),
    ]),
    ...chapters.flatMap((chapter) =>
      (chapter.characterAnalysis ?? []).map((insight) => [String(insight.name ?? "")]),
    ),
  ]);
  const byName = new Map<string, any>();
  const findKey = (name: string, duplicateAliases: unknown[] = [], duplicateExclusions: unknown[] = []) => {
    const key = normalizeCharacterNameKey(name);
    if (byName.has(key)) return key;
    const names = [name, ...duplicateAliases.map((alias) => String(alias ?? ""))];
    for (const [currentKey, character] of byName.entries()) {
      const aliases = [character?.name, ...(Array.isArray(character?.duplicateAliases) ? character.duplicateAliases : [])];
      if (
        characterNameSetsLikelySame(aliases.map((alias) => String(alias ?? currentKey)), names, {
          blockedGivenKeys,
          aExcludedNames: Array.isArray(character?.duplicateExclusions) ? character.duplicateExclusions : [],
          bExcludedNames: duplicateExclusions.map((alias) => String(alias ?? "")),
        })
      ) {
        return currentKey;
      }
    }
    return key;
  };
  const setCharacter = (key: string, character: Record<string, any>) => {
    const name = compactText(character.name);
    const current = byName.get(key) ?? {};
    const preferredName = preferredCharacterDisplayName(String(current.name ?? ""), name) || name;
    const preferredKey = normalizeCharacterNameKey(preferredName);
    const duplicateAliases = [
      current.name,
      name,
      ...(Array.isArray(current.duplicateAliases) ? current.duplicateAliases : []),
      ...(Array.isArray(character.duplicateAliases) ? character.duplicateAliases : []),
    ]
      .map((value) => cleanCharacterDisplayName(compactText(value)))
      .filter((value) => value && normalizeCharacterNameKey(value) !== normalizeCharacterNameKey(preferredName));
    const mergedNameKeys = new Set([preferredName, ...duplicateAliases].map(normalizeCharacterNameKey).filter(Boolean));
    const duplicateExclusions = [
      ...(Array.isArray(current.duplicateExclusions) ? current.duplicateExclusions : []),
      ...(Array.isArray(character.duplicateExclusions) ? character.duplicateExclusions : []),
    ]
      .map((value) => cleanCharacterDisplayName(compactText(value)))
      .filter((value) => value && !mergedNameKeys.has(normalizeCharacterNameKey(value)));
    if (preferredKey && preferredKey !== key) byName.delete(key);
    byName.set(preferredKey || key, {
      ...character,
      name: preferredName || name,
      duplicateAliases: [...new Set(duplicateAliases)].slice(0, 8),
      duplicateExclusions: [...new Set(duplicateExclusions)].slice(0, 20),
    });
  };
  for (const character of existing) {
    const name = compactText(character?.name ?? character?.title);
    if (name) {
      setCharacter(
        findKey(
          name,
          Array.isArray(character?.duplicateAliases) ? character.duplicateAliases : [],
          Array.isArray(character?.duplicateExclusions) ? character.duplicateExclusions : [],
        ),
        { ...character, name },
      );
    }
  }

  for (const chapter of chapters) {
    for (const insight of chapter.characterAnalysis ?? []) {
      const key = findKey(insight.name);
      const current = byName.get(key) ?? {
        id: `char_${insight.name.replace(/\s+/g, "_")}`,
        name: insight.name,
        role: insight.role,
        visualPrompt: "",
        avatarUrl: null,
      };
      const chapterInsights = Array.isArray(current.chapterInsights) ? current.chapterInsights : [];
      const nextInsights = [
        ...chapterInsights.filter((item: any) => item.chapterId !== chapter.id),
        {
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          episodeNumber: chapter.episodeNumber,
          emotion: insight.emotion,
          attitude: insight.attitude,
          traits: insight.traits,
          relationship: insight.relationship,
          evidence: insight.evidence,
          chatGuidance: insight.chatGuidance,
        },
      ].slice(-12);
      const displayName = preferredCharacterDisplayName(current.name, insight.name) || insight.name;
      setCharacter(key, {
        ...current,
        name: displayName,
        id: current.id || `char_${displayName.replace(/\s+/g, "_")}`,
        role: current.role || insight.role,
        personality: compactText([current.personality, insight.traits.join(", ")].filter(Boolean).join(" / ")).slice(0, 500),
        relationship: current.relationship || insight.relationship,
        notes: insight.chatGuidance,
        persona: current.persona || insight.chatGuidance,
        speakingStyle: current.speakingStyle || "회차의 감정선에 맞춰 짧고 몰입감 있게 반응합니다.",
        chatEnabled: current.chatEnabled ?? true,
        reusable: current.reusable ?? true,
        chapterInsights: nextInsights,
      });
    }
  }

  return [...byName.values()];
}

function buildChaptersFromRow(row: any): ChapterConfig[] {
  const card = recordOf(row?.character_card);
  const raw = Array.isArray(card.chapters) ? card.chapters : [];
  const topBody = String(row?.body_text ?? "");
  const topSlots = Array.isArray(row?.asset_slots) ? (row.asset_slots as AssetSlot[]) : [];
  if (raw.length) {
    const anyHasBody = raw.some((chapter: any) => typeof chapter.body === "string" && chapter.body.length > 0);
    return raw.map((chapter: any, index: number) => {
      const episodeNumber = Math.max(1, Math.floor(Number(chapter.episodeNumber || index + 1) || index + 1));
      return {
        id: String(chapter.id || stableChapterIdForStory(row?.id, episodeNumber)),
        title: String(chapter.title || `Episode ${index + 1}`),
        episodeNumber,
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
        characterAnalysis: Array.isArray(chapter.characterAnalysis) ? (chapter.characterAnalysis as ChapterCharacterInsight[]) : [],
      };
    });
  }
  return [
    {
      id: stableChapterIdForStory(row?.id, 1),
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

function findChapterIndexForPatch(
  chapters: ChapterConfig[],
  patch: { id?: unknown; originalId?: unknown; title?: unknown; episodeNumber?: unknown; originalEpisodeNumber?: unknown },
) {
  const locators = [patch.id, patch.originalId, patch.originalEpisodeNumber, patch.episodeNumber, patch.title];
  for (const locator of locators) {
    const index = findChapterIndexByLocator(chapters, locator);
    if (index >= 0) return index;
  }
  return chapters.length === 1 ? 0 : -1;
}

function chapterNotFoundError(
  action: string,
  chapters: ChapterConfig[],
  patchOrLocator: { id?: unknown; originalId?: unknown; title?: unknown; episodeNumber?: unknown; originalEpisodeNumber?: unknown } | unknown,
) {
  const values =
    patchOrLocator && typeof patchOrLocator === "object"
      ? [
          (patchOrLocator as any).id,
          (patchOrLocator as any).originalId,
          (patchOrLocator as any).originalEpisodeNumber,
          (patchOrLocator as any).episodeNumber,
          (patchOrLocator as any).title,
        ]
      : [patchOrLocator];
  const requested = values.map(String).map((value) => value.trim()).filter(Boolean).join(", ") || "empty";
  const available =
    chapters
      .slice(0, 12)
      .map((chapter) => `${chapter.episodeNumber}화:${chapter.id}`)
      .join(", ") || "none";
  return new Error(`Chapter not found (${action}). requested=${requested}; available=${available}`);
}

function flattenChapters(chapters: ChapterConfig[]) {
  let body = "";
  const slots: AssetSlot[] = [];
  chapters.forEach((chapter, index) => {
    if (index > 0) body += CHAPTER_SEPARATOR;
    const base = body.length;
    for (const slot of chapter.assetSlots) {
      slots.push({ ...slot, offset: base + Math.max(0, Math.min(chapter.body.length, slot.offset)) });
    }
    body += chapter.body;
  });
  return { body, slots };
}

function makeChapterTextSummary(chapter: ChapterConfig) {
  return {
    id: chapter.id,
    title: chapter.title,
    episodeNumber: chapter.episodeNumber,
    summary: chapter.summary,
    isFree: chapter.isFree,
    priceCredits: chapter.priceCredits,
    bodyChars: chapter.body.length,
    assetSlotsCount: chapter.assetSlots.length,
  };
}

async function loadStoryForChapters(id: string): Promise<UserStoryRow | null> {
  const { data, error } = await supabaseAdmin
    .from("user_stories")
    .select("id,user_id,title,logline,cover_url,price_credits,max_heat,audience,tags,is_public,is_listed,status,character_card,body_text,asset_slots,compose_step")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UserStoryRow | null) ?? null;
}

async function loadOrCreateDraft(id: string, userId: string): Promise<UserStoryRow> {
  const existing = await loadStoryForChapters(id);
  if (existing) return existing;

  const draft: UserStoryInsert = {
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

  const { data, error } = await supabaseAdmin.from("user_stories").insert(draft as any).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

async function saveStoryData(id: string, values: UserStoryUpdate, userId: string) {
  const { data, error } = await supabaseAdmin.from("user_stories").update(values as any).eq("id", id).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;

  const draft: UserStoryInsert = {
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

  const { error: insertError } = await supabaseAdmin.from("user_stories").insert(draft as any);
  if (insertError) throw new Error(insertError.message);
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
  if (isSuperAdminEmail(email)) {
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
    .select("id,title,logline,cover_url,status,is_public,is_listed,price_credits,audience,max_heat,tags,character_card,user_id,created_at,updated_at")
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
    chapters.push(buildChapter(targetStoryId, sourceText, contentType, nextEpisodeNumber, episodeTitle, episodeSummary));
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

  const newStoryId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : newId("story");
  const chapter = sourceText ? buildChapter(newStoryId, sourceText, contentType, 1, episodeTitleInput, episodeSummary) : null;
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
    id: newStoryId,
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
      storyRpg: defaultStoryRpgConfig({
        enabled: contentType === "story_rpg",
        title: safeTitle,
        logline: logline || storyOverview,
        sceneText: sourceText,
        characterName,
      }),
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

async function cloneStoryAsRpg(request: Request, body: CloneStoryRpgPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const sourceStoryId = String(body.sourceStoryId ?? "").trim();
  if (!sourceStoryId) return jsonError("missing_source_story_id");

  const { data: source, error: readError } = await supabaseAdmin
    .from("user_stories")
    .select("*")
    .eq("id", sourceStoryId)
    .maybeSingle();
  if (readError) return jsonServerError(readError, 500);
  if (!source) return jsonError("source_story_not_found", 404);

  const card = recordOf(source.character_card);
  const sourceContentType = String(card.contentType ?? "web_novel");
  if (sourceContentType === "story_rpg") return jsonError("source_already_story_rpg", 400);

  const now = new Date().toISOString();
  const title = String(body.title ?? "").trim() || `${source.title} RPG`;
  const storyOverview = String(card.storyOverview ?? source.logline ?? "").trim();
  const insert = normalizeStoryInsert({
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : newId("story"),
    user_id: staff.userId,
    title,
    logline: source.logline,
    cover_url: source.cover_url,
    body_text: source.body_text ?? "",
    beats: Array.isArray(source.beats) ? source.beats : [],
    asset_slots: Array.isArray(source.asset_slots) ? source.asset_slots : [],
    character_card: {
      ...card,
      contentType: "story_rpg",
      sourceStoryId,
      sourceContentType,
      storyOverview,
      storyRpg: {
        ...recordOf(card.storyRpg),
        ...defaultStoryRpgConfig({
          enabled: true,
          title,
          logline: source.logline ?? storyOverview,
          sceneText: String(source.body_text ?? "").slice(0, 1200),
          characterName: String(card.name ?? ""),
        }),
        sourceStoryId,
        sourceTitle: source.title,
        generatedFrom: "source_story_clone",
      },
    },
    status: "draft",
    is_public: false,
    is_listed: false,
    price_credits: source.price_credits ?? 0,
    audience: source.audience ?? "all",
    max_heat: source.max_heat ?? "warm",
    tags: [...new Set([...(source.tags ?? []), "스토리게임"])],
    compose_step: "story_rpg",
    source_prompt: `story_rpg_clone:${sourceStoryId}`,
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

  const now = new Date().toISOString();

  if (!normalizedSlots.length) {
    const { error: unlistError } = await supabaseAdmin
      .from("user_stories")
      .update({
        status: "draft",
        is_public: false,
        is_listed: false,
        updated_at: now,
      })
      .eq("id", id);
    if (unlistError) return jsonServerError(unlistError, 500);
    return Response.json({ ok: true });
  }

  const sortOrder = Math.max(0, Math.floor(Number(body.sort_order) || 0));
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

async function getCompose(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  if (!id) return jsonError("missing_id");

  const row = await loadOrCreateDraft(id, staff.userId);
  return Response.json({
    ok: true,
    compose: {
      id: row.id,
      title: row.title,
      logline: row.logline ?? "",
      cover_url: row.cover_url,
      price_credits: row.price_credits,
      max_heat: (row.max_heat as HeatPreset) ?? "warm",
      audience: row.audience ?? "all",
      tags: row.tags ?? [],
      is_public: Boolean(row.is_public),
      is_listed: Boolean(row.is_listed),
      compose_step: (row.compose_step as "body" | "assets" | "published") ?? "body",
      chapters: buildChaptersFromRow(row),
      character_card: recordOf(row.character_card),
    },
  });
}

async function getChapterEditor(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  const chapterId = String(url.searchParams.get("chapterId") ?? "").trim();
  if (!id) return jsonError("missing_id");
  if (!chapterId) return jsonError("missing_chapter_id");

  const row = await loadStoryForChapters(id);
  if (!row) return jsonError("story_not_found", 404);

  const card = recordOf(row.character_card);
  const chapters = buildChaptersFromRow(row);
  const chapter = findChapterByLocator(chapters, chapterId);
  if (!chapter) throw chapterNotFoundError("editor_load", chapters, chapterId);

  const assetLibrary: Array<{
    key: string;
    url: string;
    type: "image" | "video";
    tier: HeatPreset;
    caption: string | null;
    scene: string;
  }> = [];
  const seen = new Set<string>();
  for (const item of chapters) {
    for (const slot of item.assetSlots) {
      if (!slot.media_url || !slot.media_type || seen.has(slot.media_url)) continue;
      seen.add(slot.media_url);
      assetLibrary.push({
        key: slot.id,
        url: slot.media_url,
        type: slot.media_type === "video" ? "video" : "image",
        tier: (slot.heat_tier as HeatPreset) ?? "warm",
        caption: slot.caption,
        scene: slot.scene_description ?? "",
      });
    }
  }

  return Response.json({
    ok: true,
    editor: {
      id: row.id,
      title: row.title,
      cover_url: row.cover_url,
      contentType: (card.contentType as ContentType) ?? "web_novel",
      activeCharacterName: String(card.characters?.[0]?.name || card.name || "캐릭터 미등록"),
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
    },
  });
}

async function getChapterText(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  const chapterId = String(url.searchParams.get("chapterId") ?? "").trim();
  if (!id) return jsonError("missing_id");
  if (!chapterId) return jsonError("missing_chapter_id");

  const row = await loadStoryForChapters(id);
  if (!row) return jsonError("story_not_found", 404);

  const chapters = buildChaptersFromRow(row);
  const chapter = findChapterByLocator(chapters, chapterId);
  if (!chapter) throw chapterNotFoundError("text_load", chapters, chapterId);

  return Response.json({
    ok: true,
    text: {
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
        characterAnalysis: chapter.characterAnalysis ?? [],
      },
    },
  });
}

async function saveProduct(request: Request, body: ProductInput) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const { body: flatBody, slots: flatSlots } = flattenChapters(body.chapters);
  const main = body.characters[0];
  const isPublished = body.isPublic && body.isListed;
  await saveStoryData(
    body.id,
    {
      title: body.title,
      logline: body.logline ?? null,
      body_text: flatBody,
      asset_slots: flatSlots as any,
      cover_url: body.coverUrl ?? null,
      price_credits: Math.max(0, Math.floor(body.priceCredits || 0)),
      max_heat: body.maxHeat,
      audience: body.audience,
      tags: body.tags.slice(0, 12),
      is_public: body.isPublic,
      is_listed: body.isListed,
      status: isPublished ? "published" : "draft",
      compose_step: isPublished ? "published" : flatSlots.length ? "assets" : "body",
      character_card: {
        contentType: body.contentType,
        storyOverview: body.storyOverview,
        chapters: body.chapters,
        characters: body.characters,
        environment: body.environment,
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
    staff.userId,
  );
  return Response.json({ ok: true });
}

async function saveChapterEditor(request: Request, body: SaveChapterEditorPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const row = await loadStoryForChapters(body.id);
  if (!row) return jsonError("story_not_found", 404);

  const card = recordOf(row.character_card);
  const chapters = buildChaptersFromRow(row);
  const index = findChapterIndexForPatch(chapters, body.chapter);
  if (index < 0) throw chapterNotFoundError("editor_save", chapters, body.chapter);

  const assetOnly = Boolean(body.assetOnly);
  const currentChapter = chapters[index];
  const rawBody = assetOnly ? String(currentChapter.body ?? "") : String(body.chapter.body ?? "");
  const normalizedBody = assetOnly ? String(currentChapter.body ?? "") : normalizeProseLineBreaks(rawBody);
  const nextAssetSlots = (Array.isArray(body.chapter.assetSlots) ? body.chapter.assetSlots : []).map((slot) => ({
    ...slot,
    offset: assetOnly
      ? Math.max(0, Math.min(normalizedBody.length, Math.floor(Number(slot.offset) || 0)))
      : mapNormalizedProseOffset(rawBody, slot.offset),
  }));
  const nextChapters = chapters.map((item, itemIndex) =>
    itemIndex === index
      ? {
          ...item,
          id: item.id,
          title: assetOnly ? item.title : String(body.chapter.title ?? "").trim() || item.title,
          episodeNumber: assetOnly ? item.episodeNumber : Math.max(1, Number(body.chapter.episodeNumber) || item.episodeNumber),
          isFree: assetOnly ? item.isFree : Boolean(body.chapter.isFree),
          priceCredits: assetOnly ? item.priceCredits : Math.max(0, Number(body.chapter.priceCredits) || 0),
          summary: assetOnly ? item.summary : String(body.chapter.summary ?? item.summary),
          body: normalizedBody,
          assetSlots: nextAssetSlots,
          characterAnalysis: assetOnly
            ? item.characterAnalysis ?? []
            : analyzeChapterCharacters(
                {
                  id: item.id,
                  title: String(body.chapter.title ?? item.title),
                  episodeNumber: Math.max(1, Number(body.chapter.episodeNumber) || item.episodeNumber),
                  summary: String(body.chapter.summary ?? item.summary),
                  body: normalizedBody,
                },
                card,
              ),
        }
      : item,
  );
  const { body: flatBody, slots: flatSlots } = flattenChapters(nextChapters);

  await saveStoryData(
    body.id,
    assetOnly
      ? {
          asset_slots: flatSlots as any,
          character_card: {
            ...card,
            chapters: nextChapters,
            characters: Array.isArray(card.characters) ? card.characters : mergeCharacterInsights(card, nextChapters),
          } as any,
          compose_step: flatSlots.length ? "assets" : "body",
          updated_at: new Date().toISOString(),
        }
      : {
          body_text: flatBody,
          asset_slots: flatSlots as any,
          character_card: {
            ...card,
            chapters: nextChapters,
            characters: mergeCharacterInsights(card, nextChapters),
          } as any,
          compose_step: flatSlots.length ? "assets" : "body",
          updated_at: new Date().toISOString(),
        },
    staff.userId,
  );
  return Response.json({ ok: true, chapter: makeChapterTextSummary(nextChapters[index]) });
}

async function saveChapterText(request: Request, body: SaveChapterTextPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const row = await loadStoryForChapters(body.id);
  if (!row) return jsonError("story_not_found", 404);

  const card = recordOf(row.character_card);
  const chapters = buildChaptersFromRow(row);
  const index = findChapterIndexForPatch(chapters, body.chapter);
  if (index < 0) throw chapterNotFoundError("text_save", chapters, body.chapter);

  const rawBody = String(body.chapter.body ?? "");
  const normalizedBody = normalizeProseLineBreaks(rawBody);
  const nextChapters = chapters.map((item, itemIndex) =>
    itemIndex === index
      ? {
          ...item,
          title: String(body.chapter.title ?? "").trim() || item.title,
          episodeNumber: Math.max(1, Math.floor(Number(body.chapter.episodeNumber) || item.episodeNumber)),
          isFree: Boolean(body.chapter.isFree),
          priceCredits: Math.max(0, Math.floor(Number(body.chapter.priceCredits) || 0)),
          summary: String(body.chapter.summary ?? ""),
          body: normalizedBody,
          assetSlots: item.assetSlots.map((slot) => ({
            ...slot,
            offset: mapNormalizedProseOffset(rawBody, slot.offset),
          })),
          characterAnalysis: analyzeChapterCharacters(
            {
              id: item.id,
              title: String(body.chapter.title ?? item.title),
              episodeNumber: Math.max(1, Math.floor(Number(body.chapter.episodeNumber) || item.episodeNumber)),
              summary: String(body.chapter.summary ?? ""),
              body: normalizedBody,
            },
            card,
          ),
        }
      : item,
  );
  const { body: flatBody, slots: flatSlots } = flattenChapters(nextChapters);

  await saveStoryData(
    body.id,
    {
      body_text: flatBody,
      asset_slots: flatSlots as any,
      character_card: {
        ...card,
        chapters: nextChapters,
        characters: mergeCharacterInsights(card, nextChapters),
      } as any,
      compose_step: flatSlots.length ? "assets" : "body",
      updated_at: new Date().toISOString(),
    },
    staff.userId,
  );
  return Response.json({
    ok: true,
    chapter: makeChapterTextSummary(nextChapters[index]),
    characterAnalysis: nextChapters[index]?.characterAnalysis ?? [],
  });
}

async function createChapterText(request: Request, body: CreateChapterPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const row = await loadStoryForChapters(body.id);
  if (!row) return jsonError("story_not_found", 404);

  const card = recordOf(row.character_card);
  const chapters = buildChaptersFromRow(row);
  const nextEpisode = chapters.reduce((max, item) => Math.max(max, Math.floor(Number(item.episodeNumber) || 0)), 0) + 1;
  const chapter: ChapterConfig = {
    id: stableChapterIdForStory(row.id, nextEpisode),
    title: `${nextEpisode}화`,
    episodeNumber: nextEpisode,
    isFree: false,
    priceCredits: 0,
    summary: "",
    body: "",
    assetSlots: [],
    characterAnalysis: [],
  };
  const nextChapters = [...chapters, chapter];
  const { body: flatBody, slots: flatSlots } = flattenChapters(nextChapters);

  await saveStoryData(
    body.id,
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
    staff.userId,
  );

  return Response.json({ ok: true, chapter: makeChapterTextSummary(chapter) });
}

async function deleteChapterText(request: Request, body: DeleteChapterPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const row = await loadStoryForChapters(body.id);
  if (!row) return jsonError("story_not_found", 404);

  const card = recordOf(row.character_card);
  const chapters = buildChaptersFromRow(row);
  if (chapters.length <= 1) return jsonError("chapter_minimum_required");

  const index = findChapterIndexByLocator(chapters, body.chapterId);
  if (index < 0) throw chapterNotFoundError("delete", chapters, body.chapterId);

  const deleted = chapters[index];
  const nextChapters = chapters.filter((_, itemIndex) => itemIndex !== index);
  const activeChapterId = nextChapters[Math.min(index, nextChapters.length - 1)]?.id ?? null;
  const remainingChapterIds = new Set(nextChapters.map((chapter) => chapter.id));
  const prunedCharacters = Array.isArray(card.characters)
    ? card.characters.map((character: any) => ({
        ...character,
        chapterInsights: Array.isArray(character?.chapterInsights)
          ? character.chapterInsights.filter((insight: any) => remainingChapterIds.has(String(insight?.chapterId ?? "")))
          : character?.chapterInsights,
      }))
    : card.characters;
  const nextCard = { ...card, characters: prunedCharacters };
  const { body: flatBody, slots: flatSlots } = flattenChapters(nextChapters);

  await saveStoryData(
    body.id,
    {
      body_text: flatBody,
      asset_slots: flatSlots as any,
      character_card: {
        ...nextCard,
        chapters: nextChapters,
        characters: mergeCharacterInsights(nextCard, nextChapters),
      } as any,
      compose_step: flatSlots.length ? "assets" : "body",
      updated_at: new Date().toISOString(),
    },
    staff.userId,
  );

  return Response.json({
    ok: true,
    deletedChapterId: deleted.id,
    activeChapterId,
    chapters: nextChapters.map(makeChapterTextSummary),
  });
}

async function saveBody(request: Request, body: SaveBodyPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const row = await loadOrCreateDraft(body.id, staff.userId);
  const card = recordOf(row.character_card);
  const chapters = buildChaptersFromRow(row);
  const normalizedBody = normalizeProseLineBreaks(body.body_text);
  const nextChapters =
    chapters.length <= 1
      ? [
          {
            ...chapters[0],
            title: chapters[0]?.title || "Episode 1",
            episodeNumber: chapters[0]?.episodeNumber || 1,
            body: normalizedBody,
          },
        ]
      : chapters;

  await saveStoryData(
    body.id,
    {
      title: body.title,
      logline: body.logline ?? null,
      body_text: normalizedBody,
      compose_step: "assets",
      character_card:
        body.character_summary !== undefined
          ? ({ ...card, chapters: nextChapters, notes: body.character_summary } as any)
          : ({ ...card, chapters: nextChapters } as any),
      updated_at: new Date().toISOString(),
    },
    staff.userId,
  );
  return Response.json({ ok: true });
}

async function saveSlots(request: Request, body: SaveSlotsPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  await saveStoryData(
    body.id,
    {
      asset_slots: body.asset_slots as any,
      compose_step: body.asset_slots.length ? "assets" : "body",
      updated_at: new Date().toISOString(),
    },
    staff.userId,
  );
  return Response.json({ ok: true });
}

async function publishUnified(request: Request, body: PublishPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  await saveStoryData(
    body.id,
    {
      price_credits: Math.max(0, Math.floor(body.price_credits || 0)),
      max_heat: body.max_heat,
      audience: body.audience ?? "all",
      tags: body.tags,
      is_public: true,
      is_listed: true,
      status: "published",
      compose_step: "published",
      ...(body.cover_url !== undefined ? { cover_url: body.cover_url } : {}),
      updated_at: new Date().toISOString(),
    },
    staff.userId,
  );
  return Response.json({ ok: true });
}

async function unpublishUnified(request: Request, body: UnpublishPayload) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  await saveStoryData(
    body.id,
    {
      is_public: false,
      is_listed: false,
      status: "draft",
      compose_step: "assets",
      updated_at: new Date().toISOString(),
    },
    staff.userId,
  );
  return Response.json({ ok: true });
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
          if (mode === "compose") return await getCompose(request);
          if (mode === "chapter-editor") return await getChapterEditor(request);
          if (mode === "chapter-text") return await getChapterText(request);
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
            | CloneStoryRpgPayload
            | SetPlacementPayload
            | RestoreVersionPayload
            | ProductInput
            | SaveBodyPayload
            | SaveSlotsPayload
            | PublishPayload
            | UnpublishPayload
            | CreateChapterPayload
            | DeleteChapterPayload
            | SaveChapterTextPayload
            | SaveChapterEditorPayload;
          if (body.action === "bulk_status") return await bulkStatus(request, body);
          if (body.action === "bulk_delete") return await bulkDelete(request, body);
          if (body.action === "clone_story_rpg") return await cloneStoryAsRpg(request, body);
          if (body.action === "set_home_placement") return await setPlacement(request, body);
          if (body.action === "restore_version") return await restoreVersion(request, body);
          if (body.action === "save_product") return await saveProduct(request, body);
          if (body.action === "save_body") return await saveBody(request, body);
          if (body.action === "save_slots") return await saveSlots(request, body);
          if (body.action === "publish_unified") return await publishUnified(request, body);
          if (body.action === "unpublish_unified") return await unpublishUnified(request, body);
          if (body.action === "create_chapter_text") return await createChapterText(request, body);
          if (body.action === "delete_chapter_text") return await deleteChapterText(request, body);
          if (body.action === "save_chapter_text") return await saveChapterText(request, body);
          if (body.action === "save_chapter_editor") return await saveChapterEditor(request, body);
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
