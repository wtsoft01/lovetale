import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/stories/$id/compose")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "append_episode" ? "append_episode" : undefined,
    chapterId: typeof search.chapterId === "string" ? search.chapterId : undefined,
    newChapter: search.newChapter === "1" ? "1" : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    const tab = search.chapterId || search.mode === "append_episode" || search.newChapter === "1" ? "chapter" : "info";
    throw redirect({
      to: "/admin/stories",
      search: {
        workspace: params.id,
        tab,
        ...(search.chapterId ? { chapter: search.chapterId } : {}),
      },
      replace: true,
    });
  },
});
