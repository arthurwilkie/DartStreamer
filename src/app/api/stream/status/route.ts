import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const gameId = url.searchParams.get("gameId");
  if (!gameId) {
    return NextResponse.json({ error: "gameId required" }, { status: 400 });
  }

  const controlUrl = process.env.VPS_CONTROL_URL;
  const controlSecret = process.env.VPS_CONTROL_SECRET;
  if (!controlUrl || !controlSecret) {
    return NextResponse.json({ live: false });
  }

  const vpsRes = await fetch(
    `${controlUrl}/status?sessionId=${encodeURIComponent(gameId)}`,
    { headers: { "X-Control-Secret": controlSecret } }
  );
  if (!vpsRes.ok) {
    return NextResponse.json({ live: false });
  }
  const body = (await vpsRes.json()) as { live?: boolean; startedAt?: number | null };
  return NextResponse.json({ live: !!body.live, startedAt: body.startedAt ?? null });
}
