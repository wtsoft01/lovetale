import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

const SUPER_ADMIN_EMAIL = "admin@lovetale.org";
const STAFF_ROLES = ["admin", "editor", "moderator"] as const;
const SUPER_ADMIN_ROLES = ["admin"] as const;
const HOME_SLOTS = new Set<HomeSlot>(["hero", "trending", "new", "all"]);
const ensuredSuperAdminUserIds = new Set<string>();

type StaffRole = (typeof STAFF_ROLES)[number];
type HomeSlot = Database["public"]["Enums"]["home_slot"];

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

function normalizeSortOrder(value: unknown) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

async function ensureSuperAdminRoles(userId: string) {
  const rows = SUPER_ADMIN_ROLES.map((role) => ({ user_id: userId, role }));
  const { error } = await supabaseAdmin
    .from("user_roles")
    .upsert(rows, { onConflict: "user_id,role" });
  if (error) throw new Error(error.message);
}

async function requireStaff(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return { error: jsonError("missing_token", 401) as Response, userId: "", isAdmin: false };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { error: jsonError("invalid_token", 401) as Response, userId: "", isAdmin: false };
  }

  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (email === SUPER_ADMIN_EMAIL) {
    if (!ensuredSuperAdminUserIds.has(data.user.id)) {
      await ensureSuperAdminRoles(data.user.id);
      ensuredSuperAdminUserIds.add(data.user.id);
    }
    return { userId: data.user.id, isAdmin: true };
  }

  const { data: rolesData, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (rolesError) return { error: jsonServerError(rolesError, 500), userId: data.user.id, isAdmin: false };

  const roles = (rolesData ?? [])
    .map((row) => row.role as StaffRole)
    .filter((role): role is StaffRole => STAFF_ROLES.includes(role));
  if (!roles.includes("admin") && !roles.includes("editor")) {
    return { error: jsonError("forbidden", 403) as Response, userId: data.user.id, isAdmin: false };
  }
  return { userId: data.user.id, isAdmin: roles.includes("admin") };
}

async function listPlacements(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const url = new URL(request.url);
  const slot = validSlot(url.searchParams.get("slot"));
  if (!slot) return jsonError("invalid_slot");

  if (slot === "all") return await listAllPlacements();

  const { data, error } = await supabaseAdmin
    .from("home_placements")
    .select("id,slot,sort_order,is_active,story_id,created_at,user_stories(id,title,cover_url,is_public,is_listed)")
    .eq("slot", slot)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return jsonServerError(error, 500);

  return Response.json({ ok: true, rows: data ?? [] });
}

async function listAllPlacements() {
  const { data, error } = await supabaseAdmin
    .from("user_stories")
    .select("id,title,cover_url,is_public,is_listed,created_at")
    .eq("is_public", true)
    .eq("is_listed", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return jsonServerError(error, 500);

  const rows = (data ?? []).map((story, index) => ({
    id: `all:${story.id}`,
    slot: "all",
    sort_order: index,
    is_active: true,
    story_id: story.id,
    created_at: story.created_at,
    user_stories: {
      id: story.id,
      title: story.title,
      cover_url: story.cover_url,
      is_public: story.is_public,
      is_listed: story.is_listed,
    },
  }));

  return Response.json({ ok: true, rows });
}

async function addPlacement(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const body = (await request.json().catch(() => ({}))) as {
    slot?: string;
    story_id?: string;
    sort_order?: number;
  };
  const slot = validSlot(body.slot ?? null);
  const storyId = String(body.story_id ?? "").trim();
  if (!slot) return jsonError("invalid_slot");
  if (!storyId) return jsonError("missing_story_id");

  if (slot === "all") {
    const { error } = await supabaseAdmin
      .from("user_stories")
      .update({
        status: "published",
        is_public: true,
        is_listed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", storyId);
    if (error) return jsonServerError(error, 500);
    return Response.json({ ok: true });
  }

  const sortOrder = normalizeSortOrder(body.sort_order);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("home_placements")
    .select("id")
    .eq("slot", slot)
    .eq("story_id", storyId)
    .limit(1);
  if (existingError) return jsonServerError(existingError, 500);

  const now = new Date().toISOString();
  const existingId = existing?.[0]?.id;
  const { error } = existingId
    ? await supabaseAdmin
        .from("home_placements")
        .update({
          sort_order: sortOrder,
          is_active: true,
          created_by: staff.userId,
          updated_at: now,
        })
        .eq("id", existingId)
    : await supabaseAdmin.from("home_placements").insert({
        slot,
        story_id: storyId,
        sort_order: sortOrder,
        is_active: true,
        created_by: staff.userId,
      });
  if (error) return jsonServerError(error, 500);

  const { error: publishError } = await supabaseAdmin
    .from("user_stories")
    .update({
      status: "published",
      is_public: true,
      is_listed: true,
      updated_at: now,
    })
    .eq("id", storyId);
  if (publishError) return jsonServerError(publishError, 500);

  return Response.json({ ok: true });
}

async function updatePlacement(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    sort_order?: number;
    is_active?: boolean;
  };
  const id = String(body.id ?? "").trim();
  if (!id) return jsonError("missing_id");

  if (id.startsWith("all:")) {
    const storyId = id.slice("all:".length);
    const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true;
    const { error } = await supabaseAdmin
      .from("user_stories")
      .update({
        is_public: isActive,
        is_listed: isActive,
        status: isActive ? "published" : "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", storyId);
    if (error) return jsonServerError(error, 500);
    return Response.json({ ok: true });
  }

  const patch: Database["public"]["Tables"]["home_placements"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (body.sort_order !== undefined) patch.sort_order = normalizeSortOrder(body.sort_order);
  if (body.is_active !== undefined) patch.is_active = body.is_active;

  const { error } = await supabaseAdmin.from("home_placements").update(patch).eq("id", id);
  if (error) return jsonServerError(error, 500);
  return Response.json({ ok: true });
}

async function removePlacement(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  if (!id) return jsonError("missing_id");

  if (id.startsWith("all:")) {
    const storyId = id.slice("all:".length);
    const { error } = await supabaseAdmin
      .from("user_stories")
      .update({
        is_listed: false,
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", storyId);
    if (error) return jsonServerError(error, 500);
    return Response.json({ ok: true });
  }

  const { error } = await supabaseAdmin.from("home_placements").delete().eq("id", id);
  if (error) return jsonServerError(error, 500);
  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/admin/placements")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await listPlacements(request);
        } catch (error) {
          console.error("[api/admin/placements] GET failed", error);
          return jsonServerError(error, 500);
        }
      },
      POST: async ({ request }) => {
        try {
          return await addPlacement(request);
        } catch (error) {
          console.error("[api/admin/placements] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
      PATCH: async ({ request }) => {
        try {
          return await updatePlacement(request);
        } catch (error) {
          console.error("[api/admin/placements] PATCH failed", error);
          return jsonServerError(error, 500);
        }
      },
      DELETE: async ({ request }) => {
        try {
          return await removePlacement(request);
        } catch (error) {
          console.error("[api/admin/placements] DELETE failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
