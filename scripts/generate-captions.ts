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
const WHISPER_MODEL = "medium.en";

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

  const whisperDir = path.join(process.cwd(), "whisper.cpp");
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
