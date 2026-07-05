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
      { title: "자작스토리 | Lovetale" },
      {
        name: "description",
        content: "원고, PDF 내용, 캐릭터 설정을 멀티모달 인터랙티브 스토리로 제작합니다.",
      },
    ],
  }),
  component: BuilderPage,
});

const SAMPLES = [
  "비가 오던 밤, 오래전 헤어진 연인이 같은 대피소에 멈춰 섰다. 그는 아직도 내가 준 목걸이를 차고 있었다.",
  "퇴근길 엘리베이터 안, 늘 냉정하던 상사가 처음으로 흔들리는 표정을 보였다.",
  "결혼식 전날 밤, 가장 친한 친구의 약혼자가 마지막 부탁을 하기 위해 찾아왔다.",
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
      toast.success(`스토리가 생성되었습니다. (-${res.creditsCharged} 크레딧)`);
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
              스토리마켓
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
                최대 10만자
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Image className="size-3" />
                멀티모달
              </Badge>
            </div>
            <Button size="sm" variant={advanced ? "secondary" : "outline"} onClick={() => setAdvanced((value) => !value)}>
              <Settings2 className="mr-1 size-3.5" />
              설정
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
                    예시 {index + 1}
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
              <span className="text-muted-foreground">텍스트 생성</span>
              <span className="font-semibold">{BUILDER_PRICING.text}</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">이미지 슬롯</span>
              <span className="font-semibold">{BUILDER_PRICING.perImageSlot}/장면</span>
            </div>
          </div>

          <div className="rounded-3xl border border-border/60 bg-card/45 p-4">
            <div className="text-sm font-semibold">제작 흐름</div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">1</span>
              입력
              <span className="h-px flex-1 bg-border" />
              <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">2</span>
              편집
              <span className="h-px flex-1 bg-border" />
              <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">3</span>
              판매
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
