# DartStreamer VPS control plane

Headless renderer + RTMP publisher. Receives signed broadcast URLs from the
webapp, spawns an Xvfb + Chromium + FFmpeg pipeline per session, and pushes
H264/AAC FLV to YouTube's RTMP ingest.

## Endpoints

All state-changing endpoints require header `X-Control-Secret: $VPS_CONTROL_SECRET`.

- `GET  /health` — liveness probe
- `POST /start` — body `{ sessionId, broadcastUrl, streamKey }`
- `POST /stop`  — body `{ sessionId }`
- `GET  /status?sessionId=...` — whether a pipeline is running

## Env

- `PORT` (default 4100)
- `VPS_CONTROL_SECRET` (required) — shared with the webapp
- `CHROMIUM_PATH` (default `/usr/bin/chromium-browser`)

## Deploy

```bash
docker build -t dartstreamer-vps-control-plane .
docker run -d --name dartstreamer-control \
  -p 4100:4100 \
  -e VPS_CONTROL_SECRET=$(openssl rand -hex 32) \
  --restart unless-stopped \
  --shm-size=1g \
  dartstreamer-vps-control-plane
```

Put the same `VPS_CONTROL_SECRET` value in the webapp's env. Expose via reverse
proxy (nginx/caddy) with TLS on whichever hostname the webapp will POST to.
