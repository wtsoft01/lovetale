import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Bookmark,
  Heart,
  HeartHandshake,
  Loader2,
  MessageCircle,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@/lib/_mock/runtime";
import {
  listPublicChatCharacters,
  type PublicChatCharacterRow,
} from "@/lib/admin-characters.functions";
import { listMySessions } from "@/lib/sessions.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/chats")({
  head: () => ({
    meta: [
      { title: "캐릭터채팅 | Lovetale" },
      {
        name: "description",
        content: "등록된 스토리의 주인공을 선택하고 성격, 말투, 호감도에 맞춘 대화를 시작합니다.",
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

const GENDER_FILTERS: { value: CharacterGender; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "male", label: "남성 캐릭터" },
  { value: "female", label: "여성 캐릭터" },
  { value: "neutral", label: "중성 캐릭터" },
];

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
  if (/(남성|남자|남주|남편|오빠|대표|ceo|male|man|boy)/i.test(text)) return "male";
  if (/(여성|여자|여주|아내|언니|누나|female|woman|girl)/i.test(text)) return "female";
  return "neutral";
}

function getAffectionForProfile(profile: PublicChatCharacterRow, rows: Row[] | null) {
  const matched = (rows ?? []).filter((row) => row.character_id === profile.id || row.story_id === profile.storyId);
  if (matched.length === 0) return { affection: 0, row: null as Row | null };
  const sorted = matched.toSorted((a, b) => b.affection - a.affection);
  return { affection: sorted[0]?.affection ?? 0, row: sorted[0] ?? null };
}

function useSignedMedia(path?: string | null) {
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

function Chats() {
  const { user, loading } = useAuth();
  const listSessions = useServerFn(listMySessions);
  const listCharacters = useServerFn(listPublicChatCharacters);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [characters, setCharacters] = useState<PublicChatCharacterRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState<CharacterGender>("all");

  useEffect(() => {
    listCharacters()
      .then((data) => setCharacters(data ?? []))
      .catch(() => setCharacters([]));
  }, [listCharacters]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setRows([]);
      return;
    }
    listSessions()
      .then((data) => setRows((data ?? []) as Row[]))
      .catch(() => setRows([]));
  }, [user, loading, listSessions]);

  const filteredProfiles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return (characters ?? []).filter((profile) => {
      const inferredGender = inferGender(profile);
      const matchesGender = gender === "all" || inferredGender === gender;
      if (!matchesGender) return false;
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
    });
  }, [characters, gender, query]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 rounded-full px-2.5 py-1 text-[11px]">
            <HeartHandshake className="size-3" />
            DATING
          </Badge>
          <h1 className="text-base font-semibold">캐릭터채팅</h1>
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit gap-1.5 rounded-full">
          <Link to="/explore">
            <Sparkles className="size-4" />
            스토리탐색
          </Link>
        </Button>
      </section>

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
      </section>

      {characters === null && (
        <EmptyPanel>
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          등록된 캐릭터를 불러오는 중입니다.
        </EmptyPanel>
      )}

      {user && rows === null && (
        <EmptyPanel>
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          대화 기록을 불러오는 중입니다.
        </EmptyPanel>
      )}

      {!user && !loading && (
        <EmptyPanel>
          로그인하면 주인공과의 호감도와 대화 기록이 저장됩니다.{" "}
          <Link to="/auth" className="text-primary hover:underline">
            로그인하기
          </Link>
        </EmptyPanel>
      )}

      {characters !== null && filteredProfiles.length === 0 ? (
        <EmptyPanel>조건에 맞는 캐릭터가 없습니다. 관리자에서 스토리 캐릭터를 등록해보세요.</EmptyPanel>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProfiles.map((profile) => (
            <CharacterDatingCard
              key={`${profile.storyId}-${profile.id}`}
              profile={profile}
              affectionInfo={getAffectionForProfile(profile, rows)}
            />
          ))}
        </section>
      )}
    </div>
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
  const avatarUrl = useSignedMedia(profile.avatarUrl);
  const description = profile.persona || profile.personality || profile.relationship || profile.logline;

  return (
    <Link
      to="/play/user/$id"
      params={{ id: profile.storyId }}
      search={{ character: profile.id }}
      className="group min-w-0 rounded-2xl border border-border/60 bg-card/45 p-3 transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-card/80"
    >
      <div className="flex gap-3">
        <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-2xl bg-muted sm:w-28">
          {avatarUrl ? (
            <img src={avatarUrl} alt={profile.name} className="size-full object-cover transition duration-300 group-hover:scale-105" />
          ) : (
            <div className="grid size-full place-items-center">
              <UserRound className="size-9 text-muted-foreground" />
            </div>
          )}
          <span className="absolute left-1.5 top-1.5 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
            {genderLabel}
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold leading-tight">{profile.name}</h2>
              <p className="mt-1 truncate text-xs text-primary/85">{profile.role || profile.personality || "스토리 주인공"}</p>
            </div>
            {affectionInfo.row?.is_bookmarked && <Bookmark className="size-4 shrink-0 fill-primary text-primary" />}
          </div>

          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{description || "캐릭터 정보가 준비 중입니다."}</p>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Heart className="size-3 text-primary" />나와의 호감도
              </span>
              <span className="font-medium tabular-nums text-foreground">{affection}</span>
            </div>
            <Progress value={affection} className="h-1.5" />
          </div>

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

          <div className="flex flex-wrap gap-1">
            {profile.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
