import { createServerFn } from "@/lib/_mock/runtime";
import { fetchWithSupabaseAuth } from "@/lib/supabase-auth-fetch";

type StaffRole = "admin" | "editor" | "moderator";

export type AdminCreditUserRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  credits: number;
  updatedAt: string | null;
};

export type AdminMemberRow = AdminCreditUserRow & {
  createdAt: string | null;
  lastSignInAt: string | null;
  lastActivityAt: string | null;
  lastVisitAt: string | null;
  lastPath: string | null;
  activeNow: boolean;
  visitCount: number;
  totalDwellSeconds: number;
  averageDwellSeconds: number;
  activitySource: "tracked" | "estimated";
  ageVerified: boolean;
  isSubscribed: boolean;
  subscriptionExpiresAt: string | null;
  storyCount: number;
  sessionCount: number;
  chatMessageCount: number;
  affectionCount: number;
  averageAffection: number;
  maxAffection: number;
  roles: StaffRole[];
};

export type AdminUserAffectionRow = {
  storyId: string;
  storyTitle: string;
  affection: number;
  initialAffection: number;
  updatedAt: string | null;
};

export type AdminAvailableAffectionStory = {
  storyId: string;
  storyTitle: string;
  initialAffection: number;
  isPublic: boolean;
  isListed: boolean;
};

type StaffAccessPayload = {
  isAdmin: boolean;
  isEditor: boolean;
  isModerator: boolean;
  roles: StaffRole[];
  hasAny: boolean;
};

type DashboardStats = {
  totalUsers: number;
  totalStories: number;
  listedStories: number;
  revenue24hUsd: number;
  pendingOrders: number;
  activeSessions7d: number;
};

export type AdminRevenueRechargeRow = {
  id: string;
  userId: string;
  userEmail: string | null;
  displayName: string | null;
  packageId: string;
  credits: number;
  amountUsd: number;
  currency: string;
  network: string;
  walletAddress: string;
  txHash: string | null;
  status: "pending" | "submitted" | "confirmed" | "failed" | "refunded";
  note: string | null;
  createdAt: string;
  updatedAt: string | null;
  confirmedAt: string | null;
  refundedAt: string | null;
  refundReason: string | null;
};

export type AdminRevenueUsageRow = {
  id: string;
  userId: string;
  userEmail: string | null;
  displayName: string | null;
  reason: string;
  productType: "story" | "media" | "other";
  productLabel: string;
  storyId: string | null;
  storyTitle: string | null;
  creditsSpent: number;
  authorShare: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  createdAt: string;
};

export type AdminRevenueOverview = {
  recharges: AdminRevenueRechargeRow[];
  usages: AdminRevenueUsageRow[];
  summary: {
    rechargePending: number;
    rechargeConfirmed: number;
    rechargeRefunded: number;
    rechargeRevenueUsd: number;
    rechargeCreditsIssued: number;
    usageCount: number;
    usageCreditsSpent: number;
    storyPurchaseCredits: number;
    mediaUnlockCredits: number;
    authorShareCredits: number;
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
  return (
    payload?.message ||
    payload?.reason ||
    raw.slice(0, 180).replace(/\s+/g, " ").trim() ||
    res.statusText ||
    "unknown_error"
  );
}

async function adminCoreApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithSupabaseAuth(`/api/admin/core${path}`, init);
  if (!res.ok) throw new Error(`Admin API failed (${res.status}): ${await readAdminError(res)}`);
  return (await res.json()) as T;
}

export const checkIsAdmin = createServerFn({ method: "GET" }).handler(async (): Promise<StaffAccessPayload> => {
  const payload = await adminCoreApi<{ ok: true } & StaffAccessPayload>("?mode=roles");
  return {
    isAdmin: payload.isAdmin,
    isEditor: payload.isEditor,
    isModerator: payload.isModerator,
    roles: payload.roles,
    hasAny: payload.hasAny,
  };
});

export const getAdminDashboardStats = createServerFn({ method: "GET" }).handler(async (): Promise<DashboardStats> => {
  const payload = await adminCoreApi<{ ok: true; stats: DashboardStats }>("?mode=dashboard");
  return payload.stats;
});

export const listAdminOrders = createServerFn({ method: "GET" }).handler(async () => {
  const payload = await adminCoreApi<{ ok: true; rows: unknown[] }>("?mode=orders");
  return payload.rows;
});

export const getAdminRevenueOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminRevenueOverview> => {
    const payload = await adminCoreApi<{ ok: true; overview: AdminRevenueOverview }>("?mode=revenue-overview");
    return payload.overview;
  },
);

export const confirmCreditOrder = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { orderId: string; txHash: string; note?: string })
  .handler(async ({ data }) => {
    return adminCoreApi<{ ok: true; order: unknown }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm_order", ...data }),
    });
  });

export const refundCreditOrder = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { orderId: string; reason?: string })
  .handler(async ({ data }) => {
    return adminCoreApi<{ ok: true; order: unknown }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refund_order", ...data }),
    });
  });

export const markOrderFailed = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { orderId: string; note?: string })
  .handler(async ({ data }) => {
    await adminCoreApi<{ ok: true }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_order_failed", ...data }),
    });
    return { ok: true };
  });

export const listAdminCreditUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminCreditUserRow[]> => {
    const payload = await adminCoreApi<{ ok: true; rows: AdminCreditUserRow[] }>("?mode=credit-users");
    return payload.rows;
  },
);

export const listAdminMembers = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminMemberRow[]> => {
    const payload = await adminCoreApi<{ ok: true; rows: AdminMemberRow[] }>("?mode=members");
    return payload.rows;
  },
);

export const getAdminUserAffections = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => i as { userId: string })
  .handler(async ({ data }): Promise<{ rows: AdminUserAffectionRow[]; stories: AdminAvailableAffectionStory[] }> => {
    const params = new URLSearchParams({ mode: "user-affection", userId: data.userId });
    const payload = await adminCoreApi<{
      ok: true;
      rows: AdminUserAffectionRow[];
      stories: AdminAvailableAffectionStory[];
    }>(`?${params.toString()}`);
    return { rows: payload.rows, stories: payload.stories };
  });

export const updateAdminMemberProfile = createServerFn({ method: "POST" })
  .inputValidator(
    (i: unknown) =>
      i as {
        userId: string;
        displayName?: string | null;
        ageVerified?: boolean;
        isSubscribed?: boolean;
        subscriptionExpiresAt?: string | null;
      },
  )
  .handler(async ({ data }) => {
    await adminCoreApi<{ ok: true }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_member_profile", ...data }),
    });
    return { ok: true };
  });

export const setAdminUserAffection = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { userId: string; storyId: string; affection: number })
  .handler(async ({ data }) => {
    const payload = await adminCoreApi<{ ok: true; affection: number }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_user_affection", ...data }),
    });
    return { ok: true, affection: payload.affection };
  });

export const bulkUpdateAdminMembers = createServerFn({ method: "POST" })
  .inputValidator(
    (i: unknown) =>
      i as {
        userIds: string[];
        ageVerified?: boolean | null;
        isSubscribed?: boolean | null;
        subscriptionExpiresAt?: string | null;
      },
  )
  .handler(async ({ data }) => {
    const payload = await adminCoreApi<{ ok: true; count: number }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_update_member_profile", ...data }),
    });
    return payload;
  });

export const bulkAdjustUserCredits = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { userIds: string[]; delta: number; note?: string })
  .handler(async ({ data }) => {
    const payload = await adminCoreApi<{ ok: true; count: number; delta: number }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_adjust_credits", ...data }),
    });
    return payload;
  });

export const adjustUserCredits = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { userId: string; delta: number; note?: string })
  .handler(async ({ data }) => {
    const payload = await adminCoreApi<{ ok: true; balanceAfter: number; delta: number }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adjust_credits", ...data }),
    });
    return { ok: true, balanceAfter: payload.balanceAfter, delta: payload.delta };
  });
