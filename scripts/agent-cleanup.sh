#!/usr/bin/env bash
# Agent entry_script — runs once before each maintenance-agent run (docker exec
# -w /app). Kills leftover processes from a PREVIOUS run that a cancel/timeout
# left behind (orphaned Remotion renders, Chromium/crashpad, whisper, stale tsx
# pipelines) and clears the intermediate render-frame dir, so a fresh run starts
# on a clean container instead of fighting stale processes for CPU/RAM.
#
# It NEVER touches PID 1 (tini + node server.mjs) or its own shell. There is no
# in-flight pipeline yet when this runs, so it can only hit leftovers.
set +e

SELF=$$

# Command-line patterns that only a render/pipeline run produces. (This script's
# own argv is "agent-cleanup.sh", so none of these match it.)
for pat in "remotion render" "scripts/render.ts" "scripts/generate-" "/opt/whisper/main" "puppeteer_dev_chrome"; do
  for pid in $(pgrep -f "$pat" 2>/dev/null); do
    [ "$pid" = "$SELF" ] && continue
    kill -9 "$pid" 2>/dev/null
  done
done

# Chromium only ever runs here for a render or a screenshot — any live instance
# is a leftover. tini reaps the resulting zombies.
pkill -9 -f "/usr/lib/chromium" 2>/dev/null
pkill -9 -f "chrome_crashpad" 2>/dev/null

# Stale intermediate render frames (scripts/render.ts points TMPDIR here).
rm -rf /app/.rendertmp/* 2>/dev/null

echo "[agent-cleanup] killed leftover render/pipeline processes + cleared .rendertmp"
exit 0
