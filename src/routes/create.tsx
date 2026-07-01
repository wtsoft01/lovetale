import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Check,
  Wand2,
  Heart,
  Flame,
  ShieldAlert,
  User,
  BookOpen,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "캐릭터 만들기 — Lovetale" },
      {
        name: "description",
        content:
          "외모, 성격, 시나리오, 19+ 설정까지 — 너만의 AI 연인을 빚어내세요.",
      },
    ],
  }),
  component: CreatePage,
});

type Step = 0 | 1 | 2 | 3;

const STEPS = [
  { id: 0, label: "기본 정보", icon: User, hint: "이름 · 성별 · 아바타" },
  { id: 1, label: "성격", icon: Heart, hint: "성향 슬라이더 · 말투" },
  { id: 2, label: "세계관", icon: BookOpen, hint: "배경 · 시나리오" },
  { id: 3, label: "19+ 설정", icon: ShieldAlert, hint: "성인 콘텐츠 옵션" },
] as const;

const ARCHETYPES = [
  { id: "tsundere", label: "츤데레", emoji: "🌸" },
  { id: "yandere", label: "얀데레", emoji: "🩸" },
  { id: "kuudere", label: "쿠데레", emoji: "❄️" },
  { id: "dandere", label: "단데레", emoji: "🌙" },
  { id: "himedere", label: "히메데레", emoji: "👑" },
  { id: "oneesan", label: "누나/언니", emoji: "🍷" },
];

const GENRES = [
  "현대 로맨스",
  "판타지",
  "학원물",
  "오피스",
  "사이버펑크",
  "이세계",
  "어반 호러",
  "다크 판타지",
];

const NSFW_TAGS = [
  "로맨틱",
  "센슈얼",
  "도미넌트",
  "서브미시브",
  "스위치",
  "버추얼 데이트",
  "비밀 연애",
  "성인 시나리오",
];

function CreatePage() {
  const [step, setStep] = useState<Step>(0);

  // Step 1
  const [name, setName] = useState("");
  const [gender, setGender] = useState("female");
  const [age, setAge] = useState("20대 초반");

  // Step 2
  const [archetype, setArchetype] = useState<string>("tsundere");
  const [warmth, setWarmth] = useState([60]);
  const [dominance, setDominance] = useState([40]);
  const [playfulness, setPlayfulness] = useState([70]);
  const [intelligence, setIntelligence] = useState([65]);
  const [dialogue, setDialogue] = useState("");

  // Step 3
  const [genre, setGenre] = useState("현대 로맨스");
  const [scenario, setScenario] = useState("");
  const [lore, setLore] = useState("");

  // Step 4
  const [nsfwEnabled, setNsfwEnabled] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);
  const [nsfwTags, setNsfwTags] = useState<string[]>([]);

  const progress = ((step + 1) / STEPS.length) * 100;

  const canNext = (() => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return dialogue.trim().length > 0;
    if (step === 2) return scenario.trim().length > 0;
    return true;
  })();

  function toggleNsfwTag(t: string) {
    setNsfwTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 lg:py-12">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Character Creator
          </div>
          <h1 className="font-display text-3xl font-semibold md:text-4xl">
            너만의 <span className="text-gradient">AI 연인</span>을 빚어내세요
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            4단계 위저드로 외모, 성격, 세계관, 그리고 은밀한 취향까지 — 단 몇
            분이면 완성됩니다.
          </p>
        </div>
        <Link
          to="/explore"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 탐색으로 돌아가기
        </Link>
      </div>

      {/* Stepper */}
      <div className="mb-8 rounded-2xl border border-border bg-surface-elevated/40 p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Step {step + 1} / {STEPS.length}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
          <div
            className="h-full rounded-full bg-gradient-aurora transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const active = step === s.id;
            const done = step > s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStep(s.id as Step)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                  active &&
                    "border-primary/60 bg-primary/10 shadow-[0_0_24px_-12px_hsl(var(--primary))]",
                  done && !active && "border-border bg-surface-elevated/60",
                  !active && !done && "border-border/60 text-muted-foreground",
                )}
              >
                <div
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                    active && "bg-gradient-aurora text-primary-foreground",
                    done && !active && "bg-primary/20 text-primary",
                    !active && !done && "bg-surface-elevated text-muted-foreground",
                  )}
                >
                  {done && !active ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{s.label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {s.hint}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Form */}
        <div className="rounded-2xl border border-border bg-surface-elevated/30 p-6 backdrop-blur-xl md:p-8">
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl font-semibold">기본 정보</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  캐릭터의 정체성을 정의하는 첫 단추입니다.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-[auto_1fr]">
                <div className="flex flex-col items-center gap-3">
                  <div className="grid h-32 w-32 place-items-center overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/20 via-violet-500/10 to-fuchsia-500/20 shadow-glow">
                    <Wand2 className="h-8 w-8 text-primary/80" />
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Upload className="h-3.5 w-3.5" /> 아바타 업로드
                  </Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">캐릭터 이름</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="예: 루나, 카이토, 사쿠라..."
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label>성별</Label>
                    <RadioGroup
                      value={gender}
                      onValueChange={setGender}
                      className="mt-2 grid grid-cols-3 gap-2"
                    >
                      {[
                        { v: "female", l: "여성" },
                        { v: "male", l: "남성" },
                        { v: "nonbinary", l: "논바이너리" },
                      ].map((o) => (
                        <label
                          key={o.v}
                          htmlFor={`g-${o.v}`}
                          className={cn(
                            "flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-sm transition",
                            gender === o.v
                              ? "border-primary/60 bg-primary/10 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <RadioGroupItem
                            id={`g-${o.v}`}
                            value={o.v}
                            className="sr-only"
                          />
                          {o.l}
                        </label>
                      ))}
                    </RadioGroup>
                  </div>

                  <div>
                    <Label>외모 연령대</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["10대 후반", "20대 초반", "20대 후반", "30대"].map(
                        (a) => (
                          <button
                            key={a}
                            onClick={() => setAge(a)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs transition",
                              age === a
                                ? "border-primary/60 bg-primary/15 text-foreground"
                                : "border-border text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {a}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl font-semibold">성격 디자인</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  아키타입 위에 슬라이더로 미세 조정하세요.
                </p>
              </div>

              <div>
                <Label>아키타입</Label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ARCHETYPES.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setArchetype(a.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition",
                        archetype === a.id
                          ? "border-primary/60 bg-primary/10 shadow-[0_0_20px_-12px_hsl(var(--primary))]"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className="text-lg">{a.emoji}</span>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-5 rounded-xl border border-border/60 bg-background/40 p-4">
                {[
                  { l: "따뜻함", v: warmth, s: setWarmth, lo: "차가움", hi: "다정함" },
                  {
                    l: "지배력",
                    v: dominance,
                    s: setDominance,
                    lo: "복종적",
                    hi: "지배적",
                  },
                  {
                    l: "장난기",
                    v: playfulness,
                    s: setPlayfulness,
                    lo: "진중",
                    hi: "장난꾸러기",
                  },
                  {
                    l: "지성",
                    v: intelligence,
                    s: setIntelligence,
                    lo: "직관형",
                    hi: "이성형",
                  },
                ].map((row) => (
                  <div key={row.l}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium">{row.l}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.v[0]}
                      </span>
                    </div>
                    <Slider
                      value={row.v}
                      onValueChange={row.s}
                      min={0}
                      max={100}
                      step={1}
                    />
                    <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>{row.lo}</span>
                      <span>{row.hi}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <Label htmlFor="dialogue">대표 대사 / 말투 샘플</Label>
                <Textarea
                  id="dialogue"
                  value={dialogue}
                  onChange={(e) => setDialogue(e.target.value)}
                  placeholder={`예) "...뭐, 별로 너 기다린 거 아니거든? 그냥 지나가다 들른 거야."`}
                  rows={4}
                  className="mt-1.5 font-mono text-sm"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  AI가 이 톤을 학습해 일관된 캐릭터성을 유지합니다.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl font-semibold">세계관 & 시나리오</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  너희가 만나는 무대를 설계하세요.
                </p>
              </div>

              <div>
                <Label>장르</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {GENRES.map((g) => (
                    <button
                      key={g}
                      onClick={() => setGenre(g)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition",
                        genre === g
                          ? "border-primary/60 bg-primary/15 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="scenario">시작 시나리오</Label>
                <Textarea
                  id="scenario"
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                  placeholder="예) 비 내리는 늦은 밤, 너는 그녀의 우산 속으로 들어선다..."
                  rows={4}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="lore">세계관 설정 (선택)</Label>
                <Textarea
                  id="lore"
                  value={lore}
                  onChange={(e) => setLore(e.target.value)}
                  placeholder="배경, 종족, 직업, 관계, 비밀 — AI가 기억할 모든 것."
                  rows={5}
                  className="mt-1.5"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="text-sm">
                  <div className="font-medium">19+ 콘텐츠 설정</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    이 영역의 옵션은 성인 인증을 완료한 사용자에게만 노출됩니다.
                    법령을 준수하는 범위 내에서만 작동합니다.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-4">
                <div>
                  <div className="text-sm font-medium">19+ 모드 활성화</div>
                  <p className="text-xs text-muted-foreground">
                    성인 시나리오와 NSFW 트리거를 허용합니다.
                  </p>
                </div>
                <Switch checked={nsfwEnabled} onCheckedChange={setNsfwEnabled} />
              </div>

              <div
                className={cn(
                  "space-y-5 rounded-xl border border-border bg-background/30 p-4 transition",
                  !nsfwEnabled && "pointer-events-none opacity-40",
                )}
              >
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Flame className="h-4 w-4 text-primary" /> 분위기 태그
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {NSFW_TAGS.map((t) => {
                      const on = nsfwTags.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => toggleNsfwTag(t)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs transition",
                            on
                              ? "border-primary/60 bg-primary/20 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-elevated/40 px-3 py-2.5">
                  <Label htmlFor="age-verified" className="text-sm">
                    본인은 만 19세 이상이며, 성인 인증을 완료했습니다.
                  </Label>
                  <Switch
                    id="age-verified"
                    checked={ageVerified}
                    onCheckedChange={setAgeVerified}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-8 flex items-center justify-between border-t border-border/60 pt-6">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}
              disabled={step === 0}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" /> 이전
            </Button>

            {step < 3 ? (
              <Button
                onClick={() => setStep((s) => Math.min(3, s + 1) as Step)}
                disabled={!canNext}
                className="gap-1.5 bg-gradient-aurora text-primary-foreground shadow-glow hover:opacity-90"
              >
                다음 <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                disabled={nsfwEnabled && !ageVerified}
                className="gap-1.5 bg-gradient-aurora text-primary-foreground shadow-glow hover:opacity-90"
              >
                <Sparkles className="h-4 w-4" /> 캐릭터 생성하기
              </Button>
            )}
          </div>
        </div>

        {/* Live preview */}
        <aside className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface-elevated/40 backdrop-blur-xl">
            <div className="relative aspect-[3/4] bg-gradient-to-br from-primary/30 via-violet-500/20 to-fuchsia-500/30">
              <div className="absolute inset-0 grid place-items-center">
                <Wand2 className="h-10 w-10 text-primary/70" />
              </div>
              {nsfwEnabled && (
                <Badge className="absolute right-3 top-3 border-destructive/60 bg-destructive/20 text-destructive-foreground backdrop-blur">
                  19+
                </Badge>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/70 to-transparent p-4">
                <div className="font-display text-lg font-semibold">
                  {name || "이름 없는 그/그녀"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {ARCHETYPES.find((a) => a.id === archetype)?.label} · {age} ·{" "}
                  {genre}
                </div>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  ["따뜻함", warmth[0]],
                  ["지배력", dominance[0]],
                  ["장난기", playfulness[0]],
                  ["지성", intelligence[0]],
                ].map(([l, v]) => (
                  <div
                    key={l as string}
                    className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-1.5"
                  >
                    <div className="text-muted-foreground">{l}</div>
                    <div className="text-sm font-medium text-foreground">{v}</div>
                  </div>
                ))}
              </div>
              {nsfwTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {nsfwTags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface-elevated/30 p-4 text-xs text-muted-foreground">
            <div className="mb-1.5 flex items-center gap-1.5 text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-medium">AI 자동 보완</span>
            </div>
            완성 시 외모 일러스트와 보이스 샘플이 자동으로 생성됩니다 (크레딧
            10).
          </div>
        </aside>
      </div>
    </div>
  );
}
