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

function personFromMaps(
  userId: string | null | undefined,
  emailById: Map<string, string | null>,
  profileById: Map<string, { display_name: string | null }>,
) {
  const id = String(userId ?? "");
  return {
    userEmail: emailById.get(id) ?? null,
    displayName: profileById.get(id)?.display_name ?? null,
  };
}

function storyIdFromLedgerRef(row: { reason: string | null; ref_type: string | null; ref_id: string | null }) {
  if (!row.ref_id) return null;
  if (row.reason === "media_unlock") return row.ref_id.split(":")[0] || null;
  if (row.ref_type === "user_story") return row.ref_id;
  return null;
}

async function revenueOverview(request: Request) {
  const staff = await requireStaff(request);
  requireAdmin(staff.roles);

  const [ordersResult, ledgerResult, purchasesResult, authUsers] = await Promise.all([
    supabaseAdmin
      .from("credit_orders")
      .select(
        "id, user_id, package_id, credits, amount_usd, currency, network, wallet_address, tx_hash, status, note, created_at, updated_at, confirmed_at, refunded_at, refund_reason",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    supabaseAdmin
      .from("credit_ledger")
      .select("id,user_id,delta,reason,ref_type,ref_id,balance_after,note,created_at")
      .lt("delta", 0)
      .in("reason", ["story_purchase", "media_unlock"])
      .order("created_at", { ascending: false })
      .limit(300),
    supabaseAdmin
      .from("story_purchases")
      .select("id,buyer_id,story_id,price_credits_paid,author_share,created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    listAuthUsersForAdmin(),
  ]);

  const firstError = ordersResult.error || ledgerResult.error || purchasesResult.error;
  if (firstError) throw new ApiError("revenue_query_failed", 500, firstError.message);

  const ledgerRows = ledgerResult.data ?? [];
  const purchaseRows = purchasesResult.data ?? [];
  const storyIds = Array.from(
    new Set(
      [
        ...purchaseRows.map((row) => row.story_id),
        ...ledgerRows.map((row) => storyIdFromLedgerRef(row)).filter(Boolean),
      ].map(String),
    ),
  );
  const storiesResult =
    storyIds.length > 0
      ? await supabaseAdmin.from("user_stories").select("id,title,user_id,price_credits").in("id", storyIds)
      : { data: [], error: null };
  if (storiesResult.error) throw new ApiError("revenue_stories_query_failed", 500, storiesResult.error.message);

  const userIds = Array.from(
    new Set(
      [
        ...(ordersResult.data ?? []).map((row) => row.user_id),
        ...ledgerRows.map((row) => row.user_id),
        ...purchaseRows.map((row) => row.buyer_id),
        ...(storiesResult.data ?? []).map((row) => row.user_id),
      ]
        .filter(Boolean)
        .map(String),
    ),
  );
  const profilesResult =
    userIds.length > 0
      ? await supabaseAdmin.from("profiles").select("id,display_name").in("id", userIds)
      : { data: [], error: null };
  if (profilesResult.error) throw new ApiError("revenue_profiles_query_failed", 500, profilesResult.error.message);

  const emailById = new Map<string, string | null>();
  for (const user of authUsers) emailById.set(String(user.id), user.email ?? null);
  const profileById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  const storyById = new Map((storiesResult.data ?? []).map((story) => [story.id, story]));
  const purchaseByBuyerStory = new Map(
    purchaseRows.map((purchase) => [`${purchase.buyer_id}:${purchase.story_id}`, purchase]),
  );

  const recharges = (ordersResult.data ?? []).map((order) => {
    const person = personFromMaps(order.user_id, emailById, profileById);
    return {
      id: order.id,
      userId: order.user_id,
      userEmail: person.userEmail,
      displayName: person.displayName,
      packageId: order.package_id,
      credits: Number(order.credits ?? 0),
      amountUsd: Number(order.amount_usd ?? 0),
      currency: order.currency,
      network: order.network,
      walletAddress: order.wallet_address,
      txHash: order.tx_hash ?? null,
      status: order.status,
      note: order.note ?? null,
      createdAt: order.created_at,
      updatedAt: order.updated_at ?? null,
      confirmedAt: order.confirmed_at ?? null,
      refundedAt: order.refunded_at ?? null,
      refundReason: order.refund_reason ?? null,
    };
  });

  const usages = ledgerRows.map((row) => {
    const storyId = storyIdFromLedgerRef(row);
    const story = storyId ? storyById.get(storyId) : null;
    const purchase = storyId ? purchaseByBuyerStory.get(`${row.user_id}:${storyId}`) : null;
    const creditsSpent = Math.abs(Number(row.delta ?? 0));
    const reason = String(row.reason ?? "credit_usage");
    const productType = reason === "story_purchase" ? "story" : reason === "media_unlock" ? "media" : "other";
    const person = personFromMaps(row.user_id, emailById, profileById);
    return {
      id: row.id,
      userId: row.user_id,
      userEmail: person.userEmail,
      displayName: person.displayName,
      reason,
      productType,
      productLabel:
        productType === "story"
          ? "스토리 구매"
          : productType === "media"
            ? "이미지/미디어 해금"
            : reason,
      storyId,
      storyTitle: story?.title ?? null,
      creditsSpent,
      authorShare: Math.max(0, Number(purchase?.author_share ?? 0)),
      balanceAfter: Number(row.balance_after ?? 0),
      refType: row.ref_type ?? null,
      refId: row.ref_id ?? null,
      createdAt: row.created_at,
    };
  });

  return Response.json({
    ok: true,
    overview: {
      recharges,
      usages,
      summary: {
        rechargePending: recharges.filter((row) => row.status === "pending" || row.status === "submitted").length,
        rechargeConfirmed: recharges.filter((row) => row.status === "confirmed").length,
        rechargeRefunded: recharges.filter((row) => row.status === "refunded").length,
        rechargeRevenueUsd: recharges
          .filter((row) => row.status === "confirmed")
          .reduce((sum, row) => sum + row.amountUsd, 0),
        rechargeCreditsIssued: recharges
          .filter((row) => row.status === "confirmed")
          .reduce((sum, row) => sum + row.credits, 0),
        usageCount: usages.length,
        usageCreditsSpent: usages.reduce((sum, row) => sum + row.creditsSpent, 0),
        storyPurchaseCredits: usages
          .filter((row) => row.productType === "story")
          .reduce((sum, row) => sum + row.creditsSpent, 0),
        mediaUnlockCredits: usages
          .filter((row) => row.productType === "media")
          .reduce((sum, row) => sum + row.creditsSpent, 0),
        authorShareCredits: usages.reduce((sum, row) => sum + row.authorShare, 0),
      },
    },
  });
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

function countByUser(rows: Array<{ user_id: string | null }>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.user_id) continue;
    map.set(row.user_id, (map.get(row.user_id) ?? 0) + 1);
  }
  return map;
}

function latestIso(...values: Array<string | null | undefined>) {
  let latest: string | null = null;
  let latestTime = 0;
  for (const value of values) {
    const time = value ? new Date(value).getTime() : 0;
    if (Number.isFinite(time) && time > latestTime) {
      latest = value!;
      latestTime = time;
    }
  }
  return latest;
}

function activityStatusAt(value?: string | null) {
  const time = value ? new Date(value).getTime() : 0;
  if (!Number.isFinite(time) || time <= 0) return { activeNow: false };
  return { activeNow: Date.now() - time <= 10 * 60 * 1000 };
}

function buildSessionActivity(rows: Array<{ user_id: string | null; last_played_at?: string | null; updated_at?: string | null; created_at?: string | null }>) {
  const map = new Map<string, { latest: string | null; visitCount: number; totalDwellSeconds: number }>();
  for (const row of rows) {
    if (!row.user_id) continue;
    const current = map.get(row.user_id) ?? { latest: null, visitCount: 0, totalDwellSeconds: 0 };
    const startedAt = row.created_at ? new Date(row.created_at).getTime() : 0;
    const endedAt = new Date(row.last_played_at ?? row.updated_at ?? row.created_at ?? 0).getTime();
    const dwell = Number.isFinite(startedAt) && Number.isFinite(endedAt)
      ? Math.max(60, Math.min(4 * 60 * 60, Math.round((endedAt - startedAt) / 1000)))
      : 0;
    current.visitCount += 1;
    current.totalDwellSeconds += dwell;
    current.latest = latestIso(current.latest, row.last_played_at, row.updated_at, row.created_at);
    map.set(row.user_id, current);
  }
  return map;
}

function buildVisitActivity(rows: Array<{ user_id: string | null; event_type?: string | null; path?: string | null; duration_seconds?: number | null; last_seen_at?: string | null; created_at?: string | null }>) {
  const map = new Map<string, { latest: string | null; lastPath: string | null; visitCount: number; totalDwellSeconds: number }>();
  for (const row of rows) {
    if (!row.user_id) continue;
    const current = map.get(row.user_id) ?? { latest: null, lastPath: null, visitCount: 0, totalDwellSeconds: 0 };
    const rowLatest = latestIso(row.last_seen_at, row.created_at);
    const rowLatestTime = rowLatest ? new Date(rowLatest).getTime() : 0;
    const currentLatestTime = current.latest ? new Date(current.latest).getTime() : 0;
    if (!row.event_type || row.event_type === "pageview") current.visitCount += 1;
    current.totalDwellSeconds += Math.max(0, Math.round(Number(row.duration_seconds ?? 0)));
    if (rowLatestTime >= currentLatestTime) {
      current.latest = rowLatest;
      current.lastPath = row.path ?? null;
    }
    map.set(row.user_id, current);
  }
  return map;
}

function clampPercent(value: unknown, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function recordOf(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function initialAffectionFromCard(card: unknown) {
  return clampPercent(recordOf(recordOf(card).environment).initialAffection, 0);
}

async function members(request: Request) {
  const staff = await requireStaff(request);
  requireAdmin(staff.roles);

  const [
    authUsers,
    profilesResult,
    storiesResult,
    sessionsResult,
    chatsResult,
    affectionsResult,
    rolesResult,
    visitsResult,
  ] = await Promise.all([
    listAuthUsersForAdmin(),
    supabaseAdmin
      .from("profiles")
      .select("id, display_name, credits, age_verified, is_subscribed, subscription_expires_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabaseAdmin.from("user_stories").select("user_id").limit(10000),
    supabaseAdmin.from("story_sessions").select("user_id, created_at, updated_at, last_played_at").limit(10000),
    supabaseAdmin.from("story_chat_messages").select("user_id").limit(10000),
    supabaseAdmin.from("story_affection").select("user_id, affection").limit(10000),
    supabaseAdmin.from("user_roles").select("user_id, role").limit(10000),
    (supabaseAdmin as any)
      .from("user_activity_events")
      .select("user_id, event_type, path, duration_seconds, last_seen_at, created_at")
      .order("last_seen_at", { ascending: false })
      .limit(20000),
  ]);

  const firstError =
    profilesResult.error ||
    storiesResult.error ||
    sessionsResult.error ||
    chatsResult.error ||
    affectionsResult.error ||
    rolesResult.error;
  if (firstError) throw new ApiError("members_query_failed", 500, firstError.message);
  const visitsAvailable = !visitsResult.error;

  const profileById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  const authById = new Map(authUsers.map((user) => [String(user.id), user]));
  const userIds = new Set<string>([
    ...authById.keys(),
    ...(profilesResult.data ?? []).map((profile) => profile.id),
  ]);
  const storyCount = countByUser((storiesResult.data ?? []) as Array<{ user_id: string | null }>);
  const sessionCount = countByUser((sessionsResult.data ?? []) as Array<{ user_id: string | null }>);
  const chatMessageCount = countByUser((chatsResult.data ?? []) as Array<{ user_id: string | null }>);
  const sessionActivity = buildSessionActivity(
    (sessionsResult.data ?? []) as Array<{ user_id: string | null; created_at: string | null; updated_at: string | null; last_played_at: string | null }>,
  );
  const visitActivity = buildVisitActivity(
    visitsAvailable
      ? ((visitsResult.data ?? []) as Array<{ user_id: string | null; event_type?: string | null; path?: string | null; duration_seconds?: number | null; last_seen_at?: string | null; created_at?: string | null }>)
      : [],
  );
  const affectionValues = new Map<string, number[]>();
  for (const row of affectionsResult.data ?? []) {
    if (!row.user_id) continue;
    const list = affectionValues.get(row.user_id) ?? [];
    list.push(clampPercent(row.affection));
    affectionValues.set(row.user_id, list);
  }
  const rolesById = new Map<string, StaffRole[]>();
  for (const row of rolesResult.data ?? []) {
    const role = row.role as StaffRole;
    if (!row.user_id || !STAFF_ROLES.includes(role)) continue;
    rolesById.set(row.user_id, [...(rolesById.get(row.user_id) ?? []), role]);
  }

  const rows = [...userIds].map((userId) => {
    const profile = profileById.get(userId);
    const auth = authById.get(userId);
    const values = affectionValues.get(userId) ?? [];
    const tracked = visitActivity.get(userId);
    const estimated = sessionActivity.get(userId);
    const lastActivityAt = latestIso(tracked?.latest, estimated?.latest, auth?.last_sign_in_at, profile?.updated_at);
    const visitCount = tracked?.visitCount ?? estimated?.visitCount ?? 0;
    const totalDwellSeconds = tracked?.totalDwellSeconds ?? estimated?.totalDwellSeconds ?? 0;
    const averageAffection = values.length
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : 0;
    const activity = activityStatusAt(lastActivityAt);
    return {
      userId,
      email: auth?.email ?? null,
      displayName: profile?.display_name ?? auth?.user_metadata?.display_name ?? null,
      credits: Math.max(0, Number(profile?.credits ?? 0)),
      ageVerified: Boolean(profile?.age_verified),
      isSubscribed: Boolean(profile?.is_subscribed),
      subscriptionExpiresAt: profile?.subscription_expires_at ?? null,
      createdAt: profile?.created_at ?? auth?.created_at ?? null,
      updatedAt: profile?.updated_at ?? null,
      lastSignInAt: auth?.last_sign_in_at ?? null,
      lastActivityAt,
      lastVisitAt: tracked?.latest ?? null,
      lastPath: tracked?.lastPath ?? null,
      activeNow: activity.activeNow,
      visitCount,
      totalDwellSeconds,
      averageDwellSeconds: visitCount > 0 ? Math.round(totalDwellSeconds / visitCount) : 0,
      activitySource: tracked ? "tracked" : "estimated",
      storyCount: storyCount.get(userId) ?? 0,
      sessionCount: sessionCount.get(userId) ?? 0,
      chatMessageCount: chatMessageCount.get(userId) ?? 0,
      affectionCount: values.length,
      averageAffection,
      maxAffection: values.length ? Math.max(...values) : 0,
      roles: rolesById.get(userId) ?? [],
    };
  });

  rows.sort((a, b) => {
    const bTime = new Date(b.lastSignInAt ?? b.updatedAt ?? b.createdAt ?? 0).getTime();
    const aTime = new Date(a.lastSignInAt ?? a.updatedAt ?? a.createdAt ?? 0).getTime();
    return bTime - aTime;
  });

  return Response.json({ ok: true, rows });
}

async function userAffection(request: Request) {
  const staff = await requireStaff(request);
  requireAdmin(staff.roles);
  const userId = new URL(request.url).searchParams.get("userId")?.trim() ?? "";
  if (!userId) throw new ApiError("missing_user_id");

  const [affectionResult, storiesResult] = await Promise.all([
    supabaseAdmin
      .from("story_affection")
      .select("story_id, affection, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(300),
    supabaseAdmin
      .from("user_stories")
      .select("id,title,character_card,is_public,is_listed,updated_at")
      .order("updated_at", { ascending: false })
      .limit(300),
  ]);
  const firstError = affectionResult.error || storiesResult.error;
  if (firstError) throw new ApiError("user_affection_query_failed", 500, firstError.message);

  const storyById = new Map((storiesResult.data ?? []).map((story) => [story.id, story]));
  const rows = (affectionResult.data ?? []).map((row) => {
    const story = storyById.get(row.story_id);
    return {
      storyId: row.story_id,
      storyTitle: story?.title ?? row.story_id,
      affection: clampPercent(row.affection),
      initialAffection: initialAffectionFromCard(story?.character_card),
      updatedAt: row.updated_at ?? null,
    };
  });
  const stories = (storiesResult.data ?? [])
    .filter((story) => story.is_public || story.is_listed || rows.some((row) => row.storyId === story.id))
    .map((story) => ({
      storyId: story.id,
      storyTitle: story.title,
      initialAffection: initialAffectionFromCard(story.character_card),
      isPublic: Boolean(story.is_public),
      isListed: Boolean(story.is_listed),
    }));

  return Response.json({ ok: true, rows, stories });
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

  if (action === "bulk_adjust_credits") {
    const userIds = Array.isArray(body.userIds)
      ? Array.from(new Set(body.userIds.map((id) => String(id ?? "").trim()).filter(Boolean)))
      : [];
    const delta = Math.trunc(Number(body.delta ?? 0));
    if (!userIds.length) throw new ApiError("missing_user_ids");
    if (!Number.isFinite(delta) || delta === 0) throw new ApiError("invalid_credit_delta");

    for (const userId of userIds) {
      const { error } = await (supabaseAdmin as any).rpc("admin_adjust_user_credits", {
        _user_id: userId,
        _delta: delta,
        _reason: delta > 0 ? "admin_bulk_grant" : "admin_bulk_deduct",
        _note: String(body.note ?? "").trim() || null,
        _ref_type: "admin_bulk_manual",
        _ref_id: staff.userId,
      });
      if (error) throw new ApiError("bulk_adjust_credits_failed", 500, error.message);
    }
    return Response.json({ ok: true, count: userIds.length, delta });
  }

  if (action === "update_member_profile") {
    const userId = String(body.userId ?? "").trim();
    if (!userId) throw new ApiError("missing_user_id");
    const patch: Record<string, unknown> = {
      id: userId,
      updated_at: new Date().toISOString(),
    };
    if ("displayName" in body) patch.display_name = String(body.displayName ?? "").trim() || null;
    if ("ageVerified" in body) patch.age_verified = Boolean(body.ageVerified);
    if ("isSubscribed" in body) patch.is_subscribed = Boolean(body.isSubscribed);
    if ("subscriptionExpiresAt" in body) {
      const value = String(body.subscriptionExpiresAt ?? "").trim();
      patch.subscription_expires_at = value || null;
    }
    const { error } = await (supabaseAdmin.from("profiles") as any).upsert(patch, { onConflict: "id" });
    if (error) throw new ApiError("update_member_profile_failed", 500, error.message);
    return Response.json({ ok: true });
  }

  if (action === "bulk_update_member_profile") {
    const userIds = Array.isArray(body.userIds)
      ? Array.from(new Set(body.userIds.map((id) => String(id ?? "").trim()).filter(Boolean)))
      : [];
    if (!userIds.length) throw new ApiError("missing_user_ids");
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if ("ageVerified" in body && body.ageVerified !== null) patch.age_verified = Boolean(body.ageVerified);
    if ("isSubscribed" in body && body.isSubscribed !== null) patch.is_subscribed = Boolean(body.isSubscribed);
    if ("subscriptionExpiresAt" in body) {
      const value = String(body.subscriptionExpiresAt ?? "").trim();
      patch.subscription_expires_at = value || null;
    }
    if (Object.keys(patch).length <= 1) throw new ApiError("missing_bulk_update_fields");

    const { error } = await (supabaseAdmin.from("profiles") as any).upsert(
      userIds.map((id) => ({ id, ...patch })),
      { onConflict: "id" },
    );
    if (error) throw new ApiError("bulk_update_member_profile_failed", 500, error.message);
    return Response.json({ ok: true, count: userIds.length });
  }

  if (action === "set_user_affection") {
    const userId = String(body.userId ?? "").trim();
    const storyId = String(body.storyId ?? "").trim();
    const affection = clampPercent(body.affection);
    if (!userId) throw new ApiError("missing_user_id");
    if (!storyId) throw new ApiError("missing_story_id");
    const { data: story, error: storyError } = await supabaseAdmin
      .from("user_stories")
      .select("id")
      .eq("id", storyId)
      .maybeSingle();
    if (storyError) throw new ApiError("story_lookup_failed", 500, storyError.message);
    if (!story) throw new ApiError("story_not_found", 404);
    const { error } = await supabaseAdmin.from("story_affection").upsert(
      {
        user_id: userId,
        story_id: storyId,
        affection,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,story_id" },
    );
    if (error) throw new ApiError("set_user_affection_failed", 500, error.message);
    return Response.json({ ok: true, affection });
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
          if (mode === "revenue-overview") return await revenueOverview(request);
          if (mode === "credit-users") return await creditUsers(request);
          if (mode === "members") return await members(request);
          if (mode === "user-affection") return await userAffection(request);
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
