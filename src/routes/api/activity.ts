import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

export const Route = createFileRoute("/api/activity")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
          if (!token) return jsonError("missing_token", 401);

          const { data, error } = await supabaseAdmin.auth.getUser(token);
          if (error || !data.user) return jsonError("invalid_token", 401);

          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const eventType = String(body.eventType ?? "heartbeat") === "pageview" ? "pageview" : "heartbeat";
          const path = String(body.path ?? "/").slice(0, 512);
          const title = String(body.title ?? "").slice(0, 256) || null;
          const durationSeconds = Math.max(0, Math.min(24 * 60 * 60, Math.round(Number(body.durationSeconds ?? 0))));
          const now = new Date().toISOString();

          const { error: insertError } = await (supabaseAdmin as any).from("user_activity_events").insert({
            user_id: data.user.id,
            event_type: eventType,
            path,
            title,
            duration_seconds: durationSeconds,
            last_seen_at: now,
            user_agent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
          });
          if (insertError) return jsonError("activity_table_unavailable", 202);
          return Response.json({ ok: true });
        } catch (error) {
          console.error("[api/activity] failed", error);
          return jsonError("server_error", 500);
        }
      },
    },
  },
});
