import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

interface GameRecord {
  id: string;
  mode: string;
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  created_at: string;
  finished_at: string | null;
}

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: games } = await supabase
    .from("games")
    .select("*")
    .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
    .eq("status", "finished")
    .order("finished_at", { ascending: false })
    .limit(50);

  // Get player names for all games
  const playerIds = new Set<string>();
  games?.forEach((g) => {
    playerIds.add(g.player1_id);
    playerIds.add(g.player2_id);
  });

  const { data: players } = await supabase
    .from("players")
    .select("id, display_name")
    .in("id", Array.from(playerIds));

  const nameMap: Record<string, string> = {};
  players?.forEach((p) => {
    nameMap[p.id] = p.display_name;
  });

  const modeLabels: Record<string, string> = {
    "501": "501 SIDO",
    "301": "301 DIDO",
    cricket: "Cricket",
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Match History</h1>
          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-white"
          >
            Back
          </Link>
        </div>

        {!games || games.length === 0 ? (
          <p className="mt-8 text-zinc-500">No games played yet.</p>
        ) : (
          <div className="mt-6 space-y-2">
            {(games as GameRecord[]).map((game) => {
              const opponentId =
                game.player1_id === user.id
                  ? game.player2_id
                  : game.player1_id;
              const won = game.winner_id === user.id;
              const date = game.finished_at
                ? new Date(game.finished_at).toLocaleDateString()
                : "";

              return (
                <Link
                  key={game.id}
                  href={`/history/${game.id}`}
                  className="flex items-center justify-between rounded-lg bg-zinc-800 px-4 py-3 transition-colors hover:bg-zinc-700"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                          won
                            ? "bg-emerald-600 text-white"
                            : "bg-red-600 text-white"
                        }`}
                      >
                        {won ? "W" : "L"}
                      </span>
                      <span className="text-sm font-medium text-zinc-300">
                        {modeLabels[game.mode] ?? game.mode}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      vs {nameMap[opponentId] ?? "Player"} &middot; {date}
                    </div>
                  </div>
                  <span className="text-zinc-600">&rsaquo;</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
