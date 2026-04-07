"use client";

import { type Dart, dartScore } from "@/lib/game/types";

interface TurnSummaryProps {
  darts: Dart[];
  bust: boolean;
  checkout: boolean;
}

export function TurnSummary({ darts, bust, checkout }: TurnSummaryProps) {
  const total = darts.reduce((sum, d) => sum + dartScore(d), 0);
  const MULT = { 1: "S", 2: "D", 3: "T" } as const;

  return (
    <div
      className={`rounded-lg p-3 ${
        checkout
          ? "bg-emerald-900/50 border border-emerald-500"
          : bust
            ? "bg-red-900/50 border border-red-500"
            : "bg-zinc-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {darts.map((d, i) => (
            <span key={i} className="text-sm font-medium text-zinc-300">
              {d.segment === 0 ? "Miss" : `${MULT[d.multiplier]}${d.segment}`}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white">
            {bust ? 0 : total}
          </span>
          {bust && (
            <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
              BUST
            </span>
          )}
          {checkout && (
            <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
              CHECKOUT
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
