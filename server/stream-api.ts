import { Router as ExpressRouter, Request, Response } from "express";
import path from "node:path";
import os from "node:os";
import type { Router as MediasoupRouter } from "mediasoup/types";
import { PlainTransportBridge } from "./media/plain-transport.js";
import { writeSdpFiles } from "./media/sdp-generator.js";
import { ScoreboardRenderer } from "./media/scoreboard-renderer.js";
import { Compositor } from "./media/compositor.js";
import { FFmpegPipeline } from "./media/ffmpeg-pipeline.js";
import { HealthMonitor } from "./media/health.js";
import { RoomManager } from "./media/room.js";

interface ActiveStream {
  bridge: PlainTransportBridge;
  scoreboard: ScoreboardRenderer;
  pipeline: FFmpegPipeline;
  health: HealthMonitor;
}

const activeStreams = new Map<string, ActiveStream>();
const SDP_DIR = path.join(os.tmpdir(), "dartstreamer-sdp");

export function createStreamRouter(
  mediasoupRouter: MediasoupRouter,
  roomManager: RoomManager
): ExpressRouter {
  const router = ExpressRouter();

  // POST /api/stream/start
  router.post("/start", async (req: Request, res: Response) => {
    try {
      const { roomId, streamKey, gameId } = req.body as {
        roomId?: string;
        streamKey?: string;
        gameId?: string;
      };

      if (!roomId || !streamKey) {
        res.status(400).json({ error: "roomId and streamKey are required" });
        return;
      }

      const room = roomManager.get(roomId);
      if (!room) {
        res.status(404).json({ error: `Room ${roomId} not found` });
        return;
      }

      // Stop existing stream for this room if any
      const existing = activeStreams.get(roomId);
      if (existing) {
        await existing.pipeline.stop();
        existing.bridge.close();
        existing.scoreboard.unsubscribe();
        activeStreams.delete(roomId);
      }

      // 1. Bridge mediasoup producers to plain UDP RTP
      const bridge = new PlainTransportBridge(mediasoupRouter);
      await bridge.bridgeRoom(room);

      // 2. Write SDP files for FFmpeg
      const videoProducers = room.getProducersByKind("video");
      const audioProducers = room.getProducersByKind("audio");

      const producerInfos = [
        ...videoProducers.slice(0, 2).map((p, i) => ({
          port: i === 0 ? 5004 : 5006,
          codec: "vp8",
          payloadType: 96,
          kind: "video",
        })),
        ...audioProducers.slice(0, 2).map((p, i) => ({
          port: i === 0 ? 5005 : 5007,
          codec: "opus",
          payloadType: 111,
          kind: "audio",
        })),
      ];

      const sdpFiles = writeSdpFiles(SDP_DIR, producerInfos);
      const camera1Sdp = sdpFiles[0] ?? path.join(SDP_DIR, "video-0.sdp");
      const camera2Sdp = sdpFiles[1] ?? path.join(SDP_DIR, "video-1.sdp");

      // 3. Start scoreboard renderer
      const scoreboardPath = path.join(SDP_DIR, "scoreboard.svg");
      const supabaseUrl = process.env.SUPABASE_URL ?? "";
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

      const scoreboard = new ScoreboardRenderer({
        supabaseUrl,
        supabaseKey,
        outputPath: scoreboardPath,
      });

      // Render an initial blank scoreboard
      scoreboard.renderScoreboard({});

      if (gameId) {
        scoreboard.subscribeToGame(gameId);
      }

      // 4. Build compositor and start FFmpeg
      const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;
      const compositor = new Compositor({
        camera1Sdp,
        camera2Sdp,
        scoreboardPath,
        outputUrl: rtmpUrl,
      });

      const pipeline = new FFmpegPipeline(compositor);
      const health = new HealthMonitor(pipeline);

      pipeline.onError = (err) => {
        console.error(`FFmpeg pipeline error for room ${roomId}:`, err.message);
      };

      pipeline.start();

      activeStreams.set(roomId, { bridge, scoreboard, pipeline, health });

      res.json({ status: "started", roomId, rtmpUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Stream start error:", message);
      res.status(500).json({ error: message });
    }
  });

  // POST /api/stream/stop
  router.post("/stop", async (req: Request, res: Response) => {
    try {
      const { roomId } = req.body as { roomId?: string };

      if (!roomId) {
        res.status(400).json({ error: "roomId is required" });
        return;
      }

      const stream = activeStreams.get(roomId);
      if (!stream) {
        res.status(404).json({ error: `No active stream for room ${roomId}` });
        return;
      }

      await stream.pipeline.stop();
      stream.bridge.close();
      stream.scoreboard.unsubscribe();
      activeStreams.delete(roomId);

      res.json({ status: "stopped", roomId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Stream stop error:", message);
      res.status(500).json({ error: message });
    }
  });

  // GET /api/stream/health
  router.get("/health", (req: Request, res: Response) => {
    const { roomId } = req.query as { roomId?: string };

    if (!roomId) {
      // Return all active streams summary
      const summary = Array.from(activeStreams.entries()).map(([id, s]) => ({
        roomId: id,
        ...s.health.getHealth(),
      }));
      res.json({ streams: summary });
      return;
    }

    const stream = activeStreams.get(roomId);
    if (!stream) {
      res.status(404).json({ error: `No active stream for room ${roomId}` });
      return;
    }

    res.json({ roomId, ...stream.health.getHealth() });
  });

  return router;
}
