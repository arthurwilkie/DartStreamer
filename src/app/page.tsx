import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: player } = await supabase
    .from("players")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-bold">DartStreamer</h1>
        <p className="mt-1 text-zinc-400">
          Welcome back, {player?.display_name ?? "Player"}
        </p>

        <div className="mt-10 grid gap-4">
          <Link
            href="/new-game"
            className="flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-4 text-lg font-semibold transition-colors hover:bg-emerald-500"
          >
            New Game
          </Link>
          <Link
            href="/stats"
            className="flex items-center justify-center rounded-xl border border-zinc-700 px-6 py-4 text-lg font-semibold transition-colors hover:border-zinc-500"
          >
            Statistics
          </Link>
          <Link
            href="/history"
            className="flex items-center justify-center rounded-xl border border-zinc-700 px-6 py-4 text-lg font-semibold transition-colors hover:border-zinc-500"
          >
            Match History
          </Link>
          <Link
            href="/profile"
            className="flex items-center justify-center rounded-xl border border-zinc-700 px-6 py-4 text-lg font-semibold transition-colors hover:border-zinc-500"
          >
            Profile
          </Link>
          <Link
            href="/settings"
            className="flex items-center justify-center rounded-xl border border-zinc-700 px-6 py-4 text-lg font-semibold transition-colors hover:border-zinc-500"
          >
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
