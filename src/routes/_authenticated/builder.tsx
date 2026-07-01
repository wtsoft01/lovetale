import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { Loader2, Sparkles, Wand2, Library, ArrowLeft, Lock, SlidersHorizontal, Store, FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { generateUserStory, BUILDER_PRICING } from "@/lib/story-builder.functions";

export const Route = createFileRoute("/_authenticated/builder")({
  head: () => ({
    meta: [
      { title: "AI 스토리 빌더 — Lovetale" },
      { name: "description", content: "당신의 시놉시스를 몰입형 인터랙티브 스토리로 변환합니다." },
    ],
  }),
  component: BuilderPage,
});

const SAMPLES = [
  "비 오는 밤, 헤어진 전 연인과 우연히 같은 술집에서 마주친다. 그녀는 여전히 내가 준 목걸이를 차고 있다.",
  "회사 옥상. 평소 까칠하던 사수가 야근 끝에 무너지듯 내 어깨에 기댄다. 그녀의 향수 냄새가 짙다.",
  "오랜 친구의 결혼식 전날 밤, 신부가 내 방문을 두드린다. 손에는 와인 한 병.",
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
      toast.success(`스토리가 생성되었습니다 (-${res.creditsCharged} 크레딧)`);
      qc.invalidateQueries({ queryKey: ["my_user_stories"] });
      qc.invalidateQueries({ queryKey: ["profile_balance"] });
      navigate({ to: "/builder/$id", params: { id: res.id } });
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "생성 실패");
    },
  });

  const len = prompt.trim().length;
  const ok = len >= 20 && len <= 100000;
  const nearLimit = len > 90000;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background to-background/80">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> 홈
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h1 className="text-sm font-semibold">AI 스토리 빌더</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/marketplace" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <Store className="size-4" /> 스토리마켓
            </Link>
            <Link to="/library" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <Library className="size-4" /> 라이브러리
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">내 이야기로 로맨스 만들기</h2>
            <Badge variant="secondary" className="gap-1"><FileText className="size-3" /> 최대 10만자</Badge>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            실제 경험담, 긴 원고, 시놉시스, 등장인물 설정을 넉넉하게 붙여넣으세요. AI가 편집 가능한
            인터랙티브 스토리로 정리하고, 완성 후 바로 스토리마켓 등록 흐름으로 이어집니다.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-4 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">제목 (선택)</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 비 오는 밤의 재회"
                maxLength={200}
                disabled={mut.isPending}
              />
            </div>

            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="원문, 실제 경험담, 캐릭터 설정, 장면 메모를 자유롭게 붙여넣으세요. 긴 텍스트도 스크롤하면서 편집할 수 있습니다."
              className="min-h-[430px] resize-y bg-background/40 border-border/60 text-base leading-relaxed lg:min-h-[560px]"
              maxLength={100000}
              disabled={mut.isPending}
            />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className={!ok || nearLimit ? "text-primary" : ""}>
              {len.toLocaleString()} / 100,000자 {len < 20 ? "(최소 20자)" : nearLimit ? "(제한에 가까워요)" : ""}
            </span>
            <span className="flex items-center gap-1">
              <Lock className="size-3" /> 비공개로 라이브러리에 저장됩니다
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={mut.isPending}
                onClick={() => setPrompt(s)}
                className="text-xs px-2.5 py-1 rounded-full border border-border/60 bg-background/30 text-muted-foreground hover:text-foreground hover:border-primary/40 transition disabled:opacity-50"
              >
                예시 ↗
              </button>
            ))}
          </div>

            {advanced && (
              <div className="rounded-xl border border-border/60 bg-background/30 p-3 space-y-3">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <SlidersHorizontal className="size-4 text-primary" /> 상세 설정
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">장면 개수</label>
                    <Input
                      type="number"
                      min={5}
                      max={14}
                      value={targetBeats}
                      onChange={(e) => setTargetBeats(Math.max(5, Math.min(14, Number(e.target.value) || 8)))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">분위기 강도</label>
                    <select
                      value={maxHeat}
                      onChange={(e) => setMaxHeat(e.target.value as typeof maxHeat)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="soft">잔잔하게</option>
                      <option value="warm">따뜻하게</option>
                      <option value="spicy">설레게</option>
                      <option value="steamy">뜨겁게</option>
                    </select>
                  </div>
                </div>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="원하는 분위기나 꼭 살리고 싶은 장면, 빼고 싶은 설정을 자유롭게 적어주세요."
                  maxLength={4000}
                  className="min-h-24 bg-background/40"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <div className="text-xs text-muted-foreground space-y-0.5">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">텍스트 장면</Badge>
                <span>-{BUILDER_PRICING.text} 크레딧</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">이미지 슬롯</Badge>
                <span>장면당 -{BUILDER_PRICING.perImageSlot} 크레딧</span>
              </div>
            </div>
              <Button
                size="lg"
                disabled={!ok || mut.isPending}
                onClick={() => mut.mutate()}
                className="gap-2"
              >
                {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                {mut.isPending ? "생성 중…" : "AI로 스토리 생성"}
              </Button>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card/50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">상세 설정</h3>
                  <p className="text-xs text-muted-foreground">장면 개수, 분위기, 작가 메모를 직접 조절하고 싶을 때 켜세요.</p>
                </div>
                <Button size="sm" variant={advanced ? "secondary" : "outline"} onClick={() => setAdvanced((v) => !v)}>
                  {advanced ? "켜짐" : "켜기"}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/50 p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><Store className="size-4 text-primary" /> 마켓 업로드 흐름</h3>
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li>1. 긴 원문을 붙여넣고 AI 초안을 생성</li>
                <li>2. 편집 화면에서 제목·장면·선택지를 다듬기</li>
                <li>3. 라이브러리에서 가격·태그·독자층 선택 후 등록</li>
              </ol>
              <Button asChild variant="outline" className="w-full">
                <Link to="/marketplace">스토리마켓 보기</Link>
              </Button>
            </div>
          </aside>
        </section>

        <section className="text-xs text-muted-foreground/80 space-y-1.5 px-1">
          <p>· 생성된 장면은 분기 3단계까지 자동으로 이어집니다.</p>
          <p>· 친밀한 선택지에는 호감도 조건이 자동으로 부여됩니다.</p>
          <p>· 긴 입력은 요약·한 줄 소개·캐릭터 카드로 자동 정리되며, 생성 후 편집 화면에서 바로 수정할 수 있습니다.</p>
          <p>· 라이브러리에서 검토 후 공개·마켓 등록을 결정합니다.</p>
        </section>
      </main>
    </div>
  );
}
