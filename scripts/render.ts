/**
 * Thin wrapper around `remotion render` for the cloud (no-GPU) container. It
 * logs start/finish milestones to App Logs (via agentLog) and injects the
 * defaults that make a headless render actually complete here — each overridable
 * by passing the flag yourself:
 *
 *   Usage:
 *     npx tsx scripts/render.ts <CompositionId> <out/name.mp4> [extra remotion flags...]
 *
 * The defaults, and why:
 *   --concurrency=1        swangle is SOFTWARE rasterization; one tab already
 *                          uses several CPU threads, so extra tabs just contend
 *                          and render SLOWER (and can hit ERR_INSUFFICIENT_RESOURCES).
 *   --gl=swangle           this Chromium build only ships egl-angle: plain "angle"
 *                          needs a GPU (none here) and "swiftshader" isn't compiled
 *                          in. "swangle" (SwiftShader-backed ANGLE) is the one that
 *                          renders without a GPU. (Keep comps WebGL2-free anyway.)
 *   --timeout=300000       the Rspack bundle can take a couple of minutes; the
 *                          default 30s browser timeout would kill it mid-bundle.
 *   --browser-executable   use the SYSTEM chromium; otherwise Remotion tries to
 *                          download chrome-headless-shell into a root-owned
 *                          node_modules and EACCES-fails.
 *   TMPDIR -> ./.rendertmp Remotion writes every intermediate frame to os.tmpdir();
 *                          the container's /tmp is a 64MB tmpfs that fills at ~580
 *                          frames. Redirect it to the project dir (on the big disk).
 *
 * Remotion's own progress still streams through (stdio is inherited).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { agentLog } from "./lib/agentlog";

function main() {
  const argv = process.argv.slice(2);
  const [compositionId, outPath, ...rest] = argv;
  if (!compositionId || !outPath) {
    console.error("Usage: npx tsx scripts/render.ts <CompositionId> <out/name.mp4> [extra flags]");
    process.exit(1);
  }

  const has = (flag: string) => rest.some((a) => a === flag || a.startsWith(`${flag}=`));

  // Inject each default only if the caller didn't pass it (see docstring).
  const defaults: string[] = [];
  if (!has("--concurrency")) defaults.push("--concurrency=1");
  if (!has("--gl")) defaults.push("--gl=swangle");
  if (!has("--timeout")) defaults.push("--timeout=300000");
  if (!has("--browser-executable")) {
    const chromium =
      process.env.REMOTION_CHROME_EXECUTABLE || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";
    defaults.push(`--browser-executable=${chromium}`);
  }

  // Keep intermediate frames off the tiny /tmp tmpfs — point at a dir on the
  // project's (big) disk. Honor a caller-set TMPDIR if there is one.
  const renderTmp = path.resolve(".rendertmp");
  fs.mkdirSync(renderTmp, { recursive: true });
  const tmpdir = process.env.TMPDIR && process.env.TMPDIR.length > 0 ? process.env.TMPDIR : renderTmp;

  const args = ["remotion", "render", compositionId, outPath, ...defaults, ...rest];
  agentLog(`render: ${compositionId} → ${outPath} [${defaults.join(" ") || "all flags from caller"}]`);

  const started = Date.now();
  const child = spawn("npx", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, TMPDIR: tmpdir },
  });

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
