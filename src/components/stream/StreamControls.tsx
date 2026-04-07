"use client";

import { useState, useEffect, useCallback } from "react";

type StreamStatus = "idle" | "connecting" | "live" | "error";

interface StreamHealthResponse {
  status?: "healthy" | "degraded" | "error";
  fps?: number;
  bitrate?: number;
  uptime?: number;
  error?: string;
}

interface Props {
  sessionId: string;
}

function StatusDot({ status }: { status: StreamStatus }) {
  const base = "inline-block w-3 h-3 rounded-full mr-2";
  switch (status) {
    case "idle":
      return <span className={`${base} bg-gray-500`} />;
    case "connecting":
      return <span className={`${base} bg-yellow-400 animate-pulse`} />;
    case "live":
      return <span className={`${base} bg-emerald-500 animate-pulse`} />;
    case "error":
      return <span className={`${base} bg-red-500`} />;
  }
}

function statusLabel(status: StreamStatus): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "connecting":
      return "Connecting…";
    case "live":
      return "Live";
    case "error":
      return "Error";
  }
}

export function StreamControls({ sessionId }: Props) {
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<StreamHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "status" }),
      });
      const data = (await res.json()) as StreamHealthResponse;
      setHealth(data);
      if (data.error) {
        setStreamStatus("error");
        setErrorMessage(data.error);
      } else if (data.status === "healthy" || data.status === "degraded") {
        setStreamStatus("live");
      } else if (data.status === "error") {
        setStreamStatus("error");
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [sessionId]);

  // Poll every 5 seconds when live
  useEffect(() => {
    if (streamStatus !== "live") return;
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [streamStatus, pollStatus]);

  async function handleStart() {
    setLoading(true);
    setErrorMessage(null);
    setStreamStatus("connecting");
    try {
      const res = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "start" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setStreamStatus("error");
        setErrorMessage(data.error ?? "Failed to start stream");
      } else {
        setStreamStatus("live");
      }
    } catch (err) {
      setStreamStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setLoading(true);
    try {
      const res = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "stop" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setErrorMessage(data.error ?? "Failed to stop stream");
      } else {
        setStreamStatus("idle");
        setHealth(null);
        setErrorMessage(null);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  const isLiveOrConnecting = streamStatus === "live" || streamStatus === "connecting";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center text-sm font-medium text-gray-300">
          <StatusDot status={streamStatus} />
          {statusLabel(streamStatus)}
        </div>

        {streamStatus === "live" && health && (
          <div className="flex gap-4 text-xs text-gray-400">
            {health.fps !== undefined && (
              <span>{health.fps.toFixed(0)} fps</span>
            )}
            {health.bitrate !== undefined && (
              <span>{health.bitrate.toFixed(0)} kbps</span>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {errorMessage && (
        <p className="text-xs text-red-400 bg-red-950/40 rounded-lg px-3 py-2">
          {errorMessage}
        </p>
      )}

      {/* Action button */}
      {!isLiveOrConnecting ? (
        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-2 px-4 rounded-lg transition-colors"
        >
          {loading ? "Starting…" : "Start Stream"}
        </button>
      ) : (
        <button
          onClick={handleStop}
          disabled={loading || streamStatus === "connecting"}
          className="w-full bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-2 px-4 rounded-lg transition-colors"
        >
          {loading ? "Stopping…" : "End Stream"}
        </button>
      )}
    </div>
  );
}
