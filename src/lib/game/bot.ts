/**
 * DartBot — generates realistic scores based on difficulty level (1-10).
 *
 * Level target 3-dart averages (modelled after DartCounter):
 *   1: ~15   2: ~22   3: ~30   4: ~38   5: ~45
 *   6: ~52   7: ~60   8: ~70   9: ~80  10: ~90
 */

export const BOT_PLAYER_ID = "00000000-0000-0000-0000-000000000000";

export const BOT_LEVEL_NAMES: Record<number, string> = {
  1: "Beginner",
  2: "Casual",
  3: "Pub Player",
  4: "League Player",
  5: "Competitive",
  6: "Advanced",
  7: "Expert",
  8: "Semi-Pro",
  9: "Professional",
  10: "World Class",
};

// Target 3-dart average per level
const LEVEL_AVG: Record<number, number> = {
  1: 15,
  2: 22,
  3: 30,
  4: 38,
  5: 45,
  6: 52,
  7: 60,
  8: 70,
  9: 80,
  10: 90,
};

// Standard deviation decreases with skill (more consistent at higher levels)
const LEVEL_STDDEV: Record<number, number> = {
  1: 12,
  2: 14,
  3: 16,
  4: 16,
  5: 18,
  6: 18,
  7: 20,
  8: 18,
  9: 16,
  10: 14,
};

// Per-dart double success rate, modelled on real player stats.
// Amateur (lvl 1): ~6%. PDC tour pro (lvl 10): ~44%.
const LEVEL_DOUBLE_PCT: Record<number, number> = {
  1: 0.06,
  2: 0.09,
  3: 0.13,
  4: 0.17,
  5: 0.22,
  6: 0.27,
  7: 0.32,
  8: 0.37,
  9: 0.41,
  10: 0.44,
};

/** Box-Muller transform for gaussian random numbers */
function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

/**
 * Generate a bot score for a single turn (3 darts).
 *
 * @param level   Difficulty 1-10
 * @param remaining  Bot's remaining score
 * @returns The score for the turn (0 if bust)
 */
/** Direct-checkout remaining values that can be finished with a single double-out dart. */
function isSingleDartDouble(remaining: number): boolean {
  if (remaining === 50) return true;
  return remaining >= 2 && remaining <= 40 && remaining % 2 === 0;
}

export function generateBotScore(level: number, remaining: number): number {
  const clampedLevel = Math.max(1, Math.min(10, level));
  const avg = LEVEL_AVG[clampedLevel];
  const stddev = LEVEL_STDDEV[clampedLevel];
  const doublePct = LEVEL_DOUBLE_PCT[clampedLevel];

  // Direct checkout: need a double dart. Simulate up to 3 attempts.
  if (isSingleDartDouble(remaining)) {
    for (let dart = 0; dart < 3; dart++) {
      if (Math.random() < doublePct) {
        return remaining; // Hit the double, checked out.
      }
    }
    // Three misses. Most common outcome: one dart bounces into the single area
    // of the same number (scores half), otherwise leaves the remaining alone or busts.
    const r = Math.random();
    if (r < 0.45) {
      // Hit single of the double number once — reduces remaining by half of the target double.
      // e.g. D16 (32) becomes 32-16=16 remaining, so score = 16.
      const halfHit = remaining === 50 ? 25 : remaining / 2;
      return halfHit;
    }
    if (r < 0.7) {
      return 0; // Missed entirely — no score change.
    }
    // Bust by overshooting (e.g., hit the odd single next to the double).
    return 0;
  }

  // Generate a normal-distribution score around the level's average
  let score = Math.round(gaussianRandom(avg, stddev));
  score = Math.max(0, Math.min(180, score));

  const newRemaining = remaining - score;
  if (newRemaining < 0 || newRemaining === 1) {
    // Bust
    return 0;
  }

  // If this would checkout without the double-out logic, trim the score so it doesn't.
  if (newRemaining === 0) {
    score = Math.max(0, score - 2);
  }

  return score;
}
