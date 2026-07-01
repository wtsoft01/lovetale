import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

async function ensureBucket() {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  if (listError) throw new Error(listError.message);

  const exists = (buckets ?? []).some((bucket) => bucket.name === "story-media");
  if (exists) return;

  const { error: createError } = await supabaseAdmin.storage.createBucket("story-media", {
    public: false,
  });
  if (createError) throw new Error(createError.message);
}

export const Route = createFileRoute("/api/storage/ensure-story-media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
          if (!token) return jsonError("missing_token", 401);

          const { data, error } = await supabaseAdmin.auth.getUser(token);
          if (error || !data.user) return jsonError("invalid_token", 401);

          const { data: roles, error: rolesError } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", data.user.id);
          if (rolesError) return jsonServerError(rolesError, 500);
          if (!roles?.some((row) => row.role === "admin" || row.role === "editor")) {
            return jsonError("forbidden", 403);
          }

          await ensureBucket();
          return Response.json({ ok: true });
        } catch (error) {
          console.error("[api/storage/ensure-story-media] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
