"use client";

interface TurnIndicatorProps {
  currentPlayerName: string;
  isYourTurn: boolean;
  round: number;
}

export function TurnIndicator({ currentPlayerName, isYourTurn, round }: TurnIndicatorProps) {
  return (
    <div
      className={`rounded-lg px-4 py-3 text-center ${
        isYourTurn
          ? "bg-emerald-900/30 border border-emerald-500"
          : "bg-zinc-800 border border-zinc-700"
      }`}
    >
      <span className="text-sm text-zinc-400">Round {round} &middot; </span>
      <span className={`text-sm font-semibold ${isYourTurn ? "text-emerald-300" : "text-white"}`}>
        {isYourTurn ? "Your turn" : `${currentPlayerName}'s turn`}
      </span>
    </div>
  );
}
