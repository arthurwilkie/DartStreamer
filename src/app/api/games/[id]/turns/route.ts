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
  const {
    scoreEntered,
    dartsDetail,
    roundNumber,
    playerId,
    dartsAtDouble,
    dartsForCheckout,
    legNumber,
    setNumber,
    legEnded,
    legWinnerId,
    setEnded,
    setWinnerId,
    matchOver,
    matchWinnerId,
    nextPlayerId,
    nextRound,
    nextLeg,
    nextSet,
  } = body as {
    scoreEntered: number;
    dartsDetail: unknown[];
    roundNumber: number;
    playerId?: string;
    dartsAtDouble?: number;
    dartsForCheckout?: number;
    legNumber?: number;
    setNumber?: number;
    legEnded?: boolean;
    legWinnerId?: string;
    setEnded?: boolean;
    setWinnerId?: string;
    matchOver?: boolean;
    matchWinnerId?: string;
    nextPlayerId?: string;
    nextRound?: number;
    nextLeg?: number;
    nextSet?: number;
  };

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
      leg_number: legNumber ?? game.current_leg ?? 1,
      set_number: setNumber ?? game.current_set ?? 1,
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

  // Update game state: client computed leg/set/match transitions via engine
  const otherPlayerId =
    game.player1_id === turnPlayerId ? game.player2_id : game.player1_id;
  const isPlayer2 = turnPlayerId === game.player2_id;
  const defaultNextRound = isPlayer2 ? game.current_round + 1 : game.current_round;

  const updates: Record<string, unknown> = {
    current_player_id: nextPlayerId ?? otherPlayerId,
    current_round: nextRound ?? defaultNextRound,
  };

  if (nextLeg != null) updates.current_leg = nextLeg;
  if (nextSet != null) updates.current_set = nextSet;

  if (legEnded && legWinnerId) {
    const legField =
      legWinnerId === game.player1_id ? "player1_legs" : "player2_legs";
    updates[legField] = (game[legField] ?? 0) + 1;
    if (setEnded) {
      // Reset legs for the new set
      updates.player1_legs = 0;
      updates.player2_legs = 0;
    }
  }

  if (setEnded && setWinnerId) {
    const setField =
      setWinnerId === game.player1_id ? "player1_sets" : "player2_sets";
    updates[setField] = (game[setField] ?? 0) + 1;
  }

  if (matchOver && matchWinnerId) {
    updates.status = "finished";
    updates.winner_id = matchWinnerId;
  }

  await supabase.from("games").update(updates).eq("id", gameId);

  return NextResponse.json(turn);
}
