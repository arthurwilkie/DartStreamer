import { type Turn, type Dart, type CricketDart, type GameMode } from "./types";

export interface GameStats {
  totalScore: number;
  totalDarts: number;
  threeDartAvg: number;
  first9Score: number;
  first9Darts: number;
  first9Avg: number;
  is180: boolean;
  isTonPlus: boolean;
  checkoutAttempted: boolean;
  checkoutSuccess: boolean;
  checkoutValue: number;
  dartsToFinish: number; // total darts thrown in the leg
}

export function calculateGameStatsForPlayer(
  turns: Turn[],
  playerId: string,
  mode: GameMode,
  won: boolean
): GameStats {
  const playerTurns = turns.filter((t) => t.playerId === playerId);

  if (mode === "cricket") {
    return calculateCricketStats(playerTurns, won);
  }

  return calculateX01Stats(playerTurns, won);
}

function calculateX01Stats(playerTurns: Turn[], won: boolean): GameStats {
  let totalScore = 0;
  let totalDarts = 0;
  let first9Score = 0;
  let first9Darts = 0;
  let has180 = false;
  let hasTonPlus = false;
  let checkoutAttempted = false;
  let checkoutSuccess = false;
  let checkoutValue = 0;

  for (let i = 0; i < playerTurns.length; i++) {
    const turn = playerTurns[i];
    const darts = turn.dartsDetail as Dart[];
    const score = turn.scoreEntered;
    const dartsInTurn = darts.length;

    totalScore += score;
    totalDarts += dartsInTurn;

    // First 9 darts (first 3 turns)
    if (i < 3) {
      first9Score += score;
      first9Darts += dartsInTurn;
    }

    // 180 check (must be 3 darts, all triple 20)
    if (score === 180 && dartsInTurn === 3) {
      has180 = true;
    }

    // Ton+ check (100+ in a turn)
    if (score >= 100) {
      hasTonPlus = true;
    }

    // Checkout: last turn if player won
    if (won && i === playerTurns.length - 1) {
      checkoutAttempted = true;
      checkoutSuccess = true;
      checkoutValue = score;
    }
  }

  const threeDartAvg =
    totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0;
  const first9Avg =
    first9Darts > 0 ? (first9Score / first9Darts) * 3 : 0;

  return {
    totalScore,
    totalDarts,
    threeDartAvg,
    first9Score,
    first9Darts,
    first9Avg,
    is180: has180,
    isTonPlus: hasTonPlus,
    checkoutAttempted,
    checkoutSuccess,
    checkoutValue,
    dartsToFinish: totalDarts,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function calculateCricketStats(playerTurns: Turn[], _won: boolean): GameStats {
  let totalMarks = 0;
  const totalRounds = playerTurns.length;

  for (const turn of playerTurns) {
    const darts = turn.dartsDetail as CricketDart[];
    totalMarks += darts.reduce((sum, d) => sum + d.marks, 0);
  }

  return {
    totalScore: totalMarks,
    totalDarts: totalRounds * 3, // Cricket always 3 darts per turn
    threeDartAvg: 0, // N/A for cricket
    first9Score: 0,
    first9Darts: 0,
    first9Avg: 0,
    is180: false,
    isTonPlus: false,
    checkoutAttempted: false,
    checkoutSuccess: false,
    checkoutValue: 0,
    dartsToFinish: 0,
  };
}

export interface StatsDelta {
  totalScoreSum: number;
  totalDartsThrown: number;
  totalRounds: number;
  first9ScoreSum: number;
  first9Darts: number;
  first9Rounds: number;
  checkoutAttempts: number;
  checkoutSuccesses: number;
  highestCheckout: number;
  won: boolean;
  bestLeg: number | null;
  count180: number;
  tonPlus: number;
  marksPerRoundSum: number;
  marksPerRoundRounds: number;
}

export function calculateStatsDelta(
  turns: Turn[],
  playerId: string,
  mode: GameMode,
  won: boolean
): StatsDelta {
  const stats = calculateGameStatsForPlayer(turns, playerId, mode, won);

  return {
    totalScoreSum: stats.totalScore,
    totalDartsThrown: stats.totalDarts,
    totalRounds: turns.filter((t) => t.playerId === playerId).length,
    first9ScoreSum: stats.first9Score,
    first9Darts: stats.first9Darts,
    first9Rounds: Math.min(
      3,
      turns.filter((t) => t.playerId === playerId).length
    ),
    checkoutAttempts: stats.checkoutAttempted ? 1 : 0,
    checkoutSuccesses: stats.checkoutSuccess ? 1 : 0,
    highestCheckout: stats.checkoutValue,
    won,
    bestLeg: won ? stats.dartsToFinish : null,
    count180: stats.is180 ? 1 : 0,
    tonPlus: stats.isTonPlus ? 1 : 0,
    marksPerRoundSum: mode === "cricket" ? stats.totalScore : 0,
    marksPerRoundRounds:
      mode === "cricket"
        ? turns.filter((t) => t.playerId === playerId).length
        : 0,
  };
}
