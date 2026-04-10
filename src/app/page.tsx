import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { BOT_PLAYER_ID } from "@/lib/game/bot";
import { NotificationBell } from "@/components/notifications/NotificationBell";

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

  // Load active games the user is part of
  const { data: activeGames } = await supabase
    .from("games")
    .select("*")
    .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(10);

  // Get opponent names for active games
  const opponentIds = new Set<string>();
  activeGames?.forEach((g) => {
    const oppId = g.player1_id === user.id ? g.player2_id : g.player1_id;
    if (oppId) opponentIds.add(oppId);
  });

  const { data: opponents } = opponentIds.size > 0
    ? await supabase
        .from("players")
        .select("id, display_name")
        .in("id", Array.from(opponentIds))
    : { data: [] };

  const nameMap: Record<string, string> = {};
  opponents?.forEach((p) => {
    nameMap[p.id] = p.id === BOT_PLAYER_ID ? "DartBot" : p.display_name;
  });

  const modeLabels: Record<string, string> = {
    "501": "501",
    "301": "301",
    cricket: "Cricket",
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">DartStreamer</h1>
            <p className="mt-1 text-zinc-400">
              Welcome back, {player?.display_name ?? "Player"}
            </p>
          </div>
          <NotificationBell />
        </div>

        {/* Active games */}
        {activeGames && activeGames.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Active Games
            </h2>
            <div className="mt-3 space-y-2">
              {activeGames.map((game) => {
                const oppId = game.player1_id === user.id ? game.player2_id : game.player1_id;
                const oppName = oppId === BOT_PLAYER_ID
                  ? `DartBot (${game.bot_level ?? ""})`
                  : nameMap[oppId] ?? "Player";
                const isYourTurn = game.current_player_id === user.id;

                return (
                  <Link
                    key={game.id}
                    href={`/game/${game.id}`}
                    className="flex items-center justify-between rounded-xl bg-zinc-800 px-4 py-3 transition-colors hover:bg-zinc-700"
                  >
                    <div>
                      <span className="text-sm font-medium">
                        {modeLabels[game.mode] ?? game.mode} vs {oppName}
                      </span>
                      <span className="ml-2 text-xs text-zinc-500">
                        R{game.current_round}
                      </span>
                    </div>
                    {isYourTurn ? (
                      <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold">
                        Your turn
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">Waiting...</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

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
