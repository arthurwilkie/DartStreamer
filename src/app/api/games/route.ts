import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BOT_PLAYER_ID } from "@/lib/game/bot";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    mode,
    opponentId,
    botLevel,
    sessionId,
    matchFormat,
    target,
    startingScore,
    inMode,
    outMode,
  } = body as {
    mode: string;
    opponentId?: string;
    botLevel?: number;
    sessionId?: string;
    matchFormat?: "legs" | "sets";
    target?: number;
    startingScore?: number;
    inMode?: "straight" | "double" | "master";
    outMode?: "straight" | "double" | "master";
  };

  if (!["501", "301", "701", "cricket", "custom"].includes(mode)) {
    return NextResponse.json({ error: "Invalid game mode" }, { status: 400 });
  }

  const defaultStartingScore =
    mode === "301" ? 301 : mode === "701" ? 701 : mode === "custom" ? (startingScore ?? 501) : 501;
  const defaultInMode = mode === "301" ? "double" : "straight";
  const gameStartingScore = mode === "cricket" ? null : (startingScore ?? defaultStartingScore);
  const gameInMode = inMode ?? defaultInMode;
  const gameOutMode = outMode ?? "double";
  const gameMatchFormat = matchFormat ?? "legs";
  const gameTarget = target ?? 1;

  let player2Id: string;
  let gameBotLevel: number | null = null;

  if (botLevel != null) {
    // Bot game
    const level = Math.max(1, Math.min(10, Math.round(botLevel)));
    player2Id = BOT_PLAYER_ID;
    gameBotLevel = level;
  } else if (opponentId) {
    // Specific opponent selected
    const { data: opponent } = await supabase
      .from("players")
      .select("id")
      .eq("id", opponentId)
      .single();

    if (!opponent) {
      return NextResponse.json(
        { error: "Opponent not found" },
        { status: 400 }
      );
    }

    if (opponent.id === user.id) {
      return NextResponse.json(
        { error: "Cannot play against yourself" },
        { status: 400 }
      );
    }

    player2Id = opponent.id;
  } else {
    return NextResponse.json(
      { error: "Select an opponent or choose to play vs bot" },
      { status: 400 }
    );
  }

  const { data: game, error } = await supabase
    .from("games")
    .insert({
      mode,
      player1_id: user.id,
      player2_id: player2Id,
      current_player_id: user.id,
      current_round: 1,
      status: "active",
      bot_level: gameBotLevel,
      session_id: sessionId ?? null,
      match_format: gameMatchFormat,
      target: gameTarget,
      starting_score: gameStartingScore,
      in_mode: gameInMode,
      out_mode: gameOutMode,
      current_leg: 1,
      current_set: 1,
      leg_starter_id: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(game);
}
