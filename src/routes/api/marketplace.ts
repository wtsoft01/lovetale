import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";

type UserStoryRow = Database["public"]["Tables"]["user_stories"]["Row"];
type StoryPurchaseRow = Database["public"]["Tables"]["story_purchases"]["Row"];
type HeatTier = "soft" | "warm" | "spicy" | "steamy";
type Audience = "all" | "female" | "male";

const TIER_RANK: Record<HeatTier, number> = { soft: 0, warm: 1, spicy: 2, steamy: 3 };

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

function recordOf(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function arrayOf<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function beatCount(row: Pick<UserStoryRow, "beats" | "character_card" | "body_text">) {
  const beats = arrayOf(row.beats);
  if (beats.length) return beats.length;
  const chapters = arrayOf(recordOf(row.character_card).chapters);
  return chapters.length || (row.body_text?.trim() ? 1 : 0);
}

function previewOf(row: UserStoryRow) {
  const bodyText = (row.body_text ?? "").trim();
  if (bodyText) return { text: bodyText.slice(0, 420), narration: null, speaker: null };

  const firstBeat = arrayOf<Record<string, any>>(row.beats)[0];
  if (!firstBeat) return null;
  return {
    text: String(firstBeat.text ?? ""),
    narration: firstBeat.narration ?? null,
    speaker: firstBeat.speaker ?? null,
  };
}

function extractToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
}

async function getOptionalUser(request: Request) {
  const token = extractToken(request);
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function requireUser(request: Request) {
  const user = await getOptionalUser(request);
  if (!user) throw new Error("Unauthorized");
  return user;
}

async function authorNames(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map<string, string>();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .in("id", uniqueIds);
  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((row) => [row.id, row.display_name || "Anonymous"]));
}

function toCard(row: UserStoryRow, names: Map<string, string>) {
  return {
    id: row.id,
    title: row.title,
    logline: row.logline,
    cover_url: row.cover_url,
    price_credits: row.price_credits,
    author_id: row.user_id,
    author_name: names.get(row.user_id) ?? "Anonymous",
    beats_count: beatCount(row),
    audience: (row.audience || "all") as Audience,
    max_heat: (row.max_heat || "warm") as HeatTier,
    tags: row.tags ?? [],
    created_at: row.created_at,
  };
}

async function listMarketplace(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const audience = url.searchParams.get("audience") as Audience | null;
  const maxHeat = url.searchParams.get("max_heat") as HeatTier | "any" | null;
  const tags = url.searchParams.getAll("tag").filter(Boolean);

  const { data, error } = await supabaseAdmin
    .from("user_stories")
    .select("*")
    .eq("is_public", true)
    .eq("is_listed", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return jsonServerError(error, 500);

  let rows = (data ?? []) as UserStoryRow[];
  if (q) {
    rows = rows.filter((row) => `${row.title} ${row.logline ?? ""}`.toLowerCase().includes(q));
  }
  if (audience && audience !== "all") {
    rows = rows.filter((row) => row.audience === audience || row.audience === "all");
  }
  if (maxHeat && maxHeat !== "any") {
    rows = rows.filter((row) => TIER_RANK[(row.max_heat || "warm") as HeatTier] <= TIER_RANK[maxHeat]);
  }
  if (tags.length) {
    rows = rows.filter((row) => (row.tags ?? []).some((tag) => tags.includes(tag)));
  }

  const names = await authorNames(rows.map((row) => row.user_id));
  return Response.json({ ok: true, rows: rows.slice(0, 60).map((row) => toCard(row, names)) });
}

async function getMarketplaceStory(request: Request, id: string) {
  if (!id) return jsonError("missing_id");

  const user = await getOptionalUser(request);
  const { data: story, error } = await supabaseAdmin
    .from("user_stories")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonServerError(error, 500);
  if (!story || !story.is_public || !story.is_listed) return jsonError("story_not_found", 404);

  const purchased = user
    ? await hasPurchase(user.id, story.id)
    : false;
  const names = await authorNames([story.user_id]);

  return Response.json({
    ok: true,
    row: {
      ...toCard(story, names),
      character_card: recordOf(story.character_card),
      preview: previewOf(story),
      purchased,
      is_owner: user?.id === story.user_id,
    },
  });
}

async function getPlayableStory(request: Request, id: string) {
  if (!id) return jsonError("missing_id");
  const user = await requireUser(request);

  const { data: story, error } = await supabaseAdmin
    .from("user_stories")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonServerError(error, 500);
  if (!story) return jsonError("story_not_found", 404);

  const isOwner = story.user_id === user.id;
  const isFree = (story.price_credits ?? 0) <= 0;
  const purchased = isOwner || isFree ? true : await hasPurchase(user.id, story.id);
  if (!isOwner && (!story.is_public || !story.is_listed || !purchased)) return jsonError("purchase_required", 403);

  return Response.json({ ok: true, row: story });
}

async function hasPurchase(userId: string, storyId: string) {
  const { data, error } = await supabaseAdmin
    .from("story_purchases")
    .select("id")
    .eq("buyer_id", userId)
    .eq("story_id", storyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function readExistingPurchase(userId: string, storyId: string) {
  const { data, error } = await supabaseAdmin
    .from("story_purchases")
    .select("*")
    .eq("buyer_id", userId)
    .eq("story_id", storyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function creatorSharePercent(authorId: string) {
  const { data, error } = await supabaseAdmin
    .from("creator_revenue_rules")
    .select("share_percent")
    .eq("user_id", authorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Math.max(0, Math.min(100, Number(data?.share_percent ?? 70)));
}

async function purchaseStory(request: Request) {
  const user = await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const id = String(body.id ?? "").trim();
  if (!id) return jsonError("missing_id");

  const { data: story, error: storyError } = await supabaseAdmin
    .from("user_stories")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (storyError) return jsonServerError(storyError, 500);
  if (!story || !story.is_public || !story.is_listed) return jsonError("not_for_sale", 404);
  if (story.user_id === user.id) return jsonError("cannot_purchase_own_story", 400);

  const existing = await readExistingPurchase(user.id, story.id);
  if (existing) return Response.json({ ok: true, row: existing });

  const price = Math.max(0, Math.floor(story.price_credits ?? 0));
  const sharePercent = await creatorSharePercent(story.user_id);
  const authorShare = Math.floor((price * sharePercent) / 100);

  const { data: purchase, error: insertError } = await supabaseAdmin
    .from("story_purchases")
    .insert({
      buyer_id: user.id,
      story_id: story.id,
      price_credits_paid: price,
      author_share: authorShare,
    })
    .select("*")
    .single();
  if (insertError) {
    const duplicate = "code" in insertError && insertError.code === "23505";
    if (duplicate) {
      const row = await readExistingPurchase(user.id, story.id);
      return Response.json({ ok: true, row });
    }
    return jsonServerError(insertError, 500);
  }

  if (price <= 0) return Response.json({ ok: true, row: purchase });

  const { data: buyer, error: debitError } = await supabaseAdmin
    .from("profiles")
    .update({ updated_at: new Date().toISOString() } as any)
    .eq("id", user.id)
    .gte("credits", price)
    .select("credits")
    .maybeSingle();
  if (debitError) return jsonServerError(debitError, 500);
  if (!buyer) {
    await supabaseAdmin.from("story_purchases").delete().eq("id", purchase.id);
    return jsonError("insufficient_credits", 402);
  }

  const newBuyerBalance = Number(buyer.credits) - price;
  const { error: setBuyerError } = await supabaseAdmin
    .from("profiles")
    .update({ credits: newBuyerBalance, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (setBuyerError) return jsonServerError(setBuyerError, 500);

  await supabaseAdmin.from("credit_ledger").insert({
    user_id: user.id,
    delta: -price,
    reason: "story_purchase",
    ref_type: "user_story",
    ref_id: story.id,
    balance_after: newBuyerBalance,
  });

  if (authorShare > 0) {
    const { data: authorProfile } = await supabaseAdmin
      .from("profiles")
      .select("credits")
      .eq("id", story.user_id)
      .maybeSingle();
    const newAuthorBalance = Number(authorProfile?.credits ?? 0) + authorShare;
    await supabaseAdmin
      .from("profiles")
      .update({ credits: newAuthorBalance, updated_at: new Date().toISOString() })
      .eq("id", story.user_id);
    await supabaseAdmin.from("credit_ledger").insert({
      user_id: story.user_id,
      delta: authorShare,
      reason: "story_sale",
      ref_type: "user_story",
      ref_id: story.id,
      balance_after: newAuthorBalance,
    });
  }

  return Response.json({ ok: true, row: purchase });
}

async function listPurchasedStories(request: Request) {
  const user = await requireUser(request);
  const { data: purchases, error } = await supabaseAdmin
    .from("story_purchases")
    .select("*")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return jsonServerError(error, 500);

  const storyIds = (purchases ?? []).map((row) => row.story_id);
  if (!storyIds.length) return Response.json({ ok: true, rows: [] });

  const { data: stories, error: storiesError } = await supabaseAdmin
    .from("user_stories")
    .select("id,title,logline,cover_url,user_id")
    .in("id", storyIds);
  if (storiesError) return jsonServerError(storiesError, 500);

  const storyMap = new Map((stories ?? []).map((story) => [story.id, story]));
  const names = await authorNames((stories ?? []).map((story) => story.user_id));
  const rows = (purchases ?? []).map((purchase) => {
    const story = storyMap.get(purchase.story_id);
    return {
      id: purchase.story_id,
      title: story?.title ?? "(deleted)",
      logline: story?.logline ?? null,
      cover_url: story?.cover_url ?? null,
      author_name: story ? names.get(story.user_id) ?? "Anonymous" : "Anonymous",
      price_credits_paid: purchase.price_credits_paid,
      purchased_at: purchase.created_at,
    };
  });
  return Response.json({ ok: true, rows });
}

async function listPurchases(request: Request) {
  const user = await requireUser(request);
  const { data, error } = await supabaseAdmin
    .from("story_purchases")
    .select("*")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return jsonServerError(error, 500);
  return Response.json({ ok: true, rows: data ?? [] });
}

async function patchStory(request: Request) {
  const user = await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, any>;
  const id = String(body.id ?? "").trim();
  const action = String(body.action ?? "").trim();
  if (!id) return jsonError("missing_id");

  if (action === "publish") {
    const patch: Partial<UserStoryRow> = {
      is_public: true,
      is_listed: true,
      status: "published",
      price_credits: Math.max(0, Math.floor(Number(body.price_credits) || 0)),
      updated_at: new Date().toISOString(),
    };
    if (body.cover_url !== undefined) patch.cover_url = body.cover_url ? String(body.cover_url) : null;
    if (body.audience !== undefined) patch.audience = String(body.audience);
    if (body.max_heat !== undefined) patch.max_heat = String(body.max_heat);
    if (body.tags !== undefined) patch.tags = arrayOf<string>(body.tags).slice(0, 8);

    const { data, error } = await supabaseAdmin
      .from("user_stories")
      .update(patch as any)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) return jsonServerError(error, 500);
    if (!data) return jsonError("story_not_found", 404);
    return Response.json({ ok: true });
  }

  if (action === "unpublish") {
    const { data, error } = await supabaseAdmin
      .from("user_stories")
      .update({
        is_public: false,
        is_listed: false,
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) return jsonServerError(error, 500);
    if (!data) return jsonError("story_not_found", 404);
    return Response.json({ ok: true });
  }

  return jsonError("unknown_action");
}

export const Route = createFileRoute("/api/marketplace")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const mode = url.searchParams.get("mode") ?? "list";
          const id = url.searchParams.get("id") ?? "";
          if (mode === "detail") return await getMarketplaceStory(request, id);
          if (mode === "playable") return await getPlayableStory(request, id);
          if (mode === "purchased") return await listPurchasedStories(request);
          if (mode === "purchases") return await listPurchases(request);
          return await listMarketplace(request);
        } catch (error) {
          console.error("[api/marketplace] GET failed", error);
          return jsonServerError(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 500);
        }
      },
      POST: async ({ request }) => {
        try {
          return await purchaseStory(request);
        } catch (error) {
          console.error("[api/marketplace] POST failed", error);
          return jsonServerError(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 500);
        }
      },
      PATCH: async ({ request }) => {
        try {
          return await patchStory(request);
        } catch (error) {
          console.error("[api/marketplace] PATCH failed", error);
          return jsonServerError(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 500);
        }
      },
    },
  },
});
