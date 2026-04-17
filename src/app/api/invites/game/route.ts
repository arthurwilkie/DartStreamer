import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("game_invites")
    .select(
      "id, from_player_id, to_player_id, game_mode, session_id, status, created_at, match_format, target, starting_score, in_mode, out_mode, from_player:players!game_invites_from_player_id_fkey(display_name, avatar_url)"
    )
    .eq("to_player_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

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
    toPlayerId,
    gameMode,
    sessionId,
    matchFormat,
    target,
    startingScore,
    inMode,
    outMode,
  } = body as {
    toPlayerId: string;
    gameMode: string;
    sessionId?: string;
    matchFormat?: "legs" | "sets";
    target?: number;
    startingScore?: number;
    inMode?: "straight" | "double" | "master";
    outMode?: "straight" | "double" | "master";
  };

  if (!toPlayerId || !gameMode) {
    return NextResponse.json(
      { error: "toPlayerId and gameMode are required" },
      { status: 400 }
    );
  }

  if (!["501", "301", "701", "cricket", "custom"].includes(gameMode)) {
    return NextResponse.json(
      { error: "Invalid game mode" },
      { status: 400 }
    );
  }

  const defaultStartingScore =
    gameMode === "301"
      ? 301
      : gameMode === "701"
      ? 701
      : gameMode === "custom"
      ? (startingScore ?? 501)
      : 501;
  const invStartingScore =
    gameMode === "cricket" ? null : (startingScore ?? defaultStartingScore);
  const invInMode = inMode ?? (gameMode === "301" ? "double" : "straight");
  const invOutMode = outMode ?? "double";
  const invMatchFormat = matchFormat ?? "legs";
  const invTarget = target ?? 1;

  if (toPlayerId === user.id) {
    return NextResponse.json(
      { error: "Cannot invite yourself" },
      { status: 400 }
    );
  }

  const { data: invite, error } = await supabase
    .from("game_invites")
    .insert({
      from_player_id: user.id,
      to_player_id: toPlayerId,
      game_mode: gameMode,
      session_id: sessionId ?? null,
      status: "pending",
      match_format: invMatchFormat,
      target: invTarget,
      starting_score: invStartingScore,
      in_mode: invInMode,
      out_mode: invOutMode,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(invite, { status: 201 });
}
