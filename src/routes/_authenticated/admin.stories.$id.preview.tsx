import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/stories/$id/preview")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/stories/$id/compose",
      params: { id: params.id },
      replace: true,
    });
  },
  component: () => null,
});
