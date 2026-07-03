import { supabase } from "@/integrations/supabase/client";
import { createServerFn } from "@/lib/_mock/runtime";

export type ReaderChatRole = "user" | "assistant";
export type ReaderChatMode = "single" | "group";

export type ReaderChatMessageRow = {
  id: string;
  role: ReaderChatRole;
  text: string;
  threadKey: string;
  threadLabel: string;
  chatMode: ReaderChatMode;
  characterId?: string | null;
  characterName: string;
  avatarUrl?: string | null;
  affectionAt?: number | null;
  createdAt: string;
};

type StoredReaderChatPayload = {
  __lovetale_reader_chat: 1;
  text: string;
  threadKey: string;
  threadLabel: string;
  chatMode: ReaderChatMode;
  characterId?: string | null;
  characterName: string;
  avatarUrl?: string | null;
};

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user.id;
}

function encodeContent(data: Omit<StoredReaderChatPayload, "__lovetale_reader_chat">) {
  return JSON.stringify({
    __lovetale_reader_chat: 1,
    ...data,
  } satisfies StoredReaderChatPayload);
}

function decodeContent(content: string, fallback: { role: ReaderChatRole; storyId: string }): Omit<ReaderChatMessageRow, "id" | "role" | "affectionAt" | "createdAt"> {
  try {
    const parsed = JSON.parse(content) as Partial<StoredReaderChatPayload>;
    if (parsed?.__lovetale_reader_chat === 1 && typeof parsed.text === "string") {
      const threadKey = String(parsed.threadKey || "single:main-character");
      const threadLabel = String(parsed.threadLabel || parsed.characterName || "상대 주인공");
      const chatMode: ReaderChatMode = parsed.chatMode === "group" ? "group" : "single";
      return {
        text: parsed.text,
        threadKey,
        threadLabel,
        chatMode,
        characterId: parsed.characterId ?? null,
        characterName: String(parsed.characterName || threadLabel),
        avatarUrl: parsed.avatarUrl ?? null,
      };
    }
  } catch {
    // Older rows may be plain text; fall through to a safe default.
  }

  const fallbackName = fallback.role === "user" ? "나" : "상대 주인공";
  return {
    text: content,
    threadKey: "single:main-character",
    threadLabel: "상대 주인공",
    chatMode: "single",
    characterId: "main-character",
    characterName: fallbackName,
    avatarUrl: null,
  };
}

export const listReaderChatMessages = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => i as { storyId: string; limit?: number })
  .handler(async ({ data }): Promise<ReaderChatMessageRow[]> => {
    const uid = await requireUserId();
    const limit = Math.max(1, Math.min(300, Number(data.limit) || 160));
    const { data: rows, error } = await supabase
      .from("story_chat_messages")
      .select("id, role, content, affection_at, created_at")
      .eq("user_id", uid)
      .eq("story_id", data.storyId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    return (rows ?? []).map((row) => {
      const role = row.role === "assistant" ? "assistant" : "user";
      const decoded = decodeContent(String(row.content ?? ""), { role, storyId: data.storyId });
      return {
        id: row.id,
        role,
        ...decoded,
        affectionAt: row.affection_at,
        createdAt: row.created_at,
      };
    });
  });

export const appendReaderChatMessage = createServerFn({ method: "POST" })
  .inputValidator(
    (i: unknown) =>
      i as {
        storyId: string;
        role: ReaderChatRole;
        text: string;
        threadKey: string;
        threadLabel: string;
        chatMode: ReaderChatMode;
        characterId?: string | null;
        characterName: string;
        avatarUrl?: string | null;
        affectionAt?: number | null;
      },
  )
  .handler(async ({ data }): Promise<{ ok: true; id: string }> => {
    const uid = await requireUserId();
    const role: ReaderChatRole = data.role === "assistant" ? "assistant" : "user";
    const text = String(data.text || "").trim();
    if (!text) throw new Error("메시지가 비어 있습니다.");

    const { data: row, error } = await supabase
      .from("story_chat_messages")
      .insert({
        user_id: uid,
        story_id: data.storyId,
        role,
        content: encodeContent({
          text,
          threadKey: data.threadKey || "single:main-character",
          threadLabel: data.threadLabel || data.characterName || "상대 주인공",
          chatMode: data.chatMode === "group" ? "group" : "single",
          characterId: data.characterId ?? null,
          characterName: data.characterName || data.threadLabel || "상대 주인공",
          avatarUrl: data.avatarUrl ?? null,
        }),
        scene_offset: null,
        affection_at: typeof data.affectionAt === "number" ? data.affectionAt : null,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });
