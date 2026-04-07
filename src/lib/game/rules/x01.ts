import {
  type Dart,
  type X01GameState,
  type GameConfig,
  type Turn,
  dartScore,
  isDouble,
} from "../types";

export function createX01State(config: GameConfig): X01GameState {
  const startScore = config.mode === "501" ? 501 : 301;
  return {
    mode: config.mode as "501" | "301",
    startScore,
    scores: {
      [config.player1Id]: startScore,
      [config.player2Id]: startScore,
    },
    hasDoubledIn: {
      [config.player1Id]: config.mode === "501", // 501 = single-in, so already "in"
      [config.player2Id]: config.mode === "501",
    },
    currentPlayerId: config.player1Id,
    currentRound: 1,
    turns: [],
    dartsThrown: {
      [config.player1Id]: 0,
      [config.player2Id]: 0,
    },
  };
}

export interface X01TurnResult {
  valid: boolean;
  error?: string;
  scoreDeducted: number;
  bust: boolean;
  checkout: boolean;
  dartsUsed: number;
}

export function validateAndApplyTurn(
  state: X01GameState,
  playerId: string,
  darts: Dart[]
): X01TurnResult {
  if (playerId !== state.currentPlayerId) {
    return { valid: false, error: "Not your turn", scoreDeducted: 0, bust: false, checkout: false, dartsUsed: 0 };
  }

  if (darts.length === 0 || darts.length > 3) {
    return { valid: false, error: "Must throw 1-3 darts", scoreDeducted: 0, bust: false, checkout: false, dartsUsed: 0 };
  }

  const remaining = state.scores[playerId];
  const isDoubleIn = state.mode === "301";
  const hasDoubledIn = state.hasDoubledIn[playerId];

  // Process darts one at a time for double-in/double-out logic
  let runningScore = 0;
  let scoringStarted = hasDoubledIn;
  let dartsUsed = 0;

  for (let i = 0; i < darts.length; i++) {
    const dart = darts[i];
    const points = dartScore(dart);
    dartsUsed++;

    // 301 double-in: first scoring dart must be a double
    if (!scoringStarted && isDoubleIn) {
      if (isDouble(dart)) {
        scoringStarted = true;
        runningScore += points;
      }
      // Non-double darts before doubling in: don't score but still count as thrown
      continue;
    }

    if (scoringStarted) {
      runningScore += points;
    }

    const newRemaining = remaining - runningScore;

    // Check for bust conditions
    if (newRemaining < 0) {
      // Bust: went below zero
      return {
        valid: true,
        scoreDeducted: 0,
        bust: true,
        checkout: false,
        dartsUsed,
      };
    }

    if (newRemaining === 1) {
      // Bust: can't finish on 1 (need a double, minimum double is 2)
      return {
        valid: true,
        scoreDeducted: 0,
        bust: true,
        checkout: false,
        dartsUsed,
      };
    }

    if (newRemaining === 0) {
      // Potential checkout — must be a double
      if (isDouble(dart)) {
        return {
          valid: true,
          scoreDeducted: runningScore,
          bust: false,
          checkout: true,
          dartsUsed,
        };
      } else {
        // Bust: reached 0 without a double
        return {
          valid: true,
          scoreDeducted: 0,
          bust: true,
          checkout: false,
          dartsUsed,
        };
      }
    }
  }

  // Normal turn — score is deducted
  return {
    valid: true,
    scoreDeducted: runningScore,
    bust: false,
    checkout: false,
    dartsUsed,
  };
}

export function applyX01Turn(
  state: X01GameState,
  playerId: string,
  darts: Dart[]
): { newState: X01GameState; result: X01TurnResult } {
  const result = validateAndApplyTurn(state, playerId, darts);

  if (!result.valid) {
    return { newState: state, result };
  }

  const otherPlayer = Object.keys(state.scores).find((id) => id !== playerId)!;
  const newScores = { ...state.scores };
  const newDoubledIn = { ...state.hasDoubledIn };
  const newDartsThrown = { ...state.dartsThrown };

  if (!result.bust) {
    newScores[playerId] = state.scores[playerId] - result.scoreDeducted;
  }

  // Update doubled-in status for 301
  if (state.mode === "301" && !state.hasDoubledIn[playerId] && result.scoreDeducted > 0) {
    newDoubledIn[playerId] = true;
  }

  newDartsThrown[playerId] = (state.dartsThrown[playerId] || 0) + result.dartsUsed;

  const turn: Turn = {
    gameId: "",
    playerId,
    roundNumber: state.currentRound,
    scoreEntered: result.bust ? 0 : result.scoreDeducted,
    dartsDetail: darts,
    isEdited: false,
  };

  // Advance turn
  const isPlayer1 = playerId === Object.keys(state.scores)[0];
  const newRound = !isPlayer1 ? state.currentRound + 1 : state.currentRound;

  const newState: X01GameState = {
    ...state,
    scores: newScores,
    hasDoubledIn: newDoubledIn,
    dartsThrown: newDartsThrown,
    currentPlayerId: result.checkout ? playerId : otherPlayer,
    currentRound: result.checkout ? state.currentRound : newRound,
    turns: [...state.turns, turn],
  };

  return { newState, result };
}

export function validateAndApplyScoreTurn(
  state: X01GameState,
  playerId: string,
  score: number
): X01TurnResult {
  if (playerId !== state.currentPlayerId) {
    return { valid: false, error: "Not your turn", scoreDeducted: 0, bust: false, checkout: false, dartsUsed: 0 };
  }

  if (score < 0 || score > 180) {
    return { valid: false, error: "Score must be 0-180", scoreDeducted: 0, bust: false, checkout: false, dartsUsed: 0 };
  }

  const remaining = state.scores[playerId];
  const newRemaining = remaining - score;

  // Bust: went below zero
  if (newRemaining < 0) {
    return { valid: true, scoreDeducted: 0, bust: true, checkout: false, dartsUsed: 3 };
  }

  // Bust: can't finish on 1 (need a double, minimum double is 2)
  if (newRemaining === 1) {
    return { valid: true, scoreDeducted: 0, bust: true, checkout: false, dartsUsed: 3 };
  }

  // Checkout: reached exactly 0 — trust the player hit a valid double-out
  if (newRemaining === 0) {
    return { valid: true, scoreDeducted: score, bust: false, checkout: true, dartsUsed: 3 };
  }

  // Normal scoring turn
  return { valid: true, scoreDeducted: score, bust: false, checkout: false, dartsUsed: 3 };
}

export function applyX01ScoreTurn(
  state: X01GameState,
  playerId: string,
  score: number
): { newState: X01GameState; result: X01TurnResult } {
  const result = validateAndApplyScoreTurn(state, playerId, score);

  if (!result.valid) {
    return { newState: state, result };
  }

  const otherPlayer = Object.keys(state.scores).find((id) => id !== playerId)!;
  const newScores = { ...state.scores };
  const newDoubledIn = { ...state.hasDoubledIn };
  const newDartsThrown = { ...state.dartsThrown };

  if (!result.bust) {
    newScores[playerId] = state.scores[playerId] - result.scoreDeducted;
  }

  // For 301: if they scored > 0, they've doubled in
  if (state.mode === "301" && !state.hasDoubledIn[playerId] && result.scoreDeducted > 0) {
    newDoubledIn[playerId] = true;
  }

  newDartsThrown[playerId] = (state.dartsThrown[playerId] || 0) + result.dartsUsed;

  const turn: Turn = {
    gameId: "",
    playerId,
    roundNumber: state.currentRound,
    scoreEntered: result.bust ? 0 : result.scoreDeducted,
    dartsDetail: [],
    isEdited: false,
  };

  const isPlayer1 = playerId === Object.keys(state.scores)[0];
  const newRound = !isPlayer1 ? state.currentRound + 1 : state.currentRound;

  const newState: X01GameState = {
    ...state,
    scores: newScores,
    hasDoubledIn: newDoubledIn,
    dartsThrown: newDartsThrown,
    currentPlayerId: result.checkout ? playerId : otherPlayer,
    currentRound: result.checkout ? state.currentRound : newRound,
    turns: [...state.turns, turn],
  };

  return { newState, result };
}

export function getCheckoutSuggestion(remaining: number): string | null {
  const checkouts: Record<number, string> = {
    170: "T20 T20 Bull",
    167: "T20 T19 Bull",
    164: "T20 T18 Bull",
    161: "T20 T17 Bull",
    160: "T20 T20 D20",
    // Common finishes
    100: "T20 D20",
    80: "T20 D10",
    60: "20 D20",
    50: "18 D16",
    40: "D20",
    36: "D18",
    32: "D16",
    20: "D10",
    16: "D8",
    10: "D5",
    8: "D4",
    6: "D3",
    4: "D2",
    2: "D1",
  };
  return checkouts[remaining] ?? null;
}
