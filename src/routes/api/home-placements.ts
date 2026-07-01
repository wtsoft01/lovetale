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

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error
        ? JSON.stringify(error)
        : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

function validSlot(value: string | null): HomeSlot | null {
  return value && HOME_SLOTS.has(value as HomeSlot) ? (value as HomeSlot) : null;
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
  return {
    id: row.id,
    slot: row.slot,
    sort_order: row.sort_order,
    story_id: story.id,
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

  const { data: placements, error: placementsError } = await supabaseAdmin
    .from("home_placements")
    .select("id,slot,sort_order,story_id,created_at")
    .eq("slot", slot)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(50);
  if (placementsError) return jsonServerError(placementsError, 500);

  const rows = (placements ?? []) as PlacementRow[];
  if (!rows.length) return Response.json({ ok: true, rows: [] });

  const storyIds = rows.map((row) => row.story_id);
  const { data: stories, error: storiesError } = await supabaseAdmin
    .from("user_stories")
    .select("*")
    .in("id", storyIds)
    .eq("is_public", true)
    .eq("is_listed", true);
  if (storiesError) return jsonServerError(storiesError, 500);

  const storyMap = new Map(((stories ?? []) as UserStoryRow[]).map((story) => [story.id, story]));
  const names = await authorNames(((stories ?? []) as UserStoryRow[]).map((story) => story.user_id));
  const cards = rows
    .map((row) => {
      const story = storyMap.get(row.story_id);
      return story ? toCard(row, story, names) : null;
    })
    .filter(Boolean);

  return Response.json({ ok: true, rows: cards });
}

async function listAllPublicStories() {
  const { data: stories, error } = await supabaseAdmin
    .from("user_stories")
    .select("*")
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
  return Response.json({ ok: true, rows: cards });
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
