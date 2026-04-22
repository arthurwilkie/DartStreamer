"use client";

import { type CricketGameState } from "@/lib/game/types";

interface CricketScoreboardProps {
  state: CricketGameState;
  playerNames: Record<string, string>;
  currentUserId: string;
}

export function CricketScoreboard({
  state,
  playerNames,
  currentUserId,
}: CricketScoreboardProps) {
  const players = [state.player1Id, state.player2Id];

  const matchLabel =
    state.matchFormat === "sets"
      ? `Best of ${state.target} sets`
      : `Best of ${state.target} legs`;

  return (
    <div className="rounded-xl bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Cricket
        </h2>
        <span className="text-xs text-zinc-500">{matchLabel}</span>
      </div>
      <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
        <span>
          {state.matchFormat === "sets" ? `Set ${state.currentSet} · ` : ""}
          Leg {state.currentLeg}
        </span>
        <span>Round {state.currentRound}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {players.map((playerId) => {
          const isActive = playerId === state.currentPlayerId;
          const points = state.players[playerId]?.points ?? 0;

          return (
            <div
              key={playerId}
              className={`rounded-lg p-4 transition-colors ${
                isActive
                  ? "bg-emerald-900/30 ring-2 ring-emerald-500"
                  : "bg-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-400">
                  {playerNames[playerId] ?? "Player"}
                  {playerId === currentUserId && " (You)"}
                </span>
                {isActive && (
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                {state.matchFormat === "sets" && (
                  <span>
                    Sets{" "}
                    <span className="font-bold text-white">
                      {state.setsWon[playerId] ?? 0}
                    </span>
                  </span>
                )}
                <span>
                  Legs{" "}
                  <span className="font-bold text-white">
                    {state.legsWon[playerId] ?? 0}
                  </span>
                </span>
              </div>
              <div className="mt-1 text-4xl font-bold text-white">{points}</div>
              <div className="mt-1 text-xs text-zinc-500">points</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
