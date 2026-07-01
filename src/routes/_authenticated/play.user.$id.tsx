import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { Loader2, ArrowLeft, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getUnifiedReaderStory } from "@/lib/admin-stories-compose.functions";
import { UnifiedStoryReader } from "@/components/unified-story-reader";
import { BeatReader, type ReaderBeat } from "@/components/beat-reader";

export const Route = createFileRoute("/_authenticated/play/user/$id")({
  head: () => ({ meta: [{ title: "내 스토리 플레이 — Lovetale" }] }),
  component: UserStoryPlay,
});

function UserStoryPlay() {
  const { id } = Route.useParams();
  const fetchStory = useServerFn(getUnifiedReaderStory);

  const { data, isLoading, error } = useQuery({
    queryKey: ["user_story_unified", id],
    queryFn: () => fetchStory({ data: { id } }),
  });

  const legacyBeatMap = useMemo<Record<string, ReaderBeat>>(() => {
    const arr = Array.isArray((data as any)?.beats)
      ? ((data as any).beats as ReaderBeat[])
      : [];
    const m: Record<string, ReaderBeat> = {};
    for (const b of arr) m[b.id] = b;
    return m;
  }, [data]);

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  if (error || !data)
    return (
      <div className="mx-auto max-w-md py-20 text-center space-y-3">
        <p className="text-sm text-destructive">
          {(error as Error)?.message ?? "스토리를 찾을 수 없어요"}
        </p>
        <Button asChild variant="outline">
          <Link to="/library">라이브러리로</Link>
        </Button>
      </div>
    );

  const card = (data.character_card as any) ?? {};
  const charName =
    (Array.isArray(card.characters) && card.characters[0]?.name) ||
    card.name ||
    "그/그녀";

  const useUnified = (data.body_text ?? "").length > 20;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background to-background/80">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="mx-auto max-w-3xl px-4 h-12 flex items-center justify-between">
          <Link
            to="/library"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ArrowLeft className="size-4" /> 라이브러리
          </Link>
          <Link
            to="/admin/stories/$id/compose"
            params={{ id }}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Pencil className="size-3.5" /> 편집
          </Link>
        </div>
      </header>

      {useUnified ? (
        <UnifiedStoryReader
          storyId={id}
          title={data.title ?? ""}
          cover={data.cover_url}
          bodyText={data.body_text}
          assetSlots={data.asset_slots ?? []}
          characterName={charName}
        />
      ) : (
        <main className="mx-auto max-w-3xl px-4 py-4">
          <BeatReader
            beats={legacyBeatMap}
            title={data.title ?? ""}
            cover={data.cover_url ?? undefined}
            storyId={id}
          />
        </main>
      )}
    </div>
  );
}
