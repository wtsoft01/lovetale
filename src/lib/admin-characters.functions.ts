import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@/lib/_mock/runtime";

type UserStory = Pick<
  Database["public"]["Tables"]["user_stories"]["Row"],
  "id" | "title" | "character_card" | "updated_at"
>;

export type ReusableCharacterRow = {
  id: string;
  name: string;
  role: string;
  persona: string;
  visualPrompt: string;
  storyId: string;
  storyTitle: string;
  updatedAt: string;
};

function recordOf(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function extractCharacters(story: UserStory): ReusableCharacterRow[] {
  const card = recordOf(story.character_card);
  const characters = Array.isArray(card.characters) && card.characters.length
    ? card.characters
    : card.name
      ? [
          {
            id: "main",
            name: card.name,
            role: card.role ?? "main",
            persona: card.persona ?? card.notes ?? "",
            visualPrompt: card.visualPrompt ?? "",
          },
        ]
      : [];

  return characters.map((character: Record<string, any>, index: number) => ({
    id: String(character.id ?? `character_${index + 1}`),
    name: String(character.name ?? "Unnamed character"),
    role: String(character.role ?? "main"),
    persona: String(character.persona ?? character.description ?? character.notes ?? ""),
    visualPrompt: String(character.visualPrompt ?? character.visual_prompt ?? character.appearance ?? ""),
    storyId: story.id,
    storyTitle: story.title,
    updatedAt: story.updated_at,
  }));
}

export const listReusableCharacters = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReusableCharacterRow[]> => {
    const { data, error } = await supabase
      .from("user_stories")
      .select("id,title,character_card,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);
    return (data ?? []).flatMap((story) => extractCharacters(story as UserStory));
  },
);

export const generateReusableCharacter = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as Record<string, unknown>)
  .handler(async () => {
    throw new Error("AI character generation provider is not configured yet.");
  });
