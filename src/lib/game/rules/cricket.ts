import {
  type CricketDart,
  type CricketGameState,
  type CricketPlayerState,
  type CricketNumber,
  type GameConfig,
  type Turn,
  CRICKET_NUMBERS,
  LEGS_PER_SET,
  targetToWin,
} from "../types";

function createPlayerState(): CricketPlayerState {
  const numbers: Record<number, CricketNumber> = {};
  for (const num of CRICKET_NUMBERS) {
    numbers[num] = { marks: 0, closed: false };
  }
  return { numbers, points: 0 };
}

export function createCricketState(config: GameConfig): CricketGameState {
  const legStarterId = config.legStarterId ?? config.player1Id;
  return {
    mode: "cricket",
    player1Id: config.player1Id,
    player2Id: config.player2Id,
    matchFormat: config.matchFormat ?? "legs",
    target: config.target ?? 1,
    players: {
      [config.player1Id]: createPlayerState(),
      [config.player2Id]: createPlayerState(),
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
    matchWinnerId: null,
  };
}

export interface CricketTurnResult {
  valid: boolean;
  error?: string;
  marksAdded: Record<number, number>;
  pointsScored: number;
  numbersClosed: number[];
  legEnded: boolean;
  legWinnerId: string | null;
  setEnded: boolean;
  setWinnerId: string | null;
  matchOver: boolean;
  matchWinnerId: string | null;
  gameOver: boolean; // legacy alias for matchOver
  winnerId?: string; // legacy alias for matchWinnerId
}

function emptyCricketResult(): CricketTurnResult {
  return {
    valid: false,
    marksAdded: {},
    pointsScored: 0,
    numbersClosed: [],
    legEnded: false,
    legWinnerId: null,
    setEnded: false,
    setWinnerId: null,
    matchOver: false,
    matchWinnerId: null,
    gameOver: false,
  };
}

export function validateAndApplyCricketTurn(
  state: CricketGameState,
  playerId: string,
  darts: CricketDart[]
): CricketTurnResult {
  if (playerId !== state.currentPlayerId) {
    return { ...emptyCricketResult(), error: "Not your turn" };
  }

  if (darts.length === 0 || darts.length > 3) {
    return { ...emptyCricketResult(), error: "Must throw 1-3 darts" };
  }

  for (const dart of darts) {
    if (
      !CRICKET_NUMBERS.includes(dart.number as (typeof CRICKET_NUMBERS)[number]) &&
      dart.marks > 0
    ) {
      return {
        ...emptyCricketResult(),
        error: `Invalid cricket number: ${dart.number}`,
      };
    }
  }

  const otherPlayerId = Object.keys(state.players).find((id) => id !== playerId)!;
  const playerState = state.players[playerId];
  const opponentState = state.players[otherPlayerId];

  const marksAdded: Record<number, number> = {};
  let pointsScored = 0;
  const numbersClosed: number[] = [];

  for (const dart of darts) {
    if (dart.marks === 0) continue;

    const num = dart.number;
    const currentMarks =
      (playerState.numbers[num]?.marks ?? 0) + (marksAdded[num] ?? 0);

    if (playerState.numbers[num]?.closed && opponentState.numbers[num]?.closed) {
      continue;
    }

    const marksToClose = Math.max(0, 3 - currentMarks);
    const closingMarks = Math.min(dart.marks, marksToClose);
    const extraMarks = dart.marks - closingMarks;

    marksAdded[num] = (marksAdded[num] ?? 0) + dart.marks;

    const willBeClosed = currentMarks + dart.marks >= 3;
    const opponentClosed = opponentState.numbers[num]?.closed;

    if (willBeClosed && !opponentClosed && extraMarks > 0) {
      const pointValue = num === 25 ? 25 : num;
      pointsScored += pointValue * extraMarks;
    } else if (currentMarks >= 3 && !opponentClosed) {
      const pointValue = num === 25 ? 25 : num;
      pointsScored += pointValue * dart.marks;
    }

    if (willBeClosed && !numbersClosed.includes(num)) {
      numbersClosed.push(num);
    }
  }

  return {
    ...emptyCricketResult(),
    valid: true,
    marksAdded,
    pointsScored,
    numbersClosed,
  };
}

export function applyCricketTurn(
  state: CricketGameState,
  playerId: string,
  darts: CricketDart[]
): { newState: CricketGameState; result: CricketTurnResult } {
  const result = validateAndApplyCricketTurn(state, playerId, darts);

  if (!result.valid) {
    return { newState: state, result };
  }

  const otherPlayerId = Object.keys(state.players).find((id) => id !== playerId)!;

  // Deep clone player states
  const newPlayers = JSON.parse(JSON.stringify(state.players)) as Record<
    string,
    CricketPlayerState
  >;
  const playerState = newPlayers[playerId];

  for (const [numStr, marks] of Object.entries(result.marksAdded)) {
    const num = parseInt(numStr);
    playerState.numbers[num].marks += marks;
    if (playerState.numbers[num].marks >= 3) {
      playerState.numbers[num].closed = true;
    }
  }

  playerState.points += result.pointsScored;

  const totalMarks = Object.values(result.marksAdded).reduce(
    (sum, m) => sum + m,
    0
  );

  const turn: Turn = {
    gameId: "",
    playerId,
    roundNumber: state.currentRound,
    legNumber: state.currentLeg,
    setNumber: state.currentSet,
    scoreEntered: totalMarks + result.pointsScored,
    dartsDetail: darts,
    isEdited: false,
  };

  const turns = [...state.turns, turn];

  // Check leg win: all numbers closed by this player AND points >= opponent's
  const allClosedByPlayer = CRICKET_NUMBERS.every(
    (n) => playerState.numbers[n].closed
  );
  const opponentPoints = newPlayers[otherPlayerId].points;
  const legWon = allClosedByPlayer && playerState.points >= opponentPoints;

  if (legWon) {
    const legsWon = {
      ...state.legsWon,
      [playerId]: state.legsWon[playerId] + 1,
    };
    let setsWon = { ...state.setsWon };
    let currentSet = state.currentSet;
    let setEnded = false;
    let setWinnerId: string | null = null;

    if (state.matchFormat === "sets" && legsWon[playerId] >= LEGS_PER_SET) {
      setEnded = true;
      setWinnerId = playerId;
      setsWon = { ...setsWon, [playerId]: setsWon[playerId] + 1 };
      legsWon[state.player1Id] = 0;
      legsWon[state.player2Id] = 0;
      currentSet += 1;
    }

    let matchWinnerId: string | null = null;
    const winsNeeded = targetToWin(state.target);
    if (state.matchFormat === "legs" && legsWon[playerId] >= winsNeeded) {
      matchWinnerId = playerId;
    } else if (state.matchFormat === "sets" && setsWon[playerId] >= winsNeeded) {
      matchWinnerId = playerId;
    }

    const finalResult: CricketTurnResult = {
      ...result,
      legEnded: true,
      legWinnerId: playerId,
      setEnded,
      setWinnerId,
      matchOver: matchWinnerId !== null,
      matchWinnerId,
      gameOver: matchWinnerId !== null,
      winnerId: matchWinnerId ?? undefined,
    };

    if (matchWinnerId) {
      return {
        newState: {
          ...state,
          players: newPlayers,
          legsWon,
          setsWon,
          currentSet,
          turns,
          matchWinnerId,
        },
        result: finalResult,
      };
    }

    // Start the next leg: reset marks+points, flip leg starter
    const nextStarter =
      state.legStarterId === state.player1Id ? state.player2Id : state.player1Id;
    const freshPlayers: Record<string, CricketPlayerState> = {
      [state.player1Id]: createPlayerState(),
      [state.player2Id]: createPlayerState(),
    };

    return {
      newState: {
        ...state,
        players: freshPlayers,
        legsWon,
        setsWon,
        currentSet,
        currentLeg: state.currentLeg + 1,
        legStarterId: nextStarter,
        currentPlayerId: nextStarter,
        currentRound: 1,
        turns,
      },
      result: finalResult,
    };
  }

  // Normal turn — advance to other player
  const isLegStarter = playerId === state.legStarterId;
  const newRound = isLegStarter ? state.currentRound : state.currentRound + 1;

  return {
    newState: {
      ...state,
      players: newPlayers,
      currentPlayerId: otherPlayerId,
      currentRound: newRound,
      turns,
    },
    result,
  };
}
