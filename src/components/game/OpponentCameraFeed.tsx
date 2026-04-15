"use client";

import { useEffect, useRef } from "react";

interface Props {
  opponentName: string;
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState | "idle";
}

export function OpponentCameraFeed({ opponentName, stream, connectionState }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = stream !== null && connectionState === "connected";
  const isConnecting =
    connectionState === "connecting" || connectionState === "new";

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <div className="aspect-square">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
        {/* Overlay when no video yet */}
        {!hasVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
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
            <p className="text-sm text-zinc-500">
              {isConnecting
                ? "Connecting to camera..."
                : `Waiting for ${opponentName}'s camera...`}
            </p>
            {isConnecting && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
            )}
          </div>
        )}
      </div>
      {/* Label */}
      {hasVideo && (
        <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1">
          <p className="text-xs font-medium text-white">{opponentName}&apos;s board</p>
        </div>
      )}
    </div>
  );
}
