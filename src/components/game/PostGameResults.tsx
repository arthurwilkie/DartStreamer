"use client";

import { useMemo, useState } from "react";
import type { Turn, GameMode } from "@/lib/game/types";
import { calculateGameStatsForPlayer } from "@/lib/game/stats";
import { GameStatsDisplay } from "./GameStatsDisplay";
import { TurnHistory } from "./TurnHistory";

interface Props {
  turns: Turn[];
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
  winnerId: string | null;
  mode: GameMode;
  startScore: number;
}

export function PostGameResults({
  turns,
  player1Id,
  player2Id,
  player1Name,
  player2Name,
  winnerId,
  mode,
  startScore,
}: Props) {
  // Distinct legs, in order of appearance.
  const legNumbers = useMemo(() => {
    const seen = new Set<number>();
    const ordered: number[] = [];
    for (const t of turns) {
      const n = t.legNumber ?? 1;
      if (!seen.has(n)) {
        seen.add(n);
        ordered.push(n);
      }
    }
    return ordered.sort((a, b) => a - b);
  }, [turns]);

  // selected === null → Overall, otherwise leg number
  const [selected, setSelected] = useState<number | null>(null);

  const visibleTurns = useMemo(
    () => (selected === null ? turns : turns.filter((t) => (t.legNumber ?? 1) === selected)),
    [selected, turns]
  );

  // For a single leg, the winner is whoever played the last turn of that leg
  // (since the game engine keeps the leg-closer as currentPlayerId). For
  // overall it's the match winner.
  const scopedWinnerId = useMemo(() => {
    if (selected === null) return winnerId;
    if (visibleTurns.length === 0) return null;
    return visibleTurns[visibleTurns.length - 1].playerId;
  }, [selected, visibleTurns, winnerId]);

  const p1Stats = calculateGameStatsForPlayer(
    visibleTurns,
    player1Id,
    mode,
    scopedWinnerId === player1Id,
    startScore || 501
  );
  const p2Stats = calculateGameStatsForPlayer(
    visibleTurns,
    player2Id,
    mode,
    scopedWinnerId === player2Id,
    startScore || 501
  );

  const tabs: { key: string; label: string; value: number | null }[] = [
    { key: "overall", label: "Overall", value: null },
    ...legNumbers.map((n) => ({
      key: `leg-${n}`,
      label: `Leg ${n}`,
      value: n,
    })),
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto rounded-full bg-zinc-900 p-1">
          {tabs.map((t) => {
            const active =
              (t.value === null && selected === null) || t.value === selected;
            return (
              <button
                key={t.key}
                onClick={() => setSelected(t.value)}
                className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      <GameStatsDisplay
        player1={{
          name: player1Name,
          stats: p1Stats,
          isWinner: scopedWinnerId === player1Id,
        }}
        player2={{
          name: player2Name,
          stats: p2Stats,
          isWinner: scopedWinnerId === player2Id,
        }}
        mode={mode}
      />

      <TurnHistory
        turns={visibleTurns}
        player1Id={player1Id}
        player2Id={player2Id}
        player1Name={player1Name}
        player2Name={player2Name}
        mode={mode}
        startScore={startScore}
      />
    </div>
  );
}
