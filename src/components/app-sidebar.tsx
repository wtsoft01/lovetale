import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import {
  BookHeart,
  Coins,
  Crown,
  Gift,
  HeartHandshake,
  Library,
  Swords,
  ShieldCheck,
  Store,
  UserRound,
  WandSparkles,
} from "lucide-react";

import { useServerFn } from "@/lib/_mock/runtime";
import { getMyProfile } from "@/lib/profile.functions";
import { useAuth } from "@/hooks/use-auth";
import { getStaffAccess } from "@/lib/staff-access";
import { BrandLogo } from "@/components/brand-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const playItems = [
  { title: "스토리탐색", url: "/explore", icon: BookHeart },
  { title: "스토리게임", url: "/interactive-rpg", icon: Swords },
  { title: "캐릭터채팅", url: "/chats", icon: HeartHandshake },
];

const createItems = [
  { title: "자작스토리", url: "/builder", icon: WandSparkles },
  { title: "스토리마켓", url: "/marketplace", icon: Store },
  { title: "라이브러리", url: "/library", icon: Library },
];

const accountItems = [
  { title: "무료크래딧", url: "/rewards", icon: Gift },
  { title: "충전,구독", url: "/premium", icon: Crown },
  { title: "내 프로필", url: "/profile", icon: UserRound },
];

const adminAccountItem = { title: "관리자", url: "/admin", icon: ShieldCheck };

type SidebarItem = {
  title: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
};

function SidebarItemList({
  items,
  isActive,
}: {
  items: SidebarItem[];
  isActive: (url: string) => boolean;
}) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton asChild isActive={isActive(item.url)}>
            <Link to={item.url}>
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export function AppSidebar({
  collapsible = "icon",
  className,
}: {
  collapsible?: "offcanvas" | "icon" | "none";
  className?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session, loading: authLoading } = useAuth();
  const fetchProfile = useServerFn(getMyProfile);
  const profileQ = useQuery({
    queryKey: ["my_profile_balance", session?.user.id ?? "anon"],
    queryFn: () => fetchProfile(),
    enabled: !authLoading && Boolean(session),
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
  const staffQ = useQuery({
    queryKey: ["staff_roles", session?.user.id ?? "anon"],
    queryFn: () =>
      getStaffAccess({
        userId: session?.user.id,
        accessToken: session?.access_token,
        email: session?.user.email ?? undefined,
      }),
    enabled: !authLoading && Boolean(session),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
  const visibleAccountItems = staffQ.data?.hasAny ? [...accountItems, adminAccountItem] : accountItems;
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  return (
    <Sidebar collapsible={collapsible} className={className ?? "border-r border-sidebar-border"}>
      <SidebarHeader className="px-4 pb-2 pt-4">
        <Link to="/" className="flex items-center">
          <BrandLogo
            className="h-10 w-[158px] group-data-[collapsible=icon]:w-10"
            imageClassName="w-[158px] max-w-none"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>PLAY</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarItemList items={playItems} isActive={isActive} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>CREATE</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarItemList items={createItems} isActive={isActive} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>MY</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarItemList items={visibleAccountItems} isActive={isActive} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4 group-data-[collapsible=icon]:hidden">
        <div className="rounded-xl border border-border bg-surface-elevated/60 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Coins className="h-3.5 w-3.5 text-primary" />
              보유 크레딧
            </span>
            <span className="font-semibold text-foreground">
              {profileQ.data?.credits?.toLocaleString?.() ?? "0"}
            </span>
          </div>
          <Link
            to="/rewards"
            className="mt-2 block rounded-lg border border-pink-400/60 bg-pink-500 px-3 py-1.5 text-center text-xs font-semibold text-white shadow-sm transition hover:bg-pink-500/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/60"
          >
            무료크래딧
          </Link>
          <Link
            to="/premium"
            className="mt-1.5 block rounded-lg border border-primary/40 px-3 py-1.5 text-center text-xs font-semibold text-foreground transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            충전,구독
          </Link>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
