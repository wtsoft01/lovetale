import { createServerFn } from "@/lib/_mock/runtime";
import { supabase } from "@/integrations/supabase/client";

type PlayMode = "vn" | "chat";

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user.id;
}

function now() {
  return new Date().toISOString();
}

export const getOrCreateSession = createServerFn({ method: "POST" })
  .inputValidator(
    (i: unknown) =>
      i as {
        storyId: string;
        characterId?: string;
        mode?: PlayMode;
        currentNode?: string;
        initialAffection?: number;
        initialArousal?: number;
        initialTrust?: number;
      },
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { data: existing, error: existingError } = await supabase
      .from("story_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("story_id", data.storyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return existing;

    const { data: created, error } = await supabase
      .from("story_sessions")
      .insert({
        user_id: userId,
        story_id: data.storyId,
        character_id: data.characterId ?? null,
        current_node: data.currentNode ?? "start",
        affection: data.initialAffection ?? 40,
        arousal: data.initialArousal ?? 0,
        trust: data.initialTrust ?? 0,
        mode: data.mode ?? "vn",
        is_completed: false,
        is_bookmarked: false,
        ending_id: null,
        last_played_at: now(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const updateSessionState = createServerFn({ method: "POST" })
  .inputValidator(
    (i: unknown) =>
      i as {
        sessionId: string;
        currentNode?: string;
        affection?: number;
        arousal?: number;
        trust?: number;
        mode?: PlayMode;
        isCompleted?: boolean;
        endingId?: string | null;
      },
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const patch: Record<string, unknown> = {
      updated_at: now(),
      last_played_at: now(),
    };
    if (data.currentNode !== undefined) patch.current_node = data.currentNode;
    if (data.affection !== undefined) patch.affection = data.affection;
    if (data.arousal !== undefined) patch.arousal = data.arousal;
    if (data.trust !== undefined) patch.trust = data.trust;
    if (data.mode !== undefined) patch.mode = data.mode;
    if (data.isCompleted !== undefined) patch.is_completed = data.isCompleted;
    if (data.endingId !== undefined) patch.ending_id = data.endingId;

    const { error } = await supabase
      .from("story_sessions")
      .update(patch)
      .eq("id", data.sessionId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordChoice = createServerFn({ method: "POST" })
  .inputValidator(
    (i: unknown) =>
      i as {
        sessionId: string;
        nodeId: string;
        choiceId: string;
        choiceLabel: string;
        affectionDelta?: number;
        arousalDelta?: number;
        trustDelta?: number;
      },
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { error } = await supabase.from("story_choices").insert({
      user_id: userId,
      session_id: data.sessionId,
      node_id: data.nodeId,
      choice_id: data.choiceId,
      choice_label: data.choiceLabel,
      affection_delta: data.affectionDelta ?? 0,
      arousal_delta: data.arousalDelta ?? 0,
      trust_delta: data.trustDelta ?? 0,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const appendStoryMessage = createServerFn({ method: "POST" })
  .inputValidator(
    (i: unknown) =>
      i as {
        sessionId: string;
        role: "user" | "assistant" | "narrator";
        content: string;
        nodeId?: string;
        emotion?: string;
      },
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { error } = await supabase.from("story_messages").insert({
      user_id: userId,
      session_id: data.sessionId,
      role: data.role,
      content: data.content,
      node_id: data.nodeId ?? null,
      emotion: data.emotion ?? null,
      background_url: null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveEnding = createServerFn({ method: "POST" })
  .inputValidator(
    (i: unknown) =>
      i as { sessionId: string; storyId: string; endingId: string; endingTitle: string; endingKind?: string },
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { error } = await supabase.from("saved_endings").upsert(
      {
        user_id: userId,
        session_id: data.sessionId,
        story_id: data.storyId,
        ending_id: data.endingId,
        ending_title: data.endingTitle,
        ending_kind: data.endingKind ?? null,
      },
      { onConflict: "user_id,story_id,ending_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleBookmark = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { sessionId: string; bookmarked: boolean })
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("story_sessions")
      .update({
        is_bookmarked: data.bookmarked,
        updated_at: now(),
        last_played_at: now(),
      })
      .eq("id", data.sessionId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMySessions = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("story_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getStorySessionActivity = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { storyId: string })
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { data: session, error: sessionError } = await supabase
      .from("story_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("story_id", data.storyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    if (!session) return null;

    const [{ data: choices, error: choicesError }, { data: messages, error: messagesError }] = await Promise.all([
      supabase
        .from("story_choices")
        .select("*")
        .eq("user_id", userId)
        .eq("session_id", session.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("story_messages")
        .select("*")
        .eq("user_id", userId)
        .eq("session_id", session.id)
        .order("created_at", { ascending: true }),
    ]);
    if (choicesError) throw new Error(choicesError.message);
    if (messagesError) throw new Error(messagesError.message);

    return {
      session,
      choices: choices ?? [],
      messages: messages ?? [],
    };
  });

export const clearStorySessionActivity = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { sessionId: string })
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const [{ error: choicesError }, { error: messagesError }] = await Promise.all([
      supabase.from("story_choices").delete().eq("user_id", userId).eq("session_id", data.sessionId),
      supabase.from("story_messages").delete().eq("user_id", userId).eq("session_id", data.sessionId),
    ]);
    if (choicesError) throw new Error(choicesError.message);
    if (messagesError) throw new Error(messagesError.message);
    return { ok: true };
  });

export const listSavedEndings = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("saved_endings")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
});
