export type GameMode = "501" | "301" | "701" | "cricket" | "custom";
export type MatchFormat = "legs" | "sets";
export type InMode = "straight" | "double" | "master";
export type OutMode = "straight" | "double" | "master";

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
  legNumber?: number;
  setNumber?: number;
  scoreEntered: number;
  dartsDetail: DartsDetail;
  isEdited: boolean;
  dartsAtDouble?: number | null;
  dartsForCheckout?: number | null;
}

export interface X01GameState {
  mode: "501" | "301" | "701" | "custom";
  startingScore: number;
  inMode: InMode;
  outMode: OutMode;
  matchFormat: MatchFormat;
  target: number; // best-of-N
  player1Id: string;
  player2Id: string;
  scores: Record<string, number>; // playerId -> remaining score (current leg)
  hasDoubledIn: Record<string, boolean>; // for double-in / master-in tracking
  legsWon: Record<string, number>; // legs won in CURRENT set (or total if matchFormat='legs')
  setsWon: Record<string, number>; // sets won overall (always 0 for matchFormat='legs')
  currentLeg: number; // 1-indexed, overall leg count across the match
  currentSet: number; // 1-indexed
  legStarterId: string; // who throws first in the CURRENT leg
  currentPlayerId: string;
  currentRound: number; // within current leg
  turns: Turn[]; // all turns across the match
  dartsThrown: Record<string, number>; // darts thrown in CURRENT leg (resets each leg)
  matchWinnerId: string | null;
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
  player1Id: string;
  player2Id: string;
  matchFormat: MatchFormat;
  target: number;
  players: Record<string, CricketPlayerState>;
  legsWon: Record<string, number>;
  setsWon: Record<string, number>;
  currentLeg: number;
  currentSet: number;
  legStarterId: string;
  currentPlayerId: string;
  currentRound: number;
  turns: Turn[];
  matchWinnerId: string | null;
}

export type GameState = X01GameState | CricketGameState;

export interface GameConfig {
  id: string;
  mode: GameMode;
  player1Id: string;
  player2Id: string;
  sessionId?: string;
  startingScore?: number; // required for x01; ignored for cricket
  inMode?: InMode;
  outMode?: OutMode;
  matchFormat?: MatchFormat;
  target?: number;
  legStarterId?: string; // defaults to player1Id
}

export function isX01State(state: GameState): state is X01GameState {
  return state.mode !== "cricket";
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

export function isDoubleOrTriple(dart: Dart): boolean {
  return dart.multiplier === 2 || dart.multiplier === 3 || dart.segment === 50;
}

/** How many legs are needed to win a set (standard darts). */
export const LEGS_PER_SET = 3;

/** How many wins (legs or sets) are needed to win a best-of-N match. */
export function targetToWin(target: number): number {
  return Math.ceil(target / 2);
}

export const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25] as const;
