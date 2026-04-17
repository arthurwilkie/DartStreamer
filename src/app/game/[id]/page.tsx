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
import { GameStatsDisplay } from "@/components/game/GameStatsDisplay";
import { TurnHistory } from "@/components/game/TurnHistory";
import { BOT_PLAYER_ID, generateBotScore } from "@/lib/game/bot";
import { calculateGameStatsForPlayer } from "@/lib/game/stats";
import { shouldShowDartsAtDoublePopup, getDartsAtDoubleOptions } from "@/lib/game/checkouts";
import { DartsAtDoublePopup } from "@/components/scoring/DartsAtDoublePopup";
import { CameraStatusIcon } from "@/components/game/CameraStatusIcon";
import { DeviceCameraPopup } from "@/components/game/DeviceCameraPopup";
import { OpponentCameraFeed } from "@/components/game/OpponentCameraFeed";
import { useSession } from "@/lib/session/SessionContext";
import { ViewerPeer } from "@/lib/webrtc/peer";

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
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;

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
          if (isX01State(prev) && (!darts || (darts as Dart[]).length === 0)) {
            const { newState } = applyScoreTurn(prev, turn.player_id, turn.score_entered);
            return newState;
          }
          const { newState } = applyTurn(prev, turn.player_id, darts);
          return newState;
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
      const checkedOut = score === remaining;

      // Check if we need the darts-at-double popup
      if (shouldShowDartsAtDoublePopup(remaining)) {
        const options = getDartsAtDoubleOptions(remaining, checkedOut);
        setPendingScore(score);
        setPendingCheckedOut(checkedOut);
        setDartsAtDoubleOptions(options);
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

  const handleCricketSubmit = useCallback(
    async (darts: CricketDart[]) => {
      if (!gameState || !userId || !gameRow || submitting) return;
      if (!isCricketState(gameState)) return;

      setSubmitting(true);

      const { newState, result } = applyTurn(gameState, userId, darts);
      setGameState(newState);

      const totalMarks = darts.reduce((sum, d) => sum + d.marks, 0);

      await fetch(`/api/games/${gameId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoreEntered: totalMarks + ("pointsScored" in result ? result.pointsScored : 0),
          dartsDetail: darts,
          roundNumber: gameState.currentRound,
        }),
      });

      if ("gameOver" in result && result.gameOver && "winnerId" in result && result.winnerId) {
        await finishGame(result.winnerId as string);
      }

      setSubmitting(false);
    },
    [gameState, userId, gameRow, gameId, submitting, finishGame]
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
  const canEdit = lastTurn?.playerId === userId && !isFinished;

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
      <div className="mx-auto max-w-md px-4 py-4">
        {/* Camera status icon */}
        {!isFinished && !isBotGame && (
          <div className="flex justify-end">
            <CameraStatusIcon onOpenDeviceCamera={() => setDeviceCameraOpen(true)} />
          </div>
        )}

        {/* Game finished: stats + turn history */}
        {isFinished && gameState && (() => {
          const p1Id = gameState.turns.length > 0
            ? gameState.turns[0].playerId
            : Object.keys(playerNames)[0];
          const p2Id = Object.keys(playerNames).find((id) => id !== p1Id) ?? "";
          const winnerId = gameRow.winner_id;
          const p1Stats = calculateGameStatsForPlayer(
            gameState.turns, p1Id, gameState.mode, winnerId === p1Id
          );
          const p2Stats = calculateGameStatsForPlayer(
            gameState.turns, p2Id, gameState.mode, winnerId === p2Id
          );
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

              <GameStatsDisplay
                player1={{
                  name: playerNames[p1Id] ?? "Player 1",
                  stats: p1Stats,
                  isWinner: winnerId === p1Id,
                }}
                player2={{
                  name: playerNames[p2Id] ?? "Player 2",
                  stats: p2Stats,
                  isWinner: winnerId === p2Id,
                }}
                mode={gameState.mode}
              />

              <TurnHistory
                turns={gameState.turns}
                player1Id={p1Id}
                player2Id={p2Id}
                player1Name={playerNames[p1Id] ?? "Player 1"}
                player2Name={playerNames[p2Id] ?? "Player 2"}
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
        <div className="mt-4">
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
          <div className="mt-4">
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
                {isCricketState(gameState) && (
                  <CricketInput
                    onSubmit={handleCricketSubmit}
                    disabled={!isYourTurn || submitting}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Edit button */}
        {canEdit && !isFinished && (
          <button
            onClick={() => setEditModalOpen(true)}
            className="mt-3 w-full rounded-lg border border-amber-700 py-2 text-sm text-amber-400 transition-colors hover:bg-amber-900/20"
          >
            Edit Last Turn
          </button>
        )}

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
          onConfirm={handleDartsAtDoubleConfirm}
        />

        <DeviceCameraPopup
          isOpen={deviceCameraOpen}
          onClose={() => setDeviceCameraOpen(false)}
        />
      </div>
    </div>
  );
}
