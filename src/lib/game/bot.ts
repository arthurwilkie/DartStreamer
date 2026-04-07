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

// Checkout probability increases with skill
const LEVEL_CHECKOUT_PCT: Record<number, number> = {
  1: 0.02,
  2: 0.05,
  3: 0.08,
  4: 0.12,
  5: 0.18,
  6: 0.25,
  7: 0.32,
  8: 0.40,
  9: 0.50,
  10: 0.60,
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
export function generateBotScore(level: number, remaining: number): number {
  const clampedLevel = Math.max(1, Math.min(10, level));
  const avg = LEVEL_AVG[clampedLevel];
  const stddev = LEVEL_STDDEV[clampedLevel];
  const checkoutPct = LEVEL_CHECKOUT_PCT[clampedLevel];

  // If remaining is achievable in this turn (≤170 for checkout)
  if (remaining <= 170 && remaining >= 2) {
    // Attempt checkout
    if (Math.random() < checkoutPct) {
      return remaining; // Successful checkout!
    }
  }

  // Generate a normal-distribution score around the level's average
  let score = Math.round(gaussianRandom(avg, stddev));

  // Clamp to valid range
  score = Math.max(0, Math.min(180, score));

  // Check bust conditions
  const newRemaining = remaining - score;
  if (newRemaining < 0 || newRemaining === 1) {
    // Bust — return 0
    return 0;
  }

  // Don't accidentally checkout without going through the checkout logic
  if (newRemaining === 0) {
    // Unintentional checkout — reduce score by a small amount to avoid it
    // (checkout should only happen through the intentional checkout path above)
    score = Math.max(0, score - 2);
  }

  return score;
}
