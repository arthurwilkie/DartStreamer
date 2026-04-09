import { type Turn, type GameMode, type CricketDart } from "@/lib/game/types";

interface TurnHistoryProps {
  turns: Turn[];
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
  mode: GameMode;
  startScore?: number;
}

export function TurnHistory({
  turns,
  player1Id,
  player2Id,
  player1Name,
  player2Name,
  mode,
  startScore,
}: TurnHistoryProps) {
  const isCricket = mode === "cricket";

  // Group turns by round
  const maxRound = turns.length > 0
    ? Math.max(...turns.map((t) => t.roundNumber))
    : 0;

  const rows: {
    round: number;
    p1Score: number | null;
    p2Score: number | null;
    p1Running: number | null;
    p2Running: number | null;
  }[] = [];

  let p1Running = startScore ?? 0;
  let p2Running = startScore ?? 0;

  for (let r = 1; r <= maxRound; r++) {
    const p1Turn = turns.find(
      (t) => t.roundNumber === r && t.playerId === player1Id
    );
    const p2Turn = turns.find(
      (t) => t.roundNumber === r && t.playerId === player2Id
    );

    const p1Score = p1Turn ? p1Turn.scoreEntered : null;
    const p2Score = p2Turn ? p2Turn.scoreEntered : null;

    if (!isCricket) {
      // X01: running remaining score
      if (p1Score !== null) p1Running -= p1Score;
      if (p2Score !== null) p2Running -= p2Score;
    } else {
      // Cricket: running total marks
      if (p1Score !== null) {
        const darts = p1Turn!.dartsDetail as CricketDart[];
        p1Running += darts.reduce((sum, d) => sum + d.marks, 0);
      }
      if (p2Score !== null) {
        const darts = p2Turn!.dartsDetail as CricketDart[];
        p2Running += darts.reduce((sum, d) => sum + d.marks, 0);
      }
    }

    rows.push({
      round: r,
      p1Score,
      p2Score,
      p1Running: p1Score !== null ? (isCricket ? p1Running : p1Running) : null,
      p2Running: p2Score !== null ? (isCricket ? p2Running : p2Running) : null,
    });
  }

  // For cricket, reset running scores to 0 (marks accumulated)
  if (isCricket) {
    // Already handled above starting from 0
  }

  return (
    <div className="rounded-xl bg-zinc-900 p-4">
      <h3 className="mb-3 text-center text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Score History
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-700 text-zinc-500">
              <th className="w-1/5 py-2 text-right pr-2 font-medium">
                {player1Name}
              </th>
              <th className="w-1/5 py-2 text-right pr-2 text-xs font-normal">
                {isCricket ? "Marks" : "Left"}
              </th>
              <th className="w-1/5 py-2 text-center font-medium">Rnd</th>
              <th className="w-1/5 py-2 pl-2 text-xs font-normal">
                {isCricket ? "Marks" : "Left"}
              </th>
              <th className="w-1/5 py-2 pl-2 font-medium">{player2Name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.round}
                className="border-b border-zinc-800/50 text-zinc-300"
              >
                <td className="py-1.5 text-right pr-2 font-medium">
                  {row.p1Score !== null ? (
                    <span
                      className={
                        row.p1Score >= 100 ? "text-amber-400" : ""
                      }
                    >
                      {row.p1Score}
                    </span>
                  ) : (
                    <span className="text-zinc-600">-</span>
                  )}
                </td>
                <td className="py-1.5 text-right pr-2 text-xs text-zinc-500">
                  {row.p1Running !== null ? row.p1Running : ""}
                </td>
                <td className="py-1.5 text-center text-zinc-600">
                  {row.round}
                </td>
                <td className="py-1.5 pl-2 text-xs text-zinc-500">
                  {row.p2Running !== null ? row.p2Running : ""}
                </td>
                <td className="py-1.5 pl-2 font-medium">
                  {row.p2Score !== null ? (
                    <span
                      className={
                        row.p2Score >= 100 ? "text-amber-400" : ""
                      }
                    >
                      {row.p2Score}
                    </span>
                  ) : (
                    <span className="text-zinc-600">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
