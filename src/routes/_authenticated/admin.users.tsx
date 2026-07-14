import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Activity, Clock3, Eye, ListChecks, Loader2, Plus, Trash2, KeyRound, Shield, ShieldCheck, ShieldAlert, Coins, MinusCircle, Heart, Search, UserRound, CalendarClock, UsersRound } from "lucide-react";
import { toast } from "sonner";

import {
  adjustUserCredits,
  bulkAdjustUserCredits,
  bulkUpdateAdminMembers,
  getAdminUserAffections,
  listAdminMembers,
  setAdminUserAffection,
  updateAdminMemberProfile,
  type AdminAvailableAffectionStory,
  type AdminCreditUserRow,
  type AdminMemberRow,
} from "@/lib/admin.functions";
import {
  createStaffUser,
  updateStaffRoles,
  resetStaffPassword,
  removeStaffUser,
  type StaffRole,
} from "@/lib/admin-staff.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Users & Roles | Studio" }] }),
  component: UsersPage,
});

const ROLE_META: Record<StaffRole, { label: string; desc: string; icon: typeof Shield }> = {
  admin: { label: "Admin", desc: "전체 권한, 결제, 설정, 역할 관리", icon: ShieldCheck },
  editor: { label: "Editor", desc: "스토리, 캐릭터, 미디어 이미지/영상 등록 권한", icon: Shield },
  moderator: { label: "Moderator", desc: "신고와 자동 플래그 처리", icon: ShieldAlert },
};
const ALL_ROLES: StaffRole[] = ["admin", "editor", "moderator"];
type MemberTab = "members" | "admins";
type BulkChoice = "keep" | "true" | "false";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "-";
  return time.toLocaleString("ko-KR");
}

function formatRelative(value?: string | null) {
  if (!value) return "-";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "-";
  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  return `${months}개월 전`;
}

function formatDuration(seconds?: number | null) {
  const value = Math.max(0, Math.round(Number(seconds ?? 0)));
  if (!value) return "-";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분`;
  return `${value}초`;
}

function loginStatus(member: AdminMemberRow) {
  if (member.activeNow) return { label: "접속중", className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" };
  const time = member.lastSignInAt ? new Date(member.lastSignInAt).getTime() : 0;
  if (!Number.isFinite(time) || time <= 0) return { label: "로그인 없음", className: "border-muted text-muted-foreground" };
  const diff = Date.now() - time;
  if (diff <= 24 * 60 * 60 * 1000) return { label: "오늘 로그인", className: "border-sky-400/40 bg-sky-500/10 text-sky-300" };
  if (diff <= 7 * 24 * 60 * 60 * 1000) return { label: "최근 7일", className: "border-primary/30 bg-primary/10 text-primary" };
  return { label: "휴면", className: "border-amber-400/40 bg-amber-500/10 text-amber-300" };
}

function UsersPage() {
  const qc = useQueryClient();
  const create = useServerFn(createStaffUser);
  const updateRoles = useServerFn(updateStaffRoles);
  const resetPw = useServerFn(resetStaffPassword);
  const remove = useServerFn(removeStaffUser);
  const listMembers = useServerFn(listAdminMembers);
  const getAffections = useServerFn(getAdminUserAffections);
  const updateMemberProfile = useServerFn(updateAdminMemberProfile);
  const setUserAffection = useServerFn(setAdminUserAffection);
  const bulkUpdateMembers = useServerFn(bulkUpdateAdminMembers);
  const bulkAdjustCredits = useServerFn(bulkAdjustUserCredits);
  const adjustCredits = useServerFn(adjustUserCredits);

  const membersQ = useQuery({ queryKey: ["admin_members"], queryFn: () => listMembers() });

  const [openCreate, setOpenCreate] = useState(false);
  const [memberTab, setMemberTab] = useState<MemberTab>("members");
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    ageVerified: "keep" as BulkChoice,
    isSubscribed: "keep" as BulkChoice,
    subscriptionExpiresAt: "",
    creditMode: "none" as "none" | "grant" | "deduct",
    creditAmount: 0,
    note: "",
  });
  const [profileTarget, setProfileTarget] = useState<AdminMemberRow | null>(null);
  const [profileForm, setProfileForm] = useState({
    displayName: "",
    ageVerified: false,
    isSubscribed: false,
    subscriptionExpiresAt: "",
  });
  const [affectionTarget, setAffectionTarget] = useState<AdminMemberRow | null>(null);
  const [affectionForm, setAffectionForm] = useState({ storyId: "", affection: 0 });
  const [creditTarget, setCreditTarget] = useState<AdminCreditUserRow | null>(null);
  const [creditForm, setCreditForm] = useState({ mode: "grant" as "grant" | "deduct", amount: 0, note: "" });
  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    roles: ["editor"] as StaffRole[],
  });

  const createM = useMutation({
    mutationFn: (input: typeof form) => create({ data: input }),
    onSuccess: () => {
      toast.success("스태프 계정을 생성했습니다.");
      setOpenCreate(false);
      setForm({ email: "", password: "", displayName: "", roles: ["editor"] });
      qc.invalidateQueries({ queryKey: ["staff_users"] });
      qc.invalidateQueries({ queryKey: ["admin_members"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "생성에 실패했습니다."),
  });

  const rolesM = useMutation({
    mutationFn: (input: { userId: string; roles: StaffRole[] }) =>
      updateRoles({ data: input }),
    onSuccess: () => {
      toast.success("권한을 업데이트했습니다.");
      qc.invalidateQueries({ queryKey: ["staff_users"] });
      qc.invalidateQueries({ queryKey: ["admin_members"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "권한 업데이트에 실패했습니다."),
  });

  const removeM = useMutation({
    mutationFn: (userId: string) => remove({ data: { userId } }),
    onSuccess: () => {
      toast.success("스태프 권한을 회수했습니다.");
      qc.invalidateQueries({ queryKey: ["staff_users"] });
      qc.invalidateQueries({ queryKey: ["admin_members"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "권한 회수에 실패했습니다."),
  });

  const resetM = useMutation({
    mutationFn: (input: { userId: string; password: string }) =>
      resetPw({ data: input }),
    onSuccess: () => {
      toast.success("비밀번호를 재설정했습니다.");
      qc.invalidateQueries({ queryKey: ["admin_members"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "비밀번호 재설정에 실패했습니다."),
  });

  const creditM = useMutation({
    mutationFn: (input: { userId: string; delta: number; note?: string }) =>
      adjustCredits({ data: input }),
    onSuccess: (res) => {
      toast.success(`크레딧을 반영했습니다. 현재 잔액 ${res.balanceAfter.toLocaleString()} cr`);
      setCreditTarget(null);
      setCreditForm({ mode: "grant", amount: 0, note: "" });
      qc.invalidateQueries({ queryKey: ["admin_credit_users"] });
      qc.invalidateQueries({ queryKey: ["admin_members"] });
      qc.invalidateQueries({ queryKey: ["my_profile_balance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "크레딧 처리에 실패했습니다."),
  });

  const profileM = useMutation({
    mutationFn: () =>
      updateMemberProfile({
        data: {
          userId: profileTarget!.userId,
          displayName: profileForm.displayName,
          ageVerified: profileForm.ageVerified,
          isSubscribed: profileForm.isSubscribed,
          subscriptionExpiresAt: profileForm.subscriptionExpiresAt || null,
        },
      }),
    onSuccess: () => {
      toast.success("회원 프로필을 저장했습니다.");
      setProfileTarget(null);
      qc.invalidateQueries({ queryKey: ["admin_members"] });
      qc.invalidateQueries({ queryKey: ["admin_credit_users"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "회원 프로필 저장에 실패했습니다."),
  });

  const affectionsQ = useQuery({
    queryKey: ["admin_user_affection", affectionTarget?.userId ?? "none"],
    queryFn: () => getAffections({ data: { userId: affectionTarget!.userId } }),
    enabled: Boolean(affectionTarget),
  });

  const affectionM = useMutation({
    mutationFn: () =>
      setUserAffection({
        data: {
          userId: affectionTarget!.userId,
          storyId: affectionForm.storyId,
          affection: affectionForm.affection,
        },
      }),
    onSuccess: (res) => {
      toast.success(`호감도를 ${res.affection}으로 조정했습니다.`);
      qc.invalidateQueries({ queryKey: ["admin_user_affection", affectionTarget?.userId ?? "none"] });
      qc.invalidateQueries({ queryKey: ["admin_members"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "호감도 조정에 실패했습니다."),
  });

  const bulkM = useMutation({
    mutationFn: async () => {
      const userIds = Array.from(selectedIds);
      if (!userIds.length) throw new Error("선택된 회원이 없습니다.");
      let changed = false;
      if (
        bulkForm.ageVerified !== "keep" ||
        bulkForm.isSubscribed !== "keep" ||
        bulkForm.subscriptionExpiresAt
      ) {
        await bulkUpdateMembers({
          data: {
            userIds,
            ageVerified: bulkForm.ageVerified === "keep" ? null : bulkForm.ageVerified === "true",
            isSubscribed: bulkForm.isSubscribed === "keep" ? null : bulkForm.isSubscribed === "true",
            subscriptionExpiresAt: bulkForm.subscriptionExpiresAt || undefined,
          },
        });
        changed = true;
      }
      const amount = Math.max(0, Math.floor(Number(bulkForm.creditAmount) || 0));
      if (bulkForm.creditMode !== "none" && amount > 0) {
        await bulkAdjustCredits({
          data: {
            userIds,
            delta: bulkForm.creditMode === "deduct" ? -amount : amount,
            note: bulkForm.note,
          },
        });
        changed = true;
      }
      if (!changed) throw new Error("적용할 대량 작업을 선택하세요.");
      return { count: userIds.length };
    },
    onSuccess: (res) => {
      toast.success(`${res.count}명에게 대량 작업을 적용했습니다.`);
      setBulkOpen(false);
      setSelectedIds(new Set());
      setBulkForm({
        ageVerified: "keep",
        isSubscribed: "keep",
        subscriptionExpiresAt: "",
        creditMode: "none",
        creditAmount: 0,
        note: "",
      });
      qc.invalidateQueries({ queryKey: ["admin_members"] });
      qc.invalidateQueries({ queryKey: ["admin_credit_users"] });
      qc.invalidateQueries({ queryKey: ["my_profile_balance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "대량 작업에 실패했습니다."),
  });

  const filteredMembers = useMemo(() => {
    const keyword = memberQuery.trim().toLowerCase();
    const rows = membersQ.data ?? [];
    if (!keyword) return rows;
    return rows.filter((member) =>
      [member.email, member.displayName, member.userId].some((value) =>
        String(value ?? "").toLowerCase().includes(keyword),
      ),
    );
  }, [memberQuery, membersQ.data]);

  const regularMembers = useMemo(() => filteredMembers.filter((member) => member.roles.length === 0), [filteredMembers]);
  const adminMembers = useMemo(() => filteredMembers.filter((member) => member.roles.length > 0), [filteredMembers]);
  const visibleMembers = memberTab === "admins" ? adminMembers : regularMembers;
  const selectedMembers = visibleMembers.filter((member) => selectedIds.has(member.userId));
  const activeMembers = (membersQ.data ?? []).filter((member) => member.activeNow).length;
  const recentMembers = (membersQ.data ?? []).filter((member) => {
    const time = member.lastSignInAt ? new Date(member.lastSignInAt).getTime() : 0;
    return Number.isFinite(time) && Date.now() - time <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  function setTab(next: string) {
    setMemberTab(next as MemberTab);
    setSelectedIds(new Set());
  }

  function toggleMember(userId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleVisibleMembers() {
    setSelectedIds((prev) => {
      const visibleIds = visibleMembers.map((member) => member.userId);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      if (allSelected) return new Set([...prev].filter((id) => !visibleIds.includes(id)));
      return new Set([...prev, ...visibleIds]);
    });
  }

  function openProfileDialog(member: AdminMemberRow) {
    setProfileTarget(member);
    setProfileForm({
      displayName: member.displayName ?? "",
      ageVerified: member.ageVerified,
      isSubscribed: member.isSubscribed,
      subscriptionExpiresAt: member.subscriptionExpiresAt?.slice(0, 10) ?? "",
    });
  }

  function openAffectionDialog(member: AdminMemberRow) {
    setAffectionTarget(member);
    setAffectionForm({ storyId: "", affection: member.averageAffection || 0 });
  }

  function selectAffectionStory(story: AdminAvailableAffectionStory) {
    const current = affectionsQ.data?.rows.find((row) => row.storyId === story.storyId);
    setAffectionForm({
      storyId: story.storyId,
      affection: current?.affection ?? story.initialAffection ?? 0,
    });
  }

  function openCreditDialog(user: AdminCreditUserRow, mode: "grant" | "deduct") {
    setCreditTarget(user);
    setCreditForm({ mode, amount: 0, note: "" });
  }

  function submitCreditAdjust() {
    if (!creditTarget) return;
    const amount = Math.max(0, Math.floor(Number(creditForm.amount) || 0));
    if (amount <= 0) {
      toast.error("크레딧 수량을 입력하세요.");
      return;
    }
    const delta = creditForm.mode === "deduct" ? -amount : amount;
    creditM.mutate({ userId: creditTarget.userId, delta, note: creditForm.note });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">회원관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            실제 회원 리스트를 기준으로 프로필, 크레딧, 호감도, 운영 권한을 관리합니다.
          </p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />스태프 생성</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 스태프 계정</DialogTitle>
              <DialogDescription>
                이메일과 비밀번호를 발급하고 접근 가능한 역할을 선택하세요.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>이메일</Label>
                <Input
                  type="email"
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="editor@lovetale.org"
                />
              </div>
              <div className="space-y-2">
                <Label>비밀번호 (8자 이상)</Label>
                <Input
                  type="text"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>표시 이름 (선택)</Label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>역할</Label>
                <RolePicker
                  value={form.roles}
                  onChange={(roles) => setForm((f) => ({ ...f, roles }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpenCreate(false)}>취소</Button>
              <Button
                disabled={createM.isPending}
                onClick={() => createM.mutate(form)}
              >
                {createM.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                생성
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={UsersRound} label="전체 회원" value={(membersQ.data?.length ?? 0).toLocaleString()} />
        <MetricCard icon={Activity} label="접속중" value={activeMembers.toLocaleString()} />
        <MetricCard icon={CalendarClock} label="최근 7일 로그인" value={recentMembers.toLocaleString()} />
        <MetricCard icon={ShieldCheck} label="관리자" value={adminMembers.length.toLocaleString()} />
      </div>

      <Tabs value={memberTab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="h-10 w-full justify-start bg-muted/70 lg:w-auto">
            <TabsTrigger value="members" className="gap-2">
              <UserRound className="size-4" />
              일반회원
              <span className="rounded-full bg-background/70 px-2 py-0.5 text-[11px]">{regularMembers.length}</span>
            </TabsTrigger>
            <TabsTrigger value="admins" className="gap-2">
              <ShieldCheck className="size-4" />
              관리자
              <span className="rounded-full bg-background/70 px-2 py-0.5 text-[11px]">{adminMembers.length}</span>
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                className="h-10 pl-9"
                placeholder="이메일, 이름, user id 검색"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={toggleVisibleMembers}>
                <ListChecks className="mr-1 size-4" />
                현재 탭 선택
              </Button>
              <Button size="sm" disabled={!selectedMembers.length} onClick={() => setBulkOpen(true)}>
                선택 관리 {selectedMembers.length ? selectedMembers.length : ""}
              </Button>
              {selectedIds.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  선택 해제
                </Button>
              )}
            </div>
          </div>
        </div>

        {membersQ.isLoading && (
          <Card>
            <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 회원을 불러오는 중...
            </CardContent>
          </Card>
        )}
        {membersQ.error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {(membersQ.error as Error).message}
          </p>
        )}

        <TabsContent value="members" className="m-0">
          <MemberDenseList
            rows={regularMembers}
            selectedIds={selectedIds}
            adminMode={false}
            onToggle={toggleMember}
            onProfile={openProfileDialog}
            onAffection={openAffectionDialog}
            onCredit={openCreditDialog}
          />
        </TabsContent>

        <TabsContent value="admins" className="m-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">역할 가이드</CardTitle>
              <CardDescription>관리자 탭에서는 운영 권한과 회원 활동을 함께 확인합니다.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {ALL_ROLES.map((r) => {
                const m = ROLE_META[r];
                const Icon = m.icon;
                return (
                  <div key={r} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 font-medium">
                      <Icon className="h-4 w-4" /> {m.label}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <MemberDenseList
            rows={adminMembers}
            selectedIds={selectedIds}
            adminMode
            onToggle={toggleMember}
            onProfile={openProfileDialog}
            onAffection={openAffectionDialog}
            onCredit={openCreditDialog}
            onRolesChange={(member, roles) => rolesM.mutate({ userId: member.userId, roles })}
            onResetPassword={(member) => {
              const pw = prompt("새 비밀번호 (8자 이상)");
              if (pw && pw.length >= 8) resetM.mutate({ userId: member.userId, password: pw });
              else if (pw) toast.error("비밀번호는 8자 이상이어야 합니다.");
            }}
            onRemoveStaff={(member) => {
              if (confirm(`${member.email ?? member.userId} 계정의 스태프 권한을 모두 회수할까요?`)) {
                removeM.mutate(member.userId);
              }
            }}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>선택 회원 대량관리</DialogTitle>
            <DialogDescription>
              선택된 {selectedMembers.length}명에게 프로필 상태와 크레딧 작업을 한 번에 적용합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>성인인증</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={bulkForm.ageVerified}
                onChange={(event) => setBulkForm((prev) => ({ ...prev, ageVerified: event.target.value as BulkChoice }))}
              >
                <option value="keep">변경 안 함</option>
                <option value="true">인증 완료</option>
                <option value="false">인증 해제</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>구독 상태</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={bulkForm.isSubscribed}
                onChange={(event) => setBulkForm((prev) => ({ ...prev, isSubscribed: event.target.value as BulkChoice }))}
              >
                <option value="keep">변경 안 함</option>
                <option value="true">구독 적용</option>
                <option value="false">구독 해제</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>구독 만료일</Label>
              <Input
                type="date"
                value={bulkForm.subscriptionExpiresAt}
                onChange={(event) => setBulkForm((prev) => ({ ...prev, subscriptionExpiresAt: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>크레딧 작업</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={bulkForm.creditMode}
                onChange={(event) => setBulkForm((prev) => ({ ...prev, creditMode: event.target.value as "none" | "grant" | "deduct" }))}
              >
                <option value="none">변경 안 함</option>
                <option value="grant">일괄 지급</option>
                <option value="deduct">일괄 차감</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>크레딧 수량</Label>
              <Input
                type="number"
                min={0}
                value={bulkForm.creditAmount || ""}
                onChange={(event) => setBulkForm((prev) => ({ ...prev, creditAmount: Math.max(0, Number(event.target.value) || 0) }))}
                placeholder="예: 1000"
              />
            </div>
            <div className="space-y-2">
              <Label>운영 메모</Label>
              <Input
                value={bulkForm.note}
                onChange={(event) => setBulkForm((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="예: 이벤트 보상, 일괄 조정"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>취소</Button>
            <Button disabled={bulkM.isPending || !selectedMembers.length} onClick={() => bulkM.mutate()}>
              {bulkM.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(profileTarget)} onOpenChange={(open) => !open && setProfileTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>회원 프로필 수정</DialogTitle>
            <DialogDescription>
              {profileTarget?.email ?? profileTarget?.userId} 회원의 운영 프로필 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>표시 이름</Label>
              <Input
                value={profileForm.displayName}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, displayName: event.target.value }))}
                placeholder="회원 화면과 운영 목록에 표시할 이름"
              />
            </div>
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <Checkbox
                checked={profileForm.ageVerified}
                onCheckedChange={(checked) => setProfileForm((prev) => ({ ...prev, ageVerified: checked === true }))}
              />
              성인인증 완료
            </label>
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <Checkbox
                checked={profileForm.isSubscribed}
                onCheckedChange={(checked) => setProfileForm((prev) => ({ ...prev, isSubscribed: checked === true }))}
              />
              구독 회원
            </label>
            <div className="space-y-2">
              <Label>구독 만료일</Label>
              <Input
                type="date"
                value={profileForm.subscriptionExpiresAt}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, subscriptionExpiresAt: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProfileTarget(null)}>취소</Button>
            <Button disabled={profileM.isPending || !profileTarget} onClick={() => profileM.mutate()}>
              {profileM.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(affectionTarget)} onOpenChange={(open) => !open && setAffectionTarget(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>회원별 호감도 조정</DialogTitle>
            <DialogDescription>
              {affectionTarget?.email ?? affectionTarget?.userId} 회원의 스토리별 실제 호감도 값을 수정합니다.
            </DialogDescription>
          </DialogHeader>
          {affectionsQ.isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 호감도 정보를 불러오는 중...
            </div>
          ) : affectionsQ.error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {(affectionsQ.error as Error).message}
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
              <div className="space-y-3">
                <Label>스토리 선택</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={affectionForm.storyId}
                  onChange={(event) => {
                    const story = affectionsQ.data?.stories.find((item) => item.storyId === event.target.value);
                    if (story) selectAffectionStory(story);
                    else setAffectionForm((prev) => ({ ...prev, storyId: "", affection: 0 }));
                  }}
                >
                  <option value="">스토리를 선택하세요</option>
                  {affectionsQ.data?.stories.map((story) => {
                    const current = affectionsQ.data?.rows.find((row) => row.storyId === story.storyId);
                    return (
                      <option key={story.storyId} value={story.storyId}>
                        {story.storyTitle} · 현재 {current?.affection ?? story.initialAffection}
                      </option>
                    );
                  })}
                </select>
                <div className="grid grid-cols-5 gap-2">
                  {[0, 25, 50, 75, 100].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={affectionForm.affection === value ? "default" : "outline"}
                      onClick={() => setAffectionForm((prev) => ({ ...prev, affection: value }))}
                    >
                      {value}
                    </Button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label>호감도 수치</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={affectionForm.affection}
                    onChange={(event) =>
                      setAffectionForm((prev) => ({
                        ...prev,
                        affection: Math.max(0, Math.min(100, Math.round(Number(event.target.value) || 0))),
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    0부터 100까지 저장되며, 해금 이미지와 채팅 보상 계산에 같은 값이 사용됩니다.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>최근 저장된 호감도</Label>
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-2">
                  {affectionsQ.data?.rows.length ? affectionsQ.data.rows.map((row) => (
                    <button
                      key={row.storyId}
                      type="button"
                      className="w-full rounded-md border border-border/60 p-2 text-left text-sm transition hover:bg-accent"
                      onClick={() => {
                        const story = affectionsQ.data?.stories.find((item) => item.storyId === row.storyId) ?? {
                          storyId: row.storyId,
                          storyTitle: row.storyTitle,
                          initialAffection: row.initialAffection,
                          isPublic: true,
                          isListed: true,
                        };
                        selectAffectionStory(story);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="line-clamp-1 font-medium">{row.storyTitle}</span>
                        <Badge variant="secondary">{row.affection}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">최근 {formatDate(row.updatedAt)}</div>
                    </button>
                  )) : (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      아직 저장된 호감도가 없습니다. 스토리를 선택하면 초기값 기준으로 새로 저장할 수 있습니다.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAffectionTarget(null)}>닫기</Button>
            <Button
              disabled={affectionM.isPending || !affectionForm.storyId}
              onClick={() => affectionM.mutate()}
            >
              {affectionM.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              호감도 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(creditTarget)} onOpenChange={(open) => !open && setCreditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              크레딧 {creditForm.mode === "deduct" ? "차감" : "지급"}
            </DialogTitle>
            <DialogDescription>
              {creditTarget?.email ?? creditTarget?.userId} · 현재 {creditTarget?.credits.toLocaleString() ?? 0} cr
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={creditForm.mode === "grant" ? "default" : "outline"}
                onClick={() => setCreditForm((prev) => ({ ...prev, mode: "grant" }))}
              >
                지급
              </Button>
              <Button
                type="button"
                variant={creditForm.mode === "deduct" ? "default" : "outline"}
                onClick={() => setCreditForm((prev) => ({ ...prev, mode: "deduct" }))}
              >
                차감
              </Button>
            </div>
            <div className="space-y-2">
              <Label>크레딧 수량</Label>
              <Input
                type="number"
                min={1}
                value={creditForm.amount || ""}
                onChange={(event) => setCreditForm((prev) => ({ ...prev, amount: Math.max(0, Number(event.target.value) || 0) }))}
                placeholder="예: 1000"
              />
            </div>
            <div className="space-y-2">
              <Label>운영 메모</Label>
              <Input
                value={creditForm.note}
                onChange={(event) => setCreditForm((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="예: 이벤트 보상, 환불 조정"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreditTarget(null)}>취소</Button>
            <Button disabled={creditM.isPending} onClick={submitCreditAdjust}>
              {creditM.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {creditForm.mode === "deduct" ? "차감 적용" : "지급 적용"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid size-10 place-items-center rounded-lg border bg-background/60">
          <Icon className="size-5 text-primary" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MemberDenseList({
  rows,
  selectedIds,
  adminMode,
  onToggle,
  onProfile,
  onAffection,
  onCredit,
  onRolesChange,
  onResetPassword,
  onRemoveStaff,
}: {
  rows: AdminMemberRow[];
  selectedIds: Set<string>;
  adminMode: boolean;
  onToggle: (userId: string) => void;
  onProfile: (member: AdminMemberRow) => void;
  onAffection: (member: AdminMemberRow) => void;
  onCredit: (member: AdminMemberRow, mode: "grant" | "deduct") => void;
  onRolesChange?: (member: AdminMemberRow, roles: StaffRole[]) => void;
  onResetPassword?: (member: AdminMemberRow) => void;
  onRemoveStaff?: (member: AdminMemberRow) => void;
}) {
  if (!rows.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          조건에 맞는 회원이 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[1260px]">
            <div className="grid grid-cols-[40px_minmax(230px,1.4fr)_150px_160px_180px_150px_220px] items-center border-b bg-muted/35 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span />
              <span>회원</span>
              <span>최근 로그인</span>
              <span>방문/체류</span>
              <span>콘텐츠 활동</span>
              <span>가치/호감도</span>
              <span>{adminMode ? "권한/관리" : "회원정보 관리"}</span>
            </div>
            <div className="divide-y">
              {rows.map((member) => (
                <div
                  key={member.userId}
                  className="grid grid-cols-[40px_minmax(230px,1.4fr)_150px_160px_180px_150px_220px] items-center px-3 py-2 text-sm hover:bg-muted/25"
                >
                  <Checkbox checked={selectedIds.has(member.userId)} onCheckedChange={() => onToggle(member.userId)} />
                  <div className="min-w-0 pr-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{member.email ?? member.userId}</span>
                      {member.ageVerified && <Badge variant="outline" className="shrink-0 text-[10px]">성인</Badge>}
                      {member.isSubscribed && <Badge className="shrink-0 text-[10px]">구독</Badge>}
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                      {member.displayName && <span className="truncate">{member.displayName}</span>}
                      <span className="truncate">ID {member.userId}</span>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs">
                    <LoginStatusBadge member={member} />
                    <div className="text-muted-foreground">{formatRelative(member.lastSignInAt)}</div>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="inline-flex items-center gap-1">
                      <Eye className="size-3.5 text-primary" />
                      방문 {member.visitCount.toLocaleString()}
                    </div>
                    <div className="inline-flex items-center gap-1 text-muted-foreground">
                      <Clock3 className="size-3.5" />
                      {formatDuration(member.totalDwellSeconds)}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70">
                      {member.activitySource === "tracked" ? "실측" : "세션 추정"} · 최근 {formatRelative(member.lastActivityAt)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                    <span className="rounded-md bg-background/60 px-2 py-1">창작 {member.storyCount}</span>
                    <span className="rounded-md bg-background/60 px-2 py-1">세션 {member.sessionCount}</span>
                    <span className="rounded-md bg-background/60 px-2 py-1">채팅 {member.chatMessageCount}</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="inline-flex items-center gap-1 font-semibold text-primary">
                      <Coins className="size-3.5" />
                      {member.credits.toLocaleString()} cr
                    </div>
                    <div className="inline-flex items-center gap-1 text-muted-foreground">
                      <Heart className="size-3.5 text-rose-400" />
                      평균 {member.averageAffection} / 최고 {member.maxAffection}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {adminMode && onRolesChange ? (
                      <RolePicker
                        value={member.roles}
                        compact
                        onChange={(roles) => onRolesChange(member, roles)}
                      />
                    ) : null}
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => onProfile(member)}>
                      정보
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => onAffection(member)}>
                      호감도
                    </Button>
                    <Button size="sm" className="h-8 px-2" onClick={() => onCredit(member, "grant")}>
                      지급
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => onCredit(member, "deduct")}>
                      차감
                    </Button>
                    {adminMode && onResetPassword && (
                      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => onResetPassword(member)}>
                        <KeyRound className="size-3.5" />
                      </Button>
                    )}
                    {adminMode && onRemoveStaff && (
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => onRemoveStaff(member)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoginStatusBadge({ member }: { member: AdminMemberRow }) {
  const status = loginStatus(member);
  return (
    <Badge variant="outline" className={`w-fit text-[10px] ${status.className}`}>
      {status.label}
    </Badge>
  );
}

function RolePicker({
  value,
  onChange,
  compact,
}: {
  value: StaffRole[];
  onChange: (roles: StaffRole[]) => void;
  compact?: boolean;
}) {
  const toggle = (r: StaffRole) => {
    const next = value.includes(r) ? value.filter((x) => x !== r) : [...value, r];
    onChange(next);
  };
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "grid gap-2"}>
      {ALL_ROLES.map((r) => {
        const checked = value.includes(r);
        return (
          <label
            key={r}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
              checked ? "bg-accent" : ""
            }`}
          >
            <Checkbox checked={checked} onCheckedChange={() => toggle(r)} />
            <span>{ROLE_META[r].label}</span>
          </label>
        );
      })}
    </div>
  );
}
