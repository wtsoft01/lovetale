import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";

const SUPER_ADMIN_EMAIL = "admin@lovetale.org";
const STAFF_ROLES = ["admin", "editor", "moderator"] as const;
const SUPER_ADMIN_ROLES = ["admin"] as const;
const ensuredSuperAdminUserIds = new Set<string>();

type StaffRole = (typeof STAFF_ROLES)[number];
type MediaAssetRow = Database["public"]["Tables"]["media_assets"]["Row"];
type MediaAssetInsert = Database["public"]["Tables"]["media_assets"]["Insert"];

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeNullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

async function ensureSuperAdminRoles(userId: string) {
  const rows = SUPER_ADMIN_ROLES.map((role) => ({ user_id: userId, role }));
  const { error } = await supabaseAdmin.from("user_roles").upsert(rows, { onConflict: "user_id,role" });
  if (error) throw new Error(error.message);
}

async function requireStaff(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return { error: jsonError("missing_token", 401) as Response, userId: "", isAdmin: false };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { error: jsonError("invalid_token", 401) as Response, userId: "", isAdmin: false };

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

function toPublicRow(row: MediaAssetRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    story_id: row.story_id,
    chapter_id: row.chapter_id,
    beat_id: row.beat_id,
    asset_type: row.asset_type,
    storage_path: row.storage_path,
    file_name: row.file_name,
    file_size: Number(row.file_size ?? 0),
    mime_type: row.mime_type,
    content_hash: row.content_hash,
    tags: row.tags ?? [],
    status: row.status,
    validation_errors: row.validation_errors ?? [],
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listMedia(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "list";
  const contentHash = (url.searchParams.get("contentHash") ?? "").trim();

  if (mode === "duplicate") {
    if (!contentHash) return jsonError("missing_content_hash");
    const { data, error } = await supabaseAdmin
      .from("media_assets")
      .select("*")
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (error) return jsonServerError(error, 500);
    return Response.json({ ok: true, duplicate: Boolean(data), asset: data ? toPublicRow(data) : null });
  }

  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const storyId = (url.searchParams.get("storyId") ?? "").trim();
  const assetType = (url.searchParams.get("assetType") ?? "").trim();
  const tag = (url.searchParams.get("tag") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim();

  let query = supabaseAdmin.from("media_assets").select("*").order("created_at", { ascending: false }).limit(300);
  if (storyId) query = query.eq("story_id", storyId);
  if (assetType && assetType !== "all") query = query.eq("asset_type", assetType);
  if (status && status !== "all") query = query.eq("status", status);
  if (tag) query = query.contains("tags", [tag]);

  const { data, error } = await query;
  if (error) return jsonServerError(error, 500);

  let rows = (data ?? []) as MediaAssetRow[];
  if (q) {
    rows = rows.filter((row) => {
      const haystack = `${row.file_name} ${row.chapter_id ?? ""} ${row.beat_id ?? ""} ${(row.tags ?? []).join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  return Response.json({ ok: true, rows: rows.map(toPublicRow) });
}

function buildInsert(body: Record<string, unknown>, userId: string): MediaAssetInsert {
  const storagePath = String(body.storagePath ?? body.storage_path ?? "").trim();
  const fileName = String(body.fileName ?? body.file_name ?? "").trim();
  const mimeType = String(body.mimeType ?? body.mime_type ?? "application/octet-stream").trim();
  const contentHash = String(body.contentHash ?? body.content_hash ?? "").trim();
  const assetType = String(body.assetType ?? body.asset_type ?? "").trim();
  if (!storagePath) throw new Error("missing_storage_path");
  if (!fileName) throw new Error("missing_file_name");
  if (!contentHash) throw new Error("missing_content_hash");
  if (!assetType) throw new Error("missing_asset_type");

  return {
    user_id: userId,
    story_id: normalizeNullableString(body.storyId ?? body.story_id),
    chapter_id: normalizeNullableString(body.chapterId ?? body.chapter_id),
    beat_id: normalizeNullableString(body.beatId ?? body.beat_id),
    asset_type: assetType,
    storage_path: storagePath,
    file_name: fileName,
    file_size: Math.max(0, Math.floor(Number(body.fileSize ?? body.file_size) || 0)),
    mime_type: mimeType,
    content_hash: contentHash,
    tags: arrayOfStrings(body.tags),
    status: String(body.status ?? "ready"),
    validation_errors: arrayOfStrings(body.validationErrors ?? body.validation_errors),
    metadata: recordOf(body.metadata) as Json,
  };
}

async function registerMedia(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  let insert: MediaAssetInsert;
  try {
    insert = buildInsert(body, staff.userId);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "invalid_payload");
  }

  const { data: duplicate, error: duplicateError } = await supabaseAdmin
    .from("media_assets")
    .select("*")
    .eq("content_hash", insert.content_hash)
    .maybeSingle();
  if (duplicateError) return jsonServerError(duplicateError, 500);
  if (duplicate) return Response.json({ ok: true, duplicate: true, asset: toPublicRow(duplicate) });

  const { data, error } = await supabaseAdmin.from("media_assets").insert(insert).select("*").single();
  if (error) {
    const duplicateKey = "code" in error && error.code === "23505";
    if (duplicateKey) {
      const { data: existing } = await supabaseAdmin
        .from("media_assets")
        .select("*")
        .eq("content_hash", insert.content_hash)
        .maybeSingle();
      if (existing) return Response.json({ ok: true, duplicate: true, asset: toPublicRow(existing) });
    }
    return jsonServerError(error, 500);
  }

  return Response.json({ ok: true, duplicate: false, asset: toPublicRow(data) });
}

async function updateMedia(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  if (!id) return jsonError("missing_id");

  const patch: Database["public"]["Tables"]["media_assets"]["Update"] = {};
  if (body.storyId !== undefined || body.story_id !== undefined) patch.story_id = normalizeNullableString(body.storyId ?? body.story_id);
  if (body.chapterId !== undefined || body.chapter_id !== undefined) patch.chapter_id = normalizeNullableString(body.chapterId ?? body.chapter_id);
  if (body.beatId !== undefined || body.beat_id !== undefined) patch.beat_id = normalizeNullableString(body.beatId ?? body.beat_id);
  if (body.assetType !== undefined || body.asset_type !== undefined) patch.asset_type = String(body.assetType ?? body.asset_type);
  if (body.fileName !== undefined || body.file_name !== undefined) patch.file_name = String(body.fileName ?? body.file_name);
  if (body.tags !== undefined) patch.tags = arrayOfStrings(body.tags);
  if (body.status !== undefined) patch.status = String(body.status);
  if (body.validationErrors !== undefined || body.validation_errors !== undefined) {
    patch.validation_errors = arrayOfStrings(body.validationErrors ?? body.validation_errors);
  }
  if (body.metadata !== undefined) patch.metadata = recordOf(body.metadata) as Json;

  const { data, error } = await supabaseAdmin
    .from("media_assets")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return jsonServerError(error, 500);
  if (!data) return jsonError("asset_not_found", 404);
  return Response.json({ ok: true, asset: toPublicRow(data) });
}

export const Route = createFileRoute("/api/admin/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await listMedia(request);
        } catch (error) {
          console.error("[api/admin/media] GET failed", error);
          return jsonServerError(error, 500);
        }
      },
      POST: async ({ request }) => {
        try {
          return await registerMedia(request);
        } catch (error) {
          console.error("[api/admin/media] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
      PATCH: async ({ request }) => {
        try {
          return await updateMedia(request);
        } catch (error) {
          console.error("[api/admin/media] PATCH failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
