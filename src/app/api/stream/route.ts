import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MEDIA_SERVER_URL = process.env.NEXT_PUBLIC_MEDIA_SERVER_URL ?? "http://localhost:4000";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    sessionId?: string;
    action?: "start" | "stop" | "status";
    gameId?: string;
  };
  const { sessionId, action, gameId } = body;

  if (!sessionId || !action) {
    return NextResponse.json(
      { error: "sessionId and action are required" },
      { status: 400 }
    );
  }

  if (!["start", "stop", "status"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Fetch the user's stream key from the players table
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("stream_key")
    .eq("id", user.id)
    .single();

  if (playerError || !player) {
    return NextResponse.json(
      { error: "Player record not found" },
      { status: 404 }
    );
  }

  try {
    if (action === "start") {
      const streamKey = player.stream_key as string | null;
      if (!streamKey) {
        return NextResponse.json(
          { error: "No stream key configured. Add your YouTube stream key in settings." },
          { status: 400 }
        );
      }

      const response = await fetch(`${MEDIA_SERVER_URL}/api/stream/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: sessionId, streamKey, gameId }),
      });

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        return NextResponse.json(
          { error: (data.error as string) ?? "Failed to start stream" },
          { status: response.status }
        );
      }

      return NextResponse.json(data);
    }

    if (action === "stop") {
      const response = await fetch(`${MEDIA_SERVER_URL}/api/stream/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: sessionId }),
      });

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        return NextResponse.json(
          { error: (data.error as string) ?? "Failed to stop stream" },
          { status: response.status }
        );
      }

      return NextResponse.json(data);
    }

    // action === "status"
    const response = await fetch(
      `${MEDIA_SERVER_URL}/api/stream/health?roomId=${encodeURIComponent(sessionId)}`
    );

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      return NextResponse.json(
        { error: (data.error as string) ?? "Failed to get stream status" },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
