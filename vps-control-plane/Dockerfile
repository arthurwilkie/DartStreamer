FROM node:22-slim

# Xvfb + Chromium + FFmpeg + fonts for anything the broadcast page draws.
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    chromium \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
    dumb-init \
  && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc && npm prune --omit=dev

EXPOSE 4100
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
