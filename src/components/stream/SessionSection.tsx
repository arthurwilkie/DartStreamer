"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface PlayerResult {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_online: boolean;
}

interface FavoriteEntry {
  favorite_id: string;
  player: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

interface Props {
  sessionOpponent: PlayerResult | null;
  opponentCameraStatus: "connected" | "disconnected";
  onInviteOpponent: (playerId: string) => void;
  inviteStatus: "none" | "pending" | "accepted" | "declined";
}

export function SessionSection({
  sessionOpponent,
  opponentCameraStatus,
  onInviteOpponent,
  inviteStatus,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlayerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  // Load favorites on mount
  useEffect(() => {
    async function loadFavorites() {
      const res = await fetch("/api/favorites");
      if (res.ok) {
        const data = (await res.json()) as FavoriteEntry[];
        setFavorites(data);
        setFavoriteIds(new Set(data.map((f) => f.favorite_id)));
      }
    }
    loadFavorites();
  }, []);

  // Fetch online status for favorites
  useEffect(() => {
    if (favorites.length === 0) return;

    const playerIds = favorites.map((f) => f.favorite_id);

    async function fetchPresence() {
      const sb = createClient();
      const { data } = await sb
        .from("player_presence")
        .select("player_id, is_online, last_seen")
        .in("player_id", playerIds);

      if (data) {
        const now = Date.now();
        setFavorites((prev) =>
          prev.map((f) => {
            const presence = data.find((p) => p.player_id === f.favorite_id);
            const isOnline = presence
              ? presence.is_online && now - new Date(presence.last_seen).getTime() < 60_000
              : false;
            return { ...f, player: { ...f.player, is_online: isOnline } } as FavoriteEntry & { player: PlayerResult };
          })
        );
      }
    }

    fetchPresence();
  }, [favorites.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search players with debounce
  useEffect(() => {
    if (searchQuery.length < 2) {
      const timer = setTimeout(() => setSearchResults([]), 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = (await res.json()) as PlayerResult[];
        setSearchResults(data);
      }
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAddFavorite = useCallback(async (playerId: string) => {
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favoriteId: playerId }),
    });

    if (res.ok) {
      setFavoriteIds((prev) => new Set([...prev, playerId]));
      // Reload favorites
      const favRes = await fetch("/api/favorites");
      if (favRes.ok) {
        const data = (await favRes.json()) as FavoriteEntry[];
        setFavorites(data);
      }
    }
  }, []);

  const handleRemoveFavorite = useCallback(async (playerId: string) => {
    const res = await fetch(`/api/favorites?favoriteId=${playerId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
      setFavorites((prev) => prev.filter((f) => f.favorite_id !== playerId));
    }
  }, []);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Session
      </h2>

      {/* Active session opponent */}
      {sessionOpponent && (
        <div className="mt-3 rounded-lg bg-emerald-900/20 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PlayerAvatar
                name={sessionOpponent.display_name}
                avatarUrl={sessionOpponent.avatar_url}
                isOnline={sessionOpponent.is_online}
              />
              <div>
                <p className="text-sm font-medium text-white">
                  {sessionOpponent.display_name}
                </p>
                <p className="text-xs text-zinc-400">Session opponent</p>
              </div>
            </div>
            <span
              className={`flex items-center gap-1.5 text-xs ${
                opponentCameraStatus === "connected"
                  ? "text-emerald-400"
                  : "text-zinc-500"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {opponentCameraStatus === "connected" ? "Camera on" : "No camera"}
            </span>
          </div>
        </div>
      )}

      {/* Search for opponent */}
      {!sessionOpponent && (
        <>
          <div className="mt-3">
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Search results */}
          {searching && (
            <p className="mt-3 text-center text-sm text-zinc-500">Searching...</p>
          )}
          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2">
              {searchResults.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-lg bg-zinc-800 p-3"
                >
                  <div className="flex items-center gap-3">
                    <PlayerAvatar
                      name={player.display_name}
                      avatarUrl={player.avatar_url}
                      isOnline={player.is_online}
                    />
                    <span className="text-sm font-medium text-white">
                      {player.display_name}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {!favoriteIds.has(player.id) && (
                      <button
                        onClick={() => void handleAddFavorite(player.id)}
                        className="rounded-lg px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
                        title="Add to favorites"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => onInviteOpponent(player.id)}
                      disabled={inviteStatus === "pending"}
                      className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Invite
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Favorites list */}
          {favorites.length > 0 && searchResults.length === 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Favorites
              </p>
              <div className="mt-2 space-y-2">
                {favorites.map((fav) => (
                  <div
                    key={fav.favorite_id}
                    className="flex items-center justify-between rounded-lg bg-zinc-800 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <PlayerAvatar
                        name={fav.player.display_name}
                        avatarUrl={fav.player.avatar_url}
                        isOnline={(fav.player as PlayerResult).is_online ?? false}
                      />
                      <span className="text-sm font-medium text-white">
                        {fav.player.display_name}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleRemoveFavorite(fav.favorite_id)}
                        className="rounded-lg px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-red-400"
                        title="Remove from favorites"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onInviteOpponent(fav.favorite_id)}
                        disabled={inviteStatus === "pending"}
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                      >
                        Invite
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invite status */}
          {inviteStatus === "pending" && (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-yellow-900/20 p-3">
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
              <p className="text-sm text-yellow-300">Invite sent, waiting for response...</p>
            </div>
          )}
          {inviteStatus === "declined" && (
            <div className="mt-3 rounded-lg bg-red-950/30 p-3">
              <p className="text-center text-sm text-red-300">Invite was declined</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlayerAvatar({
  name,
  avatarUrl,
  isOnline,
}: {
  name: string;
  avatarUrl: string | null;
  isOnline: boolean;
}) {
  return (
    <div className="relative">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-900 ${
          isOnline ? "bg-emerald-400" : "bg-zinc-600"
        }`}
      />
    </div>
  );
}
