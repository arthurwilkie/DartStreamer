"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type GameMode } from "@/lib/game/types";
import { BOT_PLAYER_ID, BOT_LEVEL_NAMES } from "@/lib/game/bot";
import { useSession } from "@/lib/session/SessionContext";

const MODES: { value: GameMode; label: string; desc: string }[] = [
  { value: "501", label: "501", desc: "Single-In Double-Out" },
  { value: "301", label: "301", desc: "Double-In Double-Out" },
  { value: "cricket", label: "Cricket", desc: "Close 15-20 & Bull" },
];

interface PlayerInfo {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export default function NewGamePage() {
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<GameMode>("501");
  const [opponentType, setOpponentType] = useState<"bot" | "player">("bot");
  const [botLevel, setBotLevel] = useState(4);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);
  const { activeSession } = useSession();

  // Listen for game invite acceptance — navigate to the created game
  useEffect(() => {
    if (!inviteSent || !userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel("game-invite-response")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_invites",
          filter: `from_player_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as { status: string; id: string };
          if (row.status === "accepted") {
            // Find the game that was just created
            const { data: games } = await supabase
              .from("games")
              .select("id")
              .eq("player1_id", userId)
              .eq("status", "active")
              .order("created_at", { ascending: false })
              .limit(1);

            if (games && games.length > 0) {
              router.push(`/game/${games[0].id}`);
            }
          } else if (row.status === "declined") {
            setInviteSent(false);
            setError("Your invite was declined.");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [inviteSent, userId, router]);

  useEffect(() => {
    async function loadPlayers() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from("players")
        .select("id, display_name, avatar_url")
        .neq("id", user.id)
        .neq("id", BOT_PLAYER_ID);

      if (data) setPlayers(data);
    }
    loadPlayers();
  }, []);

  async function createGame() {
    setLoading(true);
    setError(null);

    if (opponentType === "bot") {
      // Bot games are created directly
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: selectedMode,
          botLevel,
          sessionId: activeSession?.id ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }

      router.push(`/game/${data.id}`);
    } else {
      // Human opponents get an invite
      if (!selectedPlayer) {
        setError("Select a player to challenge");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/invites/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toPlayerId: selectedPlayer,
          gameMode: selectedMode,
          sessionId: activeSession?.id ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setInviteSent(true);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">New Game</h1>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-zinc-400 hover:text-white"
          >
            Back
          </button>
        </div>

        {/* Game mode selection */}
        <p className="mt-4 text-sm text-zinc-400">Game mode</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => setSelectedMode(mode.value)}
              className={`rounded-xl p-3 text-center transition-colors ${
                selectedMode === mode.value
                  ? "bg-emerald-900/30 ring-2 ring-emerald-500"
                  : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              <div className="text-lg font-bold">{mode.label}</div>
              <div className="text-xs text-zinc-400">{mode.desc}</div>
            </button>
          ))}
        </div>

        {/* Opponent type tabs */}
        <div className="mt-6 flex rounded-lg bg-zinc-800 p-1">
          <button
            onClick={() => setOpponentType("bot")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              opponentType === "bot"
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Play vs Bot
          </button>
          <button
            onClick={() => setOpponentType("player")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              opponentType === "player"
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Play vs Player
          </button>
        </div>

        {/* Bot settings */}
        {opponentType === "bot" && (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Bot Level</span>
              <span className="text-sm font-medium text-emerald-400">
                {botLevel} — {BOT_LEVEL_NAMES[botLevel]}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={botLevel}
              onChange={(e) => setBotLevel(parseInt(e.target.value))}
              className="mt-2 w-full accent-emerald-500"
            />
            <div className="mt-1 flex justify-between text-xs text-zinc-500">
              <span>1</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>
        )}

        {/* Player selection */}
        {opponentType === "player" && (
          <div className="mt-4">
            <p className="text-sm text-zinc-400">Select opponent</p>
            {players.length === 0 ? (
              <p className="mt-3 text-center text-sm text-zinc-500">
                No other players registered yet.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {players.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayer(p.id)}
                    className={`flex w-full items-center gap-3 rounded-xl p-3 transition-colors ${
                      selectedPlayer === p.id
                        ? "bg-emerald-900/30 ring-2 ring-emerald-500"
                        : "bg-zinc-800 hover:bg-zinc-700"
                    }`}
                  >
                    {p.avatar_url ? (
                      <img
                        src={p.avatar_url}
                        alt=""
                        className="h-10 w-10 rounded-full"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold">
                        {p.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium">{p.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {inviteSent ? (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-900/20 py-4">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <p className="text-sm font-medium text-emerald-300">
                Invite sent! Waiting for{" "}
                {players.find((p) => p.id === selectedPlayer)?.display_name ??
                  "opponent"}
                ...
              </p>
            </div>
            <button
              onClick={() => {
                setInviteSent(false);
                setSelectedPlayer(null);
              }}
              className="w-full rounded-xl border border-zinc-700 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={createGame}
            disabled={loading || (opponentType === "player" && !selectedPlayer)}
            className="mt-6 w-full rounded-xl bg-emerald-600 py-4 text-lg font-bold transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading
              ? opponentType === "bot"
                ? "Creating..."
                : "Sending invite..."
              : opponentType === "bot"
              ? `Start vs DartBot (${botLevel})`
              : "Send Game Invite"}
          </button>
        )}
      </div>
    </div>
  );
}
