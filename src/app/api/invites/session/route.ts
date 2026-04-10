import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("session_invites")
    .select(
      "id, session_id, from_player_id, to_player_id, status, created_at, from_player:players!session_invites_from_player_id_fkey(display_name, avatar_url)"
    )
    .eq("to_player_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { toPlayerId } = body as { toPlayerId: string };

  if (!toPlayerId) {
    return NextResponse.json(
      { error: "toPlayerId is required" },
      { status: 400 }
    );
  }

  if (toPlayerId === user.id) {
    return NextResponse.json(
      { error: "Cannot invite yourself" },
      { status: 400 }
    );
  }

  // Create a session for this streaming pair
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      created_by: user.id,
      opponent_id: toPlayerId,
      stream_status: "idle",
    })
    .select("id")
    .single();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  const { data: invite, error } = await supabase
    .from("session_invites")
    .insert({
      session_id: session.id,
      from_player_id: user.id,
      to_player_id: toPlayerId,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(invite, { status: 201 });
}
