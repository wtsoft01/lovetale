import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, Trash2, KeyRound, Shield, ShieldCheck, ShieldAlert, Coins, MinusCircle } from "lucide-react";
import { toast } from "sonner";

import {
  adjustUserCredits,
  listAdminCreditUsers,
  type AdminCreditUserRow,
} from "@/lib/admin.functions";
import {
  listStaffUsers,
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

function UsersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listStaffUsers);
  const create = useServerFn(createStaffUser);
  const updateRoles = useServerFn(updateStaffRoles);
  const resetPw = useServerFn(resetStaffPassword);
  const remove = useServerFn(removeStaffUser);
  const listCreditUsers = useServerFn(listAdminCreditUsers);
  const adjustCredits = useServerFn(adjustUserCredits);

  const staffQ = useQuery({ queryKey: ["staff_users"], queryFn: () => list() });
  const creditUsersQ = useQuery({ queryKey: ["admin_credit_users"], queryFn: () => listCreditUsers() });

  const [openCreate, setOpenCreate] = useState(false);
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
    },
    onError: (e: any) => toast.error(e?.message ?? "생성에 실패했습니다."),
  });

  const rolesM = useMutation({
    mutationFn: (input: { userId: string; roles: StaffRole[] }) =>
      updateRoles({ data: input }),
    onSuccess: () => {
      toast.success("권한을 업데이트했습니다.");
      qc.invalidateQueries({ queryKey: ["staff_users"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "권한 업데이트에 실패했습니다."),
  });

  const removeM = useMutation({
    mutationFn: (userId: string) => remove({ data: { userId } }),
    onSuccess: () => {
      toast.success("스태프 권한을 회수했습니다.");
      qc.invalidateQueries({ queryKey: ["staff_users"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "권한 회수에 실패했습니다."),
  });

  const resetM = useMutation({
    mutationFn: (input: { userId: string; password: string }) =>
      resetPw({ data: input }),
    onSuccess: () => toast.success("비밀번호를 재설정했습니다."),
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
      qc.invalidateQueries({ queryKey: ["my_profile_balance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "크레딧 처리에 실패했습니다."),
  });

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
          <h1 className="text-2xl font-semibold tracking-tight">Users & Roles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            운영진 계정을 생성하고 메뉴별 접근 권한을 부여합니다. (admin / editor / moderator)
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

      <Card>
        <CardHeader>
          <CardTitle>역할 가이드</CardTitle>
          <CardDescription>각 역할이 접근할 수 있는 운영 메뉴 범위입니다.</CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>스태프 ({staffQ.data?.length ?? 0})</CardTitle>
          <CardDescription>역할 변경은 즉시 적용됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {staffQ.isLoading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
            </div>
          )}
          {staffQ.error && (
            <p className="text-sm text-destructive">{(staffQ.error as Error).message}</p>
          )}
          {staffQ.data && staffQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">아직 등록된 스태프가 없습니다.</p>
          )}
          <ul className="divide-y">
            {staffQ.data?.map((u) => (
              <li key={u.userId} className="py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{u.email ?? "(no email)"}</span>
                    {u.displayName && (
                      <span className="text-xs text-muted-foreground">· {u.displayName}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} variant="secondary">{ROLE_META[r].label}</Badge>
                    ))}
                  </div>
                </div>
                <RolePicker
                  value={u.roles}
                  compact
                  onChange={(roles) => rolesM.mutate({ userId: u.userId, roles })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const pw = prompt("새 비밀번호 (8자 이상)");
                    if (pw && pw.length >= 8) resetM.mutate({ userId: u.userId, password: pw });
                    else if (pw) toast.error("비밀번호는 8자 이상이어야 합니다.");
                  }}
                >
                  <KeyRound className="h-4 w-4 mr-1" /> 비밀번호
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    if (confirm(`${u.email} 계정의 스태프 권한을 모두 회수할까요?`)) {
                      removeM.mutate(u.userId);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> 회수
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="size-5 text-primary" />
            회원 크레딧 운영
          </CardTitle>
          <CardDescription>
            회원별 보유 크레딧을 확인하고 운영자가 직접 지급하거나 차감합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {creditUsersQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 회원 크레딧을 불러오는 중...
            </div>
          )}
          {creditUsersQ.error && (
            <p className="text-sm text-destructive">{(creditUsersQ.error as Error).message}</p>
          )}
          <ul className="divide-y">
            {creditUsersQ.data?.map((user) => (
              <li key={user.userId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{user.email ?? user.userId}</span>
                    {user.displayName && <span className="text-xs text-muted-foreground">· {user.displayName}</span>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    최근 갱신 {user.updatedAt ? new Date(user.updatedAt).toLocaleString() : "-"}
                  </div>
                </div>
                <div className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                  {user.credits.toLocaleString()} cr
                </div>
                <Button size="sm" onClick={() => openCreditDialog(user, "grant")}>
                  <Coins className="mr-1 size-4" />
                  지급
                </Button>
                <Button size="sm" variant="outline" onClick={() => openCreditDialog(user, "deduct")}>
                  <MinusCircle className="mr-1 size-4" />
                  차감
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

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
