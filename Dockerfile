# Remotion render environment: Node + system Chromium + ffmpeg.
# Used as a Viclix `docker` runtime so agents in the container can actually
# render videos (Remotion needs a headless Chrome + ffmpeg).
FROM node:22-bookworm-slim

# Chromium + ffmpeg + the shared libs a headless Chrome needs, plus git/python
# for tooling (whisper.cpp build, etc.).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium ffmpeg fonts-liberation ca-certificates git python3 curl \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
      libasound2 libpango-1.0-0 libcairo2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Use the system Chromium instead of downloading a separate one.
ENV REMOTION_CHROME_EXECUTABLE=/usr/bin/chromium \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    NODE_ENV=production \
    CI=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Keep the container alive and browsable (serves out/ and public/).
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
