import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  callProvider,
  listAllActiveLlmProviders,
  recordLlmUsage,
  type ProviderRow,
} from "@/lib/llm-router.server";
import { isSuperAdminEmail } from "@/lib/staff-auth";

const STAFF_ROLES = ["admin", "editor", "moderator"] as const;
const SUPER_ADMIN_ROLES = ["admin"] as const;
const ensuredSuperAdminUserIds = new Set<string>();

type StaffRole = (typeof STAFF_ROLES)[number];

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

async function ensureSuperAdminRoles(userId: string) {
  const rows = SUPER_ADMIN_ROLES.map((role) => ({ user_id: userId, role }));
  const { error } = await supabaseAdmin.from("user_roles").upsert(rows, { onConflict: "user_id,role" });
  if (error) throw new Error(error.message);
}

async function requireStaff(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return { error: jsonError("missing_token", 401) as Response, userId: "" };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { error: jsonError("invalid_token", 401) as Response, userId: "" };

  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (isSuperAdminEmail(email)) {
    if (!ensuredSuperAdminUserIds.has(data.user.id)) {
      await ensureSuperAdminRoles(data.user.id);
      ensuredSuperAdminUserIds.add(data.user.id);
    }
    return { userId: data.user.id };
  }

  const { data: rolesData, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (rolesError) return { error: jsonServerError(rolesError, 500), userId: data.user.id };

  const roles = (rolesData ?? [])
    .map((row) => row.role as StaffRole)
    .filter((role): role is StaffRole => STAFF_ROLES.includes(role));
  if (!roles.includes("admin") && !roles.includes("editor")) {
    return { error: jsonError("forbidden", 403) as Response, userId: data.user.id };
  }
  return { userId: data.user.id };
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function limitText(value: string, maxLength: number) {
  const text = compactWhitespace(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function sentencesFrom(text: string) {
  const paragraphs = text
    .split(/\n{2,}|\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks = paragraphs.flatMap((paragraph) => paragraph.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [paragraph]);
  return chunks.map((item) => compactWhitespace(item)).filter((item) => item.length > 12);
}

const HOOK_KEYWORDS = [
  "계약",
  "거래",
  "비밀",
  "위험",
  "조건",
  "금지",
  "협박",
  "거짓",
  "복수",
  "오해",
  "배신",
  "도망",
  "감금",
  "약속",
  "첫사랑",
  "재회",
  "상사",
  "비서",
  "대표",
  "CEO",
  "재벌",
  "집착",
  "질투",
  "후회",
  "상처",
  "끌리",
  "두근",
  "심장",
  "뜨거",
  "차가",
  "떨림",
  "긴장",
  "사랑",
  "욕망",
  "선택",
  "드러나",
  "무너지",
  "흔들",
];

const TURNING_KEYWORDS = ["하지만", "그러나", "그런데", "순간", "마침내", "결국", "그날", "그 밤", "깨닫", "시작"];

function scoreSentence(sentence: string, index: number) {
  const lower = sentence.toLowerCase();
  const hookScore = HOOK_KEYWORDS.reduce((score, keyword) => score + (lower.includes(keyword.toLowerCase()) ? 4 : 0), 0);
  const turningScore = TURNING_KEYWORDS.reduce((score, keyword) => score + (lower.includes(keyword.toLowerCase()) ? 3 : 0), 0);
  const length = sentence.length;
  const lengthScore = length >= 35 && length <= 180 ? 8 : length >= 20 && length <= 230 ? 4 : -4;
  const earlyBonus = index < 8 ? 3 : 0;
  return hookScore + turningScore + lengthScore + earlyBonus;
}

function pickHookSentences(text: string, desiredCount = 4) {
  const sentences = sentencesFrom(text);
  if (!sentences.length) return [];
  const ranked = sentences
    .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence, index) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(desiredCount + 2, 6))
    .sort((a, b) => a.index - b.index);
  const picked: string[] = [];
  for (const item of ranked) {
    if (picked.some((sentence) => sentence.includes(item.sentence) || item.sentence.includes(sentence))) continue;
    picked.push(item.sentence);
    if (picked.length >= desiredCount) break;
  }
  return picked.length ? picked : sentences.slice(0, desiredCount);
}

function makeHookLogline(title: string, text: string) {
  const hooks = pickHookSentences(text, 3);
  const first = hooks[0] ?? title;
  const second = hooks.find((sentence) => sentence !== first && scoreSentence(sentence, 0) >= 12);
  const raw = second ? `${first} ${second}` : first;
  return limitText(raw, 150);
}

function makeReaderTeaser(source: string) {
  const text = compactWhitespace(source);
  if (["계약", "거래", "조건", "위장"].some((keyword) => text.includes(keyword))) {
    return "조건으로 시작된 관계는 어느새 마음의 경계까지 흔들기 시작합니다.";
  }
  if (["비밀", "정체", "숨기", "드러나"].some((keyword) => text.includes(keyword))) {
    return "아직 드러나지 않은 비밀은 두 사람의 선택을 더 위험하게 밀어붙입니다.";
  }
  if (["오해", "거짓", "배신", "복수"].some((keyword) => text.includes(keyword))) {
    return "믿고 싶었던 마음과 의심해야 하는 진실이 같은 순간 충돌합니다.";
  }
  if (["집착", "질투", "소유", "독점"].some((keyword) => text.includes(keyword))) {
    return "가까워질수록 다정함과 집착의 경계는 더 아슬아슬해집니다.";
  }
  if (["위험", "협박", "감금", "도망", "추적"].some((keyword) => text.includes(keyword))) {
    return "벗어나려 할수록 더 깊이 끌려 들어가는 위험한 감정이 시작됩니다.";
  }
  if (["첫사랑", "재회", "친구", "소꿉친구"].some((keyword) => text.includes(keyword))) {
    return "익숙했던 이름은 다시 마주한 순간 전혀 다른 설렘으로 돌아옵니다.";
  }
  return "한 번 열린 감정의 균열은 쉽게 닫히지 않고, 두 사람을 더 깊은 장면으로 이끕니다.";
}

function makeSummary(text: string, maxSentences = 3) {
  const hooks = pickHookSentences(text, Math.max(3, maxSentences));
  const source = compactWhitespace(text);
  if (!hooks.length) return limitText(source, 700);
  const lead = hooks[0];
  const body = hooks.slice(1, maxSentences).join(" ");
  const ending = hooks.length > 1 ? makeReaderTeaser(source) : "";
  return limitText([lead, body, ending].filter(Boolean).join(" "), 700);
}

function makeOverview(text: string) {
  const hooks = pickHookSentences(text, 5);
  if (!hooks.length) return limitText(text, 700);
  const lead = makeHookLogline("", hooks.join(" "));
  const middle = hooks.slice(1, 4).join(" ");
  const close = makeReaderTeaser(text);
  return limitText([lead, middle, close].filter(Boolean).join(" "), 700);
}

function makeTags(source: string) {
  const rules: Array<[string, string[]]> = [
    ["계약관계", ["계약", "거래", "조건", "위장"]],
    ["비밀서사", ["비밀", "숨기", "정체", "드러나"]],
    ["재벌로맨스", ["재벌", "CEO", "대표", "회장"]],
    ["오피스로맨스", ["상사", "비서", "회사", "팀장", "사무실"]],
    ["친구에서연인", ["친구", "소꿉친구", "첫사랑", "재회"]],
    ["위험한관계", ["위험", "협박", "감금", "도망", "추적"]],
    ["집착남", ["집착", "질투", "소유", "독점"]],
    ["후회로맨스", ["후회", "상처", "눈물", "용서"]],
    ["복수극", ["복수", "배신", "원망"]],
    ["오해와진실", ["오해", "거짓", "진실", "착각"]],
    ["판타지", ["마녀", "마법", "저주", "신", "괴물", "세계"]],
    ["고수위", ["19", "밤", "침대", "뜨거", "욕망"]],
  ];
  const tags = rules
    .filter(([, keywords]) => keywords.some((keyword) => source.includes(keyword)))
    .map(([tag]) => tag);
  for (const fallback of ["로맨스", "몰입형", "캐릭터서사"]) {
    if (tags.length >= 6) break;
    if (!tags.includes(fallback)) tags.push(fallback);
  }
  return tags.slice(0, 6);
}

function makeMetadata(title: string, text: string, storyOverview: string) {
  const source = compactWhitespace([storyOverview, text].filter(Boolean).join(" "));
  const hooks = pickHookSentences(source, 4);
  const baseTitle = title || limitText(hooks[0] ?? source, 28) || "Untitled story";
  const logline = makeHookLogline(baseTitle, source || baseTitle);
  const overview = makeOverview(source || baseTitle);
  const episodeTitle = title ? "1화 - 시작되는 균열" : limitText(baseTitle, 40);
  const tags = makeTags(source);

  return {
    title: limitText(baseTitle, 60),
    logline,
    storyOverview: overview,
    episodeTitle,
    episodeSummary: makeSummary(text || storyOverview, 3).slice(0, 500),
    characterName: "상대 주인공",
    characterRole: "Main Character",
    characterPersona: overview,
    characterSpeakingStyle: "장면의 긴장과 감정 변화를 살려 짧고 몰입감 있게 대답합니다.",
    tags,
  };
}

function parseJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : trimmed);
}

function assertOpenAiProvider(row: ProviderRow) {
  const provider = String(row.provider ?? "").toLowerCase();
  return provider === "openai";
}

async function selectChatGptEditorialProvider() {
  const providers = await listAllActiveLlmProviders();
  const openai = providers.find(assertOpenAiProvider);
  if (!openai) {
    throw new Error("ChatGPT/OpenAI API is required for editorial work. Add an active OpenAI provider in /admin/llm.");
  }
  return openai;
}

async function runChatGptEditorialJson(options: {
  mode: "episode_summary" | "story_metadata" | "proofread";
  title: string;
  text: string;
  storyOverview: string;
}) {
  const provider = await selectChatGptEditorialProvider();
  const source = [options.storyOverview, options.text].filter(Boolean).join("\n\n").trim();
  const modeInstruction =
    options.mode === "story_metadata"
      ? [
          "Return JSON fields: title, logline, storyOverview, episodeTitle, episodeSummary, characterName, characterRole, characterPersona, characterSpeakingStyle, tags.",
          "Write marketing-facing Korean copy for signed-in Lovetale readers. Make it intriguing, specific, and emotionally hooking.",
          "Do not invent major plot facts that are not grounded in the submitted text.",
        ].join("\n")
      : options.mode === "proofread"
        ? [
            "Return JSON fields: correctedText, requiresApproval, reason.",
            "Correct spelling, spacing, punctuation, and paragraph breaks only.",
            "Never rewrite, sanitize, summarize, delete, soften, expand, moralize, or creatively transform the original content.",
            "If your internal rules would require changing, refusing, deleting, softening, or reframing the original content, do not edit it. Return requiresApproval=true and explain the reason briefly for the admin.",
            "If correction is possible without changing meaning or content, return requiresApproval=false and correctedText.",
          ].join("\n")
        : [
            "Return JSON field: summary.",
            "Write a Korean episode teaser for signed-in Lovetale readers, not an instruction to admins.",
            "Make the reader curious about the next scene while preserving the story facts.",
          ].join("\n");

  const result = await callProvider(provider, {
    purpose: "summary",
    temperature: options.mode === "proofread" ? 0 : 0.35,
    maxTokens: options.mode === "story_metadata" ? 1600 : options.mode === "proofread" ? 4096 : 900,
    messages: [
      {
        role: "system",
        content: [
          "You are ChatGPT acting as Lovetale's editorial assistant.",
          "Use Korean for user-facing output unless a JSON boolean or field name is required.",
          "Return ONLY valid JSON. No markdown. No commentary.",
          "For proofreading, preserve the original content and meaning exactly. Only mechanical correction is allowed.",
          "If proofreading cannot be done without altering the content, ask for admin approval by setting requiresApproval=true.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `MODE: ${options.mode}`,
          `TITLE: ${options.title || ""}`,
          modeInstruction,
          "",
          "SOURCE_TEXT:",
          source.slice(0, 24000),
        ].join("\n"),
      },
    ],
  });

  await recordLlmUsage(provider.id, result.tokens, result.ok, "summary", result.error);
  if (!result.ok) throw new Error(result.error ?? "ChatGPT editorial call failed");
  try {
    return parseJsonObject(result.text);
  } catch (error) {
    if (options.mode === "proofread") {
      return {
        correctedText: options.text,
        requiresApproval: true,
        reason: "ChatGPT did not return a valid mechanical correction result. Admin approval is required before applying any change.",
      };
    }
    throw error;
  }
}

async function handleImportSummary(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "episode_summary" | "story_metadata" | "proofread";
    title?: string;
    text?: string;
    storyOverview?: string;
  };
  const text = String(body.text ?? "").trim();
  const storyOverview = String(body.storyOverview ?? "").trim();
  if (text.length < 80 && storyOverview.length < 40) return jsonError("text_too_short");

  const title = String(body.title ?? "").trim();
  const mode = body.mode === "story_metadata" || body.mode === "proofread" ? body.mode : "episode_summary";
  const editorial = await runChatGptEditorialJson({ mode, title, text, storyOverview });

  if (mode === "proofread") {
    return Response.json({
      ok: true,
      correctedText: String(editorial.correctedText ?? text),
      requiresApproval: Boolean(editorial.requiresApproval),
      reason: String(editorial.reason ?? ""),
    });
  }

  if (body.mode === "story_metadata") {
    return Response.json({
      ok: true,
      metadata: {
        ...makeMetadata(title, text, storyOverview),
        ...editorial,
        tags: Array.isArray(editorial.tags) ? editorial.tags.map(String).slice(0, 8) : makeTags(text || storyOverview),
      },
    });
  }

  return Response.json({ ok: true, summary: String(editorial.summary ?? makeSummary(text || storyOverview)) });
}

export const Route = createFileRoute("/api/admin/import-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleImportSummary(request);
        } catch (error) {
          console.error("[api/admin/import-summary] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
