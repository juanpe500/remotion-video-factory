/**
 * Build a reusable "expression bank" of short character interjections
 * ("Aha!", "Hmm", "No no no", laughs, sighs…) and cache one mp3 per
 * expression under public/brand/voice/. Once cached, we can drop an "Aha!"
 * into any video WITHOUT calling Fish again.
 *
 * We synthesize ONE expression per call. A single blob split by silence was
 * tried first but mis-aligns: interjections have internal pauses (commas,
 * repeated "no no no") that silence-detection can't tell apart from the
 * separators. Since the s2.1-pro-free endpoint is free, per-expression calls
 * are the same cost and give perfectly clean, correctly-aligned clips.
 *
 * Usage: npx tsx scripts/generate-expressions.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import "dotenv/config";
import { synthesize } from "./lib/tts";

const OUT_DIR = path.join("public", "brand", "voice");
const CONCURRENCY = 6; // free endpoint sustains far more; keep it polite

type Expr = { id: string; text: string };

function ffprobeDurationMs(file: string): number {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    { encoding: "utf-8" },
  );
  return Math.round(parseFloat(r.stdout.trim()) * 1000);
}

async function pool<T>(items: T[], size: number, fn: (item: T, i: number) => Promise<void>) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const input = JSON.parse(await fs.readFile(path.join("content", "voice", "expressions.json"), "utf-8"));
  const all: Expr[] = input.expressions;
  // Optional id args re-roll just those clips (Fish occasionally emits a bad
  // take); with no args, generate the whole bank.
  const only = process.argv.slice(2);
  const exprs = only.length ? all.filter((e) => only.includes(e.id)) : all;
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log(`Synthesizing ${exprs.length} expressions (1 call each, ${CONCURRENCY} concurrent)…`);
  let done = 0;
  await pool(exprs, CONCURRENCY, async (e) => {
    const out = path.join(OUT_DIR, `${e.id}.mp3`);
    await synthesize({ text: e.text, outFile: out, provider: "fish" });
    done += 1;
    process.stdout.write(`\r  ${done}/${exprs.length}  (${e.id})            `);
  });
  process.stdout.write("\n");

  const manifest = all.map((e) => {
    const file = path.join(OUT_DIR, `${e.id}.mp3`);
    return {
      id: e.id,
      text: e.text,
      tag: (e.text.match(/^\[([^\]]+)\]/) ?? [])[1] ?? null,
      file: `brand/voice/${e.id}.mp3`,
      durationMs: ffprobeDurationMs(file),
    };
  });

  await fs.writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifest.length} clips + manifest.json to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
