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
  count180: number;
  countTonPlus: number;
  // Scored-bracket counts (cumulative: c100Plus includes 140+, 180 etc.)
  c140Plus: number;
  c120Plus: number;
  c100Plus: number;
  c80Plus: number;
  c60Plus: number;
  c40Plus: number;
  // Checkouts aggregated across all legs in the match
  checkoutAttempted: boolean;
  checkoutSuccess: boolean;
  checkoutValue: number; // legacy: the final winning checkout
  highCheckout: number; // highest successful checkout across all legs
  checkoutsHit: number; // total legs finished by this player
  dartsAtDouble: number; // total darts thrown at a double across all legs
  checkoutPct: number; // checkoutsHit / dartsAtDouble
  dartsToFinish: number; // total darts thrown across the match
  // Cricket-specific stats (zero-filled for X01)
  cricketMarksPerRound: number; // average marks per round
  cricketHighMarkRound: number; // highest marks in a single round (1-9)
  cricketTriples: number;
  cricketDoubles: number;
  cricketSingles: number;
  cricketBulls: number;
  cricketMisses: number;
}

export function calculateGameStatsForPlayer(
  turns: Turn[],
  playerId: string,
  mode: GameMode,
  won: boolean,
  startingScore = 501
): GameStats {
  const playerTurns = turns.filter((t) => t.playerId === playerId);

  if (mode === "cricket") {
    return calculateCricketStats(playerTurns, won);
  }

  return calculateX01Stats(playerTurns, won, startingScore);
}

function calculateX01Stats(
  playerTurns: Turn[],
  won: boolean,
  startingScore: number
): GameStats {
  let totalScore = 0;
  let totalDarts = 0;
  let first9Score = 0;
  let first9Darts = 0;
  let count180 = 0;
  let countTonPlus = 0;
  let c140Plus = 0;
  let c120Plus = 0;
  let c100Plus = 0;
  let c80Plus = 0;
  let c60Plus = 0;
  let c40Plus = 0;
  let highCheckout = 0;
  let checkoutsHit = 0;
  let dartsAtDouble = 0;
  let checkoutValue = 0;

  // Track remaining score per leg to detect checkouts without engine help.
  // Group turns by leg to count first-9 as darts 1-9 of each leg.
  const byLeg = new Map<number, Turn[]>();
  for (const t of playerTurns) {
    const leg = t.legNumber ?? 1;
    const arr = byLeg.get(leg) ?? [];
    arr.push(t);
    byLeg.set(leg, arr);
  }

  for (const [, legTurns] of byLeg) {
    let remaining = startingScore;
    let legDarts = 0;
    let legFirst9Used = 0;

    for (const turn of legTurns) {
      const darts = turn.dartsDetail as Dart[];
      const score = turn.scoreEntered;
      const dartsInTurn = darts.length || 3;

      totalScore += score;
      totalDarts += dartsInTurn;

      // First 9 darts of the leg
      const capacity = Math.max(0, 9 - legFirst9Used);
      if (capacity > 0) {
        const used = Math.min(capacity, dartsInTurn);
        // Pro-rate score by darts used toward the first 9
        const prorated = dartsInTurn > 0 ? (score * used) / dartsInTurn : 0;
        first9Score += prorated;
        first9Darts += used;
        legFirst9Used += used;
      }

      if (score === 180 && dartsInTurn === 3) count180++;
      if (score >= 100) countTonPlus++;
      if (score >= 140) c140Plus++;
      if (score >= 120) c120Plus++;
      if (score >= 100) c100Plus++;
      if (score >= 80) c80Plus++;
      if (score >= 60) c60Plus++;
      if (score >= 40) c40Plus++;

      if (turn.dartsAtDouble != null) dartsAtDouble += turn.dartsAtDouble;

      legDarts += dartsInTurn;

      const newRemaining = remaining - score;
      if (newRemaining === 0) {
        // Checkout!
        checkoutsHit++;
        if (score > highCheckout) highCheckout = score;
        checkoutValue = score;
        break; // leg done
      } else if (newRemaining > 1) {
        remaining = newRemaining;
      }
      // else: bust (score stays the same, score_entered would be 0)
    }
    void legDarts;
  }

  const threeDartAvg = totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0;
  const first9Avg = first9Darts > 0 ? (first9Score / first9Darts) * 3 : 0;
  const checkoutPct =
    dartsAtDouble > 0 ? (checkoutsHit / dartsAtDouble) * 100 : 0;

  return {
    totalScore,
    totalDarts,
    threeDartAvg,
    first9Score,
    first9Darts,
    first9Avg,
    is180: count180 > 0,
    isTonPlus: countTonPlus > 0,
    count180,
    countTonPlus,
    c140Plus,
    c120Plus,
    c100Plus,
    c80Plus,
    c60Plus,
    c40Plus,
    checkoutAttempted: won,
    checkoutSuccess: checkoutsHit > 0,
    checkoutValue,
    highCheckout,
    checkoutsHit,
    dartsAtDouble,
    checkoutPct,
    dartsToFinish: totalDarts,
    cricketMarksPerRound: 0,
    cricketHighMarkRound: 0,
    cricketTriples: 0,
    cricketDoubles: 0,
    cricketSingles: 0,
    cricketBulls: 0,
    cricketMisses: 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function calculateCricketStats(playerTurns: Turn[], _won: boolean): GameStats {
  let totalMarks = 0;
  let triples = 0;
  let doubles = 0;
  let singles = 0;
  let bulls = 0;
  let misses = 0;
  let highMarkRound = 0;
  let dartsThrown = 0;

  for (const turn of playerTurns) {
    const darts = turn.dartsDetail as CricketDart[];
    let roundMarks = 0;
    for (const d of darts) {
      dartsThrown += 1;
      if (d.marks === 0) {
        misses += 1;
        continue;
      }
      totalMarks += d.marks;
      roundMarks += d.marks;
      if (d.marks === 3) triples += 1;
      else if (d.marks === 2) doubles += 1;
      else if (d.marks === 1) singles += 1;
      if (d.number === 25) bulls += 1;
    }
    if (roundMarks > highMarkRound) highMarkRound = roundMarks;
  }

  const totalRounds = playerTurns.length;
  const marksPerRound = totalRounds > 0 ? totalMarks / totalRounds : 0;

  return {
    totalScore: totalMarks,
    totalDarts: dartsThrown,
    threeDartAvg: 0,
    first9Score: 0,
    first9Darts: 0,
    first9Avg: 0,
    is180: false,
    isTonPlus: false,
    count180: 0,
    countTonPlus: 0,
    c140Plus: 0,
    c120Plus: 0,
    c100Plus: 0,
    c80Plus: 0,
    c60Plus: 0,
    c40Plus: 0,
    checkoutAttempted: false,
    checkoutSuccess: false,
    checkoutValue: 0,
    highCheckout: 0,
    checkoutsHit: 0,
    dartsAtDouble: 0,
    checkoutPct: 0,
    dartsToFinish: dartsThrown,
    cricketMarksPerRound: marksPerRound,
    cricketHighMarkRound: highMarkRound,
    cricketTriples: triples,
    cricketDoubles: doubles,
    cricketSingles: singles,
    cricketBulls: bulls,
    cricketMisses: misses,
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
    checkoutAttempts: stats.dartsAtDouble,
    checkoutSuccesses: stats.checkoutsHit,
    highestCheckout: stats.highCheckout,
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
