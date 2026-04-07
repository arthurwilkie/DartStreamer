"use client";

import { useEffect, useRef } from "react";

interface CameraFeedProps {
  streamTrack?: MediaStreamTrack;
  label: string;
  isConnected: boolean;
}

type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

function statusFromProps(isConnected: boolean): ConnectionStatus {
  return isConnected ? "connected" : "disconnected";
}

const STATUS_STYLES: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-400",
  reconnecting: "bg-amber-400",
  disconnected: "bg-red-500",
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: "Connected",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
};

export function CameraFeed({ streamTrack, label, isConnected }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const status = statusFromProps(isConnected);

  useEffect(() => {
    if (!videoRef.current) return;

    if (streamTrack) {
      const stream = new MediaStream([streamTrack]);
      videoRef.current.srcObject = stream;
    } else {
      videoRef.current.srcObject = null;
    }
  }, [streamTrack]);

  return (
    <div className="relative overflow-hidden rounded-xl bg-zinc-900">
      {streamTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center">
          <p className="text-sm text-zinc-500">Waiting for camera&hellip;</p>
        </div>
      )}

      {/* Label + status bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-black/60 px-3 py-1.5">
        <span className="text-xs font-medium text-zinc-200">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${STATUS_STYLES[status]}`} />
          <span className="text-xs text-zinc-300">{STATUS_LABELS[status]}</span>
        </div>
      </div>
    </div>
  );
}
