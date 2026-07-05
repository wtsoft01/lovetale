import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Users,
  BookOpen,
  Sparkles,
  DollarSign,
  ReceiptText,
  Activity,
  ArrowRight,
  Image,
  Store,
  KeyRound,
  Gauge,
} from "lucide-react";

import { getAdminDashboardStats } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Dashboard — Lovetale Studio" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchStats = useServerFn(getAdminDashboardStats);
  const q = useQuery({
    queryKey: ["admin_dashboard_stats"],
    queryFn: () => fetchStats(),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">
            운영 대시보드
          </span>
          <h1 className="mt-1 font-display text-3xl font-semibold">오늘의 작업 현황</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            콘텐츠 등록과 목록 운영은 <b>스토리관리</b>에서 처리하세요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/stories" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <BookOpen className="h-4 w-4" /> 스토리관리
          </Link>
        </div>
      </header>

      {q.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : q.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(q.error as Error).message}
        </div>
      ) : q.data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <KpiCard
              icon={Users}
              label="총 사용자"
              value={q.data.totalUsers.toLocaleString()}
            />
            <KpiCard
              icon={BookOpen}
              label="전체 스토리"
              value={q.data.totalStories.toLocaleString()}
              hint={`공개 ${q.data.listedStories.toLocaleString()}편`}
            />
            <KpiCard
              icon={Activity}
              label="활성 세션 (7일)"
              value={q.data.activeSessions7d.toLocaleString()}
            />
            <KpiCard
              icon={DollarSign}
              label="매출 (24h)"
              value={`$${q.data.revenue24hUsd.toLocaleString()}`}
              hint="확정 결제 기준"
            />
            <KpiCard
              icon={ReceiptText}
              label="입금 확인 대기"
              value={q.data.pendingOrders.toLocaleString()}
              tone={q.data.pendingOrders > 0 ? "warning" : "default"}
            />
            <KpiCard
              icon={Sparkles}
              label="평균 도달 Heat"
              value="—"
              hint="Phase 5에서 활성화"
            />
          </div>

          {/* Quick actions — grouped: 콘텐츠 / 운영 / 설정 */}
          <section className="space-y-4">
            <QuickGroup title="콘텐츠">
              <QuickCard
                to="/admin/stories"
                icon={BookOpen}
                title="스토리관리"
                desc="등록 · 검색 · 분류 · 일괄 운영"
              />
              <QuickCard
                to="/admin/characters"
                icon={Sparkles}
                title="캐릭터관리"
                desc="캐릭터 카드 · 관계 · 비주얼 프롬프트"
              />
              <QuickCard
                to="/admin/media"
                icon={Image}
                title="미디어 자료실"
                desc="이미지 · 영상 · 사운드 업로드 및 태깅"
              />
            </QuickGroup>

            <QuickGroup title="운영">
              <QuickCard
                to="/admin/users"
                icon={Users}
                title="회원 관리"
                desc="사용자 · 관리자 권한"
              />
              <QuickCard
                to="/admin/orders"
                icon={DollarSign}
                title="매출 관리"
                desc={`${q.data.pendingOrders}건 입금 확인 대기`}
              />
              <QuickCard
                to="/admin/analytics"
                icon={Gauge}
                title="사용량 분석"
                desc="활성 세션 · 전환 지표"
              />
            </QuickGroup>

            <QuickGroup title="설정">
              <QuickCard
                to="/admin/settings"
                icon={Store}
                title="스토어 설정"
                desc="가격 · 노출 · 판매 정책"
              />
              <QuickCard
                to="/admin/llm"
                icon={KeyRound}
                title="LLM API"
                desc="키 · 모델 · 자동 로테이션"
              />
            </QuickGroup>
          </section>
        </>
      ) : null}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={`rounded-2xl border bg-card p-4 ${
        tone === "warning"
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon
          className={`h-4 w-4 ${
            tone === "warning" ? "text-amber-500" : "text-muted-foreground"
          }`}
        />
      </div>
      <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
      {hint && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function QuickCard({
  to,
  icon: Icon,
  title,
  desc,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="group flex min-h-28 items-start justify-between gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-surface-elevated/40"
    >
      <div className="min-w-0">
        <Icon className="mb-3 h-5 w-5 text-primary" />
        <div className="font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function QuickGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  );
}
