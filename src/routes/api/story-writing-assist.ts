import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AssistMode = "dramatic" | "polish" | "expand";

type AssistBeat = {
  id: string;
  text: string;
  narration?: string | null;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

const MODE_LABELS: Record<AssistMode, string> = {
  dramatic: "자극적 각색",
  polish: "맞춤법/가독성 교정",
  expand: "추천 내용으로 분량 보강",
};

const MODE_INSTRUCTIONS: Record<AssistMode, string> = {
  dramatic:
    "핵심 사건과 인물 의도는 유지하되 긴장감, 욕망의 암시, 갈등, 다음 장면이 궁금해지는 후킹을 강화한다. 노골적 성행위 묘사, 강압, 미성년자 암시는 넣지 않는다.",
  polish:
    "맞춤법, 띄어쓰기, 문장 호흡, 중복 표현을 고친다. 사건과 분량은 크게 바꾸지 않고 더 읽기 쉬운 웹소설 문장으로 정리한다.",
  expand:
    "사용자가 쓴 내용을 바탕으로 감각 묘사, 내적 갈등, 상황 전개, 대사 전후 맥락을 보태 분량을 풍성하게 만든다. 없는 인물을 과도하게 추가하지 않는다.",
};

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) },
  });
}

function jsonError(reason: string, status = 400) {
  return json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error
        ? JSON.stringify(error)
        : String(error);
  return json({ ok: false, reason: "server_error", message }, { status });
}

async function getUser(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function assertStoryOwner(storyId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_stories")
    .select("id")
    .eq("id", storyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("story_not_found");
}

function cleanText(value: unknown, max = 20_000) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

function parseJsonObject(raw: string) {
  const text = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("ai_response_parse_failed");
  }
}

function sanitizeMode(value: unknown): AssistMode {
  return value === "polish" || value === "expand" || value === "dramatic" ? value : "dramatic";
}

function sanitizeBeat(value: unknown): AssistBeat | null {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!row) return null;
  const id = cleanText(row.id, 80);
  const text = cleanText(row.text, 4_000);
  if (!id || !text) return null;
  return {
    id,
    text,
    narration: cleanText(row.narration, 3_000),
  };
}

function buildSystemPrompt(mode: AssistMode) {
  return [
    "너는 Lovetale의 한국어 웹소설 편집 AI다.",
    "사용자가 쓴 원문을 존중하면서 더 잘 읽히는 장면으로 다듬는다.",
    "모든 주요 인물은 성인으로만 취급한다.",
    "불법, 비동의, 미성년자, 노골적 성행위 묘사는 생성하지 않는다.",
    `작업 모드: ${MODE_LABELS[mode]}`,
    MODE_INSTRUCTIONS[mode],
    "응답은 반드시 JSON만 출력한다. Markdown, 설명, 사과문, 코드블록 금지.",
  ].join("\n");
}

function buildContext(body: Record<string, unknown>) {
  const title = cleanText(body.title, 120);
  const logline = cleanText(body.logline, 500);
  const note = cleanText(body.note, 800);
  const character = body.character && typeof body.character === "object" ? (body.character as Record<string, unknown>) : {};
  return [
    title ? `제목: ${title}` : "",
    logline ? `로그라인: ${logline}` : "",
    cleanText(character.name, 80) ? `주요 인물: ${cleanText(character.name, 80)}` : "",
    cleanText(character.personality, 500) ? `성격: ${cleanText(character.personality, 500)}` : "",
    cleanText(character.speakingStyle, 500) ? `말투: ${cleanText(character.speakingStyle, 500)}` : "",
    cleanText(character.appearance, 500) ? `외모: ${cleanText(character.appearance, 500)}` : "",
    note ? `사용자 요청: ${note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function transformSingleBeat(body: Record<string, unknown>, mode: AssistMode) {
  const beat = sanitizeBeat(body.beat);
  if (!beat) return jsonError("invalid_beat");
  const context = buildContext(body);
  const { chatWithRotation } = await import("@/lib/llm-router.server");
  const result = await chatWithRotation({
    purpose: "general_chat",
    temperature: mode === "polish" ? 0.25 : 0.75,
    maxTokens: mode === "expand" ? 1800 : 1300,
    messages: [
      { role: "system", content: buildSystemPrompt(mode) },
      {
        role: "user",
        content: [
          context ? `<context>\n${context}\n</context>` : "",
          "아래 장면 1개를 작업 모드에 맞게 변형한다.",
          "JSON 형식: {\"text\":\"변형된 본문\",\"narration\":\"선택 서술/지문\",\"summary\":\"짧은 변경 요약\"}",
          `<beat id="${beat.id}">\n본문:\n${beat.text}\n\n서술/지문:\n${beat.narration ?? ""}\n</beat>`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const parsed = parseJsonObject(result.text) as Record<string, unknown>;
  return json({
    ok: true,
    mode,
    text: cleanText(parsed.text, 8_000) || beat.text,
    narration: cleanText(parsed.narration, 6_000),
    summary: cleanText(parsed.summary, 300),
    providerLabel: result.providerLabel,
    model: result.model,
  });
}

async function transformBeatBatch(body: Record<string, unknown>, mode: AssistMode) {
  const beats = Array.isArray(body.beats) ? body.beats.map(sanitizeBeat).filter(Boolean) as AssistBeat[] : [];
  if (!beats.length) return jsonError("invalid_beats");
  const limited = beats.slice(0, 30);
  const context = buildContext(body);
  const { chatWithRotation } = await import("@/lib/llm-router.server");
  const result = await chatWithRotation({
    purpose: "general_chat",
    temperature: mode === "polish" ? 0.22 : 0.68,
    maxTokens: mode === "expand" ? 5000 : 4200,
    messages: [
      { role: "system", content: buildSystemPrompt(mode) },
      {
        role: "user",
        content: [
          context ? `<context>\n${context}\n</context>` : "",
          "아래 여러 비트를 각각 작업 모드에 맞게 변형한다.",
          "비트 id와 순서는 절대 바꾸지 않는다. 선택지 구조는 만들지 않는다.",
          "JSON 형식: {\"beats\":[{\"id\":\"원래 id\",\"text\":\"변형된 본문\",\"narration\":\"선택 서술/지문\"}],\"summary\":\"짧은 변경 요약\"}",
          `<beats>\n${limited
            .map((beat, index) =>
              [
                `#${index + 1} id=${beat.id}`,
                `본문:\n${beat.text}`,
                beat.narration ? `서술/지문:\n${beat.narration}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
            )
            .join("\n\n---\n\n")}\n</beats>`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const parsed = parseJsonObject(result.text) as Record<string, unknown>;
  const byInput = new Map(limited.map((beat) => [beat.id, beat]));
  const output = Array.isArray(parsed.beats) ? parsed.beats : [];
  const rows = output
    .map((row) => {
      const item = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
      if (!item) return null;
      const id = cleanText(item.id, 80);
      const original = byInput.get(id);
      if (!original) return null;
      return {
        id,
        text: cleanText(item.text, 8_000) || original.text,
        narration: cleanText(item.narration, 6_000),
      };
    })
    .filter(Boolean);

  if (!rows.length) throw new Error("ai_response_parse_failed");
  return json({
    ok: true,
    mode,
    beats: rows,
    summary: cleanText(parsed.summary, 300),
    providerLabel: result.providerLabel,
    model: result.model,
  });
}

async function handlePost(request: Request) {
  const user = await getUser(request);
  if (!user) return jsonError("unauthorized", 401);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const storyId = cleanText(body.storyId, 80);
  if (!storyId) return jsonError("missing_story_id");
  await assertStoryOwner(storyId, user.id);
  const mode = sanitizeMode(body.mode);
  return Array.isArray(body.beats) ? transformBeatBatch(body, mode) : transformSingleBeat(body, mode);
}

export const Route = createFileRoute("/api/story-writing-assist")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handlePost(request);
        } catch (error) {
          console.error("[api/story-writing-assist] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
