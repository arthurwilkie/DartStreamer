import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { winnerId } = body;

  const { error } = await supabase
    .from("games")
    .update({
      status: "finished",
      winner_id: winnerId,
      finished_at: new Date().toISOString(),
    })
    .eq("id", gameId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update statistics for both players
  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();

  if (game) {
    const { data: turns } = await supabase
      .from("turns")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (turns) {
      for (const playerId of [game.player1_id, game.player2_id]) {
        const won = playerId === winnerId;
        const playerTurns = turns.filter((t) => t.player_id === playerId);
        const totalScore = playerTurns.reduce((s, t) => s + t.score_entered, 0);
        const totalDarts = playerTurns.reduce((s, t) => {
          const detail = t.darts_detail as Array<Record<string, unknown>>;
          return s + detail.length;
        }, 0);

        // First 9 darts (first 3 turns)
        const first3Turns = playerTurns.slice(0, 3);
        const first9Score = first3Turns.reduce((s, t) => s + t.score_entered, 0);
        const first9Darts = first3Turns.reduce((s, t) => {
          const detail = t.darts_detail as Array<Record<string, unknown>>;
          return s + detail.length;
        }, 0);

        // Upsert statistics with incremental updates
        const { data: existing } = await supabase
          .from("statistics")
          .select("*")
          .eq("player_id", playerId)
          .eq("game_mode", game.mode)
          .single();

        const lastTurnScore = won && playerTurns.length > 0
          ? playerTurns[playerTurns.length - 1].score_entered
          : 0;

        if (existing) {
          await supabase
            .from("statistics")
            .update({
              total_score_sum: existing.total_score_sum + totalScore,
              total_darts_thrown: existing.total_darts_thrown + totalDarts,
              total_rounds: existing.total_rounds + playerTurns.length,
              first_9_score_sum: existing.first_9_score_sum + first9Score,
              first_9_darts: existing.first_9_darts + first9Darts,
              first_9_rounds: existing.first_9_rounds + Math.min(3, playerTurns.length),
              checkout_attempts: existing.checkout_attempts + (won ? 1 : 0),
              checkout_successes: existing.checkout_successes + (won ? 1 : 0),
              highest_checkout: Math.max(existing.highest_checkout ?? 0, won ? lastTurnScore : 0),
              wins: existing.wins + (won ? 1 : 0),
              losses: existing.losses + (won ? 0 : 1),
              best_leg: won
                ? existing.best_leg
                  ? Math.min(existing.best_leg, totalDarts)
                  : totalDarts
                : existing.best_leg,
              count_180: existing.count_180 + playerTurns.filter((t) => t.score_entered === 180).length,
              ton_plus: existing.ton_plus + playerTurns.filter((t) => t.score_entered >= 100).length,
              marks_per_round_sum: game.mode === "cricket"
                ? existing.marks_per_round_sum + totalScore
                : existing.marks_per_round_sum,
              marks_per_round_rounds: game.mode === "cricket"
                ? existing.marks_per_round_rounds + playerTurns.length
                : existing.marks_per_round_rounds,
              games_played: existing.games_played + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("player_id", playerId)
            .eq("game_mode", game.mode);
        } else {
          await supabase.from("statistics").insert({
            player_id: playerId,
            game_mode: game.mode,
            total_score_sum: totalScore,
            total_darts_thrown: totalDarts,
            total_rounds: playerTurns.length,
            first_9_score_sum: first9Score,
            first_9_darts: first9Darts,
            first_9_rounds: Math.min(3, playerTurns.length),
            checkout_attempts: won ? 1 : 0,
            checkout_successes: won ? 1 : 0,
            highest_checkout: won ? lastTurnScore : 0,
            wins: won ? 1 : 0,
            losses: won ? 0 : 1,
            best_leg: won ? totalDarts : null,
            count_180: playerTurns.filter((t) => t.score_entered === 180).length,
            ton_plus: playerTurns.filter((t) => t.score_entered >= 100).length,
            marks_per_round_sum: game.mode === "cricket" ? totalScore : 0,
            marks_per_round_rounds: game.mode === "cricket" ? playerTurns.length : 0,
            games_played: 1,
          });
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
