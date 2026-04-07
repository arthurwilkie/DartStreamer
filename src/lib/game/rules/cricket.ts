import {
  type CricketDart,
  type CricketGameState,
  type CricketPlayerState,
  type CricketNumber,
  type GameConfig,
  type Turn,
  CRICKET_NUMBERS,
} from "../types";

function createPlayerState(): CricketPlayerState {
  const numbers: Record<number, CricketNumber> = {};
  for (const num of CRICKET_NUMBERS) {
    numbers[num] = { marks: 0, closed: false };
  }
  return { numbers, points: 0 };
}

export function createCricketState(config: GameConfig): CricketGameState {
  return {
    mode: "cricket",
    players: {
      [config.player1Id]: createPlayerState(),
      [config.player2Id]: createPlayerState(),
    },
    currentPlayerId: config.player1Id,
    currentRound: 1,
    turns: [],
  };
}

export interface CricketTurnResult {
  valid: boolean;
  error?: string;
  marksAdded: Record<number, number>;
  pointsScored: number;
  numbersClosed: number[];
  gameOver: boolean;
  winnerId?: string;
}

export function validateAndApplyCricketTurn(
  state: CricketGameState,
  playerId: string,
  darts: CricketDart[]
): CricketTurnResult {
  if (playerId !== state.currentPlayerId) {
    return {
      valid: false,
      error: "Not your turn",
      marksAdded: {},
      pointsScored: 0,
      numbersClosed: [],
      gameOver: false,
    };
  }

  if (darts.length === 0 || darts.length > 3) {
    return {
      valid: false,
      error: "Must throw 1-3 darts",
      marksAdded: {},
      pointsScored: 0,
      numbersClosed: [],
      gameOver: false,
    };
  }

  // Validate dart targets
  for (const dart of darts) {
    if (!CRICKET_NUMBERS.includes(dart.number as (typeof CRICKET_NUMBERS)[number]) && dart.marks > 0) {
      return {
        valid: false,
        error: `Invalid cricket number: ${dart.number}`,
        marksAdded: {},
        pointsScored: 0,
        numbersClosed: [],
        gameOver: false,
      };
    }
  }

  const otherPlayerId = Object.keys(state.players).find(
    (id) => id !== playerId
  )!;
  const playerState = state.players[playerId];
  const opponentState = state.players[otherPlayerId];

  const marksAdded: Record<number, number> = {};
  let pointsScored = 0;
  const numbersClosed: number[] = [];

  for (const dart of darts) {
    if (dart.marks === 0) continue;

    const num = dart.number;
    const currentMarks = (playerState.numbers[num]?.marks ?? 0) + (marksAdded[num] ?? 0);

    // Skip if this number is closed by both players
    if (playerState.numbers[num]?.closed && opponentState.numbers[num]?.closed) {
      continue;
    }

    const marksToClose = Math.max(0, 3 - currentMarks);
    const closingMarks = Math.min(dart.marks, marksToClose);
    const extraMarks = dart.marks - closingMarks;

    marksAdded[num] = (marksAdded[num] ?? 0) + dart.marks;

    // Points: score if player has closed the number but opponent hasn't
    const willBeClosed = currentMarks + dart.marks >= 3;
    const opponentClosed = opponentState.numbers[num]?.closed;

    if (willBeClosed && !opponentClosed && extraMarks > 0) {
      // Score points for extra marks beyond closing
      const pointValue = num === 25 ? 25 : num;
      pointsScored += pointValue * extraMarks;
    } else if (currentMarks >= 3 && !opponentClosed) {
      // Already closed by this player, opponent hasn't — score all marks as points
      const pointValue = num === 25 ? 25 : num;
      pointsScored += pointValue * dart.marks;
    }

    if (willBeClosed && !numbersClosed.includes(num)) {
      numbersClosed.push(num);
    }
  }

  return {
    valid: true,
    marksAdded,
    pointsScored,
    numbersClosed,
    gameOver: false, // Will be checked after applying
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

  const otherPlayerId = Object.keys(state.players).find(
    (id) => id !== playerId
  )!;

  // Deep clone player states
  const newPlayers = JSON.parse(JSON.stringify(state.players)) as Record<
    string,
    CricketPlayerState
  >;
  const playerState = newPlayers[playerId];

  // Apply marks
  for (const [numStr, marks] of Object.entries(result.marksAdded)) {
    const num = parseInt(numStr);
    playerState.numbers[num].marks += marks;
    if (playerState.numbers[num].marks >= 3) {
      playerState.numbers[num].closed = true;
    }
  }

  // Apply points
  playerState.points += result.pointsScored;

  // Check game over: a player wins if they've closed all numbers AND
  // have equal or more points than the opponent
  const allClosedByPlayer = CRICKET_NUMBERS.every(
    (n) => playerState.numbers[n].closed
  );
  const opponentPoints = newPlayers[otherPlayerId].points;

  if (allClosedByPlayer && playerState.points >= opponentPoints) {
    result.gameOver = true;
    result.winnerId = playerId;
  }

  // Calculate score for the turn record
  const totalMarks = Object.values(result.marksAdded).reduce(
    (sum, m) => sum + m,
    0
  );

  const turn: Turn = {
    gameId: "",
    playerId,
    roundNumber: state.currentRound,
    scoreEntered: totalMarks + result.pointsScored,
    dartsDetail: darts,
    isEdited: false,
  };

  const isPlayer1 = playerId === Object.keys(state.players)[0];
  const newRound = !isPlayer1 ? state.currentRound + 1 : state.currentRound;

  const newState: CricketGameState = {
    ...state,
    players: newPlayers,
    currentPlayerId: result.gameOver ? playerId : otherPlayerId,
    currentRound: result.gameOver ? state.currentRound : newRound,
    turns: [...state.turns, turn],
  };

  return { newState, result };
}
