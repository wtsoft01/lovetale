import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { isSuperAdminEmail } from "@/lib/staff-auth";

type UserStoryRow = Database["public"]["Tables"]["user_stories"]["Row"];
type StaffRole = "admin" | "editor" | "moderator";

const STAFF_ROLES: StaffRole[] = ["admin", "editor", "moderator"];

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

function hasStoryRpgShape(card: Record<string, any>, storyRpg: Record<string, any>) {
  return (
    storyRpg.enabled === true ||
    Boolean(storyRpg.generatedFrom) ||
    (Array.isArray(storyRpg.scenes) && storyRpg.scenes.length > 0)
  );
}

function isStoryRpg(row: UserStoryRow) {
  const card = recordOf(row.character_card);
  const storyRpg = recordOf(card.storyRpg);
  const sourceStoryId = String(storyRpg.sourceStoryId || card.sourceStoryId || "").trim();
  return card.contentType === "story_rpg" && (hasStoryRpgShape(card, storyRpg) || Boolean(sourceStoryId));
}

async function readStoryRpgRows() {
  const { data, error } = await supabaseAdmin
    .from("user_stories")
    .select("*")
    .eq("is_public", true)
    .eq("is_listed", true)
    .order("updated_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  return ((data ?? []) as UserStoryRow[]).filter(isStoryRpg);
}

async function readStoryRpgById(id: string, preview: boolean) {
  let query = supabaseAdmin.from("user_stories").select("*").eq("id", id);
  if (!preview) query = query.eq("is_public", true).eq("is_listed", true);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as UserStoryRow;
  return isStoryRpg(row) ? row : null;
}

async function ensureSuperAdminRoles(userId: string) {
  const rows = STAFF_ROLES.map((role) => ({ user_id: userId, role }));
  const { error } = await supabaseAdmin.from("user_roles").upsert(rows, { onConflict: "user_id,role" });
  if (error) throw error;
}

async function hasPreviewAccess(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return false;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return false;

  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (isSuperAdminEmail(email)) {
    await ensureSuperAdminRoles(data.user.id);
    return true;
  }

  const { data: rolesData, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (rolesError) throw rolesError;

  return (rolesData ?? [])
    .map((row) => row.role as StaffRole)
    .some((role) => role === "admin" || role === "editor");
}

export const Route = createFileRoute("/api/story-rpg")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const id = (url.searchParams.get("id") ?? "").trim();
          const preview = url.searchParams.get("preview") === "1";

          if (id) {
            if (preview && !(await hasPreviewAccess(request))) return jsonError("forbidden", 403);
            const row = await readStoryRpgById(id, preview);
            if (!row) return jsonError("story_rpg_not_found", 404);
            return Response.json({ ok: true, row });
          }

          const rows = await readStoryRpgRows();
          return Response.json({ ok: true, rows });
        } catch (error) {
          console.error("[api/story-rpg] GET failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
