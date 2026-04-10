import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BOT_PLAYER_ID } from "@/lib/game/bot";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 }
    );
  }

  // Search by display_name (case-insensitive partial match)
  const { data, error } = await supabase
    .from("players")
    .select("id, display_name, avatar_url")
    .neq("id", user.id)
    .neq("id", BOT_PLAYER_ID)
    .ilike("display_name", `%${query}%`)
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch online status for the found players
  const playerIds = data.map((p) => p.id);
  const presenceMap: Record<string, boolean> = {};

  if (playerIds.length > 0) {
    const { data: presenceData } = await supabase
      .from("player_presence")
      .select("player_id, is_online, last_seen")
      .in("player_id", playerIds);

    if (presenceData) {
      const now = Date.now();
      for (const p of presenceData) {
        const lastSeen = new Date(p.last_seen).getTime();
        // Consider online if heartbeat within last 60 seconds
        presenceMap[p.player_id] = p.is_online && now - lastSeen < 60_000;
      }
    }
  }

  const results = data.map((p) => ({
    ...p,
    is_online: presenceMap[p.id] ?? false,
  }));

  return NextResponse.json(results);
}
