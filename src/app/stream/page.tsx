"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CameraSection } from "@/components/stream/CameraSection";
import { SessionSection } from "@/components/stream/SessionSection";
import { StreamControls } from "@/components/stream/StreamControls";

type CameraType = "none" | "device" | "external";
type ConnectionStatus = "disconnected" | "connecting" | "connected";

interface SessionRow {
  id: string;
  created_by: string;
  opponent_id: string | null;
  stream_status: string;
  stream_key_override: string | null;
}

interface PlayerInfo {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_online: boolean;
}

export default function StreamPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [savedStreamKey, setSavedStreamKey] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [sessionOpponent, setSessionOpponent] = useState<PlayerInfo | null>(null);
  const [inviteStatus, setInviteStatus] = useState<"none" | "pending" | "accepted" | "declined">("none");

  // Camera state
  const [activeCameraType, setActiveCameraType] = useState<CameraType>("none");
  const [deviceStatus, setDeviceStatus] = useState<ConnectionStatus>("disconnected");
  const [externalStatus, setExternalStatus] = useState<ConnectionStatus>("disconnected");
  const [opponentCameraStatus, setOpponentCameraStatus] = useState<"connected" | "disconnected">("disconnected");

  // Load user, session, and stream key
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

      // Stream keys live in an RLS-revoked column; fetch existence via API.
      const r = await fetch("/api/stream-key");
      if (r.ok) {
        const { hasKey } = (await r.json()) as { hasKey: boolean };
        // The real plaintext never reaches the browser; downstream UI only
        // needs to know a key is present. Start flow decrypts server-side.
        if (hasKey) setSavedStreamKey("__saved__");
      }

      // Check for active session (created by user or where user is opponent)
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, created_by, opponent_id, stream_status, stream_key_override")
        .or(`created_by.eq.${user.id},opponent_id.eq.${user.id}`)
        .in("stream_status", ["idle", "live"])
        .order("started_at", { ascending: false })
        .limit(1);

      if (sessions && sessions.length > 0) {
        const session = sessions[0] as SessionRow;
        setActiveSession(session);

        // Load opponent info
        const opponentId =
          session.created_by === user.id
            ? session.opponent_id
            : session.created_by;

        if (opponentId) {
          const { data: opponent } = await supabase
            .from("players")
            .select("id, display_name, avatar_url")
            .eq("id", opponentId)
            .single();

          if (opponent) {
            setSessionOpponent({ ...opponent, is_online: false });
          }
        }

        // Check opponent camera status
        if (opponentId) {
          const { data: pairings } = await supabase
            .from("camera_pairings")
            .select("status")
            .eq("session_id", session.id)
            .eq("player_id", opponentId)
            .eq("status", "paired");

          if (pairings && pairings.length > 0) {
            setOpponentCameraStatus("connected");
          }
        }

        // Check own camera pairings
        const { data: ownPairings } = await supabase
          .from("camera_pairings")
          .select("status, pairing_code")
          .eq("session_id", session.id)
          .eq("player_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (ownPairings && ownPairings.length > 0) {
          if (ownPairings[0].status === "paired") {
            setActiveCameraType("external");
            setExternalStatus("connected");
          } else if (ownPairings[0].status === "pending") {
            setActiveCameraType("external");
            setExternalStatus("connecting");
          }
        }
      }
    }

    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to camera pairing changes for the current user
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`camera-pairings:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "camera_pairings",
          filter: `player_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { player_id: string; status: string };
          if (row.status === "paired") {
            setExternalStatus("connected");
            setActiveCameraType("external");
          } else if (row.status === "expired") {
            setExternalStatus("disconnected");
            setActiveCameraType("none");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect camera disconnect via stale heartbeat
  useEffect(() => {
    if (externalStatus !== "connected" || !userId) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("camera_pairings")
        .select("status, last_heartbeat")
        .eq("player_id", userId)
        .eq("status", "paired")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!data || data.length === 0) {
        // Pairing row gone or status changed — camera disconnected
        setExternalStatus("disconnected");
        setActiveCameraType("none");
        return;
      }

      const heartbeat = data[0].last_heartbeat;
      if (heartbeat) {
        const age = Date.now() - new Date(heartbeat).getTime();
        if (age > 30_000) {
          // No heartbeat for 30s — camera is gone
          setExternalStatus("disconnected");
          setActiveCameraType("none");
        }
      }
    }, 20_000);

    return () => clearInterval(interval);
  }, [externalStatus, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to session invite responses
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`session-invite-responses:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "session_invites",
          filter: `from_player_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { status: string; session_id: string };
          if (row.status === "accepted") {
            setInviteStatus("accepted");
            // Reload session
            window.location.reload();
          } else if (row.status === "declined") {
            setInviteStatus("declined");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleActivateDevice = useCallback(() => {
    setActiveCameraType("device");
    setDeviceStatus("connecting");
    // Request camera permission — actual WebRTC produce happens in the session context
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then(() => {
        setDeviceStatus("connected");
      })
      .catch(() => {
        setDeviceStatus("disconnected");
        setActiveCameraType("none");
      });
  }, []);

  const handleDeactivateDevice = useCallback(() => {
    setDeviceStatus("disconnected");
    setActiveCameraType("none");
  }, []);

  const handleClaimExternalCode = useCallback(async (code: string) => {
    setExternalStatus("connecting");
    setActiveCameraType("external");

    const res = await fetch("/api/pairing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        sessionId: activeSession?.id ?? null,
      }),
    });

    if (res.ok) {
      setExternalStatus("connected");
    } else {
      setExternalStatus("disconnected");
      setActiveCameraType("none");
    }
  }, [activeSession]);

  const handleDisconnectExternal = useCallback(() => {
    setExternalStatus("disconnected");
    setActiveCameraType("none");
  }, []);

  const handleInviteOpponent = useCallback(
    async (playerId: string) => {
      setInviteStatus("pending");

      const res = await fetch("/api/invites/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toPlayerId: playerId }),
      });

      if (!res.ok) {
        setInviteStatus("none");
      } else {
        const data = (await res.json()) as { session_id: string };
        // Reload to pick up the new session
        const { data: session } = await supabase
          .from("sessions")
          .select("id, created_by, opponent_id, stream_status, stream_key_override")
          .eq("id", data.session_id)
          .single();

        if (session) {
          setActiveSession(session as SessionRow);
        }
      }
    },
    [supabase]
  );

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-md px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Stream Controls</h1>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-zinc-400 hover:text-white"
          >
            Back
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {/* Camera section */}
          <CameraSection
            sessionId={activeSession?.id ?? ""}
            activeCameraType={activeCameraType}
            deviceStatus={deviceStatus}
            externalStatus={externalStatus}
            onActivateDevice={handleActivateDevice}
            onDeactivateDevice={handleDeactivateDevice}
            onClaimExternalCode={(code) => void handleClaimExternalCode(code)}
            onDisconnectExternal={handleDisconnectExternal}
          />

          {/* Session section */}
          <SessionSection
            sessionOpponent={sessionOpponent}
            opponentCameraStatus={opponentCameraStatus}
            onInviteOpponent={(id) => void handleInviteOpponent(id)}
            inviteStatus={inviteStatus}
          />

          {/* YouTube streaming section */}
          {activeSession && (
            <StreamControls
              sessionId={activeSession.id}
              savedStreamKey={savedStreamKey}
            />
          )}

          {!activeSession && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                YouTube Streaming
              </h2>
              <p className="mt-3 text-sm text-zinc-500">
                Set up a session with an opponent to enable YouTube streaming.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
