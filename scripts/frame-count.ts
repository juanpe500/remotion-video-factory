/**
 * Print a composition's durationInFrames and write it to frames.txt.
 *
 * Runs the REAL audio-synced calculateMetadata (via selectComposition) so the
 * count matches exactly what `remotion render` will use — matrix-render.yml
 * splits the render into inclusive `--frames=START-END` chunks off this number,
 * and an off-by-one would push the last chunk's END out of range and fail it.
 *
 *   npx tsx scripts/frame-count.ts <slug> [compositionId]
 *
 * @remotion/bundler and @remotion/renderer ship as deps of @remotion/cli; the
 * workflow also `npm i --no-save`s them pinned before calling this, so the
 * import always resolves.
 */
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, selectComposition } from "@remotion/renderer";

async function main() {
  const slug = process.argv[2];
  const compId = process.argv[3] || slug;
  if (!slug) {
    console.error("usage: frame-count.ts <slug> [compositionId]");
    process.exit(1);
  }

  await ensureBrowser();
  // bundle() uses the default (webpack) bundler — remotion.config.ts (rspack)
  // does not apply to Node APIs. We only evaluate calculateMetadata here (no
  // frames rendered), and Root.tsx's import.meta.webpackContext is a native
  // webpack feature, so the count is identical to a real render.
  const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
  const comp = await selectComposition({ serveUrl, id: compId });

  const frames = String(comp.durationInFrames);
  fs.writeFileSync("frames.txt", frames);
  console.error(`[frame-count] ${compId}: ${frames} frames`);
  process.stdout.write(frames);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
