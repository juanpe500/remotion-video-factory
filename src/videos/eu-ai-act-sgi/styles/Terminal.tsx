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
import { Circle, CrossedOff } from "@remotion/rough-notation";
import type { TikTokPage } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/JetBrainsMono";
import { useCaptions } from "../../../lib/useCaptions";
import { useSentencePages } from "../../../lib/useSentencePages";
import { CaptionSequence } from "../../../lib/CaptionSequence";
import { MdGraphDiagram, type DiagramStep } from "../../../lib/MdGraphDiagram";
import { ImageBeats, type ImageBeat } from "../../../lib/ImageBeats";
import { WordIcons, type IconCue } from "../../../lib/WordIcons";
import type { AudioSyncedProps } from "../../../lib/calculateAudioMetadata";
import { AUDIO_FILE, CAPTIONS_FILE, COMPLIANCE_DIAGRAM_FILE } from "../config";

// Terminal / compliance-log aesthetic — fits a video that's literally about
// "direct your AI to build this." Monospace, scanlines, live typing, subtle
// keystroke SFX, script-driven step icons, a progress bar, and an outro CTA.
const { fontFamily } = loadFont("normal", { weights: ["500", "700"], subsets: ["latin"] });

// A sentence fits on one page as-is up to this many words; longer sentences
// split into the smallest number of even chunks that stays under it.
const MAX_WORDS_PER_PAGE = 7;

const GREEN = "#39FF88";
const CYAN = "#4DE8FF";
const BG = "#04070A";

// How long the outro CTA gets after narration ends. Exported so Root.tsx's
// calculateMetadata reserves exactly this much extra runtime.
export const OUTRO_FRAMES = 90;

// Channel identity — used by the corner Watermark and the OutroCard.
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

// Subtle background texture — a soft diagonal wash in the terminal palette so
// the text isn't sitting on flat black. This was a WebGL2 liquidContours shader
// (@remotion/effects); it's removed because the cloud render container has no GPU
// and software WebGL2 (swangle) is slow/unstable. A CSS gradient gives the same
// "not flat" feel with zero GPU cost. Keep this composition WebGL2-free.
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

// Slow, continuous zoom-in over the whole video — gives otherwise-static
// text a bit of camera life. Pinned UI (progress bar, watermark) lives
// outside this wrapper so it doesn't drift with it.
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
      {"$ ai-act --check --verbose"}
    </Interactive.Div>
  );
};

// Match the three numbered steps whether the narrator says "One," / "Two," /
// "Three," (transcribed as words) or whisper writes them as "1." / "2." / "3."
// — different TTS voices flip between the two, and the whole steps section keys
// off this.
// Whisper may split the comma into its own token ("one ,"), so allow optional
// whitespace between the word and the punctuation.
const STEP_REGEX = [/\b(one|1)\s*[.,:]/i, /\b(two|2)\s*[.,:]/i, /\b(three|3)\s*[.,:]/i];

// The steps section builds a "compliance function" in a code editor panel that
// types itself out line-by-line, one call per real step. We invent the function
// names (no bodies) — it's pseudo-code that says exactly what the narration says.
const SYN = {
  kw: "#FF7CE5", // keywords: def / return / True
  fn: "#FFCF5C", // the function name in the signature
  call: "#39FF88", // called function names
  arg: "#4DE8FF", // argument names
  str: "#FFB86B", // string literals
  cmt: "#5f7d6f", // comments / line numbers
  pun: "#9fbcae", // punctuation / plain
};
type Tok = { t: string; c: string };
type CodeLine = { atFrame: number; toks: Tok[] };
const CODE_CPF = 2.4; // characters typed per frame

// One call per step, appended as each step's narration begins. atFrame is filled
// in from the real step start frames in the component.
const SIG: Tok[] = [
  { t: "def ", c: SYN.kw },
  { t: "avoid_big_fat_fine", c: SYN.fn },
  { t: "():", c: SYN.pun },
];
const CALL_LABELS: Tok[] = [
  { t: "    ", c: SYN.pun },
  { t: "add_ai_labels", c: SYN.call },
  { t: "(", c: SYN.pun },
  { t: "watermark", c: SYN.arg },
  { t: "=", c: SYN.pun },
  { t: "True", c: SYN.kw },
  { t: ")", c: SYN.pun },
];
const CALL_CONSENT: Tok[] = [
  { t: "    ", c: SYN.pun },
  { t: "block_until_consent", c: SYN.call },
  { t: "(", c: SYN.pun },
  { t: "explicit", c: SYN.arg },
  { t: "=", c: SYN.pun },
  { t: "True", c: SYN.kw },
  { t: ")", c: SYN.pun },
];
const CALL_LOG: Tok[] = [
  { t: "    ", c: SYN.pun },
  { t: "log_generation", c: SYN.call },
  { t: "(", c: SYN.pun },
  { t: "ts, model, input", c: SYN.arg },
  { t: ")", c: SYN.pun },
];
const RET: Tok[] = [
  { t: "    ", c: SYN.pun },
  { t: "return ", c: SYN.kw },
  { t: '"compliant"', c: SYN.str },
];

const codeLineChars = (l: CodeLine) => l.toks.reduce((n, t) => n + t.t.length, 0);

const CodeLineView: React.FC<{ line: CodeLine; frame: number; num: number }> = ({ line, frame, num }) => {
  const elapsed = frame - line.atFrame;
  if (elapsed < 0) return null;
  const total = codeLineChars(line);
  const revealed = Math.min(total, Math.floor(elapsed * CODE_CPF));
  const typing = revealed < total;
  let remaining = revealed;
  const spans: React.ReactNode[] = [];
  for (let i = 0; i < line.toks.length && remaining > 0; i++) {
    const tok = line.toks[i];
    const take = Math.min(tok.t.length, remaining);
    spans.push(
      <span key={i} style={{ color: tok.c, whiteSpace: "pre" }}>
        {tok.t.slice(0, take)}
      </span>,
    );
    remaining -= take;
  }
  const cursorOn = Math.floor(frame / 15) % 2 === 0;
  return (
    <div style={{ display: "flex", gap: 22, minHeight: 52 }}>
      <span style={{ color: SYN.cmt, opacity: 0.5, width: 20, textAlign: "right" }}>{num}</span>
      <span>
        {spans}
        {typing && <span style={{ color: CYAN, opacity: cursorOn ? 1 : 0 }}>▌</span>}
      </span>
    </div>
  );
};

const CodeBlock: React.FC<{ lines: CodeLine[]; startFrame: number }> = ({ lines, startFrame }) => {
  const frame = useCurrentFrame();
  if (frame < startFrame) return null;
  const opacity = interpolate(frame, [startFrame, startFrame + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 205 }}>
      <div
        style={{
          opacity,
          width: 900,
          background: "linear-gradient(180deg, #081511, #05100c)",
          border: "1px solid #1c3327",
          borderRadius: 16,
          boxShadow: "0 24px 70px rgba(0,0,0,0.5)",
          overflow: "hidden",
          fontFamily,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "14px 20px",
            borderBottom: "1px solid #16261e",
            background: "rgba(57,255,136,0.03)",
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 6, background: "#FF5C5C" }} />
          <span style={{ width: 12, height: 12, borderRadius: 6, background: "#FFCF5C" }} />
          <span style={{ width: 12, height: 12, borderRadius: 6, background: GREEN }} />
          <span style={{ color: SYN.cmt, fontSize: 22, marginLeft: 12 }}>comply.py</span>
        </div>
        <div style={{ padding: "18px 24px", fontSize: 34, lineHeight: 1.35 }}>
          {lines.map((line, i) => (
            <CodeLineView key={i} line={line} frame={frame} num={i + 1} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Finds where each numbered step ("One,", "Two,", "Three,") starts and ends
// (= the next step's start, or narration end for the last one), from the
// already-paginated captions.
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

// Script-driven emphasis (remotion.dev/elements/text) — hand-drawn circle /
// cross-off marks on specific words, once they finish typing. Keyed by the
// word stripped of punctuation/case.
type AnnotationType = "circle" | "crossoff";
// Picked for having runway after them within their own page — an
// annotation needs time to draw before the page hands off to the next one.
const ANNOTATIONS: Record<string, AnnotationType> = {
  liable: "circle",
  boxes: "crossoff",
};
const ANNOTATION_DRAW_MS = 550;
const ANNOTATION_RED = "#FF5C5C";

const cleanWord = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, "");

// One page's caption text, typed out character-by-character in step with
// the word's own [fromMs, toMs] window instead of popping in whole.
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
            const annotation = ANNOTATIONS[cleanWord(token.text)];
            const leadingSpace = token.text.startsWith(" ") ? " " : "";
            const word = <span style={{ color: GREEN }}>{token.text.trimStart()}</span>;

            if (!annotation) {
              return (
                <span key={token.fromMs} style={{ color: GREEN }}>
                  {token.text}
                </span>
              );
            }

            const progress = interpolate(absoluteTimeMs, [token.toMs, token.toMs + ANNOTATION_DRAW_MS], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            return (
              <React.Fragment key={token.fromMs}>
                {leadingSpace}
                {annotation === "circle" ? (
                  <Circle
                    progress={progress}
                    seed={3}
                    roughness={1.8}
                    strokeWidth={6}
                    color={CYAN}
                    padding={{ left: 6, right: 6, top: 4, bottom: 4 }}
                    box="inside"
                  >
                    {word}
                  </Circle>
                ) : (
                  <CrossedOff progress={progress} seed={3} roughness={2} strokeWidth={5} iterations={8} color={ANNOTATION_RED}>
                    {word}
                  </CrossedOff>
                )}
              </React.Fragment>
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

// A soft keystroke tick on every page's first word, and a distinct "ding" on
// the three numbered-step pages (One / Two / Three) so they land as beats.
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
      {/* Cached Borat interjection dropped straight in — no Fish call. */}
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
          // Small blur radius on purpose: a big CSS blur is very expensive under
          // software rendering (swangle) — a 50px glow made these outro frames
          // ~15x slower than the rest of the video. 14px still reads as a glow.
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

// Compliance flowchart (public/eu-ai-act-sgi/diagrams/compliance-flow.svg,
// built by scripts/generate-diagram.ts from content/.../compliance-flow.mdgraph)
// reveals node by node in step with the specific narration moment each one
// illustrates, then fades out right as the numbered steps take over at 0:25.
// Node reveal times are authored against the ORIGINAL hook (steps began at
// ~25.4s). They're scaled at render time to whatever the current narration
// actually runs (see the component), so swapping the TTS voice — which changes
// the whole duration — can't desync the diagram.
const DIAGRAM_TIMELINE: DiagramStep[] = [
  { kind: "node", id: "A", atMs: 1690 }, // "your AI product..."
  { kind: "edge", from: "A", to: "B", atMs: 15720 }, // "...distributing"
  { kind: "node", id: "B", atMs: 16600 },
  { kind: "edge", from: "B", to: "D", atMs: 19510 }, // "Don't disclose that"
  { kind: "node", id: "D", atMs: 20410 }, // "liable"
  { kind: "edge", from: "B", to: "C", atMs: 21200 },
  { kind: "node", id: "C", atMs: 21700 },
];
const DIAGRAM_VISIBLE_FROM_MS = 1200;
// The hook length the node times above were authored against — denominator for
// scaling to the real narration.
const AUTHORED_STEP1_START_MS = 25420;

// Bottom-third source/example cards. Only the visual metadata lives here — the
// on-screen timing is derived from the real caption/step boundaries in the
// component (not hardcoded ms), so it re-syncs to any voice/script length.
type ImageBeatMeta = Omit<ImageBeat, "atMs" | "toMs">;
const HOOK_BEAT: ImageBeatMeta = {
  id: "hook",
  file: "eu-ai-act-sgi/images/hook-eu-ai-act.jpg",
  label: "SOURCE: EU AI Act, Article 50",
  // Layout: top half = command + code block + caption; the image owns the
  // bottom half — big and readable, near full width.
  width: 1000,
  bottom: 120,
};
const STEP_BEATS: ImageBeatMeta[] = [
  {
    id: "step1",
    file: "eu-ai-act-sgi/images/step1-label-example.jpg",
    label: "EXAMPLE: AI-generated content label",
    width: 1000,
    bottom: 120,
  },
  {
    id: "step2",
    file: "eu-ai-act-sgi/images/step2-consent-example.jpg",
    label: "EXAMPLE: explicit consent gate",
    width: 1000,
    bottom: 120,
  },
  {
    id: "step3",
    file: "eu-ai-act-sgi/images/step3-log-example.jpg",
    label: "EXAMPLE: generation audit log",
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

  // Build the accumulating compliance-function code, one call appended per step.
  const codeLines: CodeLine[] =
    stepRanges.length === 3
      ? [
          { atFrame: stepRanges[0].start, toks: SIG },
          { atFrame: stepRanges[0].start + 20, toks: CALL_LABELS },
          { atFrame: stepRanges[1].start, toks: CALL_CONSENT },
          { atFrame: stepRanges[2].start, toks: CALL_LOG },
          { atFrame: stepRanges[2].start + 45, toks: RET },
        ]
      : [];

  // Derive image-beat and diagram timing from the REAL section boundaries so a
  // voice/script change (which shifts every timestamp) can't desync them.
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

  const diagramRatio = stepStartMs.length === 3 ? stepStartMs[0] / AUTHORED_STEP1_START_MS : 1;
  const diagramTimeline = DIAGRAM_TIMELINE.map((s): DiagramStep => ({ ...s, atMs: s.atMs * diagramRatio }));
  const diagramToMs = stepStartMs.length === 3 ? stepStartMs[0] - 400 : narrationEndMs;

  // Icons that pop in on the enumerated words ("copy" → doc, "images" → image,
  // "content" → audio+video). Resolved from caption timings so they stay synced.
  const findWordMs = (re: RegExp) => captions?.find((c) => re.test(c.text))?.startMs ?? null;
  const iconCueDefs: { re: RegExp; icons: string[] }[] = [
    { re: /copy/i, icons: ["file"] },
    { re: /\bimages/i, icons: ["image"] },
    { re: /content/i, icons: ["audio", "video"] },
  ];
  const iconCues: IconCue[] = iconCueDefs
    .map((d) => ({ atMs: findWordMs(d.re), icons: d.icons }))
    .filter((c): c is IconCue => c.atMs !== null);
  const iconToMs = iconCues.length ? iconCues[iconCues.length - 1].atMs + 2000 : 0;

  if (!captions) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Audio src={staticFile(AUDIO_FILE)} />
      <CameraDrift>
        <AnimatedBackground />
        <Scanlines />
        <Header />
        <MdGraphDiagram
          svgFile={COMPLIANCE_DIAGRAM_FILE}
          timeline={diagramTimeline}
          visibleFromMs={DIAGRAM_VISIBLE_FROM_MS}
          visibleToMs={diagramToMs}
          style={{ position: "absolute", top: 260, left: 90, right: 90, height: 340 }}
        />
        {codeLines.length > 0 && <CodeBlock lines={codeLines} startFrame={stepRanges[0].start} />}
        <CaptionSequence pages={pages} renderPage={(page) => <Page page={page} />} />
        <WordIcons cues={iconCues} toMs={iconToMs} color={CYAN} top={420} />
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
