import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import {
  ArrowRight,
  BookOpen,
  Coins,
  Flame,
  HeartHandshake,
  Loader2,
  Search,
  Sparkles,
  Users,
  WandSparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoverImage } from "@/components/cover-image";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { listHomePlacements, type HomePlacementCard } from "@/lib/home-placements.functions";
import type { HeatTier } from "@/lib/marketplace.functions";
import heroBanner from "@/assets/hero-banner.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lovetale | ?ㅽ넗由??먮젅?댁뀡" },
      {
        name: "description",
        content: "硫?곕え??19+ ?ㅽ넗由? 二쇱씤怨듦낵???곗씠?? ?좏깮???곗븷 ?쒕??덉씠?섏쓣 ?쒓납?먯꽌 留뚮굹??Lovetale ?먮젅?댁뀡.",
      },
    ],
  }),
  component: Home,
});

const HEAT_BADGE: Record<HeatTier, { label: string; className: string }> = {
  soft: { label: "Soft", className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" },
  warm: { label: "Warm", className: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
  spicy: { label: "Spicy", className: "border-rose-500/30 bg-rose-500/15 text-rose-300" },
  steamy: { label: "Steamy", className: "border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-300" },
};

function Home() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const placementsFn = useServerFn(listHomePlacements);

  const heroQ = useQuery({
    queryKey: ["home_placement", "hero"],
    queryFn: () => placementsFn({ data: { slot: "hero" } }),
  });
  const trendingQ = useQuery({
    queryKey: ["home_placement", "trending"],
    queryFn: () => placementsFn({ data: { slot: "trending" } }),
  });
  const newQ = useQuery({
    queryKey: ["home_placement", "new"],
    queryFn: () => placementsFn({ data: { slot: "new" } }),
  });
  const allQ = useQuery({
    queryKey: ["home_placement", "all"],
    queryFn: () => placementsFn({ data: { slot: "all" } }),
  });

  const heroStory = heroQ.data?.[0];
  const trending = trendingQ.data ?? [];
  const newest = newQ.data ?? [];
  const allStories = allQ.data ?? [];

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return allStories;
    return allStories.filter(
      (story) =>
        story.title.includes(q) ||
        (story.logline ?? "").includes(q) ||
        (story.tags ?? []).some((tag) => tag.includes(q)),
    );
  }, [allStories, query]);

  return (
    <div className="space-y-12 pb-16">
      <HeroSection story={heroStory} />

      <div className="mx-auto max-w-7xl space-y-12 px-6 md:px-10">
        <SlotSection
          title="지금 뜨거운 스토리"
          subtitle="많이 읽히는 인기 스토리를 만나보세요"
          stories={trending}
          loading={trendingQ.isLoading}
        />
        <SlotSection
          title="신작"
          subtitle="방금 공개된 새로운 이야기를 먼저 만나보세요"
          stories={newest}
          loading={newQ.isLoading}
        />

        <section>
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold md:text-3xl">모든 스토리</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                읽고, 선택하고, 주인공과 대화하며 나만의 흐름으로 이어가는 작품들입니다.
              </p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
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
              {filtered.map((story) => (
                <StoryTile
                  key={story.id}
                  story={{
                    id: story.story_id,
                    title: story.title,
                    logline: story.logline,
                    cover_url: story.cover_url,
                    price_credits: story.price_credits,
                    author_name: story.author_name,
                    audience: story.audience,
                    max_heat: story.max_heat as HeatTier,
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
          <img src={heroBanner} alt="Lovetale story curation" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/35 to-transparent" />

        <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end px-6 pb-12 md:px-10">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
            <Flame className="h-3.5 w-3.5" />
            {story ? "?ㅻ뒛???먮젅?댁뀡" : "?ㅽ넗由??먮젅?댁뀡"}
          </div>
          {story ? (
            <>
              <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-tight md:text-6xl">
                {story.title}
              </h1>
              {story.logline && <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">{story.logline}</p>}
              <HeroFeatureChips />
              <div className="mt-3 flex items-center gap-2">
                {heat && (
                  <Badge variant="outline" className={heat.className}>
                    {heat.label}
                  </Badge>
                )}
                {story.price_credits > 0 ? (
                  <Badge className="gap-0.5">
                    <Coins className="size-3" /> {story.price_credits}
                  </Badge>
                ) : (
                  <Badge variant="secondary">FREE</Badge>
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" className="shadow-glow">
                  <Link to="/play/user/$id" params={{ id: story.story_id }}>
                    <Sparkles className="mr-2 h-4 w-4" /> 諛붾줈 紐곗엯?섍린
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-primary/50 bg-primary/10 backdrop-blur">
                  <Link to="/marketplace">
                    留덉폆 ?섎윭蹂닿린
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-tight md:text-6xl">
                ?쎈뒗 ?쒓컙, <span className="text-primary">二쇱씤怨듦낵 ?곌껐?섎뒗</span> ?ㅽ넗由?              </h1>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
                硫?곕え??19+ ?뱀냼?? ?좏깮???곗븷 ?쒕??덉씠?? 二쇱씤怨듦낵???곗씠?낆쓣 ???붾㈃?먯꽌 ?쒖옉?섏꽭??
              </p>
              <HeroFeatureChips />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function HeroFeatureChips() {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Badge variant="outline" className="gap-1 border-primary/35 bg-primary/10 text-primary">
        <BookOpen className="size-3" /> 硫?곕え???ㅽ넗由?      </Badge>
      <Badge variant="outline" className="gap-1 border-primary/35 bg-primary/10 text-primary">
        <HeartHandshake className="size-3" /> 二쇱씤怨??곗씠??      </Badge>
      <Badge variant="outline" className="gap-1 border-primary/35 bg-primary/10 text-primary">
        <WandSparkles className="size-3" /> ?좏깮???뚮젅??      </Badge>
    </div>
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
        <Link to="/marketplace" className="text-xs text-muted-foreground hover:text-foreground">
          ?꾩껜蹂닿린
        </Link>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <StoryTile
              key={story.id}
              story={{
                id: story.story_id,
                title: story.title,
                logline: story.logline,
                cover_url: story.cover_url,
                price_credits: story.price_credits,
                author_name: story.author_name,
                audience: story.audience,
                max_heat: story.max_heat as HeatTier,
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

function StoryTile({ story }: { story: TileStory }) {
  const heat = HEAT_BADGE[story.max_heat] ?? HEAT_BADGE.soft;
  return (
    <Link
      to="/play/user/$id"
      params={{ id: story.id }}
      className="group overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur transition hover:border-primary/50"
    >
      {story.cover_url ? (
        <div className="aspect-[16/10] overflow-hidden bg-muted">
          <CoverImage
            src={story.cover_url}
            alt={story.title}
            className="size-full object-cover transition duration-500 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-primary/20 via-card to-card/60">
          <BookOpen className="size-12 text-muted-foreground/50" />
        </div>
      )}
      <div className="space-y-1.5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`text-[9px] ${heat.className}`}>
            {heat.label}
          </Badge>
          {story.audience !== "all" && (
            <Badge variant="outline" className="text-[9px]">
              {story.audience === "female" ? "여성향" : "남성향"}
            </Badge>
          )}
        </div>
        <h3 className="font-semibold leading-tight transition group-hover:text-primary">{story.title}</h3>
        {story.logline && <p className="line-clamp-2 text-xs text-muted-foreground">{story.logline}</p>}
        <div className="flex items-center justify-between pt-1">
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users className="size-3" /> @{story.author_name}
          </span>
          {story.price_credits > 0 ? (
            <Badge className="gap-0.5 text-[10px]">
              <Coins className="size-3" /> {story.price_credits}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              FREE
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-border bg-surface-elevated/40 p-12 text-center text-sm text-muted-foreground">
      {signedIn ? <p>?쒖떆???ㅽ넗由ш? ?놁뒿?덈떎.</p> : <p>濡쒓렇?명븯硫??ㅽ넗由щ? 蹂????덉뒿?덈떎.</p>}
    </div>
  );
}
