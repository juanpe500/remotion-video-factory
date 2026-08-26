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
import { agentLog } from "./lib/agentlog";

const WHISPER_VERSION = "1.5.5";
// Env-overridable: constrained containers cap RAM, and medium.en (1.5GB) can OOM on
// load. Deployments set WHISPER_MODEL=small.en (487MB, ample quality for caption
// timing). Locally it defaults to medium.en. Whichever is set must be the model baked
// into WHISPER_DIR — /opt/whisper is read-only at runtime, so a download can't happen.
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? "medium.en";

// Kill any whisper.cpp still transcribing THIS slug's wav before we spawn our own.
// whisper is CPU-bound and slow; if a previous invocation's parent died (e.g. the
// agent's exec wrapper hit its 120s timeout and abandoned the call), its whisper child
// is orphaned onto PID 1 and keeps pinning cores. A naive retry then spawns a SECOND
// whisper racing the first on the same output file — neither finishes — and any
// survivor competes with the later render (observed: a leftover whisper inflated a
// render ETA from ~25min to 4.5h). Reaping here makes every (re)run start from a single
// clean transcription. pkill matches the binary AND this slug's wav, so it can never
// touch an unrelated caption job. Exit code 1 (nothing matched) is the healthy case.
function killStaleWhisper(wavPath: string) {
  try {
    execSync(`pkill -9 -f "main .*${wavPath}"`, { stdio: "ignore" });
  } catch {
    /* pkill exits 1 when no process matched — normal, nothing to reap. */
  }
}

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

  // Reap any orphaned whisper on this wav BEFORE spawning ours, so a retry can never
  // end up with two racing transcriptions. Also register the same reap on SIGTERM/SIGINT
  // so that if THIS process is asked to stop mid-transcribe, it doesn't leave its own
  // whisper child running to fight the render. (SIGKILL can't be trapped — the start-of-
  // run reap on the next invocation is the backstop for that case.)
  killStaleWhisper(wavPath);
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      killStaleWhisper(wavPath);
      process.exit(1);
    });
  }

  execSync(`ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 "${wavPath}"`, { stdio: "inherit" });

  agentLog(`[${slug}] captions: transcribing with whisper (${WHISPER_MODEL})…`);
  const whisperCppOutput = await transcribe({
    model: WHISPER_MODEL,
    whisperPath: whisperDir,
    whisperCppVersion: WHISPER_VERSION,
    inputPath: wavPath,
    tokenLevelTimestamps: true,
    // Cap whisper's thread pool. It otherwise spawns one thread per core (nproc=8
    // in the container); combined with node + esbuild that pressures the PID limit.
    // Two threads is plenty for a ~60s clip and keeps the whole chain well under it.
    // Greedy decoding (-bo 1 -bs 1) instead of whisper's default 5-beam / best-of-5
    // search: ~5x faster on CPU, and for clean TTS narration the word timing + the
    // "One/Two/Three" step markers we depend on are unaffected. Override via env if a
    // future voice ever needs the extra accuracy.
    additionalArgs: ["-t", "2", "-bo", "1", "-bs", "1"],
  });

  const { captions } = toCaptions({ whisperCppOutput });

  const outFile = path.resolve("public", slug, "captions.json");
  fs.writeFileSync(outFile, JSON.stringify(captions, null, 2));
  fs.unlinkSync(wavPath);

  agentLog(`[${slug}] captions: done → ${captions.length} tokens`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
