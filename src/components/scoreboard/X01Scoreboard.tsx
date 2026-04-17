"use client";

import { type X01GameState } from "@/lib/game/types";
import { getCheckoutSuggestion } from "@/lib/game/rules/x01";

interface X01ScoreboardProps {
  state: X01GameState;
  playerNames: Record<string, string>;
  currentUserId: string;
}

export function X01Scoreboard({ state, playerNames, currentUserId }: X01ScoreboardProps) {
  const players = Object.keys(state.scores);

  // Three-dart average is computed across the whole match; darts thrown counts
  // completed turns plus the in-progress leg (dartsThrown resets per leg).
  function getPlayerStats(playerId: string) {
    const playerTurns = state.turns.filter((t) => t.playerId === playerId);
    let matchDarts = 0;
    let matchScore = 0;
    for (const t of playerTurns) {
      const details = t.dartsDetail as unknown[];
      const darts =
        t.dartsForCheckout ?? (details && details.length > 0 ? details.length : 3);
      matchDarts += darts;
      matchScore += t.scoreEntered;
    }
    const threeDartAvg = matchDarts > 0 ? (matchScore / matchDarts) * 3 : 0;
    const lastScore =
      playerTurns.length > 0 ? playerTurns[playerTurns.length - 1].scoreEntered : null;
    return { threeDartAvg, lastScore, dartsThrown: matchDarts };
  }

  const inLabel =
    state.inMode === "double"
      ? "DI"
      : state.inMode === "master"
      ? "MI"
      : "SI";
  const outLabel =
    state.outMode === "double"
      ? "DO"
      : state.outMode === "master"
      ? "MO"
      : "SO";

  const matchLabel =
    state.matchFormat === "sets"
      ? `Best of ${state.target} sets`
      : `Best of ${state.target} legs`;

  return (
    <div className="rounded-xl bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          {state.mode} {inLabel}
          {outLabel}
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
          const remaining = state.scores[playerId];
          const checkout = getCheckoutSuggestion(remaining);
          const stats = getPlayerStats(playerId);

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
                    Sets <span className="font-bold text-white">{state.setsWon[playerId] ?? 0}</span>
                  </span>
                )}
                <span>
                  Legs <span className="font-bold text-white">{state.legsWon[playerId] ?? 0}</span>
                </span>
              </div>
              <div className="mt-1 text-4xl font-bold text-white">
                {remaining}
              </div>
              {state.inMode !== "straight" && !state.hasDoubledIn[playerId] && (
                <span className="text-xs text-amber-400">
                  Needs {state.inMode === "double" ? "double" : "double/triple"}-in
                </span>
              )}
              {checkout && remaining <= 170 && (
                <span className="mt-1 block text-xs text-zinc-500">
                  {checkout}
                </span>
              )}
              {/* Live stats */}
              <div className="mt-2 space-y-0.5 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>3-dart avg.</span>
                  <span className="font-medium text-zinc-300">
                    {stats.threeDartAvg.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Last score</span>
                  <span className="font-medium text-zinc-300">
                    {stats.lastScore !== null ? stats.lastScore : "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Darts thrown</span>
                  <span className="font-medium text-zinc-300">
                    {stats.dartsThrown}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent turns */}
      {state.turns.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Recent
          </h3>
          <div className="space-y-1">
            {state.turns.slice(-6).map((turn, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded bg-zinc-800/50 px-3 py-1.5 text-sm"
              >
                <span className="text-zinc-400">
                  {playerNames[turn.playerId] ?? "Player"} R{turn.roundNumber}
                </span>
                <span className="font-medium text-white">
                  {turn.scoreEntered}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
