import { supabase } from "@/integrations/supabase/client";

const STAFF_ROLES = ["admin", "editor", "moderator"] as const;
const SUPER_ADMIN_EMAIL = "admin@lovetale.org";

type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffAccess = {
  isAdmin: boolean;
  isEditor: boolean;
  isModerator: boolean;
  roles: StaffRole[];
  hasAny: boolean;
};

const emptyStaffAccess: StaffAccess = {
  isAdmin: false,
  isEditor: false,
  isModerator: false,
  roles: [],
  hasAny: false,
};

function toStaffAccess(roles: StaffRole[]): StaffAccess {
  return {
    isAdmin: roles.includes("admin"),
    isEditor: roles.includes("editor") || roles.includes("admin"),
    isModerator: roles.includes("moderator") || roles.includes("admin"),
    roles,
    hasAny: roles.length > 0,
  };
}

async function getServerStaffAccess(accessToken?: string): Promise<StaffAccess | null> {
  const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return null;

  const response = await fetch("/api/auth/staff-access", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;

  const result = await response.json().catch(() => null);
  if (!result?.ok) return null;

  return {
    isAdmin: Boolean(result.isAdmin),
    isEditor: Boolean(result.isEditor),
    isModerator: Boolean(result.isModerator),
    roles: (result.roles ?? []).filter((role: string): role is StaffRole =>
      STAFF_ROLES.includes(role as StaffRole),
    ),
    hasAny: Boolean(result.hasAny),
  };
}

export async function getStaffAccess(
  userIdOrOptions?: string | { userId?: string; accessToken?: string; email?: string },
): Promise<StaffAccess> {
  const options =
    typeof userIdOrOptions === "string" ? { userId: userIdOrOptions } : userIdOrOptions ?? {};

  const serverAccess = await getServerStaffAccess(options.accessToken).catch(() => null);
  if (serverAccess) return serverAccess;

  let resolvedUserId = options.userId;
  let resolvedEmail: string | undefined = options.email;

  if (!resolvedUserId) {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return emptyStaffAccess;
    resolvedUserId = data.user.id;
    resolvedEmail = resolvedEmail ?? data.user.email ?? undefined;
  } else if (!resolvedEmail) {
    const { data } = await supabase.auth.getUser();
    resolvedEmail = data.user?.email ?? undefined;
  }

  if (resolvedEmail?.trim().toLowerCase() === SUPER_ADMIN_EMAIL) {
    return toStaffAccess([...STAFF_ROLES]);
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", resolvedUserId);

  if (error) throw error;

  const roles = (data ?? [])
    .map((row) => row.role as StaffRole)
    .filter((role): role is StaffRole => STAFF_ROLES.includes(role));

  return toStaffAccess(roles);
}
