import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, Layers3, Sparkles, WandSparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/studio")({
  head: () => ({ meta: [{ title: "콘텐츠 스튜디오 — Lovetale Studio" }] }),
  component: StudioHub,
});

const STEPS = [
  {
    title: "긴 원문 또는 연재물 입력",
    desc: "단편, 회차형 연재, 여러 문단의 본문을 그대로 넣고 초안을 만든다.",
    icon: FileText,
  },
  {
    title: "회차·장면·호감도 에셋 배치",
    desc: "미리 준비한 이미지, 영상, 애니메이션, 음성을 단계별로 연결한다.",
    icon: Layers3,
  },
  {
    title: "편집 미리보기에서 검수",
    desc: "독자 화면을 보며 문장, 잠금, 가격, 공개 범위를 점검한다.",
    icon: Sparkles,
  },
];

function StudioHub() {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">
          Content Studio
        </span>
        <div className="max-w-3xl">
          <h1 className="font-display text-3xl font-semibold">콘텐츠 스튜디오</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            이 화면은 제작 흐름의 시작점이다. 긴 텍스트 원문을 넣고, 단편과 회차형 콘텐츠를
            나눈 뒤, 미리보기 편집 화면에서 에셋을 배치하는 작업으로 이어진다.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="rounded-2xl border border-border bg-card p-4">
              <Icon className="h-5 w-5 text-primary" />
              <h2 className="mt-3 text-sm font-semibold">{step.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{step.desc}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">추천 작업 순서</h2>
          <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>1. 스토리관리에서 새 원문과 유형을 등록한다.</li>
            <li>2. 검색, 분류, 상태를 정리한다.</li>
            <li>3. 편집 미리보기에서 장면별 에셋을 붙이고 검수한다.</li>
            <li>4. 공개 여부와 메인 노출을 조정한 뒤 게시한다.</li>
          </ol>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center gap-2 text-primary">
            <WandSparkles className="h-4 w-4" />
            <h2 className="text-sm font-semibold">바로 시작</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            새 콘텐츠를 만들거나, 기존 목록으로 이동해 운영 작업을 이어갈 수 있다.
          </p>
          <div className="mt-4 space-y-2">
            <Link
              to="/admin/stories"
              className="inline-flex w-full items-center justify-between rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              스토리관리 열기 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
