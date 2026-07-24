import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isSuperAdminEmail } from "@/lib/staff-auth";

const STAFF_ROLES = ["admin", "editor", "moderator"] as const;

type StaffRole = (typeof STAFF_ROLES)[number];

function toAccess(roles: StaffRole[]) {
  return {
    isAdmin: roles.includes("admin"),
    isEditor: roles.includes("editor") || roles.includes("admin"),
    isModerator: roles.includes("moderator") || roles.includes("admin"),
    roles,
    hasAny: roles.length > 0,
  };
}

async function ensureSuperAdminRoles(userId: string) {
  const rows = STAFF_ROLES.map((role) => ({ user_id: userId, role }));
  const { error } = await supabaseAdmin
    .from("user_roles")
    .upsert(rows, { onConflict: "user_id,role" });
  if (error) throw new Error(error.message);
}

async function getRoles(userId: string): Promise<StaffRole[]> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => row.role as StaffRole)
    .filter((role): role is StaffRole => STAFF_ROLES.includes(role));
}

export const Route = createFileRoute("/api/auth/staff-access")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
        if (!token) {
          return Response.json({ ok: false, reason: "missing_token" }, { status: 401 });
        }

        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data.user) {
          return Response.json({ ok: false, reason: "invalid_token" }, { status: 401 });
        }

        const email = data.user.email?.trim().toLowerCase() ?? "";
        if (isSuperAdminEmail(email)) {
          await ensureSuperAdminRoles(data.user.id);
          return Response.json({ ok: true, ...toAccess([...STAFF_ROLES]) });
        }

        const roles = await getRoles(data.user.id);
        return Response.json({ ok: true, ...toAccess(roles) });
      },
    },
  },
});
