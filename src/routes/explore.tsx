import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { BookOpen, Coins, Loader2, Lock, Plus, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CoverImage } from "@/components/cover-image";
import { listMyUserStories } from "@/lib/story-builder.functions";
import { useAuth } from "@/hooks/use-auth";
import { listHomePlacements, type HomePlacementCard } from "@/lib/home-placements.functions";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore | Lovetale" },
      { name: "description", content: "Explore curated Lovetale stories and your own AI stories." },
    ],
  }),
  component: ExplorePage,
});

const HEAT_BADGE: Record<string, { label: string; className: string }> = {
  soft: { label: "Soft", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  warm: { label: "Warm", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  spicy: { label: "Spicy", className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  steamy: { label: "Steamy", className: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
};

function ExplorePage() {
  const { user } = useAuth();
  const list = useServerFn(listMyUserStories);
  const placementsFn = useServerFn(listHomePlacements);
  const { data: mine, isLoading: mineLoading } = useQuery({
    queryKey: ["my_user_stories"],
    queryFn: () => list(),
    enabled: !!user,
  });
  const curatedQ = useQuery({
    queryKey: ["home_placement", "trending", "explore"],
    queryFn: () => placementsFn({ data: { slot: "trending" } }),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 md:px-8">
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl font-semibold md:text-3xl">
              <Sparkles className="size-5 text-primary" /> My Stories
            </h2>
            <p className="text-sm text-muted-foreground">Stories created with the AI builder.</p>
          </div>
          <Button asChild size="sm">
            <Link to="/builder">
              <Plus className="mr-1 size-4" /> New Story
            </Link>
          </Button>
        </div>

        {!user ? (
          <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Sign in to see your stories.{" "}
              <Link to="/auth" className="text-primary underline">
                Login
              </Link>
            </p>
          </div>
        ) : mineLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (mine?.length ?? 0) === 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed border-border/60 p-6 text-center">
            <p className="text-sm text-muted-foreground">No stories yet.</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/builder">
                <Sparkles className="mr-1 size-4" /> Create first story
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine!.map((story) => (
              <li key={story.id}>
                <Link
                  to="/play/user/$id"
                  params={{ id: story.id }}
                  className="block rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur transition hover:border-primary/50"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Sparkles className="size-2.5" /> AI
                    </Badge>
                    {!story.is_listed && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Lock className="size-2.5" /> Private
                      </Badge>
                    )}
                  </div>
                  <h3 className="truncate font-semibold transition hover:text-primary">{story.title}</h3>
                  {story.logline && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{story.logline}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold md:text-3xl">Curated Stories</h2>
          <p className="text-sm text-muted-foreground">
            Stories assigned to the Hot Stories slot in admin.
          </p>
        </div>
        {curatedQ.isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (curatedQ.data?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            No curated stories are exposed yet.
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {curatedQ.data!.map((story) => (
              <li key={story.id}>
                <StoryCard story={story} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StoryCard({ story }: { story: HomePlacementCard }) {
  const heat = HEAT_BADGE[story.max_heat] ?? HEAT_BADGE.soft;
  return (
    <Link
      to="/play/user/$id"
      params={{ id: story.story_id }}
      className="group block overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur transition hover:border-primary/50"
    >
      {story.cover_url ? (
        <div className="aspect-[16/10] overflow-hidden bg-muted">
          <CoverImage src={story.cover_url} alt={story.title} className="size-full object-cover transition duration-500 group-hover:scale-105" />
        </div>
      ) : (
        <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-primary/20 via-card to-card/60">
          <BookOpen className="size-12 text-muted-foreground/50" />
        </div>
      )}
      <div className="space-y-1.5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`text-[9px] ${heat.className}`}>{heat.label}</Badge>
          {story.audience !== "all" && (
            <Badge variant="outline" className="text-[9px]">
              {story.audience === "female" ? "Female" : "Male"}
            </Badge>
          )}
        </div>
        <h3 className="font-semibold leading-tight transition group-hover:text-primary">{story.title}</h3>
        {story.logline && <p className="line-clamp-2 text-xs text-muted-foreground">{story.logline}</p>}
        <div className="flex items-center justify-between pt-1">
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users className="size-3" /> @{story.author_name}
          </span>
          {story.price_credits > 0 ? (
            <Badge className="gap-0.5 text-[10px]"><Coins className="size-3" /> {story.price_credits}</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">FREE</Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
