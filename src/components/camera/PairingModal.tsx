"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PAIRING_EXPIRY_MS } from "@/lib/pairing/codes";

interface PairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  cameraPosition: "left" | "right";
}

type ModalState = "loading" | "waiting" | "paired" | "error" | "expired";

export function PairingModal({
  isOpen,
  onClose,
  sessionId,
  cameraPosition,
}: PairingModalProps) {
  const [modalState, setModalState] = useState<ModalState>("loading");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pairingIdRef = useRef<string | null>(null);

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fetchCode = useCallback(async () => {
    setModalState("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/pairing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, cameraPosition }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setErrorMessage(data.error ?? "Failed to generate pairing code.");
        setModalState("error");
        return;
      }

      const data = (await res.json()) as { code: string; expiresAt: string };
      setCode(data.code);
      const expiry = new Date(data.expiresAt).getTime();
      setExpiresAt(expiry);
      setTimeLeft(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));
      setModalState("waiting");
    } catch {
      setErrorMessage("Network error. Please try again.");
      setModalState("error");
    }
  }, [sessionId, cameraPosition]);

  // Fetch code on open
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      // Schedule fetch outside the effect's synchronous body
      const timer = setTimeout(() => void fetchCode(), 0);
      prevOpenRef.current = true;
      return () => clearTimeout(timer);
    }
    if (!isOpen && prevOpenRef.current) {
      clearPolling();
      // Reset state outside synchronous effect body
      const resetTimer = setTimeout(() => {
        setCode("");
        setExpiresAt(null);
        setModalState("loading");
      }, 0);
      pairingIdRef.current = null;
      prevOpenRef.current = false;
      return () => clearTimeout(resetTimer);
    }
  }, [isOpen, fetchCode, clearPolling]);

  // Countdown timer
  useEffect(() => {
    if (modalState !== "waiting" || expiresAt === null) return;

    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        clearPolling();
        setModalState("expired");
      }
    }, 500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [modalState, expiresAt, clearPolling]);

  // Poll for pairing status
  useEffect(() => {
    if (modalState !== "waiting" || !code) return;

    const supabase = createClient();

    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("camera_pairings")
        .select("id, status")
        .eq("pairing_code", code)
        .eq("status", "paired")
        .maybeSingle();

      if (data) {
        clearPolling();
        setModalState("paired");
        setTimeout(() => onClose(), 2000);
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [modalState, code, clearPolling, onClose]);

  // Auto-expire based on PAIRING_EXPIRY_MS if expiresAt drifts
  useEffect(() => {
    if (modalState !== "waiting") return;
    const timeout = setTimeout(
      () => {
        clearPolling();
        setModalState("expired");
      },
      PAIRING_EXPIRY_MS + 1000
    );
    return () => clearTimeout(timeout);
  }, [modalState, clearPolling]);

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerDisplay = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Pair {cameraPosition === "left" ? "Left" : "Right"} Camera
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {modalState === "loading" && (
          <p className="py-8 text-center text-zinc-400">Generating code&hellip;</p>
        )}

        {modalState === "waiting" && (
          <div className="space-y-5">
            <p className="text-sm text-zinc-400">
              Open{" "}
              <span className="font-medium text-white">dartstreamer.com/camera</span> on
              your camera phone and enter this code:
            </p>
            <div className="rounded-xl bg-zinc-800 py-5 text-center">
              <span className="font-mono text-5xl font-bold tracking-widest text-emerald-400">
                {code}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Waiting for camera&hellip;</span>
              <span
                className={`font-mono font-medium ${
                  timeLeft < 60 ? "text-amber-400" : "text-zinc-400"
                }`}
              >
                {timerDisplay}
              </span>
            </div>
          </div>
        )}

        {modalState === "paired" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-900">
              <span className="h-5 w-5 rounded-full bg-emerald-400" />
            </span>
            <p className="font-semibold text-emerald-300">Camera connected!</p>
            <p className="text-sm text-zinc-500">Closing automatically&hellip;</p>
          </div>
        )}

        {modalState === "expired" && (
          <div className="space-y-4">
            <p className="text-center text-sm text-amber-400">
              Code expired. Generate a new one.
            </p>
            <button
              onClick={() => void fetchCode()}
              className="h-12 w-full rounded-lg bg-emerald-600 font-bold text-white transition-colors hover:bg-emerald-500"
            >
              Generate New Code
            </button>
          </div>
        )}

        {modalState === "error" && (
          <div className="space-y-4">
            <p className="rounded-lg bg-red-950 px-4 py-3 text-sm text-red-300">
              {errorMessage}
            </p>
            <button
              onClick={() => void fetchCode()}
              className="h-12 w-full rounded-lg border border-zinc-600 font-medium text-zinc-300 transition-colors hover:border-zinc-500"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
