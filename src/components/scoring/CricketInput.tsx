"use client";

import { useState } from "react";
import {
  type CricketDart,
  type CricketPlayerState,
  CRICKET_NUMBERS,
} from "@/lib/game/types";

interface CricketInputProps {
  onSubmit: (darts: CricketDart[]) => void;
  disabled?: boolean;
  playerState?: CricketPlayerState;
  opponentState?: CricketPlayerState;
}

const MISS_DART: CricketDart = { number: 0, marks: 0 };

function MarkGlyph({ marks }: { marks: number }) {
  if (marks <= 0) return <span className="text-zinc-700">&nbsp;</span>;
  if (marks === 1)
    return <span className="text-2xl font-semibold text-white">/</span>;
  if (marks === 2)
    return <span className="text-2xl font-semibold text-white">✕</span>;
  // 3+ = closed: X inside a circle
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center">
      <span className="absolute inset-0 rounded-full border-2 border-emerald-400" />
      <span className="relative text-lg font-bold text-emerald-400">✕</span>
    </span>
  );
}

function DartPill({ dart }: { dart: CricketDart | undefined }) {
  if (!dart) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 text-xs text-zinc-600">
        —
      </span>
    );
  }
  if (dart.marks === 0) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-600 text-xs text-zinc-400">
        miss
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-500 bg-emerald-900/30">
      <MarkGlyph marks={dart.marks} />
    </span>
  );
}

function Dots({ count }: { count: number }) {
  return (
    <div className="mt-0.5 flex items-center justify-center gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-zinc-400"
        />
      ))}
    </div>
  );
}

export function CricketInput({
  onSubmit,
  disabled,
  playerState,
  opponentState,
}: CricketInputProps) {
  const [darts, setDarts] = useState<CricketDart[]>([]);
  const dartsThrown = darts.length;

  function addDart(number: number, marks: number) {
    if (dartsThrown >= 3) return;
    setDarts((d) => [...d, { number, marks }]);
  }

  function removeLast() {
    setDarts((d) => d.slice(0, -1));
  }

  function handleSubmit() {
    // Pad with misses so the server always records a complete 3-dart turn.
    const padded: CricketDart[] = [...darts];
    while (padded.length < 3) padded.push({ ...MISS_DART });
    onSubmit(padded);
    setDarts([]);
  }

  return (
    <div className="space-y-3">
      {/* Dart pills + back + submit on one row */}
      <div className="flex items-center gap-3 rounded-full bg-zinc-800/60 px-3 py-2">
        <div className="flex flex-1 items-center gap-2">
          {[0, 1, 2].map((i) => (
            <DartPill key={i} dart={darts[i]} />
          ))}
        </div>
        <button
          onClick={removeLast}
          disabled={disabled || dartsThrown === 0}
          aria-label="Undo last dart"
          className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-30"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 14l-4-4m0 0l4-4m-4 4h11a4 4 0 010 8h-1"
            />
          </svg>
        </button>
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-400 disabled:opacity-40"
        >
          Submit
        </button>
      </div>

      {/* Grid: [P1 marks | S | D | T | P2 marks] per number. Bull row has only S and D. */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        {CRICKET_NUMBERS.map((num) => {
          const isBull = num === 25;
          const playerMarks = playerState?.numbers[num]?.marks ?? 0;
          const opponentMarks = opponentState?.numbers[num]?.marks ?? 0;
          const label = isBull ? "Bull" : String(num);
          const multipliers = isBull ? [1, 2] : [1, 2, 3];

          return (
            <div
              key={num}
              className="grid grid-cols-5 items-stretch border-b border-zinc-800/80 last:border-b-0"
            >
              <div className="flex items-center justify-center border-r border-zinc-800/80 py-3">
                <MarkGlyph marks={playerMarks} />
              </div>

              {[1, 2, 3].map((mult) => {
                const available = multipliers.includes(mult);
                if (!available) {
                  return (
                    <div
                      key={mult}
                      className="border-r border-zinc-800/80 bg-zinc-950"
                    />
                  );
                }
                return (
                  <button
                    key={mult}
                    onClick={() => addDart(num, mult)}
                    disabled={disabled || dartsThrown >= 3}
                    className="flex flex-col items-center justify-center border-r border-zinc-800/80 py-3 text-center transition-colors hover:bg-zinc-900 active:bg-zinc-800 disabled:opacity-40"
                  >
                    <span className="text-lg font-semibold text-white">
                      {label}
                    </span>
                    <Dots count={mult} />
                  </button>
                );
              })}

              <div className="flex items-center justify-center py-3">
                <MarkGlyph marks={opponentMarks} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
