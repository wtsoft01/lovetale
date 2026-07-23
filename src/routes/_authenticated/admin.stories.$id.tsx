import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// 통합된 한 페이지 컴포저로 리다이렉트 — 별도 메타/블록/등급 화면은 더 이상 사용하지 않습니다.
export const Route = createFileRoute("/_authenticated/admin/stories/$id")({
  beforeLoad: ({ location, params }) => {
    if (location.pathname !== `/admin/stories/${params.id}`) return;
    throw redirect({
      to: "/admin/stories/$id/compose",
      params: { id: params.id },
      replace: true,
    });
  },
  component: Outlet,
});
