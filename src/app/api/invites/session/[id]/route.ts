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

  // Verify the invite belongs to this user
  const { data: invite, error: lookupError } = await supabase
    .from("session_invites")
    .select("id, session_id, to_player_id, status")
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

  const { error } = await supabase
    .from("session_invites")
    .update({ status })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id, status, sessionId: invite.session_id });
}
