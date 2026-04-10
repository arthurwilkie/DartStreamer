"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface SessionInvite {
  id: string;
  session_id: string;
  from_player_id: string;
  status: string;
  created_at: string;
  from_player: { display_name: string; avatar_url: string | null };
}

interface GameInvite {
  id: string;
  from_player_id: string;
  game_mode: string;
  session_id: string | null;
  status: string;
  created_at: string;
  from_player: { display_name: string; avatar_url: string | null };
}

type Invite =
  | { type: "session"; data: SessionInvite }
  | { type: "game"; data: GameInvite };

export function NotificationBell() {
  const router = useRouter();
  const supabase = createClient();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [open, setOpen] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadInvites = useCallback(async () => {
    const [sessionRes, gameRes] = await Promise.all([
      fetch("/api/invites/session"),
      fetch("/api/invites/game"),
    ]);

    const allInvites: Invite[] = [];

    if (sessionRes.ok) {
      const data = (await sessionRes.json()) as SessionInvite[];
      allInvites.push(...data.map((d) => ({ type: "session" as const, data: d })));
    }
    if (gameRes.ok) {
      const data = (await gameRes.json()) as GameInvite[];
      allInvites.push(...data.map((d) => ({ type: "game" as const, data: d })));
    }

    // Sort by created_at desc
    allInvites.sort(
      (a, b) =>
        new Date(b.data.created_at).getTime() -
        new Date(a.data.created_at).getTime()
    );

    setInvites(allInvites);
  }, []);

  // Initial load
  useEffect(() => {
    loadInvites(); // eslint-disable-line react-hooks/set-state-in-effect -- fetch invites on mount
  }, [loadInvites]);

  // Subscribe to new invites in realtime
  useEffect(() => {
    const channel = supabase
      .channel("notification-invites")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "session_invites" },
        () => void loadInvites()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_invites" },
        () => void loadInvites()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadInvites]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleRespond = useCallback(
    async (invite: Invite, status: "accepted" | "declined") => {
      const id = invite.data.id;
      setResponding(id);

      const url =
        invite.type === "session"
          ? `/api/invites/session/${id}`
          : `/api/invites/game/${id}`;

      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        const result = (await res.json()) as { gameId?: string };

        // Remove from list
        setInvites((prev) => prev.filter((i) => i.data.id !== id));

        // If game invite was accepted, navigate to the game
        if (invite.type === "game" && status === "accepted" && result.gameId) {
          setOpen(false);
          router.push(`/game/${result.gameId}`);
        }

        // If session invite was accepted, navigate to stream controls
        if (invite.type === "session" && status === "accepted") {
          setOpen(false);
          router.push("/stream");
        }
      }

      setResponding(null);
    },
    [router]
  );

  const count = invites.length;
  const modeLabels: Record<string, string> = {
    "501": "501",
    "301": "301",
    cricket: "Cricket",
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-zinc-800"
      >
        <svg
          className="h-5 w-5 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-zinc-700 bg-zinc-800 shadow-lg">
          <div className="border-b border-zinc-700 px-4 py-2">
            <p className="text-sm font-semibold text-white">Notifications</p>
          </div>

          {invites.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-zinc-500">No pending invites</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {invites.map((invite) => {
                const name = invite.data.from_player.display_name;
                const isResponding = responding === invite.data.id;

                return (
                  <div
                    key={invite.data.id}
                    className="border-b border-zinc-700/50 px-4 py-3 last:border-0"
                  >
                    <p className="text-sm text-zinc-300">
                      <span className="font-medium text-white">{name}</span>
                      {invite.type === "session"
                        ? " invited you to a streaming session"
                        : ` invited you to a game of ${modeLabels[invite.data.game_mode] ?? invite.data.game_mode}`}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => void handleRespond(invite, "accepted")}
                        disabled={isResponding}
                        className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {isResponding ? "..." : "Accept"}
                      </button>
                      <button
                        onClick={() => void handleRespond(invite, "declined")}
                        disabled={isResponding}
                        className="flex-1 rounded-lg border border-zinc-600 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
