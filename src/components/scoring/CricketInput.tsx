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
  /** Marks already committed by the player on the left side of the scoreboard. */
  leftPlayerState?: CricketPlayerState;
  /** Marks already committed by the player on the right side of the scoreboard. */
  rightPlayerState?: CricketPlayerState;
  /** Which side is currently throwing — drives where pending marks render. */
  activeSide?: "left" | "right";
}

const MISS_DART: CricketDart = { number: 0, marks: 0 };

/**
 * Render the mark glyph for a given mark count. Values beyond 3 are rendered
 * as a closed "⊗" with a numeric subscript showing the extra point-scoring
 * marks (e.g. ⊗₁ = closed + 1 scoring mark).
 */
function MarkGlyph({
  marks,
  side = "left",
  dim = false,
}: {
  marks: number;
  side?: "left" | "right";
  dim?: boolean;
}) {
  const tone = dim ? "text-zinc-600" : "text-white";
  const closedTone = dim ? "border-zinc-600 text-zinc-500" : "border-emerald-400 text-emerald-400";

  if (marks <= 0) return <span className={tone}>&nbsp;</span>;
  if (marks === 1) return <span className={`text-2xl font-semibold ${tone}`}>/</span>;
  if (marks === 2) return <span className={`text-2xl font-semibold ${tone}`}>✕</span>;

  const extras = marks - 3;
  const subscript =
    extras > 0 ? (
      <span
        className={`text-xs font-semibold ${dim ? "text-zinc-500" : "text-emerald-300"}`}
      >
        {extras}
      </span>
    ) : null;

  const glyph = (
    <span className="relative inline-flex h-7 w-7 items-center justify-center">
      <span className={`absolute inset-0 rounded-full border-2 ${closedTone}`} />
      <span className={`relative text-lg font-bold ${dim ? "text-zinc-500" : "text-emerald-400"}`}>
        ✕
      </span>
    </span>
  );

  if (!subscript) return glyph;
  return (
    <span className="inline-flex items-end gap-0.5">
      {side === "right" ? subscript : null}
      {glyph}
      {side === "left" ? subscript : null}
    </span>
  );
}

function dartLabel(dart: CricketDart): string | null {
  if (dart.marks <= 0 || dart.number === 0) return null;
  const prefix = dart.marks === 1 ? "S" : dart.marks === 2 ? "D" : "T";
  if (dart.number === 25) return `${prefix}B`;
  return `${prefix}${dart.number}`;
}

function DartPill({ dart }: { dart: CricketDart | undefined }) {
  if (!dart) {
    return (
      <span className="flex h-9 min-w-[3rem] items-center justify-center rounded-full border border-zinc-700 px-3 text-xs text-zinc-600">
        —
      </span>
    );
  }
  const label = dartLabel(dart);
  if (!label) {
    return (
      <span className="flex h-9 min-w-[3rem] items-center justify-center rounded-full border border-zinc-700 px-3 text-xs text-zinc-600">
        —
      </span>
    );
  }
  return (
    <span className="flex h-9 min-w-[3rem] items-center justify-center rounded-full border border-emerald-500 bg-emerald-900/30 px-3 text-sm font-semibold text-emerald-200">
      {label}
    </span>
  );
}

function Dots({ count }: { count: number }) {
  return (
    <div className="mt-1 flex items-center justify-center gap-1">
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
  leftPlayerState,
  rightPlayerState,
  activeSide = "left",
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
    const padded: CricketDart[] = [...darts];
    while (padded.length < 3) padded.push({ ...MISS_DART });
    onSubmit(padded);
    setDarts([]);
  }

  // Accumulate pending marks by number so the active side's grid shows live
  // feedback before the turn is committed.
  const pendingByNumber = darts.reduce<Record<number, number>>((acc, d) => {
    if (d.marks <= 0 || d.number === 0) return acc;
    acc[d.number] = (acc[d.number] ?? 0) + d.marks;
    return acc;
  }, {});

  function marksForSide(side: "left" | "right", num: number): number {
    const base =
      side === "left"
        ? leftPlayerState?.numbers[num]?.marks ?? 0
        : rightPlayerState?.numbers[num]?.marks ?? 0;
    if (side === activeSide) return base + (pendingByNumber[num] ?? 0);
    return base;
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

      {/* Grid: [left marks | S | D | T | right marks] per number. Bull row
          centers its 2 tap targets across the middle span. */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        {CRICKET_NUMBERS.map((num) => {
          const leftMarks = marksForSide("left", num);
          const rightMarks = marksForSide("right", num);
          const leftCommitted = leftPlayerState?.numbers[num]?.marks ?? 0;
          const rightCommitted = rightPlayerState?.numbers[num]?.marks ?? 0;
          const bothClosed = leftCommitted >= 3 && rightCommitted >= 3;
          const isBull = num === 25;
          const label = isBull ? "Bull" : String(num);

          const dartButtonClass = `flex flex-col items-center justify-center py-3 text-center transition-colors disabled:opacity-40 ${
            bothClosed
              ? "cursor-not-allowed"
              : "hover:bg-zinc-900 active:bg-zinc-800"
          }`;

          return (
            <div
              key={num}
              className={`grid grid-cols-5 items-stretch border-b border-zinc-800/80 last:border-b-0 ${
                bothClosed ? "bg-zinc-900/60 line-through" : ""
              }`}
            >
              <div className="flex items-center justify-center border-r border-zinc-800/80 py-3">
                <MarkGlyph marks={leftMarks} side="left" dim={bothClosed} />
              </div>

              {isBull ? (
                <div className="col-span-3 grid grid-cols-2 border-r border-zinc-800/80">
                  {([1, 2] as const).map((mult) => (
                    <button
                      key={mult}
                      onClick={() => addDart(num, mult)}
                      disabled={disabled || dartsThrown >= 3 || bothClosed}
                      className={dartButtonClass}
                    >
                      <span
                        className={`text-lg font-semibold ${
                          bothClosed ? "text-zinc-600" : "text-white"
                        }`}
                      >
                        {label}
                      </span>
                      <Dots count={mult} />
                    </button>
                  ))}
                </div>
              ) : (
                ([1, 2, 3] as const).map((mult) => (
                  <button
                    key={mult}
                    onClick={() => addDart(num, mult)}
                    disabled={disabled || dartsThrown >= 3 || bothClosed}
                    className={`${dartButtonClass} border-r border-zinc-800/80`}
                  >
                    <span
                      className={`text-lg font-semibold ${
                        bothClosed ? "text-zinc-600" : "text-white"
                      }`}
                    >
                      {label}
                    </span>
                    <Dots count={mult} />
                  </button>
                ))
              )}

              <div className="flex items-center justify-center py-3">
                <MarkGlyph marks={rightMarks} side="right" dim={bothClosed} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
