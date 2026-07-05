import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@/lib/_mock/runtime";

export type HomeSlot = Database["public"]["Enums"]["home_slot"];

export type HomePlacementCard = {
  id: string;
  slot: HomeSlot;
  sort_order: number;
  story_id: string;
  content_type: "story" | "story_rpg";
  title: string;
  logline: string | null;
  cover_url: string | null;
  price_credits: number;
  author_id: string;
  author_name: string;
  audience: string;
  max_heat: string;
  tags: string[] | null;
  created_at: string;
};

export type AdminHomePlacementRow = {
  id: string;
  slot: HomeSlot;
  sort_order: number;
  is_active: boolean;
  story_id: string;
  created_at: string;
  user_stories: {
    id: string;
    title: string;
    cover_url: string | null;
    is_public: boolean;
    is_listed: boolean;
  } | null;
};

type ApiPayload<T> = { ok: true } & T;

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Unauthorized");
  return token;
}

async function readError(res: Response) {
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
  return (
    payload?.reason ||
    payload?.message ||
    raw.slice(0, 180).replace(/\s+/g, " ").trim() ||
    res.statusText ||
    "unknown_error"
  );
}

async function publicPlacementsApi<T>(slot: HomeSlot): Promise<T> {
  const params = new URLSearchParams({ slot });
  const res = await fetch(`/api/home-placements?${params.toString()}`);
  if (!res.ok) throw new Error(`Home placements API failed (${res.status}): ${await readError(res)}`);
  return (await res.json()) as T;
}

async function adminPlacementsApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`/api/admin/placements${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`Admin placements API failed (${res.status}): ${await readError(res)}`);
  return (await res.json()) as T;
}

export const listHomePlacements = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => i as { slot: HomeSlot })
  .handler(async ({ data }): Promise<HomePlacementCard[]> => {
    const payload = await publicPlacementsApi<ApiPayload<{ rows: HomePlacementCard[] }>>(data.slot);
    return payload.rows.map((row) => ({ ...row, tags: row.tags ?? [] }));
  });

export const adminListPlacements = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => i as { slot: HomeSlot })
  .handler(async ({ data }): Promise<AdminHomePlacementRow[]> => {
    const params = new URLSearchParams({ slot: data.slot });
    const payload = await adminPlacementsApi<ApiPayload<{ rows: AdminHomePlacementRow[] }>>(
      `?${params.toString()}`,
    );
    return payload.rows;
  });

export const addHomePlacement = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { slot: HomeSlot; story_id: string; sort_order?: number })
  .handler(async ({ data }) => {
    await adminPlacementsApi<ApiPayload<{}>>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { ok: true };
  });

export const updateHomePlacement = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { id: string; sort_order?: number; is_active?: boolean })
  .handler(async ({ data }) => {
    await adminPlacementsApi<ApiPayload<{}>>("", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { ok: true };
  });

export const removeHomePlacement = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { id: string })
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ id: data.id });
    await adminPlacementsApi<ApiPayload<{}>>(`?${params.toString()}`, { method: "DELETE" });
    return { ok: true };
  });
