import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Bookmark, Gamepad2, Heart, HeartHandshake, ImageIcon, Loader2, Lock, MessageCircle, Plus, Save, Search, Sparkles, Trash2, UserRound, Video, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@/lib/_mock/runtime";
import {
  listPublicChatCharacters,
  type PublicChatCharacterRow,
} from "@/lib/admin-characters.functions";
import { listMySessions } from "@/lib/sessions.functions";
import { resolveStoryMediaSource } from "@/lib/story-media-url";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chats")({
  head: () => ({
    meta: [
      { title: "캐릭터채팅 | Lovetale" },
      {
        name: "description",
        content: "스토리와 스토리게임 속 주요 인물을 선택해 실제 대화처럼 이어갑니다.",
      },
    ],
  }),
  component: Chats,
});

type Row = {
  id: string;
  story_id: string;
  character_id: string | null;
  current_node: string;
  affection: number;
  mode: string;
  is_completed: boolean;
  is_bookmarked: boolean;
  ending_id: string | null;
  updated_at: string;
};

type CharacterGender = "all" | "male" | "female" | "neutral";

type MyChatCharacter = {
  id: string;
  name: string;
  gender: Exclude<CharacterGender, "all">;
  concept: string;
  mood: string;
  mediaType: "image" | "video";
  mediaUrl: string | null;
  signedUrl?: string | null;
  prompt?: string;
  createdAt: string;
  updatedAt: string;
};

const GENDER_FILTERS: { value: CharacterGender; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "male", label: "남성" },
  { value: "female", label: "여성" },
  { value: "neutral", label: "중성" },
];

const MY_CHARACTER_STORAGE_PREFIX = "lovetale:my-chat-characters:";

function myCharacterStorageKey(userId?: string | null) {
  return `${MY_CHARACTER_STORAGE_PREFIX}${userId || "anon"}`;
}

function loadMyCharacters(userId?: string | null): MyChatCharacter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(myCharacterStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMyCharacters(userId: string | undefined | null, rows: MyChatCharacter[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(myCharacterStorageKey(userId), JSON.stringify(rows.slice(0, 20)));
}

function timeAgo(iso: string) {
  const time = new Date(iso).getTime();
  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function inferGender(character: PublicChatCharacterRow): Exclude<CharacterGender, "all"> {
  const text = [
    character.role,
    character.persona,
    character.personality,
    character.visualPrompt,
    character.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  if (/(남성|남자|남주|남편|오빠|형|아버지|아빠|ceo|male|man|boy|he\b|him\b)/i.test(text)) return "male";
  if (/(여성|여자|여주|아내|언니|누나|엄마|female|woman|girl|she\b|her\b)/i.test(text)) return "female";
  return "neutral";
}

function getAffectionForProfile(profile: PublicChatCharacterRow, rows: Row[] | null) {
  const matched = (rows ?? []).filter(
    (row) => row.character_id === profile.id || row.story_id === profile.storyId,
  );
  if (matched.length === 0) return { affection: 0, row: null as Row | null };
  const sorted = [...matched].sort((a, b) => b.affection - a.affection);
  return { affection: sorted[0]?.affection ?? 0, row: sorted[0] ?? null };
}

function useSignedMedia(path?: string | null) {
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

function Chats() {
  const { user, loading } = useAuth();
  const listSessions = useServerFn(listMySessions);
  const listCharacters = useServerFn(listPublicChatCharacters);
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState<CharacterGender>("all");
  const [storyFilter, setStoryFilter] = useState("all");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [myCharacters, setMyCharacters] = useState<MyChatCharacter[]>([]);

  useEffect(() => {
    setMyCharacters(loadMyCharacters(user?.id));
  }, [user?.id]);

  function persistMyCharacters(next: MyChatCharacter[]) {
    setMyCharacters(next);
    saveMyCharacters(user?.id, next);
  }

  function upsertMyCharacter(character: MyChatCharacter) {
    persistMyCharacters([character, ...myCharacters.filter((item) => item.id !== character.id)]);
  }

  function removeMyCharacter(id: string) {
    persistMyCharacters(myCharacters.filter((item) => item.id !== id));
  }

  const charactersQ = useQuery({
    queryKey: ["public_chat_characters"],
    queryFn: () => listCharacters(),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
  });
  const sessionsQ = useQuery({
    queryKey: ["my_story_sessions", user?.id ?? "anon"],
    queryFn: () => listSessions() as Promise<Row[]>,
    enabled: !loading && Boolean(user),
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const characters = charactersQ.data ?? null;
  const rows = user ? (sessionsQ.data ?? null) : [];

  const filteredProfiles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return (characters ?? [])
      .filter((profile) => {
        const inferredGender = inferGender(profile);
        const matchesGender = gender === "all" || inferredGender === gender;
        if (!matchesGender) return false;
        if (storyFilter !== "all" && profile.storyId !== storyFilter) return false;
        if (!keyword) return true;
        return [
          profile.name,
          profile.storyTitle,
          profile.role,
          profile.persona,
          profile.personality,
          profile.relationship,
          ...profile.tags,
        ].some((value) => String(value ?? "").toLowerCase().includes(keyword));
      })
      .toSorted((a, b) => {
        const imageDelta = Number(Boolean(b.avatarUrl)) - Number(Boolean(a.avatarUrl));
        if (imageDelta !== 0) return imageDelta;
        return (b.mainScore ?? 0) - (a.mainScore ?? 0);
      });
  }, [characters, gender, query, storyFilter]);

  const storyFilters = useMemo(() => {
    const byStory = new Map<string, { id: string; title: string; count: number; type: PublicChatCharacterRow["contentType"] }>();
    for (const profile of characters ?? []) {
      const current = byStory.get(profile.storyId) ?? {
        id: profile.storyId,
        title: profile.storyTitle,
        count: 0,
        type: profile.contentType,
      };
      current.count += 1;
      byStory.set(profile.storyId, current);
    }
    return [...byStory.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  }, [characters]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8">
      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 rounded-full px-2.5 py-1 text-[11px]">
            <HeartHandshake className="size-3" />
            CHAT
          </Badge>
          <h1 className="text-base font-semibold">캐릭터채팅</h1>
          {characters ? <span className="text-xs text-muted-foreground">{filteredProfiles.length}</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="w-fit gap-1.5 rounded-full" onClick={() => setCreatorOpen(true)}>
            <Plus className="size-4" />
            내 캐릭터 만들기
          </Button>
          <Button asChild variant="outline" size="sm" className="w-fit gap-1.5 rounded-full">
            <Link to="/explore">
              <Sparkles className="size-4" />
              스토리탐색
            </Link>
          </Button>
        </div>
      </section>

      <MyCharacterStrip rows={myCharacters} onCreate={() => setCreatorOpen(true)} onRemove={removeMyCharacter} />

      <section className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="스토리명 또는 캐릭터 이름 검색"
            className="h-11 rounded-full border-border/60 bg-card/40 pl-9"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {GENDER_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setGender(option.value)}
              className={`h-8 shrink-0 rounded-full border px-3 text-xs transition ${
                gender === option.value
                  ? "border-primary/60 bg-primary text-primary-foreground"
                  : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setStoryFilter("all")}
            className={`h-8 shrink-0 rounded-full border px-3 text-xs transition ${
              storyFilter === "all"
                ? "border-sky-400/70 bg-sky-500 text-white"
                : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            모든 콘텐츠
          </button>
          {storyFilters.map((story) => (
            <button
              key={story.id}
              type="button"
              onClick={() => setStoryFilter(story.id)}
              className={`h-8 max-w-[240px] shrink-0 rounded-full border px-3 text-xs transition ${
                storyFilter === story.id
                  ? "border-sky-400/70 bg-sky-500 text-white"
                  : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
              }`}
              title={story.title}
            >
              <span className="inline-flex max-w-[170px] items-center gap-1 truncate">
                {story.type === "story_rpg" && <Gamepad2 className="size-3" />}
                {story.title}
              </span>
              <span className="ml-1 opacity-70">{story.count}</span>
            </button>
          ))}
        </div>
      </section>

      {characters === null && (
        <EmptyPanel>
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          불러오는 중
        </EmptyPanel>
      )}

      {user && rows === null && (
        <EmptyPanel>
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          대화 기록 확인 중
        </EmptyPanel>
      )}

      {!user && !loading && (
        <EmptyPanel>
          로그인하면 호감도와 대화가 저장됩니다.{" "}
          <Link to="/auth" className="text-primary hover:underline">
            로그인하기
          </Link>
        </EmptyPanel>
      )}

      {characters !== null && filteredProfiles.length === 0 ? (
        <EmptyPanel>
          조건에 맞는 캐릭터가 없습니다.
        </EmptyPanel>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filteredProfiles.map((profile) => (
            <CharacterDatingCard
              key={`${profile.storyId}-${profile.id}`}
              profile={profile}
              affectionInfo={getAffectionForProfile(profile, rows)}
            />
          ))}
        </section>
      )}

      <MyCharacterDialog
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
        userReady={Boolean(user)}
        onSave={upsertMyCharacter}
      />
    </div>
  );
}

function MyCharacterStrip({
  rows,
  onCreate,
  onRemove,
}: {
  rows: MyChatCharacter[];
  onCreate: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/35 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserRound className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">내 채팅 캐릭터</h2>
          <span className="text-xs text-muted-foreground">{rows.length}</span>
        </div>
        <Button size="sm" className="h-8 rounded-full" onClick={onCreate}>
          <Plus className="size-4" />
          만들기
        </Button>
      </div>
      {rows.length === 0 ? (
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/40 p-5 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
        >
          <Wand2 className="size-4" />
          이름과 이미지/영상으로 나만의 채팅 캐릭터를 만들어보세요.
        </button>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {rows.map((character) => (
            <MyCharacterCard key={character.id} character={character} onRemove={() => onRemove(character.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function MyCharacterCard({ character, onRemove }: { character: MyChatCharacter; onRemove: () => void }) {
  const mediaUrl = useSignedMedia(character.mediaUrl);
  return (
    <article className="group relative w-40 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-background">
      <div className="aspect-[4/5] bg-muted">
        {mediaUrl ? (
          character.mediaType === "video" ? (
            <video src={mediaUrl} className="size-full object-cover" muted playsInline loop />
          ) : (
            <img src={mediaUrl} alt={character.name} className="size-full object-cover" />
          )
        ) : (
          <div className="grid size-full place-items-center bg-gradient-to-br from-primary/20 via-background to-sky-500/15">
            <UserRound className="size-9 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <div className="truncate text-sm font-semibold">{character.name}</div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {character.mediaType === "video" ? <Video className="size-3" /> : <ImageIcon className="size-3" />}
          {character.gender === "male" ? "남성" : character.gender === "female" ? "여성" : "중성"}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
        aria-label="내 캐릭터 삭제"
      >
        <Trash2 className="size-3.5" />
      </button>
    </article>
  );
}

function MyCharacterDialog({
  open,
  onOpenChange,
  userReady,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userReady: boolean;
  onSave: (character: MyChatCharacter) => void;
}) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Exclude<CharacterGender, "all">>("female");
  const [concept, setConcept] = useState("");
  const [mood, setMood] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");

  async function postToCharacterApi(body: Record<string, unknown>) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error("로그인이 필요합니다.");
    const response = await fetch("/api/my-chat-character", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || payload?.reason || "AI 생성에 실패했습니다.");
    }
    return payload;
  }

  const nameM = useMutation({
    mutationFn: () => postToCharacterApi({ action: "name", gender, concept, mood }),
    onSuccess: (payload) => {
      setName(String(payload.name ?? ""));
      toast.success("이름을 생성했습니다.");
    },
    onError: (error: Error) => toast.error(error.message || "이름 생성에 실패했습니다."),
  });

  const mediaM = useMutation({
    mutationFn: () => postToCharacterApi({ action: "media", kind: mediaType, name, gender, concept, mood }),
    onSuccess: (payload) => {
      setMediaType(payload.kind === "video" ? "video" : "image");
      setMediaUrl(payload.storagePath ?? null);
      setSignedUrl(payload.signedUrl ?? null);
      setPrompt(payload.prompt ?? "");
      toast.success(mediaType === "video" ? "캐릭터 영상을 생성했습니다." : "캐릭터 이미지를 생성했습니다.");
    },
    onError: (error: Error) => toast.error(error.message || "미디어 생성에 실패했습니다."),
  });

  function reset() {
    setName("");
    setGender("female");
    setConcept("");
    setMood("");
    setMediaType("image");
    setMediaUrl(null);
    setSignedUrl(null);
    setPrompt("");
  }

  function save() {
    if (!userReady) {
      toast.error("로그인 후 저장할 수 있습니다.");
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("캐릭터 이름을 입력하거나 AI로 생성해주세요.");
      return;
    }
    const now = new Date().toISOString();
    onSave({
      id: `my_char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: trimmedName,
      gender,
      concept: concept.trim(),
      mood: mood.trim(),
      mediaType,
      mediaUrl,
      signedUrl,
      prompt,
      createdAt: now,
      updatedAt: now,
    });
    toast.success("내 채팅 캐릭터를 저장했습니다.");
    onOpenChange(false);
    reset();
  }

  const resolvedMediaUrl = useSignedMedia(mediaUrl);
  const previewUrl = signedUrl || resolvedMediaUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>내 채팅 캐릭터 만들기</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 p-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-muted">
              {previewUrl ? (
                mediaType === "video" ? (
                  <video src={previewUrl} className="size-full object-cover" controls muted playsInline />
                ) : (
                  <img src={previewUrl} alt={name || "내 캐릭터"} className="size-full object-cover" />
                )
              ) : (
                <div className="grid size-full place-items-center bg-gradient-to-br from-primary/20 via-background to-sky-500/15">
                  <UserRound className="size-12 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={mediaType === "image" ? "default" : "outline"} size="sm" onClick={() => setMediaType("image")}>
                <ImageIcon className="size-4" />
                이미지
              </Button>
              <Button type="button" variant={mediaType === "video" ? "default" : "outline"} size="sm" onClick={() => setMediaType("video")}>
                <Video className="size-4" />
                영상
              </Button>
            </div>
            <Button type="button" className="w-full" onClick={() => mediaM.mutate()} disabled={!userReady || mediaM.isPending}>
              {mediaM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              {mediaType === "video" ? "AI 영상 생성" : "AI 이미지 생성"}
            </Button>
          </div>

          <div className="space-y-3">
            {!userReady && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                로그인 후 AI 생성과 저장을 사용할 수 있습니다.
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="캐릭터 이름" />
              <Button type="button" variant="outline" onClick={() => nameM.mutate()} disabled={!userReady || nameM.isPending}>
                {nameM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                이름 생성
              </Button>
            </div>
            <select
              value={gender}
              onChange={(event) => setGender(event.target.value as Exclude<CharacterGender, "all">)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="female">여성 캐릭터</option>
              <option value="male">남성 캐릭터</option>
              <option value="neutral">중성 캐릭터</option>
            </select>
            <Input value={mood} onChange={(event) => setMood(event.target.value)} placeholder="분위기: 다정함, 도도함, 위험한 매력..." />
            <Textarea
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
              className="min-h-32"
              placeholder="캐릭터 설정, 외형, 성격, 채팅에서 보여줄 말투나 분위기를 적어주세요."
            />
            {prompt && (
              <div className="rounded-xl border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
                {prompt}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="border-t border-border px-5 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button type="button" onClick={save} disabled={!userReady}>
            <Save className="size-4" />
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function CharacterDatingCard({
  profile,
  affectionInfo,
}: {
  profile: PublicChatCharacterRow;
  affectionInfo: { affection: number; row: Row | null };
}) {
  const affection = affectionInfo.affection;
  const gender = inferGender(profile);
  const genderLabel = gender === "male" ? "남성" : gender === "female" ? "여성" : "중성";
  const avatarUrl = useSignedMedia(profile.avatarUrl || profile.coverUrl);
  const description = profile.persona || profile.personality || profile.relationship || profile.logline;
  const rankLabel = profile.rankInStory ? `주요 ${profile.rankInStory}순위` : "주요 인물";
  const contentLabel = profile.contentType === "story_rpg" ? "스토리게임" : "스토리";

  const card = (
    <>
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={profile.name}
            className="size-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <VirtualCharacterPortrait profile={profile} gender={gender} />
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 via-black/40 to-transparent p-3 text-white">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold leading-tight">{profile.name}</div>
              <div className="mt-1 truncate text-xs text-white/70">{profile.role || "스토리 주요 인물"}</div>
            </div>
            {affectionInfo.row?.is_bookmarked && (
              <Bookmark className="size-4 shrink-0 fill-primary text-primary" />
            )}
          </div>
        </div>

        <div className="absolute left-2 top-2 flex gap-1.5">
          <span className="rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
            {genderLabel}
          </span>
          <span className="rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground backdrop-blur">
            {rankLabel}
          </span>
          <span className="rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
            {contentLabel}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <p className="line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
          {description || "캐릭터 정보 준비 중"}
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3 text-primary" />
              나와의 호감도
            </span>
            <span className="font-medium tabular-nums text-foreground">{affection}</span>
          </div>
          <Progress value={affection} className="h-1.5" />
        </div>

        <CharacterUnlockPreview assets={profile.showcaseAssets ?? []} affection={affection} />

        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{profile.storyTitle}</span>
          {affectionInfo.row ? (
            <span className="shrink-0">{timeAgo(affectionInfo.row.updated_at)}</span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 text-primary">
              <MessageCircle className="size-3" />
              대화 시작
            </span>
          )}
        </div>

        {profile.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {profile.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (profile.contentType === "story_rpg") {
    return (
      <Link
        to="/chats/$storyId/$characterId"
        params={{ storyId: profile.storyId, characterId: profile.id }}
        className="group min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/45 transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-card/80"
      >
        {card}
      </Link>
    );
  }

  return (
    <Link
      to="/chats/$storyId/$characterId"
      params={{ storyId: profile.storyId, characterId: profile.id }}
      className="group min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/45 transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-card/80"
    >
      {card}
    </Link>
  );
}

function CharacterUnlockPreview({
  assets,
  affection,
}: {
  assets: NonNullable<PublicChatCharacterRow["showcaseAssets"]>;
  affection: number;
}) {
  const preview = assets.slice(0, 5);
  if (preview.length === 0) {
    return (
      <div className="grid grid-cols-5 gap-1">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="grid aspect-square place-items-center rounded-lg border border-dashed border-border/70 bg-muted/30">
            <LockPreviewIcon />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-5 gap-1">
      {preview.map((asset) => (
        <UnlockPreviewThumb key={asset.id} asset={asset} affection={affection} />
      ))}
    </div>
  );
}

function UnlockPreviewThumb({
  asset,
  affection,
}: {
  asset: NonNullable<PublicChatCharacterRow["showcaseAssets"]>[number];
  affection: number;
}) {
  const url = useSignedMedia(asset.mediaUrl);
  const locked = affection < asset.minAffection;
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-muted/40">
      {url ? (
        asset.mediaType === "video" ? (
          <video src={url} className={cn("size-full object-cover", locked && "blur-sm saturate-50")} muted playsInline />
        ) : (
          <img src={url} alt="" className={cn("size-full object-cover", locked && "blur-sm saturate-50")} />
        )
      ) : (
        <div className="grid size-full place-items-center">
          <LockPreviewIcon />
        </div>
      )}
      {locked && (
        <>
          <div className="absolute inset-0 bg-black/35" />
          <span className="absolute left-1 top-1 rounded bg-rose-500 px-1 text-[8px] font-black leading-4 text-white">19+</span>
        </>
      )}
    </div>
  );
}

function LockPreviewIcon() {
  return <Lock className="size-3 text-muted-foreground/60" />;
}
function VirtualCharacterPortrait({
  profile,
  gender,
}: {
  profile: PublicChatCharacterRow;
  gender: Exclude<CharacterGender, "all">;
}) {
  const seed = hashText(`${profile.storyId}:${profile.id}:${profile.name}`);
  const palettes =
    gender === "male"
      ? [
          ["#38bdf8", "#7c3aed", "#09090f"],
          ["#60a5fa", "#ef4444", "#111827"],
        ]
      : gender === "female"
        ? [
            ["#ec4899", "#fb7185", "#160711"],
            ["#f472b6", "#a78bfa", "#100719"],
          ]
        : [
            ["#f59e0b", "#22c55e", "#101014"],
            ["#d946ef", "#38bdf8", "#020617"],
          ];
  const palette = palettes[seed % palettes.length];
  const faceColor = gender === "male" ? "#f1c2a4" : gender === "female" ? "#ffd0c6" : "#efc3ad";
  const hairColor = gender === "male" ? "#141923" : gender === "female" ? "#2a1020" : "#171827";
  const shoulder = gender === "male" ? "w-[54%]" : gender === "female" ? "w-[46%]" : "w-[50%]";

  return (
    <div
      className="relative size-full overflow-hidden"
      style={{
        background:
          `radial-gradient(circle at 28% 18%, ${palette[1]}77, transparent 34%),` +
          `radial-gradient(circle at 75% 5%, ${palette[0]}55, transparent 30%),` +
          `linear-gradient(145deg, ${palette[2]}, #020617)`,
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,.10),transparent)] opacity-70" />
      <div className="absolute bottom-[-18%] h-[62%] w-[78%] rounded-t-full bg-black/30 blur-xl" />
      <div className={cn("absolute bottom-0 left-1/2 h-[34%] -translate-x-1/2 rounded-t-full opacity-90", shoulder)} style={{ background: `linear-gradient(135deg, ${palette[0]}, ${palette[1]})` }} />
      <div className="absolute left-1/2 top-[17%] h-[47%] w-[48%] -translate-x-1/2 rounded-[48%_48%_44%_44%] shadow-2xl" style={{ background: faceColor }} />
      <div className="absolute left-1/2 top-[12%] h-[30%] w-[56%] -translate-x-1/2 rounded-t-full" style={{ background: hairColor }} />
      <div className="absolute left-[29%] top-[37%] h-2.5 w-7 rounded-full bg-slate-950" />
      <div className="absolute right-[29%] top-[37%] h-2.5 w-7 rounded-full bg-slate-950" />
      <div className="absolute left-[31%] top-[36.5%] size-1.5 rounded-full" style={{ background: palette[0] }} />
      <div className="absolute right-[31%] top-[36.5%] size-1.5 rounded-full" style={{ background: palette[0] }} />
      <div className="absolute left-1/2 top-[48%] h-1.5 w-12 -translate-x-1/2 rounded-full bg-rose-700/70" />
      <div className="absolute bottom-14 left-1/2 max-w-[78%] -translate-x-1/2 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur">
        anime profile
      </div>
      <UserRound className="absolute right-4 top-4 size-8 text-white/16" />
    </div>
  );
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

