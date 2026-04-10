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
    .from("favorites")
    .select(
      "favorite_id, created_at, player:players!favorites_favorite_id_fkey(id, display_name, avatar_url)"
    )
    .eq("player_id", user.id)
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
  const { favoriteId } = body as { favoriteId: string };

  if (!favoriteId) {
    return NextResponse.json(
      { error: "favoriteId is required" },
      { status: 400 }
    );
  }

  if (favoriteId === user.id) {
    return NextResponse.json(
      { error: "Cannot favorite yourself" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("favorites").insert({
    player_id: user.id,
    favorite_id: favoriteId,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Already in favorites" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ favoriteId }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const favoriteId = searchParams.get("favoriteId");

  if (!favoriteId) {
    return NextResponse.json(
      { error: "favoriteId query param is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("player_id", user.id)
    .eq("favorite_id", favoriteId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ removed: favoriteId });
}
