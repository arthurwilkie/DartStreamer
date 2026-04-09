import { type GameStats } from "@/lib/game/stats";
import { type GameMode } from "@/lib/game/types";

interface PlayerStats {
  name: string;
  stats: GameStats;
  isWinner: boolean;
}

interface GameStatsDisplayProps {
  player1: PlayerStats;
  player2: PlayerStats;
  mode: GameMode;
}

function StatRow({
  label,
  value1,
  value2,
  highlight,
}: {
  label: string;
  value1: string;
  value2: string;
  highlight?: "left" | "right" | null;
}) {
  return (
    <div className="flex items-center border-b border-zinc-800 py-2 text-sm">
      <div
        className={`w-1/3 text-right pr-3 font-medium ${
          highlight === "left" ? "text-emerald-400" : "text-zinc-300"
        }`}
      >
        {value1}
      </div>
      <div className="w-1/3 text-center text-xs text-zinc-500">{label}</div>
      <div
        className={`w-1/3 pl-3 font-medium ${
          highlight === "right" ? "text-emerald-400" : "text-zinc-300"
        }`}
      >
        {value2}
      </div>
    </div>
  );
}

function highlightBetter(
  v1: number,
  v2: number,
  higherIsBetter: boolean
): "left" | "right" | null {
  if (v1 === v2) return null;
  if (higherIsBetter) return v1 > v2 ? "left" : "right";
  return v1 < v2 ? "left" : "right";
}

export function GameStatsDisplay({
  player1,
  player2,
  mode,
}: GameStatsDisplayProps) {
  const s1 = player1.stats;
  const s2 = player2.stats;
  const isCricket = mode === "cricket";

  return (
    <div className="rounded-xl bg-zinc-900 p-4">
      <h3 className="mb-3 text-center text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Match Statistics
      </h3>

      {/* Player names header */}
      <div className="flex items-center border-b border-zinc-700 pb-2">
        <div className="w-1/3 text-right pr-3">
          <span
            className={`text-sm font-bold ${
              player1.isWinner ? "text-emerald-400" : "text-zinc-300"
            }`}
          >
            {player1.name}
            {player1.isWinner && " \u2713"}
          </span>
        </div>
        <div className="w-1/3 text-center text-xs text-zinc-600">vs</div>
        <div className="w-1/3 pl-3">
          <span
            className={`text-sm font-bold ${
              player2.isWinner ? "text-emerald-400" : "text-zinc-300"
            }`}
          >
            {player2.name}
            {player2.isWinner && " \u2713"}
          </span>
        </div>
      </div>

      {isCricket ? (
        <>
          <StatRow
            label="Marks"
            value1={String(s1.totalScore)}
            value2={String(s2.totalScore)}
            highlight={highlightBetter(s1.totalScore, s2.totalScore, true)}
          />
          <StatRow
            label="Marks/Round"
            value1={
              s1.totalDarts > 0
                ? (s1.totalScore / (s1.totalDarts / 3)).toFixed(2)
                : "0"
            }
            value2={
              s2.totalDarts > 0
                ? (s2.totalScore / (s2.totalDarts / 3)).toFixed(2)
                : "0"
            }
            highlight={highlightBetter(
              s1.totalDarts > 0 ? s1.totalScore / (s1.totalDarts / 3) : 0,
              s2.totalDarts > 0 ? s2.totalScore / (s2.totalDarts / 3) : 0,
              true
            )}
          />
          <StatRow
            label="Rounds"
            value1={String(s1.totalDarts / 3)}
            value2={String(s2.totalDarts / 3)}
          />
        </>
      ) : (
        <>
          <StatRow
            label="3-Dart Avg"
            value1={s1.threeDartAvg.toFixed(2)}
            value2={s2.threeDartAvg.toFixed(2)}
            highlight={highlightBetter(
              s1.threeDartAvg,
              s2.threeDartAvg,
              true
            )}
          />
          <StatRow
            label="First 9 Avg"
            value1={s1.first9Avg.toFixed(2)}
            value2={s2.first9Avg.toFixed(2)}
            highlight={highlightBetter(s1.first9Avg, s2.first9Avg, true)}
          />
          <StatRow
            label="Darts Thrown"
            value1={String(s1.dartsToFinish)}
            value2={String(s2.dartsToFinish)}
            highlight={highlightBetter(
              s1.dartsToFinish,
              s2.dartsToFinish,
              false
            )}
          />
          {(s1.checkoutSuccess || s2.checkoutSuccess) && (
            <StatRow
              label="Checkout"
              value1={s1.checkoutSuccess ? String(s1.checkoutValue) : "-"}
              value2={s2.checkoutSuccess ? String(s2.checkoutValue) : "-"}
            />
          )}
          <StatRow
            label="180s"
            value1={String(s1.count180)}
            value2={String(s2.count180)}
            highlight={highlightBetter(s1.count180, s2.count180, true)}
          />
          <StatRow
            label="100+"
            value1={String(s1.countTonPlus)}
            value2={String(s2.countTonPlus)}
            highlight={highlightBetter(s1.countTonPlus, s2.countTonPlus, true)}
          />
        </>
      )}
    </div>
  );
}
