import { createServerFn } from "@/lib/_mock/runtime";
import { supabase } from "@/integrations/supabase/client";

export type Audience = "all" | "female" | "male";
export type HeatTier = "soft" | "warm" | "spicy" | "steamy";

export type MarketplaceCard = {
  id: string;
  title: string;
  logline: string | null;
  cover_url: string | null;
  price_credits: number;
  author_id: string;
  author_name: string;
  beats_count: number;
  audience: Audience;
  max_heat: HeatTier;
  tags: string[];
  created_at: string;
};

export type MarketplaceDetail = MarketplaceCard & {
  character_card: any;
  preview: any;
  purchased: boolean;
  is_owner: boolean;
};

export type MarketplaceFilters = {
  q?: string;
  audience?: Audience;
  max_heat?: HeatTier | "any";
  tags?: string[];
};

export type PurchasedStory = {
  id: string;
  title: string;
  logline: string | null;
  cover_url: string | null;
  author_name: string;
  price_credits_paid: number;
  purchased_at: string;
};

type ApiPayload<T> = { ok: true } & T;

async function getAccessToken(optional = false) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token && !optional) throw new Error("Unauthorized");
  return token ?? "";
}

async function marketplaceApi<T>(path: string, init?: RequestInit, optionalAuth = false): Promise<T> {
  const token = await getAccessToken(optionalAuth);
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api/marketplace${path}`, {
    ...init,
    headers,
  });
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
      payload?.reason ||
      payload?.message ||
      raw.slice(0, 180).replace(/\s+/g, " ").trim() ||
      res.statusText ||
      "unknown_error";
    throw new Error(`Marketplace API failed (${res.status}): ${reason}`);
  }
  return (await res.json()) as T;
}

function queryString(filters: MarketplaceFilters = {}) {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.audience) params.set("audience", filters.audience);
  if (filters.max_heat) params.set("max_heat", filters.max_heat);
  for (const tag of filters.tags ?? []) {
    if (tag) params.append("tag", tag);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const listMarketplace = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => (i ?? {}) as MarketplaceFilters)
  .handler(async ({ data }) => {
    const payload = await marketplaceApi<ApiPayload<{ rows: MarketplaceCard[] }>>(queryString(data), undefined, true);
    return payload.rows;
  });

export const getMarketplaceStory = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { id: string })
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ mode: "detail", id: data.id });
    const payload = await marketplaceApi<ApiPayload<{ row: MarketplaceDetail }>>(`?${params.toString()}`, undefined, true);
    return payload.row;
  });

export const purchaseStory = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { id: string })
  .handler(async ({ data }) => {
    const payload = await marketplaceApi<ApiPayload<{ row: any }>>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.id }),
    });
    return payload.row;
  });

export const getPlayableUserStory = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { id: string })
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ mode: "playable", id: data.id });
    const payload = await marketplaceApi<ApiPayload<{ row: any }>>(`?${params.toString()}`);
    return payload.row;
  });

export const publishUserStory = createServerFn({ method: "POST" })
  .inputValidator(
    (i: unknown) =>
      i as {
        id: string;
        price_credits: number;
        cover_url?: string | null;
        audience?: Audience;
        max_heat?: HeatTier;
        tags?: string[];
      },
  )
  .handler(async ({ data }) => {
    await marketplaceApi<ApiPayload<{}>>("", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, action: "publish" }),
    });
    return { ok: true };
  });

export const unpublishUserStory = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { id: string })
  .handler(async ({ data }) => {
    await marketplaceApi<ApiPayload<{}>>("", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.id, action: "unpublish" }),
    });
    return { ok: true };
  });

export const listMyPurchasedStories = createServerFn({ method: "GET" }).handler(async () => {
  const payload = await marketplaceApi<ApiPayload<{ rows: PurchasedStory[] }>>("?mode=purchased");
  return payload.rows;
});

export const listMyPurchases = createServerFn({ method: "GET" }).handler(async () => {
  const payload = await marketplaceApi<ApiPayload<{ rows: any[] }>>("?mode=purchases");
  return payload.rows;
});
