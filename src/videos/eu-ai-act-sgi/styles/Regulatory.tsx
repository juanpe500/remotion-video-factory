import React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import type { TikTokPage } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/SourceSerif4";
import { useCaptions } from "../../../lib/useCaptions";
import { useCaptionPages } from "../../../lib/useCaptionPages";
import { CaptionSequence } from "../../../lib/CaptionSequence";
import { AUDIO_FILE, CAPTIONS_FILE } from "../config";

// Official-gazette / legal-document look — serif type, paper background,
// a rotated red "regulated" stamp. Fits an audience that reads this as
// a compliance memo, not a meme.
const { fontFamily } = loadFont("normal", { weights: ["400", "700"], subsets: ["latin"] });

const SWITCH_MS = 950;
const INK = "#1A1712";
const RED = "#B4182A";
const PAPER = "#F2ECDD";

const Page: React.FC<{ page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;
  const absoluteTimeMs = page.startMs + currentTimeMs;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 100 }}>
      <div
        style={{
          fontFamily,
          fontSize: 74,
          lineHeight: 1.3,
          textAlign: "center",
          color: INK,
          whiteSpace: "pre-wrap",
        }}
      >
        {page.tokens.map((token) => {
          const isActive = token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;
          return (
            <span
              key={token.fromMs}
              style={{
                color: isActive ? RED : INK,
                fontWeight: isActive ? 700 : 400,
                textDecoration: isActive ? "underline" : "none",
                textDecorationColor: RED,
                textDecorationThickness: "4px",
                textUnderlineOffset: "10px",
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

const Masthead: React.FC = () => (
  <>
    <div
      style={{
        position: "absolute",
        top: 70,
        left: 90,
        right: 90,
        borderTop: `3px solid ${INK}`,
        borderBottom: `1px solid ${INK}`,
        borderTopWidth: 3,
        paddingTop: 4,
      }}
    />
    <div
      style={{
        position: "absolute",
        top: 90,
        left: 90,
        fontFamily,
        fontSize: 26,
        letterSpacing: 4,
        textTransform: "uppercase",
        color: INK,
      }}
    >
      Official Notice — EU AI Act
    </div>
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 90,
        right: 90,
        borderBottom: `3px solid ${INK}`,
      }}
    />
  </>
);

const Stamp: React.FC = () => (
  <div
    style={{
      position: "absolute",
      bottom: 130,
      right: 100,
      rotate: "-10deg",
      border: `5px solid ${RED}`,
      borderRadius: 12,
      padding: "10px 22px",
      color: RED,
      fontFamily,
      fontWeight: 700,
      fontSize: 30,
      letterSpacing: 2,
      opacity: 0.85,
    }}
  >
    REGULATED
  </div>
);

export const EuAiActRegulatory: React.FC = () => {
  const captions = useCaptions(CAPTIONS_FILE);
  const pages = useCaptionPages(captions, SWITCH_MS);

  if (!captions) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Audio src={staticFile(AUDIO_FILE)} />
      <Masthead />
      <Stamp />
      <CaptionSequence pages={pages} renderPage={(page) => <Page page={page} />} />
    </AbsoluteFill>
  );
};
