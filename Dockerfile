# Remotion render environment: Node + system Chromium + ffmpeg + prebuilt whisper.cpp.
# Used as a Viclix `docker` runtime so agents in the container can actually build
# videos end-to-end (Remotion needs headless Chrome + ffmpeg; captions need whisper.cpp).
FROM node:22-bookworm-slim

# Chromium + ffmpeg + the shared libs a headless Chrome needs, plus a C toolchain
# (build-essential + cmake) so whisper.cpp compiles, and git/python/curl for tooling.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium ffmpeg fonts-liberation ca-certificates git python3 curl \
      build-essential cmake \
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
# Include devDependencies (tsx, dotenv, puppeteer, typescript) — the whole asset
# pipeline runs through them at RUNTIME, so NODE_ENV=production must NOT omit them.
RUN npm ci --include=dev

# Pre-build whisper.cpp (v1.5.5) and pre-download the medium.en model into
# /app/whisper.cpp — exactly the version/model/path scripts/generate-captions.ts
# expects — so a caption run is instant and deterministic instead of cloning +
# compiling + downloading ~1.5GB on every run. This layer is cached across source
# changes (only re-runs when the lockfile changes), and .dockerignore keeps any
# local whisper.cpp out of the build context so the baked one below survives COPY.
RUN node --input-type=module -e "import {installWhisperCpp,downloadWhisperModel} from '@remotion/install-whisper-cpp'; await installWhisperCpp({to:'/app/whisper.cpp',version:'1.5.5'}); await downloadWhisperModel({model:'medium.en',folder:'/app/whisper.cpp'}); console.log('whisper.cpp prebaked');"

COPY . .

# Keep the container alive and browsable (serves out/ and public/).
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
