import { createServerFn } from "@/lib/_mock/runtime";
import { supabase } from "@/integrations/supabase/client";
import { storyRpgFallbackImages, type StoryRpg, type StoryRpgAsset, type StoryRpgChoice, type StoryRpgScene } from "@/lib/story-rpg-data";

type ApiPayload<T> = { ok: true } & T;

function recordOf(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function arrayOf<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: unknown, fallback: number) {
  return Math.max(0, Math.min(100, asNumber(value, fallback)));
}

function compactText(value: unknown, fallback = "") {
  return asText(value, fallback).replace(/\s+/g, " ").trim();
}

function chapterTitle(chapter: Record<string, any>, fallback: string) {
  return asText(chapter.title, asText(chapter.name, fallback));
}

function chapterBody(chapter: Record<string, any>) {
  return compactText(chapter.body, compactText(chapter.content, compactText(chapter.text, compactText(chapter.summary))));
}

function normalizeChoice(value: Record<string, any>, index: number): StoryRpgChoice {
  return {
    label: asText(value.label, `${index + 1}번 선택지`),
    effect: asText(value.effect, "관계 변화"),
    tone: asText(value.tone, "선택"),
    result: asText(value.result, "선택에 따라 다음 장면의 분위기가 달라집니다."),
    routeHint: asText(value.routeHint, asText(value.route, "Main Route")),
    image: asText(value.image, asText(value.imageUrl, asText(value.image_url, asText(value.mediaUrl, asText(value.media_url))))) || undefined,
    nextSceneId: asText(value.nextSceneId, asText(value.nextScene, "")) || undefined,
    affectionDelta: asNumber(value.affectionDelta, 1),
    tensionDelta: asNumber(value.tensionDelta, 0),
    trustDelta: asNumber(value.trustDelta, 1),
  };
}

const TIER_MIN_AFFECTION: Record<StoryRpgAsset["tier"], number> = {
  soft: 0,
  warm: 35,
  spicy: 65,
  steamy: 85,
  premium: 95,
};

function normalizeAsset(value: Record<string, any>, index: number, fallbackTier: StoryRpgAsset["tier"] = "soft"): StoryRpgAsset | null {
  const url = asText(value.media_url, asText(value.mediaUrl, asText(value.url)));
  if (!url) return null;
  const tierValue = asText(value.heat_tier, asText(value.tier, fallbackTier)) as StoryRpgAsset["tier"];
  const tier: StoryRpgAsset["tier"] = ["soft", "warm", "spicy", "steamy", "premium"].includes(tierValue)
    ? tierValue
    : fallbackTier;
  return {
    id: asText(value.id, `asset-${index + 1}`),
    url,
    type: value.media_type === "video" || value.mediaType === "video" ? "video" : "image",
    tier,
    minAffection: clamp(value.minAffection ?? value.min_affection, TIER_MIN_AFFECTION[tier]),
    caption: asText(value.caption, tier === "soft" ? "기본 해금 이미지" : "호감도 해금 이미지"),
  };
}

function visualAssetsFromStory(row: any, card: Record<string, any>, characters: Record<string, any>[]): StoryRpgAsset[] {
  const chapterAssets = arrayOf<Record<string, any>>(card.chapters).flatMap((chapter) =>
    arrayOf<Record<string, any>>(chapter.assetSlots),
  );
  const rootAssets = arrayOf<Record<string, any>>(row?.asset_slots);
  const characterAssets = characters.flatMap((character) =>
    arrayOf<Record<string, any>>(character.showcaseAssets ?? character.showcase_assets ?? character.visualAssets),
  );
  const seen = new Set<string>();
  return [...chapterAssets, ...rootAssets, ...characterAssets]
    .map((asset, index) => normalizeAsset(asset, index))
    .filter((asset): asset is StoryRpgAsset => Boolean(asset))
    .filter((asset) => {
      const key = `${asset.url}:${asset.tier}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 18);
}

function normalizeScene(value: Record<string, any>, index: number, fallbackChoices: StoryRpgChoice[]): StoryRpgScene {
  const sceneChoices = arrayOf<Record<string, any>>(value.choices).map(normalizeChoice);
  return {
    id: asText(value.id, `scene-${index + 1}`),
    title: asText(value.title, `Scene ${index + 1}`),
    text: asText(value.text, asText(value.body, "다음 선택을 기다리는 장면입니다.")),
    partnerLine: asText(value.partnerLine, asText(value.line, "네 선택을 기다리고 있어.")),
    choices: sceneChoices.length ? sceneChoices : index === 0 ? fallbackChoices : [],
  };
}

const GENERIC_CHOICE_PATTERNS = [
  /조심스럽게/,
  /상황을.*살핀다/,
  /상황을.*이해/,
  /상대의 감정/,
  /직접적인 질문/,
  /^\d+번 선택지$/,
];

function isGenericChoice(choice: StoryRpgChoice) {
  return GENERIC_CHOICE_PATTERNS.some((pattern) => pattern.test(choice.label));
}

function shouldUseContextChoices(choices: StoryRpgChoice[]) {
  if (!choices.length) return true;
  const labels = choices.map((choice) => choice.label.trim()).filter(Boolean);
  if (new Set(labels).size < labels.length) return true;
  return choices.filter(isGenericChoice).length >= Math.ceil(choices.length / 2);
}

function cleanChoiceFocus(value: string, fallback: string) {
  const firstSentence = compactText(value, fallback)
    .replace(/[“”"']/g, "")
    .split(/[.!?。？！\n]/)[0]
    ?.trim();
  const withoutSpeaker = (firstSentence || fallback).replace(/^[가-힣A-Za-z0-9_\-\s]{1,12}\s*[:：]\s*/, "");
  const clipped = withoutSpeaker
    .replace(/[()[\]{}<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18)
    .trim();
  return clipped || fallback;
}

function objectParticle(value: string) {
  const last = value.trim().at(-1);
  if (!last) return "을";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "을";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

function chapterAssetUrl(chapter: Record<string, any>) {
  const asset = arrayOf<Record<string, any>>(chapter.assetSlots ?? chapter.asset_slots)[0] ?? {};
  return asText(asset.media_url, asText(asset.mediaUrl, asText(asset.url))) || undefined;
}

function buildContextChoices(input: {
  currentRoute: string;
  leadName: string;
  sceneText: string;
  chapters: Record<string, any>[];
}): StoryRpgChoice[] {
  const chapterOne = input.chapters[0] ?? {};
  const chapterTwo = input.chapters[1] ?? chapterOne;
  const chapterThree = input.chapters[2] ?? chapterTwo;
  const sourceOne = chapterTitle(chapterOne, "첫 장면") || input.sceneText;
  const sourceTwo = chapterBody(chapterTwo) || chapterTitle(chapterTwo, "상대의 반응") || input.sceneText;
  const sourceThree = chapterBody(chapterThree) || chapterTitle(chapterThree, "갈등의 단서") || input.sceneText;
  const clueFocus = cleanChoiceFocus(sourceOne, "눈앞의 단서");
  const emotionFocus = cleanChoiceFocus(sourceTwo, `${input.leadName}의 반응`);
  const decisionFocus = cleanChoiceFocus(sourceThree, "위험한 판단");

  return [
    {
      label: `${clueFocus}${objectParticle(clueFocus)} 확인한다`,
      effect: "단서 확보",
      tone: "조사",
      result: `${clueFocus}${objectParticle(clueFocus)} 천천히 확인하며 다음 장면의 실마리를 잡습니다.`,
      routeHint: input.currentRoute,
      image: chapterAssetUrl(chapterOne),
      nextSceneId: "scene-observe",
      affectionDelta: 1,
      tensionDelta: 0,
      trustDelta: 2,
    },
    {
      label: `${input.leadName}에게 ${emotionFocus}에 대해 묻는다`,
      effect: "감정 확인",
      tone: "대화",
      result: `${input.leadName}의 반응을 직접 확인하며 관계의 방향을 정합니다.`,
      routeHint: input.currentRoute,
      image: chapterAssetUrl(chapterTwo),
      nextSceneId: "scene-approach",
      affectionDelta: 2,
      tensionDelta: 1,
      trustDelta: 1,
    },
    {
      label: `${decisionFocus}${objectParticle(decisionFocus)} 감수하고 움직인다`,
      effect: "분기 선택",
      tone: "판단",
      result: `${decisionFocus}${objectParticle(decisionFocus)} 외면하지 않고 선택하면서 장면의 긴장감이 달라집니다.`,
      routeHint: "Tension Route",
      image: chapterAssetUrl(chapterThree),
      nextSceneId: "scene-confront",
      affectionDelta: 0,
      tensionDelta: 3,
      trustDelta: -1,
    },
  ];
}

function excerpt(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function buildGeneratedScenes(input: {
  sceneTitle: string;
  sceneText: string;
  partnerLine: string;
  leadName: string;
  chapters: Record<string, any>[];
  choices: StoryRpgChoice[];
}): StoryRpgScene[] {
  const chapterTexts = input.chapters.map(chapterBody).filter(Boolean);
  const baseText = input.sceneText || chapterTexts[0] || "등록된 스토리 본문을 기반으로 첫 선택이 시작됩니다.";
  const secondText = chapterTexts[1] || baseText;
  const thirdText = chapterTexts[2] || secondText || baseText;

  return [
    {
      id: "opening",
      title: input.sceneTitle,
      text: excerpt(baseText, 900),
      partnerLine: input.partnerLine,
      choices: input.choices,
    },
    {
      id: "scene-observe",
      title: "단서를 따라가는 장면",
      text: excerpt(secondText, 760),
      partnerLine: `${input.leadName}이(가) 시선을 늦추며 말합니다. "그렇게 보고 있었어?"`,
      choices: [],
    },
    {
      id: "scene-approach",
      title: "감정선이 가까워지는 장면",
      text: excerpt(secondText, 760),
      partnerLine: `${input.leadName}이(가) 낮은 목소리로 말합니다. "지금은 조금 더 솔직해져도 될 것 같아."`,
      choices: [],
    },
    {
      id: "scene-confront",
      title: "긴장이 드러나는 장면",
      text: excerpt(thirdText, 760),
      partnerLine: `${input.leadName}의 시선이 흔들리지 않습니다. "그 질문, 정말 대답을 듣고 싶어?"`,
      choices: [],
    },
  ];
}

export function toStoryRpg(row: any, index = 0): StoryRpg {
  const card = recordOf(row?.character_card);
  const storyRpg = recordOf(card.storyRpg);
  const characters = arrayOf<Record<string, any>>(card.characters);
  const firstCharacter = characters[0] ?? {};
  const chapters = arrayOf<Record<string, any>>(card.chapters);
  const firstChapter = chapters[0] ?? {};
  const fallback = storyRpgFallbackImages[index % storyRpgFallbackImages.length] ?? storyRpgFallbackImages[0];
  const cover = asText(row?.cover_url, fallback.cover);
  const leadName = asText(firstCharacter.name, asText(card.name, "주인공"));
  const logline = asText(row?.logline, asText(card.storyOverview, "선택과 대화에 따라 관계와 결말이 달라지는 스토리게임입니다."));
  const currentRoute = asText(storyRpg.currentRoute, "Main Route");
  const sceneTitle = asText(storyRpg.startSceneTitle, chapterTitle(firstChapter, "첫 선택"));
  const sceneText = asText(storyRpg.startSceneText, excerpt(chapterBody(firstChapter) || compactText(row?.body_text, logline), 900));
  const partnerLine = asText(storyRpg.partnerLine, `${leadName}이(가) 당신의 선택을 기다립니다.`);
  const configuredChoices = arrayOf<Record<string, any>>(storyRpg.choices).map(normalizeChoice);
  const contextChoices = buildContextChoices({ currentRoute, leadName, sceneText, chapters });
  const normalizedChoices = shouldUseContextChoices(configuredChoices) ? contextChoices : configuredChoices;
  const configuredScenes = arrayOf<Record<string, any>>(storyRpg.scenes);
  const routes = arrayOf<Record<string, any>>(storyRpg.routes);
  const generatedScenes = buildGeneratedScenes({
    sceneTitle,
    sceneText,
    partnerLine,
    leadName,
    chapters,
    choices: normalizedChoices,
  });
  const visualAssets = visualAssetsFromStory(row, card, characters);

  return {
    id: asText(row?.id, `story-rpg-${index + 1}`),
    title: asText(row?.title, "제목 없는 스토리게임"),
    subtitle: asText(card.subtitle, logline),
    leadName,
    partnerRole: asText(firstCharacter.role, asText(card.role, "스토리 주인공")),
    mood: asText(firstCharacter.personality, asText(card.persona, "긴장과 몰입")),
    cover,
    background: asText(storyRpg.backgroundUrl, cover || fallback.background),
    logline,
    sceneTitle,
    sceneText,
    partnerLine,
    affection: clamp(storyRpg.initialAffection, 0),
    tension: clamp(storyRpg.initialTension, 35),
    trust: clamp(storyRpg.initialTrust, 20),
    currentRoute,
    currentChapter: chapterTitle(firstChapter, "Prologue"),
    endings: {
      unlocked: Math.max(0, Math.floor(asNumber(storyRpg.endingsUnlocked, 0))),
      total: Math.max(1, Math.floor(asNumber(storyRpg.endingsTotal, 5))),
    },
    images: {
      unlocked: Math.max(visualAssets.filter((asset) => asset.minAffection <= clamp(storyRpg.initialAffection, 0)).length, Math.floor(asNumber(storyRpg.imagesUnlocked, 1))),
      locked: Math.max(visualAssets.filter((asset) => asset.minAffection > clamp(storyRpg.initialAffection, 0)).length, Math.floor(asNumber(storyRpg.imagesLocked, 4))),
    },
    visualAssets,
    routes: routes.length
      ? routes.map((route) => ({
          name: asText(route.name, "Main Route"),
          status: asText(route.status, "진행 중"),
          condition: asText(route.condition, "선택에 따라 진행"),
          progress: clamp(route.progress, 0),
        }))
      : [
          { name: currentRoute, status: "진행 중", condition: "첫 선택으로 시작하세요", progress: 0 },
          { name: "Hidden Route", status: "잠금", condition: "호감도와 신뢰 조건 필요", progress: 0 },
        ],
    choices: normalizedChoices,
    scenes: configuredScenes.length
      ? configuredScenes.map((scene, sceneIndex) => normalizeScene(scene, sceneIndex, normalizedChoices))
      : generatedScenes,
    tags: arrayOf<string>(row?.tags).length ? arrayOf<string>(row.tags).slice(0, 6) : ["스토리게임", "선택지", "멀티엔딩"],
  };
}

async function getAccessToken(optional = false) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token && !optional) throw new Error("Unauthorized");
  return token ?? "";
}

async function storyRpgApi<T>(path: string, init?: { preview?: boolean; accessToken?: string }): Promise<T> {
  const headers = new Headers();
  if (init?.preview) {
    const token = init.accessToken || (await getAccessToken());
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`/api/story-rpg${path}`, { headers });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(raw || `StoryRPG API failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const listStoryRpgs = createServerFn({ method: "GET" }).handler(async (): Promise<StoryRpg[]> => {
  try {
    const payload = await storyRpgApi<ApiPayload<{ rows: any[] }>>("");
    return payload.rows.map((row, index) => toStoryRpg(row, index));
  } catch {
    return [];
  }
});

export const getStoryRpgDetail = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { id: string; preview?: boolean | string; accessToken?: string })
  .handler(async ({ data }): Promise<StoryRpg | null> => {
    try {
      const params = new URLSearchParams({ id: data.id });
      if (data.preview) params.set("preview", "1");
      const payload = await storyRpgApi<ApiPayload<{ row: any }>>(`?${params.toString()}`, {
        preview: Boolean(data.preview),
        accessToken: data.accessToken,
      });
      return payload.row ? toStoryRpg(payload.row, 0) : null;
    } catch {
      return null;
    }
  });
