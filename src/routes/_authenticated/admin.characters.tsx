import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  BookOpen,
  CheckCircle2,
  Copy,
  Gamepad2,
  Library,
  Loader2,
  MessageCircle,
  Plus,
  Save,
  Search,
  Star,
  Trash2,
  Upload,
  UserCircle2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import {
  listCharacterStories,
  saveStoryCharacters,
  type CharacterStoryRow,
  type StoryCharacter,
} from "@/lib/admin-characters.functions";
import { analyzeStoryCharacters } from "@/lib/admin-story-ai.functions";
import { ensureStoryMediaBucket } from "@/lib/storage.functions";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/characters")({
  head: () => ({ meta: [{ title: "캐릭터관리 | Lovetale Studio" }] }),
  component: CharactersPage,
});

type CharacterDraft = StoryCharacter & {
  tagsText: string;
};

const VISUAL_TIERS = [
  { tier: "soft", label: "1단계", minAffection: 0 },
  { tier: "warm", label: "2단계", minAffection: 35 },
  { tier: "spicy", label: "3단계", minAffection: 65 },
  { tier: "steamy", label: "4단계", minAffection: 85 },
  { tier: "premium", label: "최종", minAffection: 95 },
] as const;

function CharactersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listCharacterStories);
  const save = useServerFn(saveStoryCharacters);
  const analyzeCharacters = useServerFn(analyzeStoryCharacters);

  const [q, setQ] = useState("");
  const [selectedStoryId, setSelectedStoryId] = useState("");
  const [storyOverview, setStoryOverview] = useState("");
  const [drafts, setDrafts] = useState<CharacterDraft[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [analysisChapterId, setAnalysisChapterId] = useState("");
  const [bulkAnalysis, setBulkAnalysis] = useState({ running: false, done: 0, total: 0 });

  const storiesQ = useQuery({ queryKey: ["admin_character_stories"], queryFn: () => list() });

  const stories = storiesQ.data ?? [];
  const filteredStories = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return stories;
    return stories.filter((story) => {
      const characters = story.characters.map((character) => `${character.name} ${character.role}`).join(" ");
      return `${story.storyTitle} ${story.logline} ${characters}`.toLowerCase().includes(needle);
    });
  }, [q, stories]);

  const selectedStory =
    stories.find((story) => story.storyId === selectedStoryId) ??
    filteredStories[0] ??
    stories[0] ??
    null;
  const selectedCharacter =
    drafts.find((character) => character.id === selectedCharacterId) ??
    drafts[0] ??
    null;
  const reusableCharacters = stories.flatMap((story) =>
    story.characters
      .filter((character) => character.reusable)
      .map((character) => ({ ...character, storyId: story.storyId, storyTitle: story.storyTitle })),
  );
  const chatEnabledCount = drafts.filter((character) => character.chatEnabled).length;
  const completeCount = drafts.filter((character) => characterQuality(character).score >= 80).length;
  const storyCount = stories.filter((story) => story.contentType !== "story_rpg").length;
  const storyGameCount = stories.filter((story) => story.contentType === "story_rpg").length;
  const analysisChapter =
    selectedStory?.chapters.find((chapter) => chapter.id === analysisChapterId) ??
    selectedStory?.chapters.find((chapter) => chapter.bodyChars > 0) ??
    selectedStory?.chapters[0] ??
    null;

  useEffect(() => {
    if (!selectedStoryId && selectedStory) {
      setSelectedStoryId(selectedStory.storyId);
    }
  }, [selectedStory, selectedStoryId]);

  useEffect(() => {
    if (!selectedStory) return;
    setStoryOverview(selectedStory.storyOverview);
    const nextDrafts = selectedStory.characters.length
      ? selectedStory.characters.map(toDraft)
      : [toDraft(createBlankCharacter(true))];
    setDrafts(nextDrafts);
    setSelectedCharacterId(nextDrafts[0]?.id ?? "");
    setAnalysisChapterId(selectedStory.chapters.find((chapter) => chapter.bodyChars > 0)?.id ?? selectedStory.chapters[0]?.id ?? "");
  }, [selectedStory?.storyId]);

  const saveM = useMutation({
    mutationFn: () =>
      save({
        data: {
          storyId: selectedStory?.storyId ?? "",
          storyOverview,
          characters: drafts.map(fromDraft),
        },
      }),
    onSuccess: () => {
      toast.success("캐릭터 설정을 저장했습니다.");
      qc.invalidateQueries({ queryKey: ["admin_character_stories"] });
      qc.invalidateQueries({ queryKey: ["admin_stories"] });
    },
    onError: (error: Error) => toast.error(error.message || "캐릭터 저장에 실패했습니다."),
  });

  const analyzeM = useMutation({
    mutationFn: () => {
      if (!selectedStory?.storyId || !analysisChapter?.id) throw new Error("분석할 회차가 없습니다.");
      return analyzeCharacters({ data: { storyId: selectedStory.storyId, chapterId: analysisChapter.id } });
    },
    onSuccess: (result) => {
      toast.success(`캐릭터 분석을 반영했습니다. ${result.characters?.length ?? 0}명 감지`);
      qc.invalidateQueries({ queryKey: ["admin_character_stories"] });
      qc.invalidateQueries({ queryKey: ["admin_stories"] });
    },
    onError: (error: Error) => toast.error(error.message || "캐릭터 분석에 실패했습니다."),
  });

  async function analyzeAllChapters() {
    if (!selectedStory?.storyId) return;
    const chapters = selectedStory.chapters.filter((chapter) => chapter.bodyChars > 0);
    if (!chapters.length) {
      toast.error("분석할 본문이 있는 회차가 없습니다.");
      return;
    }
    setBulkAnalysis({ running: true, done: 0, total: chapters.length });
    try {
      for (let index = 0; index < chapters.length; index += 1) {
        const chapter = chapters[index];
        await analyzeCharacters({ data: { storyId: selectedStory.storyId, chapterId: chapter.id } });
        setBulkAnalysis({ running: true, done: index + 1, total: chapters.length });
      }
      toast.success(`전체 회차 캐릭터 분석을 완료했습니다. ${chapters.length}개 회차`);
      qc.invalidateQueries({ queryKey: ["admin_character_stories"] });
      qc.invalidateQueries({ queryKey: ["admin_stories"] });
    } catch (error: any) {
      toast.error(error?.message ?? "전체 회차 분석 중 오류가 발생했습니다.");
    } finally {
      setBulkAnalysis((current) => ({ ...current, running: false }));
    }
  }

  function patchCharacter(id: string, patch: Partial<CharacterDraft>) {
    setDrafts((current) =>
      current.map((character) => {
        if (character.id !== id) return character;
        return { ...character, ...patch };
      }),
    );
  }

  function addCharacter(seed?: Partial<StoryCharacter>) {
    const next = toDraft({
      ...createBlankCharacter(drafts.length === 0),
      ...seed,
      id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      isPrimary: drafts.length === 0,
    });
    setDrafts((current) => [...current, next]);
    setSelectedCharacterId(next.id);
  }

  function removeCharacter(id: string) {
    setDrafts((current) => {
      const next = current.filter((character) => character.id !== id);
      if (!next.length) return [toDraft(createBlankCharacter(true))];
      if (!next.some((character) => character.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });
    if (selectedCharacterId === id) {
      const fallback = drafts.find((character) => character.id !== id);
      setSelectedCharacterId(fallback?.id ?? "");
    }
  }

  function setPrimaryCharacter(id: string) {
    setDrafts((current) => current.map((character) => ({ ...character, isPrimary: character.id === id })));
    setSelectedCharacterId(id);
  }

  function copyCharacter(character: StoryCharacter) {
    addCharacter({
      ...character,
      name: `${character.name} 사본`,
      isPrimary: false,
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">
            Character CMS
          </span>
          <h1 className="mt-1 font-display text-3xl font-semibold">캐릭터관리</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill icon={BookOpen} label="스토리" value={storyCount} />
          <StatusPill icon={Gamepad2} label="스토리게임" value={storyGameCount} />
          <StatusPill icon={Library} label="재사용 캐릭터" value={reusableCharacters.length} />
          <StatusPill icon={MessageCircle} label="대화 가능" value={chatEnabledCount} />
          <StatusPill icon={CheckCircle2} label="프로필 완성" value={completeCount} />
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>콘텐츠 선택</CardTitle>
            <CardDescription>스토리와 스토리게임의 캐릭터를 분리해 관리합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="스토리, 캐릭터 검색"
                className="pl-9"
              />
            </div>
            {storiesQ.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                캐릭터 정보를 불러오는 중...
              </div>
            )}
            <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
              {filteredStories.map((story) => {
                const active = story.storyId === selectedStory?.storyId;
                return (
                  <button
                    type="button"
                    key={story.storyId}
                    onClick={() => setSelectedStoryId(story.storyId)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      active
                        ? "border-primary/50 bg-primary/10"
                        : "border-border bg-background hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {story.contentType === "story_rpg" ? (
                            <Gamepad2 className="size-3.5 shrink-0 text-primary" />
                          ) : (
                            <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <div className="truncate text-sm font-medium">{story.storyTitle}</div>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          대표: {story.activeCharacterName}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant={story.contentType === "story_rpg" ? "default" : "secondary"}>
                          {story.contentType === "story_rpg" ? "게임" : "스토리"}
                        </Badge>
                        <Badge variant="secondary">{story.characters.length}</Badge>
                      </div>
                    </div>
                    {story.logline && (
                      <p
                        className="mt-2 text-xs leading-5 text-muted-foreground"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {story.logline}
                      </p>
                    )}
                  </button>
                );
              })}
              {!storiesQ.isLoading && filteredStories.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  표시할 스토리가 없습니다.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <main className="space-y-4">
          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{selectedStory?.storyTitle ?? "스토리를 선택하세요"}</CardTitle>
                  <CardDescription>
                    대표 캐릭터는 사용자 리더 화면과 채팅 기본 상대방으로 사용됩니다.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={analysisChapterId}
                    onChange={(event) => setAnalysisChapterId(event.target.value)}
                    disabled={!selectedStory?.chapters.length || analyzeM.isPending}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {!selectedStory?.chapters.length && <option value="">회차 없음</option>}
                    {selectedStory?.chapters.map((chapter) => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.episodeNumber}화 · {chapter.title}
                      </option>
                    ))}
                  </select>
                  <Button variant="outline" onClick={() => analyzeM.mutate()} disabled={!analysisChapter || analyzeM.isPending}>
                    {analyzeM.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wand2 className="mr-2 size-4" />}
                    AI 분석
                  </Button>
                  <Button variant="outline" onClick={analyzeAllChapters} disabled={!selectedStory?.chapters.length || bulkAnalysis.running || analyzeM.isPending}>
                    {bulkAnalysis.running ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Bot className="mr-2 size-4" />}
                    전체 분석
                  </Button>
                  <Button variant="outline" onClick={() => addCharacter()} disabled={!selectedStory}>
                    <Plus className="mr-2 size-4" />
                    캐릭터 추가
                  </Button>
                  <Button onClick={() => saveM.mutate()} disabled={!selectedStory || saveM.isPending}>
                    {saveM.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                    저장
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {analysisChapter && (
                <div className="grid gap-2 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground sm:grid-cols-3">
                  <div><span className="text-foreground">분석회차</span> · {analysisChapter.title}</div>
                  <div><span className="text-foreground">본문</span> · {analysisChapter.bodyChars.toLocaleString()}자</div>
                  <div><span className="text-foreground">기존분석</span> · {analysisChapter.characterAnalysisCount}개</div>
                </div>
              )}
              {bulkAnalysis.running && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span>전체 회차 분석 중</span>
                    <span>{bulkAnalysis.done}/{bulkAnalysis.total}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${bulkAnalysis.total ? Math.round((bulkAnalysis.done / bulkAnalysis.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>스토리/관계 요약</Label>
                <Textarea
                  value={storyOverview}
                  onChange={(event) => setStoryOverview(event.target.value)}
                  className="min-h-20"
                  placeholder="캐릭터가 이해해야 할 스토리 배경과 관계 맥락"
                />
              </div>

              <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {drafts.map((character) => (
                  <CharacterSummaryCard
                    key={character.id}
                    character={character}
                    active={character.id === selectedCharacter?.id}
                    onClick={() => setSelectedCharacterId(character.id)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedCharacter && (
            <CharacterEditor
              storyId={selectedStory.storyId}
              character={selectedCharacter}
              storyTitle={selectedStory.storyTitle}
              storyOverview={storyOverview}
              onPatch={(patch) => patchCharacter(selectedCharacter.id, patch)}
              onPrimary={() => setPrimaryCharacter(selectedCharacter.id)}
              onDuplicate={() => copyCharacter(fromDraft(selectedCharacter))}
              onRemove={() => removeCharacter(selectedCharacter.id)}
              canRemove={drafts.length > 1}
            />
          )}
        </main>

        <aside className="space-y-4 self-start xl:col-start-2 2xl:col-start-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="size-5 text-primary" />
                채팅 연동 기준
              </CardTitle>
              <CardDescription>캐릭터 설정은 사용자 채팅의 시스템 프롬프트로 전달됩니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <GuideRow label="대표 캐릭터" text="스토리 진입 시 기본 대화 상대방입니다." />
              <GuideRow label="말투" text="응답 어휘, 존댓말, 문장 길이, 감정 표현을 고정합니다." />
              <GuideRow label="성격/페르소나" text="DeepSeek 채팅이 캐릭터성을 유지하는 핵심 정보입니다." />
              <GuideRow label="재사용 가능" text="사용자 제작 스토리에서 불러올 수 있는 후보로 남깁니다." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Library className="size-5 text-primary" />
                재사용 라이브러리
              </CardTitle>
              <CardDescription>다른 스토리나 사용자 제작에 활용할 수 있는 캐릭터입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                {reusableCharacters.slice(0, 80).map((character) => (
                  <button
                    type="button"
                    key={`${character.storyId}-${character.id}`}
                    onClick={() => copyCharacter(character)}
                    disabled={!selectedStory}
                    className="w-full rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary/30 disabled:opacity-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{character.name}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{character.storyTitle}</div>
                      </div>
                      <Copy className="size-4 text-muted-foreground" />
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{character.persona}</p>
                  </button>
                ))}
                {!reusableCharacters.length && (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    재사용 가능한 캐릭터가 없습니다.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </section>
    </div>
  );
}

function CharacterEditor({
  storyId,
  character,
  storyTitle,
  storyOverview,
  onPatch,
  onPrimary,
  onDuplicate,
  onRemove,
  canRemove,
}: {
  storyId: string;
  character: CharacterDraft;
  storyTitle: string;
  storyOverview: string;
  onPatch: (patch: Partial<CharacterDraft>) => void;
  onPrimary: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const avatarPreview = useSignedCharacterImage(character.avatarUrl);
  const promptPreview = buildChatPromptPreview(storyTitle, storyOverview, character);
  const visualAssets = character.showcaseAssets ?? [];

  async function uploadAvatar(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 등록할 수 있습니다.");
      return;
    }
    setUploading(true);
    try {
      await ensureStoryMediaBucket();
      const ext = file.name.split(".").pop() || "png";
      const key = `characters/${storyId}/${character.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("story-media")
        .upload(key, file, { upsert: true, contentType: file.type || undefined });
      if (error) throw error;
      onPatch({ avatarUrl: key });
      toast.success("캐릭터 이미지가 등록되었습니다.");
    } catch (error: any) {
      toast.error(error?.message ?? "이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  async function generateAvatar() {
    if (!character.name.trim()) {
      toast.error("캐릭터 이름을 먼저 입력해주세요.");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다.");
      const response = await fetch("/api/reader-profile-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storyId,
          characterId: character.id,
          name: character.name,
          bio: [character.role, character.persona, character.personality, character.relationship].filter(Boolean).join("\n"),
          prompt:
            character.visualPrompt ||
            "romantic manga style character portrait, expressive face, polished webtoon character profile",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || payload?.reason || "AI 이미지 생성에 실패했습니다.");
      }
      onPatch({ avatarUrl: payload.storagePath || payload.signedUrl || null });
      toast.success("AI 캐릭터 이미지가 생성되었습니다. 저장 버튼을 눌러 반영해주세요.");
    } catch (error: any) {
      toast.error(error?.message ?? "AI 이미지 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  function patchVisualAsset(assetId: string, patch: Partial<NonNullable<CharacterDraft["showcaseAssets"]>[number]>) {
    onPatch({
      showcaseAssets: visualAssets.map((asset) => (asset.id === assetId ? { ...asset, ...patch } : asset)),
    });
  }

  function addVisualAsset() {
    const tierInfo = VISUAL_TIERS[Math.min(visualAssets.length, VISUAL_TIERS.length - 1)];
    onPatch({
      showcaseAssets: [
        ...visualAssets,
        {
          id: `visual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          tier: tierInfo.tier,
          minAffection: tierInfo.minAffection,
          mediaUrl: null,
          mediaType: "image",
          caption: "",
        },
      ],
    });
  }

  function removeVisualAsset(assetId: string) {
    onPatch({ showcaseAssets: visualAssets.filter((asset) => asset.id !== assetId) });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>캐릭터 프로필 편집</CardTitle>
            <CardDescription>저장 후 사용자 채팅과 스토리 제작에서 동일한 프로필을 사용합니다.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={character.isPrimary ? "default" : "outline"} onClick={onPrimary}>
              <Star className="mr-2 size-4" />
              대표
            </Button>
            <Button variant="outline" onClick={onDuplicate}>
              <Copy className="mr-2 size-4" />
              복제
            </Button>
            <Button variant="outline" className="text-destructive" onClick={onRemove} disabled={!canRemove}>
              <Trash2 className="mr-2 size-4" />
              삭제
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="이름">
            <Input value={character.name} onChange={(event) => onPatch({ name: event.target.value })} />
          </Field>
          <Field label="역할">
            <Input
              value={character.role}
              onChange={(event) => onPatch({ role: event.target.value })}
              placeholder="Main Character, Rival, Friend"
            />
          </Field>
          <Field label="관계 설정">
            <Input
              value={character.relationship}
              onChange={(event) => onPatch({ relationship: event.target.value })}
              placeholder="사용자와의 관계, 숨은 감정, 갈등"
            />
          </Field>
          <Field label="태그">
            <Input
              value={character.tagsText}
              onChange={(event) => onPatch({ tagsText: event.target.value })}
              placeholder="CEO, 차가움, 집착, 계약연애"
            />
          </Field>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="페르소나">
            <Textarea
              value={character.persona}
              onChange={(event) => onPatch({ persona: event.target.value })}
              className="min-h-28"
              placeholder="캐릭터의 배경, 욕망, 금기, 사용자를 대하는 태도"
            />
          </Field>
          <Field label="성격">
            <Textarea
              value={character.personality}
              onChange={(event) => onPatch({ personality: event.target.value })}
              className="min-h-28"
              placeholder="차갑지만 보호 본능이 강함, 질투를 숨김..."
            />
          </Field>
          <Field label="말투">
            <Textarea
              value={character.speakingStyle}
              onChange={(event) => onPatch({ speakingStyle: event.target.value })}
              className="min-h-24"
              placeholder="짧고 낮은 문장, 반말과 존댓말을 섞음, 감정은 숨김"
            />
          </Field>
          <Field label="비주얼 프롬프트">
            <Textarea
              value={character.visualPrompt}
              onChange={(event) => onPatch({ visualPrompt: event.target.value })}
              className="min-h-24"
              placeholder="외형, 의상, 분위기, 이미지 생성 기준"
            />
          </Field>
        </div>

        <Field label="아바타/대표 이미지 URL 또는 story-media 경로">
          <Input
            value={character.avatarUrl ?? ""}
            onChange={(event) => onPatch({ avatarUrl: event.target.value || null })}
            placeholder="assets/story/character.png"
          />
        </Field>

        <Field label="캐릭터 이미지 등록 / AI 생성">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
              {avatarPreview ? (
                <img src={avatarPreview} alt={character.name} className="size-full object-cover" />
              ) : (
                <UserCircle2 className="size-8 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="text-xs leading-5 text-muted-foreground">
                이미지는 채팅 상대 썸네일과 친구목록 프로필에 사용됩니다. 직접 등록하거나 비주얼 프롬프트를 바탕으로 AI 생성할 수 있습니다.
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm hover:border-primary/50">
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  이미지 등록
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] ?? null;
                      event.currentTarget.value = "";
                      void uploadAvatar(file);
                    }}
                  />
                </label>
                <Button type="button" variant="outline" size="sm" onClick={generateAvatar} disabled={generating}>
                  {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  AI 생성
                </Button>
              </div>
            </div>
          </div>
        </Field>

        <Field label="호감도 비주얼 슬롯">
          <div className="space-y-3 rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs leading-5 text-muted-foreground">
                캐릭터 채팅과 리더 화면에서 호감도에 따라 순차 해금되는 이미지/영상입니다.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={addVisualAsset}>
                <Plus className="size-4" />
                슬롯 추가
              </Button>
            </div>
            {visualAssets.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                아직 등록된 슬롯이 없습니다. 기본 캐릭터 이미지와 스토리 에셋이 자동 노출됩니다.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {visualAssets.map((asset) => (
                  <CharacterVisualAssetEditor
                    key={asset.id}
                    asset={asset}
                    onPatch={(patch) => patchVisualAsset(asset.id, patch)}
                    onRemove={() => removeVisualAsset(asset.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </Field>

        <div className="grid gap-3 md:grid-cols-3">
          <ToggleLine
            checked={character.chatEnabled}
            label="채팅 상대방으로 사용"
            text="사용자 리더 화면에서 대화 가능한 캐릭터로 표시합니다."
            onChange={(checked) => onPatch({ chatEnabled: checked })}
          />
          <ToggleLine
            checked={character.reusable}
            label="재사용 라이브러리에 표시"
            text="사용자 제작/다른 스토리에서 불러올 수 있게 합니다."
            onChange={(checked) => onPatch({ reusable: checked })}
          />
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-4 text-primary" />
              저장 대상
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              스토리의 character_card에 저장되며 채팅 프롬프트와 프론트 표시가 함께 갱신됩니다.
            </p>
          </div>
        </div>

        <Field label="채팅 프롬프트 미리보기">
          <div className="rounded-lg border border-border bg-background p-3">
            <pre className="max-h-52 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
              {promptPreview}
            </pre>
          </div>
        </Field>
      </CardContent>
    </Card>
  );
}

function StatusPill({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <Icon className="size-4 text-primary" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value.toLocaleString()}</span>
    </div>
  );
}

function CharacterSummaryCard({
  character,
  active,
  onClick,
}: {
  character: CharacterDraft;
  active: boolean;
  onClick: () => void;
}) {
  const quality = characterQuality(character);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition ${
        active
          ? "border-primary/50 bg-primary/10"
          : "border-border bg-background hover:border-primary/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{character.name}</span>
            {character.isPrimary && <Star className="size-3.5 fill-primary text-primary" />}
            {character.chatEnabled && <MessageCircle className="size-3.5 text-primary" />}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{character.role}</div>
        </div>
        {character.reusable && <Badge variant="outline">재사용</Badge>}
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
        {character.persona || character.personality || "설정이 비어 있습니다."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${quality.score}%` }} />
        </div>
        <span className="text-[11px] text-muted-foreground">{quality.score}</span>
      </div>
      {quality.missing.length > 0 && (
        <div className="mt-2 truncate text-[11px] text-amber-300">부족: {quality.missing.join(", ")}</div>
      )}
    </button>
  );
}

function characterQuality(character: Pick<CharacterDraft, "name" | "role" | "persona" | "personality" | "relationship" | "speakingStyle" | "visualPrompt" | "avatarUrl">) {
  const checks = [
    ["이름", character.name],
    ["역할", character.role],
    ["페르소나", character.persona],
    ["성격", character.personality],
    ["관계", character.relationship],
    ["말투", character.speakingStyle],
    ["이미지", character.avatarUrl],
    ["비주얼", character.visualPrompt],
  ] as const;
  const filled = checks.filter(([, value]) => String(value ?? "").trim().length > 0);
  const missing = checks.filter(([, value]) => !String(value ?? "").trim()).map(([label]) => label);
  return {
    score: Math.round((filled.length / checks.length) * 100),
    missing,
  };
}

function buildChatPromptPreview(storyTitle: string, storyOverview: string, character: CharacterDraft) {
  return [
    `스토리: ${storyTitle || "미지정"}`,
    `대화 상대: ${character.name || "이름 미입력"}`,
    `역할: ${character.role || "역할 미입력"}`,
    "",
    "[관계]",
    character.relationship || "관계 설정이 비어 있습니다.",
    "",
    "[성격/페르소나]",
    character.persona || character.personality || "캐릭터 성격 정보가 비어 있습니다.",
    "",
    "[말투]",
    character.speakingStyle || "말투 설정이 비어 있습니다.",
    "",
    "[스토리 맥락]",
    storyOverview || "스토리/관계 요약이 비어 있습니다.",
    "",
    "규칙: 사용자를 스토리 속 인물로 대하고, 캐릭터의 말투와 관계를 유지하며, 모르는 설정은 지어내지 말고 현재 장면의 맥락 안에서 답합니다.",
  ].join("\n");
}

function GuideRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-sm font-medium text-foreground">{label}</div>
      <p className="mt-1 text-xs leading-5">{text}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function useSignedCharacterImage(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    if (/^(https?:|data:|blob:)/.test(path)) {
      setUrl(path);
      return;
    }
    supabase.storage
      .from("story-media")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => !cancelled && setUrl(data?.signedUrl ?? null))
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

function ToggleLine({
  checked,
  label,
  text,
  onChange,
}: {
  checked: boolean;
  label: string;
  text: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-border bg-background p-3">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{text}</span>
      </span>
    </label>
  );
}

function CharacterVisualAssetEditor({
  asset,
  onPatch,
  onRemove,
}: {
  asset: NonNullable<CharacterDraft["showcaseAssets"]>[number];
  onPatch: (patch: Partial<NonNullable<CharacterDraft["showcaseAssets"]>[number]>) => void;
  onRemove: () => void;
}) {
  const previewUrl = useSignedCharacterImage(asset.mediaUrl);
  const tierInfo = VISUAL_TIERS.find((item) => item.tier === asset.tier) ?? VISUAL_TIERS[0];
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative aspect-video bg-muted">
        {previewUrl ? (
          asset.mediaType === "video" ? (
            <video src={previewUrl} className="size-full object-cover" muted playsInline />
          ) : (
            <img src={previewUrl} alt={asset.caption || tierInfo.label} className="size-full object-cover" />
          )
        ) : (
          <div className="grid size-full place-items-center text-xs text-muted-foreground">
            이미지/영상 경로 입력
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/65 text-white hover:bg-destructive"
          aria-label="슬롯 삭제"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="space-y-2 p-3">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={asset.tier}
            onChange={(event) => {
              const next = VISUAL_TIERS.find((item) => item.tier === event.target.value) ?? VISUAL_TIERS[0];
              onPatch({ tier: next.tier, minAffection: next.minAffection });
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {VISUAL_TIERS.map((item) => (
              <option key={item.tier} value={item.tier}>
                {item.label}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min={0}
            max={100}
            value={asset.minAffection}
            onChange={(event) => onPatch({ minAffection: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })}
          />
        </div>
        <select
          value={asset.mediaType}
          onChange={(event) => onPatch({ mediaType: event.target.value === "video" ? "video" : "image" })}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="image">이미지</option>
          <option value="video">영상</option>
        </select>
        <Input
          value={asset.mediaUrl ?? ""}
          onChange={(event) => onPatch({ mediaUrl: event.target.value || null })}
          placeholder="story-media 경로 또는 이미지 URL"
        />
        <Input
          value={asset.caption}
          onChange={(event) => onPatch({ caption: event.target.value })}
          placeholder="짧은 캡션"
        />
      </div>
    </div>
  );
}

function createBlankCharacter(isPrimary: boolean): StoryCharacter {
  return {
    id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: isPrimary ? "상대 주인공" : "",
    role: isPrimary ? "Main Character" : "Supporting Character",
    persona: "",
    personality: "",
    relationship: "",
    speakingStyle: "",
    visualPrompt: "",
    avatarUrl: null,
    tags: [],
    isPrimary,
    chatEnabled: true,
    reusable: true,
    showcaseAssets: [],
  };
}

function toDraft(character: StoryCharacter): CharacterDraft {
  return {
    ...character,
    tagsText: character.tags.join(", "),
  };
}

function fromDraft(character: CharacterDraft): StoryCharacter {
  return {
    id: character.id,
    name: character.name,
    role: character.role,
    persona: character.persona,
    personality: character.personality,
    relationship: character.relationship,
    speakingStyle: character.speakingStyle,
    visualPrompt: character.visualPrompt,
    avatarUrl: character.avatarUrl,
    tags: character.tagsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12),
    isPrimary: character.isPrimary,
    chatEnabled: character.chatEnabled,
    reusable: character.reusable,
    showcaseAssets: character.showcaseAssets ?? [],
  };
}
