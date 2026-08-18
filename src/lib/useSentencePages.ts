import { useMemo } from "react";
import type { Caption } from "@remotion/captions";
import type { TikTokPage, TikTokToken } from "@remotion/captions";

// Merges whisper's sub-word tokens (e.g. "2" + "nd" + "," -> "2nd,") into
// whole words, using the same "no leading space = continuation" convention
// @remotion/captions itself uses. Exception: whisper occasionally drops the
// leading space before a standalone all-caps acronym (e.g. "EU" + "AI" ->
// "EUAI" instead of "EU AI") — real sub-word continuations are never a bare
// 2+ letter uppercase token, so treat that case as a new (space-prefixed)
// word instead of a continuation.
const captionsToWords = (captions: Caption[]): TikTokToken[] => {
  const words: TikTokToken[] = [];

  for (const c of captions) {
    if (c.text.trim() === "") continue;

    const isAcronymGlitch = words.length > 0 && /^[A-Z]{2,}$/.test(c.text);

    if (words.length > 0 && !c.text.startsWith(" ") && !isAcronymGlitch) {
      const last = words[words.length - 1];
      last.text += c.text;
      last.toMs = c.endMs;
    } else {
      words.push({ text: isAcronymGlitch ? ` ${c.text}` : c.text, fromMs: c.startMs, toMs: c.endMs });
    }
  }

  return words;
};

const SENTENCE_END = /[.!?]$/;

const wordsToSentences = (words: TikTokToken[]): TikTokToken[][] => {
  const sentences: TikTokToken[][] = [];
  let current: TikTokToken[] = [];

  for (const word of words) {
    current.push(word);
    if (SENTENCE_END.test(word.text.trim())) {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length > 0) sentences.push(current);

  return sentences;
};

// Splits into `n` roughly equal chunks by word count, so a long sentence
// becomes even halves/thirds instead of a lopsided window cut.
const splitEvenly = (words: TikTokToken[], n: number): TikTokToken[][] => {
  const chunks: TikTokToken[][] = [];
  const base = Math.floor(words.length / n);
  let extra = words.length % n;
  let i = 0;

  for (let c = 0; c < n; c++) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    chunks.push(words.slice(i, i + size));
    i += size;
  }

  return chunks.filter((chunk) => chunk.length > 0);
};

const wordsToPage = (words: TikTokToken[]): TikTokPage => {
  const tokens = words.map((w, i) => (i === 0 ? { ...w, text: w.text.trimStart() } : w));

  return {
    text: tokens
      .map((t) => t.text)
      .join("")
      .trim(),
    startMs: tokens[0].fromMs,
    tokens,
    durationMs: tokens[tokens.length - 1].toMs - tokens[0].fromMs,
  };
};

/**
 * Groups captions into pages by sentence instead of a fixed time window —
 * a short sentence (<= maxWordsPerPage) becomes one page; a longer one is
 * split into the smallest number of roughly-even chunks that keeps each
 * page under maxWordsPerPage, so it reads as halves/thirds rather than
 * arbitrary 2-3 word cuts.
 */
export const groupCaptionsBySentence = (captions: Caption[], maxWordsPerPage: number): TikTokPage[] => {
  const sentences = wordsToSentences(captionsToWords(captions));
  const pages: TikTokPage[] = [];

  for (const sentence of sentences) {
    const numPages = Math.max(1, Math.ceil(sentence.length / maxWordsPerPage));
    const chunks = numPages === 1 ? [sentence] : splitEvenly(sentence, numPages);
    for (const chunk of chunks) {
      if (chunk.length > 0) pages.push(wordsToPage(chunk));
    }
  }

  return pages;
};

export const useSentencePages = (captions: Caption[] | null, maxWordsPerPage: number): TikTokPage[] => {
  return useMemo(() => {
    if (!captions) return [];
    return groupCaptionsBySentence(captions, maxWordsPerPage);
  }, [captions, maxWordsPerPage]);
};
