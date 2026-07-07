import { createServerFn } from "@/lib/_mock/runtime";
import { fetchWithSupabaseAuth } from "@/lib/supabase-auth-fetch";

export type StaffRole = "admin" | "editor" | "moderator";

export type StaffUserRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  roles: StaffRole[];
  createdAt: string;
};

async function staffApi<T>(init?: RequestInit): Promise<T> {
  const res = await fetchWithSupabaseAuth("/api/admin/staff", init);
  if (!res.ok) {
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
    const reason =
      payload?.message ||
      payload?.reason ||
      raw.slice(0, 180).replace(/\s+/g, " ").trim() ||
      res.statusText ||
      "unknown_error";
    throw new Error(`Admin staff API failed (${res.status}): ${reason}`);
  }
  return (await res.json()) as T;
}

export const listStaffUsers = createServerFn({ method: "GET" }).handler(async (): Promise<StaffUserRow[]> => {
  const payload = await staffApi<{ ok: true; rows: StaffUserRow[] }>();
  return payload.rows;
});

export const createStaffUser = createServerFn({ method: "POST" })
  .inputValidator(
    (i: unknown) => i as { email: string; password: string; displayName?: string; roles: StaffRole[] },
  )
  .handler(async ({ data }) => {
    const payload = await staffApi<{ ok: true; userId: string }>({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...data }),
    });
    return { ok: true, userId: payload.userId };
  });

export const updateStaffRoles = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { userId: string; roles: StaffRole[] })
  .handler(async ({ data }) => {
    await staffApi<{ ok: true }>({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_roles", ...data }),
    });
    return { ok: true };
  });

export const resetStaffPassword = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { userId: string; password: string })
  .handler(async ({ data }) => {
    await staffApi<{ ok: true }>({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_password", ...data }),
    });
    return { ok: true };
  });

export const removeStaffUser = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { userId: string })
  .handler(async ({ data }) => {
    await staffApi<{ ok: true }>({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", ...data }),
    });
    return { ok: true };
  });
