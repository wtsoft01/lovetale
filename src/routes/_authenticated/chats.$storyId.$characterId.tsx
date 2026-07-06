import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Heart,
  Image as ImageIcon,
  Loader2,
  Lock,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@/lib/_mock/runtime";
import { getMyStoryAffection, bumpMyStoryAffection } from "@/lib/affection.functions";
import {
  appendReaderChatMessage,
  listReaderChatMessages,
  type ReaderChatMessageRow,
} from "@/lib/reader-chat.functions";
import { getUnifiedReaderStory } from "@/lib/admin-stories-compose.functions";
import { supabase } from "@/integrations/supabase/client";
import { resolveStoryMediaSource } from "@/lib/story-media-url";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chats/$storyId/$characterId")({
  head: () => ({ meta: [{ title: "캐릭터채팅 - Lovetale" }] }),
  component: CharacterChatRoom,
});

type CharacterProfile = {
  id: string;
  name: string;
  role?: string;
  persona?: string;
  personality?: string;
  relationship?: string;
  speakingStyle?: string;
  notes?: string;
  avatarUrl?: string | null;
  showcaseAssets?: CharacterVisualAsset[];
};

type CharacterVisualAsset = {
  id: string;
  tier: "soft" | "warm" | "spicy" | "steamy" | "premium";
  minAffection: number;
  mediaUrl: string | null;
  mediaType: "image" | "video";
  caption: string;
};

const transport = new DefaultChatTransport({
  api: "/api/character-chat",
  headers: (): Record<string, string> => {
    const key = `sb-${
      (import.meta.env.VITE_SUPABASE_URL as string)?.match(/https?:\/\/([^.]+)/)?.[1] ?? ""
    }-auth-token`;
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      const token = parsed?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  },
});

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function chatMessageText(message: any) {
  return (message?.parts ?? [])
    .map((part: any) => (part?.type === "text" ? String(part.text ?? "") : ""))
    .join("")
    .trim();
}

function normalizeCharacters(card: any): CharacterProfile[] {
  const raw = Array.isArray(card?.characters) ? card.characters : [];
  const rows = raw
    .map((character: any, index: number) => ({
      id: asString(character?.id, `character-${index + 1}`),
      name: asString(character?.name || character?.title),
      role: asString(character?.role),
      persona: asString(character?.persona),
      personality: asString(character?.personality),
      relationship: asString(character?.relationship),
      speakingStyle: asString(character?.speakingStyle),
      notes: asString(character?.notes),
      avatarUrl: typeof character?.avatarUrl === "string" ? character.avatarUrl : null,
      showcaseAssets: Array.isArray(character?.showcaseAssets) ? character.showcaseAssets : [],
    }))
    .filter((character) => character.name);

  if (rows.length) return rows;
  const fallbackName = asString(card?.name, "캐릭터");
  return [
    {
      id: "main-character",
      name: fallbackName,
      role: asString(card?.role),
      persona: asString(card?.persona),
      personality: asString(card?.personality),
      relationship: asString(card?.relationship),
      speakingStyle: asString(card?.speakingStyle),
      notes: asString(card?.notes),
      avatarUrl: typeof card?.avatarUrl === "string" ? card.avatarUrl : null,
      showcaseAssets: Array.isArray(card?.showcaseAssets) ? card.showcaseAssets : [],
    },
  ];
}

function getStoryExcerpt(data: any) {
  const card = data?.character_card ?? {};
  const chapters = Array.isArray(card?.chapters) ? card.chapters : [];
  const text = chapters
    .slice(0, 8)
    .map((chapter: any) => [chapter?.title, chapter?.summary, chapter?.body].filter(Boolean).join("\n"))
    .join("\n\n");
  return (text || data?.body_text || data?.logline || "").replace(/\s+/g, " ").trim().slice(0, 900);
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

function CharacterChatRoom() {
  const { storyId, characterId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchStory = useServerFn(getUnifiedReaderStory);
  const fetchAffection = useServerFn(getMyStoryAffection);
  const bumpAffection = useServerFn(bumpMyStoryAffection);
  const fetchHistory = useServerFn(listReaderChatMessages);
  const appendChat = useServerFn(appendReaderChatMessage);
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [characterQuery, setCharacterQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedAssistantRef = useRef<string | null>(null);

  const storyQ = useQuery({
    queryKey: ["character_chat_story", storyId],
    queryFn: () => fetchStory({ data: { id: storyId } }),
  });
  const affectionQ = useQuery({
    queryKey: ["story_affection", storyId],
    queryFn: () => fetchAffection({ data: { storyId } }),
    staleTime: 30_000,
  });
  const historyQ = useQuery({
    queryKey: ["reader_chat_messages", storyId],
    queryFn: () => fetchHistory({ data: { storyId, limit: 180 } }),
    staleTime: 20_000,
  });

  const saveChatMutation = useMutation({
    mutationFn: (data: {
      role: "user" | "assistant";
      text: string;
      affectionAt: number;
    }) =>
      appendChat({
        data: {
          storyId,
          role: data.role,
          text: data.text,
          threadKey: `single:${characterId}`,
          threadLabel: activeCharacter?.name ?? "캐릭터",
          chatMode: "single",
          characterId,
          characterName: activeCharacter?.name ?? "캐릭터",
          avatarUrl: activeCharacter?.avatarUrl ?? null,
          affectionAt: data.affectionAt,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reader_chat_messages", storyId] }),
    onError: (error) => console.warn("[character-room] save failed", error),
  });

  const bumpMutation = useMutation({
    mutationFn: (delta: number) => bumpAffection({ data: { storyId, delta, reason: "meaningful_chat" } }),
    onSuccess: (result) => qc.setQueryData(["story_affection", storyId], result),
  });

  const card = (storyQ.data?.character_card as any) ?? {};
  const characters = useMemo(() => normalizeCharacters(card), [card]);
  const activeCharacter =
    characters.find((character) => character.id === characterId) ??
    characters.find((character) => decodeURIComponent(character.id) === characterId) ??
    characters[0];
  const filteredCharacters = useMemo(() => {
    const keyword = characterQuery.trim().toLowerCase();
    if (!keyword) return characters;
    return characters.filter((character) =>
      [character.name, character.role, character.persona, character.personality, character.relationship]
        .some((value) => String(value ?? "").toLowerCase().includes(keyword)),
    );
  }, [characterQuery, characters]);
  const affection = affectionQ.data?.affection ?? 0;
  const avatarUrl = useSignedMedia(activeCharacter?.avatarUrl ?? storyQ.data?.cover_url ?? null);
  const storyExcerpt = useMemo(() => getStoryExcerpt(storyQ.data), [storyQ.data]);
  const visualAssets = activeCharacter?.showcaseAssets ?? [];
  const unlockedAssets = visualAssets.filter((asset) => affection >= asset.minAffection);
  const lockedAssets = visualAssets.filter((asset) => affection < asset.minAffection);
  const primaryAsset = unlockedAssets.at(-1) ?? visualAssets[0] ?? null;
  const primaryAssetUrl = useSignedMedia(primaryAsset?.mediaUrl ?? activeCharacter?.avatarUrl ?? storyQ.data?.cover_url ?? null);

  const { messages, sendMessage, status } = useChat({
    id: `character-room-${storyId}-${characterId}`,
    transport,
  });
  const isStreaming = status === "submitted" || status === "streaming";
  const latestAssistant = useMemo(() => {
    const item = [...messages].reverse().find((message) => message.role === "assistant");
    const text = chatMessageText(item);
    return item && text ? { id: item.id, text } : null;
  }, [messages]);

  const savedMessages = useMemo(
    () =>
      (historyQ.data ?? []).filter(
        (message) => message.threadKey === `single:${characterId}` || message.characterId === characterId,
      ),
    [characterId, historyQ.data],
  );

  const liveMessages = useMemo<ReaderChatMessageRow[]>(
    () =>
      messages
        .map((message) => {
          const text = chatMessageText(message);
          if (!text) return null;
          return {
            id: `live-${message.id}`,
            role: message.role === "assistant" ? "assistant" : "user",
            text,
            threadKey: `single:${characterId}`,
            threadLabel: activeCharacter?.name ?? "캐릭터",
            chatMode: "single",
            characterId,
            characterName: message.role === "user" ? "나" : activeCharacter?.name ?? "캐릭터",
            avatarUrl: message.role === "assistant" ? activeCharacter?.avatarUrl ?? null : null,
            affectionAt: affection,
            createdAt: new Date().toISOString(),
          } satisfies ReaderChatMessageRow;
        })
        .filter(Boolean) as ReaderChatMessageRow[],
    [activeCharacter?.avatarUrl, activeCharacter?.name, affection, characterId, messages],
  );

  const visibleMessages = liveMessages.length ? liveMessages : savedMessages;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [visibleMessages.length, latestAssistant?.text]);

  useEffect(() => {
    if (isStreaming || !latestAssistant || savedAssistantRef.current === latestAssistant.id) return;
    savedAssistantRef.current = latestAssistant.id;
    saveChatMutation.mutate({ role: "assistant", text: latestAssistant.text, affectionAt: affection });
  }, [affection, isStreaming, latestAssistant, saveChatMutation]);

  async function send() {
    const text = draft.trim();
    if (!text || isStreaming || !activeCharacter) return;
    setDraft("");
    saveChatMutation.mutate({ role: "user", text, affectionAt: affection });
    await sendMessage(
      { text },
      {
        body: {
          storyId,
          sceneExcerpt: storyExcerpt,
          affection,
          chatMode: "single",
          characterId: activeCharacter.id,
          characterName: activeCharacter.name,
          characterProfile: activeCharacter,
          selectedCharacters: [activeCharacter],
          engagementIntent: "character_dating_room",
        },
      },
    );
    bumpMutation.mutate(text.length > 40 ? 3 : 2);
  }

  function selectCharacter(next: CharacterProfile) {
    if (!next?.id || next.id === activeCharacter?.id) return;
    navigate({
      to: "/chats/$storyId/$characterId",
      params: { storyId, characterId: next.id },
    });
  }

  if (storyQ.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#09090b] text-white/60">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!storyQ.data || !activeCharacter) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#09090b] px-4 text-center text-white">
        <div>
          <p className="text-sm text-white/60">대화할 캐릭터를 찾을 수 없습니다.</p>
          <Button asChild className="mt-4 rounded-full">
            <Link to="/chats">캐릭터채팅으로</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh overflow-hidden bg-[#08080b] text-white">
      <div className="fixed inset-0">
        {primaryAssetUrl ? (
          <img src={primaryAssetUrl} alt="" className="size-full scale-110 object-cover opacity-28 blur-sm" />
        ) : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_10%,rgba(236,72,153,.26),transparent_34%),linear-gradient(90deg,rgba(8,8,11,.96),rgba(8,8,11,.72),rgba(8,8,11,.94))]" />
      </div>

      <div className="relative z-10 grid min-h-dvh grid-rows-[auto_auto_minmax(0,1fr)]">
        <header className="flex h-14 items-center justify-between border-b border-white/10 px-4 backdrop-blur-xl">
          <Button asChild variant="ghost" size="sm" className="rounded-full text-white hover:bg-white/10 hover:text-white">
            <Link to="/chats">
              <ArrowLeft className="size-4" />
              목록
            </Link>
          </Button>
          <div className="min-w-0 text-center">
            <div className="truncate text-sm font-bold">{activeCharacter.name}</div>
            <div className="truncate text-[11px] text-white/45">{storyQ.data.title}</div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen((value) => !value)}
            className="rounded-full text-white hover:bg-white/10 hover:text-white"
          >
            기록
          </Button>
        </header>

        <CharacterTopSelector
          characters={filteredCharacters}
          activeCharacter={activeCharacter}
          query={characterQuery}
          onQueryChange={setCharacterQuery}
          onSelect={selectCharacter}
        />

        <section className="grid min-h-0 gap-0 lg:grid-cols-[minmax(320px,44vw)_minmax(0,1fr)]">
          <aside className="relative hidden min-h-0 border-r border-white/10 lg:block">
            <div className="absolute inset-0">
              {primaryAssetUrl ? (
                primaryAsset?.mediaType === "video" ? (
                  <video src={primaryAssetUrl} className="size-full object-cover" autoPlay muted loop playsInline />
                ) : (
                  <img src={primaryAssetUrl} alt={activeCharacter.name} className="size-full object-cover" />
                )
              ) : avatarUrl ? (
                <img src={avatarUrl} alt={activeCharacter.name} className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center bg-white/[0.03]">
                  <UserRound className="size-20 text-white/20" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
            </div>
            <div className="absolute inset-x-0 bottom-0 space-y-4 p-6">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.32em] text-primary">Dating Chat</div>
                <h1 className="mt-2 text-5xl font-black leading-none">{activeCharacter.name}</h1>
                <p className="mt-3 max-w-md text-sm leading-6 text-white/65">
                  {activeCharacter.relationship || activeCharacter.personality || activeCharacter.persona || "대화를 이어가며 호감도를 쌓고 잠긴 콘텐츠를 열어보세요."}
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/55 p-4 backdrop-blur">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-bold">
                    <Heart className="size-4 fill-primary text-primary" />
                    호감도
                  </span>
                  <span className="text-2xl font-black">{affection}</span>
                </div>
                <Progress value={affection} className="mt-3 h-1.5 bg-white/10" />
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-2xl bg-emerald-400/10 p-3 text-emerald-100">해금 {unlockedAssets.length}</div>
                  <div className="rounded-2xl bg-rose-400/10 p-3 text-rose-100">잠김 {lockedAssets.length}</div>
                </div>
              </div>
            </div>
          </aside>

          <div className="grid min-h-0 grid-cols-1 xl:grid-cols-[minmax(360px,0.88fr)_320px]">
            <section className="flex min-h-0 flex-col">
              <div className="border-b border-white/10 px-4 py-3">
                <div className="mx-auto flex max-w-3xl items-center gap-3">
                  <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                    {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : <UserRound className="size-5 text-white/35" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-extrabold">{activeCharacter.name}</span>
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-white/45">{activeCharacter.role || "스토리 속 주인공"}</p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/10">
                    <Link to="/play/user/$id" params={{ id: storyId }}>
                      스토리
                    </Link>
                  </Button>
                </div>
              </div>

              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                <div className="mx-auto max-w-3xl space-y-4">
                  {visibleMessages.length === 0 && (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-center">
                      <MessageCircle className="mx-auto size-8 text-primary" />
                      <p className="mt-3 text-sm font-bold">{activeCharacter.name}에게 먼저 말을 걸어보세요.</p>
                      <p className="mt-1 text-xs leading-5 text-white/45">대화가 쌓이면 호감도가 오르고 잠긴 이미지와 영상이 열립니다.</p>
                    </div>
                  )}
                  {visibleMessages.map((message) => (
                    <ChatBubble key={message.id} message={message} avatarUrl={avatarUrl} characterName={activeCharacter.name} />
                  ))}
                  {isStreaming && !latestAssistant?.text && (
                    <div className="flex justify-start">
                      <div className="rounded-3xl bg-white/[0.06] px-4 py-3 text-sm">
                        <Loader2 className="inline size-3.5 animate-spin" /> 입력 중
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
                className="border-t border-white/10 bg-black/55 px-4 py-3 backdrop-blur-xl"
              >
                <div className="mx-auto flex max-w-3xl items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    rows={2}
                    placeholder={`${activeCharacter.name}에게 메시지 보내기`}
                    className="max-h-32 min-h-12 resize-none rounded-3xl border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder:text-white/35 focus:ring-primary"
                  />
                  <Button type="submit" disabled={!draft.trim() || isStreaming} className="size-12 rounded-full p-0">
                    {isStreaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </Button>
                </div>
              </form>
            </section>

            <aside className={cn("hidden border-l border-white/10 bg-black/30 p-4 xl:block", !historyOpen && "xl:hidden")}>
              <VisualUnlockRailV2 assets={visualAssets} affection={affection} />
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function CharacterTopSelector({
  characters,
  activeCharacter,
  query,
  onQueryChange,
  onSelect,
}: {
  characters: CharacterProfile[];
  activeCharacter: CharacterProfile;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (character: CharacterProfile) => void;
}) {
  return (
    <div className="border-b border-white/10 bg-black/42 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1380px] flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative w-full xl:max-w-[320px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="캐릭터 검색"
            className="h-10 rounded-full border-white/10 bg-white/[0.06] pl-9 text-white placeholder:text-white/35 focus-visible:ring-primary"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {characters.map((character) => (
            <CharacterSelectChip
              key={character.id}
              character={character}
              active={character.id === activeCharacter.id}
              onClick={() => onSelect(character)}
            />
          ))}
          {characters.length === 0 && (
            <div className="rounded-full border border-dashed border-white/10 px-4 py-2 text-xs text-white/40">
              검색 결과 없음
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CharacterSelectChip({
  character,
  active,
  onClick,
}: {
  character: CharacterProfile;
  active: boolean;
  onClick: () => void;
}) {
  const avatarUrl = useSignedMedia(character.avatarUrl);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-2.5 pr-4 text-left transition",
        active
          ? "border-primary/70 bg-primary text-primary-foreground shadow-glow"
          : "border-white/10 bg-white/[0.045] text-white/70 hover:border-primary/45 hover:text-white",
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-black/20">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-[11px] font-black">{character.name.slice(0, 1)}</span>
        )}
      </span>
      <span className="max-w-[130px] truncate text-xs font-bold">{character.name}</span>
    </button>
  );
}

function ChatBubble({
  message,
  avatarUrl,
  characterName,
}: {
  message: ReaderChatMessageRow;
  avatarUrl: string | null;
  characterName: string;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex items-end gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/[0.06]">
          {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : <UserRound className="size-4 text-white/35" />}
        </div>
      )}
      <div className={cn("max-w-[78%] rounded-3xl px-4 py-3 text-sm leading-7 shadow-xl", isUser ? "bg-primary text-primary-foreground" : "bg-white/[0.08] text-white")}>
        {!isUser && <div className="mb-1 text-[11px] font-bold text-primary">{characterName}</div>}
        <p className="whitespace-pre-line">{message.text}</p>
      </div>
    </div>
  );
}

function VisualUnlockRailV2({
  assets,
  affection,
}: {
  assets: CharacterVisualAsset[];
  affection: number;
}) {
  const unlocked = assets.filter((asset) => affection >= asset.minAffection);
  const locked = assets.filter((asset) => affection < asset.minAffection);
  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <Sparkles className="size-4 text-primary" />
          누적 콘텐츠
        </div>
        <p className="mt-1 text-xs leading-5 text-white/40">호감도를 쌓아 잠긴 이미지와 영상을 열어보세요.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        <VisualAssetSection title="해금된 이미지" count={unlocked.length} empty="아직 해금된 이미지가 없습니다.">
          {unlocked.map((asset) => (
            <VisualAssetCard key={asset.id} asset={asset} affection={affection} />
          ))}
        </VisualAssetSection>
        <VisualAssetSection title="해금 전 이미지" count={locked.length} empty="잠긴 이미지가 없습니다.">
          {locked.map((asset) => (
            <VisualAssetCard key={asset.id} asset={asset} affection={affection} />
          ))}
        </VisualAssetSection>
        {assets.length === 0 && (
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="grid aspect-square place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03]">
                <ImageIcon className="size-5 text-white/25" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VisualAssetSection({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: any;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-extrabold text-white">{title}</h3>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/55">{count}</span>
      </div>
      {count > 0 ? (
        <div className="grid grid-cols-2 gap-2">{children}</div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-5 text-center text-xs text-white/35">
          {empty}
        </div>
      )}
    </section>
  );
}

function VisualUnlockRail({
  assets,
  affection,
}: {
  assets: CharacterVisualAsset[];
  affection: number;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <Sparkles className="size-4 text-primary" />
          누적 콘텐츠
        </div>
        <p className="mt-1 text-xs leading-5 text-white/40">호감도를 쌓아 잠긴 이미지와 영상을 열어보세요.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(assets.length ? assets : []).map((asset) => (
          <VisualAssetCard key={asset.id} asset={asset} affection={affection} />
        ))}
        {assets.length === 0 &&
          [0, 1, 2, 3].map((item) => (
            <div key={item} className="grid aspect-square place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03]">
              <ImageIcon className="size-5 text-white/25" />
            </div>
          ))}
      </div>
    </div>
  );
}

function VisualAssetCard({
  asset,
  affection,
}: {
  asset: CharacterVisualAsset;
  affection: number;
}) {
  const url = useSignedMedia(asset.mediaUrl);
  const locked = affection < asset.minAffection;
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-white/[0.04]">
      {url ? (
        asset.mediaType === "video" ? (
          <video src={url} className={cn("size-full object-cover", locked && "blur-md saturate-50")} muted playsInline />
        ) : (
          <img src={url} alt={asset.caption} className={cn("size-full object-cover", locked && "blur-md saturate-50")} />
        )
      ) : (
        <div className="grid size-full place-items-center">
          <ImageIcon className="size-5 text-white/25" />
        </div>
      )}
      {locked && (
        <div className="absolute inset-0 grid place-items-center bg-black/45">
          <div className="text-center">
            <Lock className="mx-auto size-4 text-rose-200" />
            <div className="mt-1 text-[10px] font-black text-white">호감도 {asset.minAffection}</div>
          </div>
        </div>
      )}
      {!locked && <div className="absolute left-2 top-2 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-black text-black">OPEN</div>}
    </div>
  );
}
