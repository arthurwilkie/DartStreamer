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
import { calculateGameStatsForPlayer } from "@/lib/game/stats";
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
  darts_at_double?: number | null;
  darts_for_checkout?: number | null;
}

export default function BroadcastPage() {
  const params = useParams();
  const gameId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [gameRow, setGameRow] = useState<GameRow | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [nicknames, setNicknames] = useState<Record<string, string | null>>({});

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
        .select("id, display_name, nickname")
        .in("id", [game.player1_id, game.player2_id]);

      const n: Record<string, string> = {};
      const nk: Record<string, string | null> = {};
      players?.forEach((p) => {
        n[p.id] =
          p.id === BOT_PLAYER_ID && game.bot_level != null
            ? `DartBot ${game.bot_level}`
            : p.display_name;
        nk[p.id] = p.nickname ?? null;
      });
      setNames(n);
      setNicknames(nk);

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
          state = applyScoreTurn(state, t.player_id, t.score_entered).newState;
        } else {
          state = applyTurn(state, t.player_id, darts).newState;
        }
        const last = state.turns[state.turns.length - 1];
        if (last) {
          last.dartsAtDouble = t.darts_at_double ?? null;
          last.dartsForCheckout = t.darts_for_checkout ?? null;
        }
      }
      setGameState(state);
    }
    load();
  }, [gameId, supabase]);

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
          let next;
          if (isX01State(prev) && (!darts || (darts as Dart[]).length === 0)) {
            next = applyScoreTurn(prev, t.player_id, t.score_entered).newState;
          } else {
            next = applyTurn(prev, t.player_id, darts).newState;
          }
          const last = next.turns[next.turns.length - 1];
          if (last) {
            last.dartsAtDouble = t.darts_at_double ?? null;
            last.dartsForCheckout = t.darts_for_checkout ?? null;
          }
          return next;
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
  const startingScore = state.startingScore;

  function liveStats(pid: string) {
    const turns = state.turns.filter((t) => t.playerId === pid);
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

  const p1Live = liveStats(p1Id);
  const p2Live = liveStats(p2Id);
  const p1Stats = calculateGameStatsForPlayer(
    state.turns,
    p1Id,
    gameRow.mode,
    gameRow.winner_id === p1Id,
    startingScore
  );
  const p2Stats = calculateGameStatsForPlayer(
    state.turns,
    p2Id,
    gameRow.mode,
    gameRow.winner_id === p2Id,
    startingScore
  );

  const isFinished = gameRow.status === "finished";
  const matchLabel =
    gameRow.match_format === "sets"
      ? `${startingScore} - BEST OF ${String(gameRow.target).toUpperCase()} SETS`
      : `${startingScore} - BEST OF ${numberWord(gameRow.target).toUpperCase()} LEGS`;

  const p1Legs = state.legsWon[p1Id] ?? 0;
  const p2Legs = state.legsWon[p2Id] ?? 0;
  const p1Sets = state.setsWon[p1Id] ?? 0;
  const p2Sets = state.setsWon[p2Id] ?? 0;
  const legSetLabel =
    gameRow.match_format === "sets"
      ? `Set ${state.currentSet} · Leg ${state.currentLeg}`
      : `Leg ${state.currentLeg}`;

  const winnerId = gameRow.winner_id;
  const headerLabel = (() => {
    if (!isFinished || !winnerId) return legSetLabel;
    const winCounts =
      gameRow.match_format === "sets"
        ? [p1Sets, p2Sets]
        : [p1Legs, p2Legs];
    const winnerCount = winnerId === p1Id ? winCounts[0] : winCounts[1];
    const loserCount = winnerId === p1Id ? winCounts[1] : winCounts[0];
    return `${names[winnerId] ?? "Winner"} wins ${winnerCount}-${loserCount}`;
  })();

  const activeId = isFinished ? null : state.currentPlayerId;

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
      <div
        className="relative origin-center bg-black"
        style={{ width: 1920, height: 1080, transform: "scale(var(--scale, 1))" }}
      >
        <BroadcastScaler />

        {/* Logo — top-left */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/dartstreamer-logo.png"
          alt="DartStreamer"
          className="absolute"
          style={{ left: 30, top: 40, width: 1120, height: "auto" }}
        />

        {/* Vertical divider */}
        <div
          className="absolute bg-zinc-800"
          style={{ left: 1220, top: 0, width: 6, height: 1080 }}
        />

        {/* Player 1 card */}
        <PlayerCard
          x={15}
          displayName={names[p1Id] ?? "Player 1"}
          nickname={nicknames[p1Id]}
          cameraX={30}
        />
        {/* Player 2 card */}
        <PlayerCard
          x={615}
          displayName={names[p2Id] ?? "Player 2"}
          nickname={nicknames[p2Id]}
          cameraX={630}
        />

        {/* Header row above scores */}
        <div
          className="absolute flex items-center justify-between text-zinc-400"
          style={{ left: 1250, top: 60, width: 650, height: 40 }}
        >
          <div className="text-[22px] font-bold tracking-widest text-white">
            {matchLabel}
          </div>
          <div
            className={`text-[18px] tracking-wide ${
              isFinished ? "font-bold text-emerald-400" : ""
            }`}
          >
            {headerLabel}
          </div>
        </div>

        {/* Score card — Bill (left/P1) */}
        <ScoreCard
          x={1250}
          name={names[p1Id] ?? "Player 1"}
          remaining={state.scores[p1Id]}
          avg={p1Live.avg}
          last={p1Live.last}
          darts={p1Live.darts}
          active={activeId === p1Id}
          legs={p1Legs}
          sets={p1Sets}
          showSets={gameRow.match_format === "sets"}
          isWinner={winnerId === p1Id}
        />
        {/* Score card — Arthur (right/P2) */}
        <ScoreCard
          x={1585}
          name={names[p2Id] ?? "Player 2"}
          remaining={state.scores[p2Id]}
          avg={p2Live.avg}
          last={p2Live.last}
          darts={p2Live.darts}
          active={activeId === p2Id}
          legs={p2Legs}
          sets={p2Sets}
          showSets={gameRow.match_format === "sets"}
          isWinner={winnerId === p2Id}
        />

        {/* Match Statistics panel */}
        <MatchStatsPanel
          p1Name={names[p1Id] ?? "Player 1"}
          p2Name={names[p2Id] ?? "Player 2"}
          p1={p1Stats}
          p2={p2Stats}
        />
      </div>
    </div>
  );
}

function numberWord(n: number): string {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  return words[n] ?? String(n);
}

function PlayerCard({
  x,
  displayName,
  nickname,
  cameraX,
}: {
  x: number;
  displayName: string;
  nickname: string | null;
  cameraX: number;
}) {
  return (
    <>
      <div
        className="absolute rounded-2xl bg-zinc-900"
        style={{ left: x, top: 240, width: 585, height: 820 }}
      />
      <div
        className="absolute rounded-[22px] bg-orange-500"
        style={{ left: cameraX, top: 255, width: 555, height: 555 }}
      />
      <div
        className="absolute flex flex-col items-center justify-start"
        style={{ left: x, top: 830, width: 585 }}
      >
        {nickname && (
          <div className="italic text-white" style={{ fontSize: 34, lineHeight: 1.1 }}>
            {nickname}
          </div>
        )}
        <div
          className="mt-1 text-center font-black text-white"
          style={{ fontSize: 64, lineHeight: 1.05 }}
        >
          {displayName}
        </div>
      </div>
    </>
  );
}

function ScoreCard({
  x,
  name,
  remaining,
  avg,
  last,
  darts,
  active,
  legs,
  sets,
  showSets,
  isWinner,
}: {
  x: number;
  name: string;
  remaining: number;
  avg: number;
  last: number | null;
  darts: number;
  active: boolean;
  legs: number;
  sets: number;
  showSets: boolean;
  isWinner: boolean;
}) {
  return (
    <div
      className={`absolute rounded-2xl bg-zinc-900 p-5 ${
        isWinner
          ? "ring-2 ring-emerald-400"
          : active
          ? "ring-2 ring-emerald-400"
          : ""
      }`}
      style={{ left: x, top: 110, width: 315, height: 290 }}
    >
      <div className="flex items-start justify-between">
        <div
          className={`text-[22px] font-semibold ${
            isWinner ? "text-emerald-400" : "text-white"
          }`}
        >
          {name}
          {isWinner && " \u2713"}
        </div>
        {active && !isWinner && (
          <div className="mt-2 h-3 w-3 rounded-full bg-emerald-400" />
        )}
      </div>
      <div className="mt-1 flex items-center gap-4 text-[15px] tracking-wider text-zinc-400">
        {showSets && (
          <span>
            SETS <span className="font-bold text-white">{sets}</span>
          </span>
        )}
        <span>
          LEGS <span className="font-bold text-white">{legs}</span>
        </span>
      </div>
      <div
        className="mt-1 font-black text-white"
        style={{ fontSize: 68, lineHeight: 1 }}
      >
        {remaining}
      </div>
      <div className="mt-3 space-y-1 text-[16px] text-zinc-400">
        <StatLine label="3-dart avg." value={avg.toFixed(2)} />
        <StatLine label="Last score" value={last != null ? String(last) : "—"} />
        <StatLine label="Darts thrown" value={String(darts)} />
      </div>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function MatchStatsPanel({
  p1Name,
  p2Name,
  p1,
  p2,
}: {
  p1Name: string;
  p2Name: string;
  p1: ReturnType<typeof calculateGameStatsForPlayer>;
  p2: ReturnType<typeof calculateGameStatsForPlayer>;
}) {
  return (
    <div
      className="absolute rounded-2xl bg-zinc-900 px-8 py-6"
      style={{ left: 1250, top: 420, width: 650, height: 640 }}
    >
      <div className="text-center text-[18px] font-semibold tracking-[0.25em] text-zinc-300">
        MATCH STATISTICS
      </div>

      <div className="mt-4 flex items-center border-b border-zinc-700 pb-3 text-[20px] font-bold">
        <div className="w-1/3 text-right pr-4 text-white">{p1Name}</div>
        <div className="w-1/3 text-center text-sm text-zinc-500">vs</div>
        <div className="w-1/3 pl-4 text-white">{p2Name}</div>
      </div>

      <StatBroadcastRow label="3-Dart Avg" v1={p1.threeDartAvg.toFixed(2)} v2={p2.threeDartAvg.toFixed(2)} />
      <StatBroadcastRow label="First 9 Avg" v1={p1.first9Avg.toFixed(2)} v2={p2.first9Avg.toFixed(2)} />
      <StatBroadcastRow label="High Checkout" v1={String(p1.highCheckout)} v2={String(p2.highCheckout)} />
      <StatBroadcastRow
        label="Checkout %"
        v1={p1.dartsAtDouble > 0 ? `${p1.checkoutsHit}/${p1.dartsAtDouble} (${p1.checkoutPct.toFixed(0)}%)` : "—"}
        v2={p2.dartsAtDouble > 0 ? `${p2.checkoutsHit}/${p2.dartsAtDouble} (${p2.checkoutPct.toFixed(0)}%)` : "—"}
      />
      <StatBroadcastRow label="180s" v1={String(p1.count180)} v2={String(p2.count180)} />
      <StatBroadcastRow label="120+" v1={String(p1.c120Plus)} v2={String(p2.c120Plus)} />
      <StatBroadcastRow label="100+" v1={String(p1.c100Plus)} v2={String(p2.c100Plus)} />
      <StatBroadcastRow label="80+" v1={String(p1.c80Plus)} v2={String(p2.c80Plus)} />
      <StatBroadcastRow label="60+" v1={String(p1.c60Plus)} v2={String(p2.c60Plus)} />
      <StatBroadcastRow label="40+" v1={String(p1.c40Plus)} v2={String(p2.c40Plus)} />
    </div>
  );
}

function StatBroadcastRow({
  label,
  v1,
  v2,
}: {
  label: string;
  v1: string;
  v2: string;
}) {
  return (
    <div className="flex items-center border-b border-zinc-800 py-[10px] text-[20px]">
      <div className="w-1/3 text-right pr-4 font-semibold text-white">{v1}</div>
      <div className="w-1/3 text-center text-[15px] text-zinc-500">{label}</div>
      <div className="w-1/3 pl-4 font-semibold text-white">{v2}</div>
    </div>
  );
}

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
