import { createFileRoute } from "@tanstack/react-router";
import { HEAT_TIERS } from "@/lib/heat-tier";
import { Flame } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/heat")({
  head: () => ({ meta: [{ title: "Heat & Affection — Studio" }] }),
  component: HeatPage,
});

function HeatPage() {
  return (
    <div>
      <header className="mb-6">
        <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">
          Phase 5
        </span>
        <h1 className="mt-1 font-display text-3xl font-semibold">
          Heat & Affection
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          친밀도 단계와 잠금 규칙을 튜닝합니다. 사용자가 캐릭터와 대화·선택을 통해
          호감도를 쌓아 더 깊은 장면을 해금하는 핵심 루프입니다.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {HEAT_TIERS.map((t) => (
          <div
            key={t.key}
            className={`overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${t.gradient}`}
          >
            <div className="bg-background/70 p-5 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-primary" />
                <span className="font-display text-lg font-semibold">
                  {t.label}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t.min}–{t.max}
                </span>
              </div>
              <p className="mt-2 text-sm">{t.preview}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/40 p-6">
        <h2 className="font-display text-lg font-semibold">곧 추가될 컨트롤</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>· 4개 티어 임계값(0/30/55/75) 슬라이더 · 실시간 미리보기 그래프</li>
          <li>· 선택지 호감도 가중치 글로벌 배수(이벤트성 부스트)</li>
          <li>· 잠금 해제 비용(크레딧) — 자산 단위 · 비트 단위</li>
          <li>· tier별 평균 도달률 · 전환률 분석</li>
        </ul>
      </div>
    </div>
  );
}
