import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { nickname, displayName } = body as {
    nickname?: string | null;
    displayName?: string;
  };

  const updates: Record<string, unknown> = {};
  if (nickname !== undefined) {
    const trimmed = typeof nickname === "string" ? nickname.trim() : "";
    if (trimmed.length > 24) {
      return NextResponse.json(
        { error: "Nickname must be 24 characters or fewer" },
        { status: 400 }
      );
    }
    updates.nickname = trimmed.length === 0 ? null : trimmed;
  }
  if (displayName !== undefined) {
    const trimmed = displayName.trim();
    if (trimmed.length === 0 || trimmed.length > 50) {
      return NextResponse.json(
        { error: "Display name must be 1-50 characters" },
        { status: 400 }
      );
    }
    updates.display_name = trimmed;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("players").update(updates).eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
