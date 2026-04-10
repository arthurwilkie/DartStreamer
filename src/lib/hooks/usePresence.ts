"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

export function usePresence() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Send initial heartbeat
    sendHeartbeat();

    // Set up recurring heartbeat
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // On page close, attempt to mark offline
    function handleBeforeUnload() {
      // sendBeacon for reliable delivery on page close
      navigator.sendBeacon(
        "/api/presence",
        new Blob([JSON.stringify({ offline: true })], {
          type: "application/json",
        })
      );
    }

    // On visibility change, send heartbeat when returning
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        sendHeartbeat();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}

async function sendHeartbeat() {
  try {
    await fetch("/api/presence", { method: "POST" });
  } catch {
    // Silently ignore heartbeat failures
  }
}
