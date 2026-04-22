"use client";

import { useEffect, useState, useCallback } from "react";

interface Props {
  gameId: string;
}

type State = "idle" | "starting" | "live" | "stopping" | "error";

export function StreamControlButton({ gameId }: Props) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/stream/status?gameId=${encodeURIComponent(gameId)}`);
      if (!r.ok) return;
      const { live } = (await r.json()) as { live: boolean };
      setState((prev) => {
        if (prev === "starting" || prev === "stopping") return prev;
        return live ? "live" : "idle";
      });
    } catch {
      // transient network issues shouldn't flip the UI
    }
  }, [gameId]);

  useEffect(() => {
    void poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [poll]);

  async function goLive() {
    setError(null);
    setState("starting");
    const r = await fetch("/api/stream/go-live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId }),
    });
    if (r.ok) {
      setState("live");
    } else {
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Failed to start stream");
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  async function stop() {
    setError(null);
    setState("stopping");
    const r = await fetch("/api/stream/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId }),
    });
    if (r.ok) {
      setState("idle");
    } else {
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Failed to stop stream");
      setState("error");
      setTimeout(() => void poll(), 2000);
    }
  }

  const busy = state === "starting" || state === "stopping";
  const label =
    state === "starting" ? "STARTING…" :
    state === "stopping" ? "STOPPING…" :
    state === "live" ? "STOP STREAM" :
    state === "error" ? "ERROR" :
    "GO LIVE";

  const onClick = state === "live" ? stop : goLive;

  const cls =
    state === "live"
      ? "border-red-600 text-red-400 hover:border-red-500 hover:text-red-300"
      : state === "error"
      ? "border-red-700 text-red-500"
      : "border-zinc-700 text-zinc-300 hover:border-emerald-500 hover:text-emerald-400";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title={error ?? undefined}
        className={`rounded-lg border px-3 py-1 text-xs font-semibold tracking-wider transition-colors disabled:opacity-50 ${cls}`}
      >
        {label}
      </button>
    </div>
  );
}
