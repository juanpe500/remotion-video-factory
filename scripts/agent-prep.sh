#!/usr/bin/env bash
# Agent entry_script — runs before each maintenance-agent run inside the app
# container (docker exec -w /app). On Viclix mounted runtimes, /app is the host
# checkout, which shadows the image's baked node_modules. So the pipeline tooling
# (tsx, dotenv, puppeteer) must be installed INTO the mounted /app once; it then
# persists on the host across runs (only a full redeploy re-clones and wipes it,
# which re-triggers this). whisper.cpp is baked at /opt/whisper by the Dockerfile
# and survives the mount, so nothing to do for it here.
set -e

if [ -x node_modules/.bin/tsx ] && [ -d node_modules/dotenv ] && [ -d node_modules/puppeteer ]; then
  echo "[agent-prep] node_modules already populated — skipping install"
  exit 0
fi

echo "[agent-prep] installing dependencies into mounted /app (one-time)…"
# --include=dev so devDependencies (tsx, dotenv, puppeteer, typescript) come in even
# if NODE_ENV=production is set in the container env.
npm ci --include=dev
echo "[agent-prep] done — tsx=$(node_modules/.bin/tsx --version 2>/dev/null || echo missing)"
