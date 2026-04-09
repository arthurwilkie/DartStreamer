import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BOT_PLAYER_ID } from "@/lib/game/bot";

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
  const { scoreEntered, dartsDetail, roundNumber, playerId, dartsAtDouble, dartsForCheckout } = body;

  // Verify game exists and is active
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

  const isBotGame = game.bot_level != null;
  const turnPlayerId = playerId ?? user.id;

  // For human games: verify it's this player's turn
  // For bot games: allow the human to submit bot turns too
  if (!isBotGame && game.current_player_id !== user.id) {
    return NextResponse.json({ error: "Not your turn" }, { status: 403 });
  }

  if (isBotGame) {
    // Must be a participant
    if (user.id !== game.player1_id && user.id !== game.player2_id) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }
    // turnPlayerId must be either the human or the bot
    if (turnPlayerId !== user.id && turnPlayerId !== BOT_PLAYER_ID) {
      return NextResponse.json({ error: "Invalid player" }, { status: 400 });
    }
  }

  // Insert the turn
  const { data: turn, error: turnError } = await supabase
    .from("turns")
    .insert({
      game_id: gameId,
      player_id: turnPlayerId,
      round_number: roundNumber,
      score_entered: scoreEntered,
      darts_detail: dartsDetail,
      ...(dartsAtDouble != null ? { darts_at_double: dartsAtDouble } : {}),
      ...(dartsForCheckout != null ? { darts_for_checkout: dartsForCheckout } : {}),
    })
    .select()
    .single();

  if (turnError) {
    return NextResponse.json({ error: turnError.message }, { status: 500 });
  }

  // Switch turns
  const otherPlayerId =
    game.player1_id === turnPlayerId ? game.player2_id : game.player1_id;
  const isPlayer2 = turnPlayerId === game.player2_id;
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
