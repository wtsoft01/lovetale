import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_BASE_URLS, DEFAULT_MODELS } from "@/lib/llm-router.server";

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonMessageError(reason: string, message: string, status = 400) {
  return Response.json({ ok: false, reason, message }, { status });
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

async function requireStaffUser(userId: string) {
  const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((row) => String(row.role));
  if (!roles.includes("admin") && !roles.includes("editor")) {
    throw new Error("forbidden");
  }
}

async function ensureStoryMediaBucket() {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  if (listError) throw new Error(listError.message);
  if ((buckets ?? []).some((bucket) => bucket.name === "story-media")) return;
  const { error } = await supabaseAdmin.storage.createBucket("story-media", { public: false });
  if (error) throw new Error(error.message);
}

function defaultImageModel(provider: string, configuredModel?: string | null) {
  if (provider === "google") {
    return /imagen|image|banana/i.test(configuredModel ?? "") ? configuredModel! : "imagen-4.0-fast-generate-001";
  }
  if (provider === "openai") {
    return /image|dall|gpt-image/i.test(configuredModel ?? "") ? configuredModel! : "gpt-image-1";
  }
  return configuredModel || DEFAULT_MODELS[provider] || "gpt-image-1";
}

function hasImagePurpose(purposes?: string[] | null) {
  return Array.isArray(purposes) && purposes.includes("image_generation");
}

function isImageModel(configuredModel?: string | null) {
  return /image|dall|gpt-image|imagen/i.test(configuredModel ?? "");
}

function providerCanGenerateImages(provider: string, configuredModel?: string | null, purposes?: string[] | null) {
  if (provider === "google") return true;
  if (isImageModel(configuredModel)) return true;
  return provider === "openai" && hasImagePurpose(purposes);
}

function imageProviderPriority(row: { provider: string; model?: string | null; usage_purposes?: string[] | null }) {
  const model = row.model ?? "";
  if (row.provider === "google" && isImageModel(model)) return 0;
  if (row.provider === "google") return 1;
  if (isImageModel(model)) return 2;
  if (hasImagePurpose(row.usage_purposes)) return 3;
  return 9;
}

function isImagePermissionError(message: string) {
  return /image generation is not enabled|permission_error|not enabled for this group/i.test(message);
}

function openAiCompatibleBases(rawBase: string): string[] {
  const base = rawBase.replace(/\/$/, "");
  const bases = [base];
  if (!/\/v\d+(?:\/)?$/i.test(base)) bases.push(`${base}/v1`);
  return [...new Set(bases)];
}

function imageAuthHeaders(provider: string, apiKey: string): Record<string, string> {
  if (provider === "lovable") return { "Lovable-API-Key": apiKey };
  return { Authorization: `Bearer ${apiKey}` };
}

function imageRequestBody(model: string, prompt: string) {
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size: "1024x1024",
  };

  if (/^dall-e/i.test(model)) {
    body.response_format = "b64_json";
  } else if (/^gpt-image/i.test(model)) {
    body.output_format = "png";
  }

  return body;
}

async function readImageResponse(res: Response) {
  const contentType = res.headers.get("content-type") ?? "image/png";
  const buffer = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(buffer),
    mimeType: contentType.split(";")[0] || "image/png",
  };
}

async function generateOpenAiCompatibleImage({
  provider,
  baseUrl,
  apiKey,
  model,
  prompt,
}: {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}) {
  let lastError = "";
  for (const base of openAiCompatibleBases(baseUrl)) {
    const res = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...imageAuthHeaders(provider, apiKey),
      },
      body: JSON.stringify(imageRequestBody(model, prompt)),
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      lastError = `HTTP ${res.status}: ${text.slice(0, 500)}`;
      continue;
    }
    if (!contentType.includes("application/json")) {
      lastError = `HTTP ${res.status}: image endpoint returned ${contentType || "unknown content type"}`;
      continue;
    }

    const json: any = await res.json();
    const image = json?.data?.[0];
    const b64 = image?.b64_json;
    if (typeof b64 === "string" && b64) {
      return {
        bytes: new Uint8Array(Buffer.from(b64, "base64")),
        mimeType: `image/${json?.output_format || "png"}`,
        tokens: Number(json?.usage?.total_tokens ?? 0),
      };
    }

    if (typeof image?.url === "string" && image.url) {
      const imageRes = await fetch(image.url);
      if (!imageRes.ok) throw new Error(`Generated image download failed: HTTP ${imageRes.status}`);
      const downloaded = await readImageResponse(imageRes);
      return {
        ...downloaded,
        tokens: Number(json?.usage?.total_tokens ?? 0),
      };
    }

    lastError = "image endpoint did not return b64_json or url";
  }

  throw new Error(lastError || "OpenAI-compatible image generation failed");
}

async function uploadProfileImage({
  userId,
  bytes,
  mimeType,
  storyId,
  characterId,
}: {
  userId: string;
  bytes: Uint8Array;
  mimeType: string;
  storyId?: string;
  characterId?: string;
}) {
  await ensureStoryMediaBucket();
  const ext = mimeType.includes("webp")
    ? "webp"
    : mimeType.includes("jpeg") || mimeType.includes("jpg")
      ? "jpg"
      : "png";
  const safeCharacterId = (characterId || "profile").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const storagePath = storyId
    ? `characters/${storyId}/${safeCharacterId}-ai-${Date.now()}.${ext}`
    : `profiles/${userId}/ai-profile-${Date.now()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("story-media")
    .upload(storagePath, bytes, { upsert: true, contentType: mimeType });
  if (error) throw new Error(error.message);
  const { data } = await supabaseAdmin.storage.from("story-media").createSignedUrl(storagePath, 60 * 60);
  return { storagePath, signedUrl: data?.signedUrl ?? null };
}

async function handlePost(request: Request) {
  const user = await getUser(request);
  if (!user) return jsonError("unauthorized", 401);

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "Lovetale reader").trim().slice(0, 80);
  const bio = String(body.bio ?? "").trim().slice(0, 500);
  const userPrompt = String(body.prompt ?? "").trim().slice(0, 700);
  const storyId = String(body.storyId ?? "").trim();
  const characterId = String(body.characterId ?? "").trim();
  if (storyId || characterId) {
    try {
      await requireStaffUser(user.id);
    } catch (error) {
      if (error instanceof Error && error.message === "forbidden") return jsonError("forbidden", 403);
      throw error;
    }
  }
  const prompt = [
    "Create a tasteful manga-style profile portrait for a romantic interactive story app.",
    "Portrait should be suitable as a small chat avatar.",
    "Style: refined Korean webtoon / manga, cinematic soft lighting, expressive face, polished digital illustration.",
    `Profile name: ${name || "Lovetale reader"}`,
    bio ? `Profile mood and personality: ${bio}` : "",
    userPrompt ? `Additional user direction: ${userPrompt}` : "",
    "No text, no watermark, no explicit nudity, square composition, face clearly visible.",
  ]
    .filter(Boolean)
    .join("\n");

  const { listActiveAdminProviders, recordAdminUsage } = await import("@/lib/admin-ai-provider.server");
  const { listAllActiveLlmProviders } = await import("@/lib/llm-router.server");
  const imagePurposeProviders = await listActiveAdminProviders("image_generation");
  const allActiveProviders = await listAllActiveLlmProviders();
  const seenProviderIds = new Set<string>();
  const providers = [...imagePurposeProviders, ...allActiveProviders]
    .filter((row) => {
      if (seenProviderIds.has(row.id)) return false;
      seenProviderIds.add(row.id);
      return providerCanGenerateImages(row.provider, row.model, row.usage_purposes);
    })
    .sort((a, b) => imageProviderPriority(a) - imageProviderPriority(b));
  if (!providers.length) {
    return jsonMessageError(
      "image_generation_provider_not_found",
      "이미지 생성에 사용할 수 있는 관리자 LLM API가 없습니다. /admin/llm에서 Google provider를 활성화하거나 Imagen/gpt-image/dall-e 계열 모델을 image_generation 용도로 등록해 주세요.",
      503,
    );
  }
  let lastError = "";
  const failures: string[] = [];
  for (const row of providers) {
    const model = defaultImageModel(row.provider, row.model);
    try {
      const { generateImage } = await import("ai");

      if (row.provider === "google") {
        const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
        const google = createGoogleGenerativeAI({
          apiKey: row.api_key ?? "",
          baseURL: (row.base_url?.trim() || DEFAULT_BASE_URLS.google).replace(/\/$/, ""),
        });
        const result = await generateImage({
          model: google.image(model as any),
          prompt,
          n: 1,
          aspectRatio: "1:1",
          providerOptions: { google: { personGeneration: "allow_adult", aspectRatio: "1:1" } },
          maxRetries: 0,
        });
        const uploaded = await uploadProfileImage({
          userId: user.id,
          bytes: result.image.uint8Array,
          mimeType: result.image.mediaType || "image/png",
          storyId,
          characterId,
        });
        await recordAdminUsage(row.id, 0, true, "image_generation");
        return Response.json({ ok: true, ...uploaded, providerLabel: row.label, model });
      }

      const result = await generateOpenAiCompatibleImage({
        provider: row.provider,
        baseUrl: (row.base_url?.trim() || DEFAULT_BASE_URLS[row.provider] || DEFAULT_BASE_URLS.openai).replace(/\/$/, ""),
        apiKey: row.api_key ?? "",
        model,
        prompt,
      });
      const uploaded = await uploadProfileImage({
        userId: user.id,
        bytes: result.bytes,
        mimeType: result.mimeType || "image/png",
        storyId,
        characterId,
      });
      await recordAdminUsage(row.id, result.tokens ?? 0, true, "image_generation");
      return Response.json({ ok: true, ...uploaded, providerLabel: row.label, model });
    } catch (error: any) {
      lastError = String(error?.message ?? error);
      failures.push(`${row.label || row.provider} / ${model}: ${lastError.slice(0, 220)}`);
      await recordAdminUsage(row.id, 0, false, "image_generation", lastError.slice(0, 500));
    }
  }

  const permissionBlocked = failures.some(isImagePermissionError);
  const message = permissionBlocked
    ? [
        "등록된 OpenAI provider가 이미지 생성 권한이 없는 계정/그룹으로 응답했습니다.",
        "Google Imagen 또는 실제 이미지 모델이 설정된 provider를 우선 사용하도록 시도했지만 모든 이미지 provider가 실패했습니다.",
        failures.slice(0, 4).join(" | "),
      ]
        .filter(Boolean)
        .join(" ")
    : `이미지 생성 provider가 모두 실패했습니다. ${failures.slice(0, 4).join(" | ") || lastError || "unknown"}`;
  return jsonMessageError("image_generation_failed", message, 503);
}

export const Route = createFileRoute("/api/reader-profile-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handlePost(request);
        } catch (error) {
          console.error("[api/reader-profile-image] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
