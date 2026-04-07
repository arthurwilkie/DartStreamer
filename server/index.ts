import "dotenv/config";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { createWorkerAndRouter, getIceServers } from "./media/mediasoup-config.js";
import { RoomManager } from "./media/room.js";
import { createStreamRouter } from "./stream-api.js";
import type { DtlsParameters, RtpParameters, MediaKind } from "mediasoup/types";

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const NODE_ENV = process.env.NODE_ENV ?? "development";

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: NODE_ENV, ts: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// HTTP/HTTPS server
// ---------------------------------------------------------------------------
function createServer(): http.Server | https.Server {
  const certDir = "/etc/letsencrypt/live";
  const domain = process.env.DOMAIN ?? "";
  const certPath = `${certDir}/${domain}/fullchain.pem`;
  const keyPath = `${certDir}/${domain}/privkey.pem`;

  if (NODE_ENV !== "development" && domain && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log("Starting HTTPS server with Let's Encrypt certs");
    return https.createServer(
      {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      },
      app
    );
  }

  console.log("Starting HTTP server (development mode or certs not found)");
  return http.createServer(app);
}

// ---------------------------------------------------------------------------
// mediasoup bootstrap
// ---------------------------------------------------------------------------
const { router } = await createWorkerAndRouter();
const roomManager = new RoomManager(router);

// Mount stream control router
app.use("/api/stream", createStreamRouter(router, roomManager));

// ---------------------------------------------------------------------------
// REST routes
// ---------------------------------------------------------------------------
app.post("/api/rooms/:roomId/join", (req, res) => {
  const { roomId } = req.params;
  const peerId = uuidv4();
  roomManager.getOrCreate(roomId);
  console.log(`Peer ${peerId} joined room ${roomId}`);
  res.json({ roomId, peerId, routerRtpCapabilities: router.rtpCapabilities, iceServers: getIceServers() });
});

// ---------------------------------------------------------------------------
// WebSocket signaling
// ---------------------------------------------------------------------------
type SignalMessage =
  | { type: "createTransport"; roomId: string; peerId: string; direction: "send" | "recv" }
  | { type: "connectTransport"; roomId: string; peerId: string; transportId: string; dtlsParameters: DtlsParameters }
  | { type: "produce"; roomId: string; peerId: string; transportId: string; kind: MediaKind; rtpParameters: RtpParameters }
  | { type: "consume"; roomId: string; peerId: string; transportId: string; producerId: string }
  | { type: "getProducers"; roomId: string; peerId: string };

function send(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function handleMessage(ws: WebSocket, raw: string): Promise<void> {
  let msg: SignalMessage;
  try {
    msg = JSON.parse(raw) as SignalMessage;
  } catch {
    send(ws, { error: "Invalid JSON" });
    return;
  }

  try {
    switch (msg.type) {
      case "createTransport": {
        const room = roomManager.getOrCreate(msg.roomId);
        const params = await room.createWebRtcTransport(msg.peerId);
        send(ws, { type: "transportCreated", ...params });
        break;
      }

      case "connectTransport": {
        const room = roomManager.get(msg.roomId);
        if (!room) throw new Error(`Room ${msg.roomId} not found`);
        await room.connectTransport(msg.peerId, msg.transportId, msg.dtlsParameters);
        send(ws, { type: "transportConnected", transportId: msg.transportId });
        break;
      }

      case "produce": {
        const room = roomManager.get(msg.roomId);
        if (!room) throw new Error(`Room ${msg.roomId} not found`);
        const { id } = await room.produce(msg.peerId, msg.transportId, msg.kind, msg.rtpParameters);
        send(ws, { type: "produced", producerId: id });
        break;
      }

      case "consume": {
        const room = roomManager.get(msg.roomId);
        if (!room) throw new Error(`Room ${msg.roomId} not found`);
        const consumerParams = await room.consume(msg.peerId, msg.transportId, msg.producerId);
        send(ws, { type: "consumed", ...consumerParams });
        break;
      }

      case "getProducers": {
        const room = roomManager.get(msg.roomId);
        const producerIds = room ? room.getProducerIds() : [];
        send(ws, { type: "producers", producerIds });
        break;
      }

      default: {
        send(ws, { error: "Unknown message type" });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Signaling error:", message);
    send(ws, { error: message });
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const server = createServer();

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  console.log("WebSocket connection from", req.socket.remoteAddress);

  ws.on("message", (data) => {
    handleMessage(ws, data.toString()).catch(console.error);
  });

  ws.on("close", () => {
    console.log("WebSocket disconnected", req.socket.remoteAddress);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
});

server.listen(PORT, () => {
  console.log(`DartStreamer server listening on port ${PORT} (${NODE_ENV})`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  roomManager.closeAll();
  server.close(() => process.exit(0));
});
