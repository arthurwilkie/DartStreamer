"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CameraPeer } from "@/lib/webrtc/peer";
import { useWakeLock } from "@/lib/hooks/useWakeLock";

type CameraState = "loading" | "ready" | "paired" | "error";

export default function CameraPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <p className="text-zinc-400">Loading camera...</p>
        </div>
      }
    >
      <CameraPageInner />
    </Suspense>
  );
}

function CameraPageInner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const outputStreamRef = useRef<MediaStream | null>(null);
  const cameraPeerRef = useRef<CameraPeer | null>(null);
  const zoomRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingId, setPairingId] = useState<string | null>(null);
  const codeGenerated = useRef(false);

  useWakeLock();

  // Keep zoomRef in sync for the draw loop
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Start camera on mount
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        video.srcObject = stream;
        await video.play().catch(() => {});

        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        canvas.width = vw;
        canvas.height = vh;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setErrorMessage("Canvas not supported in this browser.");
          setCameraState("error");
          return;
        }

        const draw = () => {
          const z = zoomRef.current;
          const sw = vw / z;
          const sh = vh / z;
          const sx = (vw - sw) / 2;
          const sy = (vh - sh) / 2;
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, vw, vh);
          rafRef.current = requestAnimationFrame(draw);
        };
        draw();

        const captureStream = (
          canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }
        ).captureStream;
        if (!captureStream) {
          setErrorMessage("Canvas streaming not supported in this browser.");
          setCameraState("error");
          return;
        }
        outputStreamRef.current = captureStream.call(canvas, 30);
        setCameraState("ready");
      } catch {
        setErrorMessage("Camera permission denied. Please allow camera access.");
        setCameraState("error");
      }
    }

    void startCamera();

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      outputStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Generate pairing code once camera is ready
  useEffect(() => {
    if (cameraState !== "ready" || codeGenerated.current) return;
    codeGenerated.current = true;

    async function generateCode() {
      try {
        const res = await fetch("/api/pairing", { method: "POST" });
        if (!res.ok) {
          setErrorMessage("Failed to generate pairing code.");
          setCameraState("error");
          return;
        }
        const data = (await res.json()) as { code: string; pairingId: string };
        setPairingCode(data.code);
        setPairingId(data.pairingId);
      } catch {
        setErrorMessage("Network error. Could not generate code.");
        setCameraState("error");
      }
    }

    void generateCode();
  }, [cameraState]);

  // Poll for pairing status (check if scoring device has claimed the code)
  useEffect(() => {
    if (!pairingCode || cameraState === "paired") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pairing/status?code=${pairingCode}`);
        if (res.ok) {
          const data = (await res.json()) as { status: string };
          if (data.status === "paired") {
            setCameraState("paired");
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [pairingCode, cameraState]);

  // Start WebRTC CameraPeer once paired
  useEffect(() => {
    if (cameraState !== "paired" || !pairingId || !outputStreamRef.current) return;

    const supabase = createClient();
    const peer = new CameraPeer(supabase, pairingId, outputStreamRef.current);
    cameraPeerRef.current = peer;

    return () => {
      peer.destroy();
      cameraPeerRef.current = null;
    };
  }, [cameraState, pairingId]);

  // Heartbeat: ping server every 15s while paired so stream page can detect disconnect
  useEffect(() => {
    if (!pairingCode || cameraState !== "paired") return;

    // Send initial heartbeat immediately
    void fetch("/api/pairing/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: pairingCode }),
    });

    const interval = setInterval(() => {
      void fetch("/api/pairing/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pairingCode }),
      });
    }, 15_000);

    // Best-effort disconnect on tab close
    function handlePageHide() {
      if (pairingCode) {
        navigator.sendBeacon(
          "/api/pairing/disconnect",
          new Blob([JSON.stringify({ code: pairingCode })], {
            type: "application/json",
          })
        );
      }
    }

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [pairingCode, cameraState]);

  async function handleDisconnect() {
    // Destroy WebRTC peer
    cameraPeerRef.current?.destroy();
    cameraPeerRef.current = null;

    // Notify server
    if (pairingCode) {
      try {
        await fetch("/api/pairing/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: pairingCode }),
        });
      } catch {
        // Best-effort
      }
    }

    // Stop camera tracks
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    streamRef.current = null;

    setCameraState("loading");
    setPairingCode(null);
    setPairingId(null);
    codeGenerated.current = false;
  }

  function handleRetry() {
    cameraPeerRef.current?.destroy();
    cameraPeerRef.current = null;
    setErrorMessage("");
    setCameraState("loading");
    setPairingCode(null);
    setPairingId(null);
    codeGenerated.current = false;
    window.location.reload();
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3">
        <h1 className="text-center text-lg font-bold">Link Your Camera</h1>
        {cameraState !== "paired" && (
          <p className="mt-1 text-center text-xs text-zinc-500">
            Enter the code below in the DartStreamer app on your scoring device
          </p>
        )}
      </div>

      {/* Camera preview — square crop */}
      <div className="flex flex-1 items-center justify-center bg-black px-4 py-4">
        <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-xl bg-zinc-900">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="hidden"
          />
          <canvas
            ref={canvasRef}
            className="h-full w-full object-cover"
          />
          {cameraState === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-zinc-400">Starting camera&hellip;</p>
            </div>
          )}
          {cameraState === "paired" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <div className="flex flex-col items-center gap-2">
                <span className="h-4 w-4 rounded-full bg-emerald-400" />
                <p className="text-lg font-semibold text-emerald-300">Connected</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4 p-4">
        {/* Zoom slider */}
        {(cameraState === "ready" || cameraState === "paired") && (
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

        {/* Pairing code display */}
        {cameraState === "ready" && pairingCode && (
          <div className="space-y-3">
            <div className="rounded-xl bg-zinc-800 p-4">
              <p className="text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                Code
              </p>
              <p className="mt-2 text-center font-mono text-4xl font-bold tracking-widest text-white">
                {pairingCode.slice(0, 3)} {pairingCode.slice(3)}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
              <p className="text-sm text-zinc-400">Waiting to be linked...</p>
            </div>
          </div>
        )}

        {cameraState === "ready" && !pairingCode && (
          <div className="flex h-12 items-center justify-center">
            <p className="text-zinc-400">Generating code&hellip;</p>
          </div>
        )}

        {cameraState === "paired" && (
          <div className="space-y-3">
            <div className="flex h-12 items-center justify-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-400" />
              <p className="font-semibold text-emerald-300">Camera paired and streaming</p>
            </div>
            <p className="text-center text-xs text-zinc-500">
              Keep this tab open and in the foreground
            </p>
            <button
              onClick={() => void handleDisconnect()}
              className="h-12 w-full rounded-lg border border-red-700 font-medium text-red-400 transition-colors hover:bg-red-900/20"
            >
              Disconnect Camera
            </button>
          </div>
        )}

        {cameraState === "error" && (
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
