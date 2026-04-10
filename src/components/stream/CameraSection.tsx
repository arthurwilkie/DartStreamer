"use client";

import { useState, useCallback } from "react";

type CameraType = "none" | "device" | "external";
type ConnectionStatus = "disconnected" | "connecting" | "connected";

interface Props {
  sessionId: string;
  activeCameraType: CameraType;
  deviceStatus: ConnectionStatus;
  externalStatus: ConnectionStatus;
  onActivateDevice: () => void;
  onDeactivateDevice: () => void;
  onClaimExternalCode: (code: string) => void;
  onDisconnectExternal: () => void;
}

export function CameraSection({
  activeCameraType,
  deviceStatus,
  externalStatus,
  onActivateDevice,
  onDeactivateDevice,
  onClaimExternalCode,
  onDisconnectExternal,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");

  const handleDeviceToggle = useCallback(() => {
    if (activeCameraType === "external" && externalStatus === "connected") {
      setError("Disconnect your external camera first.");
      return;
    }
    setError(null);
    if (deviceStatus === "connected") {
      onDeactivateDevice();
    } else {
      onActivateDevice();
    }
  }, [activeCameraType, externalStatus, deviceStatus, onActivateDevice, onDeactivateDevice]);

  const handleExternalToggle = useCallback(() => {
    if (activeCameraType === "device" && deviceStatus === "connected") {
      setError("Disconnect your device camera first.");
      return;
    }
    setError(null);
    if (externalStatus === "connected") {
      onDisconnectExternal();
    }
  }, [activeCameraType, deviceStatus, externalStatus, onDisconnectExternal]);

  const handleSubmitCode = useCallback(() => {
    const cleaned = codeInput.replace(/\s/g, "");
    if (!/^\d{6}$/.test(cleaned)) {
      setError("Enter a valid 6-digit code.");
      return;
    }
    if (activeCameraType === "device" && deviceStatus === "connected") {
      setError("Disconnect your device camera first.");
      return;
    }
    setError(null);
    onClaimExternalCode(cleaned);
    setCodeInput("");
  }, [codeInput, activeCameraType, deviceStatus, onClaimExternalCode]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Camera
      </h2>

      {error && (
        <p className="mt-3 rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {/* Device camera option */}
        <div className="rounded-lg bg-zinc-800 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-700">
                <svg className="h-5 w-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">Device Camera</p>
                <p className="text-xs text-zinc-500">Use this device&apos;s camera</p>
              </div>
            </div>
            <StatusBadge status={deviceStatus} />
          </div>
          <button
            onClick={handleDeviceToggle}
            className={`mt-3 w-full rounded-lg py-2 text-sm font-medium transition-colors ${
              deviceStatus === "connected"
                ? "border border-red-700 text-red-400 hover:bg-red-900/20"
                : "bg-emerald-600 text-white hover:bg-emerald-500"
            }`}
          >
            {deviceStatus === "connected"
              ? "Disconnect"
              : deviceStatus === "connecting"
              ? "Connecting..."
              : "Connect"}
          </button>
        </div>

        {/* External camera option */}
        <div className="rounded-lg bg-zinc-800 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-700">
                <svg className="h-5 w-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">External Camera</p>
                <p className="text-xs text-zinc-500">Use a separate device</p>
              </div>
            </div>
            <StatusBadge status={externalStatus} />
          </div>

          {externalStatus === "connected" ? (
            <button
              onClick={handleExternalToggle}
              className="mt-3 w-full rounded-lg border border-red-700 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/20"
            >
              Disconnect
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-zinc-400">
                Open{" "}
                <span className="font-mono font-medium text-zinc-200">
                  darts.vaderspace.com/camera
                </span>{" "}
                on your external device, then enter the 6-digit code shown there.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={7}
                  value={codeInput}
                  onChange={(e) => {
                    // Allow digits and a single space for "123 456" format
                    const raw = e.target.value.replace(/[^\d\s]/g, "");
                    setCodeInput(raw);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmitCode();
                  }}
                  placeholder="123 456"
                  className="flex-1 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-center font-mono text-lg tracking-widest text-white placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  onClick={handleSubmitCode}
                  disabled={externalStatus === "connecting"}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  {externalStatus === "connecting" ? "..." : "Link"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === "connected") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-900/30 px-2.5 py-1 text-xs font-medium text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        Connected
      </span>
    );
  }
  if (status === "connecting") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-yellow-900/30 px-2.5 py-1 text-xs font-medium text-yellow-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
        Connecting
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-500">
      <span className="h-2 w-2 rounded-full bg-zinc-600" />
      Disconnected
    </span>
  );
}
