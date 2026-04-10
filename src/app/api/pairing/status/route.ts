import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET — Camera device polls this to check if its pairing code has been claimed.
 * No auth required (camera device is unauthenticated).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("camera_pairings")
    .select("status")
    .eq("pairing_code", code)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Code not found" }, { status: 404 });
  }

  return NextResponse.json({ status: data.status });
}
