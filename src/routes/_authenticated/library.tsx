import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { ArrowLeft, BookOpen, Coins, Library, Loader2, Lock, Pencil, Play, Plus, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoverImage } from "@/components/cover-image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@/lib/_mock/runtime";
import { deleteMyUserStory, listMyUserStories } from "@/lib/story-builder.functions";
import { listMyPurchasedStories, publishUserStory, unpublishUserStory } from "@/lib/marketplace.functions";
import { getMyCreatorRevenueRule } from "@/lib/revenue-rules.functions";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "라이브러리 | Lovetale" },
      { name: "description", content: "구매한 스토리, 자작스토리, 판매 중인 작품을 관리합니다." },
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
  const fetchPurchased = useServerFn(listMyPurchasedStories);
  const getRule = useServerFn(getMyCreatorRevenueRule);

  const [publishTarget, setPublishTarget] = useState<{ id: string; title: string; current: number } | null>(null);
  const [priceInput, setPriceInput] = useState<number>(10);
  const [audienceInput, setAudienceInput] = useState<"all" | "female" | "male">("all");
  const [heatInput, setHeatInput] = useState<"soft" | "warm" | "spicy" | "steamy">("warm");
  const [tagsInput, setTagsInput] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["my_user_stories"],
    queryFn: () => list(),
  });
  const { data: purchased, isLoading: purchasedLoading } = useQuery({
    queryKey: ["my_purchased_stories"],
    queryFn: () => fetchPurchased(),
  });
  const { data: creatorRule } = useQuery({
    queryKey: ["my_creator_revenue_rule"],
    queryFn: () => getRule(),
  });

  const created = data ?? [];
  const listedCount = created.filter((story) => story.is_listed).length;
  const draftCount = created.length - listedCount;

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("삭제되었습니다.");
      qc.invalidateQueries({ queryKey: ["my_user_stories"] });
    },
    onError: (error: Error) => toast.error(error.message),
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
      toast.success("스토리마켓에 등록되었습니다.");
      setPublishTarget(null);
      qc.invalidateQueries({ queryKey: ["my_user_stories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unpublishMut = useMutation({
    mutationFn: (id: string) => unpublish({ data: { id } }),
    onSuccess: () => {
      toast.success("스토리마켓에서 내렸습니다.");
      qc.invalidateQueries({ queryKey: ["my_user_stories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            스토리탐색
          </Link>
          <div className="flex items-center gap-2">
            <Library className="size-4 text-primary" />
            <h1 className="text-sm font-semibold">라이브러리</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/builder" className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80">
              <Plus className="size-4" />
              자작스토리
            </Link>
            <Link to="/marketplace" className="hidden items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
              <Store className="size-4" />
              스토리마켓
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="구매" value={purchased?.length ?? 0} />
          <StatCard label="제작" value={created.length} />
          <StatCard label="판매중" value={listedCount} hint={draftCount ? `비공개 ${draftCount}` : undefined} />
        </div>

        <section className="space-y-3">
          <SectionTitle title="구매한 스토리" count={purchased?.length ?? 0} />
          {purchasedLoading ? (
            <LoadingRow />
          ) : (purchased?.length ?? 0) === 0 ? (
            <EmptyState icon={BookOpen} text="구매한 스토리가 없습니다." actionLabel="마켓 보기" href="/marketplace" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {purchased!.map((story) => (
                <Link
                  key={story.id}
                  to="/play/user/$id"
                  params={{ id: story.id }}
                  className="group flex gap-3 rounded-3xl border border-border/60 bg-card/45 p-3 transition hover:border-primary/50"
                >
                  <StoryThumb src={story.cover_url} title={story.title} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="truncate text-sm font-semibold group-hover:text-primary">{story.title}</h3>
                    <p className="truncate text-xs text-muted-foreground">@{story.author_name}</p>
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Coins className="size-3" />
                      {story.price_credits_paid}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <SectionTitle title="내 자작스토리" count={created.length} />
          {isLoading ? (
            <LoadingRow />
          ) : created.length === 0 ? (
            <EmptyState icon={Plus} text="아직 만든 스토리가 없습니다." actionLabel="만들기" href="/builder" />
          ) : (
            <div className="grid gap-3">
              {created.map((story) => (
                <article key={story.id} className="rounded-3xl border border-border/60 bg-card/45 p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">{story.title}</h3>
                        {story.is_listed ? (
                          <Badge className="gap-1 text-[10px]">
                            <Store className="size-3" />
                            {story.price_credits} 크레딧
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Lock className="size-3" />
                            비공개
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {story.status}
                        </Badge>
                      </div>
                      {story.logline && <p className="line-clamp-2 text-sm text-muted-foreground">{story.logline}</p>}
                      <p className="text-[10px] text-muted-foreground/70">
                        {new Date(story.updated_at).toLocaleDateString("ko-KR")}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/play/user/$id" params={{ id: story.id }}>
                          <Play className="mr-1 size-3.5" />
                          보기
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/builder/$id" params={{ id: story.id }}>
                          <Pencil className="mr-1 size-3.5" />
                          편집
                        </Link>
                      </Button>
                      {story.is_listed ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={unpublishMut.isPending}
                          onClick={() => {
                            if (confirm("스토리마켓에서 내릴까요?")) unpublishMut.mutate(story.id);
                          }}
                        >
                          내리기
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setPriceInput(story.price_credits || 10);
                            setPublishTarget({ id: story.id, title: story.title, current: story.price_credits || 10 });
                          }}
                        >
                          <Store className="mr-1 size-3.5" />
                          판매
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={delMut.isPending}
                        onClick={() => {
                          if (confirm("이 스토리를 삭제할까요?")) delMut.mutate(story.id);
                        }}
                        aria-label="스토리 삭제"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <Dialog open={!!publishTarget} onOpenChange={(open) => !open && setPublishTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>스토리마켓에 판매</DialogTitle>
            <DialogDescription>
              판매 수익의 {creatorRule?.sharePercent ?? 70}%가 작가에게 배분됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="가격">
              <Input
                type="number"
                min={0}
                max={500}
                value={priceInput}
                onChange={(event) => setPriceInput(Number(event.target.value))}
              />
            </Field>

            <Field label="대상">
              <Segmented
                value={audienceInput}
                values={[
                  ["all", "전체"],
                  ["female", "여성향"],
                  ["male", "남성향"],
                ]}
                onChange={(value) => setAudienceInput(value as typeof audienceInput)}
              />
            </Field>

            <Field label="수위">
              <Segmented
                value={heatInput}
                values={[
                  ["soft", "Soft"],
                  ["warm", "Warm"],
                  ["spicy", "Spicy"],
                  ["steamy", "Steamy"],
                ]}
                onChange={(value) => setHeatInput(value as typeof heatInput)}
              />
            </Field>

            <Field label="태그">
              <Input value={tagsInput} placeholder="스파이, 후회, 비밀계약" onChange={(event) => setTagsInput(event.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublishTarget(null)}>
              취소
            </Button>
            <Button
              disabled={publishMut.isPending}
              onClick={() => {
                if (!publishTarget) return;
                const tags = tagsInput
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean)
                  .slice(0, 8);
                publishMut.mutate({
                  id: publishTarget.id,
                  price: Math.max(0, priceInput),
                  audience: audienceInput,
                  max_heat: heatInput,
                  tags,
                });
              }}
            >
              {publishMut.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
              판매 등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card/45 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <Badge variant="secondary" className="text-[10px]">
        {count}
      </Badge>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  text,
  actionLabel,
  href,
}: {
  icon: ComponentType<{ className?: string }>;
  text: string;
  actionLabel: string;
  href: "/builder" | "/marketplace";
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border/60 p-10 text-center">
      <Icon className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
      <Button asChild className="mt-4" size="sm">
        <Link to={href}>{actionLabel}</Link>
      </Button>
    </div>
  );
}

function StoryThumb({ src, title }: { src: string | null; title: string }) {
  if (src) {
    return <CoverImage src={src} alt={title} className="size-16 shrink-0 rounded-2xl object-cover" />;
  }
  return (
    <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-card">
      <BookOpen className="size-6 text-muted-foreground/60" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Segmented({
  value,
  values,
  onChange,
}: {
  value: string;
  values: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map(([key, label]) => (
        <Button key={key} type="button" size="sm" variant={value === key ? "default" : "outline"} onClick={() => onChange(key)}>
          {label}
        </Button>
      ))}
    </div>
  );
}
