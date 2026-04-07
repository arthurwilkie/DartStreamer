import {
  type GameConfig,
  type GameMode,
  type GameState,
  type Dart,
  type CricketDart,
  isX01State,
  isCricketState,
} from "./types";
import { createX01State, applyX01Turn, type X01TurnResult } from "./rules/x01";
import {
  createCricketState,
  applyCricketTurn,
  type CricketTurnResult,
} from "./rules/cricket";

export type TurnResult = X01TurnResult | CricketTurnResult;

export function createGameState(config: GameConfig): GameState {
  switch (config.mode) {
    case "501":
    case "301":
      return createX01State(config);
    case "cricket":
      return createCricketState(config);
  }
}

export function applyTurn(
  state: GameState,
  playerId: string,
  darts: Dart[] | CricketDart[]
): { newState: GameState; result: TurnResult } {
  if (isX01State(state)) {
    return applyX01Turn(state, playerId, darts as Dart[]);
  }
  if (isCricketState(state)) {
    return applyCricketTurn(state, playerId, darts as CricketDart[]);
  }
  throw new Error(`Unknown game mode`);
}

export function isGameOver(state: GameState): { over: boolean; winnerId?: string } {
  if (isX01State(state)) {
    for (const [playerId, score] of Object.entries(state.scores)) {
      if (score === 0) {
        return { over: true, winnerId: playerId };
      }
    }
    return { over: false };
  }

  if (isCricketState(state)) {
    // Check in the last turn result — the applyCricketTurn already checks
    // We can also re-check here
    for (const [playerId, playerState] of Object.entries(state.players)) {
      const allClosed = [15, 16, 17, 18, 19, 20, 25].every(
        (n) => playerState.numbers[n]?.closed
      );
      if (allClosed) {
        const otherPlayerId = Object.keys(state.players).find(
          (id) => id !== playerId
        )!;
        if (playerState.points >= state.players[otherPlayerId].points) {
          return { over: true, winnerId: playerId };
        }
      }
    }
    return { over: false };
  }

  return { over: false };
}

export function getCurrentPlayer(state: GameState): string {
  return state.currentPlayerId;
}

export function getMode(state: GameState): GameMode {
  return state.mode;
}
