import { createServerFn } from "@/lib/_mock/runtime";
import { supabase } from "@/integrations/supabase/client";

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Unauthorized");
  return token;
}

export async function ensureStoryMediaBucket() {
  const token = await getAccessToken();
  const res = await fetch("/api/storage/ensure-story-media", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
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
