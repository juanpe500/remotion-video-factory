import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Small icons that pop in ON THE WORD as the narration enumerates things —
 * "writes copy" → a document, "images" → an image, "any content" → audio+video.
 * They build up into a centered row above the caption, then fade out together.
 *
 * Timing is resolved from the caption word timings by the caller (voice-
 * agnostic), same as ImageBeats — pass each cue an `atMs`.
 *
 * Icons are inlined Lucide paths (lucide.dev, ISC license) so no runtime dep is
 * needed; add more to LUCIDE below by pasting the icon's inner SVG.
 */
export type IconCue = { atMs: number; icons: string[] };

const LUCIDE: Record<string, React.ReactNode> = {
  // file-text
  file: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </>
  ),
  // image
  image: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </>
  ),
  // audio-lines / music
  audio: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  // video / film
  video: (
    <>
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </>
  ),
};

const Icon: React.FC<{ name: string; color: string; appearFrame: number; fadeOut: number }> = ({
  name,
  color,
  appearFrame,
  fadeOut,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - appearFrame, fps, config: { damping: 12, stiffness: 180 }, durationInFrames: 18 });
  const appear = interpolate(frame, [appearFrame, appearFrame + 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(appear, fadeOut);
  if (frame < appearFrame) return null;

  return (
    <div
      style={{
        width: 108,
        height: 108,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 22,
        border: `2px solid ${color}`,
        background: "rgba(4,7,10,0.55)",
        boxShadow: `0 0 30px ${color}44`,
        opacity,
        scale: String(0.6 + pop * 0.4),
      }}
    >
      <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {LUCIDE[name] ?? null}
      </svg>
    </div>
  );
};

export const WordIcons: React.FC<{
  cues: IconCue[];
  toMs: number;
  color: string;
  top: number;
}> = ({ cues, toMs, color, top }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const toFrame = Math.round((toMs / 1000) * fps);
  const fadeOut = interpolate(frame, [toFrame - 10, toFrame], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (cues.length === 0 || frame >= toFrame) return null;

  // Flatten cues → individual icons, each carrying its own appear frame.
  const items = cues.flatMap((c) => c.icons.map((name) => ({ name, appearFrame: Math.round((c.atMs / 1000) * fps) })));

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
      <div style={{ position: "absolute", top, display: "flex", gap: 22 }}>
        {items.map((it, i) => (
          <Icon key={i} name={it.name} color={color} appearFrame={it.appearFrame} fadeOut={fadeOut} />
        ))}
      </div>
    </AbsoluteFill>
  );
};
