"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createBroadcastClient } from "@/lib/supabase/broadcast-client";
import { subscribeToGame } from "@/lib/supabase/realtime";
import {
  type GameState,
  type Dart,
  type CricketDart,
  type CricketGameState,
  type GameMode,
  isX01State,
  isCricketState,
  CRICKET_NUMBERS,
} from "@/lib/game/types";
import { createGameState, applyTurn, applyScoreTurn } from "@/lib/game/engine";
import { calculateGameStatsForPlayer } from "@/lib/game/stats";
import { BOT_PLAYER_ID } from "@/lib/game/bot";
import { ViewerPeer } from "@/lib/webrtc/peer";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  const searchParams = useSearchParams();
  const gameId = params.id as string;
  const renderToken = searchParams.get("t");
  const supabase = useMemo(
    () => (renderToken ? createBroadcastClient(renderToken) : createClient()),
    [renderToken]
  );

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

  if (!gameRow || !gameState) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-zinc-500">
        Loading broadcast…
      </div>
    );
  }

  if (isCricketState(gameState)) {
    return (
      <CricketBroadcast
        state={gameState}
        gameRow={gameRow}
        names={names}
        nicknames={nicknames}
        supabase={supabase}
      />
    );
  }

  if (!isX01State(gameState)) {
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
          playerId={p1Id}
          supabase={supabase}
        />
        {/* Player 2 card */}
        <PlayerCard
          x={615}
          displayName={names[p2Id] ?? "Player 2"}
          nickname={nicknames[p2Id]}
          cameraX={630}
          playerId={p2Id}
          supabase={supabase}
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
  playerId,
  supabase,
}: {
  x: number;
  displayName: string;
  nickname: string | null;
  cameraX: number;
  playerId: string;
  supabase: SupabaseClient;
}) {
  return (
    <>
      <div
        className="absolute rounded-2xl bg-zinc-900"
        style={{ left: x, top: 240, width: 585, height: 820 }}
      />
      <CameraFeed
        playerId={playerId}
        supabase={supabase}
        x={cameraX}
        y={255}
        size={555}
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

function CameraFeed({
  playerId,
  supabase,
  x,
  y,
  size,
}: {
  playerId: string;
  supabase: SupabaseClient;
  x: number;
  y: number;
  size: number;
}) {
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function lookup() {
      const { data } = await supabase
        .from("camera_pairings")
        .select("id, status")
        .eq("player_id", playerId)
        .eq("status", "paired")
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      setPairingId(data && data.length > 0 ? data[0].id : null);
    }
    void lookup();

    const channel = supabase
      .channel(`broadcast-camera:${playerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "camera_pairings",
          filter: `player_id=eq.${playerId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          setPairingId(row.status === "paired" ? row.id : null);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [playerId, supabase]);

  useEffect(() => {
    if (!pairingId) {
      setStream(null);
      return;
    }
    const peer = new ViewerPeer(supabase, pairingId);
    peer.onStream = (s) => setStream(s);
    return () => {
      peer.destroy();
      setStream(null);
    };
  }, [pairingId, supabase]);

  useEffect(() => {
    const v = videoRef.current;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      className="absolute overflow-hidden rounded-[22px] bg-black"
      style={{ left: x, top: y, width: size, height: size }}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/camera-not-connected.png"
          alt="Camera not connected"
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

/**
 * Full Cricket broadcast layout. Mirrors the X01 version but swaps the
 * per-player score pane and the right-side stats panel for Cricket-native
 * content (marks per round, last turn label, live board grid).
 */
function CricketBroadcast({
  state,
  gameRow,
  names,
  nicknames,
  supabase,
}: {
  state: CricketGameState;
  gameRow: GameRow;
  names: Record<string, string>;
  nicknames: Record<string, string | null>;
  supabase: SupabaseClient;
}) {
  const p1Id = gameRow.player1_id;
  const p2Id = gameRow.player2_id;
  const isFinished = gameRow.status === "finished";
  const winnerId = gameRow.winner_id;
  const activeId = isFinished ? null : state.currentPlayerId;

  const matchLabel =
    gameRow.match_format === "sets"
      ? `CRICKET · BEST OF ${String(gameRow.target).toUpperCase()} SETS`
      : `CRICKET · BEST OF ${numberWord(gameRow.target).toUpperCase()} LEGS`;

  const p1Legs = state.legsWon[p1Id] ?? 0;
  const p2Legs = state.legsWon[p2Id] ?? 0;
  const p1Sets = state.setsWon[p1Id] ?? 0;
  const p2Sets = state.setsWon[p2Id] ?? 0;

  const legSetLabel =
    gameRow.match_format === "sets"
      ? `Set ${state.currentSet} · Leg ${state.currentLeg}`
      : `Leg ${state.currentLeg}`;

  const headerLabel = (() => {
    if (!isFinished || !winnerId) return legSetLabel;
    const winCounts =
      gameRow.match_format === "sets" ? [p1Sets, p2Sets] : [p1Legs, p2Legs];
    const winnerCount = winnerId === p1Id ? winCounts[0] : winCounts[1];
    const loserCount = winnerId === p1Id ? winCounts[1] : winCounts[0];
    return `${names[winnerId] ?? "Winner"} wins ${winnerCount}-${loserCount}`;
  })();

  function cricketLive(pid: string) {
    const turns = state.turns.filter((t) => t.playerId === pid);
    let darts = 0;
    let marks = 0;
    for (const t of turns) {
      const details = (t.dartsDetail as CricketDart[] | undefined) ?? [];
      darts += details.length || 3;
      for (const d of details) marks += d.marks;
    }
    const rounds = turns.length;
    const marksPerRound = rounds > 0 ? marks / rounds : 0;
    const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
    const last = lastTurn
      ? formatCricketDarts(lastTurn.dartsDetail as CricketDart[])
      : null;
    return { marksPerRound, last, darts };
  }

  const p1Live = cricketLive(p1Id);
  const p2Live = cricketLive(p2Id);

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
      <div
        className="relative origin-center bg-black"
        style={{ width: 1920, height: 1080, transform: "scale(var(--scale, 1))" }}
      >
        <BroadcastScaler />

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/dartstreamer-logo.png"
          alt="DartStreamer"
          className="absolute"
          style={{ left: 30, top: 40, width: 1120, height: "auto" }}
        />

        <div
          className="absolute bg-zinc-800"
          style={{ left: 1220, top: 0, width: 6, height: 1080 }}
        />

        <PlayerCard
          x={15}
          displayName={names[p1Id] ?? "Player 1"}
          nickname={nicknames[p1Id]}
          cameraX={30}
          playerId={p1Id}
          supabase={supabase}
        />
        <PlayerCard
          x={615}
          displayName={names[p2Id] ?? "Player 2"}
          nickname={nicknames[p2Id]}
          cameraX={630}
          playerId={p2Id}
          supabase={supabase}
        />

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

        <CricketScoreCard
          x={1250}
          name={names[p1Id] ?? "Player 1"}
          points={state.players[p1Id]?.points ?? 0}
          marksPerRound={p1Live.marksPerRound}
          last={p1Live.last}
          darts={p1Live.darts}
          active={activeId === p1Id}
          legs={p1Legs}
          sets={p1Sets}
          showSets={gameRow.match_format === "sets"}
          isWinner={winnerId === p1Id}
        />
        <CricketScoreCard
          x={1585}
          name={names[p2Id] ?? "Player 2"}
          points={state.players[p2Id]?.points ?? 0}
          marksPerRound={p2Live.marksPerRound}
          last={p2Live.last}
          darts={p2Live.darts}
          active={activeId === p2Id}
          legs={p2Legs}
          sets={p2Sets}
          showSets={gameRow.match_format === "sets"}
          isWinner={winnerId === p2Id}
        />

        <CricketBoardPanel state={state} />
      </div>
    </div>
  );
}

function formatCricketDarts(darts: CricketDart[] | undefined): string {
  if (!darts || darts.length === 0) return "—";
  const parts = darts.map((d) => {
    if (d.marks <= 0 || d.number === 0) return "Miss";
    const prefix = d.marks === 1 ? "S" : d.marks === 2 ? "D" : "T";
    if (d.number === 25) return `${prefix}B`;
    return `${prefix}${d.number}`;
  });
  return parts.join(", ");
}

function CricketScoreCard({
  x,
  name,
  points,
  marksPerRound,
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
  points: number;
  marksPerRound: number;
  last: string | null;
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
          {isWinner && " ✓"}
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
        {points}
      </div>
      <div className="mt-3 space-y-1 text-[16px] text-zinc-400">
        <StatLine label="Marks per round" value={marksPerRound.toFixed(2)} />
        <StatLine label="Last score" value={last ?? "—"} />
        <StatLine label="Darts thrown" value={String(darts)} />
      </div>
    </div>
  );
}

/**
 * Broadcast-sized view-only Cricket board. Shows each number row with
 * Player 1 marks on the left, the number label in the middle, and Player 2
 * marks on the right. Rows closed by both players are dimmed.
 */
function CricketBoardPanel({ state }: { state: CricketGameState }) {
  const p1Id = state.player1Id;
  const p2Id = state.player2Id;
  return (
    <div
      className="absolute overflow-hidden rounded-2xl bg-zinc-900"
      style={{ left: 1250, top: 420, width: 650, height: 640 }}
    >
      <div className="flex h-full flex-col">
        {CRICKET_NUMBERS.map((num, idx) => {
          const p1Marks = state.players[p1Id]?.numbers[num]?.marks ?? 0;
          const p2Marks = state.players[p2Id]?.numbers[num]?.marks ?? 0;
          const bothClosed = p1Marks >= 3 && p2Marks >= 3;
          const label = num === 25 ? "BULL" : String(num);

          return (
            <div
              key={num}
              className={`grid flex-1 grid-cols-3 items-center ${
                idx < CRICKET_NUMBERS.length - 1 ? "border-b border-zinc-800" : ""
              } ${bothClosed ? "bg-zinc-900/60" : ""}`}
            >
              <div className="flex items-center justify-center">
                <BroadcastMark marks={p1Marks} side="left" dim={bothClosed} />
              </div>
              <div
                className={`text-center font-black ${
                  bothClosed ? "text-zinc-600" : "text-white"
                }`}
                style={{ fontSize: 52, lineHeight: 1 }}
              >
                {label}
              </div>
              <div className="flex items-center justify-center">
                <BroadcastMark marks={p2Marks} side="right" dim={bothClosed} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BroadcastMark({
  marks,
  side,
  dim,
}: {
  marks: number;
  side: "left" | "right";
  dim: boolean;
}) {
  const tone = dim ? "text-zinc-600" : "text-white";
  const closedTone = dim ? "border-zinc-600 text-zinc-500" : "border-emerald-400 text-emerald-400";

  if (marks <= 0)
    return <span className={tone} style={{ fontSize: 48 }}>&nbsp;</span>;
  if (marks === 1)
    return (
      <span className={`font-semibold ${tone}`} style={{ fontSize: 64 }}>
        /
      </span>
    );
  if (marks === 2)
    return (
      <span className={`font-semibold ${tone}`} style={{ fontSize: 64 }}>
        ✕
      </span>
    );

  const extras = marks - 3;
  const subscript =
    extras > 0 ? (
      <span
        className={`font-semibold ${dim ? "text-zinc-500" : "text-emerald-300"}`}
        style={{ fontSize: 24 }}
      >
        {extras}
      </span>
    ) : null;

  const glyph = (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: 60, height: 60 }}
    >
      <span className={`absolute inset-0 rounded-full border-4 ${closedTone}`} />
      <span
        className={`relative font-bold ${dim ? "text-zinc-500" : "text-emerald-400"}`}
        style={{ fontSize: 36 }}
      >
        ✕
      </span>
    </span>
  );

  if (!subscript) return glyph;
  return (
    <span className="inline-flex items-end gap-1">
      {side === "right" ? subscript : null}
      {glyph}
      {side === "left" ? subscript : null}
    </span>
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
