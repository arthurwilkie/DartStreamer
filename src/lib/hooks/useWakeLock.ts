"use client";

import { useEffect } from "react";

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
};

export function useWakeLock(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined") return;
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const s = await wakeLock.request("screen");
        if (cancelled) {
          s.release().catch(() => {});
          return;
        }
        sentinel = s;
        s.addEventListener("release", () => {
          if (sentinel === s) sentinel = null;
        });
      } catch {
        // Ignored: wake lock may be blocked (e.g. page not visible, permissions)
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !sentinel) {
        acquire();
      }
    };

    acquire();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (sentinel) {
        sentinel.release().catch(() => {});
        sentinel = null;
      }
    };
  }, [enabled]);
}
