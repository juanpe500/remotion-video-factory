/**
 * Provider-switchable TTS, mirroring the pattern used in the video-editor / Dream
 * Python projects: a `TTS_PROVIDER` env var picks the backend, each provider
 * resolves its own default voice, and callers can override both per-call.
 *
 * - "fish": Fish Audio REST API (paid, needs FISH_AUDIO_API_KEY).
 * - "edge": Microsoft Edge Read Aloud API (free, no key, good for iterating on style).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export type TtsProvider = "fish" | "edge";

export type SynthesizeOptions = {
  text: string;
  outFile: string;
  provider?: TtsProvider;
  voice?: string;
  speed?: number;
};

const DEFAULTS = {
  provider: (process.env.TTS_PROVIDER as TtsProvider | undefined) ?? "edge",
  fishApiKey: process.env.FISH_AUDIO_API_KEY,
  fishBaseUrl: process.env.FISH_BASE_URL ?? "https://api.fish.audio",
  fishVoice: process.env.FISH_AUDIO_DEFAULT_VOICE_ID,
  // Fish selects the TTS backend via a `model` header. Default to the free
  // S2.1-pro tier (free through 2026-08-31, fair use); override with FISH_MODEL.
  fishModel: process.env.FISH_MODEL ?? "s2.1-pro-free",
  fishFormat: "mp3",
  edgeVoice: process.env.EDGE_TTS_VOICE ?? "en-US-AndrewNeural",
};

export function resolveProvider(provider?: TtsProvider): TtsProvider {
  return provider ?? DEFAULTS.provider;
}

export function resolveVoice(provider: TtsProvider, voice?: string): string {
  if (voice) return voice;
  if (provider === "fish") {
    if (!DEFAULTS.fishVoice) {
      throw new Error(
        "No Fish Audio voice set. Pass `voice`, or set FISH_AUDIO_DEFAULT_VOICE_ID in .env.",
      );
    }
    return DEFAULTS.fishVoice;
  }
  return DEFAULTS.edgeVoice;
}

async function synthesizeFish(opts: {
  text: string;
  outFile: string;
  voice: string;
  speed?: number;
}) {
  if (!DEFAULTS.fishApiKey) {
    throw new Error(
      "FISH_AUDIO_API_KEY is not set. Copy .env.example to .env and fill it in, or use TTS_PROVIDER=edge.",
    );
  }

  const res = await fetch(`${DEFAULTS.fishBaseUrl}/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEFAULTS.fishApiKey}`,
      "Content-Type": "application/json",
      model: DEFAULTS.fishModel,
    },
    body: JSON.stringify({
      text: opts.text,
      reference_id: opts.voice,
      format: DEFAULTS.fishFormat,
      ...(opts.speed ? { speed: opts.speed } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Fish Audio TTS failed: ${res.status} ${res.statusText} ${body}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(opts.outFile), { recursive: true });
  await fs.writeFile(opts.outFile, buffer);
}

async function synthesizeEdge(opts: {
  text: string;
  outFile: string;
  voice: string;
  speed?: number;
}) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(opts.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

  const rate = opts.speed ? `${Math.round((opts.speed - 1) * 100)}%` : undefined;
  const dir = path.dirname(opts.outFile);
  await fs.mkdir(dir, { recursive: true });

  const { audioFilePath } = await tts.toFile(dir, opts.text, rate ? { rate } : undefined);

  // msedge-tts names the file itself; move it to the requested outFile name.
  if (path.resolve(audioFilePath) !== path.resolve(opts.outFile)) {
    await fs.rename(audioFilePath, opts.outFile);
  }
}

export async function synthesize(opts: SynthesizeOptions): Promise<{
  outFile: string;
  provider: TtsProvider;
  voice: string;
}> {
  const provider = resolveProvider(opts.provider);
  const voice = resolveVoice(provider, opts.voice);

  if (provider === "fish") {
    await synthesizeFish({ text: opts.text, outFile: opts.outFile, voice, speed: opts.speed });
  } else {
    await synthesizeEdge({ text: opts.text, outFile: opts.outFile, voice, speed: opts.speed });
  }

  return { outFile: opts.outFile, provider, voice };
}
