import { useCallback, useEffect, useState } from "react";

// Per-story, per-beat, per-choice-index requireAffection overrides.
// Persisted to localStorage so creators can tune unlock thresholds without
// editing source. Keyed by storyId + beatId + choice index.

type Overrides = Record<string, number>; // `${beatId}:${choiceIdx}` -> threshold

const keyFor = (storyId: string) => `lovetale:thresholds:${storyId}`;

export function useChoiceThresholds(storyId: string) {
  const [overrides, setOverrides] = useState<Overrides>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(storyId));
      setOverrides(raw ? JSON.parse(raw) : {});
    } catch {
      setOverrides({});
    }
  }, [storyId]);

  const get = useCallback(
    (beatId: string, idx: number, fallback?: number) =>
      overrides[`${beatId}:${idx}`] ?? fallback ?? 0,
    [overrides],
  );

  const set = useCallback(
    (beatId: string, idx: number, value: number) => {
      setOverrides((prev) => {
        const next = { ...prev, [`${beatId}:${idx}`]: value };
        try {
          localStorage.setItem(keyFor(storyId), JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storyId],
  );

  const reset = useCallback(() => {
    setOverrides({});
    try {
      localStorage.removeItem(keyFor(storyId));
    } catch {
      /* ignore */
    }
  }, [storyId]);

  return { get, set, reset };
}
