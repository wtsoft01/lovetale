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
import { useEffect, useState, type ReactNode } from "react";
import { Coins, Bell, LogIn, LogOut, Menu, Moon, Sun } from "lucide-react";

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
          이 페이지는 존재하지 않거나 다른 곳으로 이동했어요.
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

const siteDescription =
  "AI 캐릭터 채팅과 멀티모달 웹소설을 결합한 로맨스 스토리 플랫폼입니다.";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lovetale | AI 멀티모달 로맨스 스토리" },
      { name: "description", content: siteDescription },
      { name: "author", content: "Lovetale" },
      { property: "og:title", content: "Lovetale | AI 멀티모달 로맨스 스토리" },
      { property: "og:description", content: siteDescription },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Lovetale | AI 멀티모달 로맨스 스토리" },
      { name: "twitter:description", content: siteDescription },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/124ea065-f219-46d2-beac-e98d4975419c/id-preview-bd03ac19--a2d88b88-1d3a-46ab-b2c6-7cff130f9c7f.lovable.app-1782140116678.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/124ea065-f219-46d2-beac-e98d4975419c/id-preview-bd03ac19--a2d88b88-1d3a-46ab-b2c6-7cff130f9c7f.lovable.app-1782140116678.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "shortcut icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
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
    <html lang="ko" className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
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
  const isPlayRoute = useRouterState({
    select: (s) =>
      s.location.pathname.startsWith("/play/") ||
      s.location.pathname.startsWith("/story-rpg/") ||
      s.location.pathname.startsWith("/_authenticated/play/"),
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {isAdminRoute ? (
          <Outlet />
        ) : isPlayRoute ? (
          <SidebarProvider defaultOpen={false}>
            <div className="min-h-screen w-full bg-background">
              <AppSidebar
                collapsible="offcanvas"
                className="border-r border-sidebar-border bg-sidebar/98 shadow-2xl"
              />
              <div className="fixed left-3 top-3 z-50 md:left-4 md:top-4">
                <SidebarTrigger className="h-10 w-10 rounded-full border border-white/12 bg-black/72 text-white shadow-2xl backdrop-blur-xl hover:bg-black/86 hover:text-white">
                  <Menu className="h-4 w-4" />
                </SidebarTrigger>
              </div>
              <Outlet />
            </div>
          </SidebarProvider>
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
      <button
        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-elevated/60 text-muted-foreground transition hover:text-foreground"
        aria-label="알림"
      >
        <Bell className="h-4 w-4" />
      </button>
      <HeaderThemeToggle />
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
        aria-label="로그아웃"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </>
  );
}

function HeaderThemeToggle() {
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("lovetale-theme");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
    setDarkMode(savedTheme ? savedTheme !== "light" : prefersDark);
  }, []);

  function applyTheme(useDark: boolean) {
    document.documentElement.classList.toggle("dark", useDark);
    document.documentElement.classList.toggle("light", !useDark);
    document.documentElement.style.colorScheme = useDark ? "dark" : "light";
  }

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    window.localStorage.setItem("lovetale-theme", next ? "dark" : "light");
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-elevated/60 text-muted-foreground transition hover:text-foreground"
      title={darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
      aria-label={darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
    >
      {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
