import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isSuperAdminEmail } from "@/lib/staff-auth";

const STAFF_ROLES = ["admin", "editor", "moderator"] as const;
const DEFAULT_SHARE_PERCENT = 70;

type StaffRole = (typeof STAFF_ROLES)[number];

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

async function ensureSuperAdminRoles(userId: string) {
  const rows = STAFF_ROLES.map((role) => ({ user_id: userId, role }));
  const { error } = await supabaseAdmin.from("user_roles").upsert(rows, { onConflict: "user_id,role" });
  if (error) throw new Error(error.message);
}

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return { error: jsonError("missing_token", 401) as Response, userId: "" };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { error: jsonError("invalid_token", 401) as Response, userId: "" };

  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (isSuperAdminEmail(email)) {
    await ensureSuperAdminRoles(data.user.id);
    return { userId: data.user.id };
  }

  const { data: rolesData, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (rolesError) return { error: jsonServerError(rolesError, 500), userId: data.user.id };

  const roles = (rolesData ?? [])
    .map((row) => row.role as StaffRole)
    .filter((role): role is StaffRole => STAFF_ROLES.includes(role));
  if (!roles.includes("admin")) return { error: jsonError("forbidden", 403) as Response, userId: data.user.id };
  return { userId: data.user.id };
}

async function listAuthUsersById(ids: string[]) {
  const target = new Set(ids);
  const byId = new Map<string, any>();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const user of data.users ?? []) {
      if (target.has(user.id)) byId.set(user.id, user);
    }
    if ((data.users ?? []).length < 1000 || byId.size === target.size) break;
  }
  return byId;
}

async function listRules(request: Request) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const [storiesResult, purchasesResult, rulesResult] = await Promise.all([
    supabaseAdmin.from("user_stories").select("id,user_id,is_listed"),
    supabaseAdmin.from("story_purchases").select("story_id,price_credits_paid,author_share"),
    supabaseAdmin.from("creator_revenue_rules").select("*"),
  ]);
  if (storiesResult.error) return jsonServerError(storiesResult.error, 500);
  if (purchasesResult.error) return jsonServerError(purchasesResult.error, 500);
  if (rulesResult.error) return jsonServerError(rulesResult.error, 500);

  const storyById = new Map((storiesResult.data ?? []).map((story) => [story.id, story]));
  const ruleByUser = new Map((rulesResult.data ?? []).map((rule) => [rule.user_id, rule]));
  const userIds = Array.from(
    new Set([
      ...(storiesResult.data ?? []).map((story) => story.user_id),
      ...(rulesResult.data ?? []).map((rule) => rule.user_id),
    ]),
  );

  const [profilesResult, usersById] = await Promise.all([
    userIds.length
      ? supabaseAdmin.from("profiles").select("id,display_name").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    listAuthUsersById(userIds),
  ]);
  if (profilesResult.error) return jsonServerError(profilesResult.error, 500);

  const profileById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  const rows = new Map<string, any>();
  for (const userId of userIds) {
    const rule = ruleByUser.get(userId);
    const profile = profileById.get(userId);
    const user = usersById.get(userId);
    rows.set(userId, {
      userId,
      displayName: profile?.display_name ?? user?.user_metadata?.display_name ?? null,
      email: user?.email ?? null,
      sharePercent: rule?.share_percent ?? DEFAULT_SHARE_PERCENT,
      note: rule?.note ?? null,
      storyCount: 0,
      listedCount: 0,
      salesCount: 0,
      grossCredits: 0,
      authorShareCredits: 0,
      updatedAt: rule?.updated_at ?? null,
    });
  }

  for (const story of storiesResult.data ?? []) {
    const row = rows.get(story.user_id);
    if (!row) continue;
    row.storyCount += 1;
    if (story.is_listed) row.listedCount += 1;
  }

  for (const purchase of purchasesResult.data ?? []) {
    const story = storyById.get(purchase.story_id);
    if (!story) continue;
    const row = rows.get(story.user_id);
    if (!row) continue;
    row.salesCount += 1;
    row.grossCredits += purchase.price_credits_paid;
    row.authorShareCredits += purchase.author_share;
  }

  return Response.json({
    ok: true,
    rows: Array.from(rows.values()).sort((a, b) => b.grossCredits - a.grossCredits),
  });
}

async function updateRule(request: Request) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, any>;
  const userId = String(body.userId ?? "").trim();
  const sharePercent = Math.max(0, Math.min(100, Math.round(Number(body.sharePercent) || 0)));
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  if (!userId) return jsonError("missing_user_id");

  const { error } = await supabaseAdmin.from("creator_revenue_rules").upsert(
    {
      user_id: userId,
      share_percent: sharePercent,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return jsonServerError(error, 500);
  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/admin/revenue-rules")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await listRules(request);
        } catch (error) {
          console.error("[api/admin/revenue-rules] GET failed", error);
          return jsonServerError(error, 500);
        }
      },
      POST: async ({ request }) => {
        try {
          return await updateRule(request);
        } catch (error) {
          console.error("[api/admin/revenue-rules] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
