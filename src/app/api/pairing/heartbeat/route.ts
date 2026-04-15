import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST — Camera device sends a heartbeat to prove it's still alive.
 * Identified by pairing code (no auth required).
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { code } = body as { code: string };

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("camera_pairings")
    .update({ last_heartbeat: new Date().toISOString() })
    .eq("pairing_code", code)
    .eq("status", "paired");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
