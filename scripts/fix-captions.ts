/**
 * Reconcile whisper captions against the ORIGINAL script (ground truth).
 *
 *   npx tsx scripts/fix-captions.ts <slug>
 *
 * Whisper mishears homophones — "pool" → "pull", "cue" → "queue", "their" →
 * "there". We already have the exact words we sent to TTS, so we don't need a
 * model to fix them: align whisper's words to the script and, where whisper's
 * word is a CLOSE mismatch of the aligned script word (small edit distance),
 * replace it with the script's word. Timing stays whisper's; only the text is
 * corrected. Big mismatches are left alone so a bad alignment can't garble a
 * caption. Runs on the GitHub runner right after generate-captions, before the
 * render — captions.json (@remotion/captions Caption[]) is edited in place.
 */
import fs from "node:fs";
import path from "node:path";

type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
};

// A whisper "word" = one or more caption tokens ("2"+"nd"+"," → "2nd,"). A token
// with no leading space continues the previous word (same convention the
// player uses in src/lib/useSentencePages.ts). We keep the token index span so a
// correction can be written straight back onto those tokens.
type Word = { text: string; tokenStart: number; tokenEnd: number };

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // drop punctuation/spaces for matching
    .trim();

function mergeTokensToWords(caps: Caption[]): Word[] {
  const words: Word[] = [];
  for (let i = 0; i < caps.length; i++) {
    const t = caps[i];
    if (t.text.trim() === "") continue;
    const isAcronymGlitch = words.length > 0 && /^[A-Z]{2,}$/.test(t.text);
    if (words.length > 0 && !t.text.startsWith(" ") && !isAcronymGlitch) {
      const last = words[words.length - 1];
      last.text += t.text;
      last.tokenEnd = i;
    } else {
      words.push({ text: t.text, tokenStart: i, tokenEnd: i });
    }
  }
  return words;
}

function scriptToWords(script: string): string[] {
  return script
    .replace(/\[[^\]]*\]/g, " ") // strip Fish audio tags like [confident]
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => norm(w).length > 0);
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// Needleman-Wunsch alignment of two word sequences (on normalized text).
// Returns pairs [capIdx|null, scriptIdx|null] in order.
function align(capNorm: string[], scrNorm: string[]): Array<[number | null, number | null]> {
  const n = capNorm.length;
  const m = scrNorm.length;
  const GAP = -1;
  const MATCH = 2;
  const MISMATCH = -1;
  const score: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) score[i][0] = i * GAP;
  for (let j = 0; j <= m; j++) score[0][j] = j * GAP;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = capNorm[i - 1] === scrNorm[j - 1] ? MATCH : MISMATCH;
      score[i][j] = Math.max(score[i - 1][j - 1] + s, score[i - 1][j] + GAP, score[i][j - 1] + GAP);
    }
  }
  const pairs: Array<[number | null, number | null]> = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const s = capNorm[i - 1] === scrNorm[j - 1] ? MATCH : MISMATCH;
      if (score[i][j] === score[i - 1][j - 1] + s) {
        pairs.push([i - 1, j - 1]);
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && score[i][j] === score[i - 1][j] + GAP) {
      pairs.push([i - 1, null]);
      i--;
    } else {
      pairs.push([null, j - 1]);
      j--;
    }
  }
  pairs.reverse();
  return pairs;
}

// Known homophone/near-homophone groups whisper commonly swaps — caught even
// when the edit distance is larger than the threshold below (e.g. cue/queue).
const HOMOPHONE_GROUPS = [
  ["pool", "pull"],
  ["cue", "queue", "q"],
  ["to", "too", "two"],
  ["their", "there", "theyre"],
  ["your", "youre"],
  ["its", "its"],
  ["then", "than"],
  ["lose", "loose"],
  ["site", "sight", "cite"],
  ["byte", "bite"],
  ["cache", "cash"],
  ["cores", "course"],
  ["hertz", "hurts"],
];
const HOMOPHONE = new Map<string, number>();
HOMOPHONE_GROUPS.forEach((g, i) => g.forEach((w) => HOMOPHONE.set(w, i)));

// Is `cap` a close mishearing of `scr` (both normalized)? Either a known
// homophone pair, or a small edit distance relative to length. Conservative so
// unrelated words are never swapped.
function isCloseMishear(cap: string, scr: string): boolean {
  if (cap === scr || scr.length === 0) return false;
  const hc = HOMOPHONE.get(cap);
  if (hc !== undefined && hc === HOMOPHONE.get(scr)) return true;
  const L = Math.max(cap.length, scr.length);
  const allowed = L <= 3 ? 1 : L <= 6 ? 2 : 3;
  return editDistance(cap, scr) <= allowed;
}

function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("usage: fix-captions.ts <slug>");
    process.exit(1);
  }
  const capPath = path.resolve("public", slug, "captions.json");
  const scriptPath = path.resolve("content", slug, "script.txt");
  if (!fs.existsSync(capPath) || !fs.existsSync(scriptPath)) {
    console.error(`[fix-captions] missing ${!fs.existsSync(capPath) ? capPath : scriptPath} — skipping`);
    return;
  }

  const caps: Caption[] = JSON.parse(fs.readFileSync(capPath, "utf-8"));
  const scriptWords = scriptToWords(fs.readFileSync(scriptPath, "utf-8"));
  const words = mergeTokensToWords(caps);

  const capNorm = words.map((w) => norm(w.text));
  const scrNorm = scriptWords.map(norm);
  const pairs = align(capNorm, scrNorm);

  const fixes: string[] = [];
  for (const [ci, si] of pairs) {
    if (ci === null || si === null) continue;
    const cw = capNorm[ci];
    const sw = scrNorm[si];
    if (!isCloseMishear(cw, sw)) continue;

    const w = words[ci];
    const first = caps[w.tokenStart];
    const leading = first.text.startsWith(" ") ? " " : "";
    // Keep the script word's own casing/punctuation.
    const replacement = leading + scriptWords[si];
    fixes.push(`"${w.text.trim()}" → "${scriptWords[si]}"`);
    // Write the whole corrected word onto the first token; blank the rest (the
    // player skips empty tokens) and stretch the first token to the word's end
    // so its typed-out duration is unchanged.
    first.text = replacement;
    first.endMs = caps[w.tokenEnd].endMs;
    for (let k = w.tokenStart + 1; k <= w.tokenEnd; k++) caps[k].text = "";
  }

  if (fixes.length === 0) {
    console.log(`[fix-captions] ${slug}: no homophone fixes needed (${words.length} words)`);
    return;
  }
  fs.writeFileSync(capPath, JSON.stringify(caps, null, 2));
  console.log(`[fix-captions] ${slug}: applied ${fixes.length} fix(es): ${fixes.join(", ")}`);
}

main();
