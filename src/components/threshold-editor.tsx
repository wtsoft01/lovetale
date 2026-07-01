import { useState } from "react";
import { Settings2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StoryBeat, StoryChoice } from "@/lib/mock/story";

type Props = {
  storyId: string;
  beats: Record<string, StoryBeat>;
  getThreshold: (beatId: string, idx: number, fallback?: number) => number;
  setThreshold: (beatId: string, idx: number, value: number) => void;
  resetAll: () => void;
};

// Floating gear button + side panel. Lets the creator tweak per-choice
// `requireAffection` thresholds for every beat. Persisted via the
// useChoiceThresholds hook (localStorage).
export function ThresholdEditor({
  beats,
  getThreshold,
  setThreshold,
  resetAll,
}: Props) {
  const [open, setOpen] = useState(false);
  const beatList = Object.values(beats).filter((b) => (b.choices ?? []).length > 0);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="해금 조건 편집"
        className="grid h-8 w-8 place-items-center rounded-full border border-border bg-background/70 backdrop-blur-md transition hover:border-primary/40"
      >
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex">
          <div
            className="flex-1 bg-background/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-elevated">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-primary">
                  Creator Tools
                </div>
                <h3 className="font-display text-lg">숨은 선택지 해금 조건</h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <p className="border-b border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
              각 장면의 선택지마다 필요한 호감도를 조정해 숨겨진 분기를 만드세요.
              0이면 항상 표시됩니다.
            </p>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {beatList.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-border bg-card/60 p-3"
                >
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
                      {b.id}
                    </span>
                    <span className="line-clamp-1 text-[11px] text-muted-foreground">
                      {b.text}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(b.choices ?? []).map((c: StoryChoice, i) => {
                      const val = getThreshold(b.id, i, c.requireAffection ?? 0);
                      return (
                        <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-2">
                          <div className="mb-1.5 text-[12px]">{c.label}</div>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={val}
                              onChange={(e) =>
                                setThreshold(b.id, i, Number(e.target.value))
                              }
                              className="h-1 flex-1 accent-primary"
                            />
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={val}
                              onChange={(e) =>
                                setThreshold(
                                  b.id,
                                  i,
                                  Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                                )
                              }
                              className="w-14 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs tabular-nums"
                            />
                            <span className="text-[10px] text-muted-foreground">♥ 필요</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <footer className="flex items-center justify-between border-t border-border px-4 py-3">
              <Button variant="ghost" size="sm" onClick={resetAll}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> 기본값
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                닫기
              </Button>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
