import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_BASE_URLS, DEFAULT_MODELS } from "@/lib/llm-router.server";

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

async function getUser(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function ensureStoryMediaBucket() {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  if (listError) throw new Error(listError.message);
  if ((buckets ?? []).some((bucket) => bucket.name === "story-media")) return;
  const { error } = await supabaseAdmin.storage.createBucket("story-media", { public: false });
  if (error) throw new Error(error.message);
}

function defaultMediaModel(provider: string, kind: "image" | "video", configuredModel?: string | null) {
  if (provider === "google") {
    if (kind === "video") return /veo/i.test(configuredModel ?? "") ? configuredModel! : "veo-3.0-fast-generate-001";
    return /imagen|image|banana/i.test(configuredModel ?? "") ? configuredModel! : "imagen-4.0-fast-generate-001";
  }
  if (kind === "image" && provider === "openai") {
    return /image|dall|gpt-image/i.test(configuredModel ?? "") ? configuredModel! : "gpt-image-1";
  }
  return configuredModel || DEFAULT_MODELS[provider] || "gpt-image-1";
}

function providerCanGenerate(provider: string, kind: "image" | "video", configuredModel?: string | null) {
  if (provider !== "google") return false;
  if (kind === "video") return provider === "google" && /veo|video/i.test(configuredModel ?? "veo");
  return true;
}

async function uploadGeneratedMedia({
  userId,
  bytes,
  mimeType,
  kind,
}: {
  userId: string;
  bytes: Uint8Array;
  mimeType: string;
  kind: "image" | "video";
}) {
  await ensureStoryMediaBucket();
  const ext = mimeType.includes("webp")
    ? "webp"
    : mimeType.includes("jpeg") || mimeType.includes("jpg")
      ? "jpg"
      : mimeType.includes("mp4")
        ? "mp4"
        : "png";
  const storagePath = `profiles/${userId}/chat-character-${kind}-${Date.now()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("story-media")
    .upload(storagePath, bytes, { upsert: true, contentType: mimeType });
  if (error) throw new Error(error.message);
  const { data } = await supabaseAdmin.storage.from("story-media").createSignedUrl(storagePath, 60 * 60);
  return { storagePath, signedUrl: data?.signedUrl ?? null };
}

async function generateName(body: Record<string, any>) {
  const concept = String(body.concept ?? "").trim().slice(0, 500);
  const gender = String(body.gender ?? "neutral").trim();
  const mood = String(body.mood ?? "").trim().slice(0, 200);
  const { chatWithRotation } = await import("@/lib/llm-router.server");
  const result = await chatWithRotation({
    purpose: "general_chat",
    temperature: 0.8,
    maxTokens: 120,
    messages: [
      {
        role: "system",
        content: "Lovetale 채팅용 사용자 캐릭터 이름을 만든다. 한국어 이름 1개만 출력한다. 설명 금지.",
      },
      {
        role: "user",
        content: [`성별/분위기: ${gender}`, mood ? `톤: ${mood}` : "", concept ? `설정: ${concept}` : ""]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  const name = result.text
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  return Response.json({ ok: true, name: name || "하린", providerLabel: result.providerLabel, model: result.model });
}

async function generateMedia(userId: string, body: Record<string, any>) {
  const kind = body.kind === "video" ? "video" : "image";
  const name = String(body.name ?? "Lovetale").trim().slice(0, 80);
  const concept = String(body.concept ?? "").trim().slice(0, 700);
  const gender = String(body.gender ?? "neutral").trim().slice(0, 40);
  const mood = String(body.mood ?? "").trim().slice(0, 240);
  const prompt = [
    kind === "video"
      ? "Create a short cinematic anime/webtoon style character profile video for a romantic chat app."
      : "Create a polished anime/webtoon style character portrait for a romantic chat app.",
    "No text, no watermark. Face and upper body must be clear. Tasteful, stylish, attractive, character-focused.",
    `Character name: ${name}`,
    `Gender/aura: ${gender}`,
    mood ? `Mood: ${mood}` : "",
    concept ? `Character concept: ${concept}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { listActiveAdminProviders, recordAdminUsage } = await import("@/lib/admin-ai-provider.server");
  const providers = (await listActiveAdminProviders(kind === "video" ? "video_generation" : "image_generation")).filter((row) =>
    providerCanGenerate(row.provider, kind, row.model),
  );
  if (!providers.length) {
    return jsonError(
      kind === "video"
        ? "영상 생성은 관리자 LLM API에 등록된 Gemini/Veo API만 사용합니다. Google provider를 video_generation 용도로 활성화해 주세요."
        : "이미지 생성은 관리자 LLM API에 등록된 Gemini 이미지 API만 사용합니다. Google provider를 image_generation 용도로 활성화해 주세요.",
      503,
    );
  }
  let lastError = "";
  for (const row of providers) {
    const model = defaultMediaModel(row.provider, kind, row.model);
    try {
      if (row.provider === "google") {
        const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
        const google = createGoogleGenerativeAI({
          apiKey: row.api_key ?? "",
          baseURL: (row.base_url?.trim() || DEFAULT_BASE_URLS.google).replace(/\/$/, ""),
        });
        if (kind === "video") {
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
          const uploaded = await uploadGeneratedMedia({
            userId,
            bytes: result.video.uint8Array,
            mimeType: result.video.mediaType || "video/mp4",
            kind,
          });
          await recordAdminUsage(row.id, 0, true, "video_generation");
          return Response.json({ ok: true, kind, prompt, ...uploaded, providerLabel: row.label, model });
        }

        const { generateImage } = await import("ai");
        const result = await generateImage({
          model: google.image(model as any),
          prompt,
          n: 1,
          aspectRatio: "1:1",
          providerOptions: { google: { personGeneration: "allow_adult", aspectRatio: "1:1" } },
          maxRetries: 0,
        });
        const uploaded = await uploadGeneratedMedia({
          userId,
          bytes: result.image.uint8Array,
          mimeType: result.image.mediaType || "image/png",
          kind,
        });
        await recordAdminUsage(row.id, 0, true, "image_generation");
        return Response.json({ ok: true, kind, prompt, ...uploaded, providerLabel: row.label, model });
      }

      if (kind === "image") {
        const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
        const { generateImage } = await import("ai");
        const compat = createOpenAICompatible({
          name: `my-chat-character-${row.provider}`,
          baseURL: (row.base_url?.trim() || DEFAULT_BASE_URLS[row.provider] || DEFAULT_BASE_URLS.openai).replace(/\/$/, ""),
          headers: { Authorization: `Bearer ${row.api_key ?? ""}` },
        });
        const result = await generateImage({
          model: compat.imageModel(model),
          prompt,
          n: 1,
          aspectRatio: "1:1",
          maxRetries: 0,
        });
        const uploaded = await uploadGeneratedMedia({
          userId,
          bytes: result.image.uint8Array,
          mimeType: result.image.mediaType || "image/png",
          kind,
        });
        await recordAdminUsage(row.id, 0, true, "image_generation");
        return Response.json({ ok: true, kind, prompt, ...uploaded, providerLabel: row.label, model });
      }

      throw new Error("이 provider는 영상 생성을 지원하지 않습니다.");
    } catch (error: any) {
      lastError = String(error?.message ?? error);
      await recordAdminUsage(row.id, 0, false, kind === "video" ? "video_generation" : "image_generation", lastError.slice(0, 500));
    }
  }

  return jsonServerError(new Error(lastError || "media_generation_failed"), 500);
}

async function handlePost(request: Request) {
  const user = await getUser(request);
  if (!user) return jsonError("unauthorized", 401);
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "media");
  if (action === "name") return generateName(body);
  return generateMedia(user.id, body);
}

export const Route = createFileRoute("/api/my-chat-character")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handlePost(request);
        } catch (error) {
          console.error("[api/my-chat-character] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
