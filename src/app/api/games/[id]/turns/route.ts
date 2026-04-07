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
  const { scoreEntered, dartsDetail, roundNumber } = body;

  // Verify it's this player's turn
  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "active") {
    return NextResponse.json({ error: "Game is not active" }, { status: 400 });
  }

  if (game.current_player_id !== user.id) {
    return NextResponse.json({ error: "Not your turn" }, { status: 403 });
  }

  // Insert the turn
  const { data: turn, error: turnError } = await supabase
    .from("turns")
    .insert({
      game_id: gameId,
      player_id: user.id,
      round_number: roundNumber,
      score_entered: scoreEntered,
      darts_detail: dartsDetail,
    })
    .select()
    .single();

  if (turnError) {
    return NextResponse.json({ error: turnError.message }, { status: 500 });
  }

  // Switch turns
  const otherPlayerId =
    game.player1_id === user.id ? game.player2_id : game.player1_id;
  const isPlayer2 = user.id === game.player2_id;
  const newRound = isPlayer2 ? game.current_round + 1 : game.current_round;

  await supabase
    .from("games")
    .update({
      current_player_id: otherPlayerId,
      current_round: newRound,
    })
    .eq("id", gameId);

  return NextResponse.json(turn);
}
