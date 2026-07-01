import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@/lib/_mock/runtime";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldAlert,
  Bookmark,
  Settings,
  Coins,
  Crown,
  Heart,
  Bell,
  Globe,
  Moon,
  LogOut,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { characters } from "@/lib/mock/characters";
import { getStory } from "@/lib/mock/stories";
import { getMyProfile, verifyAge } from "@/lib/profile.functions";
import { listSavedEndings } from "@/lib/sessions.functions";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "프로필 — Lovetale" },
      { name: "description", content: "내 프로필, 성인 인증, 저장한 엔딩." },
    ],
  }),
  component: Profile,
});

const bookmarks = characters.slice(0, 4);

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  credits: number;
  age_verified: boolean;
  created_at: string;
};

type Ending = {
  id: string;
  story_id: string;
  ending_id: string;
  ending_title: string;
  ending_kind: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "방금";
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

function Profile() {
  const { user, signOut } = useAuth();
  const fnProfile = useServerFn(getMyProfile);
  const fnVerify = useServerFn(verifyAge);
  const fnEndings = useServerFn(listSavedEndings);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [endings, setEndings] = useState<Ending[]>([]);
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    fnProfile()
      .then((p) => setProfile(p as Profile))
      .catch(() => {});
    fnEndings()
      .then((e) => setEndings((e ?? []) as Ending[]))
      .catch(() => {});
  }, [user, fnProfile, fnEndings]);

  async function handleVerify() {
    if (!consent) return;
    setSubmitting(true);
    try {
      await fnVerify({ data: { confirm: true } });
      setProfile((p) => (p ? { ...p, age_verified: true } : p));
      setOpen(false);
      toast.success("성인 인증이 완료되었어요.");
    } catch (e: any) {
      toast.error(e?.message ?? "인증 실패");
    } finally {
      setSubmitting(false);
    }
  }

  const displayName =
    profile?.display_name ?? user?.email?.split("@")[0] ?? "Guest";
  const credits = profile?.credits ?? 0;
  const verified = !!profile?.age_verified;

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-10 md:px-10">
      {/* Hero */}
      <header className="glass-panel relative overflow-hidden rounded-3xl p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-aurora opacity-20 blur-3xl" />
        <div className="relative flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl bg-gradient-aurora text-2xl font-semibold text-primary-foreground shadow-glow">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                displayName.slice(0, 1).toUpperCase()
              )}
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold">
                {displayName}
              </h1>
              <p className="text-sm text-muted-foreground">
                {profile
                  ? `${new Date(profile.created_at).toLocaleDateString()} 가입 · Free 플랜`
                  : user
                    ? "로딩 중…"
                    : "로그인되지 않음"}
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2.5 py-1">
                  <Coins className="h-3 w-3 text-primary" /> {credits} 크레딧
                </span>
                {verified && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
                    <ShieldCheck className="h-3 w-3" /> 19+ 인증
                  </span>
                )}
              </div>
            </div>
          </div>
          <Link to="/premium">
            <Button className="rounded-full bg-gradient-aurora text-primary-foreground shadow-glow hover:opacity-90">
              <Crown className="mr-1.5 h-4 w-4" /> 프리미엄 업그레이드
            </Button>
          </Link>
        </div>
      </header>

      {/* Adult verification */}
      {!verified && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-300">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold">
                성인 인증 — 미인증
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                19+ 시나리오를 열람하려면 성인 인증이 필요합니다. 프로토타입
                단계에서는 자기 신고 방식으로 진행되며, 정식 출시 단계에서 PG
                본인 인증으로 전환됩니다.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={!user}
                  onClick={() => setOpen(true)}
                >
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> 인증 시작
                </Button>
                {!user && (
                  <Link to="/auth">
                    <Button size="sm" variant="outline" className="rounded-full">
                      먼저 로그인
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Bookmarks (mock) */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">북마크한 캐릭터</h2>
          <Link
            to="/explore"
            className="inline-flex items-center text-xs text-muted-foreground hover:text-primary"
          >
            더 탐색 <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {bookmarks.map((c) => (
            <Link
              key={c.id}
              to="/character/$id"
              params={{ id: c.id }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50 hover:shadow-glow"
            >
              <img
                src={c.portrait}
                alt={c.name}
                className="aspect-[3/4] w-full object-cover transition group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background to-transparent p-3">
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {c.scenario}
                </div>
              </div>
              <Bookmark className="absolute right-2 top-2 h-4 w-4 fill-primary text-primary" />
            </Link>
          ))}
        </div>
      </section>

      {/* Saved endings (real) */}
      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">저장한 엔딩</h2>
        {endings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {user
              ? "아직 저장된 엔딩이 없어요. 스토리를 끝까지 플레이하면 자동으로 컬렉션에 추가됩니다."
              : "로그인하면 도달한 엔딩이 컬렉션에 저장돼요."}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card">
            {endings.map((e, i) => {
              const s = getStory(e.story_id);
              return (
                <div key={e.id}>
                  <div className="flex items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-aurora/30 text-primary">
                        <Heart className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">
                          {e.ending_title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s?.title ?? e.story_id} · {timeAgo(e.created_at)}
                        </div>
                      </div>
                    </div>
                    {s && (
                      <Link
                        to="/play/$sessionId"
                        params={{ sessionId: s.id }}
                      >
                        <Button variant="ghost" size="sm" className="rounded-full">
                          다시 보기
                        </Button>
                      </Link>
                    )}
                  </div>
                  {i < endings.length - 1 && <Separator />}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Settings */}
      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">환경설정</h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {[
            { icon: Bell, title: "알림", desc: "새로운 캐릭터, 이벤트 알림 받기", toggle: true },
            { icon: Moon, title: "다크 모드", desc: "항상 어두운 테마 사용", toggle: true },
            { icon: Globe, title: "언어", desc: "한국어", toggle: false },
            { icon: Settings, title: "콘텐츠 필터", desc: "19+ 콘텐츠 자동 숨김 (인증 후 조정 가능)", toggle: true },
          ].map((row) => (
            <div key={row.title} className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-surface-elevated text-muted-foreground">
                  <row.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium">{row.title}</div>
                  <div className="text-xs text-muted-foreground">{row.desc}</div>
                </div>
              </div>
              {row.toggle ? <Switch defaultChecked /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>
      </section>

      {/* Account */}
      {user && (
        <section>
          <Button
            variant="outline"
            onClick={() => signOut()}
            className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="mr-1.5 h-4 w-4" /> 로그아웃
          </Button>
        </section>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <ShieldAlert className="h-5 w-5 text-amber-400" /> 성인 인증
            </DialogTitle>
            <DialogDescription>
              아래 항목에 동의하시면 19+ 콘텐츠 접근이 활성화됩니다.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-3 rounded-xl border border-border bg-background/60 p-3 text-sm">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5"
            />
            <span>
              저는 만 19세 이상이며, 본 콘텐츠가 성적/폭력적 묘사를 포함할 수
              있음을 이해합니다.
            </span>
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              disabled={!consent || submitting}
              onClick={handleVerify}
              className="bg-gradient-aurora text-primary-foreground shadow-glow"
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" /> 인증 완료
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
