import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { Sparkles, Lock, Flame, Star, Clock, Plus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { stories } from "@/lib/mock/stories";
import { listMyUserStories } from "@/lib/story-builder.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "탐색 — Lovetale" },
      { name: "description", content: "큐레이션된 AI 스토리와 내가 만든 스토리를 한 곳에서." },
    ],
  }),
  component: ExplorePage,
});

function ExplorePage() {
  const { user } = useAuth();
  const list = useServerFn(listMyUserStories);
  const { data: mine, isLoading: mineLoading } = useQuery({
    queryKey: ["my_user_stories"],
    queryFn: () => list(),
    enabled: !!user,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 space-y-10">
      {/* My AI-generated stories */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold md:text-3xl flex items-center gap-2">
              <Sparkles className="size-5 text-primary" /> 내가 만든 스토리
            </h2>
            <p className="text-sm text-muted-foreground">
              AI 빌더로 생성한 비공개 라이브러리
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/builder">
              <Plus className="size-4 mr-1" /> 새로 만들기
            </Link>
          </Button>
        </div>

        {!user ? (
          <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              내 스토리를 보려면{" "}
              <Link to="/auth" className="text-primary underline">로그인</Link>이 필요합니다.
            </p>
          </div>
        ) : mineLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (mine?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 p-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">아직 만든 스토리가 없어요.</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/builder">
                <Sparkles className="size-4 mr-1" /> AI로 첫 스토리 만들기
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine!.map((s) => (
              <li key={s.id}>
                <Link
                  to="/play/user/$id"
                  params={{ id: s.id }}
                  className="block group rounded-xl border border-border/60 bg-card/40 backdrop-blur p-4 hover:border-primary/50 transition"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Sparkles className="size-2.5" /> AI
                    </Badge>
                    {!s.is_listed && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Lock className="size-2.5" /> 비공개
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-semibold truncate group-hover:text-primary transition">
                    {s.title}
                  </h3>
                  {s.logline && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{s.logline}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Curated mock stories */}
      <section>
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold md:text-3xl">큐레이션 스토리</h2>
          <p className="text-sm text-muted-foreground">에디터 추천 작품</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((s) => (
            <li key={s.id}>
              <Link
                to="/play/$sessionId"
                params={{ sessionId: s.id }}
                className="block group rounded-2xl overflow-hidden border border-border/60 bg-card/40 backdrop-blur hover:border-primary/50 transition"
              >
                <div className="aspect-[16/10] overflow-hidden">
                  <img
                    src={s.cover}
                    alt={s.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition duration-500"
                    loading="lazy"
                  />
                </div>
                <div className="p-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {s.mature && (
                      <Badge className="bg-rose-600/90 text-[10px] font-bold">19+</Badge>
                    )}
                    <span className="inline-flex items-center gap-0.5">
                      {Array.from({ length: s.heat }).map((_, i) => (
                        <Flame key={i} className="h-3 w-3 text-rose-500" />
                      ))}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Star className="h-3 w-3 text-amber-400" /> {s.rating}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> {s.length}
                    </span>
                  </div>
                  <h3 className="font-semibold leading-tight group-hover:text-primary transition">
                    {s.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">{s.tagline}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
