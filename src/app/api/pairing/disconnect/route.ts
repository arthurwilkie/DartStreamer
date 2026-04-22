import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST — Camera device signals it has disconnected.
 * Identified by pairing code (no auth required).
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { code, pairingId } = body as { code?: string; pairingId?: string };

  const supabase = await createClient();

  if (pairingId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { error } = await supabase
      .from("camera_pairings")
      .update({ status: "expired" })
      .eq("id", pairingId)
      .eq("player_id", user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ disconnected: true });
  }

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const { error } = await supabase
    .from("camera_pairings")
    .update({ status: "expired" })
    .eq("pairing_code", code)
    .eq("status", "paired");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ disconnected: true });
}
