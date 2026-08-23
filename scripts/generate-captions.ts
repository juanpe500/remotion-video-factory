/**
 * Transcribe generated narration audio into word-level captions.
 *
 * Usage:
 *   npx tsx scripts/generate-captions.ts <slug>
 *
 * Reads public/<slug>/audio.mp3, runs it through whisper.cpp, and writes
 * public/<slug>/captions.json in the `@remotion/captions` `Caption[]` shape.
 * Whisper.cpp + model are downloaded once into ./whisper.cpp (gitignored).
 */
import path from "node:path";
import { execSync } from "node:child_process";
import fs from "node:fs";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";

const WHISPER_VERSION = "1.5.5";
// Env-overridable: constrained containers cap RAM, and medium.en (1.5GB) can OOM on
// load. Deployments set WHISPER_MODEL=small.en (487MB, ample quality for caption
// timing). Locally it defaults to medium.en. Whichever is set must be the model baked
// into WHISPER_DIR — /opt/whisper is read-only at runtime, so a download can't happen.
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? "medium.en";

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx scripts/generate-captions.ts <slug>");
    process.exit(1);
  }

  const audioPath = path.resolve("public", slug, "audio.mp3");
  if (!fs.existsSync(audioPath)) {
    throw new Error(`${audioPath} not found. Run generate-audio.ts first.`);
  }

  // WHISPER_DIR lets a deployment point at a whisper build baked OUTSIDE the project
  // dir (e.g. /opt/whisper in the Docker image) so it survives Viclix's bind-mount of
  // the checkout over /app. Locally it's unset → falls back to ./whisper.cpp. When the
  // baked build is already present these two calls are no-ops (they just verify).
  const whisperDir = process.env.WHISPER_DIR
    ? path.resolve(process.env.WHISPER_DIR)
    : path.join(process.cwd(), "whisper.cpp");
  await installWhisperCpp({ to: whisperDir, version: WHISPER_VERSION });
  await downloadWhisperModel({ model: WHISPER_MODEL, folder: whisperDir });

  // whisper.cpp needs a 16kHz mono wav. Absolute path — the whisper.cpp
  // binary is spawned with its own cwd, so a relative path won't resolve.
  const wavPath = path.resolve("public", slug, "audio.wav");
  execSync(`ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 "${wavPath}"`, { stdio: "inherit" });

  const whisperCppOutput = await transcribe({
    model: WHISPER_MODEL,
    whisperPath: whisperDir,
    whisperCppVersion: WHISPER_VERSION,
    inputPath: wavPath,
    tokenLevelTimestamps: true,
    // Cap whisper's thread pool. It otherwise spawns one thread per core (nproc=8
    // in the container); combined with node + esbuild that pressures the PID limit.
    // Two threads is plenty for a ~60s clip and keeps the whole chain well under it.
    additionalArgs: ["-t", "2"],
  });

  const { captions } = toCaptions({ whisperCppOutput });

  const outFile = path.resolve("public", slug, "captions.json");
  fs.writeFileSync(outFile, JSON.stringify(captions, null, 2));
  fs.unlinkSync(wavPath);

  console.log(`Wrote ${outFile} (${captions.length} tokens)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
