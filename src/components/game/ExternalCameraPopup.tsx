"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ViewerPeer } from "@/lib/webrtc/peer";
import { useSession } from "@/lib/session/SessionContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Status = "idle" | "connecting" | "waiting" | "connected" | "error";

export function ExternalCameraPopup({ isOpen, onClose }: Props) {
  const { activeSession, cameraStatus, refreshSession } = useSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<ViewerPeer | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [pairingId, setPairingId] = useState<string | null>(null);

  // If the user already has a paired camera when opening, fetch its pairingId
  useEffect(() => {
    if (!isOpen) return;
    if (pairingId) return;
    if (cameraStatus.external !== "connected") return;

    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const staleThreshold = new Date(Date.now() - 45_000).toISOString();
      const { data } = await supabase
        .from("camera_pairings")
        .select("id")
        .eq("player_id", user.id)
        .eq("status", "paired")
        .gt("last_heartbeat", staleThreshold)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (data && data.length > 0) {
        setPairingId(data[0].id); // eslint-disable-line react-hooks/set-state-in-effect -- load pairingId for existing connection
        setStatus("waiting"); // eslint-disable-line react-hooks/set-state-in-effect
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, cameraStatus.external, pairingId]);

  // Start the WebRTC preview once we have a pairingId and the popup is open
  useEffect(() => {
    if (!isOpen || !pairingId) return;

    const supabase = createClient();
    const peer = new ViewerPeer(supabase, pairingId);
    peerRef.current = peer;

    peer.onStream = (stream) => {
      if (videoRef.current) videoRef.current.srcObject = stream;
    };
    peer.onConnectionState = (state) => {
      if (state === "connected") setStatus("connected");
      else if (state === "connecting" || state === "new") setStatus("waiting");
      else if (state === "failed" || state === "disconnected" || state === "closed") {
        // Keep pairingId but surface the drop
        setStatus("waiting");
      }
    };

    return () => {
      peer.destroy();
      peerRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [isOpen, pairingId]);

  const handleSubmitCode = useCallback(async () => {
    const cleaned = codeInput.replace(/\s/g, "");
    if (!/^\d{6}$/.test(cleaned)) {
      setError("Enter a valid 6-digit code.");
      return;
    }
    if (cameraStatus.device === "connected") {
      setError("Disconnect your device camera first.");
      return;
    }
    setError(null);
    setStatus("connecting");

    // Tear down any existing peer + clear video before linking a new code
    peerRef.current?.destroy();
    peerRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPairingId(null);

    try {
      const res = await fetch("/api/pairing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: cleaned,
          sessionId: activeSession?.id ?? null,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Failed to link camera.");
        setStatus("error");
        return;
      }

      const data = (await res.json()) as { pairingId: string };
      setPairingId(data.pairingId);
      setStatus("waiting");
      setCodeInput("");
      void refreshSession();
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }, [codeInput, cameraStatus.device, activeSession, refreshSession]);

  if (!isOpen) return null;

  const showVideo = status === "connected";
  const statusText =
    status === "connecting"
      ? "Linking camera..."
      : status === "waiting"
      ? "Waiting for camera connection..."
      : status === "connected"
      ? "Camera connected"
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div className="w-full max-w-md rounded-t-2xl bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">External Camera</h3>
          <button
            onClick={onClose}
            className="text-sm text-zinc-400 hover:text-white"
          >
            Close
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="mt-4 space-y-3">
          <p className="text-xs text-zinc-400">
            Open{" "}
            <span className="font-mono font-medium text-zinc-200">
              darts.vaderspace.com/camera
            </span>{" "}
            on your external device, then enter the 6-digit code shown there.
            Entering a new code will replace any current camera connection.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={7}
              value={codeInput}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d\s]/g, "");
                setCodeInput(raw);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSubmitCode();
              }}
              placeholder="123 456"
              className="flex-1 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-center font-mono text-lg tracking-widest text-white placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
            <button
              onClick={() => void handleSubmitCode()}
              disabled={status === "connecting"}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {status === "connecting" ? "..." : "Link"}
            </button>
          </div>
        </div>

        {/* Preview / status square */}
        <div className="relative mt-4 aspect-square overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${showVideo ? "" : "hidden"}`}
          />
          {!showVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <svg
                className="h-10 w-10 text-zinc-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm text-zinc-400">
                {statusText ?? "Waiting for camera connection"}
              </p>
              {(status === "connecting" || status === "waiting") && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
              )}
            </div>
          )}
        </div>

        {status === "connected" && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <p className="text-sm text-emerald-300">Camera connected</p>
          </div>
        )}
      </div>
    </div>
  );
}
