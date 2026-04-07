import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold">Profile</h1>

        <div className="mt-8 flex items-center gap-4">
          {player?.avatar_url && (
            <img
              src={player.avatar_url}
              alt={player.display_name}
              className="h-16 w-16 rounded-full"
            />
          )}
          <div>
            <h2 className="text-xl font-semibold">{player?.display_name}</h2>
            <p className="text-zinc-400">{user.email}</p>
          </div>
        </div>

        <div className="mt-12">
          <h3 className="text-lg font-semibold">Statistics</h3>
          <p className="mt-2 text-zinc-500">
            Play some games to see your stats here.
          </p>
        </div>

        <div className="mt-12">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
