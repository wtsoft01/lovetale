import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SUPER_ADMIN_EMAIL = "admin@lovetale.org";
const STAFF_ROLES = ["admin", "editor", "moderator"] as const;

async function grantAllStaffRoles(userId: string) {
  const rows = STAFF_ROLES.map((role) => ({ user_id: userId, role }));
  const { error } = await supabaseAdmin
    .from("user_roles")
    .upsert(rows, { onConflict: "user_id,role" });
  if (error) throw new Error(error.message);
  return { ok: true, roles: [...STAFF_ROLES] };
}

async function grantIfFirstAdmin(userId: string, email: string | null) {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  const allowEmail = (
    (import.meta.env.VITE_BOOTSTRAP_ADMIN_EMAIL as string | undefined) ?? SUPER_ADMIN_EMAIL
  )
    .trim()
    .toLowerCase();

  if (normalizedEmail === SUPER_ADMIN_EMAIL) {
    return grantAllStaffRoles(userId);
  }

  if (allowEmail && normalizedEmail !== allowEmail) {
    return { ok: false, reason: "email_mismatch" as const };
  }

  const { count, error: countError } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    return { ok: false, reason: "admin_exists" as const };
  }

  return grantAllStaffRoles(userId);
}

export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({} as any));
        const userId = String(body?.userId ?? "");
        const email = body?.email ? String(body.email) : null;

        if (!userId) {
          return Response.json({ ok: false, reason: "missing_user_id" }, { status: 400 });
        }

        const result = await grantIfFirstAdmin(userId, email);
        return Response.json(result, { status: 200 });
      },
    },
  },
});
