import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

const SUPER_ADMIN_EMAIL = "admin@lovetale.org";
const STAFF_ROLES = ["admin", "editor", "moderator"] as const;

type StaffRole = (typeof STAFF_ROLES)[number];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

function validRoles(roles: unknown): StaffRole[] {
  if (!Array.isArray(roles)) return [];
  return Array.from(new Set(roles.filter((role): role is StaffRole => STAFF_ROLES.includes(role))));
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
  if (email === SUPER_ADMIN_EMAIL) {
    await ensureSuperAdminRoles(data.user.id);
    return { userId: data.user.id };
  }

  const { data: roles, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin");
  if (rolesError) return { error: jsonServerError(rolesError, 500), userId: data.user.id };
  if (!roles?.length) return { error: jsonError("forbidden", 403) as Response, userId: data.user.id };

  return { userId: data.user.id };
}

async function listAuthUsers() {
  const users: any[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...(data.users ?? []));
    if ((data.users ?? []).length < 1000) break;
  }
  return users;
}

async function findAuthUserByEmail(email: string) {
  const needle = email.trim().toLowerCase();
  const users = await listAuthUsers();
  return users.find((user) => String(user.email ?? "").trim().toLowerCase() === needle) ?? null;
}

async function replaceRoles(userId: string, roles: StaffRole[]) {
  const { error: deleteError } = await supabaseAdmin
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .in("role", [...STAFF_ROLES]);
  if (deleteError) throw new Error(deleteError.message);

  if (!roles.length) return;
  const { error: insertError } = await supabaseAdmin
    .from("user_roles")
    .insert(roles.map((role) => ({ user_id: userId, role })));
  if (insertError) throw new Error(insertError.message);
}

async function assertNotLastAdmin(userId: string, nextRoles: StaffRole[]) {
  if (nextRoles.includes("admin")) return;

  const { data: currentRoles, error: currentError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (currentError) throw new Error(currentError.message);
  if (!currentRoles?.length) return;

  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  if ((count ?? 0) <= 1) throw new Error("cannot remove the last admin");
}

async function listStaff(request: Request) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const { data: roleRows, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id,role,created_at")
    .in("role", [...STAFF_ROLES]);
  if (rolesError) return jsonServerError(rolesError, 500);

  const byUser = new Map<string, StaffRole[]>();
  for (const row of roleRows ?? []) {
    const role = row.role as StaffRole;
    if (!STAFF_ROLES.includes(role)) continue;
    byUser.set(row.user_id, Array.from(new Set([...(byUser.get(row.user_id) ?? []), role])));
  }

  const ids = Array.from(byUser.keys());
  if (!ids.length) return Response.json({ ok: true, rows: [] });

  const [authUsers, profilesResult] = await Promise.all([
    listAuthUsers(),
    supabaseAdmin.from("profiles").select("id,display_name,created_at").in("id", ids),
  ]);
  if (profilesResult.error) return jsonServerError(profilesResult.error, 500);

  const usersById = new Map(authUsers.map((user) => [user.id, user]));
  const profilesById = new Map((profilesResult.data ?? []).map((profile: Pick<Profile, "id" | "display_name" | "created_at">) => [profile.id, profile]));

  const rows = ids.map((id) => {
    const user = usersById.get(id);
    const profile = profilesById.get(id);
    return {
      userId: id,
      email: user?.email ?? null,
      displayName: profile?.display_name ?? user?.user_metadata?.display_name ?? null,
      roles: byUser.get(id) ?? [],
      createdAt: user?.created_at ?? profile?.created_at ?? new Date().toISOString(),
    };
  });

  return Response.json({ ok: true, rows });
}

async function createStaff(request: Request, body: Record<string, any>) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? "").trim() || email.split("@")[0];
  const roles = validRoles(body.roles);
  if (!email || !password) return jsonError("email_and_password_required");
  if (password.length < 8) return jsonError("password_too_short");
  if (!roles.length) return jsonError("at_least_one_role_required");

  let user = await findAuthUserByEmail(email);
  if (!user) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error) return jsonServerError(error, 500);
    user = data.user;
  } else if (password) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: { ...(user.user_metadata ?? {}), display_name: displayName },
    });
    if (error) return jsonServerError(error, 500);
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: user.id,
    display_name: displayName,
    age_verified: true,
    updated_at: new Date().toISOString(),
  });
  if (profileError) return jsonServerError(profileError, 500);

  await replaceRoles(user.id, roles);
  return Response.json({ ok: true, userId: user.id });
}

async function updateRoles(request: Request, body: Record<string, any>) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const userId = String(body.userId ?? "").trim();
  if (!userId) return jsonError("missing_user_id");
  const roles = validRoles(body.roles);

  await assertNotLastAdmin(userId, roles);
  await replaceRoles(userId, roles);
  return Response.json({ ok: true });
}

async function resetPassword(request: Request, body: Record<string, any>) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const userId = String(body.userId ?? "").trim();
  const password = String(body.password ?? "");
  if (!userId) return jsonError("missing_user_id");
  if (password.length < 8) return jsonError("password_too_short");

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (error) return jsonServerError(error, 500);
  return Response.json({ ok: true });
}

async function removeStaff(request: Request, body: Record<string, any>) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const userId = String(body.userId ?? "").trim();
  if (!userId) return jsonError("missing_user_id");
  if (userId === admin.userId) return jsonError("cannot_remove_yourself");

  await assertNotLastAdmin(userId, []);
  await replaceRoles(userId, []);
  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/admin/staff")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await listStaff(request);
        } catch (error) {
          console.error("[api/admin/staff] GET failed", error);
          return jsonServerError(error, 500);
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, any>;
          const action = String(body.action ?? "");
          if (action === "create") return await createStaff(request, body);
          if (action === "update_roles") return await updateRoles(request, body);
          if (action === "reset_password") return await resetPassword(request, body);
          if (action === "remove") return await removeStaff(request, body);
          return jsonError("unknown_action");
        } catch (error) {
          console.error("[api/admin/staff] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
