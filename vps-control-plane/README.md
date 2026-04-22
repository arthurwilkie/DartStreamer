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

## Production deploy (TLS via Caddy)

1. Point a DNS A record at the VPS (e.g. `control.darts.example.com`).
2. Edit `Caddyfile`, replace `control.example.com` with your hostname.
3. Create `.env` next to `docker-compose.yml`:

   ```
   VPS_CONTROL_SECRET=<openssl rand -hex 32>
   ```

4. Open firewall for 80 and 443 (host + cloud provider).
5. Bring it up:

   ```bash
   docker compose up -d --build
   ```

6. Check it:

   ```bash
   curl https://control.darts.example.com/health
   ```

7. In the webapp env, set `VPS_CONTROL_URL=https://control.darts.example.com`
   (no port — Caddy terminates on 443) and put the same `VPS_CONTROL_SECRET`
   in both places.

Caddy auto-renews the Let's Encrypt cert, and both containers restart on
crash via `restart: unless-stopped`.

## Dev / quick test (no TLS)

```bash
docker build -t dartstreamer-vps-control-plane .
docker run -d --name dartstreamer-control \
  -p 4100:4100 \
  -e VPS_CONTROL_SECRET=$(openssl rand -hex 32) \
  --restart unless-stopped --shm-size=1g \
  dartstreamer-vps-control-plane
```
