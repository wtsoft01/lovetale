import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STAFF_ROLES = ["admin", "editor", "moderator"] as const;

type StaffRole = (typeof STAFF_ROLES)[number];

export type AdminCreditUserRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  credits: number;
  updatedAt: string | null;
};

async function getCurrentRoles(userId: string): Promise<StaffRole[]> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => row.role as StaffRole)
    .filter((role): role is StaffRole => STAFF_ROLES.includes(role));
}

function requireAnyRole(roles: string[]) {
  if (roles.length === 0) throw new Error("Forbidden");
}

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getCurrentRoles((context as any).userId as string);
    return {
      isAdmin: roles.includes("admin"),
      isEditor: roles.includes("editor") || roles.includes("admin"),
      isModerator: roles.includes("moderator") || roles.includes("admin"),
      roles,
      hasAny: roles.length > 0,
    };
  });

export const getAdminDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getCurrentRoles((context as any).userId as string);
    requireAnyRole(roles);

    const [{ count: totalUsers, error: usersError }, { count: totalStories, error: storiesError }, { count: listedStories, error: listedError }, { count: activeSessions7d, error: sessionsError }, { count: pendingOrders, error: pendingOrdersError }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("user_stories").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("user_stories")
          .select("id", { count: "exact", head: true })
          .eq("is_public", true)
          .eq("is_listed", true),
        supabaseAdmin.from("story_sessions").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("credit_orders")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "submitted"]),
      ]);

    if (usersError) throw new Error(usersError.message);
    if (storiesError) throw new Error(storiesError.message);
    if (listedError) throw new Error(listedError.message);
    if (sessionsError) throw new Error(sessionsError.message);
    if (pendingOrdersError) throw new Error(pendingOrdersError.message);

    return {
      totalUsers: totalUsers ?? 0,
      totalStories: totalStories ?? 0,
      listedStories: listedStories ?? 0,
      revenue24hUsd: 0,
      pendingOrders: pendingOrders ?? 0,
      activeSessions7d: activeSessions7d ?? 0,
    };
  });

export const listAdminOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getCurrentRoles((context as any).userId as string);
    requireAnyRole(roles);
    const { data, error } = await supabaseAdmin
      .from("credit_orders")
      .select("id, user_id, package_id, credits, amount_usd, currency, network, wallet_address, tx_hash, status, note, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const confirmCreditOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => i as { orderId: string; txHash: string; note?: string })
  .handler(async ({ data, context }) => {
    const roles = await getCurrentRoles((context as any).userId as string);
    if (!roles.includes("admin")) throw new Error("Forbidden");

    const txHash = data.txHash?.trim();
    if (!data.orderId) throw new Error("Missing order id");
    if (!txHash) throw new Error("Missing transaction hash");

    const { data: order, error: orderError } = await supabaseAdmin
      .from("credit_orders")
      .select("id, user_id, credits, status, tx_hash, note")
      .eq("id", data.orderId)
      .single();
    if (orderError) throw new Error(orderError.message);
    if (!order) throw new Error("Order not found");
    if (order.status === "confirmed") throw new Error("Order already confirmed");
    if (order.status === "failed") throw new Error("Failed order cannot be confirmed");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("credits")
      .eq("id", order.user_id)
      .single();
    if (profileError) throw new Error(profileError.message);

    const balanceAfter = Math.max(0, Number(profile?.credits ?? 0)) + Math.max(0, Number(order.credits ?? 0));
    const now = new Date().toISOString();

    const { error: creditError } = await supabaseAdmin
      .from("profiles")
      .update({ credits: balanceAfter, updated_at: now })
      .eq("id", order.user_id);
    if (creditError) throw new Error(creditError.message);

    const { error: ledgerError } = await supabaseAdmin.from("credit_ledger").insert({
      user_id: order.user_id,
      delta: Math.max(0, Number(order.credits ?? 0)),
      reason: "order_confirmed",
      ref_type: "credit_order",
      ref_id: order.id,
      balance_after: balanceAfter,
    });
    if (ledgerError) throw new Error(ledgerError.message);

    const { data: confirmed, error: confirmError } = await supabaseAdmin
      .from("credit_orders")
      .update({
        status: "confirmed",
        tx_hash: txHash,
        note: data.note?.trim() || order.note,
        updated_at: now,
      })
      .eq("id", order.id)
      .select()
      .single();
    if (confirmError) throw new Error(confirmError.message);

    return { ok: true, order: confirmed, balanceAfter };
  });

export const markOrderFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => i as { orderId: string; note?: string })
  .handler(async ({ data, context }) => {
    const roles = await getCurrentRoles((context as any).userId as string);
    if (!roles.includes("admin")) throw new Error("Forbidden");
    if (!data.orderId) throw new Error("Missing order id");

    const { data: order, error: orderError } = await supabaseAdmin
      .from("credit_orders")
      .select("id, status")
      .eq("id", data.orderId)
      .single();
    if (orderError) throw new Error(orderError.message);
    if (!order) throw new Error("Order not found");
    if (order.status === "confirmed") throw new Error("Confirmed order cannot be marked failed");

    const { error } = await supabaseAdmin
      .from("credit_orders")
      .update({
        status: "failed",
        note: data.note?.trim() || "admin marked failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function listAuthUsersForAdmin() {
  const users: any[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...(data.users ?? []));
    if ((data.users ?? []).length < 1000) break;
  }
  return users;
}

export const listAdminCreditUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCreditUserRow[]> => {
    const roles = await getCurrentRoles((context as any).userId as string);
    if (!roles.includes("admin")) throw new Error("Forbidden");

    const [{ data: profiles, error: profilesError }, authUsers] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, display_name, credits, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200),
      listAuthUsersForAdmin(),
    ]);
    if (profilesError) throw new Error(profilesError.message);

    const emailById = new Map<string, string | null>();
    for (const user of authUsers) {
      emailById.set(String(user.id), user.email ?? null);
    }

    return (profiles ?? []).map((profile) => ({
      userId: profile.id,
      email: emailById.get(profile.id) ?? null,
      displayName: profile.display_name ?? null,
      credits: Math.max(0, Number(profile.credits ?? 0)),
      updatedAt: profile.updated_at ?? null,
    }));
  });

export const adjustUserCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => i as { userId: string; delta: number; note?: string })
  .handler(async ({ data, context }) => {
    const adminUserId = (context as any).userId as string;
    const roles = await getCurrentRoles(adminUserId);
    if (!roles.includes("admin")) throw new Error("Forbidden");

    const userId = data.userId?.trim();
    const delta = Math.trunc(Number(data.delta || 0));
    const note = data.note?.trim();
    if (!userId) throw new Error("Missing user id");
    if (!Number.isFinite(delta) || delta === 0) throw new Error("크레딧 변동값을 입력하세요.");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();
    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("User profile not found");

    const currentCredits = Math.max(0, Number(profile.credits ?? 0));
    const balanceAfter = Math.max(0, currentCredits + delta);
    const appliedDelta = balanceAfter - currentCredits;
    if (appliedDelta === 0) throw new Error("차감 가능한 크레딧이 없습니다.");

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ credits: balanceAfter, updated_at: now })
      .eq("id", userId);
    if (updateError) throw new Error(updateError.message);

    const { error: ledgerError } = await supabaseAdmin.from("credit_ledger").insert({
      user_id: userId,
      delta: appliedDelta,
      reason: appliedDelta > 0 ? "admin_grant" : "admin_deduct",
      ref_type: note ? `admin_manual:${note.slice(0, 80)}` : "admin_manual",
      ref_id: adminUserId,
      balance_after: balanceAfter,
    });
    if (ledgerError) throw new Error(ledgerError.message);

    return { ok: true, balanceAfter, delta: appliedDelta };
  });
