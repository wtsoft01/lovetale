import { Link } from "@tanstack/react-router";
import { Flame, Star, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Story } from "@/lib/mock/stories";

export function StoryCard({ story }: { story: Story }) {
  return (
    <Link
      to="/play/$sessionId"
      params={{ sessionId: story.id }}
      className="group relative block overflow-hidden rounded-2xl border border-border bg-surface-elevated/60 transition hover:border-primary/60 hover:shadow-elevated"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        <img
          src={story.cover}
          alt={story.title}
          loading="lazy"
          width={1024}
          height={1024}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

        {story.mature && (
          <Badge className="absolute right-3 top-3 border-0 bg-rose-600/90 text-[10px] font-bold text-white">
            19+
          </Badge>
        )}
        <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-foreground backdrop-blur">
          {Array.from({ length: story.heat }).map((_, i) => (
            <Flame key={i} className="h-3 w-3 text-rose-500" />
          ))}
        </div>

        <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4">
          <div className="text-[11px] uppercase tracking-wider text-primary">
            {story.tagline}
          </div>
          <h3 className="font-display text-lg font-semibold leading-tight text-foreground">
            {story.title}
          </h3>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 text-amber-400" />
              {story.rating}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {story.plays.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {story.length}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
