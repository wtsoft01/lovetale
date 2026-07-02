import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  Copy,
  Library,
  Loader2,
  MessageCircle,
  Plus,
  Save,
  Search,
  Star,
  Trash2,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";

import {
  listCharacterStories,
  saveStoryCharacters,
  type CharacterStoryRow,
  type StoryCharacter,
} from "@/lib/admin-characters.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/characters")({
  head: () => ({ meta: [{ title: "Characters | Studio" }] }),
  component: CharactersPage,
});

type CharacterDraft = StoryCharacter & {
  tagsText: string;
};

function CharactersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listCharacterStories);
  const save = useServerFn(saveStoryCharacters);

  const [q, setQ] = useState("");
  const [selectedStoryId, setSelectedStoryId] = useState("");
  const [storyOverview, setStoryOverview] = useState("");
  const [drafts, setDrafts] = useState<CharacterDraft[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");

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
          <h1 className="mt-1 font-display text-3xl font-semibold">캐릭터 관리</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            각 스토리의 상대 주인공을 등록하고, 채팅 말투와 성격을 관리하며, 재사용 가능한 캐릭터 라이브러리로 보관합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill icon={UserCircle2} label="스토리" value={stories.length} />
          <StatusPill icon={Library} label="재사용 캐릭터" value={reusableCharacters.length} />
          <StatusPill icon={MessageCircle} label="대화 가능" value={chatEnabledCount} />
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>스토리 선택</CardTitle>
            <CardDescription>스토리별 주인공과 대화 상대를 관리합니다.</CardDescription>
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
                        <div className="truncate text-sm font-medium">{story.storyTitle}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          대표: {story.activeCharacterName}
                        </div>
                      </div>
                      <Badge variant="secondary">{story.characters.length}</Badge>
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
                <div className="flex gap-2">
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
                  <button
                    type="button"
                    key={character.id}
                    onClick={() => setSelectedCharacterId(character.id)}
                    className={`rounded-lg border p-3 text-left transition ${
                      character.id === selectedCharacter?.id
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
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedCharacter && (
            <CharacterEditor
              character={selectedCharacter}
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
  character,
  onPatch,
  onPrimary,
  onDuplicate,
  onRemove,
  canRemove,
}: {
  character: CharacterDraft;
  onPatch: (patch: Partial<CharacterDraft>) => void;
  onPrimary: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
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
  };
}
