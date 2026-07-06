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
import { resolveStoryMediaSource } from "@/lib/story-media-url";
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
  const [contentFilter, setContentFilter] = useState<"all" | "story" | "story_rpg">("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [bulkAnalysis, setBulkAnalysis] = useState({ running: false, done: 0, total: 0 });

  const storiesQ = useQuery({ queryKey: ["admin_character_stories"], queryFn: () => list() });

  const stories = storiesQ.data ?? [];
  const topicOptions = useMemo(() => {
    const set = new Set<string>();
    for (const story of stories) {
      for (const character of story.characters) {
        for (const tag of character.tags ?? []) set.add(tag);
        if (character.role) set.add(character.role);
      }
    }
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, "ko")).slice(0, 40);
  }, [stories]);
  const filteredStories = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return stories.filter((story) => {
      if (contentFilter !== "all" && story.contentType !== contentFilter) return false;
      const characters = story.characters
        .map((character) => `${character.name} ${character.role} ${character.tags?.join(" ") ?? ""}`)
        .join(" ");
      const matchesSearch = !needle || `${story.storyTitle} ${story.logline} ${characters}`.toLowerCase().includes(needle);
      const matchesTopic =
        topicFilter === "all" ||
        story.characters.some(
          (character) => character.role === topicFilter || character.tags?.some((tag) => tag === topicFilter),
        );
      return matchesSearch && matchesTopic;
    });
  }, [contentFilter, q, stories, topicFilter]);

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
      qc.invalidateQueries({ queryKey: ["public_chat_characters"] });
      if (selectedStory?.storyId) {
        qc.invalidateQueries({ queryKey: ["character_chat_story", selectedStory.storyId] });
        qc.invalidateQueries({ queryKey: ["user_story_unified", selectedStory.storyId] });
      }
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
      qc.invalidateQueries({ queryKey: ["public_chat_characters"] });
      if (selectedStory?.storyId) {
        qc.invalidateQueries({ queryKey: ["character_chat_story", selectedStory.storyId] });
        qc.invalidateQueries({ queryKey: ["user_story_unified", selectedStory.storyId] });
      }
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
      qc.invalidateQueries({ queryKey: ["public_chat_characters"] });
      qc.invalidateQueries({ queryKey: ["character_chat_story", selectedStory.storyId] });
      qc.invalidateQueries({ queryKey: ["user_story_unified", selectedStory.storyId] });
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

      <section className="grid gap-4 xl:grid-cols-[310px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_420px]">
        <Card className="self-start">
          <CardHeader className="pb-3">
            <CardTitle>콘텐츠</CardTitle>
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
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-background p-1">
              {[
                ["all", "전체"],
                ["story", "스토리"],
                ["story_rpg", "게임"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setContentFilter(value as typeof contentFilter)}
                  className={`h-8 rounded-md text-xs transition ${
                    contentFilter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={topicFilter}
              onChange={(event) => setTopicFilter(event.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="all">전체 주제</option>
              {topicOptions.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
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
            <CardHeader className="gap-3 pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{selectedStory?.storyTitle ?? "스토리를 선택하세요"}</CardTitle>
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
                    본문+에셋 분석
                  </Button>
                  <Button variant="outline" onClick={analyzeAllChapters} disabled={!selectedStory?.chapters.length || bulkAnalysis.running || analyzeM.isPending}>
                    {bulkAnalysis.running ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Bot className="mr-2 size-4" />}
                    전체 회차 분석
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
                <div className="grid gap-2 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground sm:grid-cols-4">
                  <div><span className="text-foreground">분석회차</span> · {analysisChapter.title}</div>
                  <div><span className="text-foreground">본문</span> · {analysisChapter.bodyChars.toLocaleString()}자</div>
                  <div><span className="text-foreground">삽입에셋</span> · {analysisChapter.assetSlotCount.toLocaleString()}개</div>
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
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>스토리 맥락</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={storyOverview}
                onChange={(event) => setStoryOverview(event.target.value)}
                className="min-h-24"
                placeholder="캐릭터가 이해해야 할 스토리 배경과 관계"
              />
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-4 self-start xl:col-start-2 2xl:col-start-auto">
          {selectedCharacter && (
            <CharacterEditor
              storyId={selectedStory.storyId}
              character={selectedCharacter}
              storyTitle={selectedStory.storyTitle}
              storyOverview={storyOverview}
              reusableCharacters={reusableCharacters}
              onPatch={(patch) => patchCharacter(selectedCharacter.id, patch)}
              onPrimary={() => setPrimaryCharacter(selectedCharacter.id)}
              onDuplicate={() => copyCharacter(fromDraft(selectedCharacter))}
              onCopyCharacter={(character) => copyCharacter(character)}
              onRemove={() => removeCharacter(selectedCharacter.id)}
              canRemove={drafts.length > 1}
            />
          )}
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
  reusableCharacters,
  onPatch,
  onPrimary,
  onDuplicate,
  onCopyCharacter,
  onRemove,
  canRemove,
}: {
  storyId: string;
  character: CharacterDraft;
  storyTitle: string;
  storyOverview: string;
  reusableCharacters: Array<StoryCharacter & { storyId: string; storyTitle: string }>;
  onPatch: (patch: Partial<CharacterDraft>) => void;
  onPrimary: () => void;
  onDuplicate: () => void;
  onCopyCharacter: (character: StoryCharacter) => void;
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
    <Card className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-hidden">
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-start gap-3">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
            {avatarPreview ? (
              <img src={avatarPreview} alt={character.name} className="size-full object-cover" />
            ) : (
              <UserCircle2 className="size-8 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{character.name || "새 캐릭터"}</CardTitle>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {character.isPrimary && <Badge>대표</Badge>}
              {character.chatEnabled && <Badge variant="secondary">채팅</Badge>}
              {character.reusable && <Badge variant="outline">재사용</Badge>}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button size="sm" variant={character.isPrimary ? "default" : "outline"} onClick={onPrimary}>
            <Star className="size-4" />
            대표
          </Button>
          <Button size="sm" variant="outline" onClick={onDuplicate}>
            <Copy className="size-4" />
            복제
          </Button>
          <Button size="sm" variant="outline" className="text-destructive" onClick={onRemove} disabled={!canRemove}>
            <Trash2 className="size-4" />
            삭제
          </Button>
        </div>
      </CardHeader>

      <CardContent className="max-h-[calc(100vh-12rem)] space-y-4 overflow-y-auto p-4">
        <PanelSection title="이미지">
          <div className="grid gap-2">
            <Field label="대표 이미지 경로">
              <Input
                value={character.avatarUrl ?? ""}
                onChange={(event) => onPatch({ avatarUrl: event.target.value || null })}
                placeholder="story-media 경로 또는 URL"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm hover:border-primary/50">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                업로드
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
        </PanelSection>

        <PanelSection title="기본정보">
          <div className="grid gap-3">
            <Field label="이름">
              <Input value={character.name} onChange={(event) => onPatch({ name: event.target.value })} />
            </Field>
            <Field label="역할">
              <Input value={character.role} onChange={(event) => onPatch({ role: event.target.value })} />
            </Field>
            <Field label="관계">
              <Input value={character.relationship} onChange={(event) => onPatch({ relationship: event.target.value })} />
            </Field>
            <Field label="태그">
              <Input value={character.tagsText} onChange={(event) => onPatch({ tagsText: event.target.value })} />
            </Field>
          </div>
        </PanelSection>

        <PanelSection title="성격">
          <div className="grid gap-3">
            <Field label="페르소나">
              <Textarea value={character.persona} onChange={(event) => onPatch({ persona: event.target.value })} className="min-h-24" />
            </Field>
            <Field label="성격">
              <Textarea value={character.personality} onChange={(event) => onPatch({ personality: event.target.value })} className="min-h-24" />
            </Field>
            <Field label="비주얼">
              <Textarea value={character.visualPrompt} onChange={(event) => onPatch({ visualPrompt: event.target.value })} className="min-h-20" />
            </Field>
          </div>
        </PanelSection>

        <PanelSection title="답변패턴">
          <div className="grid gap-3">
            <Field label="말투">
              <Textarea value={character.speakingStyle} onChange={(event) => onPatch({ speakingStyle: event.target.value })} className="min-h-20" />
            </Field>
            <Field label="응답 규칙">
              <Textarea
                value={character.replyPattern ?? ""}
                onChange={(event) => onPatch({ replyPattern: event.target.value })}
                className="min-h-20"
                placeholder="대답 길이, 금지 표현, 먼저 질문하는 방식, 호감도별 태도"
              />
            </Field>
          </div>
        </PanelSection>

        <PanelSection title="LLM">
          <div className="grid grid-cols-2 gap-3">
            <Field label="사용처">
              <select
                value={character.llmPurpose ?? "chat"}
                onChange={(event) => onPatch({ llmPurpose: event.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="chat">채팅</option>
                <option value="summary">분석/요약</option>
                <option value="image">이미지</option>
              </select>
            </Field>
            <Field label="모델">
              <Input
                value={character.llmModel ?? ""}
                onChange={(event) => onPatch({ llmModel: event.target.value })}
                placeholder="기본값"
              />
            </Field>
          </div>
        </PanelSection>

        <PanelSection
          title="호감도 에셋"
          action={
            <Button type="button" variant="outline" size="sm" onClick={addVisualAsset}>
              <Plus className="size-4" />
              슬롯
            </Button>
          }
        >
          {visualAssets.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              등록된 에셋이 없습니다.
            </div>
          ) : (
            <div className="grid gap-3">
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
        </PanelSection>

        <PanelSection title="노출">
          <div className="grid gap-2">
            <ToggleLine checked={character.chatEnabled} label="채팅 사용" onChange={(checked) => onPatch({ chatEnabled: checked })} />
            <ToggleLine checked={character.reusable} label="재사용 허용" onChange={(checked) => onPatch({ reusable: checked })} />
          </div>
        </PanelSection>

        <PanelSection title="재사용">
          <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
            {reusableCharacters.slice(0, 30).map((item) => (
              <button
                type="button"
                key={`${item.storyId}-${item.id}`}
                onClick={() => onCopyCharacter(item)}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-background p-2 text-left hover:border-primary/40"
              >
                <UserCircle2 className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{item.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{item.storyTitle}</span>
                </span>
                <Copy className="size-4 text-muted-foreground" />
              </button>
            ))}
            {!reusableCharacters.length && <div className="text-xs text-muted-foreground">재사용 캐릭터 없음</div>}
          </div>
        </PanelSection>

        <PanelSection title="프롬프트">
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
            {promptPreview}
          </pre>
        </PanelSection>
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
  const avatarPreview = useSignedCharacterImage(character.avatarUrl);
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
      <div className="flex gap-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
          {avatarPreview ? (
            <img src={avatarPreview} alt={character.name} className="size-full object-cover" />
          ) : (
            <UserCircle2 className="size-7 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{character.name || "이름 없음"}</span>
            {character.isPrimary && <Star className="size-3.5 fill-primary text-primary" />}
            {character.chatEnabled && <MessageCircle className="size-3.5 text-primary" />}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{character.role || "역할 미입력"}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {character.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">
                {tag}
              </Badge>
            ))}
            {character.reusable && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                재사용
              </Badge>
            )}
          </div>
        </div>
      </div>
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

function characterQuality(character: Pick<CharacterDraft, "name" | "role" | "persona" | "personality" | "relationship" | "speakingStyle" | "replyPattern" | "visualPrompt" | "avatarUrl">) {
  const checks = [
    ["이름", character.name],
    ["역할", character.role],
    ["페르소나", character.persona],
    ["성격", character.personality],
    ["관계", character.relationship],
    ["말투", character.speakingStyle],
    ["답변", character.replyPattern],
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
    "[답변패턴]",
    character.replyPattern || "답변 패턴이 비어 있습니다.",
    "",
    "[사용 LLM]",
    `${character.llmPurpose || "chat"}${character.llmModel ? ` / ${character.llmModel}` : ""}`,
    "",
    "[스토리 맥락]",
    storyOverview || "스토리/관계 요약이 비어 있습니다.",
    "",
    "규칙: 사용자를 스토리 속 인물로 대하고, 캐릭터의 말투와 관계를 유지하며, 모르는 설정은 지어내지 말고 현재 장면의 맥락 안에서 답합니다.",
  ].join("\n");
}

function PanelSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
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
    const source = resolveStoryMediaSource(path);
    if (!source) {
      setUrl(null);
      return;
    }
    if (source.kind === "direct") {
      setUrl(source.url);
      return;
    }
    supabase.storage
      .from("story-media")
      .createSignedUrl(source.path, 60 * 60)
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
  text?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-border bg-background p-3">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {text && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{text}</span>}
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
    replyPattern: "",
    llmPurpose: "chat",
    llmModel: "",
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
    replyPattern: character.replyPattern ?? "",
    llmPurpose: character.llmPurpose ?? "chat",
    llmModel: character.llmModel ?? "",
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
