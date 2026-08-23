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
import "dotenv/config";
import { synthesize, type TtsProvider } from "./lib/tts";
import { agentLog } from "./lib/agentlog";

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

  agentLog(`[${slug}] audio: done → ${result.outFile} (provider=${result.provider}, voice=${result.voice})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
