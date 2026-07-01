import { Heart, Lock, Flame, MessagesSquare } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  HEAT_TIERS,
  nextTier,
  tierFor,
  tierProgress,
  type HeatTier,
} from "@/lib/heat-tier";

type Props = {
  affection: number;
  onOpenChat?: () => void;
  compact?: boolean;
};

// Visible "heat ladder" — shows current tier, progress within it,
// and a teaser for what unlocks at the next tier. The teaser is the
// gameification hook: users chat more to climb tiers and unlock
// hotter visuals/scenes.
export function AffectionMeter({ affection, onOpenChat, compact }: Props) {
  const cur = tierFor(affection);
  const nxt = nextTier(affection);
  const pct = tierProgress(affection);
  const toNext = nxt ? Math.max(0, nxt.min - affection) : 0;

  return (
    <div
      className={`glass-panel rounded-2xl border border-border bg-card/60 backdrop-blur-md shadow-elevated ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-primary">
          <Heart className="h-3.5 w-3.5" /> 친밀도 {affection}/100
        </div>
        <div
          className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${cur.gradient} px-2.5 py-1 text-[11px] font-medium ring-1 ${cur.ring}`}
        >
          <span>{cur.badge}</span>
          <span className="text-foreground/90">{cur.label}</span>
        </div>
      </div>

      {/* Tier ladder */}
      <div className="mt-3 flex gap-1">
        {HEAT_TIERS.map((t: HeatTier) => {
          const reached = affection >= t.min;
          const active = t.key === cur.key;
          return (
            <div
              key={t.key}
              className={`relative h-2 flex-1 overflow-hidden rounded-full ${reached ? `bg-gradient-to-r ${t.gradient}` : "bg-muted/50"} ${active ? `ring-1 ${t.ring}` : ""}`}
              title={`${t.label} · ${t.min}+`}
            >
              {active && (
                <div
                  className="absolute inset-y-0 left-0 bg-foreground/30"
                  style={{ width: `${pct}%` }}
                />
              )}
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="mt-3 space-y-2 text-xs">
          <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
            <div className="flex items-center gap-1.5 text-primary">
              <Flame className="h-3 w-3" />
              <span className="font-medium">현재 해금</span>
            </div>
            <div className="mt-0.5 text-muted-foreground">{cur.preview}</div>
          </div>

          {nxt ? (
            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-2.5">
              <div className="flex items-center gap-1.5 text-primary/80">
                <Lock className="h-3 w-3" />
                <span className="font-medium">다음 단계 · {nxt.label}</span>
                <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-px text-[10px] tabular-nums text-primary">
                  +{toNext}♥
                </span>
              </div>
              <div className="mt-0.5 text-muted-foreground/90">
                🔒 {nxt.preview}
              </div>
              <div className="mt-1 text-[10px] text-primary/70">
                💡 {nxt.hint}
              </div>
              {onOpenChat && (
                <button
                  onClick={onOpenChat}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/20"
                >
                  <MessagesSquare className="h-3 w-3" />
                  대화로 친밀도 올리기
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] text-rose-300">
              💋 최고 단계 도달 — 숨겨진 엔딩이 열렸어요.
            </div>
          )}

          <Progress value={pct} className="h-1" />
        </div>
      )}
    </div>
  );
}
