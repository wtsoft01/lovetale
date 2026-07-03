import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Coins, FileText, Image, Library, Loader2, Settings2, Store, WandSparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@/lib/_mock/runtime";
import { BUILDER_PRICING, generateUserStory } from "@/lib/story-builder.functions";

export const Route = createFileRoute("/_authenticated/builder")({
  head: () => ({
    meta: [
      { title: "?먯옉?ㅽ넗由?| Lovetale" },
      {
        name: "description",
        content: "?먭퀬, PDF ?댁슜, 罹먮┃???ㅼ젙??硫?곕え???명꽣?숉떚釉??ㅽ넗由щ줈 ?쒖옉?⑸땲??",
      },
    ],
  }),
  component: BuilderPage,
});

const SAMPLES = [
  "鍮꾧? ?ㅻ뒗 諛? ?ㅻ옒???ㅼ뼱吏??곗씤怨?媛숈? ??앹뿉??留덉＜移쒕떎. 洹몃뒗 ?꾩쭅???닿? 以 紐⑷구?대? 李④퀬 ?덈떎.",
  "?닿렐 ??硫덉텣 ?섎━踰좎씠?? ?됱냼 ?됱젙?섎뜕 ?곸궗媛 泥섏쓬?쇰줈 ?붾뱾由щ뒗 ?쒖젙??蹂댁씤??",
  "寃고샎???꾨궇 諛? 媛??移쒗븳 移쒓뎄???띾뫁?닿? 留덉?留?遺?곸쓣 ?꾪븯??李얠븘?⑤떎.",
];

function BuilderPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [notes, setNotes] = useState("");
  const [targetBeats, setTargetBeats] = useState(8);
  const [maxHeat, setMaxHeat] = useState<"soft" | "warm" | "spicy" | "steamy">("warm");
  const generate = useServerFn(generateUserStory);

  const mut = useMutation({
    mutationFn: () =>
      generate({
        data: {
          title: title.trim() || undefined,
          prompt: prompt.trim(),
          mode: advanced ? "advanced" : "simple",
          notes: advanced ? notes.trim() || undefined : undefined,
          targetBeats,
          maxHeat,
        },
      }),
    onSuccess: (res) => {
      toast.success(`?ㅽ넗由ш? ?앹꽦?섏뿀?듬땲??(-${res.creditsCharged} ?щ젅??`);
      qc.invalidateQueries({ queryKey: ["my_user_stories"] });
      qc.invalidateQueries({ queryKey: ["profile_balance"] });
      navigate({ to: "/builder/$id", params: { id: res.id } });
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "?앹꽦???ㅽ뙣?덉뒿?덈떎.");
    },
  });

  const len = prompt.trim().length;
  const ok = len >= 20 && len <= 100000;
  const nearLimit = len > 90000;

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            스토리탐색
          </Link>
          <div className="flex items-center gap-2">
            <WandSparkles className="size-4 text-primary" />
            <h1 className="text-sm font-semibold">자작스토리</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/library" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <Library className="size-4" />
              라이브러리
            </Link>
            <Link to="/marketplace" className="hidden items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
              <Store className="size-4" />
              留덉폆
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[1fr_280px]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 text-primary">
                <FileText className="size-3" />
                理쒕? 10留뚯옄
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Image className="size-3" />
                硫?곕え??              </Badge>
            </div>
            <Button size="sm" variant={advanced ? "secondary" : "outline"} onClick={() => setAdvanced((value) => !value)}>
              <Settings2 className="mr-1 size-3.5" />
              ?ㅼ젙
            </Button>
          </div>

          <div className="rounded-3xl border border-border/60 bg-card/45 p-4 backdrop-blur">
            <div className="space-y-3">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="제목"
                maxLength={200}
                disabled={mut.isPending}
                className="h-12 border-transparent bg-background/60 text-lg font-semibold focus-visible:ring-primary/40"
              />

              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="원고, PDF에서 복사한 글, 실제 경험, 캐릭터 설정을 붙여넣으세요."
                className="min-h-[520px] resize-y border-transparent bg-background/60 text-base leading-8 focus-visible:ring-primary/40"
                maxLength={100000}
                disabled={mut.isPending}
              />

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className={!ok || nearLimit ? "text-primary" : ""}>
                  {len.toLocaleString()} / 100,000{len > 0 && len < 20 ? " · 최소 20자" : nearLimit ? " · 제한에 가까워요" : ""}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Coins className="size-3 text-primary" />
                  기본 {BUILDER_PRICING.text} 크레딧
                </span>
              </div>
            </div>

            {advanced && (
              <div className="mt-4 grid gap-3 rounded-2xl border border-border/60 bg-background/35 p-3 md:grid-cols-[140px_160px_1fr]">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">장면 수</label>
                  <Input
                    type="number"
                    min={5}
                    max={14}
                    value={targetBeats}
                    onChange={(event) => setTargetBeats(Math.max(5, Math.min(14, Number(event.target.value) || 8)))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">분위기</label>
                  <select
                    value={maxHeat}
                    onChange={(event) => setMaxHeat(event.target.value as typeof maxHeat)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="soft">Soft</option>
                    <option value="warm">Warm</option>
                    <option value="spicy">Spicy</option>
                    <option value="steamy">Steamy</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">메모</label>
                  <Input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="꼭 살릴 장면, 금지 표현, 캐릭터 메모"
                    maxLength={4000}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3 border-t border-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {SAMPLES.map((sample, index) => (
                  <button
                    key={sample}
                    type="button"
                    disabled={mut.isPending}
                    onClick={() => setPrompt(sample)}
                    className="rounded-full border border-border/60 bg-background/40 px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                  >
                    ?덉떆 {index + 1}
                  </button>
                ))}
              </div>
              <Button size="lg" disabled={!ok || mut.isPending} onClick={() => mut.mutate()} className="gap-2 sm:min-w-44">
                {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
                {mut.isPending ? "생성 중" : "생성"}
              </Button>
            </div>
          </div>
        </section>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <MiniAction href="/library" icon={Library} title="라이브러리" />
          <MiniAction href="/marketplace" icon={Store} title="스토리마켓" />

          <div className="rounded-3xl border border-border/60 bg-card/45 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">?띿뒪???앹꽦</span>
              <span className="font-semibold">{BUILDER_PRICING.text}</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">?대?吏 ?щ’</span>
              <span className="font-semibold">{BUILDER_PRICING.perImageSlot}/?λ㈃</span>
            </div>
          </div>

          <div className="rounded-3xl border border-border/60 bg-card/45 p-4">
            <div className="text-sm font-semibold">?쒖옉 ?먮쫫</div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">1</span>
              ?낅젰
              <span className="h-px flex-1 bg-border" />
              <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">2</span>
              ?몄쭛
              <span className="h-px flex-1 bg-border" />
              <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">3</span>
              ?먮ℓ
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function MiniAction({
  href,
  icon: Icon,
  title,
}: {
  href: "/library" | "/marketplace";
  icon: typeof Library;
  title: string;
}) {
  return (
    <Link
      to={href}
      className="flex items-center justify-between rounded-3xl border border-border/60 bg-card/45 px-4 py-3 text-sm transition hover:border-primary/50"
    >
      <span className="inline-flex items-center gap-2 font-medium">
        <Icon className="size-4 text-primary" />
        {title}
      </span>
      <span className="text-muted-foreground">›</span>
    </Link>
  );
}
