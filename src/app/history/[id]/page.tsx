import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type GameMode, type Turn, type Dart, type CricketDart } from "@/lib/game/types";
import { calculateGameStatsForPlayer } from "@/lib/game/stats";
import { GameStatsDisplay } from "@/components/game/GameStatsDisplay";
import { TurnHistory } from "@/components/game/TurnHistory";
import { BOT_PLAYER_ID } from "@/lib/game/bot";

const MODE_LABELS: Record<string, string> = {
  "501": "501 SIDO",
  "301": "301 DIDO",
  cricket: "Cricket",
};

const START_SCORES: Record<string, number> = {
  "501": 501,
  "301": 301,
};

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gameId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();

  if (!game || game.status !== "finished") redirect("/history");

  // Verify user was in this game
  if (game.player1_id !== user.id && game.player2_id !== user.id) {
    redirect("/history");
  }

  const { data: turnRows } = await supabase
    .from("turns")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });

  // Load player names
  const { data: players } = await supabase
    .from("players")
    .select("id, display_name")
    .in("id", [game.player1_id, game.player2_id]);

  const nameMap: Record<string, string> = {};
  players?.forEach((p) => {
    if (p.id === BOT_PLAYER_ID && game.bot_level != null) {
      nameMap[p.id] = `DartBot (${game.bot_level})`;
    } else {
      nameMap[p.id] = p.display_name;
    }
  });

  // Convert DB turn rows to Turn type
  const turns: Turn[] = (turnRows ?? []).map((t) => ({
    id: t.id,
    gameId: t.game_id,
    playerId: t.player_id,
    roundNumber: t.round_number,
    legNumber: t.leg_number ?? 1,
    setNumber: t.set_number ?? 1,
    scoreEntered: t.score_entered,
    dartsDetail: t.darts_detail as Dart[] | CricketDart[],
    isEdited: t.is_edited,
    dartsAtDouble: t.darts_at_double ?? null,
    dartsForCheckout: t.darts_for_checkout ?? null,
  }));

  const mode = game.mode as GameMode;
  const p1Id = game.player1_id;
  const p2Id = game.player2_id;
  const winnerId = game.winner_id;

  const startingScore = game.starting_score ?? START_SCORES[mode] ?? 501;
  const p1Stats = calculateGameStatsForPlayer(turns, p1Id, mode, winnerId === p1Id, startingScore);
  const p2Stats = calculateGameStatsForPlayer(turns, p2Id, mode, winnerId === p2Id, startingScore);

  const won = game.winner_id === user.id;
  const opponentId = game.player1_id === user.id ? game.player2_id : game.player1_id;
  const date = game.finished_at
    ? new Date(game.finished_at).toLocaleDateString()
    : "";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-md px-4 py-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/history"
            className="text-sm text-zinc-400 hover:text-white"
          >
            &larr; History
          </Link>
          <span className="text-sm text-zinc-500">{date}</span>
        </div>

        {/* Result banner */}
        <div className="mb-4 rounded-xl bg-zinc-900 p-4 text-center">
          <div className="mb-1 text-xs uppercase tracking-wider text-zinc-500">
            {MODE_LABELS[mode] ?? mode}
          </div>
          <div className="flex items-center justify-center gap-3">
            <span
              className={`rounded px-2 py-0.5 text-xs font-bold ${
                won ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
              }`}
            >
              {won ? "WIN" : "LOSS"}
            </span>
            <span className="text-zinc-400">
              vs {nameMap[opponentId] ?? "Player"}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-4">
          <GameStatsDisplay
            player1={{
              name: nameMap[p1Id] ?? "Player 1",
              stats: p1Stats,
              isWinner: winnerId === p1Id,
            }}
            player2={{
              name: nameMap[p2Id] ?? "Player 2",
              stats: p2Stats,
              isWinner: winnerId === p2Id,
            }}
            mode={mode}
          />

          <TurnHistory
            turns={turns}
            player1Id={p1Id}
            player2Id={p2Id}
            player1Name={nameMap[p1Id] ?? "Player 1"}
            player2Name={nameMap[p2Id] ?? "Player 2"}
            mode={mode}
            startScore={START_SCORES[mode] ?? 0}
          />
        </div>
      </div>
    </div>
  );
}
