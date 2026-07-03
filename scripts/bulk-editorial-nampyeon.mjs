import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const STORY_TITLE = "남편이 살아있다";
const MIN_EPISODE = 1;
const MAX_EPISODE = 17;
const CHAPTER_SEPARATOR = "\n\n---- 다음 회차 ----\n\n";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.resolve(".env"));
loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".supabase-secrets.local.txt"));

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CACHE_PATH = path.resolve(".tmp", "bulk-editorial-nampyeon-cache.json");

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return { chapters: {}, product: {} };
  }
}

function writeCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function chapterCacheKey(story, chapter) {
  const signature = compactText(chapter.body).slice(0, 80);
  return `${story.id}:${chapter.id}:${chapter.episodeNumber}:${chapter.body.length}:${signature}`;
}

const LIST_LINE_RE = /^\s*(?:[-*]|\u2022|\u00b7|\d+[.)]|[\u2460-\u2473])\s+/;
const SPEAKER_LINE_RE = /^\s*[\uAC00-\uD7A3A-Za-z][\uAC00-\uD7A3A-Za-z0-9 _-]{1,18}\s*[:\uFF1A]/;
const DIALOGUE_RE = /(["\u201C\u2018\u300C\u300E][^"\u201C\u201D\u2018\u2019\u300C\u300D\u300E\u300F]{2,320}["\u201D\u2019\u300F\u300D][.!?\u2026\u3002\uFF01\uFF1F]*)/g;
const SENTENCE_SPLIT_RE = /(?<=[.!?\u2026\u3002\uFF01\uFF1F]["\u201D\u2019\u300D\u300F)]?)\s+/;
const SOFT_BREAK_RE =
  /(?=\s+(?:\uADF8\uB7EC\uB098|\uD558\uC9C0\uB9CC|\uADF8\uB7F0\uB370|\uADF8\uB7EC\uC790|\uADF8\uB54C|\uC774\uC735\uACE0|\uC7A0\uC2DC|\uACE7|\uB098\uB294|\uADF8\uB294|\uADF8\uB140\uB294|\uADF8\uB9AC\uACE0|\uADF8\uB798\uB3C4)(?:\s|$))/;
const PARAGRAPH_TARGET_CHARS = 220;
const PARAGRAPH_MAX_SENTENCES = 2;
const PROOFREAD_RULES = [
  [/\uC5B4\uB5BB\uD574/g, "\uC5B4\uB5BB\uAC8C"],
  [/\uC65C\uB9CC/g, "\uC6EC\uB9CC"],
  [/\uBA87\uC77C/g, "\uBA70\uCE60"],
  [/\uBD48\uC694/g, "\uBD10\uC694"],
  [/\uAE08\uC0C8/g, "\uAE08\uC138"],
  [/\uC5ED\uD65C/g, "\uC5ED\uD560"],
  [/\uC124\uB808\uC784/g, "\uC124\uB818"],
  [/\uBC14\uB7A8/g, "\uBC14\uB78C"],
  [/\uB418\uC694/g, "\uB3FC\uC694"],
  [/\uB418\uC11C/g, "\uB3FC\uC11C"],
  [/\uB418\uC57C/g, "\uB3FC\uC57C"],
  [/\uC548\s*\uB418\uC694/g, "\uC548 \uB3FC\uC694"],
  [/\uC548\s*\uB418([.!?\u2026]|$)/g, "\uC548 \uB3FC$1"],
];

function compactText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeLine(value) {
  return value.replace(/[ \t]+/g, " ").trim();
}

function applyProofreadingRules(value) {
  let next = value;
  for (const [pattern, replacement] of PROOFREAD_RULES) next = next.replace(pattern, replacement);
  return next.replace(
    /([\uAC00-\uD7A3A-Za-z0-9])\s+(\uC5D0\uC11C|\uC5D0\uAC8C|\uAE4C\uC9C0|\uBD80\uD130|\uCC98\uB7FC|\uBCF4\uB2E4|\uC73C\uB85C|\uC740|\uB294|\uC774|\uAC00|\uC744|\uB97C|\uC5D0|\uC640|\uACFC|\uB85C|\uC758|\uB3C4|\uB9CC)(?=[\s,.;:!?%\]\)}\u2026\u3002\u3001\uFF0C\uFF01\uFF1F\u201D\u2019\u300D\u300F]|$)/g,
    "$1$2",
  );
}

function normalizeInlineSpacing(value) {
  const spaced = value
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?%\]\)}\u2026\u3002\u3001\uFF0C\uFF01\uFF1F\u201D\u2019\u300D\u300F])/g, "$1")
    .replace(/([\[\({\u201C\u2018\u300C\u300E])\s+/g, "$1")
    .replace(/([.!?\u2026\u3002\uFF01\uFF1F])(["\u201D\u2019\u300D\u300F)]?)([^\s"'\u201D\u2019\u300D\u300F)\]}])/g, "$1$2 $3")
    .replace(/\s{2,}/g, " ");
  return applyProofreadingRules(spaced).replace(/\s{2,}/g, " ").trim();
}

function splitSentences(value) {
  return value.split(SENTENCE_SPLIT_RE).map(normalizeInlineSpacing).filter(Boolean);
}

function splitLongSentence(value) {
  if (value.length <= PARAGRAPH_TARGET_CHARS * 1.4) return [value];
  const parts = value.split(SOFT_BREAK_RE).map(normalizeInlineSpacing).filter(Boolean);
  if (parts.length <= 1) return [value];
  const out = [];
  let current = "";
  for (const part of parts) {
    const next = normalizeInlineSpacing([current, part].filter(Boolean).join(" "));
    if (current && next.length > PARAGRAPH_TARGET_CHARS) {
      out.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}

function splitProsePart(value) {
  const sentences = splitSentences(value).flatMap(splitLongSentence);
  const out = [];
  let current = [];
  for (const sentence of sentences) {
    const candidate = normalizeInlineSpacing([...current, sentence].join(" "));
    if (current.length && (candidate.length > PARAGRAPH_TARGET_CHARS || current.length >= PARAGRAPH_MAX_SENTENCES)) {
      out.push(normalizeInlineSpacing(current.join(" ")));
      current = [sentence];
    } else {
      current.push(sentence);
    }
  }
  if (current.length) out.push(normalizeInlineSpacing(current.join(" ")));
  return out;
}

function splitDialogueParts(value) {
  return normalizeInlineSpacing(value).replace(DIALOGUE_RE, "\n$1\n").split("\n").map(normalizeInlineSpacing).filter(Boolean);
}

function isDialoguePart(value) {
  return /^["\u201C\u2018\u300C\u300E]/.test(value) && /["\u201D\u2019\u300D\u300F][.!?\u2026\u3002\uFF01\uFF1F]*$/.test(value);
}

function splitReadableParagraphs(value) {
  const out = [];
  for (const part of splitDialogueParts(value)) {
    if (isDialoguePart(part)) out.push(part);
    else out.push(...splitProsePart(part));
  }
  return out.filter(Boolean);
}

function pushProseChunk(out, lines) {
  if (!lines.length) return;
  const joined = normalizeInlineSpacing(lines.join(" "));
  if (joined) out.push(...splitReadableParagraphs(joined));
  lines.length = 0;
}

function normalizeParagraphBlock(block) {
  const out = [];
  const proseLines = [];
  for (const rawLine of block.split("\n")) {
    const line = normalizeLine(rawLine);
    if (!line) continue;
    if (LIST_LINE_RE.test(line) || SPEAKER_LINE_RE.test(line)) {
      pushProseChunk(out, proseLines);
      out.push(normalizeInlineSpacing(line));
      continue;
    }
    proseLines.push(line);
  }
  pushProseChunk(out, proseLines);
  return out;
}

function normalizeProseLineBreaks(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n[ \t]*\n+/)
    .flatMap(normalizeParagraphBlock)
    .map(normalizeInlineSpacing)
    .filter(Boolean)
    .join("\n\n");
}

function mapNormalizedProseOffset(value, offset) {
  const source = String(value ?? "");
  const safeOffset = Math.max(0, Math.min(source.length, Math.floor(Number(offset) || 0)));
  return normalizeProseLineBreaks(source.slice(0, safeOffset)).length;
}

function recordOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function buildChaptersFromRow(row) {
  const card = recordOf(row.character_card);
  const raw = Array.isArray(card.chapters) ? card.chapters : [];
  const topBody = String(row.body_text ?? "");
  const topSlots = Array.isArray(row.asset_slots) ? row.asset_slots : [];
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
  const anyHasBody = raw.some((chapter) => typeof chapter.body === "string" && chapter.body.length > 0);
  return raw.map((chapter, index) => ({
    ...chapter,
    id: String(chapter.id || `ch_${index + 1}`),
    title: String(chapter.title || `Episode ${index + 1}`),
    episodeNumber: Number(chapter.episodeNumber || index + 1),
    isFree: Boolean(chapter.isFree ?? index === 0),
    priceCredits: Math.max(0, Number(chapter.priceCredits || 0)),
    summary: String(chapter.summary || ""),
    body: anyHasBody ? String(chapter.body || "") : index === 0 ? topBody : "",
    assetSlots: Array.isArray(chapter.assetSlots) ? chapter.assetSlots : anyHasBody ? [] : index === 0 ? topSlots : [],
    characterAnalysis: Array.isArray(chapter.characterAnalysis) ? chapter.characterAnalysis : [],
  }));
}

function flattenChapters(chapters) {
  let body = "";
  const slots = [];
  chapters.forEach((chapter, index) => {
    if (index > 0) body += CHAPTER_SEPARATOR;
    const base = body.length;
    for (const slot of chapter.assetSlots ?? []) {
      slots.push({ ...slot, offset: base + Math.max(0, Math.min(chapter.body.length, Number(slot.offset) || 0)) });
    }
    body += chapter.body;
  });
  return { body, slots };
}

async function readOpenAiProvider() {
  const { data: providers, error } = await supabase
    .from("llm_api_providers")
    .select("*")
    .eq("is_active", true)
    .eq("provider", "openai")
    .order("priority", { ascending: true })
    .order("used_tokens", { ascending: true });
  if (error) throw new Error(error.message);
  const provider = (providers ?? []).find((item) => item.monthly_token_quota === 0 || item.used_tokens < item.monthly_token_quota);
  if (!provider) throw new Error("Active OpenAI provider not found in llm_api_providers.");

  const { data: secret, error: secretError } = await supabase
    .from("llm_api_provider_secrets")
    .select("api_key")
    .eq("provider_id", provider.id)
    .maybeSingle();
  if (secretError) throw new Error(secretError.message);
  if (!secret?.api_key) throw new Error(`OpenAI API key missing for provider ${provider.label}.`);
  return { ...provider, api_key: secret.api_key };
}

function openAiCompatibleBases(rawBase) {
  const base = String(rawBase || "https://api.openai.com/v1").replace(/\/$/, "");
  const bases = [base];
  if (!/\/v\d+(?:\/)?$/i.test(base)) bases.push(`${base}/v1`);
  return [...new Set(bases)];
}

async function recordUsage(provider, tokens, succeeded, error) {
  try {
    await supabase.rpc("record_llm_usage", {
      _provider_id: provider.id,
      _tokens: Math.max(0, Math.floor(tokens || 0)),
      _purpose: "summary",
      _succeeded: succeeded,
      _error: error ? String(error).slice(0, 500) : undefined,
    });
  } catch {
    // usage logging should not break this maintenance task
  }
}

async function chatJson(provider, messages, options = {}) {
  const model = options.model || provider.model || "gpt-4o-mini";
  let lastError = "";
  for (const base of openAiCompatibleBases(provider.base_url)) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const requestBody = {
        model,
        messages:
          attempt === 0
            ? messages
            : [
                ...messages,
                {
                  role: "user",
                  content: "Your previous response was not parseable. Return a complete valid JSON object only. No markdown. No empty response.",
                },
              ],
        temperature: attempt === 0 ? options.temperature ?? 0.25 : 0,
        max_tokens: options.maxTokens ?? 1800,
      };
      if (attempt === 0) requestBody.response_format = { type: "json_object" };

      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.api_key}`,
        },
        body: JSON.stringify(requestBody),
      });
      const raw = await res.text();
      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${raw.slice(0, 300)}`;
        continue;
      }
      const json = JSON.parse(raw);
      await recordUsage(provider, Number(json?.usage?.total_tokens ?? 0), true);
      const choice = json?.choices?.[0];
      const content = String(choice?.message?.content ?? "").trim();
      if (!content) {
        lastError = `Empty model response: ${choice?.finish_reason ?? "unknown"} ${choice?.message?.refusal ?? ""}`.trim();
        continue;
      }
      const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      try {
        return JSON.parse(match ? match[0] : cleaned);
      } catch (error) {
        lastError = `JSON parse failed: ${String(error?.message ?? error)} / ${cleaned.slice(0, 220)}`;
      }
    }
  }
  await recordUsage(provider, 0, false, lastError);
  throw new Error(lastError || "OpenAI call failed");
}

function normalizeInsight(item, chapter, index) {
  const name = compactText(item.name);
  if (!name || ["나", "나는", "내가", "그", "그녀", "상대", "남자", "여자", "주인공"].includes(name)) return null;
  const traits = Array.isArray(item.traits)
    ? item.traits.map(compactText).filter(Boolean).slice(0, 5)
    : compactText(item.traits)
      .split(/[,/]/)
      .map((trait) => trait.trim())
      .filter(Boolean)
      .slice(0, 5);
  return {
    id: `char_insight_${chapter.id}_${index}`,
    name,
    role: compactText(item.role) || (index === 0 ? "주요 대화 상대" : "등장 인물"),
    emotion: compactText(item.emotion) || "긴장 속 호기심",
    attitude: compactText(item.attitude) || "상대의 반응을 살피는 태도",
    traits: traits.length ? traits : ["감정 절제"],
    relationship: compactText(item.relationship) || "서로의 속마음을 확인하지 못해 긴장하는 관계",
    chatGuidance:
      compactText(item.chatGuidance ?? item.chat_guidance) ||
      `${name}의 감정선과 관계 맥락을 유지해 짧고 몰입감 있게 응답한다.`,
    evidence: compactText(item.evidence).slice(0, 260),
    appearance: compactText(item.appearance),
    visualPrompt: compactText(item.visualPrompt ?? item.visual_prompt),
  };
}

function mergeCharacterInsights(card, chapters) {
  const byName = new Map();
  for (const character of Array.isArray(card.characters) ? card.characters : []) {
    const name = compactText(character?.name ?? character?.title);
    if (name) byName.set(name, { ...character, name });
  }
  for (const chapter of chapters) {
    for (const insight of chapter.characterAnalysis ?? []) {
      const current = byName.get(insight.name) ?? {
        id: `char_${insight.name.replace(/\s+/g, "_")}`,
        name: insight.name,
        role: insight.role,
        visualPrompt: "",
        avatarUrl: null,
      };
      const chapterInsights = Array.isArray(current.chapterInsights) ? current.chapterInsights : [];
      const nextInsights = [
        ...chapterInsights.filter((item) => item.chapterId !== chapter.id),
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
      ].slice(-20);
      byName.set(insight.name, {
        ...current,
        role: current.role || insight.role,
        persona: current.persona || insight.chatGuidance,
        personality: compactText([current.personality, insight.traits?.join(", ")].filter(Boolean).join(" / ")).slice(0, 600),
        relationship: current.relationship || insight.relationship,
        notes: insight.chatGuidance,
        appearance: current.appearance || insight.appearance || current.visualPrompt || "",
        visualPrompt: current.visualPrompt || insight.visualPrompt || insight.appearance || "",
        speakingStyle: current.speakingStyle || "회차의 감정선에 맞춰 짧고 몰입감 있게 반응합니다.",
        chatEnabled: current.chatEnabled ?? true,
        reusable: current.reusable ?? true,
        chapterInsights: nextInsights,
      });
    }
  }
  return [...byName.values()];
}

async function analyzeChapter(provider, story, card, chapter) {
  const attempts = [
    { bodyLimit: 18000, maxTokens: 2400, note: "" },
    {
      bodyLimit: 9000,
      maxTokens: 1800,
      note: "If the chapter is too long, analyze the excerpt and return a useful compact result.",
    },
    {
      bodyLimit: 4500,
      maxTokens: 1400,
      note: "Return a compact JSON result even if only partial character evidence is available.",
    },
  ];
  let lastError = "";

  for (const attempt of attempts) {
    try {
      const payload = await chatJson(
        provider,
        [
          {
            role: "system",
            content: [
              "You are ChatGPT acting as Lovetale's Korean story editorial analyst.",
              "Return ONLY valid JSON object. No markdown.",
              "Do not rewrite or transform the source body.",
              "Write Korean reader-facing episode summary copy that makes signed-in readers curious.",
              "Identify actual named characters only. Do not use pronouns, narrator labels, generic roles, or objects as names.",
              "For each character infer role, emotion, attitude, traits, relationship, chatGuidance, evidence, appearance, visualPrompt.",
              attempt.note,
            ]
              .filter(Boolean)
              .join("\n"),
          },
          {
            role: "user",
            content: [
              `STORY_TITLE: ${story.title}`,
              `LOG_LINE: ${story.logline ?? ""}`,
              `CHAPTER: ${chapter.episodeNumber}. ${chapter.title}`,
              "Return JSON shape:",
              "{ \"summary\": string, \"characters\": [{ \"name\": string, \"role\": string, \"emotion\": string, \"attitude\": string, \"traits\": string[], \"relationship\": string, \"chatGuidance\": string, \"evidence\": string, \"appearance\": string, \"visualPrompt\": string }] }",
              "",
              "CHAPTER_BODY:",
              chapter.body.slice(0, attempt.bodyLimit),
            ].join("\n"),
          },
        ],
        { temperature: 0.2, maxTokens: attempt.maxTokens },
      );
      const characters = Array.isArray(payload.characters)
        ? payload.characters.map((item, index) => normalizeInsight(item, chapter, index)).filter(Boolean)
        : [];
      return {
        summary: compactText(payload.summary).slice(0, 700),
        characters,
      };
    } catch (error) {
      lastError = String(error?.message ?? error);
      console.warn(`  retrying chapter ${chapter.episodeNumber}: ${lastError.slice(0, 180)}`);
    }
  }

  throw new Error(`Chapter ${chapter.episodeNumber} analysis failed: ${lastError}`);
}

async function generateProductMetadataLegacy(provider, story, card, chapters) {
  const source = chapters
    .map((chapter) => [`${chapter.episodeNumber}화 ${chapter.title}`, chapter.summary, chapter.body.slice(0, 900)].filter(Boolean).join("\n"))
    .join("\n\n---\n\n")
    .slice(0, 24000);
  const payload = await chatJson(
    provider,
    [
      {
        role: "system",
        content: [
          "You are ChatGPT acting as Lovetale's Korean product copy editor.",
          "Return ONLY valid JSON object. No markdown.",
          "Write copy for signed-in Lovetale readers, not admin instructions.",
          "Do not invent major plot facts beyond the submitted chapters.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `TITLE: ${story.title}`,
          `CURRENT_LOG_LINE: ${story.logline ?? ""}`,
          "Return JSON shape:",
          "{ \"logline\": string, \"storyOverview\": string, \"tags\": string[] }",
          "",
          "CHAPTERS_1_TO_17:",
          source,
        ].join("\n"),
      },
    ],
    { temperature: 0.35, maxTokens: 1600 },
  );
  return {
    logline: compactText(payload.logline).slice(0, 180),
    storyOverview: compactText(payload.storyOverview).slice(0, 900),
    tags: Array.isArray(payload.tags) ? payload.tags.map(compactText).filter(Boolean).slice(0, 10) : story.tags ?? [],
  };
}

async function generateProductMetadata(provider, story, card, chapters) {
  const fullSource = chapters
    .map((chapter) => [`${chapter.episodeNumber}. ${chapter.title}`, chapter.summary, chapter.body.slice(0, 900)].filter(Boolean).join("\n"))
    .join("\n\n---\n\n");
  const attempts = [
    { sourceLimit: 24000, maxTokens: 1500 },
    { sourceLimit: 12000, maxTokens: 1200 },
    { sourceLimit: 7000, maxTokens: 900 },
  ];
  let lastError = "";

  for (const attempt of attempts) {
    try {
      const payload = await chatJson(
        provider,
        [
          {
            role: "system",
            content: [
              "You are ChatGPT acting as Lovetale's Korean product copy editor.",
              "Return ONLY valid JSON object. No markdown.",
              "Write copy for signed-in Lovetale readers, not admin instructions.",
              "Do not invent major plot facts beyond the submitted chapters.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `TITLE: ${story.title}`,
              `CURRENT_LOG_LINE: ${story.logline ?? ""}`,
              "Return JSON shape:",
              "{ \"logline\": string, \"storyOverview\": string, \"tags\": string[] }",
              "",
              "CHAPTERS_1_TO_17:",
              fullSource.slice(0, attempt.sourceLimit),
            ].join("\n"),
          },
        ],
        { temperature: 0.35, maxTokens: attempt.maxTokens },
      );
      return {
        logline: compactText(payload.logline).slice(0, 180),
        storyOverview: compactText(payload.storyOverview).slice(0, 900),
        tags: Array.isArray(payload.tags) ? payload.tags.map(compactText).filter(Boolean).slice(0, 10) : story.tags ?? [],
      };
    } catch (error) {
      lastError = String(error?.message ?? error);
      console.warn(`  retrying product metadata: ${lastError.slice(0, 180)}`);
    }
  }

  throw new Error(`Product metadata failed: ${lastError}`);
}

async function main() {
  const provider = await readOpenAiProvider();
  const { data: matches, error } = await supabase
    .from("user_stories")
    .select("*")
    .ilike("title", `%${STORY_TITLE}%`);
  if (error) throw new Error(error.message);
  let story = matches?.find((item) => item.title === STORY_TITLE) ?? matches?.[0] ?? null;
  if (!story) {
    const { data: candidates, error: candidateError } = await supabase
      .from("user_stories")
      .select("*")
      .or("title.ilike.%남편%,title.ilike.%살아%,title.ilike.%살아있%")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (candidateError) throw new Error(candidateError.message);
    story =
      (candidates ?? []).find((item) => String(item.title ?? "").replace(/\s+/g, "") === STORY_TITLE.replace(/\s+/g, "")) ??
      null;
    if (story) {
      console.log(`Matched story by normalized title: ${story.title}`);
    } else {
    console.log("Similar story candidates:");
    for (const item of candidates ?? []) console.log(`- ${item.title} (${item.id})`);
    throw new Error(`Story not found: ${STORY_TITLE}`);
    }
  }
  const card = recordOf(story.character_card);
  const chapters = buildChaptersFromRow(story);
  const targetIds = new Set(
    chapters
      .filter((chapter) => chapter.episodeNumber >= MIN_EPISODE && chapter.episodeNumber <= MAX_EPISODE)
      .map((chapter) => chapter.id),
  );
  if (!targetIds.size) throw new Error(`No chapters ${MIN_EPISODE}-${MAX_EPISODE} found.`);

  console.log(`Target story: ${story.title} (${story.id})`);
  console.log(`Processing chapters: ${[...targetIds].length}`);

  const cache = readCache();
  const nextChapters = [];
  for (const chapter of chapters) {
    if (!targetIds.has(chapter.id)) {
      nextChapters.push(chapter);
      continue;
    }
    const rawBody = String(chapter.body ?? "");
    const normalizedBody = normalizeProseLineBreaks(rawBody);
    const normalizedSlots = (chapter.assetSlots ?? []).map((slot) => ({
      ...slot,
      offset: mapNormalizedProseOffset(rawBody, slot.offset),
    }));
    const normalizedChapter = { ...chapter, body: normalizedBody, assetSlots: normalizedSlots };
    console.log(`- ${chapter.episodeNumber}화: body ${rawBody.length} -> ${normalizedBody.length}`);
    const cacheKey = chapterCacheKey(story, normalizedChapter);
    let analysis = cache.chapters?.[cacheKey];
    if (analysis) {
      console.log("  cached analysis");
    } else {
      analysis = await analyzeChapter(provider, story, card, normalizedChapter);
      cache.chapters = cache.chapters ?? {};
      cache.chapters[cacheKey] = analysis;
      writeCache(cache);
    }
    nextChapters.push({
      ...normalizedChapter,
      summary: analysis.summary || chapter.summary || "",
      characterAnalysis: analysis.characters,
    });
  }

  const productChapters = nextChapters.filter((chapter) => targetIds.has(chapter.id));
  const productCacheKey = `${story.id}:${MIN_EPISODE}-${MAX_EPISODE}:${productChapters
    .map((chapter) => `${chapter.id}:${chapter.body.length}`)
    .join("|")}`;
  let product = cache.product?.[productCacheKey];
  if (product) {
    console.log("Using cached product metadata");
  } else {
    product = await generateProductMetadata(provider, story, card, productChapters);
    cache.product = cache.product ?? {};
    cache.product[productCacheKey] = product;
    writeCache(cache);
  }
  const mergedCharacters = mergeCharacterInsights(card, nextChapters);
  const { body, slots } = flattenChapters(nextChapters);
  const nextCard = {
    ...card,
    chapters: nextChapters,
    characters: mergedCharacters,
    storyOverview: product.storyOverview || card.storyOverview || story.logline || "",
    name: mergedCharacters[0]?.name ?? card.name,
    role: mergedCharacters[0]?.role ?? card.role,
    persona: mergedCharacters[0]?.persona ?? card.persona,
    notes: mergedCharacters[0]?.notes ?? card.notes,
    visualPrompt: mergedCharacters[0]?.visualPrompt ?? card.visualPrompt,
    appearance: mergedCharacters[0]?.appearance ?? card.appearance,
    speakingStyle: mergedCharacters[0]?.speakingStyle ?? card.speakingStyle,
    avatarUrl: mergedCharacters[0]?.avatarUrl ?? card.avatarUrl ?? null,
  };

  const { error: updateError } = await supabase
    .from("user_stories")
    .update({
      body_text: body,
      asset_slots: slots,
      character_card: nextCard,
      logline: product.logline || story.logline,
      tags: product.tags?.length ? product.tags : story.tags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", story.id);
  if (updateError) throw new Error(updateError.message);

  console.log("Done.");
  console.log(`Updated chapters: ${targetIds.size}`);
  console.log(`Detected characters: ${mergedCharacters.length}`);
  console.log(`Product logline: ${product.logline || story.logline || ""}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
