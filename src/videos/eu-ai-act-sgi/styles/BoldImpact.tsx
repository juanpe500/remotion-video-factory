import React from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import type { TikTokPage } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/ArchivoBlack";
import { useCaptions } from "../../../lib/useCaptions";
import { useCaptionPages } from "../../../lib/useCaptionPages";
import { CaptionSequence } from "../../../lib/CaptionSequence";
import { AUDIO_FILE, CAPTIONS_FILE } from "../config";

// Loud, high-contrast, word-by-word kinetic type. The genre-default look for
// this kind of "here's what to do" business/tech reel.
const { fontFamily } = loadFont("normal", { weights: ["400"], subsets: ["latin"] });

const SWITCH_MS = 850;
const HIGHLIGHT = "#FFE000";

const Page: React.FC<{ page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;
  const absoluteTimeMs = page.startMs + currentTimeMs;

  const pop = interpolate(frame, [0, 6], [0.82, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(2.2)),
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 90 }}>
      <div
        style={{
          fontFamily,
          fontSize: 96,
          lineHeight: 1.05,
          textAlign: "center",
          textTransform: "uppercase",
          scale: pop,
          whiteSpace: "pre-wrap",
        }}
      >
        {page.tokens.map((token) => {
          const isActive = token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;
          return (
            <span
              key={token.fromMs}
              style={{
                color: isActive ? HIGHLIGHT : "white",
                textShadow: "0 6px 0 rgba(0,0,0,0.5)",
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const EuAiActBoldImpact: React.FC = () => {
  const captions = useCaptions(CAPTIONS_FILE);
  const pages = useCaptionPages(captions, SWITCH_MS);

  if (!captions) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0A" }}>
      <Audio src={staticFile(AUDIO_FILE)} />
      <CaptionSequence pages={pages} renderPage={(page) => <Page page={page} />} />
    </AbsoluteFill>
  );
};
