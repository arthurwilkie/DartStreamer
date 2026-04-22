import express, { type Request, type Response, type NextFunction } from "express";
import { startPipeline, type PipelineHandle } from "./pipeline.js";

const PORT = Number(process.env.PORT ?? 4100);
const CONTROL_SECRET = process.env.VPS_CONTROL_SECRET;
const CHROMIUM_PATH = process.env.CHROMIUM_PATH ?? "/usr/bin/chromium-browser";

if (!CONTROL_SECRET) {
  console.error("VPS_CONTROL_SECRET is required");
  process.exit(1);
}

const sessions = new Map<string, PipelineHandle>();

const app = express();
app.use(express.json({ limit: "32kb" }));

function requireSecret(req: Request, res: Response, next: NextFunction) {
  if (req.header("x-control-secret") !== CONTROL_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, activeSessions: sessions.size });
});

app.post("/start", requireSecret, (req, res) => {
  const { sessionId, broadcastUrl, streamKey } = req.body as {
    sessionId?: string;
    broadcastUrl?: string;
    streamKey?: string;
  };

  if (!sessionId || !broadcastUrl || !streamKey) {
    res.status(400).json({ error: "sessionId, broadcastUrl, streamKey required" });
    return;
  }

  const existing = sessions.get(sessionId);
  if (existing) {
    res.status(409).json({ error: "Session already live", startedAt: existing.startedAt });
    return;
  }

  try {
    const handle = startPipeline({
      sessionId,
      broadcastUrl,
      streamKey,
      chromiumPath: CHROMIUM_PATH,
    });
    sessions.set(sessionId, handle);

    handle.ffmpeg.on("exit", (code, signal) => {
      console.log(`[${sessionId}] ffmpeg exited code=${code} signal=${signal}`);
      const h = sessions.get(sessionId);
      if (h === handle) {
        h.stop();
        sessions.delete(sessionId);
      }
    });

    res.json({ ok: true, sessionId, startedAt: handle.startedAt });
  } catch (err) {
    console.error(`[${sessionId}] start failed`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/stop", requireSecret, (req, res) => {
  const { sessionId } = req.body as { sessionId?: string };
  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" });
    return;
  }
  const handle = sessions.get(sessionId);
  if (!handle) {
    res.json({ ok: true, alreadyStopped: true });
    return;
  }
  handle.stop();
  sessions.delete(sessionId);
  res.json({ ok: true });
});

app.get("/status", requireSecret, (req, res) => {
  const sessionId = req.query.sessionId as string | undefined;
  if (!sessionId) {
    res.json({ active: Array.from(sessions.keys()) });
    return;
  }
  const handle = sessions.get(sessionId);
  res.json({
    sessionId,
    live: !!handle,
    startedAt: handle?.startedAt ?? null,
  });
});

const server = app.listen(PORT, () => {
  console.log(`VPS control plane listening on :${PORT}`);
});

function shutdown() {
  console.log("Shutting down, stopping all sessions");
  for (const handle of sessions.values()) handle.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
