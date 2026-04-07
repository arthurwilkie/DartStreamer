import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { Compositor } from "./compositor.js";

const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";
const SIGINT_TIMEOUT_MS = 5000;

export class FFmpegPipeline extends EventEmitter {
  private readonly compositor: Compositor;
  private process: ChildProcess | null = null;
  private stopping = false;
  private startTime: number | null = null;

  onError?: (err: Error) => void;
  onLog?: (line: string) => void;

  constructor(compositor: Compositor) {
    super();
    this.compositor = compositor;
  }

  start(): void {
    if (this.process) {
      throw new Error("FFmpegPipeline is already running");
    }

    const args = this.compositor.buildArgs();
    console.log("Starting FFmpeg:", FFMPEG_BIN, args.join(" "));

    this.stopping = false;
    this.startTime = Date.now();

    const proc = spawn(FFMPEG_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.process = proc;

    proc.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      this.onLog?.(line);
      this.emit("health", line);
    });

    proc.on("error", (err) => {
      console.error("FFmpeg process error:", err.message);
      this.process = null;
      this.startTime = null;
      this.onError?.(err);
      this.emit("error", err);
    });

    proc.on("exit", (code, signal) => {
      this.process = null;
      this.startTime = null;
      if (!this.stopping) {
        const msg = `FFmpeg exited unexpectedly: code=${String(code)} signal=${String(signal)}`;
        console.error(msg);
        const err = new Error(msg);
        this.onError?.(err);
        this.emit("error", err);
      }
      this.emit("stopped", { code, signal });
      console.log("FFmpeg stopped");
    });

    this.emit("started");
    console.log("FFmpeg pipeline started (pid:", proc.pid, ")");
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      this.stopping = true;
      const proc = this.process;

      const timeout = setTimeout(() => {
        console.warn("FFmpeg did not exit after SIGINT, sending SIGTERM");
        proc.kill("SIGTERM");
        resolve();
      }, SIGINT_TIMEOUT_MS);

      proc.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      proc.kill("SIGINT");
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    this.start();
  }

  isRunning(): boolean {
    return this.process !== null && !this.stopping;
  }

  getUptime(): number {
    if (this.startTime === null) return 0;
    return Date.now() - this.startTime;
  }
}
