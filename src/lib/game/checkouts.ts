/**
 * Checkout utilities for X01 games.
 *
 * Determines whether a remaining score can be finished in 1, 2, or 3 darts,
 * and whether the "Darts Used on a Double" popup should be shown.
 */

// All possible scores from a single dart throw
const ALL_DART_SCORES: number[] = (() => {
  const scores = new Set<number>();
  for (let i = 1; i <= 20; i++) {
    scores.add(i);       // single
    scores.add(i * 2);   // double
    scores.add(i * 3);   // treble
  }
  scores.add(25); // outer bull
  scores.add(50); // bullseye (double 25)
  return Array.from(scores);
})();

// All valid finishing doubles (D1-D20 + Bull)
const FINISHING_DOUBLES: number[] = [
  2, 4, 6, 8, 10, 12, 14, 16, 18, 20,
  22, 24, 26, 28, 30, 32, 34, 36, 38, 40,
  50,
];

const DART_SCORE_SET = new Set(ALL_DART_SCORES);
const DOUBLE_SET = new Set(FINISHING_DOUBLES);

/**
 * Returns the minimum number of darts needed to check out from the given score,
 * or null if the score is not checkable (e.g. >170, <2, or impossible like 169).
 */
function computeMinDarts(score: number): number | null {
  if (score < 2 || score > 170) return null;

  // 1-dart finish: score is itself a double
  if (DOUBLE_SET.has(score)) return 1;

  // 2-dart finish: score = nonzero_dart + finishing_double
  for (const d of FINISHING_DOUBLES) {
    const remainder = score - d;
    if (remainder > 0 && DART_SCORE_SET.has(remainder)) return 2;
  }

  // 3-dart finish: score = dart1 + dart2 + finishing_double
  for (const d of FINISHING_DOUBLES) {
    for (const d1 of ALL_DART_SCORES) {
      const remainder = score - d - d1;
      if (remainder >= 0 && DART_SCORE_SET.has(remainder)) return 3;
    }
  }

  return null; // not checkable
}

// Precompute lookup table for scores 2-170
const MIN_DARTS_MAP: Map<number, number> = new Map();
for (let s = 2; s <= 170; s++) {
  const min = computeMinDarts(s);
  if (min !== null) MIN_DARTS_MAP.set(s, min);
}

/**
 * Returns the minimum number of darts needed to check out from this score,
 * or null if the score is not checkable.
 */
export function getMinDartsToFinish(score: number): number | null {
  return MIN_DARTS_MAP.get(score) ?? null;
}

/**
 * Returns whether the "Darts Used on a Double" popup should be shown
 * for a player whose remaining score is `remainingBefore` at the start of their turn.
 *
 * The popup is shown when the score can be finished in fewer than 3 darts,
 * because the number of darts thrown at a double is ambiguous.
 * For 3-dart-only checkouts, there's only ever 1 dart at double — no ambiguity.
 */
export function shouldShowDartsAtDoublePopup(remainingBefore: number): boolean {
  const min = MIN_DARTS_MAP.get(remainingBefore);
  return min !== undefined && min < 3;
}

/**
 * Returns the maximum number of darts that could have been thrown at a double
 * for the given remaining score.
 *
 * - 1-dart finish (doubles): max 3 darts at double (all 3 could target the double)
 * - 2-dart finish: max 2 darts at double (setup dart + 2 attempts at double)
 */
export function getMaxDartsAtDouble(remainingBefore: number): number {
  const min = MIN_DARTS_MAP.get(remainingBefore);
  if (min === undefined) return 0;
  return 4 - min; // min=1 → 3, min=2 → 2, min=3 → 1
}

/**
 * Returns the array of options to show in the popup.
 *
 * - If the player checked out: options 1..max (must have hit at least 1 double)
 * - If not checked out: options 0..max (might not have attempted any doubles)
 */
export function getDartsAtDoubleOptions(
  remainingBefore: number,
  checkedOut: boolean
): number[] {
  const max = getMaxDartsAtDouble(remainingBefore);
  const min = checkedOut ? 1 : 0;
  const options: number[] = [];
  for (let i = min; i <= max; i++) {
    options.push(i);
  }
  return options;
}
