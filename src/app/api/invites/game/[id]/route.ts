import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { status } = body as { status: "accepted" | "declined" };

  if (!["accepted", "declined"].includes(status)) {
    return NextResponse.json(
      { error: "Status must be 'accepted' or 'declined'" },
      { status: 400 }
    );
  }

  const { data: invite, error: lookupError } = await supabase
    .from("game_invites")
    .select("id, from_player_id, to_player_id, game_mode, session_id, status")
    .eq("id", id)
    .single();

  if (lookupError || !invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.to_player_id !== user.id) {
    return NextResponse.json({ error: "Not your invite" }, { status: 403 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: "Invite already responded to" },
      { status: 400 }
    );
  }

  // Update invite status
  const { error } = await supabase
    .from("game_invites")
    .update({ status })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If accepted, create the game
  if (status === "accepted") {
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        mode: invite.game_mode,
        player1_id: invite.from_player_id,
        player2_id: user.id,
        current_player_id: invite.from_player_id,
        current_round: 1,
        status: "active",
        session_id: invite.session_id ?? null,
      })
      .select("id")
      .single();

    if (gameError) {
      return NextResponse.json({ error: gameError.message }, { status: 500 });
    }

    return NextResponse.json({ id, status, gameId: game.id });
  }

  return NextResponse.json({ id, status });
}
