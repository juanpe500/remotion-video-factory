import React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import type { TikTokPage } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/Oswald";
import { useCaptions } from "../../../lib/useCaptions";
import { useCaptionPages } from "../../../lib/useCaptionPages";
import { CaptionSequence } from "../../../lib/CaptionSequence";
import { AUDIO_FILE, CAPTIONS_FILE } from "../config";

// Broadcast-news alert look — condensed bold type, red/black/white, a
// persistent "BREAKING" chip and lower-third ticker.
const { fontFamily } = loadFont("normal", { weights: ["500", "700"], subsets: ["latin"] });

const SWITCH_MS = 850;
const RED = "#E01B24";
const INK = "#111111";

const Page: React.FC<{ page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;
  const absoluteTimeMs = page.startMs + currentTimeMs;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 80px" }}>
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 88,
          lineHeight: 1.08,
          textAlign: "center",
          textTransform: "uppercase",
          color: "white",
          whiteSpace: "pre-wrap",
        }}
      >
        {page.tokens.map((token) => {
          const isActive = token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;
          return (
            <span
              key={token.fromMs}
              style={{
                backgroundColor: isActive ? RED : "transparent",
                boxDecorationBreak: "clone",
                WebkitBoxDecorationBreak: "clone",
                padding: isActive ? "2px 10px" : undefined,
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

const BreakingChip: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: 80,
      left: 80,
      backgroundColor: RED,
      color: "white",
      fontFamily,
      fontWeight: 700,
      fontSize: 30,
      letterSpacing: 2,
      padding: "10px 24px",
      textTransform: "uppercase",
    }}
  >
    Breaking
  </div>
);

const Ticker: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: "flex-end" }}>
    <div
      style={{
        backgroundColor: INK,
        color: "white",
        fontFamily,
        fontWeight: 500,
        fontSize: 30,
        letterSpacing: 3,
        textTransform: "uppercase",
        padding: "20px 80px",
        borderTop: `4px solid ${RED}`,
      }}
    >
      EU AI Act · Transparency Obligations Live Now
    </div>
  </AbsoluteFill>
);

export const EuAiActBreakingNews: React.FC = () => {
  const captions = useCaptions(CAPTIONS_FILE);
  const pages = useCaptionPages(captions, SWITCH_MS);

  if (!captions) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <Audio src={staticFile(AUDIO_FILE)} />
      <BreakingChip />
      <CaptionSequence pages={pages} renderPage={(page) => <Page page={page} />} />
      <Ticker />
    </AbsoluteFill>
  );
};
