"use client";

import { type CricketGameState, CRICKET_NUMBERS } from "@/lib/game/types";

interface CricketScoreboardProps {
  state: CricketGameState;
  playerNames: Record<string, string>;
  currentUserId: string;
}

const NUMBER_LABELS: Record<number, string> = {
  15: "15", 16: "16", 17: "17", 18: "18", 19: "19", 20: "20", 25: "Bull",
};

function MarksDisplay({ marks }: { marks: number }) {
  if (marks === 0) return <span className="text-zinc-600">-</span>;
  if (marks === 1) return <span className="text-white">/</span>;
  if (marks === 2) return <span className="text-white">X</span>;
  return <span className="text-emerald-400 font-bold">X</span>; // closed (3+)
}

export function CricketScoreboard({
  state,
  playerNames,
  currentUserId,
}: CricketScoreboardProps) {
  const players = Object.keys(state.players);
  const [p1, p2] = players;

  return (
    <div className="rounded-xl bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Cricket
        </h2>
        <span className="text-sm text-zinc-500">Round {state.currentRound}</span>
      </div>

      {/* Player headers with points */}
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] gap-2">
        <div
          className={`rounded-lg p-3 text-center ${
            state.currentPlayerId === p1
              ? "bg-emerald-900/30 ring-2 ring-emerald-500"
              : "bg-zinc-800"
          }`}
        >
          <div className="text-xs text-zinc-400">
            {playerNames[p1] ?? "P1"}
            {p1 === currentUserId && " (You)"}
          </div>
          <div className="mt-1 text-2xl font-bold text-white">
            {state.players[p1].points}
          </div>
        </div>
        <div className="flex items-center text-xs text-zinc-600">PTS</div>
        <div
          className={`rounded-lg p-3 text-center ${
            state.currentPlayerId === p2
              ? "bg-emerald-900/30 ring-2 ring-emerald-500"
              : "bg-zinc-800"
          }`}
        >
          <div className="text-xs text-zinc-400">
            {playerNames[p2] ?? "P2"}
            {p2 === currentUserId && " (You)"}
          </div>
          <div className="mt-1 text-2xl font-bold text-white">
            {state.players[p2].points}
          </div>
        </div>
      </div>

      {/* Marks grid */}
      <div className="space-y-1">
        {CRICKET_NUMBERS.map((num) => (
          <div
            key={num}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded bg-zinc-800/50 px-3 py-2"
          >
            <div className="text-center text-lg">
              <MarksDisplay marks={state.players[p1].numbers[num]?.marks ?? 0} />
            </div>
            <div className="w-12 text-center text-sm font-bold text-zinc-300">
              {NUMBER_LABELS[num]}
            </div>
            <div className="text-center text-lg">
              <MarksDisplay marks={state.players[p2].numbers[num]?.marks ?? 0} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
