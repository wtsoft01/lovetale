import { Link } from "@tanstack/react-router";
import { MessageCircle, Star, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Character } from "@/lib/mock/characters";

export function CharacterCard({ character }: { character: Character }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-glow">
      <Link
        to="/character/$id"
        params={{ id: character.id }}
        className="block"
      >
        <div className="relative aspect-[4/5] overflow-hidden">
          <img
            src={character.portrait}
            alt={character.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
          {character.mature && (
            <Badge className="absolute right-3 top-3 border-0 bg-destructive/90 text-destructive-foreground">
              19+
            </Badge>
          )}
          <div className="absolute right-3 top-3 flex flex-col gap-1.5">
            {!character.mature && (
              <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-foreground backdrop-blur-md">
                All
              </span>
            )}
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-primary text-primary" />
              <span className="text-foreground">{character.rating}</span>
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              {character.chats.toLocaleString()}
            </span>
          </div>
        </div>
      </Link>

      <div className="space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-display text-lg font-semibold">
            {character.name}
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground">
            {character.age}세
          </span>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {character.intro}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {character.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            asChild
            size="sm"
            className="flex-1 bg-gradient-aurora text-primary-foreground shadow-glow hover:opacity-90"
          >
            <Link
              to="/play/$sessionId"
              params={{ sessionId: character.id }}
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              플레이
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-border bg-transparent hover:bg-surface-elevated"
          >
            <Link to="/character/$id" params={{ id: character.id }}>
              상세
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
