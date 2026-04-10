"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  opponentName: string;
  signalingUrl?: string;
  sessionId?: string;
}

export function OpponentCameraFeed({ opponentName, signalingUrl, sessionId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasTrack, setHasTrack] = useState(false);

  // In a full implementation, this would consume the opponent's mediasoup
  // video track via the WebRTC client. For now, we show the video element
  // that will be connected to the mediasoup consumer track.
  useEffect(() => {
    if (!signalingUrl || !sessionId) return;
    // TODO: Connect to mediasoup consumer for opponent's video track
    // When track arrives: videoRef.current.srcObject = stream; setHasTrack(true);
  }, [signalingUrl, sessionId]);

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <div className="aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
        {/* Overlay when no video track yet */}
        {!hasTrack && (
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
              Waiting for {opponentName}&apos;s camera...
            </p>
          </div>
        )}
      </div>
      {/* Label */}
      <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1">
        <p className="text-xs font-medium text-white">{opponentName}&apos;s board</p>
      </div>
    </div>
  );
}
