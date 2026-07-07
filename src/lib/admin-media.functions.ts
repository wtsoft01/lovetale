import { createServerFn } from "@/lib/_mock/runtime";
import { fetchWithSupabaseAuth } from "@/lib/supabase-auth-fetch";

type ApiPayload<T> = { ok: true } & T;

export type MediaAssetRow = {
  id: string;
  user_id: string;
  story_id: string | null;
  chapter_id: string | null;
  beat_id: string | null;
  asset_type: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  content_hash: string;
  tags: string[];
  status: string;
  validation_errors: string[];
  metadata: any;
  created_at: string;
  updated_at: string;
};

async function adminMediaApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithSupabaseAuth(`/api/admin/media${path}`, init);
  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text().catch(() => "");
    let payload: any = null;
    if (contentType.includes("application/json") && raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
    }
    const reason =
      payload?.reason ||
      payload?.message ||
      raw.slice(0, 180).replace(/\s+/g, " ").trim() ||
      res.statusText ||
      "unknown_error";
    throw new Error(`Admin media API failed (${res.status}): ${reason}`);
  }
  return (await res.json()) as T;
}

export const listMediaAssets = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => (i ?? {}) as Record<string, unknown>)
  .handler(async ({ data }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null || value === "" || value === "all") continue;
      params.set(key, String(value));
    }
    const query = params.toString();
    const payload = await adminMediaApi<ApiPayload<{ rows: MediaAssetRow[] }>>(query ? `?${query}` : "");
    return payload.rows;
  });

export const checkMediaDuplicate = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => i as { contentHash: string })
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ mode: "duplicate", contentHash: data.contentHash });
    const payload = await adminMediaApi<ApiPayload<{ duplicate: boolean; asset: MediaAssetRow | null }>>(
      `?${params.toString()}`,
    );
    return { duplicate: payload.duplicate, asset: payload.asset };
  });

export const registerMediaAsset = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as Record<string, unknown>)
  .handler(async ({ data }) => {
    const payload = await adminMediaApi<ApiPayload<{ duplicate: boolean; asset: MediaAssetRow | null }>>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { duplicate: payload.duplicate, asset: payload.asset };
  });

export const updateMediaAsset = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as Record<string, unknown>)
  .handler(async ({ data }) => {
    const payload = await adminMediaApi<ApiPayload<{ asset: MediaAssetRow }>>("", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return payload.asset;
  });
