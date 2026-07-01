import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export function StudioStub({
  title,
  phase,
  description,
  bullets,
  primaryCta,
}: {
  title: string;
  phase: string;
  description: string;
  bullets: string[];
  primaryCta?: { to: string; label: string };
}) {
  return (
    <div>
      <header className="mb-6">
        <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">
          {phase}
        </span>
        <h1 className="mt-1 font-display text-3xl font-semibold">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {description}
        </p>
      </header>

      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8">
        <div className="mb-4 flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Roadmap
          </span>
        </div>
        <ul className="space-y-2 text-sm">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              <span className="text-muted-foreground">{b}</span>
            </li>
          ))}
        </ul>
        {primaryCta && (
          <Link
            to={primaryCta.to}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-foreground hover:bg-primary/20"
          >
            {primaryCta.label}
          </Link>
        )}
      </div>
    </div>
  );
}
