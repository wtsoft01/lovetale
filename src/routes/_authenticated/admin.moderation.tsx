import { createFileRoute } from "@tanstack/react-router";
import { StudioStub } from "@/components/admin/studio-stub";

export const Route = createFileRoute("/_authenticated/admin/moderation")({
  head: () => ({ meta: [{ title: "Moderation — Studio" }] }),
  component: () => (
    <StudioStub
      phase="Phase 5"
      title="Moderation"
      description="자동·수동 플래그된 콘텐츠를 검토하고 차단·승인합니다. 운영진의 모든 액션은 감사 로그에 남습니다."
      bullets={[
        "큐: 신규 / 검토 중 / 차단 / 승인 탭",
        "자동 플래그 사유: 미성년 묘사 · 실존 인물 · 금칙어 · 저작권",
        "사용자 신고 통합 · 신고자 가중치",
        "검토 화면: 원문 · AI 분석 점수 · 유사 사례 자동 매칭",
        "감사 로그: 누가 / 언제 / 무엇을 변경",
      ]}
    />
  ),
});
