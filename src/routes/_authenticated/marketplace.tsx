import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Coins,
  Library,
  Loader2,
  Search,
  Sparkles,
  Store,
  WandSparkles,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CoverImage } from "@/components/cover-image";
import {
  listMarketplace,
  type Audience,
  type HeatTier,
  type MarketplaceCard,
} from "@/lib/marketplace.functions";

export const Route = createFileRoute("/_authenticated/marketplace")({
  head: () => ({
    meta: [
      { title: "스토리마켓 | Lovetale" },
      {
        name: "description",
        content: "사용자가 직접 만든 멀티모달 스토리를 구매하고 라이브러리에 저장해 열람하는 Lovetale 마켓입니다.",
      },
    ],
  }),
  component: MarketplacePage,
});

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "female", label: "여성향" },
  { value: "male", label: "남성향" },
];

const HEAT_OPTIONS: { value: HeatTier | "any"; label: string }[] = [
  { value: "any", label: "전체 수위" },
  { value: "soft", label: "Soft" },
  { value: "warm", label: "Warm" },
  { value: "spicy", label: "Spicy" },
  { value: "steamy", label: "Steamy" },
];

const POPULAR_TAGS = ["계약연애", "집착", "후회", "비밀관계", "위험한사랑", "캠퍼스", "스파이", "금단"];

const HEAT_BADGE: Record<HeatTier, { label: string; className: string }> = {
  soft: { label: "Soft", className: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" },
  warm: { label: "Warm", className: "border-amber-400/40 bg-amber-400/10 text-amber-200" },
  spicy: { label: "Spicy", className: "border-rose-400/40 bg-rose-400/10 text-rose-200" },
  steamy: { label: "Steamy", className: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200" },
};

function MarketplacePage() {
  const list = useServerFn(listMarketplace);
  const [q, setQ] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [maxHeat, setMaxHeat] = useState<HeatTier | "any">("any");
  const [tags, setTags] = useState<string[]>([]);

  const filters = useMemo(() => ({ q, audience, max_heat: maxHeat, tags }), [q, audience, maxHeat, tags]);
  const hasFilters = q.trim().length > 0 || audience !== "all" || maxHeat !== "any" || tags.length > 0;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["marketplace_stories", filters],
    queryFn: () => list({ data: filters }),
  });

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  };

  const resetFilters = () => {
    setQ("");
    setAudience("all");
    setMaxHeat("any");
    setTags([]);
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/">
              <ArrowLeft className="size-4" />
              스토리탐색
            </Link>
          </Button>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Store className="size-4 text-primary" />
            스토리마켓
          </div>
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/library">
              <Library className="size-4" />
              라이브러리
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <section className="mb-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1 rounded-full px-2.5 py-1 text-[11px]">
              <Sparkles className="size-3" />
              USER MADE
            </Badge>
            <span className="text-sm text-muted-foreground">구매한 콘텐츠는 라이브러리에 저장됩니다.</span>
          </div>
          <Button asChild size="sm" className="gap-1.5 rounded-full">
            <Link to="/builder">
              <WandSparkles className="size-4" />
              자작스토리 만들기
            </Link>
          </Button>
        </section>

        <section className="mb-5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="작품명, 작가, 태그 검색"
              className="h-11 rounded-full border-border/60 bg-card/40 pl-9"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {AUDIENCE_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                active={audience === option.value}
                onClick={() => setAudience(option.value)}
              >
                {option.label}
              </FilterChip>
            ))}
            <span className="w-px shrink-0 bg-border/60" />
            {HEAT_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                active={maxHeat === option.value}
                onClick={() => setMaxHeat(option.value)}
              >
                {option.label}
              </FilterChip>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {POPULAR_TAGS.map((tag) => (
              <FilterChip key={tag} active={tags.includes(tag)} onClick={() => toggleTag(tag)}>
                #{tag}
              </FilterChip>
            ))}
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border/60 px-3 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <X className="size-3" />
                초기화
              </button>
            )}
          </div>
        </section>

        {(isLoading || isFetching) && (
          <div className="flex items-center justify-center py-14 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}

        {!isLoading && !isFetching && (data?.length ?? 0) === 0 && (
          <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center">
            <Store className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {hasFilters ? "조건에 맞는 자작스토리가 없습니다." : "아직 판매 중인 자작스토리가 없습니다."}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {data?.map((story) => (
            <MarketplaceStoryCard key={story.id} story={story} />
          ))}
        </div>
      </main>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 shrink-0 rounded-full border px-3 text-xs transition ${
        active
          ? "border-primary/60 bg-primary text-primary-foreground"
          : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function MarketplaceStoryCard({ story }: { story: MarketplaceCard }) {
  const heat = HEAT_BADGE[story.max_heat] ?? HEAT_BADGE.soft;

  return (
    <Link
      to="/marketplace/$id"
      params={{ id: story.id }}
      className="group min-w-0 rounded-2xl border border-border/50 bg-card/50 p-2 transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card"
    >
      <div className="relative overflow-hidden rounded-xl bg-muted">
        <div className="aspect-[3/4]">
          {story.cover_url ? (
            <CoverImage
              src={story.cover_url}
              alt={story.title}
              className="size-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/20 via-card to-card">
              <BookOpen className="size-9 text-muted-foreground/60" />
            </div>
          )}
        </div>
        <div className="absolute left-2 top-2 flex gap-1">
          <Badge variant="outline" className={`border px-1.5 py-0 text-[10px] ${heat.className}`}>
            {heat.label}
          </Badge>
        </div>
        <div className="absolute bottom-2 right-2 rounded-full bg-background/85 px-2 py-1 text-[11px] font-semibold backdrop-blur">
          {story.price_credits > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Coins className="size-3 text-yellow-300" />
              {story.price_credits}
            </span>
          ) : (
            "FREE"
          )}
        </div>
      </div>

      <div className="space-y-1 px-1 py-2">
        <h2 className="truncate text-sm font-semibold">{story.title}</h2>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">@{story.author_name || "creator"}</span>
          <span className="shrink-0">{story.beats_count}회차</span>
        </div>
        {story.logline && <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{story.logline}</p>}
        {story.tags.length > 0 && (
          <div className="flex min-h-5 flex-wrap gap-1">
            {story.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] text-primary/80">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
