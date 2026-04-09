"use client";

import { useState } from "react";

interface DartsAtDoublePopupProps {
  isOpen: boolean;
  options: number[];
  checkedOut: boolean;
  onConfirm: (dartsAtDouble: number, dartsForCheckout?: number) => void;
}

export function DartsAtDoublePopup({
  isOpen,
  options,
  checkedOut,
  onConfirm,
}: DartsAtDoublePopupProps) {
  const [selectedDouble, setSelectedDouble] = useState<number>(options[0] ?? 0);
  const [selectedCheckout, setSelectedCheckout] = useState<number>(1);

  if (!isOpen || options.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 pb-8">
      <div className="w-full max-w-sm rounded-2xl bg-zinc-800 p-6">
        <h3 className="text-center text-lg font-black uppercase tracking-wide text-white">
          Darts used on a double
        </h3>

        <div className="mt-5 flex justify-center gap-3">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => setSelectedDouble(opt)}
              className={`flex h-16 w-16 items-center justify-center rounded-xl text-2xl font-bold transition-colors ${
                selectedDouble === opt
                  ? "bg-orange-500 text-white"
                  : "bg-zinc-700 text-white hover:bg-zinc-600"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        {checkedOut && (
          <>
            <h3 className="mt-6 text-center text-lg font-black uppercase tracking-wide text-white">
              Darts used for checkout
            </h3>

            <div className="mt-5 flex justify-center gap-3">
              {[1, 2, 3].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setSelectedCheckout(opt)}
                  className={`flex h-16 w-16 items-center justify-center rounded-xl text-2xl font-bold transition-colors ${
                    selectedCheckout === opt
                      ? "bg-orange-500 text-white"
                      : "bg-zinc-700 text-white hover:bg-zinc-600"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          onClick={() => onConfirm(selectedDouble, checkedOut ? selectedCheckout : undefined)}
          className="mt-5 w-full rounded-xl bg-orange-500 py-4 text-center text-lg font-bold text-white transition-colors hover:bg-orange-400"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
