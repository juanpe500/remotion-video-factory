/**
 * List available free Edge TTS voices (optionally filtered), so you can pick
 * one for EDGE_TTS_VOICE in .env.
 *
 * Usage:
 *   npx tsx scripts/list-edge-voices.ts [filter]
 *   npx tsx scripts/list-edge-voices.ts en-US
 */
import { MsEdgeTTS } from "msedge-tts";

async function main() {
  const filter = process.argv[2]?.toLowerCase();
  const tts = new MsEdgeTTS();
  const voices = await tts.getVoices();

  const filtered = filter
    ? voices.filter((v) => v.ShortName.toLowerCase().includes(filter) || v.Locale.toLowerCase().includes(filter))
    : voices;

  for (const v of filtered) {
    console.log(`${v.ShortName}\t${v.Gender}\t${v.Locale}`);
  }
  console.log(`\n${filtered.length} voice(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
