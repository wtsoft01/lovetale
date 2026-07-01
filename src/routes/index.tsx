import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { Search, Sparkles, Flame, ArrowRight, BookOpen, Coins, Loader2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CoverImage } from "@/components/cover-image";
import { useAuth } from "@/hooks/use-auth";
import { listMarketplace, type HeatTier } from "@/lib/marketplace.functions";
import { listHomePlacements, type HomePlacementCard } from "@/lib/home-placements.functions";
import heroBanner from "@/assets/hero-banner.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lovetale | 19+ 인터랙티브 스토리" },
      { name: "description", content: "AI 기반 19+ 인터랙티브 스토리 플랫폼" },
    ],
  }),
  component: Home,
});

const HEAT_BADGE: Record<HeatTier, { label: string; className: string }> = {
  soft: { label: "Soft", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  warm: { label: "Warm", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  spicy: { label: "Spicy", className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  steamy: { label: "Steamy", className: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
};

function Home() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const listFn = useServerFn(listMarketplace);
  const placementsFn = useServerFn(listHomePlacements);

  const heroQ = useQuery({ queryKey: ["home_placement", "hero"], queryFn: () => placementsFn({ data: { slot: "hero" } }) });
  const trendingQ = useQuery({ queryKey: ["home_placement", "trending"], queryFn: () => placementsFn({ data: { slot: "trending" } }) });
  const newQ = useQuery({ queryKey: ["home_placement", "new"], queryFn: () => placementsFn({ data: { slot: "new" } }) });
  const allQ = useQuery({ queryKey: ["home_placement", "all"], queryFn: () => placementsFn({ data: { slot: "all" } }) });

  const heroStory = heroQ.data?.[0];
  const trending = trendingQ.data ?? [];
  const newest = newQ.data ?? [];
  const allStories = allQ.data ?? [];

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return allStories;
    return allStories.filter(
      (s) =>
        s.title.includes(q) ||
        (s.logline ?? "").includes(q) ||
        (s.tags ?? []).some((t) => t.includes(q)),
    );
  }, [allStories, query]);

  return (
    <div className="space-y-12 pb-16">
      <HeroSection story={heroStory} />

      <div className="mx-auto max-w-7xl space-y-12 px-6 md:px-10">
        <SlotSection title="지금 뜨거운 스토리" subtitle="지금 가장 반응이 높은 작품들" stories={trending} loading={trendingQ.isLoading} />
        <SlotSection title="신작" subtitle="새로 공개된 작품을 먼저 만나보세요" stories={newest} loading={newQ.isLoading} />

        <section>
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <h2 className="font-display text-2xl font-semibold md:text-3xl">모든 스토리</h2>
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목, 줄거리, 태그 검색"
                className="border-border bg-surface-elevated/60 pl-9"
              />
            </div>
          </div>

          {allQ.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState signedIn={!!user} />
          ) : (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((s) => (
                <StoryTile
                  key={s.id}
                  story={{
                    id: s.id,
                    title: s.title,
                    logline: s.logline,
                    cover_url: s.cover_url,
                    price_credits: s.price_credits,
                    author_name: s.author_name,
                    audience: s.audience,
                    max_heat: s.max_heat as HeatTier,
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function HeroSection({ story }: { story?: HomePlacementCard }) {
  const heat = story ? (HEAT_BADGE[story.max_heat as HeatTier] ?? HEAT_BADGE.soft) : null;
  return (
    <section className="relative overflow-hidden">
      <div className="relative h-[420px] w-full md:h-[480px]">
        {story?.cover_url ? (
          <CoverImage src={story.cover_url} alt={story.title} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <img src={heroBanner} alt="Lovetale hero" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/30 to-transparent" />

        <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end px-6 pb-12 md:px-10">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
            <Flame className="h-3.5 w-3.5" />
            {story ? "오늘의 추천" : "오늘의 스토리"}
          </div>
          {story ? (
            <>
              <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-tight md:text-6xl">{story.title}</h1>
              {story.logline && <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">{story.logline}</p>}
              <div className="mt-3 flex items-center gap-2">
                {heat && <Badge variant="outline" className={heat.className}>{heat.label}</Badge>}
                {story.price_credits > 0 ? (
                  <Badge className="gap-0.5"><Coins className="size-3" /> {story.price_credits}</Badge>
                ) : (
                  <Badge variant="secondary">FREE</Badge>
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" className="shadow-glow">
                  <Link to="/marketplace/$id" params={{ id: story.story_id }}>
                    <Sparkles className="mr-2 h-4 w-4" /> 바로 보기
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-primary/50 bg-primary/10 backdrop-blur">
                  <Link to="/marketplace">스토리 보기<ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-tight md:text-6xl">
                선택한 순간, <span className="text-primary">다음 장면</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
                AI 기반 인터랙티브 19+ 스토리 플랫폼
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function SlotSection({
  title,
  subtitle,
  stories,
  loading,
}: {
  title: string;
  subtitle: string;
  stories: HomePlacementCard[];
  loading: boolean;
}) {
  if (!loading && stories.length === 0) return null;
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold md:text-3xl">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Link to="/marketplace" className="text-xs text-muted-foreground hover:text-foreground">전체보기</Link>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((s) => (
            <StoryTile
              key={s.id}
              story={{
                id: s.story_id,
                title: s.title,
                logline: s.logline,
                cover_url: s.cover_url,
                price_credits: s.price_credits,
                author_name: s.author_name,
                audience: s.audience,
                max_heat: s.max_heat as HeatTier,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type TileStory = {
  id: string;
  title: string;
  logline: string | null;
  cover_url: string | null;
  price_credits: number;
  author_name: string;
  audience: string;
  max_heat: HeatTier;
};

function StoryTile({ story: s }: { story: TileStory }) {
  const heat = HEAT_BADGE[s.max_heat] ?? HEAT_BADGE.soft;
  return (
    <Link
      to="/marketplace/$id"
      params={{ id: s.id }}
      className="group rounded-2xl overflow-hidden border border-border/60 bg-card/40 backdrop-blur hover:border-primary/50 transition"
    >
      {s.cover_url ? (
        <div className="aspect-[16/10] overflow-hidden bg-muted">
          <CoverImage src={s.cover_url} alt={s.title} className="size-full object-cover group-hover:scale-105 transition duration-500" />
        </div>
      ) : (
        <div className="aspect-[16/10] bg-gradient-to-br from-primary/20 via-card to-card/60 flex items-center justify-center">
          <BookOpen className="size-12 text-muted-foreground/50" />
        </div>
      )}
      <div className="p-3 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-[9px] ${heat.className}`}>{heat.label}</Badge>
          {s.audience !== "all" && (
            <Badge variant="outline" className="text-[9px]">
              {s.audience === "female" ? "여성향" : "남성향"}
            </Badge>
          )}
        </div>
        <h3 className="font-semibold leading-tight group-hover:text-primary transition">{s.title}</h3>
        {s.logline && <p className="text-xs text-muted-foreground line-clamp-2">{s.logline}</p>}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1"><Users className="size-3" /> @{s.author_name}</span>
          {s.price_credits > 0 ? (
            <Badge className="text-[10px] gap-0.5"><Coins className="size-3" /> {s.price_credits}</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">FREE</Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface-elevated/40 p-12 text-center text-sm text-muted-foreground space-y-2">
      {signedIn ? <p>표시할 스토리가 없습니다.</p> : <p>로그인하면 스토리를 볼 수 있습니다.</p>}
    </div>
  );
}
