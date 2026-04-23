"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { subscribeToGame } from "@/lib/supabase/realtime";
import {
  type GameState,
  type Dart,
  type CricketDart,
  type GameMode,
  isX01State,
  isCricketState,
} from "@/lib/game/types";
import {
  createGameState,
  applyTurn,
  applyScoreTurn,
  isGameOver,
} from "@/lib/game/engine";
import { DartInput } from "@/components/scoring/DartInput";
import { CricketInput } from "@/components/scoring/CricketInput";
import { X01Scoreboard } from "@/components/scoreboard/X01Scoreboard";
import { CricketScoreboard } from "@/components/scoreboard/CricketScoreboard";
import { TurnIndicator } from "@/components/scoreboard/TurnIndicator";
import { EditScore } from "@/components/scoring/EditScore";
import { PostGameResults } from "@/components/game/PostGameResults";
import { BOT_PLAYER_ID, generateBotScore, generateBotCricketTurn } from "@/lib/game/bot";
import { shouldShowDartsAtDoublePopup, getDartsAtDoubleOptions, getMinDartsToFinish } from "@/lib/game/checkouts";
import { DartsAtDoublePopup } from "@/components/scoring/DartsAtDoublePopup";
import { CameraStatusIcon } from "@/components/game/CameraStatusIcon";
import { StreamControlButton } from "@/components/game/StreamControlButton";
import { DeviceCameraPopup } from "@/components/game/DeviceCameraPopup";
import { ExternalCameraPopup } from "@/components/game/ExternalCameraPopup";
import { OpponentCameraFeed } from "@/components/game/OpponentCameraFeed";
import { useSession } from "@/lib/session/SessionContext";
import { ViewerPeer } from "@/lib/webrtc/peer";
import { useWakeLock } from "@/lib/hooks/useWakeLock";

interface GameRow {
  id: string;
  mode: GameMode;
  player1_id: string;
  player2_id: string;
  current_player_id: string;
  current_round: number;
  status: string;
  winner_id: string | null;
  bot_level: number | null;
  match_format: "legs" | "sets";
  target: number;
  starting_score: number | null;
  in_mode: "straight" | "double" | "master";
  out_mode: "straight" | "double" | "master";
  current_leg: number;
  current_set: number;
  leg_starter_id: string | null;
}

interface TurnRow {
  id: string;
  game_id: string;
  player_id: string;
  round_number: number;
  score_entered: number;
  darts_detail: Dart[] | CricketDart[] | [];
  is_edited: boolean;
  darts_at_double?: number | null;
  darts_for_checkout?: number | null;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;

  useWakeLock();

  // Best-effort portrait lock — only works in fullscreen / installed PWAs.
  useEffect(() => {
    const orientation = (screen as Screen & {
      orientation?: { lock?: (o: string) => Promise<void> };
    }).orientation;
    orientation?.lock?.("portrait").catch(() => {
      // Silently ignored: lock isn't allowed outside of fullscreen/PWA.
    });
  }, []);

  const [userId, setUserId] = useState<string | null>(null);
  const [gameRow, setGameRow] = useState<GameRow | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const botPlayingRef = useRef(false);
  const [pendingScore, setPendingScore] = useState<number | null>(null);
  const [pendingCheckedOut, setPendingCheckedOut] = useState(false);
  const [dartsAtDoubleOptions, setDartsAtDoubleOptions] = useState<number[]>([]);
  const [showDartsAtDoublePopup, setShowDartsAtDoublePopup] = useState(false);
  const [deviceCameraOpen, setDeviceCameraOpen] = useState(false);
  const [externalCameraOpen, setExternalCameraOpen] = useState(false);
  const [opponentPairingId, setOpponentPairingId] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [rtcState, setRtcState] = useState<RTCPeerConnectionState | "idle">("idle");
  const viewerPeerRef = useRef<ViewerPeer | null>(null);

  useSession(); // keep provider active for presence tracking
  const supabase = createClient();

  const isBotGame = gameRow?.bot_level != null;

  // Load game data
  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      // Load game
      const { data: game } = await supabase
        .from("games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (!game) {
        router.push("/");
        return;
      }

      setGameRow(game as GameRow);

      // Load player names
      const { data: players } = await supabase
        .from("players")
        .select("id, display_name")
        .in("id", [game.player1_id, game.player2_id]);

      const names: Record<string, string> = {};
      players?.forEach((p) => {
        if (p.id === BOT_PLAYER_ID && game.bot_level != null) {
          names[p.id] = `DartBot (${game.bot_level})`;
        } else {
          names[p.id] = p.display_name;
        }
      });
      setPlayerNames(names);

      // Load turns and rebuild state
      const { data: turns } = await supabase
        .from("turns")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });

      // Rebuild game state from turns
      const config = {
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
      };

      let state = createGameState(config);

      if (turns) {
        for (const turn of turns) {
          const darts = turn.darts_detail as Dart[] | CricketDart[];
          // Score-only turns (X01 turn-based entry) have empty dartsDetail
          if (isX01State(state) && (!darts || (darts as Dart[]).length === 0)) {
            const { newState } = applyScoreTurn(state, turn.player_id, turn.score_entered);
            state = newState;
          } else {
            const { newState } = applyTurn(state, turn.player_id, darts);
            state = newState;
          }
          // Engine doesn't know about checkout metadata — inject from DB row
          const last = state.turns[state.turns.length - 1];
          if (last) {
            last.dartsAtDouble = turn.darts_at_double ?? null;
            last.dartsForCheckout = turn.darts_for_checkout ?? null;
          }
        }
      }

      setGameState(state);
    }

    load();
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to realtime updates (only for human vs human games)
  useEffect(() => {
    if (!gameRow || isBotGame) return;

    const channel = subscribeToGame(
      supabase,
      gameId,
      (updatedGame) => {
        setGameRow((prev) =>
          prev ? { ...prev, ...updatedGame } as GameRow : null
        );
      },
      (newTurn) => {
        const turn = newTurn as unknown as TurnRow;
        if (turn.player_id === userId) return;

        setGameState((prev) => {
          if (!prev) return prev;
          const darts = turn.darts_detail;
          let next;
          if (isX01State(prev) && (!darts || (darts as Dart[]).length === 0)) {
            next = applyScoreTurn(prev, turn.player_id, turn.score_entered).newState;
          } else {
            next = applyTurn(prev, turn.player_id, darts).newState;
          }
          const last = next.turns[next.turns.length - 1];
          if (last) {
            last.dartsAtDouble = turn.darts_at_double ?? null;
            last.dartsForCheckout = turn.darts_for_checkout ?? null;
          }
          return next;
        });
      }
    );

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameRow?.id, userId, isBotGame]); // eslint-disable-line react-hooks/exhaustive-deps

  // Look up opponent's active camera pairing
  useEffect(() => {
    if (!gameRow || !userId || isBotGame) return;

    const oppId =
      gameRow.player1_id === userId ? gameRow.player2_id : gameRow.player1_id;

    async function lookupPairing() {
      const { data } = await supabase
        .from("camera_pairings")
        .select("id, status")
        .eq("player_id", oppId)
        .eq("status", "paired")
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setOpponentPairingId(data[0].id);
      }
    }

    void lookupPairing();

    // Subscribe to opponent's pairing changes
    const channel = supabase
      .channel(`opp-camera:${oppId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "camera_pairings",
          filter: `player_id=eq.${oppId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row.status === "paired") {
            setOpponentPairingId(row.id);
          } else {
            setOpponentPairingId(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameRow?.id, userId, isBotGame]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manage ViewerPeer lifecycle — create when opponent has a paired camera, destroy when not
  useEffect(() => {
    if (!opponentPairingId) return;

    const peer = new ViewerPeer(supabase, opponentPairingId);
    viewerPeerRef.current = peer;

    peer.onStream = (stream) => {
      setRemoteStream(stream);
    };

    peer.onConnectionState = (state) => {
      setRtcState(state);
    };

    return () => {
      peer.destroy();
      viewerPeerRef.current = null;
      setRemoteStream(null);
      setRtcState("idle");
    };
  }, [opponentPairingId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bot auto-play: submit a bot turn to the server and apply locally
  const playBotTurn = useCallback(
    async (currentState: GameState): Promise<GameState> => {
      if (!gameRow || !isX01State(currentState)) return currentState;

      const botLevel = gameRow.bot_level!;
      const x01State = currentState as import("@/lib/game/types").X01GameState;
      const botRemaining = x01State.scores[BOT_PLAYER_ID];
      const botScore = generateBotScore(botLevel, botRemaining);

      // Apply locally
      const { newState, result } = applyScoreTurn(currentState, BOT_PLAYER_ID, botScore);

      const scoreEntered = botScore;
      const newX01State = newState as import("@/lib/game/types").X01GameState;
      const actualRemaining = newX01State.scores[BOT_PLAYER_ID];
      const wasBust = actualRemaining === botRemaining && botScore > 0;
      const turnScore = wasBust ? 0 : scoreEntered;
      const x01Res = result as import("@/lib/game/rules/x01").X01TurnResult;

      // Persist to server
      await fetch(`/api/games/${gameId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: BOT_PLAYER_ID,
          scoreEntered: turnScore,
          dartsDetail: [],
          roundNumber: currentState.currentRound,
          legNumber: x01State.currentLeg,
          setNumber: x01State.currentSet,
          legEnded: x01Res.legEnded,
          legWinnerId: x01Res.legWinnerId,
          setEnded: x01Res.setEnded,
          setWinnerId: x01Res.setWinnerId,
          matchOver: x01Res.matchOver,
          matchWinnerId: x01Res.matchWinnerId,
          nextPlayerId: newX01State.currentPlayerId,
          nextRound: newX01State.currentRound,
          nextLeg: newX01State.currentLeg,
          nextSet: newX01State.currentSet,
        }),
      });

      return newState;
    },
    [gameRow, gameId]
  );

  // Finish game helper
  const finishGame = useCallback(
    async (winnerId: string) => {
      await fetch(`/api/games/${gameId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winnerId }),
      });
      setGameRow((prev) =>
        prev ? { ...prev, status: "finished", winner_id: winnerId } : null
      );
    },
    [gameId]
  );

  const commitX01Turn = useCallback(
    async (score: number, dartsAtDouble?: number, dartsForCheckout?: number) => {
      if (!gameState || !userId || !gameRow) return;
      if (!isX01State(gameState)) return;

      setSubmitting(true);

      // Apply human turn locally
      const { newState, result } = applyScoreTurn(gameState, userId, score);
      const lastTurn = newState.turns[newState.turns.length - 1];
      if (lastTurn) {
        lastTurn.dartsAtDouble = dartsAtDouble ?? null;
        lastTurn.dartsForCheckout = dartsForCheckout ?? null;
      }
      setGameState(newState);

      const scoreEntered = result && "scoreDeducted" in result
        ? (result.bust ? 0 : result.scoreDeducted)
        : 0;

      const x01Res = result as import("@/lib/game/rules/x01").X01TurnResult;
      const x01NewState = newState as import("@/lib/game/types").X01GameState;

      // Persist human turn
      await fetch(`/api/games/${gameId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoreEntered,
          dartsDetail: [],
          roundNumber: gameState.currentRound,
          legNumber: (gameState as import("@/lib/game/types").X01GameState).currentLeg,
          setNumber: (gameState as import("@/lib/game/types").X01GameState).currentSet,
          legEnded: x01Res.legEnded,
          legWinnerId: x01Res.legWinnerId,
          setEnded: x01Res.setEnded,
          setWinnerId: x01Res.setWinnerId,
          matchOver: x01Res.matchOver,
          matchWinnerId: x01Res.matchWinnerId,
          nextPlayerId: x01NewState.currentPlayerId,
          nextRound: x01NewState.currentRound,
          nextLeg: x01NewState.currentLeg,
          nextSet: x01NewState.currentSet,
          ...(dartsAtDouble != null ? { dartsAtDouble } : {}),
          ...(dartsForCheckout != null ? { dartsForCheckout } : {}),
        }),
      });

      // Check for match over after human turn
      let gameOverResult = isGameOver(newState);
      if (gameOverResult.over && gameOverResult.winnerId) {
        setGameRow((prev) =>
          prev ? { ...prev, status: "finished", winner_id: gameOverResult.winnerId! } : null
        );
        setSubmitting(false);
        return;
      }

      // Bot auto-play
      if (isBotGame && !botPlayingRef.current) {
        botPlayingRef.current = true;

        // Small delay for realism
        await new Promise((r) => setTimeout(r, 600));

        const stateAfterBot = await playBotTurn(newState);
        setGameState(stateAfterBot);

        // Check for match over after bot turn
        gameOverResult = isGameOver(stateAfterBot);
        if (gameOverResult.over && gameOverResult.winnerId) {
          setGameRow((prev) =>
            prev ? { ...prev, status: "finished", winner_id: gameOverResult.winnerId! } : null
          );
        }

        botPlayingRef.current = false;
      }

      setSubmitting(false);
    },
    [gameState, userId, gameRow, gameId, isBotGame, playBotTurn, finishGame]
  );

  const handleX01Submit = useCallback(
    (score: number) => {
      if (!gameState || !userId || !gameRow || submitting) return;
      if (!isX01State(gameState)) return;

      const remaining = gameState.scores[userId];
      const newRemaining = remaining - score;
      const checkedOut = newRemaining === 0;
      const isBust =
        newRemaining < 0 ||
        (gameState.outMode !== "straight" && newRemaining === 1);
      const min = getMinDartsToFinish(remaining);

      // Check if we need the darts-at-double popup
      if (shouldShowDartsAtDoublePopup(remaining)) {
        const options = getDartsAtDoubleOptions(remaining, checkedOut);
        setPendingScore(score);
        setPendingCheckedOut(checkedOut);
        setDartsAtDoubleOptions(options);
        setShowDartsAtDoublePopup(true);
        return;
      }

      // 3-dart-only finish: implied 1 attempt at a double
      if (min === 3 && checkedOut) {
        commitX01Turn(score, 1, 3);
        return;
      }

      // 3-dart-only finish that busted: player may have attempted a double
      if (min === 3 && isBust) {
        setPendingScore(score);
        setPendingCheckedOut(false);
        setDartsAtDoubleOptions([0, 1]);
        setShowDartsAtDoublePopup(true);
        return;
      }

      commitX01Turn(score);
    },
    [gameState, userId, gameRow, submitting, commitX01Turn]
  );

  const handleDartsAtDoubleConfirm = useCallback(
    (dartsAtDouble: number, dartsForCheckout?: number) => {
      setShowDartsAtDoublePopup(false);
      if (pendingScore !== null) {
        commitX01Turn(pendingScore, dartsAtDouble, dartsForCheckout);
        setPendingScore(null);
      }
    },
    [pendingScore, commitX01Turn]
  );

  const playBotCricketTurn = useCallback(
    async (currentState: GameState): Promise<GameState> => {
      if (!gameRow || !isCricketState(currentState)) return currentState;

      const botLevel = gameRow.bot_level!;
      const botDarts = generateBotCricketTurn(botLevel, currentState, BOT_PLAYER_ID);

      const { newState, result } = applyTurn(currentState, BOT_PLAYER_ID, botDarts);
      const cricketResult = result as import("@/lib/game/rules/cricket").CricketTurnResult;
      const totalMarks = botDarts.reduce((sum, d) => sum + d.marks, 0);
      const nextCricket = newState as import("@/lib/game/types").CricketGameState;

      await fetch(`/api/games/${gameId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: BOT_PLAYER_ID,
          scoreEntered: totalMarks + cricketResult.pointsScored,
          dartsDetail: botDarts,
          roundNumber: currentState.currentRound,
          legNumber: (currentState as import("@/lib/game/types").CricketGameState).currentLeg,
          setNumber: (currentState as import("@/lib/game/types").CricketGameState).currentSet,
          legEnded: cricketResult.legEnded,
          legWinnerId: cricketResult.legWinnerId,
          setEnded: cricketResult.setEnded,
          setWinnerId: cricketResult.setWinnerId,
          matchOver: cricketResult.matchOver,
          matchWinnerId: cricketResult.matchWinnerId,
          nextPlayerId: nextCricket.currentPlayerId,
          nextRound: nextCricket.currentRound,
          nextLeg: nextCricket.currentLeg,
          nextSet: nextCricket.currentSet,
        }),
      });

      return newState;
    },
    [gameRow, gameId]
  );

  const handleCricketSubmit = useCallback(
    async (darts: CricketDart[]) => {
      if (!gameState || !userId || !gameRow || submitting) return;
      if (!isCricketState(gameState)) return;

      setSubmitting(true);

      const { newState, result } = applyTurn(gameState, userId, darts);
      setGameState(newState);

      const cricketResult = result as import("@/lib/game/rules/cricket").CricketTurnResult;
      const totalMarks = darts.reduce((sum, d) => sum + d.marks, 0);
      const nextCricket = newState as import("@/lib/game/types").CricketGameState;
      const prevCricket = gameState as import("@/lib/game/types").CricketGameState;

      await fetch(`/api/games/${gameId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoreEntered: totalMarks + cricketResult.pointsScored,
          dartsDetail: darts,
          roundNumber: gameState.currentRound,
          legNumber: prevCricket.currentLeg,
          setNumber: prevCricket.currentSet,
          legEnded: cricketResult.legEnded,
          legWinnerId: cricketResult.legWinnerId,
          setEnded: cricketResult.setEnded,
          setWinnerId: cricketResult.setWinnerId,
          matchOver: cricketResult.matchOver,
          matchWinnerId: cricketResult.matchWinnerId,
          nextPlayerId: nextCricket.currentPlayerId,
          nextRound: nextCricket.currentRound,
          nextLeg: nextCricket.currentLeg,
          nextSet: nextCricket.currentSet,
        }),
      });

      let gameOverResult = isGameOver(newState);
      if (gameOverResult.over && gameOverResult.winnerId) {
        setGameRow((prev) =>
          prev ? { ...prev, status: "finished", winner_id: gameOverResult.winnerId! } : null
        );
        setSubmitting(false);
        return;
      }

      // Bot auto-play for Cricket
      if (isBotGame && !botPlayingRef.current) {
        botPlayingRef.current = true;
        await new Promise((r) => setTimeout(r, 600));
        const stateAfterBot = await playBotCricketTurn(newState);
        setGameState(stateAfterBot);

        gameOverResult = isGameOver(stateAfterBot);
        if (gameOverResult.over && gameOverResult.winnerId) {
          setGameRow((prev) =>
            prev ? { ...prev, status: "finished", winner_id: gameOverResult.winnerId! } : null
          );
        }
        botPlayingRef.current = false;
      }

      setSubmitting(false);
    },
    [gameState, userId, gameRow, gameId, submitting, isBotGame, playBotCricketTurn]
  );

  const handleEditConfirm = useCallback(() => {
    if (!gameState) return;
    setEditModalOpen(false);
  }, [gameState]);

  if (!gameState || !gameRow || !userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-zinc-400">Loading game...</div>
      </div>
    );
  }

  const isYourTurn = gameState.currentPlayerId === userId;
  const currentPlayerName =
    playerNames[gameState.currentPlayerId] ?? "Player";
  const isFinished = gameRow.status === "finished";

  // Get last turn for edit
  const lastTurn = gameState.turns.length > 0
    ? gameState.turns[gameState.turns.length - 1]
    : null;

  // Should we show opponent camera feed?
  const showOpponentCamera =
    !isFinished &&
    !isYourTurn &&
    !isBotGame &&
    opponentPairingId !== null;

  const opponentId = gameRow
    ? gameRow.player1_id === userId
      ? gameRow.player2_id
      : gameRow.player1_id
    : null;
  const opponentName = opponentId ? playerNames[opponentId] ?? "Opponent" : "Opponent";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Mobile landscape nudge — covers content and asks user to rotate. */}
      <div className="fixed inset-0 z-[60] hidden items-center justify-center bg-zinc-950 text-center landscape-nudge">
        <div className="px-6">
          <div className="text-5xl">📱</div>
          <p className="mt-3 text-lg font-semibold text-white">
            Please rotate your device
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            DartStreamer games are designed for portrait view.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 py-2">
        {/* Top bar: stream controls + broadcast link + camera status */}
        {!isFinished && (
          <div className="flex items-center justify-end gap-3">
            {!isBotGame && <StreamControlButton gameId={gameId} />}
            <a
              href={`/broadcast/${gameId}`}
              target="_blank"
              rel="noopener"
              className="rounded-lg border border-zinc-700 px-3 py-1 text-xs font-semibold tracking-wider text-zinc-300 hover:border-emerald-500 hover:text-emerald-400"
            >
              BROADCAST
            </a>
            {!isBotGame && (
              <CameraStatusIcon
                onOpenDeviceCamera={() => setDeviceCameraOpen(true)}
                onOpenExternalCamera={() => setExternalCameraOpen(true)}
              />
            )}
          </div>
        )}

        {/* Game finished: stats + turn history */}
        {isFinished && gameState && (() => {
          const p1Id = gameState.turns.length > 0
            ? gameState.turns[0].playerId
            : Object.keys(playerNames)[0];
          const p2Id = Object.keys(playerNames).find((id) => id !== p1Id) ?? "";
          const winnerId = gameRow.winner_id;
          const startScore = isX01State(gameState) ? gameState.startingScore : 0;

          return (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-900/30 p-4 text-center">
                <div className="text-lg font-bold text-emerald-300">
                  Game Over!
                </div>
                <div className="text-sm text-zinc-400">
                  {winnerId === userId
                    ? "You won!"
                    : `${playerNames[winnerId ?? ""] ?? "Opponent"} wins!`}
                </div>
                <button
                  onClick={() => router.push("/")}
                  className="mt-3 rounded-lg bg-zinc-800 px-6 py-2 text-sm transition-colors hover:bg-zinc-700"
                >
                  Back to Home
                </button>
              </div>

              <PostGameResults
                turns={gameState.turns}
                player1Id={p1Id}
                player2Id={p2Id}
                player1Name={playerNames[p1Id] ?? "Player 1"}
                player2Name={playerNames[p2Id] ?? "Player 2"}
                winnerId={winnerId}
                mode={gameState.mode}
                startScore={startScore}
              />
            </div>
          );
        })()}

        {/* Turn indicator */}
        {!isFinished && (
          <TurnIndicator
            currentPlayerName={currentPlayerName}
            isYourTurn={isYourTurn}
            round={gameState.currentRound}
          />
        )}

        {/* Scoreboard */}
        <div className="mt-2">
          {isX01State(gameState) && (
            <X01Scoreboard
              state={gameState}
              playerNames={playerNames}
              currentUserId={userId}
            />
          )}
          {isCricketState(gameState) && (
            <CricketScoreboard
              state={gameState}
              playerNames={playerNames}
              currentUserId={userId}
            />
          )}
        </div>

        {/* Score input OR opponent camera feed */}
        {!isFinished && (
          <div className="mt-2">
            {showOpponentCamera ? (
              <OpponentCameraFeed
                opponentName={opponentName}
                stream={remoteStream}
                connectionState={rtcState}
              />
            ) : (
              <>
                {isX01State(gameState) && (
                  <DartInput
                    onSubmit={handleX01Submit}
                    remainingScore={gameState.scores[userId]}
                    disabled={!isYourTurn || submitting}
                  />
                )}
                {isCricketState(gameState) && (() => {
                  // Mirror the scoreboard: player1 is always on the left,
                  // player2 always on the right, regardless of whose device
                  // we're rendering on.
                  const leftId = gameState.player1Id;
                  const rightId = gameState.player2Id;
                  const activeSide: "left" | "right" =
                    gameState.currentPlayerId === leftId ? "left" : "right";
                  return (
                    <CricketInput
                      onSubmit={handleCricketSubmit}
                      disabled={!isYourTurn || submitting}
                      leftPlayerState={gameState.players[leftId]}
                      rightPlayerState={gameState.players[rightId]}
                      activeSide={activeSide}
                    />
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Edit Last Turn entrypoint is intentionally hidden for now — the
            modal and state remain wired so a future UI can reopen it. */}

        <EditScore
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onConfirmEdit={handleEditConfirm}
          lastTurnDarts={lastTurn?.dartsDetail ?? null}
          lastTurnScore={lastTurn?.scoreEntered ?? 0}
          mode={gameState.mode}
        />

        <DartsAtDoublePopup
          isOpen={showDartsAtDoublePopup}
          options={dartsAtDoubleOptions}
          checkedOut={pendingCheckedOut}
          outMode={isX01State(gameState) ? gameState.outMode : "double"}
          onConfirm={handleDartsAtDoubleConfirm}
        />

        <DeviceCameraPopup
          isOpen={deviceCameraOpen}
          onClose={() => setDeviceCameraOpen(false)}
        />

        <ExternalCameraPopup
          isOpen={externalCameraOpen}
          onClose={() => setExternalCameraOpen(false)}
        />
      </div>
    </div>
  );
}
