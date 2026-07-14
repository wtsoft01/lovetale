import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import {
  Loader2,
  ArrowLeft,
  Save,
  Eye,
  Pencil,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Play as PlayIcon,
  Flame,
  Sparkles,
  ImageIcon,
  RotateCcw,
  Undo2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { fetchWithSupabaseAuth } from "@/lib/supabase-auth-fetch";
import {
  generateCharacterAssetPreview,
  getMyUserStory,
  updateMyUserStory,
} from "@/lib/story-builder.functions";
import type { Emotion } from "@/lib/mock/story";
import { HEAT_TIERS, type HeatTier } from "@/lib/heat-tier";
import { BeatReader, type ReaderBeat } from "@/components/beat-reader";

export const Route = createFileRoute("/_authenticated/builder/$id")({
  head: () => ({
    meta: [{ title: "스토리 편집 — Lovetale" }],
  }),
  component: BuilderEditPage,
});

type Choice = {
  label: string;
  next: string;
  emotion?: Emotion;
  affection?: number;
  requireAffection?: number;
  lockedHint?: string;
};
type Beat = ReaderBeat & {
  choices?: Choice[];
};
type CharacterCard = {
  name?: string;
  age?: string;
  personality?: string;
  speakingStyle?: string;
  appearance?: string;
};

const EMOTIONS: Emotion[] = ["calm", "shy", "happy", "sad", "passion", "tense"];

type AssistMode = "keep" | "dramatic" | "polish" | "expand";
type AssistScope = "active" | "all";
type BeatSnapshot = {
  label: string;
  beats: Beat[];
  activeIdx: number;
  createdAt: string;
};

const ASSIST_MODE_OPTIONS: Array<{ value: AssistMode; label: string }> = [
  { value: "dramatic", label: "자극적 각색" },
  { value: "expand", label: "추천으로 분량 채우기" },
  { value: "polish", label: "맞춤법/가독성" },
  { value: "keep", label: "원문 그대로" },
];

function cloneBeats(rows: Beat[]) {
  return JSON.parse(JSON.stringify(rows)) as Beat[];
}

function splitTextForBeats(text: string, count: number) {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned || count <= 0) return [];
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const source = paragraphs.length > 1
    ? paragraphs
    : cleaned
        .split(/(?<=[.!?。！？])\s+|\n+/)
        .map((part) => part.trim())
        .filter(Boolean);
  const chunks = source.length ? source : [cleaned];
  if (count === 1) return [cleaned];
  if (chunks.length <= count) return chunks;
  const grouped = Array.from({ length: count }, () => [] as string[]);
  chunks.forEach((chunk, index) => {
    const groupIndex = Math.min(count - 1, Math.floor((index * count) / chunks.length));
    grouped[groupIndex].push(chunk);
  });
  return grouped.map((parts) => parts.join("\n\n"));
}

function applySourceTextToBeats(template: Beat[], sourceText?: string | null) {
  const parts = splitTextForBeats(sourceText ?? "", template.length);
  if (!parts.length) return cloneBeats(template);
  return template.map((beat, index) => ({
    ...beat,
    text: parts[index] || beat.text,
    narration: parts[index] || beat.narration,
  }));
}

function buildBodyText(rows: Beat[]) {
  return rows
    .map((beat, index) => {
      const body = (beat.narration || beat.text || "").trim();
      if (!body) return "";
      const speaker = beat.speaker?.trim();
      return [`# ${index + 1}. ${beat.id}`, speaker ? `화자: ${speaker}` : "", body].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function historyLabel(mode: AssistMode, scope: AssistScope) {
  const label = ASSIST_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? "AI 편집";
  return `${label} 적용 전 (${scope === "active" ? "현재 비트" : "전체"})`;
}

function BuilderEditPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchStory = useServerFn(getMyUserStory);
  const saveStory = useServerFn(updateMyUserStory);
  const generateCharacterImage = useServerFn(generateCharacterAssetPreview);

  const { data, isLoading, error } = useQuery({
    queryKey: ["user_story", id],
    queryFn: () => fetchStory({ data: { id } }),
  });

  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [character, setCharacter] = useState<CharacterCard>({});
  const [beats, setBeats] = useState<Beat[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [assistMode, setAssistMode] = useState<AssistMode>("dramatic");
  const [assistScope, setAssistScope] = useState<AssistScope>("active");
  const [assistNote, setAssistNote] = useState("");
  const [history, setHistory] = useState<BeatSnapshot[]>([]);
  const originalBeatsRef = useRef<Beat[]>([]);

  // hydrate when data arrives
  useEffect(() => {
    if (!data) return;
    setTitle(data.title ?? "");
    setLogline(data.logline ?? "");
    setCoverUrl(data.cover_url ?? null);
    setCharacter((data.character_card as CharacterCard) ?? {});
    const arr = Array.isArray(data.beats) ? (data.beats as Beat[]) : [];
    setBeats(arr);
    originalBeatsRef.current = applySourceTextToBeats(arr, data.source_prompt || data.body_text);
    setActiveIdx(0);
    setHistory([]);
    setDirty(false);
  }, [data]);

  const beatMap = useMemo<Record<string, Beat>>(() => {
    const m: Record<string, Beat> = {};
    for (const b of beats) m[b.id] = b;
    return m;
  }, [beats]);

  const beatIds = beats.map((b) => b.id);
  const active: Beat | undefined = beats[activeIdx];

  function markDirty() {
    setDirty(true);
  }

  function pushHistory(label: string, source = beats, sourceActiveIdx = activeIdx) {
    setHistory((prev) => [
      {
        label,
        beats: cloneBeats(source),
        activeIdx: sourceActiveIdx,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ].slice(0, 12));
  }

  function restoreSnapshot(snapshot: BeatSnapshot, removeFromHistory = false) {
    setBeats(cloneBeats(snapshot.beats));
    setActiveIdx(Math.min(snapshot.activeIdx, Math.max(0, snapshot.beats.length - 1)));
    if (removeFromHistory) {
      setHistory((prev) => prev.filter((item) => item !== snapshot));
    }
    setDirty(true);
  }

  function undoLatest() {
    const snapshot = history[0];
    if (!snapshot) {
      toast.info("되돌릴 이전 글이 없습니다.");
      return;
    }
    restoreSnapshot(snapshot, true);
    toast.success("이전 글로 되돌렸습니다.");
  }

  function restoreOriginal(scope: AssistScope = assistScope) {
    const original = originalBeatsRef.current;
    if (!original.length) {
      toast.info("복원할 원문이 없습니다.");
      return;
    }
    pushHistory("원문 복원 전");
    if (scope === "active") {
      const originalBeat = original[activeIdx];
      if (!active || !originalBeat) return;
      setBeats((prev) => prev.map((beat, index) => (index === activeIdx ? { ...beat, text: originalBeat.text, narration: originalBeat.narration } : beat)));
    } else {
      setBeats((prev) =>
        prev.map((beat, index) => {
          const originalBeat = original[index];
          return originalBeat ? { ...beat, text: originalBeat.text, narration: originalBeat.narration } : beat;
        }),
      );
    }
    markDirty();
    toast.success(scope === "active" ? "현재 비트를 원문으로 돌렸습니다." : "전체 비트를 원문으로 돌렸습니다.");
  }

  function patchActive(p: Partial<Beat>) {
    setBeats((prev) => prev.map((b, i) => (i === activeIdx ? { ...b, ...p } : b)));
    markDirty();
  }

  function patchChoice(ci: number, p: Partial<Choice>) {
    setBeats((prev) =>
      prev.map((b, i) => {
        if (i !== activeIdx) return b;
        const choices = [...(b.choices ?? [])];
        choices[ci] = { ...choices[ci], ...p };
        return { ...b, choices };
      }),
    );
    markDirty();
  }

  function addChoice() {
    setBeats((prev) =>
      prev.map((b, i) => {
        if (i !== activeIdx) return b;
        const choices = [...(b.choices ?? [])];
        choices.push({ label: "새 선택지", next: beatIds[0] ?? "start", affection: 1, emotion: "calm" });
        return { ...b, choices };
      }),
    );
    markDirty();
  }

  function removeChoice(ci: number) {
    setBeats((prev) =>
      prev.map((b, i) => {
        if (i !== activeIdx) return b;
        const choices = (b.choices ?? []).filter((_, idx) => idx !== ci);
        return { ...b, choices };
      }),
    );
    markDirty();
  }

  function move(dir: -1 | 1) {
    setBeats((prev) => {
      const j = activeIdx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      const [m] = copy.splice(activeIdx, 1);
      copy.splice(j, 0, m);
      setActiveIdx(j);
      return copy;
    });
    markDirty();
  }

  function addBeat() {
    const newId = `beat_${Date.now().toString(36)}`;
    setBeats((prev) => [
      ...prev,
      {
        id: newId,
        text: "새 비트",
        emotion: "calm",
        heatTier: "soft",
        imagePrompt: "",
        choices: [],
      },
    ]);
    setActiveIdx(beats.length);
    markDirty();
  }

  function removeActive() {
    if (!active) return;
    if (beats.length <= 1) {
      toast.error("최소 1개 비트는 남아야 합니다.");
      return;
    }
    if (!confirm(`"${active.id}" 비트를 삭제할까요?`)) return;
    setBeats((prev) => prev.filter((_, i) => i !== activeIdx));
    setActiveIdx(Math.max(0, activeIdx - 1));
    markDirty();
  }

  const save = useMutation({
    mutationFn: () =>
      saveStory({
        data: {
          id,
          title,
          logline,
          character_card: character,
          beats,
          body_text: buildBodyText(beats),
          cover_url: coverUrl,
        },
      }),
    onSuccess: () => {
      toast.success("저장됨");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["user_story", id] });
      qc.invalidateQueries({ queryKey: ["my_user_stories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const writingAssist = useMutation({
    mutationFn: async () => {
      if (assistMode === "keep") {
        return { mode: assistMode as AssistMode, restoredOriginal: true };
      }
      if (assistScope === "active" && !active) throw new Error("편집할 비트를 먼저 선택하세요.");
      const before = cloneBeats(beats);
      const beforeActiveIdx = activeIdx;
      const targetBeats = assistScope === "active" && active ? [active] : beats;
      const body =
        assistScope === "active"
          ? {
              storyId: id,
              mode: assistMode,
              title,
              logline,
              character,
              note: assistNote,
              beat: {
                id: active!.id,
                text: active!.text,
                narration: active!.narration,
              },
            }
          : {
              storyId: id,
              mode: assistMode,
              title,
              logline,
              character,
              note: assistNote,
              beats: targetBeats.map((beat) => ({
                id: beat.id,
                text: beat.text,
                narration: beat.narration,
              })),
            };
      const response = await fetchWithSupabaseAuth("/api/story-writing-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || payload?.reason || "AI 글쓰기 도움을 적용하지 못했습니다.");
      }
      return { payload, before, beforeActiveIdx, mode: assistMode, scope: assistScope };
    },
    onSuccess: (result) => {
      if (result.restoredOriginal) {
        restoreOriginal();
        return;
      }
      pushHistory(historyLabel(result.mode, result.scope), result.before, result.beforeActiveIdx);
      if (result.scope === "active") {
        setBeats((prev) =>
          prev.map((beat, index) =>
            index === result.beforeActiveIdx
              ? {
                  ...beat,
                  text: result.payload.text || beat.text,
                  narration: result.payload.narration || beat.narration,
                }
              : beat,
          ),
        );
      } else {
        const byId = new Map((result.payload.beats ?? []).map((beat: any) => [beat.id, beat]));
        setBeats((prev) =>
          prev.map((beat) => {
            const next = byId.get(beat.id) as { text?: string; narration?: string } | undefined;
            return next
              ? {
                  ...beat,
                  text: next.text || beat.text,
                  narration: next.narration || beat.narration,
                }
              : beat;
          }),
        );
      }
      setDirty(true);
      toast.success(`${ASSIST_MODE_OPTIONS.find((option) => option.value === result.mode)?.label ?? "AI 편집"} 적용 완료`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateAsset = useMutation({
    mutationFn: () =>
      generateCharacterImage({
        data: {
          storyId: id,
          character: {
            name: character.name ?? title,
            age: character.age,
            personality: character.personality ?? "romantic visual novel lead",
            speakingStyle: character.speakingStyle ?? "soft and expressive",
            appearance: character.appearance ?? "adult original character portrait",
          },
        },
      }),
    onSuccess: (res) => {
      setCoverUrl(res.url);
      toast.success("캐릭터 이미지 생성 완료");
      qc.invalidateQueries({ queryKey: ["user_story", id] });
      qc.invalidateQueries({ queryKey: ["my_user_stories"] });
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
  if (error) {
    return (
      <div className="mx-auto max-w-md py-20 text-center space-y-3">
        <p className="text-sm text-destructive">{(error as Error).message}</p>
        <Button asChild variant="outline">
          <Link to="/library">라이브러리로</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background to-background/80">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-2">
          <Link
            to="/library"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ArrowLeft className="size-4" /> 라이브러리
          </Link>
          <div className="flex-1 px-3 min-w-0">
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                markDirty();
              }}
              className="h-8 text-sm font-semibold border-transparent bg-transparent focus-visible:bg-card/40"
              placeholder="제목"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={mode === "edit" ? "secondary" : "ghost"}
              onClick={() => setMode("edit")}
            >
              <Pencil className="size-3.5 mr-1" /> 편집
            </Button>
            <Button
              size="sm"
              variant={mode === "preview" ? "secondary" : "ghost"}
              onClick={() => setMode("preview")}
            >
              <Eye className="size-3.5 mr-1" /> 프리뷰
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate({ to: "/play/user/$id", params: { id } })}
              disabled={dirty}
              title={dirty ? "먼저 저장하세요" : "전체화면 플레이"}
            >
              <PlayIcon className="size-3.5 mr-1" /> 플레이
            </Button>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
            >
              {save.isPending ? (
                <Loader2 className="size-3.5 animate-spin mr-1" />
              ) : (
                <Save className="size-3.5 mr-1" />
              )}
              저장
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {mode === "preview" ? (
          <div className="max-w-3xl mx-auto">
            <BeatReader beats={beatMap} title={title} cover={coverUrl ?? undefined} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_360px] gap-4">
            {/* Beat list */}
            <aside className="rounded-xl border border-border/60 bg-card/40 backdrop-blur p-2 space-y-1 max-h-[calc(100dvh-7rem)] overflow-y-auto">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  비트 ({beats.length})
                </span>
                <Button size="sm" variant="ghost" onClick={addBeat}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <ul className="space-y-1">
                {beats.map((b, i) => (
                  <li key={b.id}>
                    <button
                      onClick={() => setActiveIdx(i)}
                      className={cn(
                        "w-full text-left px-2.5 py-2 rounded-lg text-xs transition",
                        i === activeIdx
                          ? "bg-primary/15 border border-primary/40"
                          : "hover:bg-card/80 border border-transparent",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate font-medium">{b.id}</span>
                        {b.end && (
                          <Badge variant="outline" className="text-[9px] ml-auto">
                            END
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 truncate text-muted-foreground">{b.text}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            {/* Active beat editor */}
            {active && (
              <section className="rounded-xl border border-border/60 bg-card/40 backdrop-blur p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Input
                    value={active.id}
                    onChange={(e) => patchActive({ id: e.target.value.replace(/\s+/g, "_") })}
                    className="h-8 font-mono text-xs max-w-[200px]"
                    placeholder="beat id"
                  />
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => move(-1)} disabled={activeIdx === 0}>
                      <ChevronUp className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => move(1)} disabled={activeIdx === beats.length - 1}>
                      <ChevronDown className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={removeActive}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">화자 (선택)</Label>
                    <Input
                      value={active.speaker ?? ""}
                      onChange={(e) => patchActive({ speaker: e.target.value })}
                      className="h-9 mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">본문</Label>
                    <Textarea
                      value={active.text}
                      onChange={(e) => patchActive({ text: e.target.value })}
                      rows={8}
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">서술 / 지문 (선택)</Label>
                    <Textarea
                      value={active.narration ?? ""}
                      onChange={(e) => patchActive({ narration: e.target.value })}
                      rows={2}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">감정</Label>
                    <Select
                      value={active.emotion}
                      onValueChange={(v: Emotion) => patchActive({ emotion: v })}
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMOTIONS.map((e) => (
                          <SelectItem key={e} value={e}>{e}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <Flame className="size-3 text-rose-400" /> Heat Tier
                    </Label>
                    <Select
                      value={active.heatTier ?? "soft"}
                      onValueChange={(v: HeatTier["key"]) => patchActive({ heatTier: v })}
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HEAT_TIERS.map((t) => (
                          <SelectItem key={t.key} value={t.key}>
                            {t.badge} {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">이미지 프롬프트 (영문 권장)</Label>
                    <Textarea
                      value={active.imagePrompt ?? ""}
                      onChange={(e) => patchActive({ imagePrompt: e.target.value })}
                      rows={2}
                      className="mt-1 font-mono text-xs"
                      placeholder="cinematic close-up, soft rim light, …"
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={!!active.end}
                        onChange={(e) => patchActive({ end: e.target.checked })}
                      />
                      엔딩 비트로 표시
                    </label>
                  </div>
                </div>

                {/* Choices */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      선택지 ({(active.choices ?? []).length})
                    </Label>
                    <Button size="sm" variant="outline" onClick={addChoice} disabled={!!active.end}>
                      <Plus className="size-3.5 mr-1" /> 추가
                    </Button>
                  </div>

                  {(active.choices ?? []).map((c, ci) => (
                    <div
                      key={ci}
                      className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <Input
                          value={c.label}
                          onChange={(e) => patchChoice(ci, { label: e.target.value })}
                          className="h-8 text-sm flex-1"
                          placeholder="선택지 텍스트"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeChoice(ci)}
                          title="삭제"
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px]">다음 비트</Label>
                          <Select
                            value={c.next}
                            onValueChange={(v) => patchChoice(ci, { next: v })}
                          >
                            <SelectTrigger className="mt-1 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {beatIds.map((bid) => (
                                <SelectItem key={bid} value={bid}>{bid}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px]">감정</Label>
                          <Select
                            value={c.emotion ?? "calm"}
                            onValueChange={(v: Emotion) => patchChoice(ci, { emotion: v })}
                          >
                            <SelectTrigger className="mt-1 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EMOTIONS.map((e) => (
                                <SelectItem key={e} value={e}>{e}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px]">
                          호감도 변화 ({c.affection ?? 0})
                        </Label>
                        <Slider
                          value={[c.affection ?? 0]}
                          min={-3}
                          max={5}
                          step={1}
                          onValueChange={(v) => patchChoice(ci, { affection: v[0] })}
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">
                          잠금 임계값 requireAffection ({c.requireAffection ?? 0})
                        </Label>
                        <Slider
                          value={[c.requireAffection ?? 0]}
                          min={0}
                          max={100}
                          step={5}
                          onValueChange={(v) => patchChoice(ci, { requireAffection: v[0] })}
                          className="mt-2"
                        />
                        {(c.requireAffection ?? 0) > 0 && (
                          <Input
                            value={c.lockedHint ?? ""}
                            onChange={(e) => patchChoice(ci, { lockedHint: e.target.value })}
                            className="mt-1 h-7 text-xs"
                            placeholder="잠겨있을 때 표시할 힌트"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Right: meta + character */}
            <aside className="space-y-4">
              <section className="rounded-xl border border-border/60 bg-card/40 backdrop-blur p-4 space-y-3">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Wand2 className="size-3.5" /> AI 글쓰기 도움
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">작업</Label>
                    <Select value={assistMode} onValueChange={(value: AssistMode) => setAssistMode(value)}>
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIST_MODE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">범위</Label>
                    <Select value={assistScope} onValueChange={(value: AssistScope) => setAssistScope(value)}>
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">현재 비트</SelectItem>
                        <SelectItem value="all">전체 비트</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea
                  value={assistNote}
                  onChange={(event) => setAssistNote(event.target.value)}
                  rows={2}
                  className="text-sm"
                  placeholder="원하는 톤이나 꼭 살릴 장면"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    onClick={() => writingAssist.mutate()}
                    disabled={writingAssist.isPending || (assistScope === "active" && !active)}
                    className="col-span-3"
                  >
                    {writingAssist.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Wand2 className="mr-1 size-3.5" />}
                    적용
                  </Button>
                  <Button type="button" variant="outline" onClick={undoLatest} disabled={!history.length || writingAssist.isPending}>
                    <Undo2 className="mr-1 size-3.5" />
                    이전
                  </Button>
                  <Button type="button" variant="outline" onClick={() => restoreOriginal("active")} disabled={!originalBeatsRef.current.length || writingAssist.isPending}>
                    <RotateCcw className="mr-1 size-3.5" />
                    원문
                  </Button>
                  <Button type="button" variant="outline" onClick={() => restoreOriginal("all")} disabled={!originalBeatsRef.current.length || writingAssist.isPending}>
                    전체 원문
                  </Button>
                </div>
                {history.length > 0 && (
                  <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-border/50 bg-background/35 p-2">
                    {history.slice(0, 4).map((snapshot) => (
                      <button
                        key={`${snapshot.createdAt}-${snapshot.label}`}
                        type="button"
                        onClick={() => restoreSnapshot(snapshot)}
                        className="block w-full truncate rounded-md px-2 py-1 text-left text-[11px] text-muted-foreground transition hover:bg-card/70 hover:text-foreground"
                      >
                        {snapshot.label}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-border/60 bg-card/40 backdrop-blur p-4 space-y-3">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5" /> 스토리 메타
                </h3>
                <div>
                  <Label className="text-xs">로그라인</Label>
                  <Textarea
                    value={logline}
                    onChange={(e) => {
                      setLogline(e.target.value);
                      markDirty();
                    }}
                    rows={3}
                    className="mt-1 text-sm"
                  />
                </div>
              </section>

              <section className="rounded-xl border border-border/60 bg-card/40 backdrop-blur p-4 space-y-3">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                  캐릭터 카드
                </h3>
                <div className="overflow-hidden rounded-lg border border-border/50 bg-background/40">
                  {coverUrl ? (
                    <img src={coverUrl} alt={`${character.name ?? title} 캐릭터 미리보기`} className="aspect-[3/4] w-full object-cover" />
                  ) : (
                    <div className="grid aspect-[3/4] place-items-center text-center text-xs text-muted-foreground">
                      <div>
                        <ImageIcon className="mx-auto mb-2 size-7 opacity-60" />
                        캐릭터 에셋 미리보기
                      </div>
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => generateAsset.mutate()}
                  disabled={generateAsset.isPending}
                >
                  {generateAsset.isPending ? (
                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="mr-1 size-3.5" />
                  )}
                  Gemini로 외모 이미지 생성
                </Button>
                {(
                  [
                    ["name", "이름"],
                    ["age", "연령대"],
                    ["personality", "성격"],
                    ["speakingStyle", "말투"],
                    ["appearance", "외모"],
                  ] as const
                ).map(([k, l]) => (
                  <div key={k}>
                    <Label className="text-xs">{l}</Label>
                    {k === "name" || k === "age" ? (
                      <Input
                        value={character[k] ?? ""}
                        onChange={(e) => {
                          setCharacter({ ...character, [k]: e.target.value });
                          markDirty();
                        }}
                        className="mt-1 h-8 text-sm"
                      />
                    ) : (
                      <Textarea
                        value={character[k] ?? ""}
                        onChange={(e) => {
                          setCharacter({ ...character, [k]: e.target.value });
                          markDirty();
                        }}
                        rows={2}
                        className="mt-1 text-sm"
                      />
                    )}
                  </div>
                ))}
              </section>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
