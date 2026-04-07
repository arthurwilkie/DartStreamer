"use client";

import { useState } from "react";

interface DartInputProps {
  onSubmit: (score: number) => void;
  remainingScore: number;
  disabled?: boolean;
}

export function DartInput({
  onSubmit,
  remainingScore,
  disabled,
}: DartInputProps) {
  const [input, setInput] = useState("");

  const score = input === "" ? 0 : parseInt(input, 10);
  const isValid = input !== "" && score >= 0 && score <= 180;

  function handleDigit(digit: number) {
    const next = input + digit.toString();
    const val = parseInt(next, 10);
    // Don't allow values > 180 or leading zeros beyond "0" itself
    if (val > 180) return;
    if (input === "0") {
      // Replace "0" with the digit unless it's another 0
      if (digit === 0) return;
      setInput(digit.toString());
      return;
    }
    setInput(next);
  }

  function handleBackspace() {
    setInput(input.slice(0, -1));
  }

  function handleSubmit() {
    if (!isValid || disabled) return;
    onSubmit(score);
    setInput("");
  }

  return (
    <div className="space-y-3">
      {/* Score input display */}
      <div className="flex items-center gap-2 rounded-full bg-zinc-800 px-4 py-2">
        <svg
          className="h-5 w-5 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
        <span className={`flex-1 text-lg ${input ? "text-white" : "text-zinc-500"}`}>
          {input || "Enter a score"}
        </span>
        <button
          onClick={handleSubmit}
          disabled={!isValid || disabled}
          className="rounded-full bg-emerald-600 px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
        >
          Submit
        </button>
      </div>

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-zinc-800">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <button
            key={digit}
            onClick={() => handleDigit(digit)}
            disabled={disabled}
            className="flex h-16 items-center justify-center bg-zinc-900 text-2xl font-semibold text-white transition-colors hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-40"
          >
            {digit}
          </button>
        ))}
        {/* Bottom row: backspace, 0, empty */}
        <button
          onClick={handleBackspace}
          disabled={disabled || input.length === 0}
          className="flex h-16 items-center justify-center bg-zinc-900 text-zinc-400 transition-colors hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-40"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l7-7 11 0v14H10L3 12z" />
          </svg>
        </button>
        <button
          onClick={() => handleDigit(0)}
          disabled={disabled}
          className="flex h-16 items-center justify-center bg-zinc-900 text-2xl font-semibold text-white transition-colors hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-40"
        >
          0
        </button>
        <div className="bg-zinc-900" />
      </div>
    </div>
  );
}
