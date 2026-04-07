import { type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

export function subscribeToGame(
  supabase: SupabaseClient,
  gameId: string,
  onGameUpdate: (payload: Record<string, unknown>) => void,
  onTurnInsert: (payload: Record<string, unknown>) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`game:${gameId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "games",
        filter: `id=eq.${gameId}`,
      },
      (payload) => onGameUpdate(payload.new as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "turns",
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => onTurnInsert(payload.new as Record<string, unknown>)
    )
    .subscribe();

  return channel;
}

export function unsubscribeFromGame(
  supabase: SupabaseClient,
  channel: RealtimeChannel
) {
  supabase.removeChannel(channel);
}
