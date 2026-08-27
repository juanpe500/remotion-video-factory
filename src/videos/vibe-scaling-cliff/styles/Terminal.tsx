import React from "react";
import {
  AbsoluteFill,
  Img,
  Interactive,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio } from "@remotion/media";
import type { TikTokPage } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/JetBrainsMono";
import { useCaptions } from "../../../lib/useCaptions";
import { useSentencePages } from "../../../lib/useSentencePages";
import { CaptionSequence } from "../../../lib/CaptionSequence";
import { ImageBeats, type ImageBeat } from "../../../lib/ImageBeats";
import type { AudioSyncedProps } from "../../../lib/calculateAudioMetadata";
import { AUDIO_FILE, CAPTIONS_FILE } from "../config";

// Terminal / scaling-cliff aesthetic. The narration walks the scaling cliff
// (10 users fine → 1000 crash) then three production-ready fixes; the bottom
// third shows one tall mockup per beat (load test, indexing, caching, async
// queue), timed off the real caption/step boundaries so it re-syncs to any voice.
const { fontFamily } = loadFont("normal", { weights: ["500", "700"], subsets: ["latin"] });

const MAX_WORDS_PER_PAGE = 7;

const GREEN = "#39FF88";
const CYAN = "#4DE8FF";
const BG = "#04070A";

export const OUTRO_FRAMES = 90;

const USERNAME = "JP";
const HANDLE = "@JP_Valat";
const AVATAR = "brand/jp-avatar.png";

const Scanlines: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(0,255,150,0.05) 0px, rgba(0,255,150,0.05) 1px, transparent 1px, transparent 3px)",
      mixBlendMode: "screen",
      pointerEvents: "none",
    }}
  />
);

const AnimatedBackground: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(120% 75% at 50% 0%, #0A1F16 0%, rgba(10,31,22,0.35) 42%, transparent 72%)",
      opacity: 0.6,
      pointerEvents: "none",
    }}
  />
);

const CameraDrift: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ scale }}>{children}</AbsoluteFill>;
};

const useBlink = (everyFrames: number) => {
  const frame = useCurrentFrame();
  return Math.floor(frame / everyFrames) % 2 === 0;
};

const Header: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Interactive.Div
      name="Terminal header"
      style={{ position: "absolute", top: 140, left: 90, fontFamily, fontSize: 30, color: GREEN, opacity }}
    >
      {"$ scale --check"}
    </Interactive.Div>
  );
};

// Match the three numbered steps whether the narrator says "One," / "Two," /
// "Three," (words) or whisper writes them as "1." / "2." / "3." — different TTS
// voices flip between the two, and the whole steps section keys off this.
const STEP_REGEX = [/\b(one|1)\s*[.,:]/i, /\b(two|2)\s*[.,:]/i, /\b(three|3)\s*[.,:]/i];

const getStepRanges = (pages: TikTokPage[], fps: number, narrationEndFrame: number) => {
  const starts = STEP_REGEX.map((re) => {
    const page = pages.find((p) => re.test(p.text));
    return page ? Math.round((page.startMs / 1000) * fps) : null;
  });

  return starts
    .map((start, index) => {
      if (start === null) return null;
      const nextStart = starts[index + 1];
      const end = nextStart ?? narrationEndFrame;
      return { start, end, index };
    })
    .filter((r): r is { start: number; end: number; index: number } => r !== null);
};

const Page: React.FC<{ page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;
  const absoluteTimeMs = page.startMs + currentTimeMs;
  const cursorOn = useBlink(fps / 2);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", padding: "660px 90px 0" }}>
      <div style={{ fontFamily, fontSize: 58, lineHeight: 1.3, color: GREEN, whiteSpace: "pre-wrap" }}>
        {"> "}
        {page.tokens.map((token) => {
          if (absoluteTimeMs >= token.toMs) {
            return (
              <span key={token.fromMs} style={{ color: GREEN }}>
                {token.text}
              </span>
            );
          }
          if (absoluteTimeMs >= token.fromMs) {
            const charsRevealed = interpolate(absoluteTimeMs, [token.fromMs, token.toMs], [0, token.text.length], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <span key={token.fromMs} style={{ color: CYAN, textShadow: `0 0 24px ${CYAN}` }}>
                {token.text.slice(0, Math.floor(charsRevealed))}
              </span>
            );
          }
          return null;
        })}
        <span style={{ opacity: cursorOn ? 1 : 0, color: CYAN }}>▌</span>
      </div>
    </AbsoluteFill>
  );
};

const TICK_VOLUME = 0.18;
const DING_VOLUME = 0.5;
const SFX_DURATION_FRAMES = 18;

const SfxLayer: React.FC<{ pages: TikTokPage[] }> = ({ pages }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {pages.map((page) => {
        const startFrame = Math.round((page.startMs / 1000) * fps);
        const isStep = STEP_REGEX.some((re) => re.test(page.text));
        return (
          <Sequence key={page.startMs} from={startFrame} durationInFrames={SFX_DURATION_FRAMES} layout="none">
            <Audio
              src={isStep ? "https://remotion.media/ding.wav" : "https://remotion.media/switch.wav"}
              volume={isStep ? DING_VOLUME : TICK_VOLUME}
            />
          </Sequence>
        );
      })}
    </>
  );
};

const ProgressBar: React.FC<{ endFrame: number }> = ({ endFrame }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, endFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end" }}>
      <div style={{ height: 6, backgroundColor: "rgba(57,255,136,0.15)" }}>
        <div
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            backgroundColor: CYAN,
            boxShadow: `0 0 12px ${CYAN}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const Watermark: React.FC = () => (
  <Interactive.Div
    name="Watermark"
    style={{
      position: "absolute",
      bottom: 20,
      right: 24,
      display: "flex",
      alignItems: "center",
      gap: 9,
      fontFamily,
      fontSize: 22,
      color: GREEN,
      opacity: 0.45,
    }}
  >
    <Img
      src={staticFile(AVATAR)}
      style={{ width: 30, height: 30, borderRadius: "50%", border: `1px solid ${GREEN}`, background: "#fff" }}
    />
    {HANDLE}
  </Interactive.Div>
);

const OutroCard: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cursorOn = useBlink(15);
  return (
    <AbsoluteFill style={{ backgroundColor: BG, justifyContent: "center", alignItems: "center", opacity }}>
      <Audio src="https://remotion.media/whoosh.wav" volume={0.5} />
      <Sequence from={14} layout="none">
        <Audio src={staticFile("brand/voice/great-success.mp3")} />
      </Sequence>
      <Img
        src={staticFile(AVATAR)}
        style={{
          width: 200,
          height: 200,
          borderRadius: "50%",
          border: `3px solid ${GREEN}`,
          background: "#fff",
          boxShadow: `0 0 14px ${GREEN}66`,
          marginBottom: 26,
        }}
      />
      <Interactive.Div name="Outro username" style={{ fontFamily, fontSize: 66, fontWeight: 700, color: "#f2fff8" }}>
        {USERNAME}
      </Interactive.Div>
      <Interactive.Div
        name="Outro handle"
        style={{ fontFamily, fontSize: 30, color: CYAN, opacity: 0.8, marginTop: 4, marginBottom: 34, letterSpacing: 2 }}
      >
        {HANDLE}
      </Interactive.Div>
      <Interactive.Div
        name="Outro headline"
        style={{ fontFamily, fontSize: 52, fontWeight: 700, color: GREEN, textAlign: "center" }}
      >
        {"> FOLLOW FOR THE NEXT ONE"}
        <span style={{ opacity: cursorOn ? 1 : 0, color: CYAN }}>▌</span>
      </Interactive.Div>
    </AbsoluteFill>
  );
};

// Bottom-third cards. Only the visual metadata lives here — on-screen timing is
// derived from the real caption/step boundaries in the component (not hardcoded
// ms), so it re-syncs to any voice/script length.
type ImageBeatMeta = Omit<ImageBeat, "atMs" | "toMs">;
const HOOK_BEAT: ImageBeatMeta = {
  id: "hook",
  file: "vibe-scaling-cliff/images/hook.jpg",
  label: "THE SCALING CLIFF",
  width: 1000,
  bottom: 120,
};
const STEP_BEATS: ImageBeatMeta[] = [
  {
    id: "step1",
    file: "vibe-scaling-cliff/images/step1.jpg",
    label: "STEP 1: PROPER INDEXING",
    width: 1000,
    bottom: 120,
  },
  {
    id: "step2",
    file: "vibe-scaling-cliff/images/step2.jpg",
    label: "STEP 2: CACHING STRATEGY",
    width: 1000,
    bottom: 120,
  },
  {
    id: "step3",
    file: "vibe-scaling-cliff/images/step3.jpg",
    label: "STEP 3: ASYNC PROCESSING",
    width: 1000,
    bottom: 120,
  },
];

export const Terminal: React.FC<AudioSyncedProps> = ({ narrationEndFrame }) => {
  const captions = useCaptions(CAPTIONS_FILE);
  const pages = useSentencePages(captions, MAX_WORDS_PER_PAGE);
  const { fps, durationInFrames } = useVideoConfig();
  const endFrame = narrationEndFrame ?? durationInFrames - OUTRO_FRAMES;
  const stepRanges = pages.length > 0 ? getStepRanges(pages, fps, endFrame) : [];

  const msPerFrame = 1000 / fps;
  const stepStartMs = stepRanges.map((r) => r.start * msPerFrame);
  const narrationEndMs = endFrame * msPerFrame;

  const imageBeats: ImageBeat[] =
    stepStartMs.length === 3
      ? [
          { ...HOOK_BEAT, atMs: 1500, toMs: stepStartMs[0] },
          { ...STEP_BEATS[0], atMs: stepStartMs[0], toMs: stepStartMs[1] },
          { ...STEP_BEATS[1], atMs: stepStartMs[1], toMs: stepStartMs[2] },
          { ...STEP_BEATS[2], atMs: stepStartMs[2], toMs: narrationEndMs },
        ]
      : [{ ...HOOK_BEAT, atMs: 1500, toMs: narrationEndMs }];

  if (!captions) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Audio src={staticFile(AUDIO_FILE)} />
      <CameraDrift>
        <AnimatedBackground />
        <Scanlines />
        <Header />
        <CaptionSequence pages={pages} renderPage={(page) => <Page page={page} />} />
        <ImageBeats beats={imageBeats} accentColor={GREEN} fontFamily={fontFamily} />
      </CameraDrift>
      <SfxLayer pages={pages} />
      <ProgressBar endFrame={endFrame} />
      <Watermark />
      <Sequence from={endFrame} durationInFrames={durationInFrames - endFrame} layout="none">
        <OutroCard />
      </Sequence>
    </AbsoluteFill>
  );
};