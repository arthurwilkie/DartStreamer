"use client";

import { type Dart, type CricketDart, type GameMode, dartScore } from "@/lib/game/types";

interface EditScoreProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmEdit: () => void;
  lastTurnDarts: Dart[] | CricketDart[] | null;
  lastTurnScore: number;
  mode: GameMode;
}

export function EditScore({
  isOpen,
  onClose,
  onConfirmEdit,
  lastTurnDarts,
  lastTurnScore,
  mode,
}: EditScoreProps) {
  if (!isOpen || !lastTurnDarts) return null;

  const isX01 = mode !== "cricket";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-xl bg-zinc-900 p-6">
        <h3 className="text-lg font-bold text-white">Edit Last Turn</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Your last turn scored {lastTurnScore}
        </p>

        <div className="mt-4 space-y-2">
          {(lastTurnDarts as (Dart | CricketDart)[]).map((dart, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg bg-zinc-800 px-4 py-2"
            >
              <span className="text-zinc-400">Dart {i + 1}</span>
              <span className="font-semibold text-white">
                {isX01
                  ? (() => {
                      const d = dart as Dart;
                      if (d.segment === 0) return "Miss";
                      const prefix = d.multiplier === 2 ? "D" : d.multiplier === 3 ? "T" : "S";
                      return `${prefix}${d.segment} (${dartScore(d)})`;
                    })()
                  : (() => {
                      const d = dart as CricketDart;
                      return d.marks === 0 ? "Miss" : `${d.number} x${d.marks}`;
                    })()}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-600 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500"
          >
            Cancel
          </button>
          <button
            onClick={onConfirmEdit}
            className="flex-1 rounded-lg bg-amber-600 py-3 text-sm font-bold text-white transition-colors hover:bg-amber-500"
          >
            Re-enter Turn
          </button>
        </div>
      </div>
    </div>
  );
}
