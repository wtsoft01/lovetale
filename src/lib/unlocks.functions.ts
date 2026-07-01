import { supabase } from "@/integrations/supabase/client";
import { createServerFn } from "@/lib/_mock/runtime";
import { TIER_COST } from "./tier-pricing";

export { TIER_COST };

type ApiPayload<T> = { ok: true } & T;

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Unauthorized");
  return token;
}

async function unlocksApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api/unlocks${path}`, { ...init, headers });
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
    throw new Error(reason === "insufficient_credits" ? "INSUFFICIENT_CREDITS" : `Unlocks API failed (${res.status}): ${reason}`);
  }
  return (await res.json()) as T;
}

export const listMyUnlocks = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => i as { storyId: string })
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ storyId: data.storyId });
    const payload = await unlocksApi<
      ApiPayload<{
        rows: Array<{
          beat_id: string;
          heat_tier: string;
          credits_spent: number;
          created_at: string;
          unlocked_via?: string;
        }>;
      }>
    >(`?${params.toString()}`);
    return payload.rows;
  });

export const unlockBeatMedia = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { storyId: string; beatId: string; heatTier: string })
  .handler(async ({ data }) => {
    const payload = await unlocksApi<
      ApiPayload<{
        alreadyUnlocked: boolean;
        creditsSpent: number;
        unlockedVia: "free" | "credits" | "subscription";
      }>
    >("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return {
      ok: true,
      alreadyUnlocked: payload.alreadyUnlocked,
      creditsSpent: payload.creditsSpent,
      unlockedVia: payload.unlockedVia,
    };
  });
