# Remotion render environment: Node + system Chromium + ffmpeg + prebuilt whisper.cpp.
# Runs as a Viclix `docker` runtime. IMPORTANT: on mounted runtimes Viclix bind-mounts
# the host checkout over /app at runtime, which HIDES anything baked into /app in this
# image (node_modules, a whisper dir under /app, etc.). So heavy prebuilt artifacts that
# the agent must see at runtime are baked OUTSIDE /app (e.g. /opt/whisper), which survives
# the mount. node_modules can't live outside the mount for resolution, so it's installed
# into the mounted /app once by the agent's entry_script (scripts/agent-prep.sh).
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
# NOTE: deliberately NOT setting NODE_ENV=production — the container's env is inherited
# by the agent's `docker exec`, and NODE_ENV=production makes `npm ci/install` skip the
# devDependencies (tsx, dotenv, puppeteer) that the whole asset pipeline runs on.
# WHISPER_DIR points the caption script at the baked whisper build (see below).
ENV REMOTION_CHROME_EXECUTABLE=/usr/bin/chromium \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    WHISPER_DIR=/opt/whisper \
    CI=1

WORKDIR /app

# node_modules here is only needed at BUILD time (to run the whisper prebake below) and
# for the node/nextjs baked runtimes; on a mounted runtime it's shadowed at runtime and
# the agent repopulates /app/node_modules via scripts/agent-prep.sh. --include=dev so the
# pipeline devDeps are present.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Pre-build whisper.cpp (v1.5.5) + pre-download the medium.en model into /opt/whisper —
# OUTSIDE /app so it survives Viclix's bind-mount of the host checkout over /app. This is
# exactly the version/model scripts/generate-captions.ts expects; WHISPER_DIR (above)
# points it here, so a caption run is instant instead of cloning + compiling + downloading
# ~1.5GB every time. Cached across source changes (only re-runs if the lockfile changes).
RUN node --input-type=module -e "import {installWhisperCpp,downloadWhisperModel} from '@remotion/install-whisper-cpp'; await installWhisperCpp({to:'/opt/whisper',version:'1.5.5'}); await downloadWhisperModel({model:'medium.en',folder:'/opt/whisper'}); console.log('whisper.cpp prebaked at /opt/whisper');"

COPY . .

# Keep the container alive and browsable (serves out/ and public/).
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
