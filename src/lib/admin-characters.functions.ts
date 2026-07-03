import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@/lib/_mock/runtime";

type UserStory = Pick<
  Database["public"]["Tables"]["user_stories"]["Row"],
  "id" | "title" | "logline" | "cover_url" | "character_card" | "updated_at"
>;
type StoryUpdate = Database["public"]["Tables"]["user_stories"]["Update"];
type AppRole = Database["public"]["Enums"]["app_role"];

export type StoryCharacter = {
  id: string;
  name: string;
  role: string;
  persona: string;
  personality: string;
  relationship: string;
  speakingStyle: string;
  visualPrompt: string;
  avatarUrl: string | null;
  tags: string[];
  isPrimary: boolean;
  chatEnabled: boolean;
  reusable: boolean;
};

export type CharacterStoryRow = {
  storyId: string;
  storyTitle: string;
  logline: string;
  coverUrl: string | null;
  updatedAt: string;
  storyOverview: string;
  activeCharacterName: string;
  characters: StoryCharacter[];
};

export type ReusableCharacterRow = StoryCharacter & {
  storyId: string;
  storyTitle: string;
  updatedAt: string;
};

export type PublicChatCharacterRow = StoryCharacter & {
  storyId: string;
  storyTitle: string;
  logline: string;
  coverUrl: string | null;
  updatedAt: string;
};

export type SaveStoryCharactersInput = {
  storyId: string;
  storyOverview?: string;
  characters: StoryCharacter[];
};

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function recordOf(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function asString(value: unknown, fallback = "") {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  return text.trim() || fallback;
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12);
  return asString(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeCharacter(character: Record<string, any>, index: number): StoryCharacter {
  const primary = Boolean(character.isPrimary ?? character.primary ?? index === 0);
  return {
    id: asString(character.id, newId("char")),
    name: asString(character.name, index === 0 ? "상대 주인공" : `캐릭터 ${index + 1}`),
    role: asString(character.role, primary ? "Main Character" : "Supporting Character"),
    persona: asString(character.persona ?? character.notes ?? character.description),
    personality: asString(character.personality),
    relationship: asString(character.relationship ?? character.relation),
    speakingStyle: asString(character.speakingStyle ?? character.speaking_style),
    visualPrompt: asString(character.visualPrompt ?? character.visual_prompt ?? character.appearance),
    avatarUrl: asString(character.avatarUrl ?? character.avatar_url) || null,
    tags: asStringArray(character.tags),
    isPrimary: primary,
    chatEnabled: character.chatEnabled !== false,
    reusable: character.reusable !== false,
  };
}

function charactersFromCard(card: Record<string, any>): StoryCharacter[] {
  const rows = Array.isArray(card.characters) && card.characters.length
    ? card.characters
    : card.name
      ? [
          {
            id: "main",
            name: card.name,
            role: card.role ?? "Main Character",
            persona: card.persona ?? card.notes ?? card.description ?? "",
            personality: card.personality ?? "",
            relationship: card.relationship ?? "",
            speakingStyle: card.speakingStyle ?? "",
            visualPrompt: card.visualPrompt ?? card.visual_prompt ?? card.appearance ?? "",
            avatarUrl: card.avatarUrl ?? card.avatar_url ?? null,
            tags: card.tags ?? [],
            isPrimary: true,
            chatEnabled: true,
            reusable: true,
          },
        ]
      : [
          {
            id: "main",
            name: "상대 주인공",
            role: "Main Character",
            persona: "",
            personality: "",
            relationship: "",
            speakingStyle: "",
            visualPrompt: "",
            avatarUrl: null,
            tags: [],
            isPrimary: true,
            chatEnabled: true,
            reusable: false,
          },
        ];

  const normalized = rows.map((character: Record<string, any>, index: number) =>
    normalizeCharacter(character, index),
  );

  if (normalized.length && !normalized.some((character) => character.isPrimary)) {
    normalized[0] = { ...normalized[0], isPrimary: true };
  }

  return normalized;
}

function toStoryRow(story: UserStory): CharacterStoryRow {
  const card = recordOf(story.character_card);
  const characters = charactersFromCard(card);
  const primary = characters.find((character) => character.isPrimary) ?? characters[0];
  return {
    storyId: story.id,
    storyTitle: story.title,
    logline: story.logline ?? "",
    coverUrl: story.cover_url,
    updatedAt: story.updated_at,
    storyOverview: asString(card.storyOverview ?? story.logline),
    activeCharacterName: primary?.name ?? asString(card.name, "상대 주인공"),
    characters,
  };
}

function sanitizeCharacters(characters: StoryCharacter[]) {
  const rows = characters
    .map((character, index) =>
      normalizeCharacter(
        {
          ...character,
          id: character.id || newId("char"),
          name: character.name,
        },
        index,
      ),
    )
    .filter((character) => character.name.trim());

  if (!rows.length) {
    rows.push(normalizeCharacter({ name: "상대 주인공", isPrimary: true }, 0));
  }

  const primaryIndex = Math.max(0, rows.findIndex((character) => character.isPrimary));
  return rows.map((character, index) => ({ ...character, isPrimary: index === primaryIndex }));
}

async function requireStaff(): Promise<string> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id);
  if (error) throw new Error(error.message);

  const roles = (data ?? []).map((row) => row.role as AppRole);
  if (!roles.includes("admin") && !roles.includes("editor")) throw new Error("Forbidden");
  return authData.user.id;
}

async function loadStory(storyId: string): Promise<UserStory> {
  const { data, error } = await supabase
    .from("user_stories")
    .select("id,title,logline,cover_url,character_card,updated_at")
    .eq("id", storyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("스토리를 찾을 수 없습니다.");
  return data as UserStory;
}

export const listCharacterStories = createServerFn({ method: "GET" }).handler(
  async (): Promise<CharacterStoryRow[]> => {
    await requireStaff();
    return await listCharacterStoryRows();
  },
);

export const listReusableCharacters = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReusableCharacterRow[]> => {
    await requireStaff();
    const stories = await listCharacterStoryRows();
    return stories.flatMap((story) =>
      story.characters
        .filter((character) => character.reusable)
        .map((character) => ({
          ...character,
          storyId: story.storyId,
          storyTitle: story.storyTitle,
          updatedAt: story.updatedAt,
        })),
    );
  },
);

export const listPublicChatCharacters = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicChatCharacterRow[]> => {
    const { data, error } = await supabase
      .from("user_stories")
      .select("id,title,logline,cover_url,character_card,updated_at,is_public,is_listed")
      .eq("is_public", true)
      .eq("is_listed", true)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    return (data ?? []).flatMap((story) => {
      const row = toStoryRow(story as UserStory);
      return row.characters
        .filter((character) => character.chatEnabled)
        .map((character) => ({
          ...character,
          storyId: row.storyId,
          storyTitle: row.storyTitle,
          logline: row.logline,
          coverUrl: row.coverUrl,
          updatedAt: row.updatedAt,
        }));
    });
  },
);

async function listCharacterStoryRows() {
  const { data, error } = await supabase
    .from("user_stories")
    .select("id,title,logline,cover_url,character_card,updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data ?? []).map((story) => toStoryRow(story as UserStory));
}

export const saveStoryCharacters = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as SaveStoryCharactersInput)
  .handler(async ({ data }) => {
    await requireStaff();
    const story = await loadStory(data.storyId);
    const card = recordOf(story.character_card);
    const characters = sanitizeCharacters(data.characters);
    const primary = characters.find((character) => character.isPrimary) ?? characters[0];

    const patch: StoryUpdate = {
      character_card: {
        ...card,
        storyOverview: asString(data.storyOverview ?? card.storyOverview ?? story.logline),
        characters,
        name: primary.name,
        role: primary.role,
        persona: primary.persona,
        notes: primary.persona,
        personality: primary.personality,
        relationship: primary.relationship,
        speakingStyle: primary.speakingStyle,
        visualPrompt: primary.visualPrompt,
        appearance: primary.visualPrompt,
        avatarUrl: primary.avatarUrl,
      } as any,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("user_stories").update(patch).eq("id", story.id);
    if (error) throw new Error(error.message);
    return { ok: true, story: toStoryRow({ ...story, character_card: patch.character_card as any, updated_at: patch.updated_at! }) };
  });

export const generateReusableCharacter = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as Record<string, unknown>)
  .handler(async () => {
    throw new Error("AI 캐릭터 생성은 아직 연결되지 않았습니다.");
  });
