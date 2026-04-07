import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Ensure player record exists
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.from("players").upsert(
          {
            id: user.id,
            display_name:
              user.user_metadata.full_name ?? user.email ?? "Player",
            avatar_url: user.user_metadata.avatar_url ?? null,
          },
          { onConflict: "id" }
        );
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error — redirect to login
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
