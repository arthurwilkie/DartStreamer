import {
  type GameConfig,
  type GameMode,
  type GameState,
  type Dart,
  type CricketDart,
  isX01State,
  isCricketState,
} from "./types";
import { createX01State, applyX01Turn, applyX01ScoreTurn, type X01TurnResult } from "./rules/x01";
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
    case "701":
    case "custom":
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

export function applyScoreTurn(
  state: GameState,
  playerId: string,
  score: number
): { newState: GameState; result: TurnResult } {
  if (isX01State(state)) {
    return applyX01ScoreTurn(state, playerId, score);
  }
  throw new Error("Score-only turns are only supported for X01 games");
}

export function isGameOver(state: GameState): { over: boolean; winnerId?: string } {
  if (isX01State(state)) {
    if (state.matchWinnerId) {
      return { over: true, winnerId: state.matchWinnerId };
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
