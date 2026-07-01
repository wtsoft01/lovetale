import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, Sparkles, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCharacter } from "@/lib/mock/characters";

export const Route = createFileRoute("/character/$id")({
  loader: ({ params }) => {
    const character = getCharacter(params.id);
    if (!character) throw notFound();
    return { character };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.character.name ?? "캐릭터"} — Lovetale` },
      {
        name: "description",
        content: loaderData?.character.intro ?? "AI 캐릭터 상세 페이지.",
      },
      {
        property: "og:image",
        content: loaderData?.character.portrait ?? "",
      },
    ],
  }),
  notFoundComponent: () => (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="font-display text-3xl">캐릭터를 찾을 수 없어요</h1>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">
        홈으로
      </Link>
    </div>
  ),
  component: CharacterDetail,
});

function CharacterDetail() {
  const { character } = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> 돌아가기
      </Link>

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="relative overflow-hidden rounded-3xl border border-border shadow-elevated">
          <img
            src={character.portrait}
            alt={character.name}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
            {character.mature ? "Dark · 19+" : "All Audience"}
          </div>
          <h1 className="mt-2 font-display text-5xl font-semibold">
            {character.name}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
            <span>{character.age}세</span>
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
              {character.rating}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" />
              {character.chats.toLocaleString()}
            </span>
          </div>

          <p className="mt-6 text-base leading-relaxed text-foreground/90">
            {character.intro}
          </p>

          <div className="mt-6 rounded-2xl border border-border bg-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              현재 시나리오
            </div>
            <div className="mt-1 font-display text-xl">{character.scenario}</div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {character.tags.map((t: string) => (
              <span
                key={t}
                className="rounded-full border border-border bg-surface-elevated px-3 py-1 text-xs text-muted-foreground"
              >
                #{t}
              </span>
            ))}
          </div>

          <div className="mt-8 flex gap-3">
            <Button
              asChild
              size="lg"
              className="flex-1 bg-gradient-aurora text-primary-foreground shadow-glow hover:opacity-90"
            >
              <Link to="/play/$sessionId" params={{ sessionId: character.id }}>
                <Sparkles className="mr-2 h-4 w-4" />
                지금 플레이
              </Link>
            </Button>
            <Button size="lg" variant="outline">
              북마크
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
