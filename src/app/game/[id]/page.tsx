"use client";

import { useEffect, useState, useCallback } from "react";
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

interface GameRow {
  id: string;
  mode: GameMode;
  player1_id: string;
  player2_id: string;
  current_player_id: string;
  current_round: number;
  status: string;
  winner_id: string | null;
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

  const supabase = createClient();

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
        names[p.id] = p.display_name;
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

  // Subscribe to realtime updates
  useEffect(() => {
    if (!gameRow) return;

    const channel = subscribeToGame(
      supabase,
      gameId,
      (updatedGame) => {
        setGameRow((prev) =>
          prev ? { ...prev, ...updatedGame } as GameRow : null
        );
      },
      (newTurn) => {
        // When a new turn comes in from the other player, apply it
        const turn = newTurn as unknown as TurnRow;
        if (turn.player_id === userId) return; // We already applied our own turn locally

        setGameState((prev) => {
          if (!prev) return prev;
          const darts = turn.darts_detail;
          // Score-only turns (X01 turn-based entry) have empty dartsDetail
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
  }, [gameRow?.id, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleX01Submit = useCallback(
    async (score: number) => {
      if (!gameState || !userId || !gameRow || submitting) return;
      if (!isX01State(gameState)) return;

      setSubmitting(true);

      // Apply locally first for instant feedback
      const { newState, result } = applyScoreTurn(gameState, userId, score);
      setGameState(newState);

      const scoreEntered = result && "scoreDeducted" in result
        ? (result.bust ? 0 : result.scoreDeducted)
        : 0;

      // Send to server
      await fetch(`/api/games/${gameId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoreEntered,
          dartsDetail: [],
          roundNumber: gameState.currentRound,
        }),
      });

      // Check for game over
      const gameOverResult = isGameOver(newState);
      if (gameOverResult.over && gameOverResult.winnerId) {
        await fetch(`/api/games/${gameId}/finish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ winnerId: gameOverResult.winnerId }),
        });
        setGameRow((prev) =>
          prev
            ? { ...prev, status: "finished", winner_id: gameOverResult.winnerId! }
            : null
        );
      }

      setSubmitting(false);
    },
    [gameState, userId, gameRow, gameId, submitting]
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
        await fetch(`/api/games/${gameId}/finish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ winnerId: result.winnerId }),
        });
        setGameRow((prev) =>
          prev
            ? { ...prev, status: "finished", winner_id: result.winnerId as string }
            : null
        );
      }

      setSubmitting(false);
    },
    [gameState, userId, gameRow, gameId, submitting]
  );

  const handleEditConfirm = useCallback(() => {
    // Remove the last turn from local state
    if (!gameState) return;
    // For now, close modal — full edit requires server-side turn deletion
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-md px-4 py-4">
        {/* Game finished banner */}
        {isFinished && (
          <div className="mb-4 rounded-xl bg-emerald-900/30 p-4 text-center">
            <div className="text-lg font-bold text-emerald-300">
              Game Over!
            </div>
            <div className="text-sm text-zinc-400">
              {gameRow.winner_id === userId
                ? "You won!"
                : `${playerNames[gameRow.winner_id ?? ""] ?? "Opponent"} wins!`}
            </div>
            <button
              onClick={() => router.push("/")}
              className="mt-3 rounded-lg bg-zinc-800 px-6 py-2 text-sm transition-colors hover:bg-zinc-700"
            >
              Back to Home
            </button>
          </div>
        )}

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

        {/* Score input */}
        {!isFinished && (
          <div className="mt-4">
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
      </div>
    </div>
  );
}
