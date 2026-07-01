import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Coins, Bell, LogIn, LogOut } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold">길을 잃었어요</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          이 페이지는 존재하지 않거나, 다른 차원으로 이동했어요.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-gradient-aurora px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow transition hover:opacity-90"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl font-semibold">페이지를 불러올 수 없어요</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          잠시 후 다시 시도하거나 홈으로 돌아가 주세요.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-gradient-aurora px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow transition hover:opacity-90"
          >
            다시 시도
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-elevated"
          >
            홈으로
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "러브테일,  AI 비주얼 소설 & 로맨스 시뮬레이션" },
      {
        name: "description",
        content:
          "AI가 살아 숨쉬는 캐릭터와 함께하는 차세대 비주얼 노벨 · 연애 시뮬레이션 플랫폼.",
      },
      { name: "author", content: "Lovetale" },
      { property: "og:title", content: "러브테일,  AI 비주얼 소설 & 로맨스 시뮬레이션" },
      {
        property: "og:description",
        content: "AI가 만들어내는 몰입형 캐릭터 로맨스 경험.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "러브테일,  AI 비주얼 소설 & 로맨스 시뮬레이션" },
      { name: "description", content: "AI 비쥬얼 소설 및 데이팅 시뮬레이션, 인공지능 소설만들기, 서브컬처, 데이팅 시뮬레이션, 몰입형 19금 소설" },
      { property: "og:description", content: "AI 비쥬얼 소설 및 데이팅 시뮬레이션, 인공지능 소설만들기, 서브컬처, 데이팅 시뮬레이션, 몰입형 19금 소설" },
      { name: "twitter:description", content: "AI 비쥬얼 소설 및 데이팅 시뮬레이션, 인공지능 소설만들기, 서브컬처, 데이팅 시뮬레이션, 몰입형 19금 소설" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/124ea065-f219-46d2-beac-e98d4975419c/id-preview-bd03ac19--a2d88b88-1d3a-46ab-b2c6-7cff130f9c7f.lovable.app-1782140116678.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/124ea065-f219-46d2-beac-e98d4975419c/id-preview-bd03ac19--a2d88b88-1d3a-46ab-b2c6-7cff130f9c7f.lovable.app-1782140116678.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/brand-symbol.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://cdn.jsdelivr.net", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('lovetale-theme')||'dark';document.documentElement.classList.toggle('light',t==='light');document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.style.colorScheme=t==='light'?'light':'dark';}catch(e){}",
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const isAdminRoute = useRouterState({
    select: (s) =>
      s.location.pathname.startsWith("/admin") ||
      s.location.pathname.startsWith("/_authenticated/admin"),
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {isAdminRoute ? (
          <Outlet />
        ) : (
          <SidebarProvider>
            <div className="flex min-h-screen w-full">
              <AppSidebar />
              <div className="flex min-h-screen flex-1 flex-col">
                <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl">
                  <SidebarTrigger className="-ml-1" />
                  <div className="ml-auto flex items-center gap-2">
                    <HeaderAuth />
                  </div>
                </header>
                <main className="flex-1">
                  <Outlet />
                </main>
              </div>
            </div>
          </SidebarProvider>
        )}
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function HeaderAuth() {
  const { user, signOut, loading } = useAuth();
  if (loading) return null;
  if (!user) {
    return (
      <Link
        to="/auth"
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated/60 px-3 py-1.5 text-xs hover:border-primary/50"
      >
        <LogIn className="h-3.5 w-3.5" /> 로그인
      </Link>
    );
  }
  const initial = (user.user_metadata?.display_name || user.email || "U")
    .charAt(0)
    .toUpperCase();
  return (
    <>
      <div className="hidden items-center gap-1.5 rounded-full border border-border bg-surface-elevated/60 px-3 py-1 text-xs sm:flex">
        <Coins className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">100</span>
        <span className="text-muted-foreground">크레딧</span>
      </div>
      <button className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-elevated/60 text-muted-foreground transition hover:text-foreground">
        <Bell className="h-4 w-4" />
      </button>
      <Link
        to="/profile"
        className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
        title={user.email ?? undefined}
      >
        {initial}
      </Link>
      <button
        onClick={() => signOut()}
        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-elevated/60 text-muted-foreground transition hover:text-foreground"
        title="로그아웃"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </>
  );
}
