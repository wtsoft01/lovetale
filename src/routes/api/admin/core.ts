import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STAFF_ROLES = ["admin", "editor", "moderator"] as const;
const SUPER_ADMIN_EMAIL = "admin@lovetale.org";

type StaffRole = (typeof STAFF_ROLES)[number];

class ApiError extends Error {
  constructor(
    public reason: string,
    public status = 400,
    message = reason,
  ) {
    super(message);
  }
}

function jsonError(reason: string, status = 400, message?: string) {
  return Response.json({ ok: false, reason, message: message ?? reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

async function ensureSuperAdminRoles(userId: string) {
  const { error } = await supabaseAdmin.from("user_roles").upsert(
    STAFF_ROLES.map((role) => ({ user_id: userId, role })),
    { onConflict: "user_id,role" },
  );
  if (error) throw new ApiError("role_sync_failed", 500, error.message);
}

async function requireStaff(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) throw new ApiError("missing_token", 401);

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new ApiError("invalid_token", 401);

  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (email === SUPER_ADMIN_EMAIL) await ensureSuperAdminRoles(data.user.id);

  const { data: rolesData, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (rolesError) throw new ApiError("roles_lookup_failed", 500, rolesError.message);

  const roles = (rolesData ?? [])
    .map((row) => row.role as StaffRole)
    .filter((role): role is StaffRole => STAFF_ROLES.includes(role));

  return { userId: data.user.id, roles };
}

function requireAnyRole(roles: StaffRole[]) {
  if (!roles.length) throw new ApiError("forbidden", 403);
}

function requireAdmin(roles: StaffRole[]) {
  if (!roles.includes("admin")) throw new ApiError("forbidden", 403);
}

async function dashboard(request: Request) {
  const staff = await requireStaff(request);
  requireAnyRole(staff.roles);

  const [
    { count: totalUsers, error: usersError },
    { count: totalStories, error: storiesError },
    { count: listedStories, error: listedError },
    { count: activeSessions7d, error: sessionsError },
    { count: pendingOrders, error: pendingOrdersError },
  ] = await Promise.all([
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

  const firstError = usersError || storiesError || listedError || sessionsError || pendingOrdersError;
  if (firstError) throw new ApiError("dashboard_query_failed", 500, firstError.message);

  return Response.json({
    ok: true,
    stats: {
      totalUsers: totalUsers ?? 0,
      totalStories: totalStories ?? 0,
      listedStories: listedStories ?? 0,
      revenue24hUsd: 0,
      pendingOrders: pendingOrders ?? 0,
      activeSessions7d: activeSessions7d ?? 0,
    },
  });
}

async function roles(request: Request) {
  const staff = await requireStaff(request);
  const { roles } = staff;
  return Response.json({
    ok: true,
    isAdmin: roles.includes("admin"),
    isEditor: roles.includes("editor") || roles.includes("admin"),
    isModerator: roles.includes("moderator") || roles.includes("admin"),
    roles,
    hasAny: roles.length > 0,
  });
}

async function orders(request: Request) {
  const staff = await requireStaff(request);
  requireAnyRole(staff.roles);

  const { data, error } = await supabaseAdmin
    .from("credit_orders")
    .select(
      "id, user_id, package_id, credits, amount_usd, currency, network, wallet_address, tx_hash, status, note, created_at, updated_at, confirmed_at, confirmed_by, refunded_at, refund_reason",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new ApiError("orders_query_failed", 500, error.message);

  return Response.json({ ok: true, rows: data ?? [] });
}

async function listAuthUsersForAdmin() {
  const users: any[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new ApiError("auth_users_query_failed", 500, error.message);
    users.push(...(data.users ?? []));
    if ((data.users ?? []).length < 1000) break;
  }
  return users;
}

async function creditUsers(request: Request) {
  const staff = await requireStaff(request);
  requireAdmin(staff.roles);

  const [{ data: profiles, error: profilesError }, authUsers] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, display_name, credits, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200),
    listAuthUsersForAdmin(),
  ]);
  if (profilesError) throw new ApiError("profiles_query_failed", 500, profilesError.message);

  const emailById = new Map<string, string | null>();
  for (const user of authUsers) emailById.set(String(user.id), user.email ?? null);

  return Response.json({
    ok: true,
    rows: (profiles ?? []).map((profile) => ({
      userId: profile.id,
      email: emailById.get(profile.id) ?? null,
      displayName: profile.display_name ?? null,
      credits: Math.max(0, Number(profile.credits ?? 0)),
      updatedAt: profile.updated_at ?? null,
    })),
  });
}

function getKstDayStartIso() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const key = kst.toISOString().slice(0, 10);
  return new Date(`${key}T00:00:00.000+09:00`).toISOString();
}

function getKstMonthStartIso() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const key = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return new Date(`${key}T00:00:00.000+09:00`).toISOString();
}

const REWARD_POLICIES = [
  { id: "daily_attendance", title: "일일 출석체크", credits: 20, limit: "계정당 1일 1회", status: "active" },
  { id: "attendance_streak_7", title: "7일 연속 출석 보너스", credits: 100, limit: "7일 연속 출석마다", status: "active" },
  { id: "welcome_bonus", title: "첫 체험 크레딧", credits: 100, limit: "계정당 1회", status: "active" },
  { id: "profile_completed", title: "프로필 완성", credits: 100, limit: "계정당 1회", status: "active" },
  { id: "first_story_started", title: "첫 스토리 시작", credits: 150, limit: "계정당 1회", status: "active" },
  { id: "first_creator_story", title: "창작 스토리 첫 생성", credits: 300, limit: "계정당 1회", status: "active" },
  { id: "invite_friend", title: "친구 초대 보상", credits: 500, limit: "초대 회원 첫 활동 완료 시", status: "planned" },
] as const;

async function rewardsOverview(request: Request) {
  const staff = await requireStaff(request);
  requireAdmin(staff.roles);

  const todayStart = getKstDayStartIso();
  const monthStart = getKstMonthStartIso();
  const [recentResult, todayResult, monthResult] = await Promise.all([
    supabaseAdmin
      .from("credit_ledger")
      .select("id,user_id,delta,reason,ref_id,balance_after,created_at")
      .like("reason", "reward_%")
      .order("created_at", { ascending: false })
      .limit(80),
    supabaseAdmin.from("credit_ledger").select("id,delta").like("reason", "reward_%").gte("created_at", todayStart),
    supabaseAdmin.from("credit_ledger").select("id,delta").like("reason", "reward_%").gte("created_at", monthStart),
  ]);

  const firstError = recentResult.error || todayResult.error || monthResult.error;
  if (firstError) throw new ApiError("rewards_query_failed", 500, firstError.message);

  const userIds = Array.from(new Set((recentResult.data ?? []).map((row) => row.user_id)));
  const profilesResult =
    userIds.length > 0
      ? await supabaseAdmin.from("profiles").select("id,display_name").in("id", userIds)
      : { data: [], error: null };
  if (profilesResult.error) throw new ApiError("reward_profiles_query_failed", 500, profilesResult.error.message);

  const displayNameById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.display_name]));
  return Response.json({
    ok: true,
    overview: {
      policies: REWARD_POLICIES,
      recentRewards: (recentResult.data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        displayName: displayNameById.get(row.user_id) ?? null,
        delta: Number(row.delta ?? 0),
        reason: row.reason,
        refId: row.ref_id,
        balanceAfter: Number(row.balance_after ?? 0),
        createdAt: row.created_at,
      })),
      stats: {
        todayCredits: (todayResult.data ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.delta ?? 0)), 0),
        todayClaims: todayResult.data?.length ?? 0,
        monthCredits: (monthResult.data ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.delta ?? 0)), 0),
        monthClaims: monthResult.data?.length ?? 0,
      },
    },
  });
}

async function postAction(request: Request) {
  const staff = await requireStaff(request);
  requireAdmin(staff.roles);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "confirm_order") {
    const orderId = String(body.orderId ?? "").trim();
    const txHash = String(body.txHash ?? "").trim();
    if (!orderId) throw new ApiError("missing_order_id");
    if (!txHash) throw new ApiError("missing_transaction_hash");
    const { data, error } = await (supabaseAdmin as any).rpc("admin_confirm_credit_order", {
      _order_id: orderId,
      _tx_hash: txHash,
      _note: String(body.note ?? "").trim() || null,
    });
    if (error) throw new ApiError("confirm_order_failed", 500, error.message);
    return Response.json({ ok: true, order: data });
  }

  if (action === "refund_order") {
    const orderId = String(body.orderId ?? "").trim();
    if (!orderId) throw new ApiError("missing_order_id");
    const { data, error } = await (supabaseAdmin as any).rpc("admin_refund_credit_order", {
      _order_id: orderId,
      _reason: String(body.reason ?? "").trim() || null,
    });
    if (error) throw new ApiError("refund_order_failed", 500, error.message);
    return Response.json({ ok: true, order: data });
  }

  if (action === "mark_order_failed") {
    const orderId = String(body.orderId ?? "").trim();
    if (!orderId) throw new ApiError("missing_order_id");
    const { data: order, error: orderError } = await supabaseAdmin
      .from("credit_orders")
      .select("id, status")
      .eq("id", orderId)
      .single();
    if (orderError) throw new ApiError("order_lookup_failed", 500, orderError.message);
    if (!order) throw new ApiError("order_not_found", 404);
    if (order.status === "confirmed") throw new ApiError("confirmed_order_cannot_fail");
    if ((order.status as string) === "refunded") throw new ApiError("refunded_order_cannot_fail");

    const { error } = await supabaseAdmin
      .from("credit_orders")
      .update({
        status: "failed",
        note: String(body.note ?? "").trim() || "admin marked failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (error) throw new ApiError("mark_order_failed_failed", 500, error.message);
    return Response.json({ ok: true });
  }

  if (action === "adjust_credits") {
    const userId = String(body.userId ?? "").trim();
    const delta = Math.trunc(Number(body.delta ?? 0));
    if (!userId) throw new ApiError("missing_user_id");
    if (!Number.isFinite(delta) || delta === 0) throw new ApiError("invalid_credit_delta");

    const { data, error } = await (supabaseAdmin as any).rpc("admin_adjust_user_credits", {
      _user_id: userId,
      _delta: delta,
      _reason: delta > 0 ? "admin_grant" : "admin_deduct",
      _note: String(body.note ?? "").trim() || null,
      _ref_type: "admin_manual",
      _ref_id: staff.userId,
    });
    if (error) throw new ApiError("adjust_credits_failed", 500, error.message);
    return Response.json({ ok: true, balanceAfter: Number(data ?? 0), delta });
  }

  throw new ApiError("unknown_action", 400);
}

export const Route = createFileRoute("/api/admin/core")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const mode = new URL(request.url).searchParams.get("mode") ?? "dashboard";
          if (mode === "roles") return await roles(request);
          if (mode === "dashboard") return await dashboard(request);
          if (mode === "orders") return await orders(request);
          if (mode === "credit-users") return await creditUsers(request);
          if (mode === "rewards-overview") return await rewardsOverview(request);
          return jsonError("unknown_mode", 400);
        } catch (error) {
          if (error instanceof ApiError) return jsonError(error.reason, error.status, error.message);
          console.error("[api/admin/core] GET failed", error);
          return jsonServerError(error, 500);
        }
      },
      POST: async ({ request }) => {
        try {
          return await postAction(request);
        } catch (error) {
          if (error instanceof ApiError) return jsonError(error.reason, error.status, error.message);
          console.error("[api/admin/core] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
