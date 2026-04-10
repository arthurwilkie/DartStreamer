"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { validateCode } from "@/lib/pairing/codes";

type PairingState = "setup" | "pairing" | "paired" | "error";

export default function CameraPage() {
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [code, setCode] = useState("");
  const [state, setState] = useState<PairingState>("setup");
  const [errorMessage, setErrorMessage] = useState("");
  const [zoom, setZoom] = useState(1);
  const [cameraReady, setCameraReady] = useState(false);
  const autoPairAttempted = useRef(false);

  // Check for code in URL params (QR code scan flow)
  useEffect(() => {
    const urlCode = searchParams.get("code");
    if (urlCode && validateCode(urlCode) && !autoPairAttempted.current) {
      autoPairAttempted.current = true;
      setCode(urlCode); // eslint-disable-line react-hooks/set-state-in-effect -- sync from URL param on mount
    }
  }, [searchParams]);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraReady(true);
      } catch {
        setErrorMessage("Camera permission denied. Please allow camera access.");
        setState("error");
      }
    }

    void startCamera();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handlePair = useCallback(async () => {
    if (!validateCode(code)) {
      setErrorMessage("Please enter a valid 6-digit code.");
      setState("error");
      return;
    }

    setState("pairing");
    setErrorMessage("");

    try {
      const res = await fetch("/api/pairing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setErrorMessage(data.error ?? "Pairing failed. Check your code.");
        setState("error");
        return;
      }

      setState("paired");
    } catch {
      setErrorMessage("Network error. Please try again.");
      setState("error");
    }
  }, [code]);

  // Auto-pair when camera is ready and code is from URL
  useEffect(() => {
    if (cameraReady && autoPairAttempted.current && code && state === "setup") {
      void handlePair(); // eslint-disable-line react-hooks/set-state-in-effect -- auto-pair from URL on mount
    }
  }, [cameraReady, code, handlePair, state]);

  async function handleDisconnect() {
    try {
      await fetch("/api/pairing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
    } catch {
      // Best-effort disconnect
    }

    // Stop camera tracks
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }

    setCameraReady(false);
    setCode("");
    setState("setup");
  }

  function handleRetry() {
    setCode("");
    setErrorMessage("");
    setState("setup");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      {/* Camera preview */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
        />
        {!cameraReady && state !== "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <p className="text-zinc-400">Starting camera&hellip;</p>
          </div>
        )}
        {state === "paired" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex flex-col items-center gap-2">
              <span className="h-4 w-4 rounded-full bg-emerald-400" />
              <p className="text-lg font-semibold text-emerald-300">Connected</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-4 p-4">
        {/* Zoom slider */}
        {cameraReady && (
          <div className="flex items-center gap-3">
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

        {state === "setup" && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Enter the 6-digit code shown on the game screen.
            </p>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-14 w-full rounded-lg bg-zinc-800 px-4 text-center text-2xl font-mono tracking-widest text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={() => void handlePair()}
              disabled={code.length !== 6}
              className="h-12 w-full rounded-lg bg-emerald-600 font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
            >
              Pair Camera
            </button>
          </div>
        )}

        {state === "pairing" && (
          <div className="flex h-12 items-center justify-center">
            <p className="text-zinc-400">Pairing&hellip;</p>
          </div>
        )}

        {state === "paired" && (
          <div className="space-y-3">
            <div className="flex h-12 items-center justify-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-400" />
              <p className="font-semibold text-emerald-300">Camera paired and streaming</p>
            </div>
            <button
              onClick={() => void handleDisconnect()}
              className="h-12 w-full rounded-lg border border-red-700 font-medium text-red-400 transition-colors hover:bg-red-900/20"
            >
              Disconnect Camera
            </button>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-3">
            <p className="rounded-lg bg-red-950 px-4 py-3 text-sm text-red-300">
              {errorMessage}
            </p>
            <button
              onClick={handleRetry}
              className="h-12 w-full rounded-lg border border-zinc-600 font-medium text-zinc-300 transition-colors hover:border-zinc-500"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
