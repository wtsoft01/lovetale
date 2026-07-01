import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { TIER_COST } from "@/lib/tier-pricing";

type MediaUnlockRow = Database["public"]["Tables"]["media_unlocks"]["Row"];

type UnlockVia = "free" | "credits" | "subscription";

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

function extractToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
}

async function requireUser(request: Request) {
  const token = extractToken(request);
  if (!token) throw new Error("Unauthorized");

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}

function publicUnlock(row: MediaUnlockRow) {
  return {
    beat_id: row.beat_id,
    heat_tier: row.heat_tier,
    credits_spent: row.credits_spent,
    created_at: row.created_at,
    unlocked_via: row.unlocked_via,
  };
}

async function listUnlocks(request: Request) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const storyId = (url.searchParams.get("storyId") ?? "").trim();
  if (!storyId) return jsonError("missing_story_id");

  const { data, error } = await supabaseAdmin
    .from("media_unlocks")
    .select("*")
    .eq("user_id", user.id)
    .eq("story_id", storyId)
    .order("created_at", { ascending: true });
  if (error) return jsonServerError(error, 500);

  return Response.json({ ok: true, rows: (data ?? []).map(publicUnlock) });
}

async function unlockBeatMedia(request: Request) {
  const user = await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    storyId?: string;
    beatId?: string;
    heatTier?: string;
  };
  const storyId = String(body.storyId ?? "").trim();
  const beatId = String(body.beatId ?? "").trim();
  const heatTier = String(body.heatTier ?? "").trim();
  if (!storyId) return jsonError("missing_story_id");
  if (!beatId) return jsonError("missing_beat_id");
  if (!heatTier) return jsonError("missing_heat_tier");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("media_unlocks")
    .select("*")
    .eq("user_id", user.id)
    .eq("story_id", storyId)
    .eq("beat_id", beatId)
    .maybeSingle();
  if (existingError) return jsonServerError(existingError, 500);
  if (existing) {
    return Response.json({
      ok: true,
      alreadyUnlocked: true,
      creditsSpent: 0,
      unlockedVia: existing.unlocked_via as UnlockVia,
      row: publicUnlock(existing),
    });
  }

  const cost = Math.max(0, Math.floor(TIER_COST[heatTier] ?? 0));
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("credits,is_subscribed,subscription_expires_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return jsonServerError(profileError, 500);
  if (!profile) return jsonError("profile_not_found", 404);

  const subscriptionActive =
    Boolean(profile.is_subscribed) &&
    (!profile.subscription_expires_at || new Date(profile.subscription_expires_at).getTime() > Date.now());
  const unlockedVia: UnlockVia = cost <= 0 ? "free" : subscriptionActive ? "subscription" : "credits";
  const creditsSpent = unlockedVia === "credits" ? cost : 0;

  if (creditsSpent > 0) {
    const { data: debited, error: debitError } = await supabaseAdmin
      .from("profiles")
      .update({ updated_at: new Date().toISOString() } as any)
      .eq("id", user.id)
      .gte("credits", creditsSpent)
      .select("credits")
      .maybeSingle();
    if (debitError) return jsonServerError(debitError, 500);
    if (!debited) return jsonError("insufficient_credits", 402);

    const nextCredits = Number(debited.credits) - creditsSpent;
    const { error: updateCreditsError } = await supabaseAdmin
      .from("profiles")
      .update({ credits: nextCredits, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (updateCreditsError) return jsonServerError(updateCreditsError, 500);

    await supabaseAdmin.from("credit_ledger").insert({
      user_id: user.id,
      delta: -creditsSpent,
      reason: "media_unlock",
      ref_type: "beat",
      ref_id: `${storyId}:${beatId}`,
      balance_after: nextCredits,
    });
  }

  const { data: row, error: insertError } = await supabaseAdmin
    .from("media_unlocks")
    .insert({
      user_id: user.id,
      story_id: storyId,
      beat_id: beatId,
      heat_tier: heatTier,
      credits_spent: creditsSpent,
      unlocked_via: unlockedVia,
    })
    .select("*")
    .single();
  if (insertError) {
    const duplicate = "code" in insertError && insertError.code === "23505";
    if (duplicate) {
      const { data: duplicated } = await supabaseAdmin
        .from("media_unlocks")
        .select("*")
        .eq("user_id", user.id)
        .eq("story_id", storyId)
        .eq("beat_id", beatId)
        .maybeSingle();
      if (duplicated) {
        return Response.json({
          ok: true,
          alreadyUnlocked: true,
          creditsSpent: 0,
          unlockedVia: duplicated.unlocked_via as UnlockVia,
          row: publicUnlock(duplicated),
        });
      }
    }
    return jsonServerError(insertError, 500);
  }

  return Response.json({
    ok: true,
    alreadyUnlocked: false,
    creditsSpent,
    unlockedVia,
    row: publicUnlock(row),
  });
}

export const Route = createFileRoute("/api/unlocks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await listUnlocks(request);
        } catch (error) {
          console.error("[api/unlocks] GET failed", error);
          return jsonServerError(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 500);
        }
      },
      POST: async ({ request }) => {
        try {
          return await unlockBeatMedia(request);
        } catch (error) {
          console.error("[api/unlocks] POST failed", error);
          return jsonServerError(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 500);
        }
      },
    },
  },
});
