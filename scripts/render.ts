/**
 * Thin wrapper around `remotion render` that logs start/finish milestones to
 * App Logs (via agentLog) and defaults --concurrency to a container-safe value.
 *
 * Usage:
 *   npx tsx scripts/render.ts <CompositionId> <out/name.mp4> [--concurrency N] [extra remotion flags...]
 *
 * Why a wrapper: on the 1 vCPU / 2GB container Remotion (a) defaults concurrency
 * to the core count and OOMs, and (b) tries to download its own chrome-headless-
 * shell into a root-owned node_modules (EACCES). This forces --concurrency=1 and
 * --browser-executable=<system chromium> unless the caller overrides them, and
 * emits a plain-text record of each render into Viclix's App Logs so a run can be
 * followed without opening the agent chat. Remotion's own progress still streams
 * through (stdio is inherited).
 */
import { spawn } from "node:child_process";
import { agentLog } from "./lib/agentlog";

function main() {
  const argv = process.argv.slice(2);
  const [compositionId, outPath, ...rest] = argv;
  if (!compositionId || !outPath) {
    console.error("Usage: npx tsx scripts/render.ts <CompositionId> <out/name.mp4> [--concurrency N] [extra flags]");
    process.exit(1);
  }

  // Honor a caller-supplied --concurrency, otherwise inject the safe default.
  // The container is 1 vCPU / 2GB — concurrency 1 keeps a single 1080×1920
  // Chromium tab in RAM (extra tabs buy nothing on one core and risk OOM).
  const hasConcurrency = rest.some((a) => a === "--concurrency" || a.startsWith("--concurrency="));
  const concurrencyArgs = hasConcurrency ? [] : ["--concurrency=1"];

  // Force the SYSTEM Chromium. Without this, Remotion runs ensureBrowser() and
  // tries to download its own chrome-headless-shell into node_modules/.remotion —
  // which is root-owned here (synced from the image) so the download EACCES-fails.
  // REMOTION_CHROME_EXECUTABLE alone is NOT honored by the renderer; the
  // --browser-executable flag is. Skip only if the caller already passed one.
  const hasBrowser = rest.some((a) => a === "--browser-executable" || a.startsWith("--browser-executable="));
  const chromium = process.env.REMOTION_CHROME_EXECUTABLE || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";
  const browserArgs = hasBrowser ? [] : [`--browser-executable=${chromium}`];

  const args = ["remotion", "render", compositionId, outPath, ...concurrencyArgs, ...browserArgs, ...rest];
  agentLog(`render: ${compositionId} → ${outPath} (${hasConcurrency ? "custom concurrency" : "concurrency=1"}${hasBrowser ? "" : ", system chromium"})`);

  const started = Date.now();
  const child = spawn("npx", args, { stdio: "inherit", shell: process.platform === "win32" });

  child.on("exit", (code) => {
    const secs = Math.round((Date.now() - started) / 1000);
    if (code === 0) {
      agentLog(`render: done → ${outPath} (${secs}s)`);
    } else {
      agentLog(`render: FAILED (exit ${code}, ${secs}s) for ${compositionId}`);
    }
    process.exit(code ?? 1);
  });

  child.on("error", (err) => {
    agentLog(`render: could not start remotion — ${err.message}`);
    process.exit(1);
  });
}

main();
