"use client";

import { useState } from "react";
import { type CricketDart, CRICKET_NUMBERS } from "@/lib/game/types";

interface CricketInputProps {
  onSubmit: (darts: CricketDart[]) => void;
  disabled?: boolean;
}

const NUMBER_LABELS: Record<number, string> = {
  15: "15",
  16: "16",
  17: "17",
  18: "18",
  19: "19",
  20: "20",
  25: "Bull",
};

export function CricketInput({ onSubmit, disabled }: CricketInputProps) {
  const [darts, setDarts] = useState<CricketDart[]>([]);
  const dartsThrown = darts.length;

  function addDart(number: number, marks: number) {
    if (dartsThrown >= 3) return;
    setDarts([...darts, { number, marks }]);
  }

  function addMiss() {
    if (dartsThrown >= 3) return;
    // A miss in cricket: 0 marks on any number
    setDarts([...darts, { number: 0, marks: 0 }]);
  }

  function removeLast() {
    setDarts(darts.slice(0, -1));
  }

  function handleSubmit() {
    if (darts.length === 0) return;
    onSubmit(darts);
    setDarts([]);
  }

  const totalMarks = darts.reduce((sum, d) => sum + d.marks, 0);

  return (
    <div className="space-y-4">
      {/* Current darts display */}
      <div className="flex items-center justify-between rounded-lg bg-zinc-800 p-3">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`flex h-12 w-16 items-center justify-center rounded-lg border-2 text-sm font-bold ${
                darts[i]
                  ? "border-emerald-500 bg-emerald-900/30 text-emerald-300"
                  : "border-zinc-600 text-zinc-500"
              }`}
            >
              {darts[i]
                ? darts[i].marks === 0
                  ? "MISS"
                  : `${NUMBER_LABELS[darts[i].number] ?? darts[i].number} x${darts[i].marks}`
                : `D${i + 1}`}
            </div>
          ))}
        </div>
        <div className="text-lg font-bold text-white">{totalMarks} marks</div>
      </div>

      {/* Cricket number buttons */}
      <div className="space-y-1.5">
        {CRICKET_NUMBERS.map((num) => (
          <div key={num} className="flex gap-1.5">
            <div className="flex w-14 items-center justify-center text-lg font-bold text-white">
              {NUMBER_LABELS[num]}
            </div>
            {[1, 2, 3].map((marks) => (
              <button
                key={marks}
                onClick={() => addDart(num, marks)}
                disabled={disabled || dartsThrown >= 3}
                className="flex h-12 flex-1 items-center justify-center rounded-lg bg-zinc-800 font-semibold text-white transition-colors hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-40"
              >
                {"/ ".repeat(Math.min(marks, 2)).trim()}
                {marks === 3 && "X"}
                {marks < 3 && marks > 0 && ""}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Miss button */}
      <button
        onClick={addMiss}
        disabled={disabled || dartsThrown >= 3}
        className="w-full rounded-lg bg-zinc-700 py-3 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-600 disabled:opacity-40"
      >
        Miss
      </button>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={removeLast}
          disabled={darts.length === 0}
          className="flex-1 rounded-lg border border-zinc-600 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 disabled:opacity-40"
        >
          Undo Last
        </button>
        <button
          onClick={handleSubmit}
          disabled={disabled || darts.length === 0}
          className="flex-1 rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
        >
          Submit Turn
        </button>
      </div>
    </div>
  );
}
