import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { isSuperAdminEmail } from "@/lib/staff-auth";

const STAFF_ROLES = ["admin", "editor", "moderator"] as const;

type StaffRole = (typeof STAFF_ROLES)[number];
type UserStoryRow = Database["public"]["Tables"]["user_stories"]["Row"];

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

async function getUser(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function hasStaffAccess(userId: string, email?: string | null) {
  if (isSuperAdminEmail(email)) return true;

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => row.role as StaffRole)
    .some((role) => STAFF_ROLES.includes(role));
}

function toReaderStory(story: UserStoryRow) {
  return {
    id: story.id,
    title: story.title,
    logline: story.logline,
    cover_url: story.cover_url,
    body_text: story.body_text ?? "",
    asset_slots: Array.isArray(story.asset_slots) ? story.asset_slots : [],
    character_card: story.character_card && typeof story.character_card === "object" ? story.character_card : {},
    beats: Array.isArray(story.beats) ? story.beats : [],
    audience: story.audience,
    max_heat: story.max_heat,
    user_id: story.user_id,
  };
}

async function getReaderStory(request: Request) {
  const user = await getUser(request);
  if (!user) return jsonError("unauthorized", 401);

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  if (!id) return jsonError("missing_id");

  const { data: story, error } = await supabaseAdmin
    .from("user_stories")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonServerError(error, 500);
  if (!story) return jsonError("story_not_found", 404);

  const canRead =
    story.user_id === user.id ||
    (story.is_public && story.is_listed) ||
    (await hasStaffAccess(user.id, user.email));
  if (!canRead) return jsonError("forbidden", 403);

  return Response.json({ ok: true, story: toReaderStory(story) });
}

export const Route = createFileRoute("/api/reader-story")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await getReaderStory(request);
        } catch (error) {
          console.error("[api/reader-story] GET failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
