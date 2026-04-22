import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptStreamKey } from "@/lib/stream-key-crypto";
import { signBroadcastToken } from "@/lib/broadcast-token";

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

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id, player1_id, player2_id")
    .eq("id", gameId)
    .single();
  if (gameErr || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  if (game.player1_id !== user.id && game.player2_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: player } = await admin
    .from("players")
    .select("stream_key_encrypted")
    .eq("id", user.id)
    .single();

  const ciphertext = player?.stream_key_encrypted as string | null | undefined;
  if (!ciphertext) {
    return NextResponse.json(
      { error: "No stream key saved. Add one in Settings." },
      { status: 400 }
    );
  }

  let streamKey: string;
  try {
    streamKey = decryptStreamKey(ciphertext);
  } catch {
    return NextResponse.json(
      { error: "Stream key could not be decrypted. Re-save it in Settings." },
      { status: 500 }
    );
  }

  const { token } = signBroadcastToken({ userId: user.id, gameId });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const controlUrl = process.env.VPS_CONTROL_URL;
  const controlSecret = process.env.VPS_CONTROL_SECRET;
  if (!appUrl || !controlUrl || !controlSecret) {
    return NextResponse.json(
      { error: "Streaming not configured on server" },
      { status: 500 }
    );
  }

  const broadcastUrl = `${appUrl}/broadcast/${gameId}?t=${token}`;

  const vpsRes = await fetch(`${controlUrl}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Control-Secret": controlSecret,
    },
    body: JSON.stringify({ sessionId: gameId, broadcastUrl, streamKey }),
  });

  const vpsBody = (await vpsRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!vpsRes.ok) {
    return NextResponse.json(
      { error: (vpsBody.error as string) ?? "VPS rejected start", status: vpsRes.status },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, gameId });
}
