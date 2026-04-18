import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signBroadcastToken } from "@/lib/broadcast-token";

export async function POST(
  _request: Request,
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

  const { data: game, error } = await supabase
    .from("games")
    .select("id, player1_id, player2_id")
    .eq("id", gameId)
    .single();

  if (error || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.player1_id !== user.id && game.player2_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { token, expiresAt } = signBroadcastToken({
    userId: user.id,
    gameId,
  });

  return NextResponse.json({ token, expiresAt });
}
