import { supabase } from "@/integrations/supabase/client";
import { createServerFn } from "@/lib/_mock/runtime";

const DEFAULT_SHARE_PERCENT = 70;

export type CreatorRevenueRule = {
  userId: string;
  displayName: string | null;
  email: string | null;
  sharePercent: number;
  note: string | null;
  storyCount: number;
  listedCount: number;
  salesCount: number;
  grossCredits: number;
  authorShareCredits: number;
  updatedAt: string | null;
};

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Unauthorized");
  return token;
}

async function revenueRulesApi<T>(init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch("/api/admin/revenue-rules", {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
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
      payload?.message ||
      payload?.reason ||
      raw.slice(0, 180).replace(/\s+/g, " ").trim() ||
      res.statusText ||
      "unknown_error";
    throw new Error(`Revenue rules API failed (${res.status}): ${reason}`);
  }
  return (await res.json()) as T;
}

export const getMyCreatorRevenueRule = createServerFn({ method: "GET" }).handler(async () => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("creator_revenue_rules")
    .select("share_percent,note,updated_at")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return {
    sharePercent: data?.share_percent ?? DEFAULT_SHARE_PERCENT,
    note: data?.note ?? null,
    updatedAt: data?.updated_at ?? null,
  };
});

export const listCreatorRevenueRules = createServerFn({ method: "GET" }).handler(async () => {
  const payload = await revenueRulesApi<{ ok: true; rows: CreatorRevenueRule[] }>();
  return payload.rows;
});

export const updateCreatorRevenueRule = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { userId: string; sharePercent: number; note?: string })
  .handler(async ({ data }) => {
    await revenueRulesApi<{ ok: true }>({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { ok: true };
  });
