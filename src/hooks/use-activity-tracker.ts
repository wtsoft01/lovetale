import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

import { useAuth } from "@/hooks/use-auth";
import { getFreshAccessToken } from "@/lib/supabase-auth-fetch";

export function useActivityTracker() {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const startedAtRef = useRef(Date.now());
  const pathRef = useRef(pathname);

  useEffect(() => {
    if (pathRef.current === pathname) return;
    void flushActivity(pathRef.current, startedAtRef.current);
    pathRef.current = pathname;
    startedAtRef.current = Date.now();
  }, [pathname]);

  useEffect(() => {
    if (loading || !user) return;
    pathRef.current = pathname;
    startedAtRef.current = Date.now();
    void sendActivity(pathname, 0, "pageview");
  }, [loading, pathname, user?.id]);

  useEffect(() => {
    if (loading || !user) return;

    const interval = window.setInterval(() => {
      void flushActivity(pathRef.current, startedAtRef.current);
      startedAtRef.current = Date.now();
    }, 60_000);

    const onHide = () => {
      void flushActivity(pathRef.current, startedAtRef.current);
      startedAtRef.current = Date.now();
    };

    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      void flushActivity(pathRef.current, startedAtRef.current);
    };
  }, [loading, user?.id]);
}

async function flushActivity(path: string, startedAt: number) {
  if (typeof window === "undefined") return;
  const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  if (durationSeconds < 5) return;
  await sendActivity(path, durationSeconds, "heartbeat");
}

async function sendActivity(path: string, durationSeconds: number, eventType: "pageview" | "heartbeat") {
  try {
    const token = await getFreshAccessToken();
    await fetch("/api/activity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        eventType,
        path,
        title: document.title,
        durationSeconds,
      }),
      keepalive: true,
    });
  } catch {
    // Activity tracking must never interrupt user flows.
  }
}
