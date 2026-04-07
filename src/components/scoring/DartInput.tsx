"use client";

import { useState } from "react";
import { type Dart, dartScore } from "@/lib/game/types";

interface DartInputProps {
  onSubmit: (darts: Dart[]) => void;
  requireDoubleIn?: boolean;
  hasDoubledIn?: boolean;
  disabled?: boolean;
}

const SEGMENTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const MULTIPLIER_LABELS = { 1: "S", 2: "D", 3: "T" } as const;

export function DartInput({
  onSubmit,
  requireDoubleIn,
  hasDoubledIn,
  disabled,
}: DartInputProps) {
  const [darts, setDarts] = useState<Dart[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);

  function addDart(segment: number, multiplier: 1 | 2 | 3) {
    if (darts.length >= 3) return;

    // Bull: segment 25 = outer bull (single), segment 25 with multiplier 2 = bullseye (double)
    const dart: Dart = { segment, multiplier };
    const newDarts = [...darts, dart];
    setDarts(newDarts);
    setSelectedSegment(null);
  }

  function removeLast() {
    setDarts(darts.slice(0, -1));
  }

  function handleMiss() {
    if (darts.length >= 3) return;
    setDarts([...darts, { segment: 0, multiplier: 1 }]);
    setSelectedSegment(null);
  }

  function handleSubmit() {
    if (darts.length === 0) return;
    onSubmit(darts);
    setDarts([]);
    setSelectedSegment(null);
  }

  const total = darts.reduce((sum, d) => sum + dartScore(d), 0);

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
                ? darts[i].segment === 0
                  ? "MISS"
                  : `${MULTIPLIER_LABELS[darts[i].multiplier]}${darts[i].segment}`
                : `D${i + 1}`}
            </div>
          ))}
        </div>
        <div className="text-2xl font-bold text-white">{total}</div>
      </div>

      {/* Warning for double-in */}
      {requireDoubleIn && !hasDoubledIn && darts.length === 0 && (
        <p className="text-center text-sm text-amber-400">
          Must hit a double to start scoring (301 DIDO)
        </p>
      )}

      {/* Segment selector or multiplier selector */}
      {selectedSegment === null ? (
        <div className="space-y-2">
          {/* Number grid */}
          <div className="grid grid-cols-5 gap-1.5">
            {SEGMENTS.map((seg) => (
              <button
                key={seg}
                onClick={() => setSelectedSegment(seg)}
                disabled={disabled || darts.length >= 3}
                className="flex h-12 items-center justify-center rounded-lg bg-zinc-800 text-lg font-semibold text-white transition-colors hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-40"
              >
                {seg}
              </button>
            ))}
          </div>

          {/* Bull and Miss row */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => addDart(25, 1)}
              disabled={disabled || darts.length >= 3}
              className="flex h-12 items-center justify-center rounded-lg bg-green-900 text-sm font-semibold text-green-200 transition-colors hover:bg-green-800 active:bg-green-700 disabled:opacity-40"
            >
              Bull 25
            </button>
            <button
              onClick={() => addDart(25, 2)}
              disabled={disabled || darts.length >= 3}
              className="flex h-12 items-center justify-center rounded-lg bg-red-900 text-sm font-semibold text-red-200 transition-colors hover:bg-red-800 active:bg-red-700 disabled:opacity-40"
            >
              Bullseye 50
            </button>
            <button
              onClick={handleMiss}
              disabled={disabled || darts.length >= 3}
              className="flex h-12 items-center justify-center rounded-lg bg-zinc-700 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-600 active:bg-zinc-500 disabled:opacity-40"
            >
              Miss
            </button>
          </div>
        </div>
      ) : (
        /* Multiplier selector */
        <div className="space-y-2">
          <p className="text-center text-sm text-zinc-400">
            Select multiplier for <span className="font-bold text-white">{selectedSegment}</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                addDart(selectedSegment, 1);
              }}
              className="flex h-14 flex-col items-center justify-center rounded-lg bg-zinc-700 font-semibold text-white transition-colors hover:bg-zinc-600"
            >
              <span className="text-lg">S{selectedSegment}</span>
              <span className="text-xs text-zinc-400">{selectedSegment}</span>
            </button>
            <button
              onClick={() => {
                addDart(selectedSegment, 2);
              }}
              className="flex h-14 flex-col items-center justify-center rounded-lg bg-emerald-800 font-semibold text-emerald-200 transition-colors hover:bg-emerald-700"
            >
              <span className="text-lg">D{selectedSegment}</span>
              <span className="text-xs text-emerald-400">{selectedSegment * 2}</span>
            </button>
            {selectedSegment <= 20 && (
              <button
                onClick={() => {
                  addDart(selectedSegment, 3);
                }}
                className="flex h-14 flex-col items-center justify-center rounded-lg bg-red-800 font-semibold text-red-200 transition-colors hover:bg-red-700"
              >
                <span className="text-lg">T{selectedSegment}</span>
                <span className="text-xs text-red-400">{selectedSegment * 3}</span>
              </button>
            )}
          </div>
          <button
            onClick={() => setSelectedSegment(null)}
            className="w-full rounded-lg bg-zinc-800 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-700"
          >
            Back
          </button>
        </div>
      )}

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
          Submit Turn ({total})
        </button>
      </div>
    </div>
  );
}
