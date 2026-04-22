import { spawn, type ChildProcess } from "child_process";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const VIDEO_BITRATE = "4500k";
const AUDIO_BITRATE = "128k";

export interface PipelineHandle {
  sessionId: string;
  startedAt: number;
  xvfb: ChildProcess;
  chromium: ChildProcess;
  ffmpeg: ChildProcess;
  display: string;
  stop: () => void;
}

function pickDisplay(sessionId: string): string {
  // Derive a stable X display number per session (99–199 range).
  let hash = 0;
  for (const c of sessionId) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return `:${99 + (Math.abs(hash) % 100)}`;
}

export function startPipeline(params: {
  sessionId: string;
  broadcastUrl: string;
  streamKey: string;
  chromiumPath: string;
}): PipelineHandle {
  const { sessionId, broadcastUrl, streamKey, chromiumPath } = params;
  const display = pickDisplay(sessionId);
  const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

  const xvfb = spawn(
    "Xvfb",
    [display, "-screen", "0", `${WIDTH}x${HEIGHT}x24`, "-ac", "+extension", "RANDR"],
    { stdio: ["ignore", "inherit", "inherit"] }
  );

  // Give Xvfb a beat to open the socket before Chromium tries to connect.
  const chromium = spawn(
    chromiumPath,
    [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-features=TranslateUI,BlinkGenPropertyTrees",
      "--autoplay-policy=no-user-gesture-required",
      "--kiosk",
      `--window-size=${WIDTH},${HEIGHT}`,
      "--window-position=0,0",
      "--hide-scrollbars",
      "--user-data-dir=/tmp/chromium-" + sessionId,
      broadcastUrl,
    ],
    {
      env: { ...process.env, DISPLAY: display },
      stdio: ["ignore", "inherit", "inherit"],
    }
  );

  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-loglevel", "warning",
      "-f", "x11grab",
      "-framerate", String(FPS),
      "-video_size", `${WIDTH}x${HEIGHT}`,
      "-i", display,
      "-f", "lavfi",
      "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-tune", "zerolatency",
      "-pix_fmt", "yuv420p",
      "-g", String(FPS * 2),
      "-b:v", VIDEO_BITRATE,
      "-maxrate", VIDEO_BITRATE,
      "-bufsize", "9000k",
      "-c:a", "aac",
      "-b:a", AUDIO_BITRATE,
      "-ar", "44100",
      "-f", "flv",
      rtmpUrl,
    ],
    { stdio: ["ignore", "inherit", "inherit"] }
  );

  const stop = () => {
    try { ffmpeg.kill("SIGINT"); } catch {}
    try { chromium.kill("SIGTERM"); } catch {}
    try { xvfb.kill("SIGTERM"); } catch {}
  };

  return {
    sessionId,
    startedAt: Date.now(),
    xvfb,
    chromium,
    ffmpeg,
    display,
    stop,
  };
}
