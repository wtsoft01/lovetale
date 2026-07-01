import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMemo, useState } from "react";
import { Loader2, ArrowLeft, Store, Coins, BookOpen, Sparkles, Search, X, HeartHandshake, PenLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listMarketplace,
  type Audience,
  type HeatTier,
} from "@/lib/marketplace.functions";
import { getMyCreatorRevenueRule } from "@/lib/revenue-rules.functions";
import { CoverImage } from "@/components/cover-image";

export const Route = createFileRoute("/_authenticated/marketplace")({
  head: () => ({
    meta: [
      { title: "스토리 마켓 — Lovetale" },
      { name: "description", content: "크리에이터가 만든 인터랙티브 로맨스 스토리를 둘러보고 크레딧으로 플레이하세요." },
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

const POPULAR_TAGS = [
  "오피스", "캠퍼스", "재회", "비밀연애", "판타지", "어둠", "사내연애", "소꿉친구",
];

const HEAT_BADGE: Record<HeatTier, { label: string; className: string }> = {
  soft:   { label: "Soft",   className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  warm:   { label: "Warm",   className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  spicy:  { label: "Spicy",  className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  steamy: { label: "Steamy", className: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
};

function MarketplacePage() {
  const list = useServerFn(listMarketplace);
  const getRule = useServerFn(getMyCreatorRevenueRule);
  const [q, setQ] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [maxHeat, setMaxHeat] = useState<HeatTier | "any">("any");
  const [tags, setTags] = useState<string[]>([]);

  const filters = useMemo(() => ({ q, audience, max_heat: maxHeat, tags }), [q, audience, maxHeat, tags]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["marketplace_stories", filters],
    queryFn: () => list({ data: filters }),
  });

  const { data: creatorRule } = useQuery({
    queryKey: ["my_creator_revenue_rule"],
    queryFn: () => getRule(),
  });

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const hasFilters = q || audience !== "all" || maxHeat !== "any" || tags.length > 0;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background to-background/80">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> 홈
          </Link>
          <h1 className="text-sm font-semibold flex items-center gap-1.5">
            <Store className="size-4 text-primary" /> 스토리 마켓
          </h1>
          <Link to="/library" className="text-sm text-muted-foreground hover:text-foreground">
            내 라이브러리
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur p-6 mb-6 space-y-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="max-w-2xl">
              <Badge variant="secondary" className="mb-3 gap-1"><HeartHandshake className="size-3" /> Creator Marketplace</Badge>
              <h2 className="text-2xl font-bold mb-2">현실감 있는 이야기를 함께 공감하고 구매하는 스토리마켓</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                크리에이터가 직접 만든 스토리를 마켓에 올리고, 다른 사용자는 첫 장면과 캐릭터를 확인한 뒤 크레딧으로 구매합니다.
                구매 수익은 운영자가 설정한 작가별 수익공유룰에 따라 자동 분배됩니다.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:min-w-52">
              <Button asChild>
                <Link to="/builder">
                  <PenLine className="size-4 mr-1" /> 내스토리 로맨스
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/library">
                  <Store className="size-4 mr-1" /> 완성작 등록하기
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <p className="text-xs text-muted-foreground">작가 수익공유</p>
              <p className="mt-1 text-lg font-semibold">{creatorRule?.sharePercent ?? 70}%</p>
              <p className="mt-1 text-[11px] text-muted-foreground">관리자가 회원별로 조정 가능</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <p className="text-xs text-muted-foreground">구매 방식</p>
              <p className="mt-1 text-lg font-semibold">크레딧 1회 구매</p>
              <p className="mt-1 text-[11px] text-muted-foreground">구매 후 라이브러리에 영구 저장</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <p className="text-xs text-muted-foreground">제작 동선</p>
              <p className="mt-1 text-lg font-semibold">작성 → 편집 → 등록</p>
              <p className="mt-1 text-[11px] text-muted-foreground">긴 원문도 AI 빌더에서 바로 변환</p>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="space-y-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제목·시놉시스로 검색"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {AUDIENCE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={audience === opt.value ? "default" : "outline"}
                onClick={() => setAudience(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
            <span className="w-px bg-border mx-1" />
            {HEAT_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={maxHeat === opt.value ? "default" : "outline"}
                onClick={() => setMaxHeat(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {POPULAR_TAGS.map((t) => {
              const active = tags.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                    active
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border/60 text-muted-foreground hover:border-border"
                  }`}
                >
                  #{t}
                </button>
              );
            })}
            {hasFilters && (
              <button
                onClick={() => {
                  setQ(""); setAudience("all"); setMaxHeat("any"); setTags([]);
                }}
                className="text-xs px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="size-3" /> 필터 초기화
              </button>
            )}
          </div>
        </section>

        {(isLoading || isFetching) && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}

        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center space-y-3">
            <Store className="size-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {hasFilters ? "조건에 맞는 스토리가 없어요." : "아직 마켓에 등록된 스토리가 없어요."}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.map((s) => {
            const heat = HEAT_BADGE[s.max_heat] ?? HEAT_BADGE.soft;
            return (
              <Link
                key={s.id}
                to="/marketplace/$id"
                params={{ id: s.id }}
                className="group rounded-xl border border-border/60 bg-card/60 backdrop-blur p-4 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 transition space-y-2"
              >
                {s.cover_url ? (
                  <div className="aspect-[4/5] rounded-lg overflow-hidden bg-muted">
                    <CoverImage src={s.cover_url} alt={s.title} className="size-full object-cover group-hover:scale-105 transition" />
                  </div>
                ) : (
                  <div className="aspect-[4/5] rounded-lg bg-gradient-to-br from-primary/20 via-card to-card/60 flex items-center justify-center">
                    <BookOpen className="size-12 text-muted-foreground/50" />
                  </div>
                )}
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge variant="outline" className={`text-[9px] ${heat.className}`}>{heat.label}</Badge>
                  {s.audience !== "all" && (
                    <Badge variant="outline" className="text-[9px]">
                      {s.audience === "female" ? "여성향" : "남성향"}
                    </Badge>
                  )}
                </div>
                <h3 className="font-semibold truncate">{s.title}</h3>
                {s.logline && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{s.logline}</p>
                )}
                {s.tags && s.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {s.tags.slice(0, 3).map((t) => (
                      <span key={t} className="text-[10px] text-muted-foreground/80">#{t}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground">@{s.author_name}</span>
                  {s.price_credits > 0 ? (
                    <Badge className="text-[10px] gap-0.5">
                      <Coins className="size-3" /> {s.price_credits}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">FREE</Badge>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
