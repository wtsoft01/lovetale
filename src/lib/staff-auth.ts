export const SUPER_ADMIN_EMAILS = ["admin@lovetale.org", "staff@lovetale.org"] as const;

export function normalizeStaffEmail(email: string | null | undefined) {
  return String(email ?? "").trim().toLowerCase();
}

function parseEmailList(value: string | undefined) {
  return String(value ?? "")
    .split(/[,\s;]+/)
    .map(normalizeStaffEmail)
    .filter(Boolean);
}

export function getSuperAdminEmails() {
  return Array.from(
    new Set([
      ...SUPER_ADMIN_EMAILS,
      ...parseEmailList(import.meta.env.VITE_SUPER_ADMIN_EMAILS as string | undefined),
    ]),
  );
}

export function isSuperAdminEmail(email: string | null | undefined) {
  const normalized = normalizeStaffEmail(email);
  return Boolean(normalized && getSuperAdminEmails().includes(normalized));
}
