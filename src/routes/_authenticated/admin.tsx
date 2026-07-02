import { useEffect, useState } from "react";
import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  Users2,
  Image as ImageIcon,
  Flame,
  ShieldAlert,
  Receipt,
  Loader2,
  ShieldCheck,
  UserCircle2,
  Store,
  Gauge,
  ExternalLink,
  KeyRound,
  FilePlus2,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getStaffAccess } from "@/lib/staff-access";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "Lovetale Studio | 관리자" }],
  }),
  component: AdminLayout,
});

type NavSectionId = "content" | "operations" | "settings";

type NavItem = {
  to: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  requires?: "admin" | "editor" | "moderator";
  section: NavSectionId;
};

const NAV: NavItem[] = [
  {
    to: "/admin/stories",
    label: "콘텐츠 관리",
    desc: "검색, 필터, 분류, 일괄 운영",
    icon: BookOpen,
    requires: "editor",
    section: "content",
  },
  {
    to: "/admin/import",
    label: "새 콘텐츠 등록",
    desc: "본문 등록, 단편/회차형 스토리 생성",
    icon: FilePlus2,
    requires: "editor",
    section: "content",
  },
  {
    to: "/admin/placements",
    label: "메인 노출 관리",
    desc: "히어로, 뜨거운 스토리, 신작 운영",
    icon: LayoutGrid,
    requires: "editor",
    section: "content",
  },
  {
    to: "/admin/characters",
    label: "캐릭터",
    desc: "주인공과 관계 설정 관리",
    icon: UserCircle2,
    requires: "editor",
    section: "content",
  },
  {
    to: "/admin/media",
    label: "미디어 자료실",
    desc: "이미지, 영상, 에셋 파일 관리",
    icon: ImageIcon,
    requires: "editor",
    section: "content",
  },
  {
    to: "/admin",
    label: "대시보드",
    desc: "핵심 지표와 운영 현황",
    icon: BarChart3,
    section: "operations",
  },
  {
    to: "/admin/users",
    label: "회원 관리",
    desc: "사용자와 관리자 권한 관리",
    icon: Users2,
    requires: "admin",
    section: "operations",
  },
  {
    to: "/admin/orders",
    label: "매출 관리",
    desc: "결제, 환불, 정산 상태 확인",
    icon: Receipt,
    requires: "admin",
    section: "operations",
  },
  {
    to: "/admin/analytics",
    label: "사용자 분석",
    desc: "활성, 전환, 이용 지표 분석",
    icon: Gauge,
    requires: "admin",
    section: "operations",
  },
  {
    to: "/admin/moderation",
    label: "검수 센터",
    desc: "신고와 자동 플래그 처리",
    icon: ShieldAlert,
    requires: "moderator",
    section: "operations",
  },
  {
    to: "/admin/settings",
    label: "스토어 설정",
    desc: "가격, 노출, 판매 정책",
    icon: Store,
    requires: "admin",
    section: "settings",
  },
  {
    to: "/admin/heat",
    label: "분위기/과금 규칙",
    desc: "호감도 단계와 과금 규칙",
    icon: Flame,
    requires: "admin",
    section: "settings",
  },
  {
    to: "/admin/llm",
    label: "LLM API",
    desc: "모델, 요금, 제공자 설정",
    icon: KeyRound,
    requires: "admin",
    section: "settings",
  },
];

const NAV_SECTIONS: Array<{
  id: NavSectionId;
  title: string;
  desc: string;
}> = [
  { id: "content", title: "콘텐츠", desc: "상품과 에셋" },
  { id: "operations", title: "운영", desc: "회원, 매출, 지표" },
  { id: "settings", title: "설정", desc: "정책과 시스템" },
];

function AdminLayout() {
  const { session, loading: authLoading } = useAuth();
  const q = useQuery({
    queryKey: ["staff_roles", session?.user.id ?? "anon"],
    queryFn: () =>
      getStaffAccess({
        userId: session?.user.id,
        accessToken: session?.access_token,
        email: session?.user.email ?? undefined,
      }),
    enabled: !authLoading && Boolean(session),
  });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [navOpen, setNavOpen] = useState(true);

  useEffect(() => {
    if (q.data && !q.data.hasAny) {
      // Keep the denial page visible instead of bouncing, so the user knows why access failed.
    }
  }, [q.data]);

  if (authLoading || q.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!q.data?.hasAny) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h1 className="font-display text-2xl font-semibold">Studio 접근 권한이 없습니다</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          운영진 권한이 있는 계정으로 로그인해주세요.
        </p>
      </div>
    );
  }

  const { isAdmin, isEditor, isModerator } = q.data;
  const can = (role?: NavItem["requires"]) =>
    !role ||
    (role === "admin" && isAdmin) ||
    (role === "editor" && isEditor) ||
    (role === "moderator" && isModerator);

  return (
    <div className="min-h-dvh bg-background">
      <div
        className={cn(
          "grid w-full gap-4 px-4 py-4 md:px-5 xl:gap-5 xl:px-6",
          navOpen
            ? "md:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)]"
            : "md:grid-cols-[4.5rem_minmax(0,1fr)] xl:grid-cols-[4.5rem_minmax(0,1fr)]",
        )}
      >
        <aside className="self-start md:sticky md:top-4">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between gap-2 px-2">
              {navOpen && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  메뉴
                </span>
              )}
              <button
                type="button"
                onClick={() => setNavOpen((v) => !v)}
                className="inline-flex items-center justify-center rounded-md border border-border bg-background p-2 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                title={navOpen ? "메뉴 접기" : "메뉴 펼치기"}
              >
                {navOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </button>
            </div>
            <AdminMenu
              open={navOpen}
              can={can}
              isAdmin={isAdmin}
              isEditor={isEditor}
              isModerator={isModerator}
              pathname={pathname}
            />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function AdminMenu({
  open,
  can,
  isAdmin,
  isEditor,
  isModerator,
  pathname,
}: {
  open: boolean;
  can: (role?: NavItem["requires"]) => boolean;
  isAdmin: boolean;
  isEditor: boolean;
  isModerator: boolean;
  pathname: string;
}) {
  return (
    <>
      <div className="mb-4 px-2 pt-1">
        {open ? (
          <>
            <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">
              Lovetale
            </span>
            <h2 className="mt-0.5 font-display text-xl font-semibold">Studio</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAdmin ? "Admin" : isEditor ? "Editor" : isModerator ? "Moderator" : "Staff"} 콘솔
            </p>
            <Link
              to="/explore"
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              사용자 화면으로 이동 <ExternalLink className="h-3 w-3" />
            </Link>
          </>
        ) : (
          <div className="flex justify-center py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            LT
          </div>
        )}
      </div>

      <nav className="space-y-5">
        {NAV_SECTIONS.map((section) => {
          const items = NAV.filter((item) => item.section === section.id && can(item.requires));
          if (!items.length) return null;

          return (
            <section key={section.id} className="space-y-2">
              {open && (
                <div className="flex items-end justify-between px-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {section.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground/75">
                      {section.desc}
                    </div>
                  </div>
                  <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {items.length}
                  </span>
                </div>
              )}

              <div className="space-y-1">
                {items.map((item) => {
                  const active =
                    item.to === "/admin" ? pathname === "/admin" : pathname.startsWith(item.to);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                        active
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-surface-elevated/50 hover:text-foreground",
                      )}
                      title={open ? undefined : item.label}
                    >
                      <span
                        className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-background text-muted-foreground transition-colors",
                          active && "border-primary/30 bg-primary/10 text-primary",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      {open && (
                        <span className="min-w-0 pt-0.5">
                          <span className="block text-sm font-medium leading-tight">{item.label}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground/80">
                            {item.desc}
                          </span>
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </>
  );
}
