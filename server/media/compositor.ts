export interface CompositorConfig {
  camera1Sdp: string;
  camera2Sdp: string;
  scoreboardPath: string;
  outputUrl: string;
}

export class Compositor {
  private readonly config: CompositorConfig;

  constructor(config: CompositorConfig) {
    this.config = config;
  }

  buildFilterGraph(): string {
    return "[0:v][1:v]hstack=inputs=2[cameras];[cameras][2:v]overlay=0:H-overlay_h[out]";
  }

  buildArgs(): string[] {
    const { camera1Sdp, camera2Sdp, scoreboardPath, outputUrl } = this.config;

    return [
      // Allow SDP/RTP/UDP protocols
      "-protocol_whitelist", "file,rtp,udp",

      // Input 0: camera 1 SDP
      "-i", camera1Sdp,

      // Input 1: camera 2 SDP
      "-i", camera2Sdp,

      // Input 2: scoreboard overlay (SVG/image, looped)
      "-loop", "1",
      "-i", scoreboardPath,

      // Filter graph
      "-filter_complex", this.buildFilterGraph(),
      "-map", "[out]",

      // Audio: mix camera 1 audio (first available)
      "-map", "0:a?",

      // Video encoding
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-tune", "zerolatency",
      "-b:v", "2500k",
      "-maxrate", "2500k",
      "-bufsize", "5000k",
      "-pix_fmt", "yuv420p",
      "-g", "60",

      // Audio encoding
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "44100",

      // Output format for RTMP
      "-f", "flv",
      outputUrl,
    ];
  }
}
