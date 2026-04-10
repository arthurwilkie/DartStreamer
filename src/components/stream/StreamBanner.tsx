"use client";

import { useRouter, usePathname } from "next/navigation";
import { useSession } from "@/lib/session/SessionContext";

export function StreamBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeSession, opponentName, cameraStatus, streamStatus } = useSession();

  const isHomePage = pathname === "/" || pathname === "/new-game";
  const hasSession = activeSession !== null;

  // Hidden when no session and not on home/new-game page
  if (!hasSession && !isHomePage) return null;

  const connectedCameras =
    (cameraStatus.device === "connected" ? 1 : 0) +
    (cameraStatus.external === "connected" ? 1 : 0);

  let bannerContent: { text: string; subtext?: string; accent: string; dot?: string };

  if (!hasSession) {
    bannerContent = {
      text: "Not streaming",
      subtext: "Tap to connect",
      accent: "bg-zinc-800 border-zinc-700",
    };
  } else if (streamStatus === "live") {
    bannerContent = {
      text: "LIVE",
      subtext: "Streaming to YouTube",
      accent: "bg-red-950/50 border-red-800",
      dot: "bg-red-500 animate-pulse",
    };
  } else {
    const cameraText =
      connectedCameras > 0
        ? `${connectedCameras} camera${connectedCameras > 1 ? "s" : ""} connected`
        : "No cameras";

    bannerContent = {
      text: opponentName ? `Session with ${opponentName}` : "Session active",
      subtext: cameraText,
      accent: "bg-emerald-950/30 border-emerald-800/50",
      dot: connectedCameras > 0 ? "bg-emerald-400" : undefined,
    };
  }

  return (
    <button
      onClick={() => router.push("/stream")}
      className={`w-full border-b px-4 py-2.5 text-left transition-colors hover:brightness-110 ${bannerContent.accent}`}
    >
      <div className="mx-auto flex max-w-md items-center gap-3">
        {bannerContent.dot && (
          <span className={`h-2.5 w-2.5 rounded-full ${bannerContent.dot}`} />
        )}
        {!bannerContent.dot && !hasSession && (
          <svg
            className="h-4 w-4 text-zinc-500"
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
        )}
        <div className="flex-1">
          <span className="text-sm font-medium text-white">
            {bannerContent.text}
          </span>
          {bannerContent.subtext && (
            <span className="ml-2 text-xs text-zinc-400">
              {bannerContent.subtext}
            </span>
          )}
        </div>
        <svg
          className="h-4 w-4 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </button>
  );
}
