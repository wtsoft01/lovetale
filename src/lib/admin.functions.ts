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
