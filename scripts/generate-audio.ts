/**
 * Generate narration audio for a script.
 *
 * Usage:
 *   npx tsx scripts/generate-audio.ts <slug> [--provider fish|edge] [--voice <id>] [--speed 1.0]
 *
 * Reads content/<slug>/script.txt and writes public/<slug>/audio.mp3
 * (public/ so Remotion compositions can `staticFile()` it, and so the
 * next step — generate-captions.ts — can transcribe it in place).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import "dotenv/config";
import { synthesize, type TtsProvider } from "./lib/tts";
import { agentLog } from "./lib/agentlog";

// A narration longer than this makes the render take far too long (software
// rendering on the no-GPU container is ~1 frame/second, so a 2.5-min video is
// ~90 min of render and blows the run budget). Overridable via MAX_AUDIO_SECONDS.
const MAX_SECONDS = Number(process.env.MAX_AUDIO_SECONDS) || 90;

function parseArgs(argv: string[]) {
  const [slug, ...rest] = argv;
  if (!slug) {
    console.error("Usage: npx tsx scripts/generate-audio.ts <slug> [--provider fish|edge] [--voice <id>] [--speed 1.0]");
    process.exit(1);
  }

  const opts: { provider?: TtsProvider; voice?: string; speed?: number } = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--provider") opts.provider = rest[++i] as TtsProvider;
    else if (arg === "--voice") opts.voice = rest[++i];
    else if (arg === "--speed") opts.speed = Number(rest[++i]);
  }
  return { slug, ...opts };
}

async function main() {
  const { slug, provider, voice, speed } = parseArgs(process.argv.slice(2));

  const scriptPath = path.join("content", slug, "script.txt");
  const text = (await fs.readFile(scriptPath, "utf-8")).trim();
  if (!text) {
    throw new Error(`${scriptPath} is empty.`);
  }

  agentLog(`[${slug}] audio: synthesizing narration (${text.length} chars, provider=${provider ?? "default"})`);
  const outFile = path.join("public", slug, "audio.mp3");
  const result = await synthesize({ text, outFile, provider, voice, speed });

  // Measure the result and enforce the length budget.
  const durationStr = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${result.outFile}"`)
    .toString()
    .trim();
  const seconds = Math.round(parseFloat(durationStr));
  agentLog(`[${slug}] audio: done → ${result.outFile} (${seconds}s, provider=${result.provider}, voice=${result.voice})`);

  // FAIL (but recoverably) if the narration is too long. This is a normal tool
  // error the agent recovers from — it does NOT end the run. The agent should
  // tighten content/<slug>/script.txt and run generate-audio again.
  if (seconds > MAX_SECONDS) {
    console.error(
      `\n❌ NARRATION TOO LONG: ${seconds}s (max ${MAX_SECONDS}s).\n` +
        `FIX IT: edit content/${slug}/script.txt down to ~130 words (~60s) — paraphrase harder in the ` +
        `character's voice, keep the hook + 3 numbered steps + closer, drop the rest — then run ` +
        `generate-audio.ts again. Do NOT proceed to captions/images/render until the audio is <= ${MAX_SECONDS}s.\n`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
