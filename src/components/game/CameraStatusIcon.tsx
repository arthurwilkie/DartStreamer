"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/SessionContext";

interface Props {
  onOpenDeviceCamera: () => void;
}

export function CameraStatusIcon({ onOpenDeviceCamera }: Props) {
  const router = useRouter();
  const { cameraStatus } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const anyConnected =
    cameraStatus.device === "connected" ||
    cameraStatus.external === "connected";

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;

    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="relative flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-zinc-800"
      >
        <svg
          className="h-5 w-5 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        {/* Status indicator */}
        <span
          className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-zinc-950 ${
            anyConnected ? "bg-emerald-400" : "bg-zinc-600"
          }`}
        />
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-zinc-700 bg-zinc-800 p-2 shadow-lg">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Cameras
          </p>

          {/* Device camera */}
          <button
            onClick={() => {
              setMenuOpen(false);
              onOpenDeviceCamera();
            }}
            className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-700"
          >
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-zinc-300">Device</span>
            </div>
            <StatusLabel status={cameraStatus.device} />
          </button>

          {/* External camera */}
          <button
            onClick={() => {
              setMenuOpen(false);
              router.push("/stream");
            }}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-700"
          >
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-zinc-300">External</span>
            </div>
            <StatusLabel status={cameraStatus.external} />
          </button>
        </div>
      )}
    </div>
  );
}

function StatusLabel({ status }: { status: "connected" | "disconnected" }) {
  if (status === "connected") {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Connected
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-zinc-500">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
      Disconnected
    </span>
  );
}
