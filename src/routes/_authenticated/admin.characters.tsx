import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  Copy,
  Eye,
  Gamepad2,
  Library,
  Loader2,
  MessageCircle,
  Plus,
  Save,
  Search,
  Star,
  Trash2,
  Unlink2,
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
import {
  ambiguousKoreanGivenNameKeys,
  characterNameSetsLikelySame,
  cleanCharacterDisplayName,
  normalizeCharacterNameKey,
  preferredCharacterDisplayName,
} from "@/lib/character-name-match";
import { ensureStoryMediaBucket } from "@/lib/storage.functions";
import { fetchWithSupabaseAuth } from "@/lib/supabase-auth-fetch";
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
  duplicateAliasesText: string;
  duplicateExclusionsText: string;
};

type CharacterListMode = "all" | "major" | "duplicates";
type CharacterDuplicateGroup = {
  key: string;
  displayName: string;
  aliases: string[];
  characters: CharacterDraft[];
  recommendedId: string;
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
  const [contentFilter, setContentFilter] = useState<"all" | "story" | "story_rpg">("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [characterListMode, setCharacterListMode] = useState<CharacterListMode>("all");

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
  const frontendVisibleCount = drafts.filter((character) => character.chatEnabled && character.visibleInFrontend).length;
  const completeCount = drafts.filter((character) => characterQuality(character).score >= 80).length;
  const duplicateGroups = useMemo(() => buildCharacterDuplicateGroups(drafts), [drafts]);
  const duplicateIds = useMemo(
    () => new Set(duplicateGroups.flatMap((group) => group.characters.map((character) => character.id))),
    [duplicateGroups],
  );
  const sortedDrafts = useMemo(() => sortCharacterDraftsForManagement(drafts), [drafts]);
  const visibleDrafts = useMemo(() => {
    if (characterListMode === "duplicates") return sortedDrafts.filter((character) => duplicateIds.has(character.id));
    if (characterListMode === "major") return sortedDrafts.filter((character, index) => character.isPrimary || index < 12);
    return sortedDrafts;
  }, [characterListMode, duplicateIds, sortedDrafts]);
  const duplicateCharacterCount = duplicateGroups.reduce((sum, group) => sum + Math.max(0, group.characters.length - 1), 0);
  const majorCharacterCount = sortedDrafts.filter((character, index) => character.isPrimary || index < 12).length;
  const storyCount = stories.filter((story) => story.contentType !== "story_rpg").length;
  const storyGameCount = stories.filter((story) => story.contentType === "story_rpg").length;
  const selectedStoryStats = useMemo(() => {
    const chapters = selectedStory?.chapters ?? [];
    return {
      chapterCount: chapters.length,
      bodyChars: chapters.reduce((sum, chapter) => sum + chapter.bodyChars, 0),
      assetSlotCount: chapters.reduce((sum, chapter) => sum + chapter.assetSlotCount, 0),
      characterAnalysisCount: chapters.reduce((sum, chapter) => sum + chapter.characterAnalysisCount, 0),
    };
  }, [selectedStory]);

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
    setCharacterListMode("all");
  }, [selectedStory?.storyId, selectedStory?.updatedAt]);

  useEffect(() => {
    if (!visibleDrafts.length) return;
    if (!selectedCharacterId || !visibleDrafts.some((character) => character.id === selectedCharacterId)) {
      setSelectedCharacterId(visibleDrafts[0].id);
    }
  }, [selectedCharacterId, visibleDrafts]);

  const saveM = useMutation({
    mutationFn: () =>
      save({
        data: {
          storyId: selectedStory?.storyId ?? "",
          storyOverview,
          characters: mergeDuplicateCharacterDrafts(drafts).map(fromDraft),
        },
      }),
    onSuccess: () => {
      setDrafts((current) => ensureSinglePrimaryDraft(sortCharacterDraftsForManagement(mergeDuplicateCharacterDrafts(current))));
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
      if (!selectedStory?.storyId) throw new Error("분석할 스토리가 없습니다.");
      if (selectedStoryStats.bodyChars < 80) throw new Error("분석할 본문이 충분하지 않습니다.");
      return analyzeCharacters({ data: { storyId: selectedStory.storyId, scope: "story" } });
    },
    onSuccess: (result) => {
      toast.success(`전체 스토리 기준 캐릭터 분석을 반영했습니다. ${result.characters?.length ?? 0}명 감지`);
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

  function mergeDuplicateGroup(characterIds: string[]) {
    const ids = new Set(characterIds);
    const group = drafts.filter((character) => ids.has(character.id));
    if (group.length < 2) return;
    const merged = mergeCharacterDraftGroup(group);
    const next = drafts.filter((character) => !ids.has(character.id));
    setDrafts(ensureSinglePrimaryDraft(sortCharacterDraftsForManagement([...next, merged])));
    setSelectedCharacterId(merged.id);
    toast.success("중복 캐릭터를 하나로 병합했습니다.");
  }

  function keepDuplicateGroupSeparate(characterIds: string[]) {
    const ids = new Set(characterIds);
    const group = drafts.filter((character) => ids.has(character.id));
    if (group.length < 2) return;
    setDrafts((current) =>
      current.map((character) => {
        if (!ids.has(character.id)) return character;
        const otherNames = group
          .filter((other) => other.id !== character.id)
          .flatMap(characterDraftNameSet);
        const duplicateExclusions = mergeCharacterNameList(character.duplicateExclusions ?? [], otherNames);
        return {
          ...character,
          duplicateExclusions,
          duplicateExclusionsText: duplicateExclusions.join(", "),
        };
      }),
    );
    toast.success("중복 후보를 별개 캐릭터로 유지합니다.");
  }

  function mergeAllDuplicateGroups() {
    const merged = ensureSinglePrimaryDraft(sortCharacterDraftsForManagement(mergeDuplicateCharacterDrafts(drafts)));
    setDrafts(merged);
    setSelectedCharacterId(merged[0]?.id ?? "");
    setCharacterListMode("all");
    toast.success("중복 캐릭터 후보를 자동 정리했습니다.");
  }

  function sortByImportance() {
    const sorted = ensureSinglePrimaryDraft(sortCharacterDraftsForManagement(drafts));
    setDrafts(sorted);
    setSelectedCharacterId(sorted[0]?.id ?? "");
    setCharacterListMode("major");
    toast.success("주요도 순으로 캐릭터 목록을 정렬했습니다.");
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
          <StatusPill icon={Eye} label="캐릭터채팅 노출" value={frontendVisibleCount} />
          <StatusPill icon={CheckCircle2} label="프로필 완성" value={completeCount} />
          <StatusPill icon={Search} label="중복 후보" value={duplicateCharacterCount} />
          <StatusPill icon={Star} label="주요 관리" value={majorCharacterCount} />
        </div>
      </header>

      <Card>
        <CardHeader className="gap-3 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>스토리/게임 선택</CardTitle>
              <CardDescription>캐릭터를 추출하거나 편집할 콘텐츠를 먼저 고르세요.</CardDescription>
            </div>
            {selectedStory && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant={selectedStory.contentType === "story_rpg" ? "default" : "secondary"}>
                  {selectedStory.contentType === "story_rpg" ? "게임" : "스토리"}
                </Badge>
                <Badge variant="outline">{selectedStory.characters.length}명</Badge>
                <Badge variant="outline">대표 {selectedStory.activeCharacterName}</Badge>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
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
          </div>
          {storiesQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              캐릭터 정보를 불러오는 중...
            </div>
          )}
          <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredStories.map((story) => {
              const active = story.storyId === selectedStory?.storyId;
              return (
                <button
                  type="button"
                  key={story.storyId}
                  onClick={() => setSelectedStoryId(story.storyId)}
                  className={`min-w-0 rounded-lg border p-3 text-left transition ${
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
                      <div className="mt-1 truncate text-xs text-muted-foreground">대표: {story.activeCharacterName}</div>
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
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3 2xl:col-span-4">
                표시할 스토리가 없습니다.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        <main className="space-y-4">
          <Card>
            <CardHeader className="gap-3 pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>캐릭터 목록</CardTitle>
                  <CardDescription>{selectedStory?.storyTitle ?? "스토리를 선택하세요"}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => analyzeM.mutate()}
                    disabled={!selectedStory || selectedStoryStats.bodyChars < 80 || analyzeM.isPending}
                  >
                    {analyzeM.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wand2 className="mr-2 size-4" />}
                    전체 스토리 분석
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
              {selectedStory && (
                <div className="grid gap-2 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground sm:grid-cols-4">
                  <div><span className="text-foreground">분석범위</span> · 전체 {selectedStoryStats.chapterCount.toLocaleString()}회차</div>
                  <div><span className="text-foreground">본문</span> · {selectedStoryStats.bodyChars.toLocaleString()}자</div>
                  <div><span className="text-foreground">삽입에셋</span> · {selectedStoryStats.assetSlotCount.toLocaleString()}개</div>
                  <div><span className="text-foreground">기존분석</span> · {selectedStoryStats.characterAnalysisCount.toLocaleString()}개</div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid w-full grid-cols-3 gap-1 rounded-lg border border-border bg-background p-1 sm:w-auto sm:min-w-72">
                  {[
                    ["all", "전체"],
                    ["major", "주요"],
                    ["duplicates", "중복"],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setCharacterListMode(value as CharacterListMode)}
                      className={`h-8 rounded-md px-3 text-xs transition ${
                        characterListMode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={sortByImportance} disabled={drafts.length < 2}>
                    <Star className="size-4" />
                    주요도순
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={mergeAllDuplicateGroups} disabled={!duplicateGroups.length}>
                    <CheckCircle2 className="size-4" />
                    중복 자동 병합
                  </Button>
                </div>
              </div>
              <CharacterDuplicateReview
                groups={duplicateGroups}
                onMergeGroup={mergeDuplicateGroup}
                onSeparateGroup={keepDuplicateGroupSeparate}
                onSelectCharacter={setSelectedCharacterId}
              />
              <div className="max-h-[min(58vh,620px)] space-y-2 overflow-y-auto pr-1">
                {visibleDrafts.map((character) => (
                  <CharacterSummaryCard
                    key={character.id}
                    character={character}
                    active={character.id === selectedCharacter?.id}
                    duplicate={duplicateIds.has(character.id)}
                    onClick={() => setSelectedCharacterId(character.id)}
                  />
                ))}
                {!visibleDrafts.length && (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    {characterListMode === "duplicates" ? "중복 후보가 없습니다." : "표시할 캐릭터가 없습니다."}
                  </div>
                )}
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

        <aside className="space-y-4 self-start">
          {selectedStory && selectedCharacter && (
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
  const quality = characterQuality(character);

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
      const response = await fetchWithSupabaseAuth("/api/reader-profile-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storyId,
          characterId: character.id,
          name: character.name,
          bio: [character.role, character.persona, character.personality, character.relationship, character.speakingStyle]
            .filter(Boolean)
            .join("\n"),
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
      const modelInfo = [payload.providerLabel, payload.model].filter(Boolean).join(" / ");
      toast.success(`AI 캐릭터 이미지가 생성되었습니다.${modelInfo ? ` (${modelInfo})` : ""} 저장 버튼을 눌러 반영해주세요.`);
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
    <Card className="overflow-hidden xl:sticky xl:top-4">
      <CardHeader className="border-b border-border pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{character.name || "새 캐릭터"}</CardTitle>
            <CardDescription className="truncate">{storyTitle}</CardDescription>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {character.isPrimary && <Badge>대표</Badge>}
              {character.visibleInFrontend && <Badge variant="secondary">채팅 노출</Badge>}
              {character.chatEnabled && <Badge variant="secondary">채팅</Badge>}
              {character.reusable && <Badge variant="outline">재사용</Badge>}
              <Badge variant="outline">완성도 {quality.score}</Badge>
              {character.rankInStory && <Badge variant="outline">주요 #{character.rankInStory}</Badge>}
              {character.importanceScore !== undefined && (
                <Badge variant="outline">점수 {Number(character.importanceScore).toLocaleString()}</Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
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
        </div>
      </CardHeader>

      <CardContent className="max-h-[calc(100vh-11rem)] space-y-5 overflow-y-auto p-4">
        <section className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-3 rounded-xl border border-border bg-background p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-border bg-muted">
              {avatarPreview ? (
                <img src={avatarPreview} alt={character.name} className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center text-center text-xs text-muted-foreground">
                  <div>
                    <UserCircle2 className="mx-auto mb-2 size-10" />
                    대표 이미지 없음
                  </div>
                </div>
              )}
              <Badge className="absolute left-2 top-2">대표 이미지</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm hover:border-primary/50">
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
              <Button type="button" variant="outline" size="sm" onClick={generateAvatar} disabled={generating || uploading}>
                {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                AI 생성
              </Button>
            </div>
            <Field label="이미지 경로/URL">
              <Input
                value={character.avatarUrl ?? ""}
                onChange={(event) => onPatch({ avatarUrl: event.target.value || null })}
                placeholder="story-media 경로 또는 URL"
              />
            </Field>
          </div>

          <div className="space-y-4">
            <PanelSection title="기본 정보">
              <div className="grid gap-3 md:grid-cols-2">
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
                <Field label="별칭/중복명">
                  <Input
                    value={character.duplicateAliasesText}
                    onChange={(event) => {
                      const duplicateAliasesText = event.target.value;
                      onPatch({
                        duplicateAliasesText,
                        duplicateAliases: parseCharacterNameList(duplicateAliasesText),
                      });
                    }}
                    placeholder="정혁이, 김정혁 대표"
                  />
                </Field>
                <Field label="별개 유지명">
                  <Input
                    value={character.duplicateExclusionsText}
                    onChange={(event) => {
                      const duplicateExclusionsText = event.target.value;
                      onPatch({
                        duplicateExclusionsText,
                        duplicateExclusions: parseCharacterNameList(duplicateExclusionsText),
                      });
                    }}
                    placeholder="동명이인으로 유지할 이름"
                  />
                </Field>
              </div>
            </PanelSection>

            <PanelSection title="캐릭터채팅 노출">
              <div className="grid gap-2 md:grid-cols-3">
                <ToggleLine
                  checked={character.visibleInFrontend}
                  label="캐릭터채팅 노출"
                  text="ON인 캐릭터만 전시"
                  onChange={(checked) => onPatch({ visibleInFrontend: checked })}
                />
                <ToggleLine
                  checked={character.chatEnabled}
                  label="채팅 사용"
                  text="대화 후보에 포함"
                  onChange={(checked) => onPatch({ chatEnabled: checked })}
                />
                <ToggleLine checked={character.reusable} label="재사용 허용" text="다른 스토리에 복사" onChange={(checked) => onPatch({ reusable: checked })} />
              </div>
            </PanelSection>

            {(character.duplicateAliases?.length || character.chapterInsights?.length) && (
              <PanelSection title="중복/회차 근거">
                <div className="space-y-3">
                  {character.duplicateAliases?.length ? (
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">병합된 이름</div>
                      <div className="flex flex-wrap gap-1.5">
                        {character.duplicateAliases.map((alias) => (
                          <Badge key={alias} variant="outline">
                            {alias}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {character.chapterInsights?.length ? (
                    <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                      {character.chapterInsights.slice(-8).map((insight, index) => (
                        <div key={`${insight.chapterId}-${index}`} className="rounded-md border border-border bg-background p-2">
                          <div className="text-xs font-medium">
                            {insight.episodeNumber ? `${insight.episodeNumber}화` : "회차"} · {insight.chapterTitle || "근거"}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {insight.evidence || insight.chatGuidance || insight.relationship || "분석 근거가 저장되어 있습니다."}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </PanelSection>
            )}

            <PanelSection
              title="AI 이미지 프롬프트"
              action={
                <Button type="button" variant="outline" size="sm" onClick={generateAvatar} disabled={generating || uploading}>
                  {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  생성
                </Button>
              }
            >
              <Textarea
                value={character.visualPrompt}
                onChange={(event) => onPatch({ visualPrompt: event.target.value })}
                className="min-h-24"
                placeholder="외형, 분위기, 의상, 표정 등 이미지 생성에 사용할 묘사"
              />
            </PanelSection>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <PanelSection title="성격/페르소나">
            <div className="grid gap-3">
              <Field label="페르소나">
                <Textarea value={character.persona} onChange={(event) => onPatch({ persona: event.target.value })} className="min-h-24" />
              </Field>
              <Field label="성격">
                <Textarea value={character.personality} onChange={(event) => onPatch({ personality: event.target.value })} className="min-h-24" />
              </Field>
            </div>
          </PanelSection>

          <PanelSection title="대화/LLM 설정">
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
              <div className="grid grid-cols-2 gap-3">
                <Field label="사용처">
                  <select
                    value={character.llmPurpose ?? "chat"}
                    onChange={(event) => onPatch({ llmPurpose: event.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
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
            </div>
          </PanelSection>
        </section>

        <PanelSection
          title="호감도 해금 이미지"
          action={
            <Button type="button" variant="outline" size="sm" onClick={addVisualAsset}>
              <Plus className="size-4" />
              슬롯 추가
            </Button>
          }
        >
          {visualAssets.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              등록된 에셋이 없습니다. 슬롯을 추가한 뒤 이미지나 영상을 등록하세요.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visualAssets.map((asset) => (
                <CharacterVisualAssetEditor
                  key={asset.id}
                  storyId={storyId}
                  characterId={character.id}
                  asset={asset}
                  onPatch={(patch) => patchVisualAsset(asset.id, patch)}
                  onRemove={() => removeVisualAsset(asset.id)}
                />
              ))}
            </div>
          )}
        </PanelSection>

        <section className="grid gap-4 lg:grid-cols-2">
          <PanelSection title="재사용 캐릭터 가져오기">
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

          <PanelSection title="프롬프트 미리보기">
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
              {promptPreview}
            </pre>
          </PanelSection>
        </section>
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

function CharacterDuplicateReview({
  groups,
  onMergeGroup,
  onSeparateGroup,
  onSelectCharacter,
}: {
  groups: CharacterDuplicateGroup[];
  onMergeGroup: (characterIds: string[]) => void;
  onSeparateGroup: (characterIds: string[]) => void;
  onSelectCharacter: (characterId: string) => void;
}) {
  if (!groups.length) {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        중복 후보 없음 · 저장 시 이름 정규화 기준으로 한 번 더 검사합니다.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-amber-100">중복 후보 {groups.length}그룹</div>
          <div className="text-xs text-amber-100/75">성+이름, 호칭, 조사 변형까지 같은 캐릭터로 판단합니다.</div>
        </div>
      </div>
      <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
        {groups.map((group) => {
          const recommended = group.characters.find((character) => character.id === group.recommendedId) ?? group.characters[0];
          return (
            <div key={group.key} className="rounded-md border border-amber-500/25 bg-background/80 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{group.displayName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {group.aliases.join(" / ")} · 권장 기준 {recommended?.name}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant="outline" onClick={() => onSeparateGroup(group.characters.map((character) => character.id))}>
                    <Unlink2 className="size-4" />
                    별개 유지
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onMergeGroup(group.characters.map((character) => character.id))}>
                    <CheckCircle2 className="size-4" />
                    병합
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {group.characters.map((character) => (
                  <button
                    type="button"
                    key={character.id}
                    onClick={() => onSelectCharacter(character.id)}
                    className={`rounded-md border px-2 py-1 text-[11px] transition ${
                      character.id === group.recommendedId
                        ? "border-primary/45 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {character.name || "이름 없음"} · 주요 {Number(character.importanceScore ?? 0).toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CharacterSummaryCard({
  character,
  active,
  duplicate,
  onClick,
}: {
  character: CharacterDraft;
  active: boolean;
  duplicate: boolean;
  onClick: () => void;
}) {
  const quality = characterQuality(character);
  const avatarPreview = useSignedCharacterImage(character.avatarUrl);
  const importance = Math.max(0, Number(character.importanceScore ?? 0));
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
        active
          ? "border-primary/50 bg-primary/10"
          : duplicate
            ? "border-amber-500/45 bg-amber-500/10 hover:border-amber-400/70"
            : "border-border bg-background hover:border-primary/30"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted">
          {avatarPreview ? (
            <img src={avatarPreview} alt={character.name} className="size-full object-cover" />
          ) : (
            <UserCircle2 className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{character.name || "이름 없음"}</span>
            {character.isPrimary && <Star className="size-3.5 fill-primary text-primary" />}
            {character.visibleInFrontend && <Eye className="size-3.5 text-primary" />}
            {character.chatEnabled && <MessageCircle className="size-3.5 text-primary" />}
            {duplicate && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-amber-300">
                중복
              </Badge>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{character.role || "역할 미입력"}</div>
          <div className="mt-1 flex min-w-0 items-center gap-1">
            {character.rankInStory && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                #{character.rankInStory}
              </Badge>
            )}
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
            {character.visibleInFrontend && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                채팅노출
              </Badge>
            )}
          </div>
        </div>
        <div className="w-16 shrink-0 text-right">
          <div className="text-[11px] font-semibold text-muted-foreground">완성 {quality.score}</div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${quality.score}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">주요 {importance.toLocaleString()}</div>
          {quality.missing.length > 0 && (
            <div className="mt-1 text-[10px] text-amber-300">{quality.missing.length}개 부족</div>
          )}
        </div>
      </div>
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

function draftTagList(character: CharacterDraft) {
  return [...(character.tags ?? []), ...character.tagsText.split(",")]
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCharacterNameList(value: string) {
  return [...new Set(
    value
      .split(/[,，、/|]/)
      .map((item) => cleanCharacterDisplayName(item))
      .filter(Boolean),
  )].slice(0, 20);
}

function mergeCharacterNameList(...lists: Array<Iterable<string> | undefined>) {
  return [...new Set(
    lists
      .flatMap((list) => (list ? [...list] : []))
      .map((item) => cleanCharacterDisplayName(String(item ?? "")))
      .filter(Boolean),
  )].slice(0, 20);
}

function characterDraftNameSet(character: CharacterDraft) {
  return [character.name, ...(character.duplicateAliases ?? [])].filter(Boolean);
}

function characterDraftNamesLikelySame(
  a: CharacterDraft,
  b: CharacterDraft,
  blockedGivenKeys: ReadonlySet<string>,
) {
  return characterNameSetsLikelySame(characterDraftNameSet(a), characterDraftNameSet(b), {
    blockedGivenKeys,
    aExcludedNames: a.duplicateExclusions ?? [],
    bExcludedNames: b.duplicateExclusions ?? [],
  });
}

function characterManagementScore(character: CharacterDraft) {
  const quality = characterQuality(character).score;
  const importance = Math.max(0, Number(character.importanceScore ?? 0));
  const insights = Math.min(character.chapterInsights?.length ?? 0, 20) * 4;
  const imageBonus = character.avatarUrl ? 12 : 0;
  const visibilityBonus = character.visibleInFrontend ? 10 : 0;
  const chatBonus = character.chatEnabled ? 6 : 0;
  const primaryBonus = character.isPrimary ? 1000 : 0;
  return primaryBonus + importance + quality + insights + imageBonus + visibilityBonus + chatBonus;
}

function compareCharacterDrafts(a: CharacterDraft, b: CharacterDraft) {
  const scoreDelta = characterManagementScore(b) - characterManagementScore(a);
  if (scoreDelta !== 0) return scoreDelta;
  return a.name.localeCompare(b.name, "ko");
}

function sortCharacterDraftsForManagement(characters: CharacterDraft[]) {
  return [...characters].sort(compareCharacterDrafts);
}

function ensureSinglePrimaryDraft(characters: CharacterDraft[]) {
  if (!characters.length) return characters;
  const primaryId = characters.find((character) => character.isPrimary)?.id ?? characters[0].id;
  return characters.map((character) => ({ ...character, isPrimary: character.id === primaryId }));
}

function buildCharacterDuplicateGroups(characters: CharacterDraft[]): CharacterDuplicateGroup[] {
  const byKey = new Map<string, CharacterDraft[]>();
  const blockedGivenKeys = ambiguousKoreanGivenNameKeys(characters.map(characterDraftNameSet));
  for (const character of characters) {
    const key = normalizeCharacterNameKey(character.name);
    if (!key) continue;

    let matchKey = byKey.has(key) ? key : "";
    if (!matchKey) {
      for (const [currentKey, currentRows] of byKey.entries()) {
        if (currentRows.some((current) => characterDraftNamesLikelySame(current, character, blockedGivenKeys))) {
          matchKey = currentKey;
          break;
        }
      }
    }

    const nextRows = [...(matchKey ? byKey.get(matchKey) ?? [] : []), character];
    const displayName = nextRows.reduce(
      (currentName, row) => preferredCharacterDisplayName(currentName, row.name) || currentName || row.name,
      "",
    );
    const nextKey = normalizeCharacterNameKey(displayName) || matchKey || key;
    if (matchKey && nextKey !== matchKey) byKey.delete(matchKey);
    byKey.set(nextKey, nextRows);
  }

  return [...byKey.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => {
      const sorted = sortCharacterDraftsForManagement(rows);
      const displayName = rows.reduce(
        (currentName, row) => preferredCharacterDisplayName(currentName, row.name) || currentName || row.name,
        "",
      );
      const aliases = [
        displayName,
        ...rows.flatMap((row) => [row.name, ...(row.duplicateAliases ?? [])]),
      ]
        .map((value) => cleanCharacterDisplayName(String(value ?? "")))
        .filter(Boolean);
      return {
        key,
        displayName: displayName || sorted[0].name || "이름 없음",
        aliases: [...new Set(aliases)].slice(0, 8),
        characters: sorted,
        recommendedId: sorted[0].id,
      };
    })
    .sort((a, b) => b.characters.length - a.characters.length || a.displayName.localeCompare(b.displayName, "ko"));
}

function pickRichText(characters: CharacterDraft[], key: keyof CharacterDraft) {
  return characters
    .map((character) => String(character[key] ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? "";
}

function mergeDraftVisualAssets(characters: CharacterDraft[]) {
  const byKey = new Map<string, NonNullable<CharacterDraft["showcaseAssets"]>[number]>();
  for (const asset of characters.flatMap((character) => character.showcaseAssets ?? [])) {
    const key = String(asset.mediaUrl ?? asset.id ?? "").trim();
    if (!key || byKey.has(key)) continue;
    byKey.set(key, asset);
  }
  return [...byKey.values()].slice(0, 20);
}

function mergeDraftChapterInsights(characters: CharacterDraft[]) {
  const byKey = new Map<string, NonNullable<CharacterDraft["chapterInsights"]>[number]>();
  for (const insight of characters.flatMap((character) => character.chapterInsights ?? [])) {
    const key = String(insight.chapterId || `${insight.episodeNumber}:${insight.evidence ?? ""}`).trim();
    if (!key || byKey.has(key)) continue;
    byKey.set(key, insight);
  }
  return [...byKey.values()].sort((a, b) => Number(a.episodeNumber ?? 0) - Number(b.episodeNumber ?? 0)).slice(-30);
}

function mergeCharacterDraftGroup(characters: CharacterDraft[]) {
  const sorted = sortCharacterDraftsForManagement(characters);
  const base = sorted[0];
  const displayName = characters.reduce(
    (currentName, character) => preferredCharacterDisplayName(currentName, character.name) || currentName || character.name,
    base.name,
  );
  const tags = [...new Set(characters.flatMap(draftTagList))].slice(0, 12);
  const duplicateAliases = [
    ...characters.flatMap((character) => [character.name, ...(character.duplicateAliases ?? [])]),
  ]
    .map((value) => cleanCharacterDisplayName(String(value ?? "")))
    .filter((value) => value && normalizeCharacterNameKey(value) !== normalizeCharacterNameKey(displayName));
  const mergedNameKeys = new Set([displayName, ...duplicateAliases].map(normalizeCharacterNameKey).filter(Boolean));
  const duplicateExclusions = mergeCharacterNameList(...characters.map((character) => character.duplicateExclusions)).filter(
    (value) => !mergedNameKeys.has(normalizeCharacterNameKey(value)),
  );

  return {
    ...base,
    name: displayName || base.name,
    role: pickRichText(characters, "role") || base.role,
    persona: pickRichText(characters, "persona") || base.persona,
    personality: pickRichText(characters, "personality") || base.personality,
    relationship: pickRichText(characters, "relationship") || base.relationship,
    speakingStyle: pickRichText(characters, "speakingStyle") || base.speakingStyle,
    replyPattern: pickRichText(characters, "replyPattern") || base.replyPattern,
    llmPurpose: base.llmPurpose ?? "chat",
    llmModel: pickRichText(characters, "llmModel") || base.llmModel,
    visualPrompt: pickRichText(characters, "visualPrompt") || base.visualPrompt,
    avatarUrl: sorted.find((character) => character.avatarUrl)?.avatarUrl ?? null,
    tags,
    tagsText: tags.join(", "),
    isPrimary: characters.some((character) => character.isPrimary),
    chatEnabled: characters.some((character) => character.chatEnabled),
    visibleInFrontend: characters.some((character) => character.visibleInFrontend),
    reusable: characters.some((character) => character.reusable),
    showcaseAssets: mergeDraftVisualAssets(characters),
    chapterInsights: mergeDraftChapterInsights(characters),
    duplicateAliases: [...new Set(duplicateAliases)].slice(0, 8),
    duplicateAliasesText: [...new Set(duplicateAliases)].slice(0, 8).join(", "),
    duplicateExclusions,
    duplicateExclusionsText: duplicateExclusions.join(", "),
    importanceScore: characters.reduce((sum, character) => sum + Math.max(0, Number(character.importanceScore ?? 0)), 0),
    dialogueCount: characters.reduce((sum, character) => sum + Math.max(0, Number(character.dialogueCount ?? 0)), 0),
    mentionCount: characters.reduce((sum, character) => sum + Math.max(0, Number(character.mentionCount ?? 0)), 0),
    rankInStory: Math.min(...characters.map((character) => Number(character.rankInStory ?? 9999))),
  } satisfies CharacterDraft;
}

function mergeDuplicateCharacterDrafts(characters: CharacterDraft[]) {
  const duplicateGroups = buildCharacterDuplicateGroups(characters);
  if (!duplicateGroups.length) return characters;
  const mergedIds = new Set(duplicateGroups.flatMap((group) => group.characters.map((character) => character.id)));
  return [
    ...characters.filter((character) => !mergedIds.has(character.id)),
    ...duplicateGroups.map((group) => mergeCharacterDraftGroup(group.characters)),
  ];
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
  storyId,
  characterId,
  asset,
  onPatch,
  onRemove,
}: {
  storyId: string;
  characterId: string;
  asset: NonNullable<CharacterDraft["showcaseAssets"]>[number];
  onPatch: (patch: Partial<NonNullable<CharacterDraft["showcaseAssets"]>[number]>) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const previewUrl = useSignedCharacterImage(asset.mediaUrl);
  const tierInfo = VISUAL_TIERS.find((item) => item.tier === asset.tier) ?? VISUAL_TIERS[0];

  async function uploadAsset(file: File | null) {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      toast.error("이미지 또는 영상 파일만 등록할 수 있습니다.");
      return;
    }
    setUploading(true);
    try {
      await ensureStoryMediaBucket();
      const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "png");
      const safeCharacterId = characterId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
      const safeAssetId = asset.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
      const key = `characters/${storyId}/${safeCharacterId}/showcase/${safeAssetId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("story-media")
        .upload(key, file, { upsert: true, contentType: file.type || undefined });
      if (error) throw error;
      onPatch({ mediaUrl: key, mediaType: isVideo ? "video" : "image" });
      toast.success("해금 에셋이 등록되었습니다.");
    } catch (error: any) {
      toast.error(error?.message ?? "에셋 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

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
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <select
            value={asset.mediaType}
            onChange={(event) => onPatch({ mediaType: event.target.value === "video" ? "video" : "image" })}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="image">이미지</option>
            <option value="video">영상</option>
          </select>
          <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm hover:border-primary/50">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            업로드
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              disabled={uploading}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                event.currentTarget.value = "";
                void uploadAsset(file);
              }}
            />
          </label>
        </div>
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
    visibleInFrontend: false,
    reusable: true,
    showcaseAssets: [],
  };
}

function toDraft(character: StoryCharacter): CharacterDraft {
  return {
    ...character,
    visibleInFrontend: character.visibleInFrontend === true,
    tagsText: character.tags.join(", "),
    duplicateAliasesText: (character.duplicateAliases ?? []).join(", "),
    duplicateExclusionsText: (character.duplicateExclusions ?? []).join(", "),
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
    visibleInFrontend: character.visibleInFrontend === true,
    reusable: character.reusable,
    showcaseAssets: character.showcaseAssets ?? [],
    chapterInsights: character.chapterInsights ?? [],
    duplicateAliases: parseCharacterNameList(character.duplicateAliasesText),
    duplicateExclusions: parseCharacterNameList(character.duplicateExclusionsText),
  };
}
