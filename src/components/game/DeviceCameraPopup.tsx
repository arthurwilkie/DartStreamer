"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "@/lib/session/SessionContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function DeviceCameraPopup({ isOpen, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { cameraStatus } = useSession();
  const [zoom, setZoom] = useState(1);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const externalConnected = cameraStatus.external === "connected";

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startPreview = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setError(null);
    } catch {
      setError("Camera permission denied.");
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (active) {
      startPreview(); // eslint-disable-line react-hooks/set-state-in-effect -- activate camera preview
    }

    return () => {
      stopPreview();
    };
  }, [isOpen, active, startPreview, stopPreview]);

  function handleActivate() {
    if (externalConnected) {
      setError("Disconnect your external camera first.");
      return;
    }
    setActive(true);
    startPreview();
  }

  function handleDeactivate() {
    setActive(false);
    stopPreview();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div className="w-full max-w-md rounded-t-2xl bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Device Camera</h3>
          <button
            onClick={() => {
              onClose();
            }}
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

        {/* Camera preview */}
        <div className="relative mt-3 aspect-video overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
          />
          {!active && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-zinc-500">Camera inactive</p>
            </div>
          )}
        </div>

        {/* Zoom slider */}
        {active && (
          <div className="mt-3 flex items-center gap-3">
            <span className="w-8 text-sm text-zinc-400">1x</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="h-2 flex-1 cursor-pointer accent-emerald-500"
            />
            <span className="w-10 text-sm text-zinc-400">{zoom.toFixed(1)}x</span>
          </div>
        )}

        {/* Action button */}
        <div className="mt-4">
          {!active ? (
            <button
              onClick={handleActivate}
              className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              Activate Camera
            </button>
          ) : (
            <button
              onClick={handleDeactivate}
              className="w-full rounded-lg border border-red-700 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/20"
            >
              Deactivate Camera
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
