import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type HomeSlot = Database["public"]["Enums"]["home_slot"];
type UserStoryRow = Database["public"]["Tables"]["user_stories"]["Row"];
type PlacementRow = Pick<
  Database["public"]["Tables"]["home_placements"]["Row"],
  "id" | "slot" | "sort_order" | "story_id" | "created_at"
>;

const HOME_SLOTS = new Set<HomeSlot>(["hero", "trending", "new", "all"]);
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

function jsonResponse(body: unknown, status?: number) {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function jsonError(reason: string, status = 400) {
  return jsonResponse({ ok: false, reason }, status);
}

function jsonServerError(error: unknown, status = 500) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error
        ? JSON.stringify(error)
        : String(error);
  return jsonResponse({ ok: false, reason: "server_error", message }, status);
}

function validSlot(value: string | null): HomeSlot | null {
  return value && HOME_SLOTS.has(value as HomeSlot) ? (value as HomeSlot) : null;
}

function recordOf(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function contentTypeFromCard(card: Record<string, any>): "story" | "story_rpg" {
  const storyRpg = recordOf(card.storyRpg);
  const sourceStoryId = String(storyRpg.sourceStoryId || card.sourceStoryId || "").trim();
  const isStoryRpg =
    card.contentType === "story_rpg" &&
    (Boolean(sourceStoryId) ||
      storyRpg.enabled === true ||
      Boolean(storyRpg.generatedFrom) ||
      (Array.isArray(storyRpg.scenes) && storyRpg.scenes.length > 0));
  return isStoryRpg ? "story_rpg" : "story";
}

async function authorNames(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map<string, string>();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,display_name")
    .in("id", uniqueIds);
  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((row) => [row.id, row.display_name || "Anonymous"]));
}

function toCard(row: PlacementRow, story: UserStoryRow, names: Map<string, string>) {
  const card = recordOf(story.character_card);
  return {
    id: row.id,
    slot: row.slot,
    sort_order: row.sort_order,
    story_id: story.id,
    content_type: contentTypeFromCard(card),
    title: story.title,
    logline: story.logline,
    cover_url: story.cover_url,
    price_credits: story.price_credits,
    author_id: story.user_id,
    author_name: names.get(story.user_id) ?? "Anonymous",
    audience: story.audience || "all",
    max_heat: story.max_heat || "warm",
    tags: story.tags ?? [],
    created_at: story.created_at,
  };
}

async function listPublicPlacements(request: Request) {
  const url = new URL(request.url);
  const slot = validSlot(url.searchParams.get("slot"));
  if (!slot) return jsonError("invalid_slot");

  if (slot === "all") return await listAllPublicStories();

  const { data: rowsData, error: placementsError } = await supabaseAdmin.rpc("list_home_placements", {
    _slot: slot,
  });
  if (placementsError) return jsonServerError(placementsError, 500);

  const rows = (rowsData ?? []) as Array<
    PlacementRow & {
      author_id: string;
      author_name: string;
      audience: string;
      max_heat: string;
      tags: string[];
      title: string;
      logline: string | null;
      cover_url: string | null;
      price_credits: number;
    }
  >;
  if (!rows.length) return jsonResponse({ ok: true, rows: [] });

  const storyIds = [...new Set(rows.map((row) => row.story_id))];
  const { data: stories, error: storiesError } = await supabaseAdmin
    .from("user_stories")
    .select("id,character_card")
    .in("id", storyIds);
  if (storiesError) return jsonServerError(storiesError, 500);

  const contentTypeByStoryId = new Map(
    ((stories ?? []) as Array<{ id: string; character_card: unknown }>).map((story) => [
      story.id,
      contentTypeFromCard(recordOf(story.character_card)),
    ]),
  );
  const cards = rows.map((row) => ({
    id: row.id,
    slot: row.slot,
    sort_order: row.sort_order,
    story_id: row.story_id,
    content_type: contentTypeByStoryId.get(row.story_id) ?? "story",
    title: row.title,
    logline: row.logline,
    cover_url: row.cover_url,
    price_credits: row.price_credits,
    author_id: row.author_id,
    author_name: row.author_name,
    audience: row.audience,
    max_heat: row.max_heat,
    tags: row.tags ?? [],
    created_at: row.created_at,
  }));

  return jsonResponse({ ok: true, rows: cards });
}

async function listAllPublicStories() {
  const { data: stories, error } = await supabaseAdmin
    .from("user_stories")
    .select("id,title,logline,cover_url,price_credits,user_id,audience,max_heat,tags,created_at,character_card,is_public,is_listed")
    .eq("is_public", true)
    .eq("is_listed", true)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) return jsonServerError(error, 500);

  const rows = ((stories ?? []) as UserStoryRow[]).map((story, index) => ({
    id: `all-${story.id}`,
    slot: "all" as HomeSlot,
    sort_order: index,
    story_id: story.id,
    created_at: story.created_at,
  }));
  const names = await authorNames(((stories ?? []) as UserStoryRow[]).map((story) => story.user_id));
  const cards = rows.map((row) => toCard(row, storyById(stories ?? [], row.story_id), names));
  return jsonResponse({ ok: true, rows: cards });
}

function storyById(stories: UserStoryRow[], id: string) {
  const story = stories.find((row) => row.id === id);
  if (!story) throw new Error("story_not_found");
  return story;
}

export const Route = createFileRoute("/api/home-placements")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await listPublicPlacements(request);
        } catch (error) {
          console.error("[api/home-placements] GET failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
