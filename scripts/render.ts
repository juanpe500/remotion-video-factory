/**
 * Thin wrapper around `remotion render` that logs start/finish milestones to
 * App Logs (via agentLog) and defaults --concurrency to a container-safe value.
 *
 * Usage:
 *   npx tsx scripts/render.ts <CompositionId> <out/name.mp4> [--concurrency N] [extra remotion flags...]
 *
 * Why a wrapper: the app container is 1 vCPU / 2GB. Remotion's default
 * concurrency equals the core count (8 here), which spawns too many Chromium
 * tabs and OOMs. This forces --concurrency=2 unless the caller overrides it,
 * and emits a plain-text record of each render into Viclix's App Logs so a run
 * can be followed without opening the agent chat. Remotion's own progress still
 * streams through (stdio is inherited).
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
  const hasConcurrency = rest.some((a) => a === "--concurrency" || a.startsWith("--concurrency="));
  const concurrencyArgs = hasConcurrency ? [] : ["--concurrency=2"];

  const args = ["remotion", "render", compositionId, outPath, ...concurrencyArgs, ...rest];
  agentLog(`render: ${compositionId} → ${outPath} (${hasConcurrency ? "custom concurrency" : "concurrency=2"})`);

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
