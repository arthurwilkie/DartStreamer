export type GameMode = "501" | "301" | "cricket";

export type Multiplier = 1 | 2 | 3;

export interface Dart {
  segment: number; // 0 = miss, 1-20, 25 (outer bull), 50 (bullseye)
  multiplier: Multiplier; // 1 = single, 2 = double, 3 = triple
}

export interface CricketDart {
  number: number; // 15-20 or 25 (bull)
  marks: number; // 0-3 marks hit
}

export type DartsDetail = Dart[] | CricketDart[];

export interface Turn {
  id?: string;
  gameId: string;
  playerId: string;
  roundNumber: number;
  scoreEntered: number;
  dartsDetail: DartsDetail;
  isEdited: boolean;
}

export interface X01GameState {
  mode: "501" | "301";
  startScore: number;
  scores: Record<string, number>; // playerId -> remaining score
  hasDoubledIn: Record<string, boolean>; // for 301 DIDO
  currentPlayerId: string;
  currentRound: number;
  turns: Turn[];
  dartsThrown: Record<string, number>; // total darts per player
}

export interface CricketNumber {
  marks: number; // 0-3+
  closed: boolean;
}

export interface CricketPlayerState {
  numbers: Record<number, CricketNumber>; // 15-20 and 25
  points: number;
}

export interface CricketGameState {
  mode: "cricket";
  players: Record<string, CricketPlayerState>;
  currentPlayerId: string;
  currentRound: number;
  turns: Turn[];
}

export type GameState = X01GameState | CricketGameState;

export interface GameConfig {
  id: string;
  mode: GameMode;
  player1Id: string;
  player2Id: string;
  sessionId?: string;
}

export function isX01State(state: GameState): state is X01GameState {
  return state.mode === "501" || state.mode === "301";
}

export function isCricketState(state: GameState): state is CricketGameState {
  return state.mode === "cricket";
}

export function dartScore(dart: Dart): number {
  if (dart.segment === 0) return 0;
  if (dart.segment === 25) return 25 * (dart.multiplier === 2 ? 2 : 1); // outer bull = 25, bullseye = 50
  if (dart.segment === 50) return 50; // bullseye always 50
  return dart.segment * dart.multiplier;
}

export function turnTotal(darts: Dart[]): number {
  return darts.reduce((sum, d) => sum + dartScore(d), 0);
}

export function isDouble(dart: Dart): boolean {
  return dart.multiplier === 2 || dart.segment === 50; // bullseye counts as double
}

export const CRICKET_NUMBERS = [15, 16, 17, 18, 19, 20, 25] as const;
