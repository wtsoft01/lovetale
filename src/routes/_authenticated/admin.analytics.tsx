import { createFileRoute } from "@tanstack/react-router";
import { StudioStub } from "@/components/admin/studio-stub";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Studio" }] }),
  component: () => (
    <StudioStub
      phase="Phase 5"
      title="Analytics"
      description="콘텐츠와 매출의 퍼널을 분석합니다. 어디서 이탈하고, 어느 tier에서 결제가 일어나는지 한눈에."
      bullets={[
        "비트별 이탈률 히트맵",
        "엔딩 도달 분포 (어떤 엔딩이 인기 있는지)",
        "tier별 unlock 전환율 · 평균 도달 호감도",
        "스토리별 LTV · 작가별 매출 랭킹",
        "코호트: 가입일 기준 잔존율",
      ]}
    />
  ),
});
