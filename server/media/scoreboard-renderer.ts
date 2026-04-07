import fs from "node:fs";
import path from "node:path";
import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

export interface ScoreboardConfig {
  supabaseUrl: string;
  supabaseKey: string;
  outputPath: string;
}

export interface GameState {
  player1Name?: string;
  player2Name?: string;
  player1Score?: number;
  player2Score?: number;
  currentRound?: number;
  mode?: string;
  currentPlayer?: string;
  [key: string]: unknown;
}

function buildSvg(state: GameState): string {
  const p1 = state.player1Name ?? "Player 1";
  const p2 = state.player2Name ?? "Player 2";
  const s1 = state.player1Score ?? 0;
  const s2 = state.player2Score ?? 0;
  const round = state.currentRound ?? 1;
  const mode = state.mode ?? "501";

  // Escape XML special characters
  const esc = (s: string) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="120" viewBox="0 0 1280 120">
  <!-- Background -->
  <rect width="1280" height="120" rx="8" fill="rgba(0,0,0,0.75)"/>

  <!-- Mode / Round label -->
  <text x="640" y="24" font-family="Arial,sans-serif" font-size="18" fill="#10b981"
        text-anchor="middle" dominant-baseline="middle">
    ${esc(mode)} — Round ${esc(String(round))}
  </text>

  <!-- Player 1 name -->
  <text x="220" y="60" font-family="Arial,sans-serif" font-size="28" fill="#ffffff"
        text-anchor="middle" dominant-baseline="middle" font-weight="bold">
    ${esc(p1)}
  </text>

  <!-- Player 1 score -->
  <text x="220" y="96" font-family="Arial,sans-serif" font-size="36" fill="#10b981"
        text-anchor="middle" dominant-baseline="middle" font-weight="bold">
    ${esc(String(s1))}
  </text>

  <!-- VS -->
  <text x="640" y="78" font-family="Arial,sans-serif" font-size="24" fill="#6b7280"
        text-anchor="middle" dominant-baseline="middle">
    vs
  </text>

  <!-- Player 2 name -->
  <text x="1060" y="60" font-family="Arial,sans-serif" font-size="28" fill="#ffffff"
        text-anchor="middle" dominant-baseline="middle" font-weight="bold">
    ${esc(p2)}
  </text>

  <!-- Player 2 score -->
  <text x="1060" y="96" font-family="Arial,sans-serif" font-size="36" fill="#10b981"
        text-anchor="middle" dominant-baseline="middle" font-weight="bold">
    ${esc(String(s2))}
  </text>
</svg>`;
}

export class ScoreboardRenderer {
  private readonly config: ScoreboardConfig;
  private readonly supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;

  constructor(config: ScoreboardConfig) {
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
  }

  renderScoreboard(gameState: GameState): void {
    const svg = buildSvg(gameState);
    const outputDir = path.dirname(this.config.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(this.config.outputPath, svg, "utf8");
    console.log("Scoreboard SVG written:", this.config.outputPath);
  }

  subscribeToGame(gameId: string): void {
    this.channel = this.supabase
      .channel(`game-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const newState = payload.new as GameState;
          console.log("Game state updated, re-rendering scoreboard");
          this.renderScoreboard(newState);
        }
      )
      .subscribe((status) => {
        console.log("Scoreboard realtime subscription:", status);
      });
  }

  unsubscribe(): void {
    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = null;
      console.log("ScoreboardRenderer: unsubscribed from realtime");
    }
  }
}
