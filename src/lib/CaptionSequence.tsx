import React from "react";
import { Sequence, useVideoConfig } from "remotion";
import type { TikTokPage } from "@remotion/captions";

const msToFrames = (ms: number, fps: number) => Math.round((ms / 1000) * fps);

/**
 * Turns caption pages (from useCaptionPages) into timed <Sequence>s.
 *
 * A page stays on screen until the next one is about to start — no blackout
 * between sentences. It only disappears early when there's a real pause in
 * the speech (>= silenceThresholdMs of silence after the page's last word),
 * in which case it fades out `silenceThresholdMs` after that last word
 * instead of lingering through the whole silence.
 */
export const CaptionSequence: React.FC<{
  pages: TikTokPage[];
  silenceThresholdMs?: number;
  renderPage: (page: TikTokPage) => React.ReactNode;
}> = ({ pages, silenceThresholdMs = 1000, renderPage }) => {
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <>
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = msToFrames(page.startMs, fps);
        const lastTokenEndMs = page.tokens[page.tokens.length - 1]?.toMs ?? page.startMs;

        let endFrame: number;
        if (nextPage) {
          const silenceGapMs = nextPage.startMs - lastTokenEndMs;
          const endMs =
            silenceGapMs < silenceThresholdMs ? nextPage.startMs : lastTokenEndMs + silenceThresholdMs;
          endFrame = msToFrames(endMs, fps);
        } else {
          // Last page: ride out to the end of the composition instead of
          // vanishing after an arbitrary duration.
          endFrame = durationInFrames;
        }

        const durationInFramesForPage = endFrame - startFrame;
        if (durationInFramesForPage <= 0) {
          return null;
        }

        return (
          <Sequence key={page.startMs} from={startFrame} durationInFrames={durationInFramesForPage} layout="none">
            {renderPage(page)}
          </Sequence>
        );
      })}
    </>
  );
};
