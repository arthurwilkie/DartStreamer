import { FFmpegPipeline } from "./ffmpeg-pipeline.js";

export type StreamStatus = "healthy" | "degraded" | "error";

export interface HealthData {
  fps: number;
  bitrate: number;
  droppedFrames: number;
  cpuUsage: number;
  uptime: number;
  status: StreamStatus;
}

interface ParsedStats {
  fps?: number;
  bitrate?: number;
  droppedFrames?: number;
}

export class HealthMonitor {
  private readonly pipeline: FFmpegPipeline;
  private lastStats: ParsedStats = {};
  private prevCpuUsage: NodeJS.CpuUsage = process.cpuUsage();

  constructor(pipeline: FFmpegPipeline) {
    this.pipeline = pipeline;

    // Hook into FFmpeg stderr lines
    const originalOnLog = pipeline.onLog;
    pipeline.onLog = (line: string) => {
      originalOnLog?.(line);
      const parsed = this.parseFFmpegStats(line);
      if (Object.keys(parsed).length > 0) {
        this.lastStats = { ...this.lastStats, ...parsed };
      }
    };
  }

  parseFFmpegStats(stderrLine: string): ParsedStats {
    const result: ParsedStats = {};

    // FFmpeg progress lines look like:
    // frame=  120 fps= 25 q=28.0 size=    1024kB time=00:00:04.80 bitrate=1745.2kbits/s speed=1.00x drop=0
    const fpsMatch = /fps=\s*([\d.]+)/.exec(stderrLine);
    if (fpsMatch) {
      result.fps = parseFloat(fpsMatch[1]);
    }

    const bitrateMatch = /bitrate=\s*([\d.]+)kbits\/s/.exec(stderrLine);
    if (bitrateMatch) {
      result.bitrate = parseFloat(bitrateMatch[1]);
    }

    const dropMatch = /drop=\s*(\d+)/.exec(stderrLine);
    if (dropMatch) {
      result.droppedFrames = parseInt(dropMatch[1], 10);
    }

    return result;
  }

  getHealth(): HealthData {
    const currentCpu = process.cpuUsage(this.prevCpuUsage);
    this.prevCpuUsage = process.cpuUsage();

    // Convert microseconds to a rough percentage over the interval
    const totalMicros = currentCpu.user + currentCpu.system;
    const cpuUsage = Math.min(100, totalMicros / 10_000); // rough estimate

    const fps = this.lastStats.fps ?? 0;
    const bitrate = this.lastStats.bitrate ?? 0;
    const droppedFrames = this.lastStats.droppedFrames ?? 0;
    const uptime = this.pipeline.getUptime();

    let status: StreamStatus = "healthy";
    if (!this.pipeline.isRunning()) {
      status = "error";
    } else if (fps < 20 || droppedFrames > 10) {
      status = "degraded";
    }

    return {
      fps,
      bitrate,
      droppedFrames,
      cpuUsage,
      uptime,
      status,
    };
  }
}
