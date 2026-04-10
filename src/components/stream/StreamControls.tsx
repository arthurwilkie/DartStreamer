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
  savedStreamKey: string | null;
  onStreamStatusChange?: (status: StreamStatus) => void;
}

function StatusDot({ status }: { status: StreamStatus }) {
  const base = "inline-block w-3 h-3 rounded-full mr-2";
  switch (status) {
    case "idle":
      return <span className={`${base} bg-gray-500`} />;
    case "connecting":
      return <span className={`${base} bg-yellow-400 animate-pulse`} />;
    case "live":
      return <span className={`${base} bg-red-500 animate-pulse`} />;
    case "error":
      return <span className={`${base} bg-red-500`} />;
  }
}

function statusLabel(status: StreamStatus): string {
  switch (status) {
    case "idle":
      return "Not streaming";
    case "connecting":
      return "Connecting...";
    case "live":
      return "LIVE on YouTube";
    case "error":
      return "Error";
  }
}

function maskKey(key: string): string {
  if (key.length <= 4) return "****";
  return "\u2022".repeat(key.length - 4) + key.slice(-4);
}

export function StreamControls({ sessionId, savedStreamKey, onStreamStatusChange }: Props) {
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<StreamHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [useOverrideKey, setUseOverrideKey] = useState(false);
  const [overrideKey, setOverrideKey] = useState("");

  const activeKey = useOverrideKey && overrideKey ? overrideKey : savedStreamKey;

  const updateStatus = useCallback((status: StreamStatus) => {
    setStreamStatus(status);
    onStreamStatusChange?.(status);
  }, [onStreamStatusChange]);

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
        updateStatus("error");
        setErrorMessage(data.error);
      } else if (data.status === "healthy" || data.status === "degraded") {
        updateStatus("live");
      } else if (data.status === "error") {
        updateStatus("error");
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [sessionId, updateStatus]);

  // Poll every 5 seconds when live
  useEffect(() => {
    if (streamStatus !== "live") return;
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [streamStatus, pollStatus]);

  async function handleStart() {
    if (!activeKey) {
      setErrorMessage("No stream key configured. Add one in your profile or enter one below.");
      updateStatus("error");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    updateStatus("connecting");
    try {
      const res = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "start" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        updateStatus("error");
        setErrorMessage(data.error ?? "Failed to start stream");
      } else {
        updateStatus("live");
      }
    } catch (err) {
      updateStatus("error");
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
        updateStatus("idle");
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
        YouTube Streaming
      </h2>

      {/* Status row */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center text-sm font-medium text-zinc-300">
          <StatusDot status={streamStatus} />
          {statusLabel(streamStatus)}
        </div>

        {streamStatus === "live" && health && (
          <div className="flex gap-4 text-xs text-zinc-400">
            {health.fps !== undefined && (
              <span>{health.fps.toFixed(0)} fps</span>
            )}
            {health.bitrate !== undefined && (
              <span>{health.bitrate.toFixed(0)} kbps</span>
            )}
          </div>
        )}
      </div>

      {/* Stream key section */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">Stream Key</p>
        </div>

        {savedStreamKey && !useOverrideKey && (
          <div className="flex items-center justify-between rounded-lg bg-zinc-800 px-3 py-2">
            <span className="font-mono text-sm text-zinc-400">
              {maskKey(savedStreamKey)}
            </span>
            <span className="text-xs text-zinc-600">Saved key</span>
          </div>
        )}

        {!savedStreamKey && !useOverrideKey && (
          <p className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-500">
            No saved key. Add one in Settings or enter below.
          </p>
        )}

        <button
          onClick={() => setUseOverrideKey(!useOverrideKey)}
          className="text-xs text-emerald-400 hover:text-emerald-300"
        >
          {useOverrideKey ? "Use saved key" : "Use a different key"}
        </button>

        {useOverrideKey && (
          <input
            type="password"
            placeholder="Enter stream key for this session"
            value={overrideKey}
            onChange={(e) => setOverrideKey(e.target.value)}
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 font-mono text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        )}
      </div>

      {/* Error message */}
      {errorMessage && (
        <p className="mt-3 text-xs text-red-400 bg-red-950/40 rounded-lg px-3 py-2">
          {errorMessage}
        </p>
      )}

      {/* Action button */}
      <div className="mt-4">
        {!isLiveOrConnecting ? (
          <button
            onClick={handleStart}
            disabled={loading || !activeKey}
            className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 px-4 rounded-lg transition-colors"
          >
            {loading ? "Starting..." : "Go Live on YouTube"}
          </button>
        ) : (
          <button
            onClick={handleStop}
            disabled={loading || streamStatus === "connecting"}
            className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 px-4 rounded-lg transition-colors"
          >
            {loading ? "Stopping..." : "End Stream"}
          </button>
        )}
      </div>
    </div>
  );
}
