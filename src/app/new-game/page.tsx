"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type GameMode } from "@/lib/game/types";

const MODES: { value: GameMode; label: string; desc: string }[] = [
  { value: "501", label: "501", desc: "Single-In Double-Out" },
  { value: "301", label: "301", desc: "Double-In Double-Out" },
  { value: "cricket", label: "Cricket", desc: "Close 15-20 & Bull" },
];

export default function NewGamePage() {
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<GameMode>("501");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createGame() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: selectedMode }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }

    router.push(`/game/${data.id}`);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-bold">New Game</h1>
        <p className="mt-1 text-zinc-400">Choose a game mode</p>

        <div className="mt-8 space-y-3">
          {MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => setSelectedMode(mode.value)}
              className={`w-full rounded-xl p-4 text-left transition-colors ${
                selectedMode === mode.value
                  ? "bg-emerald-900/30 ring-2 ring-emerald-500"
                  : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              <div className="text-xl font-bold">{mode.label}</div>
              <div className="text-sm text-zinc-400">{mode.desc}</div>
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          onClick={createGame}
          disabled={loading}
          className="mt-8 w-full rounded-xl bg-emerald-600 py-4 text-lg font-bold transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Start Game"}
        </button>

        <button
          onClick={() => router.push("/")}
          className="mt-3 w-full rounded-xl border border-zinc-700 py-3 text-sm text-zinc-400 transition-colors hover:border-zinc-500"
        >
          Back
        </button>
      </div>
    </div>
  );
}
