import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { Loader2, Sparkles, ArrowLeft, Trash2, Lock, BookOpen, Store, Coins } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CoverImage } from "@/components/cover-image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { listMyUserStories, deleteMyUserStory } from "@/lib/story-builder.functions";
import {
  publishUserStory,
  unpublishUserStory,
  listMyPurchasedStories,
} from "@/lib/marketplace.functions";
import { getMyCreatorRevenueRule } from "@/lib/revenue-rules.functions";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "내 라이브러리 — Lovetale" },
      { name: "description", content: "AI로 생성한 비공개 스토리들." },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMyUserStories);
  const del = useServerFn(deleteMyUserStory);
  const publish = useServerFn(publishUserStory);
  const unpublish = useServerFn(unpublishUserStory);
  const getRule = useServerFn(getMyCreatorRevenueRule);

  const [publishTarget, setPublishTarget] = useState<{ id: string; title: string; current: number } | null>(null);
  const [priceInput, setPriceInput] = useState<number>(10);
  const [audienceInput, setAudienceInput] = useState<"all" | "female" | "male">("all");
  const [heatInput, setHeatInput] = useState<"soft" | "warm" | "spicy" | "steamy">("warm");
  const [tagsInput, setTagsInput] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["my_user_stories"],
    queryFn: () => list(),
  });

  const fetchPurchased = useServerFn(listMyPurchasedStories);
  const { data: purchased } = useQuery({
    queryKey: ["my_purchased_stories"],
    queryFn: () => fetchPurchased(),
  });

  const { data: creatorRule } = useQuery({
    queryKey: ["my_creator_revenue_rule"],
    queryFn: () => getRule(),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("삭제됨");
      qc.invalidateQueries({ queryKey: ["my_user_stories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: (vars: {
      id: string;
      price: number;
      audience: "all" | "female" | "male";
      max_heat: "soft" | "warm" | "spicy" | "steamy";
      tags: string[];
    }) =>
      publish({
        data: {
          id: vars.id,
          price_credits: vars.price,
          audience: vars.audience,
          max_heat: vars.max_heat,
          tags: vars.tags,
        },
      }),
    onSuccess: () => {
      toast.success("마켓에 등록됐어요!");
      setPublishTarget(null);
      qc.invalidateQueries({ queryKey: ["my_user_stories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unpublishMut = useMutation({
    mutationFn: (id: string) => unpublish({ data: { id } }),
    onSuccess: () => {
      toast.success("마켓에서 내렸어요.");
      qc.invalidateQueries({ queryKey: ["my_user_stories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background to-background/80">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> 홈
          </Link>
          <h1 className="text-sm font-semibold">내 라이브러리</h1>
          <div className="flex items-center gap-3">
            <Link to="/marketplace" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <Store className="size-4" /> 마켓
            </Link>
            <Link to="/builder" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
              <Sparkles className="size-4" /> 새로 만들기
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        {/* Purchased stories */}
        {(purchased?.length ?? 0) > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                구매한 스토리 ({purchased!.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {purchased!.map((p) => (
                <Link
                  key={p.id}
                  to="/play/user/$id"
                  params={{ id: p.id }}
                  className="rounded-xl border border-border/60 bg-card/40 backdrop-blur p-3 flex gap-3 hover:border-primary/60 transition"
                >
                  {p.cover_url ? (
                    <CoverImage src={p.cover_url} alt={p.title} className="size-16 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="size-16 rounded-lg bg-gradient-to-br from-primary/20 to-card flex items-center justify-center shrink-0">
                      <BookOpen className="size-6 text-muted-foreground/60" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-semibold text-sm truncate">{p.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">@{p.author_name}</p>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Badge variant="secondary" className="text-[9px] gap-0.5">
                        <Coins className="size-2.5" /> {p.price_credits_paid}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground/70">
                        {new Date(p.purchased_at).toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* My created stories */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground">
                내가 만든 스토리 {data ? `(${data.length})` : ""}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground/80">
                발행하면 스토리마켓에 등록되고, 현재 내 수익공유율은 {creatorRule?.sharePercent ?? 70}%입니다.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/marketplace"><Store className="size-3.5 mr-1" /> 마켓 판매페이지</Link>
            </Button>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}

          {!isLoading && (data?.length ?? 0) === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center space-y-3">
              <BookOpen className="size-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">아직 만든 스토리가 없습니다.</p>
              <Button asChild>
                <Link to="/builder">
                  <Sparkles className="size-4 mr-1" /> 첫 스토리 만들기
                </Link>
              </Button>
            </div>
          )}

        <ul className="space-y-3">
          {data?.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-border/60 bg-card/60 backdrop-blur p-4 flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold truncate">{s.title}</h3>
                  {!s.is_listed ? (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Lock className="size-3" /> 비공개
                    </Badge>
                  ) : (
                    <Badge className="text-[10px] gap-0.5">
                      <Store className="size-3" /> 마켓 · {s.price_credits} 크레딧
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px] capitalize">{s.status}</Badge>
                </div>
                {s.logline && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{s.logline}</p>
                )}
                <p className="text-[10px] text-muted-foreground/70">
                  수정: {new Date(s.updated_at).toLocaleString("ko-KR")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0 w-24">
                <Button asChild size="sm">
                  <Link to="/play/user/$id" params={{ id: s.id }}>플레이</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/builder/$id" params={{ id: s.id }}>편집</Link>
                </Button>
                {!s.is_listed ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setPriceInput(s.price_credits || 10);
                      setPublishTarget({ id: s.id, title: s.title, current: s.price_credits || 10 });
                    }}
                  >
                    <Store className="size-3.5 mr-1" /> 발행
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={unpublishMut.isPending}
                    onClick={() => {
                      if (confirm("마켓에서 내릴까요?")) unpublishMut.mutate(s.id);
                    }}
                  >
                    내리기
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={delMut.isPending}
                  onClick={() => {
                    if (confirm("이 스토리를 삭제할까요?")) delMut.mutate(s.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        </section>
      </main>

      <Dialog open={!!publishTarget} onOpenChange={(o) => !o && setPublishTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>마켓에 발행</DialogTitle>
            <DialogDescription>
              {publishTarget?.title} — 가격을 정해주세요. 판매 시 작가에게 {creatorRule?.sharePercent ?? 70}%가 분배됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Coins className="size-3.5" /> 판매 가격 (크레딧)
              </label>
              <Input
                type="number"
                min={0}
                max={500}
                value={priceInput}
                onChange={(e) => setPriceInput(Number(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">
                0 = 무료 공개. 추천: 10–30 크레딧.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">대상 독자</label>
              <div className="flex gap-1.5">
                {(["all", "female", "male"] as const).map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={audienceInput === v ? "default" : "outline"}
                    onClick={() => setAudienceInput(v)}
                  >
                    {v === "all" ? "전체" : v === "female" ? "여성향" : "남성향"}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">최고 수위</label>
              <div className="flex gap-1.5">
                {(["soft", "warm", "spicy", "steamy"] as const).map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={heatInput === v ? "default" : "outline"}
                    onClick={() => setHeatInput(v)}
                  >
                    {v}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">테마 태그 (쉼표 구분, 최대 8개)</label>
              <Input
                value={tagsInput}
                placeholder="예: 오피스, 재회, 비밀연애"
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublishTarget(null)}>취소</Button>
            <Button
              disabled={publishMut.isPending}
              onClick={() => {
                if (publishTarget) {
                  const tags = tagsInput
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .slice(0, 8);
                  publishMut.mutate({
                    id: publishTarget.id,
                    price: Math.max(0, priceInput),
                    audience: audienceInput,
                    max_heat: heatInput,
                    tags,
                  });
                }
              }}
            >
              {publishMut.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
              마켓에 등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
