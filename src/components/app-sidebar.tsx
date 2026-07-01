import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Compass, Sparkles, MessagesSquare, Crown, UserRound, Home, Receipt, ShieldCheck, Store, Library } from "lucide-react";
import { useServerFn } from "@/lib/_mock/runtime";
import { getMyProfile } from "@/lib/profile.functions";
const brandSymbolUrl = "/brand-symbol.png";

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

const navItems = [
  { title: "홈", url: "/", icon: Home },
  { title: "탐색", url: "/explore", icon: Compass },
  { title: "스토리마켓", url: "/marketplace", icon: Store },
  { title: "내스토리 로맨스", url: "/builder", icon: Sparkles },
  { title: "내 라이브러리", url: "/library", icon: Library },
  { title: "캐릭터 만들기", url: "/create", icon: Sparkles },
  { title: "내 채팅", url: "/chats", icon: MessagesSquare },
];

const accountItems = [
  { title: "프리미엄", url: "/premium", icon: Crown },
  { title: "주문 현황", url: "/orders", icon: Receipt },
  { title: "프로필", url: "/profile", icon: UserRound },
  { title: "관리자", url: "/admin", icon: ShieldCheck },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchProfile = useServerFn(getMyProfile);
  const profileQ = useQuery({
    queryKey: ["my_profile_balance"],
    queryFn: () => fetchProfile(),
  });
  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 pb-2 pt-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl">
            <img src={brandSymbolUrl} alt="Lovetale" className="h-full w-full object-contain" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-lg font-semibold tracking-wide">Lovetale</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              AI DATING NOVEL
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>플레이</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
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
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>계정</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountItems.map((item) => (
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
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4 group-data-[collapsible=icon]:hidden">
        <div className="rounded-xl border border-border bg-surface-elevated/60 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">잔여 크레딧</span>
            <span className="font-semibold text-foreground">
              {profileQ.data?.credits?.toLocaleString?.() ?? "0"}
            </span>
          </div>
          <Link
            to="/premium"
            className="mt-2 block rounded-lg bg-gradient-aurora px-3 py-1.5 text-center text-xs font-medium text-primary-foreground shadow-glow transition hover:opacity-90"
          >
            크레딧 충전
          </Link>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
