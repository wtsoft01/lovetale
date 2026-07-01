import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@/lib/_mock/runtime";
import { MessageCircle, Search, Heart, Bookmark } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { stories, getStory } from "@/lib/mock/stories";
import { listMySessions } from "@/lib/sessions.functions";

export const Route = createFileRoute("/chats")({
  head: () => ({
    meta: [
      { title: "내 세션 — Lovetale" },
      { name: "description", content: "진행 중인 스토리 세션." },
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

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

function Chats() {
  const { user, loading } = useAuth();
  const fnList = useServerFn(listMySessions);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setRows([]);
      return;
    }
    fnList()
      .then((data) => setRows((data ?? []) as Row[]))
      .catch(() => setRows([]));
  }, [user, loading, fnList]);

  const filtered = (rows ?? []).filter((r) => {
    const s = getStory(r.story_id);
    if (!s) return false;
    if (!query.trim()) return true;
    return s.title.includes(query) || s.tagline.includes(query);
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-6 py-10 md:px-10">
      <header>
        <h1 className="font-display text-3xl font-semibold">내 세션</h1>
        <p className="text-sm text-muted-foreground">
          진행 중인 스토리 — 마지막 챕터부터 이어가세요.
        </p>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="스토리 · 캐릭터 검색"
          className="rounded-full border-border bg-card pl-9"
        />
      </div>

      {!user && !loading && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          진행 중인 세션은 로그인 후 자동으로 저장돼요.{" "}
          <Link to="/auth" className="text-primary hover:underline">
            로그인하기
          </Link>
        </div>
      )}

      {user && rows === null && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          세션을 불러오는 중…
        </div>
      )}

      {user && rows !== null && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          아직 시작한 스토리가 없어요.{" "}
          <Link to="/" className="text-primary hover:underline">
            스토리 둘러보기
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((r) => {
          const s = getStory(r.story_id) ?? stories[0];
          return (
            <Link
              key={r.id}
              to="/play/$sessionId"
              params={{ sessionId: s.id }}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-glow"
            >
              <div className="relative">
                <img
                  src={s.cover}
                  alt={s.title}
                  className="h-16 w-12 rounded-lg object-cover"
                />
                {s.mature && (
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full border border-background bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
                    19
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-medium">{s.title}</div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {timeAgo(r.updated_at)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <MessageCircle className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {r.is_completed
                      ? "엔딩 도달 · 다시 시작 가능"
                      : `진행 중 · ${r.current_node}`}
                  </span>
                  {r.is_bookmarked && (
                    <Bookmark className="h-3 w-3 fill-primary text-primary" />
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Heart className="h-3 w-3 text-primary" />
                  <Progress value={r.affection} className="h-1 flex-1" />
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {r.affection}
                  </span>
                  {r.is_completed && (
                    <Badge className="ml-1 h-4 rounded-full bg-gradient-aurora px-1.5 text-[9px] text-primary-foreground">
                      ENDED
                    </Badge>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
