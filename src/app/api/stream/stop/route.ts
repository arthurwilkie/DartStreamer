import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gameId } = (await request.json()) as { gameId?: string };
  if (!gameId) {
    return NextResponse.json({ error: "gameId required" }, { status: 400 });
  }

  const { data: game } = await supabase
    .from("games")
    .select("player1_id, player2_id")
    .eq("id", gameId)
    .single();
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  if (game.player1_id !== user.id && game.player2_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const controlUrl = process.env.VPS_CONTROL_URL;
  const controlSecret = process.env.VPS_CONTROL_SECRET;
  if (!controlUrl || !controlSecret) {
    return NextResponse.json({ error: "Streaming not configured" }, { status: 500 });
  }

  const vpsRes = await fetch(`${controlUrl}/stop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Control-Secret": controlSecret,
    },
    body: JSON.stringify({ sessionId: gameId }),
  });

  if (!vpsRes.ok) {
    return NextResponse.json({ error: "VPS rejected stop" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
