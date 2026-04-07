import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePairingCode, PAIRING_EXPIRY_MS } from "@/lib/pairing/codes";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { sessionId, cameraPosition } = body as {
    sessionId: string;
    cameraPosition: "left" | "right";
  };

  if (!sessionId || !cameraPosition) {
    return NextResponse.json(
      { error: "sessionId and cameraPosition are required" },
      { status: 400 }
    );
  }

  if (!["left", "right"].includes(cameraPosition)) {
    return NextResponse.json(
      { error: "cameraPosition must be 'left' or 'right'" },
      { status: 400 }
    );
  }

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_EXPIRY_MS).toISOString();

  const { error } = await supabase.from("camera_pairings").insert({
    session_id: sessionId,
    player_id: user.id,
    pairing_code: code,
    camera_position: cameraPosition,
    status: "pending",
    expires_at: expiresAt,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ code, expiresAt });
}

export async function PUT(request: Request) {
  const supabase = await createClient();

  const body = await request.json();
  const { code } = body as { code: string };

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
  }

  const { data: pairing, error: lookupError } = await supabase
    .from("camera_pairings")
    .select("id, session_id, camera_position")
    .eq("pairing_code", code)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .single();

  if (lookupError || !pairing) {
    return NextResponse.json(
      { error: "Code not found or expired" },
      { status: 404 }
    );
  }

  const { error: updateError } = await supabase
    .from("camera_pairings")
    .update({ status: "paired" })
    .eq("id", pairing.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const signalingUrl = process.env.NEXT_PUBLIC_MEDIA_SERVER_URL ?? "";

  return NextResponse.json({
    sessionId: pairing.session_id,
    cameraPosition: pairing.camera_position,
    signalingUrl,
  });
}
