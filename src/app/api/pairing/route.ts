import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePairingCode, PAIRING_EXPIRY_MS } from "@/lib/pairing/codes";

/**
 * POST — Camera device creates a pairing code (no auth required).
 * The external camera device opens /camera, starts the camera,
 * and calls this to get a code to display to the user.
 */
export async function POST() {
  const supabase = await createClient();

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_EXPIRY_MS).toISOString();

  const { data, error } = await supabase
    .from("camera_pairings")
    .insert({
      pairing_code: code,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ code, pairingId: data.id, expiresAt });
}

/**
 * PUT — Scoring device claims a pairing code (auth required).
 * The user on the scoring device enters the 6-digit code displayed
 * on the camera device, linking that camera to their session.
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { code, sessionId } = body as { code: string; sessionId?: string };

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
  }

  // Find the pending pairing created by the camera device
  const { data: pairing, error: lookupError } = await supabase
    .from("camera_pairings")
    .select("id")
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

  // Claim the pairing — link to this user and session
  const { error: updateError } = await supabase
    .from("camera_pairings")
    .update({
      status: "paired",
      player_id: user.id,
      session_id: sessionId ?? null,
    })
    .eq("id", pairing.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ paired: true, pairingId: pairing.id });
}
