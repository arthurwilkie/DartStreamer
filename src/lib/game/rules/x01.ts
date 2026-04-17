import {
  type Dart,
  type X01GameState,
  type GameConfig,
  type Turn,
  type InMode,
  type OutMode,
  dartScore,
  isDouble,
  isDoubleOrTriple,
  LEGS_PER_SET,
  targetToWin,
} from "../types";

function defaultStartingScore(mode: GameConfig["mode"]): number {
  if (mode === "301") return 301;
  if (mode === "701") return 701;
  return 501;
}

function defaultInMode(mode: GameConfig["mode"]): InMode {
  return mode === "301" ? "double" : "straight";
}

function defaultOutMode(_mode: GameConfig["mode"]): OutMode {
  return "double";
}

/** A player is considered "in" immediately if the in-mode is straight. */
function initialDoubledIn(inMode: InMode): boolean {
  return inMode === "straight";
}

/** The dart starts scoring (matches the in-mode requirement). */
function satisfiesInMode(dart: Dart, inMode: InMode): boolean {
  if (inMode === "straight") return true;
  if (inMode === "double") return isDouble(dart);
  return isDoubleOrTriple(dart); // master
}

/** The dart is a valid finishing dart for the out-mode. */
function satisfiesOutMode(dart: Dart, outMode: OutMode): boolean {
  if (outMode === "straight") return true;
  if (outMode === "double") return isDouble(dart);
  return isDoubleOrTriple(dart); // master
}

/** Min remaining before a finish that would leave a bust (e.g. double-out can't leave 1). */
function minUnfinishable(outMode: OutMode): number {
  if (outMode === "straight") return 0; // anything > 0 is finishable
  if (outMode === "double") return 1; // leaving 1 is a bust with double-out
  return 1; // master: leaving 1 is also a bust (smallest double/triple is 4/3)
}

export function createX01State(config: GameConfig): X01GameState {
  if (config.mode === "cricket") {
    throw new Error("createX01State called for cricket mode");
  }

  const startingScore = config.startingScore ?? defaultStartingScore(config.mode);
  const inMode = config.inMode ?? defaultInMode(config.mode);
  const outMode = config.outMode ?? defaultOutMode(config.mode);
  const matchFormat = config.matchFormat ?? "legs";
  const target = config.target ?? 1;
  const legStarterId = config.legStarterId ?? config.player1Id;

  return {
    mode: config.mode as "501" | "301" | "701" | "custom",
    startingScore,
    inMode,
    outMode,
    matchFormat,
    target,
    player1Id: config.player1Id,
    player2Id: config.player2Id,
    scores: {
      [config.player1Id]: startingScore,
      [config.player2Id]: startingScore,
    },
    hasDoubledIn: {
      [config.player1Id]: initialDoubledIn(inMode),
      [config.player2Id]: initialDoubledIn(inMode),
    },
    legsWon: {
      [config.player1Id]: 0,
      [config.player2Id]: 0,
    },
    setsWon: {
      [config.player1Id]: 0,
      [config.player2Id]: 0,
    },
    currentLeg: 1,
    currentSet: 1,
    legStarterId,
    currentPlayerId: legStarterId,
    currentRound: 1,
    turns: [],
    dartsThrown: {
      [config.player1Id]: 0,
      [config.player2Id]: 0,
    },
    matchWinnerId: null,
  };
}

export interface X01TurnResult {
  valid: boolean;
  error?: string;
  scoreDeducted: number;
  bust: boolean;
  checkout: boolean;
  dartsUsed: number;
  legEnded: boolean;
  legWinnerId: string | null;
  setEnded: boolean;
  setWinnerId: string | null;
  matchOver: boolean;
  matchWinnerId: string | null;
}

function emptyResult(error?: string): X01TurnResult {
  return {
    valid: false,
    error,
    scoreDeducted: 0,
    bust: false,
    checkout: false,
    dartsUsed: 0,
    legEnded: false,
    legWinnerId: null,
    setEnded: false,
    setWinnerId: null,
    matchOver: false,
    matchWinnerId: null,
  };
}

export function validateAndApplyTurn(
  state: X01GameState,
  playerId: string,
  darts: Dart[]
): X01TurnResult {
  if (state.matchWinnerId) {
    return emptyResult("Match already over");
  }
  if (playerId !== state.currentPlayerId) {
    return emptyResult("Not your turn");
  }
  if (darts.length === 0 || darts.length > 3) {
    return emptyResult("Must throw 1-3 darts");
  }

  const remaining = state.scores[playerId];
  const hasDoubledIn = state.hasDoubledIn[playerId];

  let runningScore = 0;
  let scoringStarted = hasDoubledIn;
  let dartsUsed = 0;

  for (let i = 0; i < darts.length; i++) {
    const dart = darts[i];
    const points = dartScore(dart);
    dartsUsed++;

    // Respect in-mode for the first scoring dart
    if (!scoringStarted) {
      if (satisfiesInMode(dart, state.inMode)) {
        scoringStarted = true;
        runningScore += points;
      }
      continue;
    }

    runningScore += points;

    const newRemaining = remaining - runningScore;

    if (newRemaining < 0) {
      return { ...emptyResult(), valid: true, bust: true, dartsUsed };
    }
    if (newRemaining === minUnfinishable(state.outMode) && newRemaining !== 0) {
      return { ...emptyResult(), valid: true, bust: true, dartsUsed };
    }
    if (newRemaining === 0) {
      if (satisfiesOutMode(dart, state.outMode)) {
        return {
          ...emptyResult(),
          valid: true,
          scoreDeducted: runningScore,
          checkout: true,
          dartsUsed,
        };
      }
      return { ...emptyResult(), valid: true, bust: true, dartsUsed };
    }
  }

  return {
    ...emptyResult(),
    valid: true,
    scoreDeducted: runningScore,
    dartsUsed,
  };
}

/** Advance to the next leg/set/match boundary after a checkout, returning a new state. */
function advanceAfterCheckout(
  state: X01GameState,
  winnerId: string,
  result: X01TurnResult
): { state: X01GameState; result: X01TurnResult } {
  const legsWon = { ...state.legsWon, [winnerId]: state.legsWon[winnerId] + 1 };
  let setsWon = { ...state.setsWon };
  let currentSet = state.currentSet;
  let setEnded = false;
  let setWinnerId: string | null = null;

  // Set-format: check if the current set is won
  if (state.matchFormat === "sets" && legsWon[winnerId] >= LEGS_PER_SET) {
    setEnded = true;
    setWinnerId = winnerId;
    setsWon = { ...setsWon, [winnerId]: setsWon[winnerId] + 1 };
    legsWon[state.player1Id] = 0;
    legsWon[state.player2Id] = 0;
    currentSet += 1;
  }

  // Match over?
  let matchWinnerId: string | null = null;
  const winsNeeded = targetToWin(state.target);
  if (state.matchFormat === "legs" && legsWon[winnerId] >= winsNeeded) {
    matchWinnerId = winnerId;
  } else if (state.matchFormat === "sets" && setsWon[winnerId] >= winsNeeded) {
    matchWinnerId = winnerId;
  }

  if (matchWinnerId) {
    return {
      state: {
        ...state,
        legsWon,
        setsWon,
        currentSet,
        matchWinnerId,
        // keep currentPlayerId on winner for display
      },
      result: {
        ...result,
        legEnded: true,
        legWinnerId: winnerId,
        setEnded,
        setWinnerId,
        matchOver: true,
        matchWinnerId,
      },
    };
  }

  // Start a new leg
  const nextLeg = state.currentLeg + 1;
  const nextStarter =
    state.legStarterId === state.player1Id ? state.player2Id : state.player1Id;

  return {
    state: {
      ...state,
      legsWon,
      setsWon,
      currentSet,
      currentLeg: nextLeg,
      legStarterId: nextStarter,
      currentPlayerId: nextStarter,
      currentRound: 1,
      scores: {
        [state.player1Id]: state.startingScore,
        [state.player2Id]: state.startingScore,
      },
      hasDoubledIn: {
        [state.player1Id]: initialDoubledIn(state.inMode),
        [state.player2Id]: initialDoubledIn(state.inMode),
      },
      dartsThrown: {
        [state.player1Id]: 0,
        [state.player2Id]: 0,
      },
    },
    result: {
      ...result,
      legEnded: true,
      legWinnerId: winnerId,
      setEnded,
      setWinnerId,
      matchOver: false,
      matchWinnerId: null,
    },
  };
}

function recordTurn(
  state: X01GameState,
  playerId: string,
  darts: Dart[],
  scoreEntered: number
): Turn {
  return {
    gameId: "",
    playerId,
    roundNumber: state.currentRound,
    legNumber: state.currentLeg,
    setNumber: state.currentSet,
    scoreEntered,
    dartsDetail: darts,
    isEdited: false,
  };
}

function applyNonCheckoutTurn(
  state: X01GameState,
  playerId: string,
  result: X01TurnResult,
  turn: Turn
): X01GameState {
  const otherPlayer =
    playerId === state.player1Id ? state.player2Id : state.player1Id;
  const newScores = { ...state.scores };
  const newDoubledIn = { ...state.hasDoubledIn };
  const newDartsThrown = { ...state.dartsThrown };

  if (!result.bust) {
    newScores[playerId] = state.scores[playerId] - result.scoreDeducted;
  }
  if (!state.hasDoubledIn[playerId] && result.scoreDeducted > 0) {
    newDoubledIn[playerId] = true;
  }
  newDartsThrown[playerId] =
    (state.dartsThrown[playerId] || 0) + result.dartsUsed;

  // Round advances when the second player (for this leg) finishes their turn
  const isLegStarter = playerId === state.legStarterId;
  const newRound = isLegStarter ? state.currentRound : state.currentRound + 1;

  return {
    ...state,
    scores: newScores,
    hasDoubledIn: newDoubledIn,
    dartsThrown: newDartsThrown,
    currentPlayerId: otherPlayer,
    currentRound: newRound,
    turns: [...state.turns, turn],
  };
}

export function applyX01Turn(
  state: X01GameState,
  playerId: string,
  darts: Dart[]
): { newState: X01GameState; result: X01TurnResult } {
  const result = validateAndApplyTurn(state, playerId, darts);
  if (!result.valid) return { newState: state, result };

  const scoreEntered = result.bust ? 0 : result.scoreDeducted;
  const turn = recordTurn(state, playerId, darts, scoreEntered);

  if (result.checkout) {
    const advanced = advanceAfterCheckout(
      { ...state, turns: [...state.turns, turn] },
      playerId,
      result
    );
    return { newState: advanced.state, result: advanced.result };
  }

  return {
    newState: applyNonCheckoutTurn(state, playerId, result, turn),
    result,
  };
}

export function validateAndApplyScoreTurn(
  state: X01GameState,
  playerId: string,
  score: number
): X01TurnResult {
  if (state.matchWinnerId) {
    return emptyResult("Match already over");
  }
  if (playerId !== state.currentPlayerId) {
    return emptyResult("Not your turn");
  }
  if (score < 0 || score > 180) {
    return emptyResult("Score must be 0-180");
  }

  const remaining = state.scores[playerId];
  const newRemaining = remaining - score;

  if (newRemaining < 0) {
    return { ...emptyResult(), valid: true, bust: true, dartsUsed: 3 };
  }
  // Score-only entry trusts the player; can't finish on the unfinishable boundary
  if (
    newRemaining === minUnfinishable(state.outMode) &&
    newRemaining !== 0
  ) {
    return { ...emptyResult(), valid: true, bust: true, dartsUsed: 3 };
  }
  if (newRemaining === 0) {
    return {
      ...emptyResult(),
      valid: true,
      scoreDeducted: score,
      checkout: true,
      dartsUsed: 3,
    };
  }
  return {
    ...emptyResult(),
    valid: true,
    scoreDeducted: score,
    dartsUsed: 3,
  };
}

export function applyX01ScoreTurn(
  state: X01GameState,
  playerId: string,
  score: number
): { newState: X01GameState; result: X01TurnResult } {
  const result = validateAndApplyScoreTurn(state, playerId, score);
  if (!result.valid) return { newState: state, result };

  const scoreEntered = result.bust ? 0 : result.scoreDeducted;
  const turn = recordTurn(state, playerId, [], scoreEntered);

  if (result.checkout) {
    const advanced = advanceAfterCheckout(
      { ...state, turns: [...state.turns, turn] },
      playerId,
      result
    );
    return { newState: advanced.state, result: advanced.result };
  }

  return {
    newState: applyNonCheckoutTurn(state, playerId, result, turn),
    result,
  };
}

export function getCheckoutSuggestion(remaining: number): string | null {
  const checkouts: Record<number, string> = {
    170: "T20 T20 Bull",
    167: "T20 T19 Bull",
    164: "T20 T18 Bull",
    161: "T20 T17 Bull",
    160: "T20 T20 D20",
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
