import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_TITLE = "길들여진 여자";
const DEFAULT_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  lovable: "https://ai.gateway.lovable.dev/v1",
  custom: "https://api.openai.com/v1",
};
const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  google: "gemini-2.5-flash",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-4o-mini",
  lovable: "google/gemini-2.5-flash",
  custom: "gpt-4o-mini",
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(".env"));
loadEnvFile(path.resolve(".env.local"));

const storyIdArg = process.argv.find((arg) => arg.startsWith("--story-id="))?.slice("--story-id=".length);
const titleArg = process.argv.find((arg) => arg.startsWith("--title="))?.slice("--title=".length) || DEFAULT_TITLE;
const maxScenesArg = Number(process.argv.find((arg) => arg.startsWith("--max-scenes="))?.slice("--max-scenes=".length));
const maxScenes = Number.isFinite(maxScenesArg) && maxScenesArg > 8 ? Math.min(36, Math.floor(maxScenesArg)) : 24;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

function isNewSupabaseApiKey(value) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey) {
  return (input, init) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: createSupabaseFetch(SUPABASE_SERVICE_ROLE_KEY) },
  auth: { persistSession: false, autoRefreshToken: false },
});

function recordOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function compactText(value, max = 2000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function stripCodeFence(text) {
  return String(text ?? "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseJsonObject(text) {
  const stripped = stripCodeFence(text);
  const match = stripped.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : stripped);
}

function normalizeId(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function normalizeChoice(choice, index, fallbackNextSceneId) {
  const c = recordOf(choice);
  return {
    label: compactText(c.label, 80) || `${index + 1}번 선택`,
    effect: compactText(c.effect, 80) || "관계 변화",
    tone: compactText(c.tone, 40) || "선택",
    result: compactText(c.result, 500) || "선택에 따라 관계와 장면의 분위기가 달라진다.",
    routeHint: compactText(c.routeHint || c.route, 80) || "Main Route",
    nextSceneId: compactText(c.nextSceneId || c.nextScene, 80) || fallbackNextSceneId || undefined,
    affectionDelta: clampDelta(c.affectionDelta, 1),
    tensionDelta: clampDelta(c.tensionDelta, 0),
    trustDelta: clampDelta(c.trustDelta, 1),
  };
}

function clampDelta(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-10, Math.min(10, Math.round(n)));
}

function normalizeScene(scene, index, allSceneIds) {
  const s = recordOf(scene);
  const id = normalizeId(s.id, `scene-${index + 1}`);
  const nextFallback = allSceneIds[index + 1];
  const choices = arrayOf(s.choices).slice(0, 4).map((choice, choiceIndex) => normalizeChoice(choice, choiceIndex, nextFallback));
  return {
    id,
    title: compactText(s.title, 100) || `장면 ${index + 1}`,
    text: compactText(s.text || s.body, 1800) || "다음 선택을 기다리는 장면.",
    partnerLine: compactText(s.partnerLine || s.line, 300) || "지금 네 선택을 기다리고 있어.",
    goal: compactText(s.goal, 180) || undefined,
    mood: compactText(s.mood, 120) || undefined,
    choices,
  };
}

function normalizeScenario(raw, story, chapters, providerMeta) {
  const bible = recordOf(raw.bible);
  const rawScenes = arrayOf(raw.scenes).slice(0, maxScenes);
  const provisionalIds = rawScenes.map((scene, index) => normalizeId(recordOf(scene).id, `scene-${index + 1}`));
  const scenes = rawScenes.map((scene, index) => normalizeScene(scene, index, provisionalIds));

  if (scenes.length) {
    const idSet = new Set(scenes.map((scene) => scene.id));
    for (const [index, scene] of scenes.entries()) {
      scene.choices = scene.choices
        .filter((choice) => !choice.nextSceneId || idSet.has(choice.nextSceneId))
        .map((choice) => ({
          ...choice,
          nextSceneId: choice.nextSceneId || scenes[index + 1]?.id,
        }));
      if (index < scenes.length - 1 && scene.choices.length === 0) {
        scene.choices = [
          normalizeChoice(
            {
              label: "다음 장면으로 이어간다",
              effect: "+1 몰입",
              tone: "진행",
              result: "이 선택으로 다음 사건의 문이 열린다.",
              nextSceneId: scenes[index + 1].id,
            },
            0,
            scenes[index + 1].id,
          ),
        ];
      }
    }
  }

  const firstChapter = chapters[0] ?? {};
  const firstScene = scenes[0];
  const firstCharacter = arrayOf(bible.characters)[0] ?? arrayOf(recordOf(story.character_card).characters)[0] ?? {};

  return {
    enabled: true,
    sourceMode: "full_story_analysis",
    generatedAt: new Date().toISOString(),
    generator: {
      providerLabel: providerMeta.providerLabel,
      provider: providerMeta.provider,
      model: providerMeta.model,
      stages: providerMeta.stages,
      tokensUsed: providerMeta.tokensUsed,
    },
    bible: {
      synopsis: compactText(bible.synopsis || raw.synopsis || story.logline, 1200),
      toneGuide: compactText(bible.toneGuide, 900),
      adultIntensityGuide: compactText(bible.adultIntensityGuide, 900),
      relationshipRules: arrayOf(bible.relationshipRules).map((item) => compactText(item, 220)).filter(Boolean).slice(0, 12),
      timeline: arrayOf(bible.timeline).map((item) => compactText(item, 260)).filter(Boolean).slice(0, 40),
      characters: arrayOf(bible.characters).slice(0, 8),
      routePlan: arrayOf(bible.routePlan).slice(0, 8),
      endings: arrayOf(bible.endings).slice(0, 8),
    },
    startSceneTitle: firstScene?.title || firstChapter.title || "첫 선택",
    startSceneText: firstScene?.text || compactText(firstChapter.body, 1200),
    partnerLine: firstScene?.partnerLine || `${compactText(firstCharacter.name, 40) || "주인공"}이 당신의 선택을 기다립니다.`,
    currentRoute: "Main Route",
    initialAffection: 0,
    initialTension: 35,
    initialTrust: 20,
    endingsTotal: Math.max(3, arrayOf(bible.endings).length || 5),
    imagesUnlocked: 1,
    imagesLocked: 4,
    routes: [
      { name: "Desire Route", status: "진행 중", condition: "호감도와 긴장도 중심 선택", progress: 0 },
      { name: "Trust Route", status: "잠김", condition: "신뢰도 45 이상", progress: 0 },
      { name: "Ruin Route", status: "잠김", condition: "긴장도 75 이상", progress: 0 },
      { name: "Hidden Ending", status: "잠김", condition: "호감도 85 이상 + 특정 선택", progress: 0 },
    ],
    choices: firstScene?.choices ?? [],
    scenes,
  };
}

function buildChapters(row) {
  const card = recordOf(row.character_card);
  const chapters = arrayOf(card.chapters);
  if (chapters.length) {
    return chapters
      .map((chapter, index) => ({
        id: String(chapter.id || `ch_${index + 1}`),
        title: String(chapter.title || `Episode ${index + 1}`),
        episodeNumber: Number(chapter.episodeNumber || index + 1),
        summary: String(chapter.summary || ""),
        body: String(chapter.body || ""),
      }))
      .filter((chapter) => chapter.body.trim().length > 80);
  }
  const body = String(row.body_text || "");
  return body.trim()
    ? [{ id: "ch_1", title: "Episode 1", episodeNumber: 1, summary: "", body }]
    : [];
}

function chapterExcerpt(chapter, maxChars = 18000) {
  return [
    `EPISODE_NUMBER: ${chapter.episodeNumber}`,
    `TITLE: ${chapter.title}`,
    `CURRENT_SUMMARY: ${chapter.summary}`,
    "",
    "TEXT:",
    chapter.body.slice(0, maxChars),
  ].join("\n");
}

async function readStory() {
  let query = supabase.from("user_stories").select("*").limit(1);
  if (storyIdArg) query = query.eq("id", storyIdArg);
  else query = query.ilike("title", `%${titleArg}%`);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Story not found: ${storyIdArg || titleArg}`);
  return data;
}

async function selectDeepSeekProvider() {
  const { data: providers, error } = await supabase
    .from("llm_api_providers")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("used_tokens", { ascending: true });
  if (error) throw new Error(error.message);
  const active = (providers ?? []).filter((row) => row.monthly_token_quota === 0 || row.used_tokens < row.monthly_token_quota);
  const { data: secrets, error: secretError } = await supabase
    .from("llm_api_provider_secrets")
    .select("provider_id, api_key")
    .in("provider_id", active.map((row) => row.id));
  if (secretError) throw new Error(secretError.message);
  const secretById = new Map((secrets ?? []).map((row) => [row.provider_id, row.api_key]));
  const withSecrets = active.map((row) => ({ ...row, api_key: secretById.get(row.id) || "" })).filter((row) => row.api_key);
  const deepseek =
    withSecrets.find((row) => row.provider === "deepseek") ??
    withSecrets.find((row) => /deepseek/i.test(`${row.label ?? ""} ${row.model ?? ""} ${row.base_url ?? ""}`));
  if (!deepseek) throw new Error("Active DeepSeek provider with API key was not found in llm_api_providers.");
  return deepseek;
}

async function recordUsage(providerId, tokens, succeeded, error = null) {
  await supabase.rpc("record_llm_usage", {
    _provider_id: providerId,
    _tokens: tokens,
    _purpose: "summary",
    _succeeded: succeeded,
    _error: error || undefined,
  });
}

async function callDeepSeek(provider, messages, options = {}) {
  const base = String(provider.base_url || DEFAULT_BASE_URLS.deepseek).replace(/\/$/, "");
  const model = options.model || provider.model || DEFAULT_MODELS.deepseek;
  const url = `${base}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.75,
      max_tokens: options.maxTokens ?? 6000,
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    await recordUsage(provider.id, 0, false, raw.slice(0, 500));
    throw new Error(`DeepSeek HTTP ${res.status}: ${raw.slice(0, 500)}`);
  }
  const json = JSON.parse(raw);
  const text = json?.choices?.[0]?.message?.content || "";
  const tokens = Number(json?.usage?.total_tokens || 0);
  await recordUsage(provider.id, tokens, true);
  return {
    text,
    tokens,
    model,
    providerLabel: provider.label,
    provider: provider.provider,
  };
}

function scenarioSystemPrompt() {
  return [
    "당신은 Lovetale의 성인용 스토리RPG 시나리오 디렉터다.",
    "목표: 등록된 한국어 웹소설 전체 흐름을 바탕으로, 회차 구분 없이 사용자의 선택에 따라 결말까지 이어지는 선택형 RPG 시나리오를 만든다.",
    "원문을 그대로 복사하지 말고, 원문의 톤앤매너, 긴장감, 관계성, 단어 수위, 어두운/자극적인 분위기를 보존해 게임 장면으로 재구성한다.",
    "성인 독자 대상의 관능적 긴장감은 허용하지만, 미성년자 성적 묘사, 비동의 성폭력 미화, 불법 행위 조장은 만들지 않는다.",
    "출력은 반드시 JSON만 반환한다. 마크다운, 설명, 주석 금지.",
  ].join("\n");
}

async function summarizeChapter(provider, story, chapter) {
  const result = await callDeepSeek(
    provider,
    [
      { role: "system", content: scenarioSystemPrompt() },
      {
        role: "user",
        content: [
          "아래 회차를 전체 StoryRPG 제작을 위한 압축 자료로 분석해라.",
          "반환 JSON 형식:",
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
          `STORY_TITLE: ${story.title}`,
          `STORY_LOGLINE: ${story.logline || ""}`,
          "",
          chapterExcerpt(chapter),
        ].join("\n"),
      },
    ],
    { temperature: 0.35, maxTokens: 3500 },
  );
  return { parsed: parseJsonObject(result.text), meta: result };
}

async function generateFullScenario(provider, story, chapters, briefs) {
  const result = await callDeepSeek(
    provider,
    [
      { role: "system", content: scenarioSystemPrompt() },
      {
        role: "user",
        content: [
          "이제 전체 회차 분석본을 바탕으로, 회차 구분 없는 하나의 연속 StoryRPG 게임 시나리오를 작성해라.",
          "게임은 사용자의 선택에 따라 감정선, 신뢰, 긴장, 해금, 결말이 달라져야 한다.",
          "장면은 원작 전체 흐름을 따라가되, 플레이어가 계속 궁금해하고 다음 선택을 누르고 싶게 자극적이고 흥미로운 어조로 작성한다.",
          "각 장면 text는 350~900자 정도로 밀도 있게 작성한다.",
          "각 선택지는 2~3개를 권장하고, 모든 비최종 장면의 선택지는 nextSceneId를 가져야 한다.",
          `장면 수는 ${maxScenes}개 이내로 하되, 시작-중반 분기-위기-관계 심화-결말 후보까지 포함한다.`,
          "",
          "반환 JSON 형식:",
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
          "설계 규칙:",
          "- id는 영문/숫자/kebab-case로 작성.",
          "- 첫 scene id는 opening-awakening.",
          "- 마지막 결말 장면들은 choices를 빈 배열로 둘 수 있다.",
          "- 선택 결과 result는 플레이어가 다음 장면을 보고 싶게 만드는 후킹 문장으로 작성.",
          "- 성인 콘텐츠 수위는 노골적 신체 묘사보다 심리적 긴장, 위험한 관계, 유혹, 금기감 중심으로 처리.",
          "- 원문에 없는 캐릭터 이름을 새로 만들지 말 것.",
          "",
          `STORY_ID: ${story.id}`,
          `STORY_TITLE: ${story.title}`,
          `STORY_LOGLINE: ${story.logline || ""}`,
          `CHAPTER_COUNT: ${chapters.length}`,
          "",
          "WHOLE_STORY_BRIEFS_JSON:",
          JSON.stringify(briefs).slice(0, 70000),
        ].join("\n"),
      },
    ],
    { temperature: 0.8, maxTokens: 7800 },
  );
  return { parsed: parseJsonObject(result.text), meta: result };
}

async function saveScenario(story, chapters, scenario, meta) {
  const card = recordOf(story.character_card);
  const storyRpg = normalizeScenario(scenario, story, chapters, meta);
  const nextCard = {
    ...card,
    contentType: "story_rpg",
    storyRpg,
  };
  const { error } = await supabase
    .from("user_stories")
    .update({
      character_card: nextCard,
      updated_at: new Date().toISOString(),
    })
    .eq("id", story.id);
  if (error) throw new Error(error.message);
  return storyRpg;
}

async function main() {
  console.log("Reading story...");
  const story = await readStory();
  const chapters = buildChapters(story);
  if (!chapters.length) throw new Error("No chapter bodies found for this story.");
  console.log(`Story: ${story.title} (${story.id})`);
  console.log(`Chapters: ${chapters.length}`);

  const provider = await selectDeepSeekProvider();
  console.log(`Using provider: ${provider.label} / ${provider.model || DEFAULT_MODELS.deepseek}`);

  const briefs = [];
  let tokensUsed = 0;
  for (const chapter of chapters) {
    console.log(`Analyzing chapter ${chapter.episodeNumber}: ${chapter.title}`);
    const { parsed, meta } = await summarizeChapter(provider, story, chapter);
    briefs.push(parsed);
    tokensUsed += meta.tokens;
  }

  console.log("Generating full StoryRPG scenario...");
  const { parsed: scenario, meta: scenarioMeta } = await generateFullScenario(provider, story, chapters, briefs);
  tokensUsed += scenarioMeta.tokens;

  const saved = await saveScenario(story, chapters, scenario, {
    providerLabel: provider.label,
    provider: provider.provider,
    model: scenarioMeta.model,
    stages: { chapterBriefs: briefs.length, scenario: 1 },
    tokensUsed,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        storyId: story.id,
        title: story.title,
        chapters: chapters.length,
        scenes: saved.scenes.length,
        endingsTotal: saved.endingsTotal,
        providerLabel: provider.label,
        model: scenarioMeta.model,
        tokensUsed,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
