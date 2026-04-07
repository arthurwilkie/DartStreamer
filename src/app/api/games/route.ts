import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { mode, sessionId } = body as { mode: string; sessionId?: string };

  if (!["501", "301", "cricket"].includes(mode)) {
    return NextResponse.json({ error: "Invalid game mode" }, { status: 400 });
  }

  // Find the other registered player
  const { data: players } = await supabase
    .from("players")
    .select("id")
    .neq("id", user.id)
    .limit(1);

  if (!players || players.length === 0) {
    return NextResponse.json(
      { error: "No other player registered. Ask your opponent to sign up first." },
      { status: 400 }
    );
  }

  const opponentId = players[0].id;

  const { data: game, error } = await supabase
    .from("games")
    .insert({
      mode,
      player1_id: user.id,
      player2_id: opponentId,
      current_player_id: user.id,
      current_round: 1,
      status: "active",
      session_id: sessionId ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(game);
}
