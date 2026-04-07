import { type GameMode } from "../game/types";

export interface PlayerStats {
  gameMode: GameMode;
  threeDartAvg: number;
  first9Avg: number;
  checkoutPct: number;
  highestCheckout: number;
  wins: number;
  losses: number;
  bestLeg: number | null;
  count180: number;
  tonPlus: number;
  marksPerRound: number;
  gamesPlayed: number;
}

export function formatStats(row: Record<string, unknown>): PlayerStats {
  return {
    gameMode: row.game_mode as GameMode,
    threeDartAvg: Number(row.three_dart_avg ?? 0),
    first9Avg: Number(row.first_9_avg ?? 0),
    checkoutPct: Number(row.checkout_pct ?? 0),
    highestCheckout: Number(row.highest_checkout ?? 0),
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    bestLeg: row.best_leg ? Number(row.best_leg) : null,
    count180: Number(row.count_180 ?? 0),
    tonPlus: Number(row.ton_plus ?? 0),
    marksPerRound: Number(row.marks_per_round ?? 0),
    gamesPlayed: Number(row.games_played ?? 0),
  };
}
