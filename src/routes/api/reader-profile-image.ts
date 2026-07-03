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

function defaultImageModel(provider: string, configuredModel?: string | null) {
  if (provider === "google") {
    return /imagen|image|banana/i.test(configuredModel ?? "") ? configuredModel! : "imagen-4.0-fast-generate-001";
  }
  if (provider === "openai") {
    return /image|dall|gpt-image/i.test(configuredModel ?? "") ? configuredModel! : "gpt-image-1";
  }
  return configuredModel || DEFAULT_MODELS[provider] || "gpt-image-1";
}

async function uploadProfileImage(userId: string, bytes: Uint8Array, mimeType: string) {
  await ensureStoryMediaBucket();
  const ext = mimeType.includes("webp")
    ? "webp"
    : mimeType.includes("jpeg") || mimeType.includes("jpg")
      ? "jpg"
      : "png";
  const storagePath = `profiles/${userId}/ai-profile-${Date.now()}.${ext}`;
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
  const providers = await listActiveAdminProviders("image_generation");
  if (!providers.length) return jsonError("no_image_provider", 503);

  let lastError = "";
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
        const uploaded = await uploadProfileImage(user.id, result.image.uint8Array, result.image.mediaType || "image/png");
        await recordAdminUsage(row.id, 0, true, "image_generation");
        return Response.json({ ok: true, ...uploaded, providerLabel: row.label, model });
      }

      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      const compat = createOpenAICompatible({
        name: `reader-profile-${row.provider}`,
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
      const uploaded = await uploadProfileImage(user.id, result.image.uint8Array, result.image.mediaType || "image/png");
      await recordAdminUsage(row.id, 0, true, "image_generation");
      return Response.json({ ok: true, ...uploaded, providerLabel: row.label, model });
    } catch (error: any) {
      lastError = String(error?.message ?? error);
      await recordAdminUsage(row.id, 0, false, "image_generation", lastError.slice(0, 500));
    }
  }

  return jsonServerError(new Error(lastError || "profile_image_generation_failed"), 500);
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
