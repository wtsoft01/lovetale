import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { useState } from "react";
import { Loader2, ArrowLeft, Coins, BookOpen, Play, Check, Lock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoverImage } from "@/components/cover-image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getMarketplaceStory, purchaseStory, type HeatTier } from "@/lib/marketplace.functions";
import { getMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/marketplace/$id")({
  head: () => ({
    meta: [{ title: "스토리 상세 — Lovetale" }],
  }),
  component: MarketplaceDetailPage,
});

const HEAT_BADGE: Record<HeatTier, { label: string; className: string }> = {
  soft:   { label: "잔잔",   className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  warm:   { label: "따뜻",   className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  spicy:  { label: "설렘",   className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  steamy: { label: "뜨거움", className: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
};

// Preview only the very first line of the first beat. Truncate after this.
const PREVIEW_TEXT_LIMIT = 140;

function MarketplaceDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(getMarketplaceStory);
  const buy = useServerFn(purchaseStory);
  const fetchProfile = useServerFn(getMyProfile);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["marketplace_story", id],
    queryFn: () => get({ data: { id } }),
  });

  const { data: profile } = useQuery({
    queryKey: ["my_profile"],
    queryFn: () => fetchProfile(),
  });

  const buyMut = useMutation({
    mutationFn: () => buy({ data: { id } }),
    onSuccess: () => {
      toast.success("구매 완료! 라이브러리에 저장되고 바로 플레이할 수 있어요.");
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["marketplace_story", id] });
      qc.invalidateQueries({ queryKey: ["my_profile"] });
      qc.invalidateQueries({ queryKey: ["my_purchased_stories"] });
      // Auto-navigate to play
      navigate({ to: "/play/user/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-md py-20 text-center space-y-3">
        <p className="text-sm text-destructive">{(error as Error)?.message ?? "스토리를 찾을 수 없어요"}</p>
        <Button asChild variant="outline">
          <Link to="/marketplace">마켓으로</Link>
        </Button>
      </div>
    );
  }

  const canPlay = data.is_owner || data.purchased || data.price_credits === 0;
  const preview = data.preview as { text?: string; narration?: string; speaker?: string } | null;
  const character = data.character_card as { name?: string; personality?: string; appearance?: string } | null;
  const heat = HEAT_BADGE[(data.max_heat as HeatTier) ?? "soft"];

  const credits = profile?.credits ?? 0;
  const price = data.price_credits;
  const afterBalance = credits - price;
  const insufficient = afterBalance < 0;

  // Truncate preview text strictly
  const rawPreviewText = preview?.text ?? "";
  const previewText =
    rawPreviewText.length > PREVIEW_TEXT_LIMIT
      ? rawPreviewText.slice(0, PREVIEW_TEXT_LIMIT) + "…"
      : rawPreviewText;
  const previewNarration =
    preview?.narration && preview.narration.length > PREVIEW_TEXT_LIMIT
      ? preview.narration.slice(0, PREVIEW_TEXT_LIMIT) + "…"
      : preview?.narration ?? "";

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background to-background/80">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <Link to="/marketplace" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> 마켓
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="flex gap-5 flex-col sm:flex-row">
          {data.cover_url ? (
            <CoverImage
              src={data.cover_url}
              alt={data.title}
              className="w-full sm:w-48 aspect-[4/5] rounded-xl object-cover border border-border/60"
            />
          ) : (
            <div className="w-full sm:w-48 aspect-[4/5] rounded-xl bg-gradient-to-br from-primary/20 via-card to-card/60 flex items-center justify-center border border-border/60">
              <BookOpen className="size-12 text-muted-foreground/50" />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px]">@{data.author_name}</Badge>
                <Badge variant="secondary" className="text-[10px]">회차 {data.beats_count || 1}</Badge>
                <Badge variant="outline" className={`text-[10px] ${heat.className}`}>{heat.label}</Badge>
                {data.audience !== "all" && (
                  <Badge variant="outline" className="text-[10px]">
                    {data.audience === "female" ? "여성향" : "남성향"}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold">{data.title}</h1>
              {data.logline && (
                <p className="text-sm text-muted-foreground line-clamp-2">{data.logline}</p>
              )}
              {data.tags && data.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {data.tags.slice(0, 6).map((t) => (
                    <span key={t} className="text-[11px] text-muted-foreground">#{t}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border/60 p-3 bg-card/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-lg font-bold">
                  {price > 0 ? (
                    <><Coins className="size-5 text-primary" /> {price}</>
                  ) : (
                    <span className="text-emerald-500">무료</span>
                  )}
                </div>
                {canPlay ? (
                  <Button onClick={() => navigate({ to: "/play/user/$id", params: { id } })}>
                    <Play className="size-4 mr-1" /> 플레이
                  </Button>
                ) : (
                  <Button onClick={() => setConfirmOpen(true)}>
                    <Coins className="size-4 mr-1" /> 구매
                  </Button>
                )}
              </div>
              {(data.purchased || data.is_owner) && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-500 mt-2">
                  <Check className="size-3.5" /> {data.is_owner ? "내 스토리" : "보유 중"}
                </div>
              )}
            </div>
          </div>
        </div>

        {character?.name && (
          <section className="rounded-xl border border-border/60 bg-card/40 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">캐릭터</h2>
            <div className="space-y-1">
              <p className="font-semibold">{character.name}</p>
              {character.personality && (
                <p className="text-xs text-muted-foreground">{character.personality}</p>
              )}
              {character.appearance && (
                <p className="text-xs text-muted-foreground/80">{character.appearance}</p>
              )}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-border/60 bg-card/40 p-5 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">본문 미리보기</h2>
            <Badge variant="outline" className="text-[10px]">PREVIEW</Badge>
          </div>
          {previewNarration && (
            <p className="text-xs italic text-muted-foreground">{previewNarration}</p>
          )}
          {previewText && (
            <p className="text-sm leading-relaxed">
              {preview?.speaker && <span className="font-semibold text-primary">{preview.speaker}: </span>}
              {previewText}
            </p>
          )}
          {!canPlay && (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent" />
              <div className="relative pt-2 flex items-center gap-1.5 text-xs text-muted-foreground/80 border-t border-border/40">
                <Lock className="size-3.5" /> 본문 일부 · 나머지는 구매 후 공개
              </div>
            </>
          )}
        </section>
      </main>

      {/* Purchase confirmation modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="size-5 text-primary" /> 스토리 구매 확인
            </DialogTitle>
            <DialogDescription>
              결제 즉시 라이브러리에 영구 저장됩니다. 환불은 지원되지 않습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-border/60 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground truncate mr-2">{data.title}</span>
                <span className="text-muted-foreground text-xs">@{data.author_name}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">현재</span>
                <span className="flex items-center gap-1"><Coins className="size-3.5" /> {credits}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">결제</span>
                <span className="text-rose-400 font-medium">− {price}</span>
              </div>
              <div className="border-t border-border/60 pt-1.5 flex items-center justify-between text-sm">
                <span className="font-medium">잔액</span>
                <span className={`font-bold flex items-center gap-1 ${insufficient ? "text-destructive" : "text-emerald-400"}`}>
                  <Coins className="size-3.5" /> {afterBalance}
                </span>
              </div>
            </div>

            {insufficient && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                <span className="flex items-center gap-1.5"><AlertCircle className="size-4" /> {Math.abs(afterBalance)} 부족</span>
                <Button asChild size="sm" variant="outline" className="h-7">
                  <Link to="/premium">충전</Link>
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button
              disabled={buyMut.isPending || insufficient}
              onClick={() => buyMut.mutate()}
            >
              {buyMut.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
              <Coins className="size-4 mr-1" /> {price} 결제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
