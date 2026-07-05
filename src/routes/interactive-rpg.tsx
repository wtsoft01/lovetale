import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Gamepad2, ImageIcon, Loader2, Play, Search, Sparkles, WandSparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@/lib/_mock/runtime";
import { listStoryRpgs } from "@/lib/story-rpg.functions";
import { type StoryRpg } from "@/lib/story-rpg-data";

export const Route = createFileRoute("/interactive-rpg")({
  head: () => ({
    meta: [
      { title: "스토리게임 | Lovetale" },
      {
        name: "description",
        content: "선택과 대화로 흐름이 바뀌는 Lovetale 스토리게임입니다.",
      },
    ],
  }),
  component: StoryRpgPage,
});

function StoryRpgPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const fetchStoryRpgs = useServerFn(listStoryRpgs);
  const [query, setQuery] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["story_rpg_public_list"],
    queryFn: () => fetchStoryRpgs(),
    staleTime: 30_000,
  });

  const games = data ?? [];
  const filteredGames = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return games;
    return games.filter((rpg) =>
      `${rpg.title} ${rpg.leadName} ${rpg.logline} ${rpg.tags.join(" ")}`.toLowerCase().includes(needle),
    );
  }, [games, query]);
  const featured = filteredGames[0] ?? games[0];

  if (pathname !== "/interactive-rpg") return <Outlet />;

  if (!featured && !isLoading) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-lg place-items-center px-6 text-center">
        <section className="w-full rounded-2xl border border-border bg-card/50 p-7">
          <Gamepad2 className="mx-auto mb-4 size-9 text-primary" />
          <h1 className="text-lg font-semibold">스토리게임이 없습니다</h1>
          <div className="mt-5 flex justify-center gap-2">
            <Button asChild size="sm" className="rounded-full">
              <Link to="/marketplace">스토리마켓</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link to="/builder">만들기</Link>
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 md:px-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full border border-primary/30 bg-primary/10 text-primary">
            <Gamepad2 className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold leading-tight">스토리게임</h1>
            <div className="text-xs text-muted-foreground">{games.length}개</div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="게임, 주인공 검색"
              className="h-10 rounded-full bg-card/50 pl-9"
            />
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/builder">
              <WandSparkles className="size-4" />
              만들기
            </Link>
          </Button>
          {featured ? (
            <Button asChild size="sm" className="rounded-full">
              <Link to="/story-rpg/$id" params={{ id: featured.id }}>
                <Play className="size-4" />
                시작
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      {featured ? <FeaturedStrip rpg={featured} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center rounded-2xl border border-border bg-card/40 p-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            불러오는 중
          </div>
        ) : filteredGames.length ? (
          filteredGames.map((rpg) => <RpgCard key={rpg.id} rpg={rpg} />)
        ) : (
          <div className="col-span-full rounded-2xl border border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
            검색 결과가 없습니다.
          </div>
        )}
      </section>
    </main>
  );
}

function FeaturedStrip({ rpg }: { rpg: StoryRpg }) {
  return (
    <Link
      to="/story-rpg/$id"
      params={{ id: rpg.id }}
      className="group grid overflow-hidden rounded-2xl border border-border bg-card/50 transition hover:border-primary/45 md:grid-cols-[16rem_minmax(0,1fr)_8rem]"
    >
      <div className="relative aspect-[16/10] overflow-hidden md:aspect-auto">
        <img src={rpg.cover} alt={rpg.title} className="size-full object-cover transition duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent md:hidden" />
      </div>
      <div className="min-w-0 p-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge className="border-0 bg-primary/15 text-primary">
            <Sparkles className="mr-1 size-3" />
            추천
          </Badge>
          {rpg.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="outline" className="border-border bg-background/60">
              {tag}
            </Badge>
          ))}
        </div>
        <h2 className="line-clamp-1 text-lg font-semibold">{rpg.title}</h2>
        {rpg.logline && <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{rpg.logline}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Metric label="주인공" value={rpg.leadName} />
          <Metric label="호감" value={String(rpg.affection)} />
          <Metric label="엔딩" value={`${rpg.endings.total}`} />
          <Metric label="이미지" value={`${rpg.images.unlocked + rpg.images.locked}`} />
        </div>
      </div>
      <div className="hidden items-center justify-center md:flex">
        <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
          <Play className="size-5 fill-current" />
        </span>
      </div>
    </Link>
  );
}

function RpgCard({ rpg }: { rpg: StoryRpg }) {
  const primaryRoute = rpg.routes[0];

  return (
    <Link
      to="/story-rpg/$id"
      params={{ id: rpg.id }}
      className="group overflow-hidden rounded-2xl border border-border bg-card/45 transition hover:-translate-y-0.5 hover:border-primary/45"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img src={rpg.cover} alt={rpg.title} className="size-full object-cover transition duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
        <Badge className="absolute left-2 top-2 border-0 bg-black/50 text-white backdrop-blur">
          <Gamepad2 className="mr-1 size-3" />
          선택형
        </Badge>
        <div className="absolute bottom-2 left-2 right-2">
          <h3 className="line-clamp-1 text-sm font-semibold text-white">{rpg.title}</h3>
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-white/75">
            <span className="truncate">{rpg.leadName}</span>
            <span>{rpg.endings.total} 엔딩</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 p-3 text-center text-[11px] text-muted-foreground">
        <span className="rounded-md bg-background px-1.5 py-1">호감 {rpg.affection}</span>
        <span className="rounded-md bg-background px-1.5 py-1">진행 {primaryRoute?.progress ?? 0}%</span>
        <span className="rounded-md bg-background px-1.5 py-1">
          <ImageIcon className="mr-1 inline size-3" />
          {rpg.images.unlocked}
        </span>
      </div>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-border bg-background/50 px-2.5 py-1 text-xs text-muted-foreground">
      {label} <b className="font-medium text-foreground">{value}</b>
    </span>
  );
}
