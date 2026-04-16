"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { usePresence } from "@/lib/hooks/usePresence";

type StreamStatus = "idle" | "live" | "ended";
type CameraConnectionStatus = "connected" | "disconnected";

interface SessionState {
  activeSession: {
    id: string;
    createdBy: string;
    opponentId: string | null;
    streamStatus: StreamStatus;
  } | null;
  opponentName: string | null;
  cameraStatus: {
    device: CameraConnectionStatus;
    external: CameraConnectionStatus;
  };
  opponentCameraStatus: CameraConnectionStatus;
  opponentPairingId: string | null;
  streamStatus: StreamStatus;
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  activeSession: null,
  opponentName: null,
  cameraStatus: { device: "disconnected", external: "disconnected" },
  opponentCameraStatus: "disconnected",
  opponentPairingId: null,
  streamStatus: "idle",
  refreshSession: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  usePresence();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionState["activeSession"]>(null);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<SessionState["cameraStatus"]>({
    device: "disconnected",
    external: "disconnected",
  });
  const [opponentCameraStatus, setOpponentCameraStatus] = useState<CameraConnectionStatus>("disconnected");
  const [opponentPairingId, setOpponentPairingId] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");

  const loadSession = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;
    setUserId(user.id);

    // Check own camera pairing immediately (independent of streaming session)
    // Only consider pairings with a recent heartbeat (within 45s) as truly connected
    const staleThreshold = new Date(Date.now() - 45_000).toISOString();
    const { data: ownPairings } = await supabase
      .from("camera_pairings")
      .select("id, status, last_heartbeat")
      .eq("player_id", user.id)
      .eq("status", "paired")
      .gt("last_heartbeat", staleThreshold)
      .limit(1);

    const hasActivePairing = ownPairings && ownPairings.length > 0;
    setCameraStatus((prev) => ({
      ...prev,
      external: hasActivePairing ? "connected" : "disconnected",
    }));

    // Clean up stale pairings (paired but heartbeat expired)
    if (!hasActivePairing) {
      void supabase
        .from("camera_pairings")
        .update({ status: "disconnected" })
        .eq("player_id", user.id)
        .eq("status", "paired")
        .lte("last_heartbeat", staleThreshold);
    }

    // Find active session
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, created_by, opponent_id, stream_status")
      .or(`created_by.eq.${user.id},opponent_id.eq.${user.id}`)
      .in("stream_status", ["idle", "live"])
      .order("started_at", { ascending: false })
      .limit(1);

    if (!sessions || sessions.length === 0) {
      setActiveSession(null);
      setOpponentName(null);
      setStreamStatus("idle");
      return;
    }

    const session = sessions[0];
    setActiveSession({
      id: session.id,
      createdBy: session.created_by,
      opponentId: session.opponent_id,
      streamStatus: session.stream_status as StreamStatus,
    });
    setStreamStatus(session.stream_status as StreamStatus);

    // Load opponent name
    const opponentId =
      session.created_by === user.id
        ? session.opponent_id
        : session.created_by;

    if (opponentId) {
      const { data: opponent } = await supabase
        .from("players")
        .select("display_name")
        .eq("id", opponentId)
        .single();

      setOpponentName(opponent?.display_name ?? null);
    }

  }, [supabase]);

  // Initial load
  useEffect(() => {
    loadSession(); // eslint-disable-line react-hooks/set-state-in-effect -- async fetch on mount
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to session changes
  useEffect(() => {
    if (!activeSession) return;

    const channel = supabase
      .channel(`session-ctx:${activeSession.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${activeSession.id}`,
        },
        (payload) => {
          const row = payload.new as { stream_status: string };
          setStreamStatus(row.stream_status as StreamStatus);
          setActiveSession((prev) =>
            prev ? { ...prev, streamStatus: row.stream_status as StreamStatus } : null
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to own camera pairing changes (independent of session)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`camera-ctx:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "camera_pairings",
          filter: `player_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          setCameraStatus((prev) => ({
            ...prev,
            external: row.status === "paired" ? "connected" : "disconnected",
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SessionContext.Provider
      value={{
        activeSession,
        opponentName,
        cameraStatus,
        opponentCameraStatus,
        opponentPairingId,
        streamStatus,
        refreshSession: loadSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
