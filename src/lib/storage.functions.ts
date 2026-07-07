import { createServerFn } from "@/lib/_mock/runtime";
import { fetchWithSupabaseAuth } from "@/lib/supabase-auth-fetch";

export async function ensureStoryMediaBucket() {
  const res = await fetchWithSupabaseAuth("/api/storage/ensure-story-media", {
    method: "POST",
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(raw || res.statusText || "failed to ensure story-media bucket");
  }
}

export const ensureStoryMediaBucketFn = createServerFn({ method: "POST" }).handler(async () => {
  await ensureStoryMediaBucket();
  return { ok: true };
});
