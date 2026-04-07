export function buildFilterGraph(
  cameraCount: 0 | 1 | 2,
  scoreboardPath: string
): string {
  void scoreboardPath; // scoreboard is always the last input; path is in buildInputArgs

  switch (cameraCount) {
    case 2:
      return "[0:v][1:v]hstack=inputs=2[cameras];[cameras][2:v]overlay=0:H-overlay_h[out]";

    case 1:
      return "[0:v]scale=1280:720[cam];[cam][1:v]overlay=0:H-overlay_h[out]";

    case 0:
    default:
      // No cameras: display scoreboard centered on black background
      return "[0:v]scale=1280:720,setsar=1[out]";
  }
}

export function buildInputArgs(
  cameraCount: 0 | 1 | 2,
  sdpFiles: string[],
  scoreboardPath: string
): string[] {
  const args: string[] = ["-protocol_whitelist", "file,rtp,udp"];

  // Add camera SDP inputs
  for (let i = 0; i < cameraCount; i++) {
    const sdp = sdpFiles[i];
    if (sdp) {
      args.push("-i", sdp);
    }
  }

  // Add scoreboard as final input (looped still image / SVG)
  if (cameraCount > 0) {
    args.push("-loop", "1", "-i", scoreboardPath);
  } else {
    // For 0-camera mode the scoreboard IS the only visual
    args.push("-loop", "1", "-i", scoreboardPath);
  }

  return args;
}
