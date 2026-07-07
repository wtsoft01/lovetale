import { createServerFn } from "@/lib/_mock/runtime";
import { fetchWithSupabaseAuth } from "@/lib/supabase-auth-fetch";

export type AdminRewardPolicy = {
  id: string;
  title: string;
  credits: number;
  limit: string;
  status: "active" | "planned";
};

export type AdminRewardLedgerRow = {
  id: string;
  userId: string;
  displayName: string | null;
  delta: number;
  reason: string;
  refId: string | null;
  balanceAfter: number;
  createdAt: string;
};

export type AdminRewardsOverview = {
  policies: AdminRewardPolicy[];
  recentRewards: AdminRewardLedgerRow[];
  stats: {
    todayCredits: number;
    todayClaims: number;
    monthCredits: number;
    monthClaims: number;
  };
};

async function readAdminError(res: Response) {
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
  return payload?.message || payload?.reason || raw.slice(0, 180).replace(/\s+/g, " ").trim() || res.statusText;
}

export const getAdminRewardsOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminRewardsOverview> => {
    const res = await fetchWithSupabaseAuth("/api/admin/core?mode=rewards-overview");
    if (!res.ok) throw new Error(`Admin rewards API failed (${res.status}): ${await readAdminError(res)}`);
    const payload = (await res.json()) as { ok: true; overview: AdminRewardsOverview };
    return payload.overview;
  },
);
