"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { subscribeToGame } from "@/lib/supabase/realtime";
import {
  type GameState,
  type Dart,
  type CricketDart,
  type GameMode,
  isX01State,
} from "@/lib/game/types";
import { createGameState, applyTurn, applyScoreTurn } from "@/lib/game/engine";
import { getCheckoutSuggestion } from "@/lib/game/rules/x01";
import { BOT_PLAYER_ID } from "@/lib/game/bot";

interface GameRow {
  id: string;
  mode: GameMode;
  player1_id: string;
  player2_id: string;
  current_player_id: string;
  status: string;
  winner_id: string | null;
  bot_level: number | null;
  match_format: "legs" | "sets";
  target: number;
  starting_score: number | null;
  in_mode: "straight" | "double" | "master";
  out_mode: "straight" | "double" | "master";
  leg_starter_id: string | null;
}

interface TurnRow {
  id: string;
  player_id: string;
  score_entered: number;
  darts_detail: Dart[] | CricketDart[] | [];
}

export default function BroadcastPage() {
  const params = useParams();
  const gameId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [gameRow, setGameRow] = useState<GameRow | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  // Initial load
  useEffect(() => {
    async function load() {
      const { data: game } = await supabase
        .from("games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (!game) return;
      setGameRow(game as GameRow);

      const { data: players } = await supabase
        .from("players")
        .select("id, display_name, avatar_url")
        .in("id", [game.player1_id, game.player2_id]);

      const n: Record<string, string> = {};
      const a: Record<string, string | null> = {};
      players?.forEach((p) => {
        n[p.id] =
          p.id === BOT_PLAYER_ID && game.bot_level != null
            ? `DartBot ${game.bot_level}`
            : p.display_name;
        a[p.id] = p.avatar_url;
      });
      setNames(n);
      setAvatars(a);

      const { data: turns } = await supabase
        .from("turns")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });

      let state = createGameState({
        id: game.id,
        mode: game.mode as GameMode,
        player1Id: game.player1_id,
        player2Id: game.player2_id,
        startingScore: game.starting_score ?? undefined,
        inMode: game.in_mode,
        outMode: game.out_mode,
        matchFormat: game.match_format,
        target: game.target,
        legStarterId: game.leg_starter_id ?? game.player1_id,
      });

      for (const t of turns ?? []) {
        const darts = t.darts_detail as Dart[] | CricketDart[];
        if (isX01State(state) && (!darts || (darts as Dart[]).length === 0)) {
          const { newState } = applyScoreTurn(state, t.player_id, t.score_entered);
          state = newState;
        } else {
          const { newState } = applyTurn(state, t.player_id, darts);
          state = newState;
        }
      }
      setGameState(state);
    }
    load();
  }, [gameId, supabase]);

  // Realtime updates
  useEffect(() => {
    if (!gameRow) return;
    const channel = subscribeToGame(
      supabase,
      gameId,
      (updated) => setGameRow((prev) => (prev ? { ...prev, ...updated } as GameRow : null)),
      (newTurn) => {
        const t = newTurn as unknown as TurnRow;
        setGameState((prev) => {
          if (!prev) return prev;
          const darts = t.darts_detail;
          if (isX01State(prev) && (!darts || (darts as Dart[]).length === 0)) {
            const { newState } = applyScoreTurn(prev, t.player_id, t.score_entered);
            return newState;
          }
          const { newState } = applyTurn(prev, t.player_id, darts);
          return newState;
        });
      }
    );
    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameRow?.id, supabase, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!gameRow || !gameState || !isX01State(gameState)) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-zinc-500">
        Loading broadcast…
      </div>
    );
  }

  const state = gameState;
  const p1Id = gameRow.player1_id;
  const p2Id = gameRow.player2_id;

  function playerStats(playerId: string) {
    const turns = state.turns.filter((t) => t.playerId === playerId);
    let darts = 0;
    let score = 0;
    for (const t of turns) {
      const details = t.dartsDetail as unknown[];
      const d = t.dartsForCheckout ?? (details && details.length > 0 ? details.length : 3);
      darts += d;
      score += t.scoreEntered;
    }
    const avg = darts > 0 ? (score / darts) * 3 : 0;
    const last = turns.length > 0 ? turns[turns.length - 1].scoreEntered : null;
    return { avg, last, darts };
  }

  const matchLabel =
    gameRow.match_format === "sets"
      ? `BEST OF ${gameRow.target} SETS`
      : `BEST OF ${gameRow.target} LEGS`;

  const inOutLabel = `${gameRow.in_mode.toUpperCase()}-IN ${gameRow.out_mode.toUpperCase()}-OUT`;

  const isFinished = gameRow.status === "finished";

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
      {/* Fixed 1920x1080 canvas for consistent capture */}
      <div
        className="relative origin-center"
        style={{
          width: 1920,
          height: 1080,
          transform: "scale(var(--scale, 1))",
        }}
      >
        <BroadcastScaler />

        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black" />

        {/* Header strip */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-12 py-8">
          <div>
            <div className="text-3xl font-black tracking-widest text-emerald-400">
              {gameRow.mode.toUpperCase()}
            </div>
            <div className="mt-1 text-sm font-medium tracking-[0.3em] text-zinc-500">
              {inOutLabel}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tracking-wider text-white">
              {matchLabel}
            </div>
            <div className="mt-1 text-sm tracking-widest text-zinc-400">
              {gameRow.match_format === "sets"
                ? `SET ${state.currentSet} · LEG ${state.currentLeg}`
                : `LEG ${state.currentLeg}`}
            </div>
          </div>
        </div>

        {/* Main content: two player panels */}
        <div className="absolute inset-x-12 top-48 bottom-32 grid grid-cols-2 gap-10">
          {[p1Id, p2Id].map((pid) => {
            const isActive = pid === state.currentPlayerId && !isFinished;
            const isWinner = gameRow.winner_id === pid;
            const remaining = state.scores[pid];
            const stats = playerStats(pid);
            const checkout =
              isActive && remaining <= 170
                ? getCheckoutSuggestion(remaining)
                : null;

            return (
              <div
                key={pid}
                className={`relative flex flex-col rounded-3xl border-2 p-10 transition-all ${
                  isWinner
                    ? "border-yellow-400 bg-yellow-500/10"
                    : isActive
                    ? "border-emerald-400 bg-emerald-500/5 shadow-[0_0_60px_rgba(16,185,129,0.25)]"
                    : "border-zinc-800 bg-zinc-900/60"
                }`}
              >
                {/* Avatar + name */}
                <div className="flex items-center gap-6">
                  {avatars[pid] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatars[pid] ?? ""}
                      alt=""
                      className="h-24 w-24 rounded-full border-2 border-zinc-700"
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800 text-4xl font-bold text-white">
                      {(names[pid] ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="text-4xl font-black text-white">
                      {names[pid] ?? "Player"}
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-2xl font-bold">
                      {gameRow.match_format === "sets" && (
                        <span className="text-zinc-400">
                          SETS{" "}
                          <span className="text-white">{state.setsWon[pid] ?? 0}</span>
                        </span>
                      )}
                      <span className="text-zinc-400">
                        LEGS{" "}
                        <span className="text-white">{state.legsWon[pid] ?? 0}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Big remaining score */}
                <div className="mt-12 flex flex-1 items-center justify-center">
                  <div
                    className={`text-[220px] font-black leading-none tracking-tighter ${
                      isActive ? "text-emerald-300" : "text-white"
                    }`}
                  >
                    {remaining}
                  </div>
                </div>

                {/* Checkout hint */}
                <div className="flex h-10 items-center justify-center">
                  {checkout && (
                    <div className="text-2xl font-bold tracking-widest text-amber-300">
                      {checkout}
                    </div>
                  )}
                </div>

                {/* Bottom stats row */}
                <div className="mt-8 grid grid-cols-3 gap-4 border-t border-zinc-800 pt-6 text-center">
                  <div>
                    <div className="text-xs tracking-widest text-zinc-500">AVG</div>
                    <div className="mt-1 text-3xl font-bold text-white">
                      {stats.avg.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs tracking-widest text-zinc-500">LAST</div>
                    <div className="mt-1 text-3xl font-bold text-white">
                      {stats.last ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs tracking-widest text-zinc-500">DARTS</div>
                    <div className="mt-1 text-3xl font-bold text-white">
                      {stats.darts}
                    </div>
                  </div>
                </div>

                {/* Needs double-in flag */}
                {state.inMode !== "straight" && !state.hasDoubledIn[pid] && (
                  <div className="absolute right-6 top-6 rounded-full bg-amber-500/20 px-4 py-1 text-sm font-bold tracking-wider text-amber-300">
                    NEEDS {state.inMode === "double" ? "DOUBLE" : "DOUBLE/TRIPLE"}-IN
                  </div>
                )}

                {isWinner && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-yellow-400 px-6 py-2 text-lg font-black tracking-widest text-black">
                    WINNER
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer strip */}
        <div className="absolute inset-x-12 bottom-0 flex items-center justify-between py-8 text-sm tracking-widest text-zinc-500">
          <div>ROUND {state.currentRound}</div>
          <div>
            {isFinished
              ? "MATCH COMPLETE"
              : `${names[state.currentPlayerId] ?? "Player"} TO THROW`}
          </div>
          <div>DARTSTREAMER</div>
        </div>
      </div>
    </div>
  );
}

// Auto-scales the 1920x1080 canvas to fit the viewport.
function BroadcastScaler() {
  useEffect(() => {
    function apply() {
      const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      document.documentElement.style.setProperty("--scale", scale.toString());
    }
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
  return null;
}
